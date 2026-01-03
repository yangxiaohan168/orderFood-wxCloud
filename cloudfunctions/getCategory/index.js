// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: '填写你的环境ID' })

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    // 获取菜品分类
    const menuRes = await db.collection('dishCategory')
      .orderBy('sort', 'asc')
      .limit(100)
      .get()
    
    return {
      success: true,
      data: menuRes.data
    }
  } catch (err) {
    console.error('获取菜品分类失败', err)
    return {
      success: false,
      message: '获取菜品分类失败'
    }
  }
}
