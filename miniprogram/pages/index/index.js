// pages/index/index.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    menuList: [], // 菜品分类列表
    currentMenuId: '', // 当前选中的分类ID
    goodsList: [], // 当前分类的菜品列表
    cart: {}, // 购物车 {goodsId: {info: goodsInfo, count: num, tags: {}}}
    cartCount: 0, // 购物车总数量
    cartTotalPrice: 0, // 购物车总价
    cartTotalPriceText: '0.00', // 购物车总价文本（格式化后）
    showCart: false, // 是否显示购物车详情
    userInfo: null, // 用户信息
    noticeList: [], // 公告列表
    noticeText: '', // 公告文本（用于vant组件）
    shopInfo: {}, // 店铺信息
    showTagModal: false, // 显示标签选择弹窗
    currentDish: null, // 当前选择的菜品
    selectedTags: {}, // 当前选择的标签 {tagId: [选项]}
    modalDishCount: 1, // 弹窗中选择的商品数量
    modalTotalPrice: 0, // 弹窗中商品小计
    showAuthModal: false, // 显示授权弹窗
    statusBarHeight: 0, // 状态栏高度
    tableNumber: '', // 桌码号
    // 菜品分页
    goodsPage: 0,
    goodsPageSize: 20,
    goodsHasMore: true,
    goodsLoading: false
  },

  onLoad(options) {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 0
    })
    
    // 检查是否从扫码进入，获取桌码号
    // 小程序码扫码进入时，scene参数会在options.scene中
    if (options.scene) {
      // scene参数是经过URL编码的，需要解码
      try {
        const scene = decodeURIComponent(options.scene)
        if (scene) {
          this.setData({
            tableNumber: scene
          })
          wx.showToast({
            title: `桌码：${scene}`,
            icon: 'success',
            duration: 2000
          })
        }
      } catch (e) {
        console.error('解析scene参数失败', e)
      }
    }
    
    this.loadShopInfo()
    this.loadMenu()
    this.loadUserInfo()
    this.loadNotices()
  },

  onShow() {
    this.loadUserInfo()
  },

  // 加载店铺信息
  async loadShopInfo() {
    try {
      const res = await db.collection('shopInfo').limit(1).get()
      
      if (res.data && res.data.length > 0) {
        this.setData({
          shopInfo: res.data[0]
        })
      }
    } catch (err) {
      console.error('加载店铺信息失败', err)
    }
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
        // 如果没有余额字段，初始化为 0
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

  // 加载公告
  async loadNotices() {
    try {
      const res = await db.collection('notice')
        .where({ status: 1 }) // 只显示启用的公告
        .orderBy('sort', 'asc')
        .limit(10)
        .get()
      
      // 将公告内容拼接成一个字符串，用于vant notice-bar滚动显示
      const noticeText = res.data.map(item => item.content).join('    ')
      
      this.setData({
        noticeList: res.data || [],
        noticeText: noticeText
      })
    } catch (err) {
      console.error('加载公告失败', err)
    }
  },


  // 加载菜品分类
  async loadMenu(showLoading = true) {
    if (showLoading) {
      wx.showLoading({ title: '加载中...' })
    }
    try {
      const res = await wx.cloud.callFunction({
        name: 'getCategory'
      })
      const result = res.result || {}
      const list = result.success ? (result.data || []) : []
      
      if (list.length > 0) {
        const firstId = list[0]._id
        this.setData({
          menuList: list,
          currentMenuId: firstId,
          goodsPage: 0,
          goodsHasMore: true
        })
        this.loadGoods(firstId, false, false) // 不追加，不显示loading
      } else {
        if (showLoading) {
          wx.showToast({ title: '暂无菜品分类', icon: 'none' })
        }
      }
    } catch (err) {
      console.error('加载菜品分类失败', err)
      if (showLoading) {
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    } finally {
      if (showLoading) {
        wx.hideLoading()
      }
    }
  },

  // 加载指定分类的菜品
  async loadGoods(menuId, append = false, showLoading = true) {
    if (!menuId) return
    if (this.data.goodsLoading) return

    if (!append && showLoading) {
      wx.showLoading({ title: '加载中...' })
    }

    this.setData({ goodsLoading: true })

    try {
      const pageSize = this.data.goodsPageSize
      const page = append ? this.data.goodsPage + 1 : 0
      const skip = page * pageSize

      const goodsRes = await db.collection('dish')
        .where({
          categoryId: menuId,
          status: 1 // 1表示上架
        })
        .orderBy('sort', 'asc')
        .skip(skip)
        .limit(pageSize)
        .get()
      
      // 为每个菜品添加购物车数量
      const list = goodsRes.data || []
      const mapped = list.map(goods => {
        goods.cartCount = this.getDishCartCount(goods._id)
        return goods
      })
      
      this.setData({
        goodsList: append ? this.data.goodsList.concat(mapped) : mapped,
        goodsPage: page,
        goodsHasMore: list.length === pageSize
      })
    } catch (err) {
      console.error('加载菜品失败', err)
      if (showLoading) {
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    } finally {
      if (!append && showLoading) {
        wx.hideLoading()
      }
      this.setData({ goodsLoading: false })
    }
  },

  // 切换菜品分类
  switchMenu(e) {
    const menuId = e.currentTarget.dataset.id
    this.setData({
      currentMenuId: menuId,
      goodsPage: 0,
      goodsHasMore: true,
      goodsList: []
    })
    this.loadGoods(menuId)
  },

  // 添加到购物车 - 显示标签选择弹窗
  addToCart(e) {
    const goods = e.currentTarget.dataset.goods
    
    // 初始化标签选择状态，多选标签初始化为数组
    const selectedTags = {}
    if (goods.tags && goods.tags.length > 0) {
      goods.tags.forEach(tag => {
        if (tag.type === 'multiple') {
          selectedTags[tag.id] = []
        }
      })
    }
    
    // 总是显示弹窗，让用户选择数量
    this.setData({
      showTagModal: true,
      currentDish: goods,
      selectedTags: selectedTags,
      modalDishCount: 1,
      modalTotalPrice: (goods.price * 1).toFixed(2)
    })
  },

  // 确认添加到购物车
  confirmAddToCart() {
    const { currentDish, selectedTags, modalDishCount } = this.data
    const cart = this.data.cart
    
    // 验证必选标签
    if (currentDish.tags && currentDish.tags.length > 0) {
      for (let tag of currentDish.tags) {
        if (tag.required) {
          const selectedValue = selectedTags[tag.id]
          if (!selectedValue || 
              (Array.isArray(selectedValue) && selectedValue.length === 0)) {
            wx.showToast({
              title: `请选择${tag.name}`,
              icon: 'none'
            })
            return
          }
        }
      }
    }
    
    // 生成唯一的购物车ID（包含标签信息）
    const cartKey = this.generateCartKey(currentDish._id, selectedTags)
    
    // 转换标签为可显示的数组
    const tagLabels = []
    if (currentDish.tags && currentDish.tags.length > 0) {
      for (let tagId in selectedTags) {
        const tag = currentDish.tags.find(t => t.id === tagId)
        if (tag) {
          const value = selectedTags[tagId]
          if (Array.isArray(value)) {
            tagLabels.push(...value)
          } else {
            tagLabels.push(value)
          }
        }
      }
    }
    
    if (cart[cartKey]) {
      cart[cartKey].count += modalDishCount
    } else {
      cart[cartKey] = {
        info: currentDish,
        count: modalDishCount,
        tags: { ...selectedTags },
        tagLabels: tagLabels, // 用于显示的标签数组
        dishId: currentDish._id // 保存原始菜品ID
      }
    }
    
    this.updateCart(cart)
    this.closeTagModal()
  },

  // 生成购物车Key（包含标签信息）
  generateCartKey(dishId, tags) {
    if (!tags || Object.keys(tags).length === 0) {
      return dishId
    }
    
    const tagStr = Object.keys(tags).sort().map(key => {
      const val = tags[key]
      return `${key}:${Array.isArray(val) ? val.sort().join(',') : val}`
    }).join('|')
    
    return `${dishId}_${tagStr}`
  },

  // 获取菜品在购物车中的数量（包括所有标签组合）
  getDishCartCount(dishId, cart) {
    // 如果传入了 cart 参数，使用传入的 cart，否则使用 this.data.cart
    const cartData = cart !== undefined ? cart : this.data.cart
    let totalCount = 0
    
    // 遍历购物车，找到所有该菜品的数量（包括不同标签组合）
    for (let cartKey in cartData) {
      if (cartData[cartKey] && cartData[cartKey].dishId === dishId) {
        totalCount += cartData[cartKey].count || 0
      }
    }
    
    return totalCount
  },

  // 从菜品列表直接添加到购物车（无标签版本）
  addDishToCartDirect(e) {
    const goods = e.currentTarget.dataset.goods
    
    // 如果菜品没有标签，直接添加（使用菜品ID作为key）
    if (!goods.tags || goods.tags.length === 0) {
      const cart = { ...this.data.cart }
      const cartKey = goods._id
      
      if (cart[cartKey]) {
        // 已存在，增加数量
        cart[cartKey].count++
      } else {
        // 不存在，创建新项
        cart[cartKey] = {
          info: goods,
          count: 1,
          tags: {},
          tagLabels: [],
          dishId: goods._id
        }
      }
      
      this.updateCart(cart)
      wx.showToast({
        title: '已添加',
        icon: 'success',
        duration: 1000
      })
    } else {
      // 有标签，显示弹窗让用户选择
      this.addToCart(e)
    }
  },

  // 从菜品列表减少数量（无标签版本）
  reduceDishFromCart(e) {
    const goods = e.currentTarget.dataset.goods
    const cart = { ...this.data.cart }
    const cartKey = goods._id
    
    if (cart[cartKey]) {
      cart[cartKey].count--
      if (cart[cartKey].count <= 0) {
        delete cart[cartKey]
      }
      this.updateCart(cart)
    } else {
      // 如果直接key不存在，可能是带标签的，需要查找所有该菜品的项
      // 找到第一个并减少（优先减少无标签的）
      for (let key in cart) {
        if (cart[key] && cart[key].dishId === goods._id) {
          cart[key].count--
          if (cart[key].count <= 0) {
            delete cart[key]
          }
          this.updateCart(cart)
          break
        }
      }
    }
  },

  // 从购物车减少
  reduceFromCart(e) {
    const cartKey = e.currentTarget.dataset.id
    const cart = { ...this.data.cart }
    
    if (cart[cartKey]) {
      cart[cartKey].count--
      if (cart[cartKey].count <= 0) {
        delete cart[cartKey]
      }
    }
    
    this.updateCart(cart)
  },

  // 从购物车增加
  addToCartFromCart(e) {
    const cartKey = e.currentTarget.dataset.id
    const cart = { ...this.data.cart }
    
    if (cart[cartKey]) {
      cart[cartKey].count++
    }
    
    this.updateCart(cart)
  },

  // 选择标签选项（单选）
  selectTagOption(e) {
    const { tagId, option } = e.currentTarget.dataset
    const selectedTags = { ...this.data.selectedTags }
    selectedTags[tagId] = option
    
    this.setData({
      selectedTags: selectedTags
    })
  },

  // 切换标签选项（多选）
  toggleTagOption(e) {
    const { tagId, option } = e.currentTarget.dataset
    
    if (!tagId || !option) {
      console.error('标签ID或选项为空', { tagId, option })
      return
    }
    
    console.log('多选标签点击', { tagId, option, currentSelectedTags: this.data.selectedTags })
    
    // 深拷贝，确保不修改原数据
    const selectedTags = JSON.parse(JSON.stringify(this.data.selectedTags || {}))
    
    // 确保 tagId 对应的值是数组
    if (!selectedTags[tagId]) {
      selectedTags[tagId] = []
    } else if (!Array.isArray(selectedTags[tagId])) {
      // 如果是字符串或其他类型，转为数组
      selectedTags[tagId] = [selectedTags[tagId]]
    }
    
    // 创建新数组，避免直接修改
    const tagArray = [...selectedTags[tagId]]
    const index = tagArray.indexOf(option)
    
    if (index > -1) {
      // 已选中，移除
      tagArray.splice(index, 1)
    } else {
      // 未选中，添加
      tagArray.push(option)
    }
    
    selectedTags[tagId] = tagArray
    
    console.log('更新后的标签', selectedTags)
    
    // 强制更新
    this.setData({
      selectedTags: selectedTags
    }, () => {
      console.log('setData完成，当前selectedTags:', this.data.selectedTags)
    })
  },

  // 关闭标签弹窗
  closeTagModal() {
    this.setData({
      showTagModal: false,
      currentDish: null,
      selectedTags: {},
      modalDishCount: 1,
      modalTotalPrice: 0
    })
  },

  // 增加弹窗商品数量
  increaseModalCount() {
    const newCount = this.data.modalDishCount + 1
    const price = this.data.currentDish ? this.data.currentDish.price : 0
    this.setData({
      modalDishCount: newCount,
      modalTotalPrice: (price * newCount).toFixed(2)
    })
  },

  // 减少弹窗商品数量
  decreaseModalCount() {
    if (this.data.modalDishCount > 1) {
      const newCount = this.data.modalDishCount - 1
      const price = this.data.currentDish ? this.data.currentDish.price : 0
      this.setData({
        modalDishCount: newCount,
        modalTotalPrice: (price * newCount).toFixed(2)
      })
    }
  },

  // 阻止冒泡
  stopPropagation() {},

  // 用户信息保存回调（来自 avatarNicknameModal）
  async onUserInfoSaved(e) {
    const { avatarUrl, nickName, phoneNumber } = e.detail || {}

    // 先在本地更新，避免再次点击时仍判断为未完善
    this.setData({
      userInfo: {
        ...(this.data.userInfo || {}),
        avatarUrl,
        nickName,
        phoneNumber
      },
      showAuthModal: false
    })

    // 再从数据库刷新一次，保证余额等字段最新
    try {
      await this.loadUserInfo()
    } catch (err) {
      console.error('刷新用户信息失败', err)
    }

    // 信息完善后重新尝试结算
    this.goToSettle()
  },

  // 处理用户授权
  async handleUserAuth(e) {
    const { avatarUrl, nickName, phoneNumber } = e.detail
    
    if (!phoneNumber) {
      wx.showToast({
        title: '请先获取手机号',
        icon: 'none'
      })
      return
    }
    
    try {
      wx.showLoading({ title: '授权中...' })
          
      const openid = app.globalData.openid
      
      // 上传头像到云存储
      const cloudPath = `avatar/${openid}_${Date.now()}.png`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: avatarUrl
      })
      
      // 更新用户信息
      const userRes = await db.collection('user').where({
        _openid: openid
      }).get()
      
      const updateData = {
        avatarUrl: uploadRes.fileID,
        nickName,
        phoneNumber,
        updateTime: new Date()
      }
      
      if (userRes.data && userRes.data.length > 0) {
        await db.collection('user').doc(userRes.data[0]._id).update({
          data: updateData
        })
      } else {
        await db.collection('user').add({
          data: {
            ...updateData,
            balance: 0,
            createTime: new Date()
          }
        })
      }
      
      // 重新加载用户信息，确保获取完整的数据
      await this.loadUserInfo()
      
      this.setData({
        showAuthModal: false
      })
      
      wx.hideLoading()
      wx.showToast({
        title: '授权成功',
        icon: 'success'
      })
      
      // 授权成功后，再次尝试下单
      setTimeout(() => {
        this.goToSettle()
      }, 500)
      
    } catch (err) {
      wx.hideLoading()
      console.error('授权失败', err)
      wx.showToast({
        title: '授权失败，请重试',
        icon: 'none'
      })
    }
  },

  // 更新购物车
  updateCart(cart) {
    let totalCount = 0
    let totalPrice = 0
    
    for (let cartKey in cart) {
      if (cart[cartKey] && cart[cartKey].info && cart[cartKey].count) {
        totalCount += cart[cartKey].count
        totalPrice += cart[cartKey].info.price * cart[cartKey].count
      }
    }
    
    // 更新菜品列表中的购物车数量（传入新的 cart 参数，确保使用最新的购物车数据）
    const goodsList = this.data.goodsList.map(goods => {
      goods.cartCount = this.getDishCartCount(goods._id, cart)
      return goods
    })
    
    this.setData({
      cart: cart,
      cartCount: totalCount,
      cartTotalPrice: totalPrice,
      cartTotalPriceText: totalPrice.toFixed(2),
      goodsList: goodsList, // 更新菜品列表，包含购物车数量
      showCart: totalCount > 0 ? this.data.showCart : false // 购物车为空时自动关闭
    })
  },

  // 显示/隐藏购物车详情
  toggleCart() {
    if (this.data.cartCount === 0) return
    this.setData({
      showCart: !this.data.showCart
    })
  },

  // 清空购物车
  clearCart() {
    // 更新菜品列表中的购物车数量
    const goodsList = this.data.goodsList.map(goods => {
      goods.cartCount = 0
      return goods
    })
    
    this.setData({
      cart: {},
      cartCount: 0,
      cartTotalPrice: 0,
      cartTotalPriceText: '0.00',
      goodsList: goodsList,
      showCart: false
    })
  },

  // 去结算
  goToSettle() {
    if (this.data.cartCount === 0) {
      wx.showToast({ title: '购物车为空', icon: 'none' })
      return
    }

    // 检查是否有桌码，如果没有则提示用户扫桌码
    if (!this.data.tableNumber) {
      wx.showModal({
        title: '提示',
        content: '请先扫描桌码',
        confirmText: '立即扫码',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.scanTableCode()
          }
        }
      })
      return
    }

    // 有桌码，跳转到结算页面
    this.navigateToSettle()
  },

  // 跳转到结算页面（内部方法，用于有桌码后的跳转）
  navigateToSettle() {
    // 将购物车数据存储到本地，供结算页面使用
    try {
      wx.setStorageSync('settleCartData', {
        cart: this.data.cart,
        totalPrice: this.data.cartTotalPrice,
        tableNumber: this.data.tableNumber || ''
      })
      
      // 跳转到结算页面
      wx.navigateTo({
        url: '/pages/settle/settle'
      })
    } catch (err) {
      console.error('跳转结算页面失败', err)
      wx.showToast({
        title: '跳转失败',
        icon: 'none'
      })
    }
  },

  // 扫码获取桌码
  scanTableCode() {
    wx.showLoading({
      title: '识别中...',
      mask: true
    })
    wx.scanCode({
      onlyFromCamera: false, // 允许从相册选择
      scanType: ['qrCode', 'barCode', 'wxCode'],
      success: (res) => {
        wx.hideLoading()
        console.log(res)
        let tableNumber = ''
        
        // 从 path 的 scene 参数中提取桌码号
        if (res.path) {
          const queryStr = res.path.split('?')[1]
          if (queryStr) {
            const params = queryStr.split('&')
            for (let param of params) {
              const [key, value] = param.split('=')
              if (key === 'scene' && value) {
                tableNumber = decodeURIComponent(value).trim()
                break
              }
            }
          }
        }
        
        if (tableNumber) {
          this.setData({
            tableNumber: tableNumber
          })
          wx.showToast({
            title: `桌码：${tableNumber}`,
            icon: 'success'
          })
          // 扫码成功后，跳转到结算页面
          setTimeout(() => {
            this.navigateToSettle()
          }, 1000)
        } else {
          wx.showToast({
            title: '未能识别桌码',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('扫码失败', err)
        if (err.errMsg && !err.errMsg.includes('cancel')) {
          wx.showToast({
            title: '扫码失败',
            icon: 'none'
          })
        }
      }
    })
  },

  // 创建订单
  async createOrder(options = {}) {
    const { payWithBalance = true } = options
    wx.showLoading({ title: '下单中...' })
    
    try {
      const openid = app.globalData.openid
      
      // 构造订单商品列表
      const orderGoods = []
      for (let cartKey in this.data.cart) {
        const item = this.data.cart[cartKey]
        // 将 tags 对象转换为字符串数组
        let tagsArray = []
        if (item.tagLabels && Array.isArray(item.tagLabels)) {
          // 如果已有 tagLabels，直接使用
          tagsArray = item.tagLabels
        } else if (item.tags && typeof item.tags === 'object') {
          // 将 tags 对象转换为数组
          Object.keys(item.tags).forEach(tagId => {
            const value = item.tags[tagId]
            if (Array.isArray(value)) {
              tagsArray.push(...value)
            } else if (value) {
              tagsArray.push(value)
            }
          })
        }
        
        orderGoods.push({
          dishId: item.dishId || item.info._id,
          dishName: item.info.name,
          dishImage: item.info.image,
          price: item.info.price,
          count: item.count,
          tags: tagsArray, // 改为字符串数组
          canUseMiandan: item.info.canUseMiandan || false // 是否可以参与免单
        })
      }
      
      // 检查是否有免单次数（仅用于前端提示，实际扣减在云函数事务中）
      const miandanRes = await db.collection('freeBuy').where({
        _openid: openid
      }).get()
      
      let useMiandan = false
      let finalPrice = this.data.cartTotalPrice
      
      if (miandanRes.data && miandanRes.data.length > 0 && miandanRes.data[0].count > 0) {
        // 有免单次数，询问是否使用
        const modalRes = await new Promise((resolve) => {
          wx.showModal({
            title: '免单机会',
            content: `您有${miandanRes.data[0].count}次免单机会，是否使用？`,
            success: (res) => resolve(res)
          })
        })
        
        if (modalRes.confirm) {
          useMiandan = true
          finalPrice = 0
        }
      }
      
      // 调用云函数，使用事务处理订单创建、余额扣除、免单次数减少
      const doBuyRes = await wx.cloud.callFunction({
        name: 'doBuy',
        data: {
          orderGoods,
          totalPrice: this.data.cartTotalPrice,
          finalPrice,
          useMiandan,
          payWithBalance,
          tableNumber: this.data.tableNumber || '' // 传递桌码号
        }
      })

      if (!doBuyRes.result || !doBuyRes.result.success) {
        const errorMsg = doBuyRes.result?.error || '下单失败'
        throw new Error(errorMsg)
      }

      const orderId = doBuyRes.result.orderId

      if (payWithBalance) {
        // 余额支付：云函数已处理完成
        wx.hideLoading()
        wx.showToast({ title: '下单成功', icon: 'success' })
      } else {
        // 微信支付：调用统一下单云函数
        wx.hideLoading()
        wx.showLoading({ title: '拉起支付中...' })

        const nonceStr = Math.random().toString(36).substr(2, 15) + Date.now().toString(36)

        const payRes = await wx.cloud.callFunction({
          name: 'pay',
          data: {
            body: `点餐订单支付¥${finalPrice.toFixed(2)}`,
            outTradeNo: orderId,
            totalFee: finalPrice, // 元，云函数里会转为分
            nonceStr
          }
        })

        const payment = payRes.result && payRes.result.payment ? payRes.result.payment : payRes.result

        wx.hideLoading()
        await wx.requestPayment(payment)

        wx.showToast({ title: '支付成功，已下单', icon: 'success' })
      }
      
      // 清空购物车
      this.setData({
        cart: {},
        cartCount: 0,
        cartTotalPrice: 0,
        cartTotalPriceText: '0.00',
        showCart: false
      })
      
      // 刷新用户信息
      this.loadUserInfo()
      
      // 跳转到订单页面
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/myorder/myorder'
        })
      }, 1500)
      
    } catch (err) {
      console.error('创建订单失败', err)
      wx.hideLoading()
      wx.showToast({ 
        title: err.message || '下单失败', 
        icon: 'none' 
      })
    }
  },


  // 页面触底加载更多菜品
  onReachBottom() {
    if (this.data.goodsHasMore && !this.data.goodsLoading && this.data.currentMenuId) {
      this.loadGoods(this.data.currentMenuId, true)
    }
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: this.data.shopInfo.name || '餐饮点餐',
      path: '/pages/index/index',
      imageUrl: '' // 可以设置分享图片，留空则使用小程序默认图片
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: this.data.shopInfo.name || '餐饮点餐',
      query: '',
      imageUrl: '' // 可以设置分享图片，留空则使用小程序默认图片
    }
  },

  // 下拉刷新
  async onPullDownRefresh() {
    try {
      // 重置分页状态
      this.setData({
        goodsPage: 0,
        goodsHasMore: true,
        goodsLoading: false
      })

      // 并行刷新所有数据（不显示 loading，使用系统下拉刷新动画）
      await Promise.all([
        this.loadShopInfo(),
        this.loadMenu(false), // 不显示 loading
        this.loadUserInfo(),
        this.loadNotices()
      ])
    } catch (err) {
      console.error('刷新失败', err)
    } finally {
      // 停止下拉刷新动画
      wx.stopPullDownRefresh()
    }
  }
})


