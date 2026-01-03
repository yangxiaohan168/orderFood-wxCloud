// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: '填写你的环境ID'
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  console.log('打印回调数据:', event)
  
  try {
    // 解析 body（如果是字符串则解析为 JSON）
    let bodyData = event
    if (event.body) {
      try {
        bodyData = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
      } catch (parseErr) {
        console.error('解析 body 失败', parseErr, event.body)
        // 如果 body 解析失败，尝试直接使用 event
        bodyData = event
      }
    }
    
    const { type, rtime, data } = bodyData
    
    // 类型 0：回调地址连通性校验
    if (type === 0) {
      return {
        code: 0,
        message: 'ok'
      }
    }
    
    // 类型 5：任务结果通知
    if (type === 5) {
      // 解析 data（JSON 字符串）
      let dataObj
      try {
        dataObj = typeof data === 'string' ? JSON.parse(data) : data
      } catch (parseErr) {
        console.error('解析回调 data 失败', parseErr, data)
        return {
          code: -1,
          message: '数据解析失败'
        }
      }
      
      const { sn, printId, status, outTradeNo } = dataObj
      
      // status: 2成功、3失败、4已取消（只会回调最终状态）
      // 将 status 转换为数字类型
      const printStatus = parseInt(status)
      
      // 只处理最终状态：2成功、3失败、4取消
      if (printStatus === 2 || printStatus === 3 || printStatus === 4) {
        if (outTradeNo) {
          try {
            // 更新订单的打印状态
            await db.collection('order').doc(outTradeNo).update({
              data: {
                printStatus: printStatus,  // 打印状态：2成功、3失败、4取消
                printTime: db.serverDate(),  // 打印时间
                printId: printId,  // 打印任务ID
                sn: sn,  // 打印机SN
                rtime: rtime  // 打印回调时间
              }
            })
            console.log('订单打印状态更新成功', {
              orderId: outTradeNo,
              printId: printId,
              printStatus: printStatus,
              statusText: printStatus === 2 ? '成功' : printStatus === 3 ? '失败' : '已取消'
            })
          } catch (updateErr) {
            console.error('更新订单打印状态失败', updateErr, {
              orderId: outTradeNo,
              printId: printId,
              printStatus: printStatus
            })
            // 即使更新失败，也返回成功，避免重复回调
          }
        } else {
          console.log('回调数据中无 outTradeNo，跳过订单更新', dataObj)
        }
      } else {
        console.log('打印任务状态异常，状态:', status, '订单:', outTradeNo)
      }
      
      return {
        code: 0,
        message: 'ok'
      }
    }
    
    // 未知类型
    console.log('未知的回调类型:', type)
    return {
      code: 0,
      message: 'ok'
    }
    
  } catch (err) {
    console.error('处理打印回调异常', err)
    // 即使异常也返回成功，避免重复回调
    return {
      code: 0,
      message: 'ok'
    }
  }
}
