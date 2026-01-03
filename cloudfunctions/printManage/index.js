// 云函数入口文件
const cloud = require('wx-server-sdk')
const TcbRouter = require('tcb-router')
const axios = require('axios')
const crypto = require('crypto')

cloud.init({
  env: '填写你的环境ID'
})

const db = cloud.database()
const baseUrl = 'https://iot-device.trenditiot.com'
//访问https://open.trenditiot.com 注册登录，得到appid和appsecret
const appid = '填写你的appid' // 填写你的appid
const appsecret = '填写你的appsecret' // 填写你的appsecret

// 生成随机字符串
function getNonceStr() {
  return Math.random().toString(36).substr(2, 15) + Date.now().toString(36)
}

// 生成签名
function getSign(uid, stime, appid, body) {
  const requestBody = JSON.stringify(body)
  const strToSign = `${uid}${appid}${stime}${appsecret}${requestBody}`
  const md5sum = crypto.createHash('md5')
  md5sum.update(strToSign)
  const signature = md5sum.digest('hex')
  return signature
}

// HTTP请求封装
async function request(options) {
  try {
    const response = await axios({
      url: options.url,
      method: options.method || 'GET',
      data: options.data,
      params: options.params,
      headers: options.headers || {},
      timeout: options.timeout || 30000
    })
    return response.data
  } catch (error) {
    if (error.response) {
      // 服务器返回了错误状态码
      throw {
        code: error.response.status,
        message: error.response.data?.message || error.message,
        data: error.response.data
      }
    } else if (error.request) {
      // 请求已发送但没有收到响应
      throw {
        code: -1,
        message: '网络请求失败，请检查网络连接'
      }
    } else {
      // 请求配置出错
      throw {
        code: -1,
        message: error.message || '请求失败'
      }
    }
  }
}

// 云函数入口函数
exports.main = async (event, context) => {
  const app = new TcbRouter({ event })

  // 全局中间件
  app.use(async (ctx, next) => {
    // ctx.data = {}
    ctx.event = event
    await next()
  })

  // 绑定打印机
  app.router('addPrinter', async (ctx, next) => {
    const { sn, key, name } = ctx.event
    const uid = getNonceStr()
    const time = new Date().getTime()
    const body = [{
      sn: sn,
      key: key,
      name: name || `打印机${sn}`
    }]

    try {
      const result = await request({
        url: baseUrl + '/openapi/addPrinter',
        method: 'POST',
        data: body,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'appid': appid,
          'uid': uid,
          'stime': time,
          'sign': getSign(uid, time, appid, body)
        }
      })
      ctx.body = { success: true, data: result }
    } catch (error) {
      console.error('绑定打印机失败', error)
      ctx.body = {
        success: false,
        error: error.message || '绑定失败',
        code: error.code,
        data: error.data
      }
    }
  })

  // 解绑打印机
  app.router('delPrinter', async (ctx, next) => {
    const { sn } = ctx.event
    const uid = getNonceStr()
    const time = new Date().getTime()
    const body = Array.isArray(sn) ? sn : [sn]

    try {
      const result = await request({
        url: baseUrl + '/openapi/delPrinter',
        method: 'POST',
        data: body,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'appid': appid,
          'uid': uid,
          'stime': time,
          'sign': getSign(uid, time, appid, body)
        }
      })
      ctx.body = { success: true, data: result }
    } catch (error) {
      console.error('解绑打印机失败', error)
      ctx.body = {
        success: false,
        error: error.message || '解绑失败',
        code: error.code,
        data: error.data
      }
    }
  })

  // 设置打印浓度
  app.router('setDensity', async (ctx, next) => {
    const { sn, density } = ctx.event
    const uid = getNonceStr()
    const time = new Date().getTime()
    const body = { sn, density }

    try {
      const result = await request({
        url: baseUrl + '/openapi/setDensity',
        method: 'POST',
        data: body,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'appid': appid,
          'uid': uid,
          'stime': time,
          'sign': getSign(uid, time, appid, body)
        }
      })
      ctx.body = { success: true, data: result }
    } catch (error) {
      console.error('设置打印浓度失败', error)
      ctx.body = {
        success: false,
        error: error.message || '设置失败',
        code: error.code,
        data: error.data
      }
    }
  })

  // 设置打印速度
  app.router('setPrintSpeed', async (ctx, next) => {
    const { sn, printSpeed } = ctx.event
    const uid = getNonceStr()
    const time = new Date().getTime()
    const body = { sn, printSpeed }

    try {
      const result = await request({
        url: baseUrl + '/openapi/setPrintSpeed',
        method: 'POST',
        data: body,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'appid': appid,
          'uid': uid,
          'stime': time,
          'sign': getSign(uid, time, appid, body)
        }
      })
      ctx.body = { success: true, data: result }
    } catch (error) {
      console.error('设置打印速度失败', error)
      ctx.body = {
        success: false,
        error: error.message || '设置失败',
        code: error.code,
        data: error.data
      }
    }
  })

  // 设置音量
  app.router('setVolume', async (ctx, next) => {
    const { sn, volume } = ctx.event
    const uid = getNonceStr()
    const time = new Date().getTime()
    const body = { sn, volume }

    try {
      const result = await request({
        url: baseUrl + '/openapi/setVolume',
        method: 'POST',
        data: body,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'appid': appid,
          'uid': uid,
          'stime': time,
          'sign': getSign(uid, time, appid, body)
        }
      })
      ctx.body = { success: true, data: result }
    } catch (error) {
      console.error('设置音量失败', error)
      ctx.body = {
        success: false,
        error: error.message || '设置失败',
        code: error.code,
        data: error.data
      }
    }
  })

  // 查询打印机状态
  app.router('getDeviceStatus', async (ctx, next) => {
    const { sn } = ctx.event
    const uid = getNonceStr()
    const time = new Date().getTime()
    const body = { sn }

    try {
      const result = await request({
        url: baseUrl + '/openapi/getDeviceStatus',
        method: 'POST',
        data: body,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'appid': appid,
          'uid': uid,
          'stime': time,
          'sign': getSign(uid, time, appid, body)
        }
      })
      ctx.body = { success: true, data: result }
    } catch (error) {
      console.error('查询打印机状态失败', error)
      ctx.body = {
        success: false,
        error: error.message || '查询失败',
        code: error.code,
        data: error.data
      }
    }
  })

  // 打印小票
  app.router('printNote', async (ctx, next) => {
    const { $url, ...printData } = ctx.event
    const uid = getNonceStr()
    const time = new Date().getTime()

    try {
      const result = await request({
        url: baseUrl + '/openapi/print',
        method: 'POST',
        data: printData,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'appid': appid,
          'uid': uid,
          'stime': time,
          'sign': getSign(uid, time, appid, printData)
        }
      })
      ctx.body = { success: true, data: result }
    } catch (error) {
      console.error('打印小票失败', error)
      ctx.body = {
        success: false,
        error: error.message || '打印失败',
        code: error.code,
        data: error.data
      }
    }
  })

  // 清空打印队列
  app.router('cleanWaitingQueue', async (ctx, next) => {
    const { sn } = ctx.event
    const uid = getNonceStr()
    const time = new Date().getTime()
    const body = { sn }

    try {
      const result = await request({
        url: baseUrl + '/openapi/cleanWaitingQueue',
        method: 'POST',
        data: body,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'appid': appid,
          'uid': uid,
          'stime': time,
          'sign': getSign(uid, time, appid, body)
        }
      })
      ctx.body = { success: true, data: result }
    } catch (error) {
      console.error('清空打印队列失败', error)
      ctx.body = {
        success: false,
        error: error.message || '清空失败',
        code: error.code,
        data: error.data
      }
    }
  })

  return app.serve()
}
