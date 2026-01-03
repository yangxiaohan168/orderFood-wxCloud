// pages/recharge/recharge.js
const app = getApp()
const db = wx.cloud.database()
Page({
  data: {
    rechargeList: [], // 充值套餐列表
    userInfo: null, // 用户信息
    showAuthModal: false, // 显示授权弹窗
    // 分页相关
    rechargePage: 0,
    rechargePageSize: 20,
    rechargeHasMore: true,
    loadingRecharge: false
  },

  onLoad() {
    this.loadRechargeList()
    this.loadUserInfo()
  },

  onShow() {
    this.loadUserInfo()
  },

  // 加载用户信息
  async loadUserInfo() {
    try {
      const openid = app.globalData.openid
      const res = await db.collection('user').where({
        _openid: openid
      }).get()
      
      if (res.data && res.data.length > 0) {
        const user = res.data[0]
        // 初始化余额字段
        if (typeof user.balance === 'undefined') {
          await db.collection('user').doc(user._id).update({
            data: {
              balance: 0
            }
          })
          user.balance = 0
        }

        this.setData({
          userInfo: user
        })
      }
    } catch (err) {
      console.error('获取用户信息失败', err)
    }
  },

  // 加载充值套餐列表
  async loadRechargeList(append = false) {
    if (this.data.loadingRecharge) {
      return
    }

    if (!append) {
      wx.showLoading({ title: '加载中...' })
    }

    this.setData({ loadingRecharge: true })

    try {
      const pageSize = this.data.rechargePageSize
      const page = append ? this.data.rechargePage + 1 : 0
      const skip = page * pageSize

      const res = await db.collection('rechargeOptions')
        .where({
          status: 1 // 1表示启用
        })
        .orderBy('amount', 'asc')
        .skip(skip)
        .limit(pageSize)
        .get()
      
      const list = res.data || []
      const newList = append ? this.data.rechargeList.concat(list) : list
      const hasMore = list.length === pageSize

      this.setData({
        rechargeList: newList,
        rechargePage: page,
        rechargeHasMore: hasMore
      })
    } catch (err) {
      console.error('加载充值套餐失败', err)
      if (!append) {
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    } finally {
      if (!append) {
        wx.hideLoading()
      }
      this.setData({ loadingRecharge: false })
    }
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.rechargeHasMore && !this.data.loadingRecharge) {
      this.loadRechargeList(true)
    }
  },


  // 确认充值（直接点击卡片充值）
  confirmRecharge(e) {
    const recharge = e.currentTarget.dataset.recharge
    if (!recharge) {
      wx.showToast({ title: '请选择充值套餐', icon: 'none' })
      return
    }

    // 检查用户信息完整性
    const userInfo = this.data.userInfo
    if (!userInfo || !userInfo.avatarUrl || !userInfo.nickName || !userInfo.phoneNumber) {
      this.setData({
        showAuthModal: true,
        pendingRecharge: recharge // 保存待充值的套餐
      })
      return
    }

    const totalGet = recharge.amount + recharge.giveAmount
   // const hasMiandan = recharge.amount >= 68 // 满68元赠送免单
    
    let content = `充值¥${recharge.amount}，赠送¥${recharge.giveAmount}，共到账¥${totalGet}`
    // if (hasMiandan) {
    //   content += '\n额外赠送1次免单机会'
    // }

    wx.showModal({
      title: '确认充值',
      content: content,
      success: async (res) => {
        if (res.confirm) {
          await this.doRecharge(recharge)
        }
      }
    })
  },

  // 执行充值
  async doRecharge(recharge) {
    wx.showLoading({ title: '拉起支付中...' })

    try {   
      const openid = app.globalData.openid

      const totalGet = recharge.amount + recharge.giveAmount

      // 获取用户信息
      const userRes = await db.collection('user').where({
        _openid: openid
      }).get()

      const userInfo = userRes.data && userRes.data.length > 0 ? userRes.data[0] : null

      // 先创建一条待支付的充值订单记录
      const orderRes = await db.collection('order').add({
        data: {
          type: 'recharge',               // 充值订单
          rechargeId: recharge._id,       // 对应的充值套餐
          amount: recharge.amount,        // 充值金额（元）
          giveAmount: recharge.giveAmount,// 赠送金额（元）
          totalGet: totalGet,             // 实际到账总额（元）
          pay_status: false,              // 支付状态，待支付
          status: 0,                      // 业务状态，0-待支付
          createTime: db.serverDate(),
          // 用户信息
          userNickName: userInfo ? (userInfo.nickName || '') : '',
          userAvatar: userInfo ? (userInfo.avatarUrl || '') : '',
          userPhone: userInfo ? (userInfo.phoneNumber || '') : ''
        }
      })

      const outTradeNo = orderRes._id  // 使用订单 _id 作为支付单号，方便回调关联

      // 生成随机字符串
      const nonceStr = Math.random().toString(36).substr(2, 15) + Date.now().toString(36)

      // 调用云函数统一下单
      const payRes = await wx.cloud.callFunction({
        name: 'pay',
        data: {
          body: `账户充值¥${recharge.amount}`,
          outTradeNo: outTradeNo,
          totalFee: recharge.amount,  // 元，云函数里会转成分
          nonceStr
        }
      })

      const payment = payRes.result && payRes.result.payment ? payRes.result.payment : payRes.result

      wx.hideLoading()

      // 调起微信支付
      await wx.requestPayment(payment)

      wx.showToast({ title: '支付成功，余额更新中...', icon: 'success' })

      // 支付成功后，pay_success 云函数会更新订单状态并增加余额
      // 这里稍等一会儿再刷新用户信息
      setTimeout(() => {
        this.loadUserInfo()
      }, 2000)

    } catch (err) {
      console.error('充值失败或已取消', err)
      wx.hideLoading()
      if (err && err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
        wx.showToast({ title: '已取消支付', icon: 'none' })
      } else {
        wx.showToast({ title: '支付失败，请重试', icon: 'none' })
      }
    }
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: '充值优惠活动',
      path: '/pages/recharge/recharge',
      imageUrl: '' // 可以设置分享图片，留空则使用小程序默认图片
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '充值优惠活动',
      query: '',
      imageUrl: '' // 可以设置分享图片，留空则使用小程序默认图片
    }
  },

  // 处理用户授权（组件已经保存了用户信息，这里只需要刷新并继续充值）
  async handleUserAuth(e) {
    try {
      // 组件已经保存了用户信息，这里只需要重新加载用户信息
      await this.loadUserInfo()
      
      this.setData({
        showAuthModal: false
      })
      
      // 授权成功后，如果有待充值套餐，直接执行充值（不再检查用户信息）
      if (this.data.pendingRecharge) {
        const recharge = this.data.pendingRecharge
        this.setData({ pendingRecharge: null })
        
        // 直接执行充值，不再检查用户信息
        setTimeout(() => {
          const totalGet = recharge.amount + recharge.giveAmount
          // const hasMiandan = recharge.amount >= 68
          
          let content = `充值¥${recharge.amount}，赠送¥${recharge.giveAmount}，共到账¥${totalGet}`
          // if (hasMiandan) {
          //   content += '\n额外赠送1次免单机会'
          // }

          wx.showModal({
            title: '确认充值',
            content: content,
            success: async (res) => {
              if (res.confirm) {
                await this.doRecharge(recharge)
              }
            }
          })
        }, 500)
      }
      
    } catch (err) {
      console.error('处理授权失败', err)
      wx.showToast({
        title: '处理失败，请重试',
        icon: 'none'
      })
    }
  }
})


