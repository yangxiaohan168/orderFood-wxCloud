// pages/myhome/myhome.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    userInfo: null, // 用户信息
    miandanCount: 0, // 免单次数
    showAuthModal: false, // 显示授权弹窗
    // 管理员相关
    clickCount: 0, // 连续点击次数
    clickTimer: null, // 点击计时器
    showPasswordModal: false, // 显示密码输入框
    adminPassword: '', // 管理员密码
    isFirstTime: false, // 是否首次登录
    version: '' // 版本号
  },

  onLoad() {
    this.loadUserInfo()
    this.loadMiandanCount()
    this.getVersion()
  },

  onShow() {
    this.loadUserInfo()
    this.loadMiandanCount()
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
        
        // 同时更新全局数据，确保其他页面也能获取最新信息
        app.globalData.userInfo = user
      }
    } catch (err) {
      console.error('获取用户信息失败', err)
    }
  },

  // 加载免单次数
  async loadMiandanCount() {
    try {
      const openid = app.globalData.openid
      const res = await db.collection('freeBuy').where({
        _openid: openid
      }).get()
      
      if (res.data && res.data.length > 0) {
        this.setData({
          miandanCount: res.data[0].count || 0
        })
      }
    } catch (err) {
      console.error('获取免单次数失败', err)
    }
  },

  // 显示授权弹窗
  showAuthModal() {
    this.setData({
      showAuthModal: true
    })
  },

  // 用户信息保存成功回调
  onUserInfoSaved(e) {
    // 刷新用户信息
    this.loadUserInfo()
  },

  // 跳转到充值页面
  goToRecharge() {
    if (!this.data.userInfo || !this.data.userInfo.phoneNumber) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }

    wx.switchTab({
      url: '/pages/recharge/recharge'
    })
  },

  // 跳转到订单页面
  goToOrder(e) {
    const status = e.currentTarget.dataset.status
    wx.switchTab({
      url: '/pages/myorder/myorder'
    })
  },

  // 联系客服
  // 联系客服
  contactService() {
    // 使用button的open-type="contact"功能
    // 这里可以添加额外的逻辑，比如统计点击次数等
  },

  // 管理员入口触发
  onAdminTrigger() {
    this.data.clickCount++
    
    // 清除之前的计时器
    if (this.data.clickTimer) {
      clearTimeout(this.data.clickTimer)
    }

    // 如果达到5次点击，弹出密码输入框
    if (this.data.clickCount >= 5) {
      this.data.clickCount = 0
      this.checkAdminFirstTime()
    } else {
      // 1秒内未继续点击则重置计数
      this.data.clickTimer = setTimeout(() => {
        this.data.clickCount = 0
      }, 1000)
    }
  },

  // 检查是否首次设置管理员
  async checkAdminFirstTime() {
    try {
      wx.showLoading({ title: '检查中...' })
      const res = await db.collection('admin').get()
      
      wx.hideLoading()
      this.setData({
        showPasswordModal: true,
        isFirstTime: res.data.length === 0,
        adminPassword: ''
      })
    } catch (err) {
      wx.hideLoading()
      console.error('检查管理员失败', err)
      this.setData({
        showPasswordModal: true,
        isFirstTime: true,
        adminPassword: ''
      })
    }
  },

  // 关闭密码弹窗
  closePasswordModal() {
    this.setData({
      showPasswordModal: false,
      adminPassword: ''
    })
  },

  // 空函数，用于拦截遮罩点击，防止穿透到下层
  noop() {},

  // 阻止冒泡
  stopPropagation() {},

  // 密码输入
  onPasswordInput(e) {
    this.setData({
      adminPassword: e.detail.value
    })
  },

  // 验证密码或设置密码
  async verifyPassword() {
    const password = this.data.adminPassword.trim()
    
    if (!password) {
      wx.showToast({
        title: '请输入密码',
        icon: 'none'
      })
      return
    }

    if (password.length < 6) {
      wx.showToast({
        title: '密码长度不能少于6位',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: this.data.isFirstTime ? '设置中...' : '验证中...' })
      
      // 查询管理员记录（只取第一条）
      const res = await db.collection('admin').limit(1).get()
      
      if (this.data.isFirstTime) {
        // 首次设置密码
        if (res.data && res.data.length > 0) {
          // 如果已存在记录，提示管理员已存在，需要登录
          wx.hideLoading()
          wx.showToast({
            title: '管理员已存在，请登录',
            icon: 'none'
          })
          // 切换为登录模式
          this.setData({
            isFirstTime: false,
            adminPassword: ''
          })
          return
        } else {
          // 如果不存在记录，则添加新记录
          await db.collection('admin').add({
            data: {
              password: password,
              createTime: new Date(),
              updateTime: new Date()
            }
          })
          
          wx.hideLoading()
          wx.showToast({
            title: '密码设置成功',
            icon: 'success'
          })
          
          // 跳转到管理员页面
          wx.navigateTo({
            url: '/pages/admin/admin'
          })
          
          this.closePasswordModal()
        }
      } else {
        // 验证密码
        wx.hideLoading()
        
        if (res.data.length === 0) {
          wx.showToast({
            title: '管理员未设置',
            icon: 'none'
          })
          return
        }
        
        const admin = res.data[0]
        if (admin.password === password) {
          // 验证成功，跳转到管理员页面
          wx.navigateTo({
            url: '/pages/admin/admin'
          })
          
          this.closePasswordModal()
        } else {
          wx.showToast({
            title: '密码错误',
            icon: 'none'
          })
        }
      }
    } catch (err) {
      wx.hideLoading()
      console.error('操作失败', err)
      wx.showToast({
        title: '操作失败，请重试',
        icon: 'none'
      })
    }
  },

  // 获取版本号
  getVersion() {
    const accountInfo = wx.getAccountInfoSync()
    const version = accountInfo.miniProgram.version || '1.0.0'
    this.setData({
      version: version
    })
  }
})
