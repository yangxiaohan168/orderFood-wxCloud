// pages/myorder/myorder.js
const app = getApp()
const db = wx.cloud.database()
Page({
  data: {
    tabs: ['全部', '点餐订单', '充值订单'],
    currentTab: 0,
    orderList: [], // 订单列表
    // 分页相关
    orderPage: 0,
    orderPageSize: 20,
    orderHasMore: true,
    loadingOrders: false
  },

  onLoad() {
    this.loadOrders()
  },

  onShow() {
    this.loadUserInfo()
    this.loadOrders()
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
  // 切换标签
  switchTab(e) {
    const index = e.currentTarget.dataset.index
    this.setData({
      currentTab: index,
      // 重置分页状态
      orderPage: 0,
      orderHasMore: true,
      orderList: []
    })
    this.loadOrders()
  },

  // 加载订单列表
  async loadOrders(append = false) {
    if (this.data.loadingOrders) {
      return
    }

    if (!append) {
      wx.showLoading({ title: '加载中...' })
    }
    
    try {
      this.setData({ loadingOrders: true })

      const openid = app.globalData.openid
      const _ = db.command
      
      let query = {
        _openid: openid,
        pay_status: true // 只展示已支付成功的订单
      }
      
      // 根据标签筛选
      if (this.data.currentTab === 1) {
        // 点餐订单
        query.type = 'order'
      } else if (this.data.currentTab === 2) {
        // 充值订单
        query.type = 'recharge'
      }
      
      const pageSize = this.data.orderPageSize
      const page = append ? this.data.orderPage + 1 : 0
      const skip = page * pageSize
      
      const res = await db.collection('order')
        .where(query)
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(pageSize)
        .get()

      // 格式化时间，避免界面显示 [object Object]
      const formatTime = (time) => {
        if (!time) return ''
        const date = time instanceof Date ? time : new Date(time)
        const pad = (n) => (n < 10 ? '0' + n : n)
        const y = date.getFullYear()
        const m = pad(date.getMonth() + 1)
        const d = pad(date.getDate())
        const hh = pad(date.getHours())
        const mm = pad(date.getMinutes())
        return `${y}-${m}-${d} ${hh}:${mm}`
      }

      const list = (res.data || []).map(order => ({
        ...order,
        createTimeText: order.createTime ? formatTime(order.createTime) : ''
      }))
      
      const newList = append ? this.data.orderList.concat(list) : list
      const hasMore = list.length === pageSize
      
      this.setData({
        orderList: newList,
        orderPage: page,
        orderHasMore: hasMore
      })
    } catch (err) {
      console.error('加载订单失败', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ loadingOrders: false })
    }
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.orderHasMore && !this.data.loadingOrders) {
      this.loadOrders(true)
    }
  },

  // 获取订单状态文本
  getOrderStatusText(order) {
    // 简化状态展示：只区分已完成 / 已取消，其它统称处理中
    if (order.type === 'recharge') {
      return '已完成'
    }
    if (order.status === 2) {
      return '已完成'
    }
    if (order.status === 3) {
      return '已取消'
    }
    return '处理中'
  },

  // 查看订单详情
  viewOrderDetail(e) {
    const order = e.currentTarget.dataset.order
    
    if (order.type === 'recharge') {
      // 充值订单详情
      wx.showModal({
        title: '充值订单详情',
        content: `充值金额：¥${order.amount}\n赠送金额：¥${order.giveAmount}\n到账金额：¥${order.totalGet}\n状态：已完成`,
        showCancel: false
      })
    } else {
      // 点餐订单详情
      let goodsInfo = ''
      order.goods.forEach(item => {
        goodsInfo += `${item.goodsName} x${item.count} ¥${item.price}\n`
      })
      
      let content = `订单商品：\n${goodsInfo}\n原价：¥${order.totalPrice}`
      if (order.useMiandan) {
        content += '\n使用免单：-¥' + order.totalPrice
      }
      content += `\n实付：¥${order.finalPrice}\n状态：${this.getOrderStatusText(order)}`
      
      wx.showModal({
        title: '订单详情',
        content: content,
        showCancel: false
      })
    }
  },

  // 取消订单
  cancelOrder(e) {
    const order = e.currentTarget.dataset.order
    
    if (order.type === 'recharge') {
      wx.showToast({ title: '充值订单无法取消', icon: 'none' })
      return
    }
    
    if (order.status !== 0) {
      wx.showToast({ title: '该订单无法取消', icon: 'none' })
      return
    }
    
    wx.showModal({
      title: '确认取消',
      content: '确定要取消这个订单吗？余额将原路退回',
      success: async (res) => {
        if (res.confirm) {
          await this.doCancelOrder(order)
        }
      }
    })
  },

  // 执行取消订单
  async doCancelOrder(order) {
    wx.showLoading({ title: '处理中...' })
    
    try {
      const openid = app.globalData.openid
      
      // 更新订单状态
      await db.collection('order').doc(order._id).update({
        data: {
          status: 3 // 已取消
        }
      })
      
      // 如果使用了免单，退回免单次数
      if (order.useMiandan) {
        const miandanRes = await db.collection('freeBuy').where({
          _openid: openid
        }).get()
        
        if (miandanRes.data && miandanRes.data.length > 0) {
          const _ = db.command
          await db.collection('freeBuy').doc(miandanRes.data[0]._id).update({
            data: {
              count: _.inc(1)
            }
          })
        }
      }
      
      // 退回余额
      if (order.finalPrice > 0) {
        const userRes = await db.collection('user').where({
          _openid: openid
        }).get()
        
        if (userRes.data && userRes.data.length > 0) {
          const user = userRes.data[0]
          const newBalance = (user.balance || 0) + order.finalPrice
          
          await db.collection('user').doc(user._id).update({
            data: {
              balance: newBalance
            }
          })
        }
      }
      
      wx.hideLoading()
      wx.showToast({ title: '订单已取消', icon: 'success' })
      
      // 刷新订单列表
      setTimeout(() => {
        this.loadOrders()
      }, 1500)
      
    } catch (err) {
      console.error('取消订单失败', err)
      wx.hideLoading()
      wx.showToast({ title: '取消失败', icon: 'none' })
    }
  }
})
