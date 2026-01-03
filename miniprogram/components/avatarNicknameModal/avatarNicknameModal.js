// components/avatarNicknameModal/avatarNicknameModal.js
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    showAvaModal: {
      type: Boolean,
      value: false,
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    avatarUrl: null,
    nickName: null,
    phoneNumber: null,
    phoneCode: null,
    realPhoneNumber: null, // 真实的手机号（用于提交）
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 阻止页面滑动
     */
    catchtouchmove() { },

    /**
     * 选择头像返回信息监听
     */
    chooseavatar(res) {
      const avatarUrl = res.detail.avatarUrl
      this.setData({
        avatarUrl: avatarUrl
      })
    },

    /** 获取昵称信息 */
    bindblur(res) {
      const value = res.detail.value
      this.data.nickName = value
    },

    /** 获取手机号 */
    async getphonenumber(e) {
      console.log('手机号授权结果：', e.detail)
      if (e.detail.code) {
        // 获取成功，调用云函数解密
        try {
          wx.showLoading({ title: '获取中...' })
          
          const phoneRes = await wx.cloud.callFunction({
            name: 'getPhoneNumber',
            data: { code: e.detail.code }
          })
          
          wx.hideLoading()
          
          if (phoneRes.result && phoneRes.result.success && phoneRes.result.phoneNumber) {
            const phoneNumber = phoneRes.result.phoneNumber
            // 格式化显示手机号（中间4位用*代替，保护隐私）
           // const displayPhone = phoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
            
            this.setData({
              phoneNumber: phoneNumber,
              phoneCode: e.detail.code,
              realPhoneNumber: phoneNumber // 保存真实手机号用于提交
            })
            
            wx.showToast({
              title: '获取成功',
              icon: 'success',
              duration: 1500
            })
          } else {
            const errorMsg = phoneRes.result?.message || '获取手机号失败，请重试'
            throw new Error(errorMsg)
          }
        } catch (err) {
          wx.hideLoading()
          console.error('解密手机号失败', err)
          wx.showToast({
            title: err.message || '获取手机号失败',
            icon: 'none'
          })
        }
      } else {
        wx.showToast({
          title: '获取手机号失败',
          icon: 'none'
        })
      }
    },

    /**
     * 保存用户信息
     */
    async saveUserInfo() {
      const {
        avatarUrl,
        nickName,
        phoneNumber,
        realPhoneNumber
      } = this.data

      // 检查必填项
      if (!avatarUrl) {
        wx.showToast({
          title: '请选择头像',
          icon: 'none'
        })
        return
      }
      
      if (!nickName || !nickName.trim()) {
        wx.showToast({
          title: '请输入昵称',
          icon: 'none'
        })
        return
      }

      if (!realPhoneNumber && !phoneNumber) {
        wx.showToast({
          title: '请授权手机号',
          icon: 'none'
        })
        return
      }

      const phone = realPhoneNumber || phoneNumber

      try {
        wx.showLoading({ title: '保存中...' })
        
        const app = getApp()
        const db = wx.cloud.database()
        const openid = app.globalData.openid

        // 上传头像到云存储
        const cloudPath = `avatar/${openid}_${Date.now()}.png`
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: avatarUrl
        })

        // 更新或创建用户信息
        const userRes = await db.collection('user').where({
          _openid: openid
        }).get()

        const updateData = {
          avatarUrl: uploadRes.fileID,
          nickName: nickName.trim(),
          phoneNumber: phone,
          updateTime: new Date()
        }

        if (userRes.data && userRes.data.length > 0) {
          // 更新
          await db.collection('user').doc(userRes.data[0]._id).update({
            data: updateData
          })
        } else {
          // 创建
          await db.collection('user').add({
            data: {
              ...updateData,
              balance: 0,
              createTime: new Date()
            }
          })
        }

        wx.hideLoading()
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        })

        // 通知父组件更新
        this.triggerEvent("saved", {
          avatarUrl: uploadRes.fileID,
          nickName: nickName.trim(),
          phoneNumber: phone
        })

        // 关闭弹窗
        this.closeModalTap()
      } catch (err) {
        wx.hideLoading()
        console.error('保存用户信息失败', err)
        wx.showToast({
          title: '保存失败，请重试',
          icon: 'none'
        })
      }
    },

    /**
     * 设置信息按钮点击监听（保留用于兼容）
     */
    setBtnTap() {
      this.saveUserInfo()
    },

    /**
     * 关闭弹窗
     */
    closeModalTap() {
      this.setData({
        showAvaModal: false,
        nickName: null,
        avatarUrl: null,
        phoneNumber: null,
        phoneCode: null,
        realPhoneNumber: null
      })
    },
  }
})