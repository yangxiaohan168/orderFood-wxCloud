// pages/admin/admin.js
const db = wx.cloud.database()

Page({
  data: {
    showPasswordModal: false,
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  },

  onLoad(options) {
    // 如果需要修改密码
    if (options.changePassword === 'true') {
      setTimeout(() => {
        this.showChangePassword()
      }, 500)
    }
  },

  // 菜品管理
  goToDish() {
    wx.navigateTo({
      url: '/pages/admin/dish/dish'
    })
  },

  // 用户管理
  goToUser() {
    wx.navigateTo({
      url: '/pages/admin/user/user'
    })
  },

  // 订单管理
  goToOrder() {
    wx.navigateTo({
      url: '/pages/admin/order/order'
    })
  },

  // 充值选项管理
  goToRechargeOptions() {
    wx.navigateTo({
      url: '/pages/admin/rechargeOptions/rechargeOptions'
    })
  },

  // 公告管理
  goToNotice() {
    wx.navigateTo({
      url: '/pages/admin/notice/notice'
    })
  },

  // 桌码管理
  goToTableCode() {
    wx.navigateTo({
      url: '/pages/admin/tableCode/tableCode'
    })
  },

  // 打印机管理
  goToPrinter() {
    wx.navigateTo({
      url: '/pages/admin/printer/printer'
    })
  },

  // 店铺设置
  goToShopInfo() {
    wx.navigateTo({
      url: '/pages/admin/shopInfo/shopInfo'
    })
  },

  // 显示修改密码弹窗
  showChangePassword() {
    this.setData({
      showPasswordModal: true,
      oldPassword: '',
      newPassword: '',
      confirmPassword: ''
    })
  },

  // 关闭密码弹窗
  closePasswordModal() {
    this.setData({
      showPasswordModal: false
    })
  },

  // 阻止冒泡
  stopPropagation() {},

  // 输入旧密码
  onOldPasswordInput(e) {
    this.setData({
      oldPassword: e.detail.value
    })
  },

  // 输入新密码
  onNewPasswordInput(e) {
    this.setData({
      newPassword: e.detail.value
    })
  },

  // 输入确认密码
  onConfirmPasswordInput(e) {
    this.setData({
      confirmPassword: e.detail.value
    })
  },

  // 确认修改密码
  async confirmChangePassword() {
    const { oldPassword, newPassword, confirmPassword } = this.data

    if (!oldPassword) {
      wx.showToast({
        title: '请输入原密码',
        icon: 'none'
      })
      return
    }

    if (!newPassword) {
      wx.showToast({
        title: '请输入新密码',
        icon: 'none'
      })
      return
    }

    if (newPassword.length < 6) {
      wx.showToast({
        title: '新密码长度不能少于6位',
        icon: 'none'
      })
      return
    }

    if (newPassword !== confirmPassword) {
      wx.showToast({
        title: '两次密码输入不一致',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '修改中...' })
      
      // 查询管理员信息
      const res = await db.collection('admin').get()
      
      if (res.data.length === 0) {
        wx.hideLoading()
        wx.showToast({
          title: '管理员不存在',
          icon: 'none'
        })
        return
      }

      const admin = res.data[0]
      
      // 验证旧密码
      if (admin.password !== oldPassword) {
        wx.hideLoading()
        wx.showToast({
          title: '原密码错误',
          icon: 'none'
        })
        return
      }

      // 更新密码
      await db.collection('admin').doc(admin._id).update({
        data: {
          password: newPassword,
          updateTime: new Date()
        }
      })

      wx.hideLoading()
      wx.showToast({
        title: '密码修改成功',
        icon: 'success'
      })
      
      this.closePasswordModal()
    } catch (err) {
      wx.hideLoading()
      console.error('修改密码失败', err)
      wx.showToast({
        title: '修改失败，请重试',
        icon: 'none'
      })
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack()
  }
})

