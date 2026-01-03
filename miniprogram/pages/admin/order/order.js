// pages/admin/order/order.js
const db = wx.cloud.database()

Page({
  data: {
    orders: [],
    orderType: 0, // 0: 全部, 1: 充值订单, 2: 点餐订单
    typeOptions: [
      { text: '全部订单', value: 0 },
      { text: '充值订单', value: 1 },
      { text: '点餐订单', value: 2 }
    ],
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
    this.startAutoRefresh()
  },

  onHide() {
    this.clearAutoRefresh()
  },

  onUnload() {
    this.clearAutoRefresh()
  },

  // 加载订单列表
  async loadOrders(append = false) {
    if (this.data.loadingOrders) {
      return
    }

    if (!append) {
      wx.showLoading({ title: '加载中...' })
    }

    this.setData({ loadingOrders: true })

    try {
      let where = {
        pay_status: true // 只获取已支付成功的订单
      }
      
      // 按类型筛选
      if (this.data.orderType === 1) {
        where.type = 'recharge'
      } else if (this.data.orderType === 2) {
        where.type = 'order'
      }
      
      const pageSize = this.data.orderPageSize
      const page = append ? this.data.orderPage + 1 : 0
      const skip = page * pageSize
      
      const res = await db.collection('order')
        .where(where)
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

      // 处理订单数据，格式化时间并处理标签显示
      const list = (res.data || []).map(order => {
        const orderData = {
          ...order,
          createTimeText: order.createTime ? formatTime(order.createTime) : ''
        }

        // tags 现在直接是字符串数组，不需要额外处理

        return orderData
      })

      const newOrders = append ? this.data.orders.concat(list) : list
      const hasMore = list.length === pageSize

      this.setData({
        orders: newOrders,
        orderPage: page,
        orderHasMore: hasMore
      })
    } catch (err) {
      console.error('加载订单失败', err)
      if (!append) {
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        })
      }
    } finally {
      if (!append) {
        wx.hideLoading()
      }
      this.setData({ loadingOrders: false })
    }
  },

  // 订单类型切换（tabs）
  onChange(e) {
    const index = e.detail.index
    this.setData({
      orderType: index,
      // 重置分页状态
      orderPage: 0,
      orderHasMore: true,
      orders: []
    }, () => {
      this.loadOrders()
    })
  },

  // 手动刷新
  refreshOrders() {
    this.loadOrders()
    wx.showToast({
      title: '已刷新',
      icon: 'none'
    })
  },

  // 启动自动刷新
  startAutoRefresh() {
    this.clearAutoRefresh()
    // 立即加载一次
    this.loadOrders()
    // 每 10 秒刷新一次
    this.refreshTimer = setInterval(() => {
      this.loadOrders()
    }, 10000)
  },

  // 清除自动刷新
  clearAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.orderHasMore && !this.data.loadingOrders) {
      this.loadOrders(true)
    }
  },


  // 阻止冒泡
  stopPropagation() {},
  
  // 删除订单
  deleteOrder(e) {
    const order = e.currentTarget.dataset.order

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个订单吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })

            await db.collection('order').doc(order._id).remove()

            wx.hideLoading()
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })

            this.loadOrders()
          } catch (err) {
            wx.hideLoading()
            console.error('删除失败', err)
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            })
          }
        }
      }
    })
  }
})

