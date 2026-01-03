// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { code } = event

  try {
    // 获取手机号
    const result = await cloud.openapi.phonenumber.getPhoneNumber({
      code: code
    })

    if (result && result.phoneInfo) {
      return {
        success: true,
        phoneNumber: result.phoneInfo.phoneNumber
      }
    } else {
      return {
        success: false,
        message: '获取手机号失败'
      }
    }
  } catch (err) {
    console.error('获取手机号失败', err)
    return {
      success: false,
      message: err.message || '获取手机号失败'
    }
  }
}

