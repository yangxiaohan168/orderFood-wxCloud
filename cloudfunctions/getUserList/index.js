// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: '填写你的环境ID'
})

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

// 云函数入口函数
exports.main = async (event, context) => {
  const {
    keyword = '',      // 搜索关键词（昵称或手机号）
    page = 0,          // 页码（从0开始）
    pageSize = 20      // 每页数量
  } = event

  try {
    const skip = page * pageSize
    
    // 构建查询条件
    let matchCondition = {
      phoneNumber: _.exists(true).and(_.neq(''))
    }
    
    // 如果有搜索关键词，添加搜索条件
    if (keyword) {
      matchCondition = _.and([
        matchCondition,
        _.or([
          {
            nickName: db.RegExp({
              regexp: keyword,
              options: 'i'
            })
          },
          {
            phoneNumber: db.RegExp({
              regexp: keyword,
              options: 'i'
            })
          }
        ])
      ])
    }
    
    // 使用聚合查询：关联 freeBuy 集合获取免单次数
    const aggregateRes = await db.collection('user')
      .aggregate()
      .match(matchCondition)
      .lookup({
        from: 'freeBuy',
        localField: '_openid',
        foreignField: '_openid',
        as: 'freeBuyInfo'
      })
      .sort({
        createTime: -1 // 按创建时间倒序
      })
      .skip(skip)
      .limit(pageSize)
      .end()
    
    // 处理聚合结果，提取免单次数并移除 freeBuyInfo 字段
    const list = (aggregateRes.list || []).map(user => {
      let miandanCount = 0
      if (user.freeBuyInfo && Array.isArray(user.freeBuyInfo) && user.freeBuyInfo.length > 0) {
        miandanCount = user.freeBuyInfo[0].count || 0
      }
      // 移除 freeBuyInfo 字段
      const { freeBuyInfo, ...userData } = user
      return {
        ...userData,
        miandanCount: miandanCount
      }
    })
    
    // 检查是否还有更多数据
    const hasMore = list.length === pageSize
    
    return {
      success: true,
      data: {
        list: list,
        hasMore: hasMore,
        page: page,
        total: list.length
      }
    }
  } catch (err) {
    console.error('获取用户列表失败', err)
    return {
      success: false,
      error: err.message || '获取用户列表失败'
    }
  }
}

