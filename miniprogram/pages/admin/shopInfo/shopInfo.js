// pages/admin/shopInfo/shopInfo.js
const db = wx.cloud.database()

Page({
  data: {
    shopInfo: {
      _id: '',
      name: '',
      description: ''
    }
  },

  onLoad() {
    this.loadShopInfo()
  },

  // 加载店铺信息
  async loadShopInfo() {
    try {
      wx.showLoading({ title: '加载中...' })
      
      const res = await db.collection('shopInfo').limit(1).get()

      wx.hideLoading()
      
      if (res.data && res.data.length > 0) {
        this.setData({
          shopInfo: res.data[0]
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('加载店铺信息失败', err)
    }
  },

  // 输入店名
  onNameInput(e) {
    let value = e.detail.value
    // 限制最多8个字
    if (value.length > 8) {
      value = value.substring(0, 8)
      wx.showToast({
        title: '店名最多8个字',
        icon: 'none'
      })
    }
    this.setData({
      'shopInfo.name': value
    })
  },

  // 输入描述
  onDescriptionInput(e) {
    this.setData({
      'shopInfo.description': e.detail.value
    })
  },

  // 保存店铺信息
  async saveShopInfo() {
    const { shopInfo } = this.data

    if (!shopInfo.name.trim()) {
      wx.showToast({
        title: '请输入店铺名称',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })

      if (shopInfo._id) {
        // 更新
        const { _id, _openid,...updateData } = shopInfo
        await db.collection('shopInfo').doc(_id).update({
          data: updateData
        })
      } else {
        // 添加
        const addRes = await db.collection('shopInfo').add({
          data: {
            name: shopInfo.name,
            description: shopInfo.description || '',
            createTime: new Date()
          }
        })
        
        this.setData({
          'shopInfo._id': addRes._id
        })
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }
  }
})

