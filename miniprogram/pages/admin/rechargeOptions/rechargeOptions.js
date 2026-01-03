// pages/admin/rechargeOptions/rechargeOptions.js
const db = wx.cloud.database()

Page({
  data: {
    options: [],
    showModal: false,
    editMode: false,
    currentOption: {
      _id: '',
      amount: '',
      giveAmount: '',
      isRecommend: false,
      status: 1, // 1: 启用, 0: 禁用
      description: ''
    },
    // 分页相关
    optionsPage: 0,
    optionsPageSize: 20,
    optionsHasMore: true,
    loadingOptions: false
  },

  onLoad() {
    this.loadOptions()
  },

  onShow() {
    this.loadOptions()
  },

  // 加载充值选项列表
  async loadOptions(append = false) {
    if (this.data.loadingOptions) {
      return
    }

    if (!append) {
      wx.showLoading({ title: '加载中...' })
    }

    this.setData({ loadingOptions: true })

    try {
      const pageSize = this.data.optionsPageSize
      const page = append ? this.data.optionsPage + 1 : 0
      const skip = page * pageSize

      const res = await db.collection('rechargeOptions')
        .orderBy('amount', 'asc')
        .skip(skip)
        .limit(pageSize)
        .get()

      const list = res.data || []
      const newOptions = append ? this.data.options.concat(list) : list
      const hasMore = list.length === pageSize

      this.setData({
        options: newOptions,
        optionsPage: page,
        optionsHasMore: hasMore
      })
    } catch (err) {
      console.error('加载充值选项失败', err)
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
      this.setData({ loadingOptions: false })
    }
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.optionsHasMore && !this.data.loadingOptions) {
      this.loadOptions(true)
    }
  },

  // 显示添加弹窗
  showAddModal() {
    this.setData({
      showModal: true,
      editMode: false,
      currentOption: {
        _id: '',
        amount: '',
        giveAmount: '',
        isRecommend: false,
        status: 1,
        description: ''
      }
    })
  },

  // 显示编辑弹窗
  showEditModal(e) {
    const option = e.currentTarget.dataset.option
    this.setData({
      showModal: true,
      editMode: true,
      currentOption: { ...option }
    })
  },

  // 关闭弹窗
  closeModal() {
    this.setData({
      showModal: false
    })
  },

  // 阻止冒泡
  stopPropagation() {},

  // 输入充值金额
  onAmountInput(e) {
    this.setData({
      'currentOption.amount': parseFloat(e.detail.value) || 0
    })
  },

  // 输入赠送金额
  onGiveAmountInput(e) {
    this.setData({
      'currentOption.giveAmount': parseFloat(e.detail.value) || 0
    })
  },

  // 输入描述
  onDescriptionInput(e) {
    this.setData({
      'currentOption.description': e.detail.value
    })
  },

  // 切换推荐状态
  toggleRecommend(e) {
    this.setData({
      'currentOption.isRecommend': e.detail.value
    })
  },

  // 切换启用状态
  toggleStatus(e) {
    this.setData({
      'currentOption.status': e.detail.value ? 1 : 0
    })
  },

  // 保存充值选项
  async saveOption() {
    const { editMode, currentOption } = this.data

    if (currentOption.amount <= 0) {
      wx.showToast({
        title: '请输入正确的充值金额',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })
        // 编辑（去掉 _id 和 _openid 等系统字段）
        const { _id, _openid, ...updateData } = currentOption
      if (editMode) {

        await db.collection('rechargeOptions').doc(_id).update({
          data: updateData
        })
      } else {
        // 添加
        await db.collection('rechargeOptions').add({
          data: {
            ...updateData,
            createTime: new Date()
          }
        })
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      this.closeModal()
      // 重置分页状态
      this.setData({
        optionsPage: 0,
        optionsHasMore: true,
        options: []
      })
      this.loadOptions()
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }
  },

  // 删除充值选项
  deleteOption(e) {
    const option = e.currentTarget.dataset.option

    wx.showModal({
      title: '确认删除',
      content: `确定要删除充值选项"${option.amount}元"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })

            await db.collection('rechargeOptions').doc(option._id).remove()

            wx.hideLoading()
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })

            // 重置分页状态
            this.setData({
              optionsPage: 0,
              optionsHasMore: true,
              options: []
            })
            this.loadOptions()
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

