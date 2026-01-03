// pages/admin/user/user.js
const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    users: [],
    searchKeyword: '',
    showBalanceModal: false,
    showMiandanModal: false,
    currentUser: null,
    editBalance: 0,
    editMiandanCount: 0,
    isMember: false,
    // 分页相关
    userPage: 0,
    userPageSize: 20,
    userHasMore: true,
    loadingUsers: false
  },

  onLoad() {
    this.loadUsers()
  },

  onShow() {
    this.loadUsers()
  },

  // 加载用户列表
  async loadUsers(append = false) {
    if (this.data.loadingUsers) {
      return
    }

    if (!append) {
      wx.showLoading({ title: '加载中...' })
    }

    this.setData({ loadingUsers: true })

    try {
      const keyword = this.data.searchKeyword.trim()
      const pageSize = this.data.userPageSize
      const page = append ? this.data.userPage + 1 : 0
      
      // 调用云函数获取用户列表（使用聚合查询）
      const res = await wx.cloud.callFunction({
        name: 'getUserList',
        data: {
          keyword: keyword,
          page: page,
          pageSize: pageSize
        }
      })
      
      if (res.result && res.result.success) {
        const { list, hasMore } = res.result.data
        
        const newUsers = append ? this.data.users.concat(list) : list

        this.setData({
          users: newUsers,
          userPage: page,
          userHasMore: hasMore
        })
      } else {
        throw new Error(res.result?.error || '获取用户列表失败')
      }
    } catch (err) {
      console.error('加载用户失败', err)
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
      this.setData({ loadingUsers: false })
    }
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.userHasMore && !this.data.loadingUsers) {
      this.loadUsers(true)
    }
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
  },

  // 执行搜索
  doSearch() {
    this.loadUsers()
  },

  // 清空搜索
  clearSearch() {
    this.setData({
      searchKeyword: '',
      // 重置分页状态
      userPage: 0,
      userHasMore: true,
      users: []
    }, () => {
      this.loadUsers()
    })
  },

  // 显示编辑余额弹窗
  showEditBalanceModal(e) {
    const user = e.currentTarget.dataset.user
    this.setData({
      showBalanceModal: true,
      currentUser: user,
      editBalance: user.balance || 0
    })
  },

  // 关闭余额弹窗
  closeBalanceModal() {
    this.setData({
      showBalanceModal: false,
      currentUser: null
    })
  },

  // 显示编辑免单次数弹窗
  async showEditMiandanModal(e) {
    const user = e.currentTarget.dataset.user
    
    // 获取用户的免单次数
    let miandanCount = 0
    try {
      const freeBuyRes = await db.collection('freeBuy').where({
        _openid: user._openid
      }).get()
      
      if (freeBuyRes.data && freeBuyRes.data.length > 0) {
        miandanCount = freeBuyRes.data[0].count || 0
      }
    } catch (err) {
      console.error('获取免单次数失败', err)
    }
    
    this.setData({
      showMiandanModal: true,
      currentUser: user,
      editMiandanCount: miandanCount
    })
  },

  // 关闭免单弹窗
  closeMiandanModal() {
    this.setData({
      showMiandanModal: false,
      currentUser: null
    })
  },

  // 阻止冒泡
  stopPropagation() {},

  // 输入余额
  onBalanceInput(e) {
    this.setData({
      editBalance: parseFloat(e.detail.value) || 0
    })
  },

  // 输入免单次数
  onMiandanCountInput(e) {
    this.setData({
      editMiandanCount: parseInt(e.detail.value) || 0
    })
  },

  // 保存余额
  async saveBalance() {
    const { currentUser, editBalance } = this.data

    if (editBalance < 0) {
      wx.showToast({
        title: '余额不能为负数',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })

      await db.collection('user').doc(currentUser._id).update({
        data: {
          balance: editBalance
        }
      })

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      this.closeBalanceModal()
      this.loadUsers()
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }
  },

  // 保存免单次数
  async saveMiandan() {
    const { currentUser, editMiandanCount } = this.data

    if (editMiandanCount < 0) {
      wx.showToast({
        title: '免单次数不能为负数',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })

      // 查询是否已有免单记录
      const freeBuyRes = await db.collection('freeBuy').where({
        _openid: currentUser._openid
      }).get()

      if (freeBuyRes.data && freeBuyRes.data.length > 0) {
        // 更新现有记录
        await db.collection('freeBuy').doc(freeBuyRes.data[0]._id).update({
          data: {
            count: editMiandanCount
          }
        })
      } else {
        // 创建新记录
        await db.collection('freeBuy').add({
          data: {
            _openid: currentUser._openid,
            count: editMiandanCount
          }
        })
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      this.closeMiandanModal()
      this.loadUsers()
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

