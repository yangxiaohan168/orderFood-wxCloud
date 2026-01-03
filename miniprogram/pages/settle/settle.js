// pages/settle/settle.js
const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    orderGoods: [], // 订单商品列表
    totalPrice: 0, // 商品总价
    finalPrice: 0, // 实付金额
    orderType: 'dineIn', // 订单类型：dineIn-堂食，takeOut-打包
    tableNumber: '', // 桌码号
    payMethod: 'balance', // 支付方式：miandan-免单，balance-余额，wechat-微信
    userInfo: null, // 用户信息
    userBalance: 0, // 用户余额
    useMiandan: false, // 是否使用免单
    miandanCount: 0, // 免单次数
    submitting: false, // 是否正在提交
    canSubmit: false, // 是否可以提交
    showAuthModal: false, // 显示用户信息授权弹窗
    savedPayMethod: null // 保存用户选择的支付方式（用于完善信息后恢复）
  },

  onLoad(options) {
    // 从全局状态或存储中获取购物车数据
    this.loadCartData()
    this.loadUserInfo()
    this.checkMiandan()
  },

  onShow() {
    this.loadUserInfo()
    this.checkMiandan()
    this.updateCanSubmit()
  },

  // 加载购物车数据（从存储或全局状态）
  loadCartData() {
    try {
      // 尝试从存储中获取购物车数据
      const cartData = wx.getStorageSync('settleCartData')
      if (cartData) {
        
        // 构造订单商品列表
        const goodsList = []
        for (let cartKey in cartData.cart) {
          const item = cartData.cart[cartKey]
          // 将 tags 对象转换为字符串数组
          let tagsArray = []
          if (item.tagLabels && Array.isArray(item.tagLabels)) {
            tagsArray = item.tagLabels
          } else if (item.tags && typeof item.tags === 'object') {
            Object.keys(item.tags).forEach(tagId => {
              const value = item.tags[tagId]
              if (Array.isArray(value)) {
                tagsArray.push(...value)
              } else if (value) {
                tagsArray.push(value)
              }
            })
          }
          
          // 计算小计金额
          const subtotal = (item.info.price * item.count).toFixed(2)
          
          goodsList.push({
            dishId: item.dishId || item.info._id,
            dishName: item.info.name,
            dishImage: item.info.image,
            price: item.info.price,
            count: item.count,
            tags: tagsArray,
            subtotal: subtotal, // 添加小计金额
            canUseMiandan: item.info.canUseMiandan || false // 是否可以参与免单
          })
        }

        // 如果有传递的桌码，使用传递的桌码
        const tableNumber = cartData.tableNumber || ''
        
        // 根据是否有桌码设置默认订单类型（有桌码默认堂食，无桌码默认打包）
        // 但由于现在都需要桌码，所以默认设置为堂食
        // 确保价格是数字类型
        const totalPrice = Number(cartData.totalPrice) || 0
        this.setData({
          orderGoods: goodsList,
          totalPrice: totalPrice,
          finalPrice: totalPrice,
          tableNumber: tableNumber,
          orderType: 'dineIn' // 默认堂食
        })

        // 清除存储的购物车数据
        wx.removeStorageSync('settleCartData')
        
        // 加载完购物车数据后，更新支付方式（需要等待免单检查完成）
        // 由于 checkMiandan 是异步的，支付方式会在 onShow 中更新
      } else {
        // 如果没有数据，返回上一页
        wx.showToast({
          title: '购物车为空',
          icon: 'none'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      }
    } catch (err) {
      console.error('加载购物车数据失败', err)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  // 加载用户信息（从全局状态）
  async loadUserInfo() {
    try {
      const userInfo = app.globalData.userInfo
      if (userInfo) {
        this.setData({
          userInfo: userInfo,
          userBalance: userInfo.balance || 0
        })
        this.updatePayMethod()
        this.updateCanSubmit()
      }
    } catch (err) {
      console.error('加载用户信息失败', err)
    }
  },

  // 从数据库加载用户信息（获取最新数据）
  async loadUserInfoFromDB() {
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

        // 更新本地数据和全局数据
        this.setData({
          userInfo: user,
          userBalance: user.balance || 0
        })
        
        // 同时更新全局数据，确保其他页面也能获取最新信息
        app.globalData.userInfo = user
        
        // 如果传入了 skipUpdatePayMethod 参数，则不自动更新支付方式
        if (!options || !options.skipUpdatePayMethod) {
          this.updatePayMethod()
        }
        this.updateCanSubmit()
      }
    } catch (err) {
      console.error('从数据库加载用户信息失败', err)
    }
  },

  // 检查免单次数
  async checkMiandan() {
    try {
      const openid = app.globalData.openid
      const res = await db.collection('freeBuy').where({
        _openid: openid
      }).get()

      if (res.data && res.data.length > 0) {
        this.setData({
          miandanCount: res.data[0].count || 0
        })
        // 检查完免单后，更新支付方式
        this.updatePayMethod()
      } else {
        this.setData({
          miandanCount: 0
        })
        // 如果没有免单，也要更新支付方式
        this.updatePayMethod()
      }
    } catch (err) {
      console.error('检查免单次数失败', err)
    }
  },

  // 选择订单类型
  selectOrderType(e) {
    const orderType = e.currentTarget.dataset.value
    this.setData({ orderType })
    this.updateCanSubmit()
  },

  // 扫码获取桌码
  scanTableCode() {
    wx.showLoading({
      title: '识别中...',
      mask: true
    })
    wx.scanCode({
      onlyFromCamera: false,
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
          this.updateCanSubmit()
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

  // 选择支付方式
  selectPayMethod(e) {
    const payMethod = e.currentTarget.dataset.value
    const { userBalance, totalPrice, miandanCount, orderGoods } = this.data
    
    // 如果选择免单支付
    if (payMethod === 'miandan') {
      // 检查免单次数
      if (miandanCount === 0) {
        wx.showToast({
          title: '您还没有免单机会',
          icon: 'none',
          duration: 2000
        })
        return
      }
      
      // 检查订单中是否有可免单菜品
      const miandanDishes = orderGoods.filter(item => item.canUseMiandan === true)
      if (miandanDishes.length === 0) {
        wx.showToast({
          title: '订单中没有可免单的菜品',
          icon: 'none',
          duration: 2000
        })
        return
      }
      
      // 检查是否只有一份可免单菜品，且数量为1
      if (miandanDishes.length > 1) {
        wx.showToast({
          title: '免单只能用于一份免单菜品',
          icon: 'none',
          duration: 2000
        })
        return
      }
      
      const miandanDish = miandanDishes[0]
      if (miandanDish.count > 1) {
        wx.showToast({
          title: '免单菜品数量只能为1份',
          icon: 'none',
          duration: 2000
        })
        return
      }
      
      // 检查订单中是否还有其他菜品（非免单菜品）
      const nonMiandanDishes = orderGoods.filter(item => !item.canUseMiandan || item.dishId !== miandanDish.dishId)
      if (nonMiandanDishes.length > 0) {
        wx.showToast({
          title: '免单订单只能包含一份免单菜品，不能包含其他菜品',
          icon: 'none',
          duration: 2000
        })
        return
      }
    }
    
    // 如果选择余额支付但余额不足，自动切换成微信支付
    if (payMethod === 'balance' && userBalance < totalPrice) {
      wx.showToast({
        title: '余额不足，已切换为微信支付',
        icon: 'none',
        duration: 2000
      })
      this.updateFinalPrice('wechat')
    } else {
      this.updateFinalPrice(payMethod)
    }
  },

  // 更新实付金额（根据选择的支付方式）
  updateFinalPrice(payMethod) {
    const { totalPrice, miandanCount, orderGoods } = this.data
    let useMiandan = false
    // 确保 totalPrice 是数字类型
    const total = Number(totalPrice) || 0
    let finalPrice = total

    // 如果选择免单支付方式且免单次数大于0
    if (payMethod === 'miandan' && miandanCount > 0) {
      // 检查订单中是否有可免单菜品
      const miandanDishes = orderGoods.filter(item => item.canUseMiandan === true)
      if (miandanDishes.length === 1) {
        const miandanDish = miandanDishes[0]
        // 确保只有一份免单菜品，且数量为1
        if (miandanDish.count === 1 && orderGoods.length === 1) {
          useMiandan = true
          finalPrice = 0
        }
      }
    }

    this.setData({
      payMethod: payMethod,
      useMiandan: useMiandan,
      finalPrice: Number(finalPrice) || 0
    })
  },

  // 更新支付方式（根据余额自动选择）
  updatePayMethod() {
    const { userBalance, totalPrice, miandanCount, orderGoods } = this.data
    // 优先检查免单，然后检查余额，如果余额不足则自动切换成微信支付
    if (miandanCount > 0) {
      // 检查订单中是否有可免单菜品，且只有一份免单菜品，数量为1，且订单中只有这一份菜品
      const miandanDishes = orderGoods.filter(item => item.canUseMiandan === true)
      if (miandanDishes.length === 1) {
        const miandanDish = miandanDishes[0]
        if (miandanDish.count === 1 && orderGoods.length === 1) {
          this.updateFinalPrice('miandan')
          return
        }
      }
    }
    
    // 如果不能使用免单，检查余额
    if (userBalance >= totalPrice) {
      this.updateFinalPrice('balance')
    } else {
      // 余额不足，自动切换成微信支付
      this.updateFinalPrice('wechat')
    }
  },

  // 更新是否可以提交
  updateCanSubmit() {
    const { tableNumber, orderGoods } = this.data
    let canSubmit = true

    // 检查订单商品
    if (!orderGoods || orderGoods.length === 0) {
      canSubmit = false
    }

    // 无论是堂食还是打包，都必须有桌码
    if (!tableNumber) {
      canSubmit = false
    }

    this.setData({ canSubmit })
  },

  // 提交订单
  async submitOrder(e) {
    // 如果按钮被禁用，直接返回
    if (!this.data.canSubmit || this.data.submitting) {
      return
    }

    // 在提交订单前，重新从数据库加载最新的用户信息，确保信息是最新的
    try {
      await this.loadUserInfoFromDB()
    } catch (err) {
      console.error('加载用户信息失败', err)
    }

    // 检查用户信息完整性（使用最新的用户信息）
    const userInfo = this.data.userInfo
    if (!userInfo || !userInfo.avatarUrl || !userInfo.nickName || !userInfo.phoneNumber) {
      // 保存用户当前选择的支付方式，以便完善信息后恢复
      this.setData({
        showAuthModal: true,
        savedPayMethod: this.data.payMethod // 保存当前选择的支付方式
      })
      return
    }

    // 检查桌码（无论是堂食还是打包都需要）
    if (!this.data.tableNumber) {
      wx.showToast({
        title: '请先扫描桌码',
        icon: 'none'
      })
      return
    }

    // 获取支付方式和实付金额（已在选择支付方式时更新）
    const useMiandan = this.data.useMiandan
    const payMethod = this.data.payMethod
    const actualFinalPrice = this.data.finalPrice
    const { orderGoods, miandanCount } = this.data
    
    // 如果使用免单，再次验证订单是否符合免单规则
    if (useMiandan) {
      // 检查免单次数
      if (miandanCount === 0) {
        wx.showToast({
          title: '您还没有免单机会',
          icon: 'none'
        })
        return
      }
      
      // 检查订单中是否有可免单菜品
      const miandanDishes = orderGoods.filter(item => item.canUseMiandan === true)
      if (miandanDishes.length === 0) {
        wx.showToast({
          title: '订单中没有可免单的菜品',
          icon: 'none'
        })
        return
      }
      
      // 检查是否只有一份可免单菜品，且数量为1
      if (miandanDishes.length > 1) {
        wx.showToast({
          title: '免单只能用于一份免单菜品',
          icon: 'none'
        })
        return
      }
      
      const miandanDish = miandanDishes[0]
      if (miandanDish.count > 1) {
        wx.showToast({
          title: '免单菜品数量只能为1份',
          icon: 'none'
        })
        return
      }
      
      // 检查订单中是否还有其他菜品（非免单菜品）
      const nonMiandanDishes = orderGoods.filter(item => !item.canUseMiandan || item.dishId !== miandanDish.dishId)
      if (nonMiandanDishes.length > 0) {
        wx.showToast({
          title: '免单订单只能包含一份免单菜品，不能包含其他菜品',
          icon: 'none'
        })
        return
      }
    }
    
    // 确定支付方式
    const payWithBalance = payMethod === 'balance' && !useMiandan

    // 检查余额是否充足（仅当使用余额支付时）
    if (payWithBalance && this.data.userBalance < actualFinalPrice) {
      wx.showToast({
        title: '余额不足，请使用微信支付',
        icon: 'none'
      })
      this.updateFinalPrice('wechat')
      return
    }

    // 提交订单
    this.setData({ submitting: true })
    wx.showLoading({ title: '下单中...' })

    try {
      const doBuyRes = await wx.cloud.callFunction({
        name: 'doBuy',
        data: {
          orderGoods: this.data.orderGoods,
          totalPrice: this.data.totalPrice,
          finalPrice: actualFinalPrice,
          useMiandan: useMiandan,
          payWithBalance: payWithBalance,
          tableNumber: this.data.tableNumber,
          orderType: this.data.orderType
        }
      })

      if (!doBuyRes.result || !doBuyRes.result.success) {
        const errorMsg = doBuyRes.result?.error || '下单失败'
        throw new Error(errorMsg)
      }

      const orderId = doBuyRes.result.orderId

      if (payWithBalance || useMiandan) {
        // 余额支付或免单：云函数已处理完成
        wx.hideLoading()
        wx.showToast({ title: '下单成功', icon: 'success' })
        
        // 清空购物车（通知首页）
        this.clearCart()
        
        // 跳转到订单页面
        setTimeout(() => {
          wx.switchTab({
            url: '/pages/myorder/myorder'
          })
        }, 1500)
      } else {
        // 微信支付：调用统一下单云函数
        wx.hideLoading()
        wx.showLoading({ title: '拉起支付中...' })

        const nonceStr = Math.random().toString(36).substr(2, 15) + Date.now().toString(36)

        const payRes = await wx.cloud.callFunction({
          name: 'pay',
          data: {
            body: `点餐订单支付¥${actualFinalPrice.toFixed(2)}`,
            outTradeNo: orderId,
            totalFee: actualFinalPrice,
            nonceStr
          }
        })

        const payment = payRes.result && payRes.result.payment ? payRes.result.payment : payRes.result

        wx.hideLoading()
        await wx.requestPayment(payment)

        wx.showToast({ title: '支付成功', icon: 'success' })

        // 清空购物车（通知首页）
        this.clearCart()

        // 跳转到订单页面
        setTimeout(() => {
          wx.switchTab({
            url: '/pages/myorder/myorder'
          })
        }, 1500)
      }
    } catch (err) {
      console.error('创建订单失败', err)
      wx.hideLoading()
      wx.showToast({
        title: err.message || '下单失败',
        icon: 'none'
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  // 编辑订单（返回首页重新选择）
  editOrder(e) {
    const tableNumber = e.currentTarget.dataset.tableNumber || this.data.tableNumber
    // 由于首页使用 navigateTo 跳转，页面不会被销毁，购物车数据应该还在首页的 data 中
    // 直接返回即可，首页的购物车数据会自动恢复
    wx.navigateBack()
  },

  // 清空购物车（通过事件通知首页）
  clearCart() {
    // 使用全局事件或存储来通知首页清空购物车
    // 这里可以通过 getCurrentPages 获取首页实例并调用方法
    const pages = getCurrentPages()
    const indexPage = pages.find(page => page.route === 'pages/index/index')
    if (indexPage) {
      const emptyCart = {}
      indexPage.updateCart(emptyCart)
    }
  },

  // 用户信息保存回调（来自 avatarNicknameModal）
  async onUserInfoSaved(e) {
    const { avatarUrl, nickName, phoneNumber } = e.detail || {}

    // 保存用户之前选择的支付方式
    const savedPayMethod = this.data.savedPayMethod || this.data.payMethod

    // 关闭弹窗
    this.setData({
      showAuthModal: false
    })

    // 从数据库刷新用户信息，保证余额等字段最新（不自动更新支付方式）
    try {
      await this.loadUserInfoFromDB({ skipUpdatePayMethod: true })
    } catch (err) {
      console.error('刷新用户信息失败', err)
    }

    // 恢复用户之前选择的支付方式，并更新实付金额
    if (savedPayMethod) {
      this.updateFinalPrice(savedPayMethod)
    }

    // 清除保存的支付方式
    this.setData({
      savedPayMethod: null
    })

    // 信息完善后，自动继续提交订单
    // 延迟一下，确保用户信息已更新
    setTimeout(() => {
      this.submitOrder()
    }, 300)
  }
})

