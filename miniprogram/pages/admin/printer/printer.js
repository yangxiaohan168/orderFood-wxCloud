// pages/admin/printer/printer.js
const db = wx.cloud.database()

Page({
  data: {
    printerInfo: null,
    printerStatus: {
      onlineStatus: 0,
      workStatus: -1,
      workStatusDesc: '未知'
    },
    showBindModal: false,
    bindForm: {
      sn: '',
      key: '',
      name: ''
    },
    densityText: {
      4: '较淡',
      5: '普通',
      6: '较浓',
      7: '浓'
    },
    speedText: {
      1: '慢',
      2: '中',
      3: '快'
    }
  },

  onLoad() {
    this.loadPrinterInfo()
  },

  onShow() {
    if (this.data.printerInfo) {
      this.queryStatus()
    }
  },

  // 加载打印机信息
  async loadPrinterInfo() {
    try {
      const res = await db.collection('printer')
        .limit(1)
        .get()

      if (res.data && res.data.length > 0) {
        this.setData({
          printerInfo: res.data[0]
        })
        // 加载后查询状态
        this.queryStatus()
      }
    } catch (err) {
      console.error('加载打印机信息失败', err)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  // 显示绑定弹窗
  showBindModal() {
    this.setData({
      showBindModal: true,
      bindForm: {
        sn: '',
        key: '',
        name: ''
      }
    })
  },

  // 关闭绑定弹窗
  closeBindModal() {
    this.setData({
      showBindModal: false
    })
  },

  // 阻止冒泡
  stopPropagation() {},

  // 输入设备编号
  onSnInput(e) {
    this.setData({
      'bindForm.sn': e.detail.value
    })
  },

  // 输入绑定码
  onKeyInput(e) {
    this.setData({
      'bindForm.key': e.detail.value
    })
  },

  // 输入设备名称
  onNameInput(e) {
    this.setData({
      'bindForm.name': e.detail.value
    })
  },

  // 确认绑定
  async confirmBind() {
    const { sn, key, name } = this.data.bindForm

    if (!sn || !sn.trim()) {
      wx.showToast({
        title: '请输入设备编号',
        icon: 'none'
      })
      return
    }

    if (!key || !key.trim()) {
      wx.showToast({
        title: '请输入绑定码',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '绑定中...' })

      // 检查是否已有打印机
      const checkRes = await db.collection('printer').get()
      if (checkRes.data && checkRes.data.length > 0) {
        wx.hideLoading()
        wx.showModal({
          title: '提示',
          content: '已绑定打印机，请先解绑',
          showCancel: false
        })
        return
      }

      // 调用云函数绑定打印机
      const bindRes = await wx.cloud.callFunction({
        name: 'printManage',
        data: {
          $url: 'addPrinter',
          sn: sn.trim(),
          key: key.trim(),
          name: name.trim() || `打印机${sn}`
        }
      })

      if (!bindRes.result || !bindRes.result.success) {
        const error = bindRes.result?.error || '绑定失败'
        wx.hideLoading()
        wx.showModal({
          title: '绑定失败',
          content: error,
          showCancel: false
        })
        return
      }

      // 保存到数据库
      const printerData = {
        sn: sn.trim(),
        key: key.trim(),
        name: name.trim() || `打印机${sn}`,
        density: 6, // 默认较浓
        printSpeed: 2, // 默认中等速度
        volume: 3, // 默认音量3
        createTime: db.serverDate()
      }

      await db.collection('printer').add({
        data: printerData
      })

      wx.hideLoading()
      wx.showToast({
        title: '绑定成功',
        icon: 'success'
      })

      this.closeBindModal()
      this.loadPrinterInfo()
    } catch (err) {
      wx.hideLoading()
      console.error('绑定失败', err)
      wx.showToast({
        title: err.message || '绑定失败',
        icon: 'none'
      })
    }
  },

  // 解绑打印机
  unbindPrinter() {
    wx.showModal({
      title: '确认解绑',
      content: '确定要解绑打印机吗？',
      success: async (res) => {
        if (res.confirm) {
          await this.doUnbindPrinter()
        }
      }
    })
  },

  // 执行解绑
  async doUnbindPrinter() {
    try {
      wx.showLoading({ title: '解绑中...' })

      const printerInfo = this.data.printerInfo
      if (!printerInfo) {
        wx.hideLoading()
        return
      }

      // 调用云函数解绑
      const unbindRes = await wx.cloud.callFunction({
        name: 'printManage',
        data: {
          $url: 'delPrinter',
          sn: [printerInfo.sn]
        }
      })

      if (!unbindRes.result || !unbindRes.result.success) {
        const error = unbindRes.result?.error || '解绑失败'
        wx.hideLoading()
        wx.showModal({
          title: '解绑失败',
          content: error,
          showCancel: false
        })
        return
      }

      // 从数据库删除
      await db.collection('printer').doc(printerInfo._id).remove()

      wx.hideLoading()
      wx.showToast({
        title: '解绑成功',
        icon: 'success'
      })

      this.setData({
        printerInfo: null,
        printerStatus: {
          onlineStatus: 0,
          workStatus: -1,
          workStatusDesc: '未知'
        }
      })
    } catch (err) {
      wx.hideLoading()
      console.error('解绑失败', err)
      wx.showToast({
        title: err.message || '解绑失败',
        icon: 'none'
      })
    }
  },

  // 查询打印机状态
  async queryStatus() {
    const printerInfo = this.data.printerInfo
    if (!printerInfo) {
      return
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'printManage',
        data: {
          $url: 'getDeviceStatus',
          sn: printerInfo.sn
        }
      })

      if (res.result && res.result.success && res.result.data && res.result.data.data) {
        this.setData({
          printerStatus: res.result.data.data
        })
      }
    } catch (err) {
      console.error('查询状态失败', err)
    }
  },

  // 测试打印
  async testPrint() {
    const printerInfo = this.data.printerInfo
    if (!printerInfo) {
      wx.showToast({
        title: '未绑定打印机',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '打印中...' })

      // 查询店铺信息
      const shopRes = await db.collection('shopInfo').limit(1).get()
      const shopInfo = shopRes.data && shopRes.data.length > 0 ? shopRes.data[0] : null

      // 生成测试打印内容（模仿 doBuy/index.js 的格式）
      const formatDate = (d) => {
        // 转换为北京时间（UTC+8）
        const beijingTime = new Date(d.getTime() + 8 * 60 * 60 * 1000)
        const pad = (n) => (n < 10 ? '0' + n : n)
        // 使用UTC方法获取转换后的时间
        return `${beijingTime.getUTCFullYear()}-${pad(beijingTime.getUTCMonth() + 1)}-${pad(beijingTime.getUTCDate())} ${pad(beijingTime.getUTCHours())}:${pad(beijingTime.getUTCMinutes())}`
      }
      
      // 计算字符串的显示宽度（中文字符占2个宽度，英文数字占1个宽度）
      const getStringWidth = (str) => {
        if (!str) return 0
        let width = 0
        for (let i = 0; i < str.length; i++) {
          const char = str.charAt(i)
          // 判断是否为中文字符（包括中文标点）
          if (/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(char)) {
            width += 2
          } else {
            width += 1
          }
        }
        return width
      }
      
      // 生成指定宽度的空格字符串
      const generateSpaces = (count) => {
        return ' '.repeat(count)
      }
      
      // 转义HTML特殊字符
      const escapeHtml = (str) => {
        if (!str) return ''
        return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;')
      }
      
      // 隐藏电话号码中间4位
      const hidePhoneNumber = (phone) => {
        if (!phone) return ''
        const phoneStr = String(phone)
        // 如果是11位手机号，隐藏中间4位（第4-7位）
        if (phoneStr.length === 11) {
          return phoneStr.substring(0, 3) + '****' + phoneStr.substring(7)
        }
        // 如果不是11位，返回原值
        return phoneStr
      }
      
      const date = new Date()
      const testOrderId = 'TEST_' + Date.now()
      
      // 测试订单数据
      const testOrder = {
        _id: testOrderId,
        orderType: 'dineIn', // 测试使用堂食订单
        tableNumber: '01',
        goods: [
          {
            dishName: '测试菜品1',
            count: 1,
            price: 18.00,
            tags: ['微辣', '少盐']
          },
          {
            dishName: '测试菜品2',
            count: 2,
            price: 25.00
          }
        ],
        totalPrice: 68.00,
        finalPrice: 68.00,
        useMiandan: false,
        payWithBalance: false,
        userPhone: '13800000000'
      }
      
      // 生成打印内容
      const orderTypeText = testOrder.orderType === 'dineIn' ? '堂食' : '打包'
      
      let content = `<C><font# bolder=1 height=2 width=2>${orderTypeText}订单</font#></C><BR>`
      content += `<C><font# bolder=1 height=2 width=2>${escapeHtml(shopInfo?.name || '餐饮店')}</font#></C><BR>`
      content += `<BR>`
      
      // 订单编号和时间
      content += `<C>********************************</C><BR>`
      content += `<LEFT>订单编号: ${escapeHtml(testOrder._id)}</LEFT><BR>`
      content += `<LEFT>下单时间: ${formatDate(date)}</LEFT><BR>`
      
      // 桌码号（加粗显示）
      if (testOrder.tableNumber) {
        content += `<C><font# bolder=1 height=2 width=2>桌码: ${escapeHtml(testOrder.tableNumber)}</font#></C><BR>`
      }
      
      content += `<C>--------------商品--------------</C><BR>`
      
      // 商品列表（使用自动计算空格对齐）
      if (testOrder.goods && testOrder.goods.length > 0) {
        testOrder.goods.forEach(item => {
          const dishName = escapeHtml(item.dishName || '未知菜品')
          const count = item.count || 1
          const price = parseFloat(item.price || 0).toFixed(2)
          const rightPart = `×${count}  ￥${price}`
          const dishNameWidth = getStringWidth(dishName)
          const rightPartWidth = getStringWidth(rightPart)
          const totalWidth = 31 // 总宽度31个字符（减少1个避免换行）
          const spacesNeeded = totalWidth - dishNameWidth - rightPartWidth
          const spaces = spacesNeeded > 0 ? generateSpaces(spacesNeeded) : ' '
          content += `<LEFT><font# bolder=0 height=2 width=1>${dishName}${spaces}${rightPart}</font#></LEFT><BR>`
          
          // 打印标签（如果有）
          if (item.tags && Array.isArray(item.tags) && item.tags.length > 0) {
            const tagsText = item.tags.map(tag => escapeHtml(tag)).join(' ')
            content += `<LEFT><font# bolder=0 height=1 width=1>  ${tagsText}</font#></LEFT><BR>`
          }
        })
      }
      
      // 价格信息
      const finalPrice = (testOrder.finalPrice || 0).toFixed(2)
      
      // 添加分隔线隔开菜品
      content += `<C>--------------------------------</C><BR>`
      
      // 实付价格，居右显示
      content += `<RIGHT><font# bolder=0 height=2 width=1>实付  ￥${finalPrice}</font#></RIGHT><BR>`
      
      // 显示支付方式
      let payMethodText = ''
      if (testOrder.useMiandan) {
        payMethodText = '免单支付'
      } else if (testOrder.payWithBalance !== undefined) {
        payMethodText = testOrder.payWithBalance ? '余额支付' : '微信支付'
      } else {
        payMethodText = '微信支付'
      }
      if (payMethodText) {
        content += `<LEFT>支付方式: ${payMethodText}</LEFT><BR>`
      }
      
      content += `<C>--------------------------------</C><BR>`
      
      // 用户信息
      if (testOrder.userPhone) {
        const hiddenPhone = hidePhoneNumber(testOrder.userPhone)
        content += `<LEFT><font# bolder=1 height=1 width=1>客户电话: ${escapeHtml(hiddenPhone)}</font#></LEFT><BR>`
      }
      
      content += `<C>**************<font# bolder=1 height=2 width=1>完</font#><font# bolder=0 height=1 width=1>**************</font#></C><BR>`

      // 调用打印接口
      const printRes = await wx.cloud.callFunction({
        name: 'printManage',
        data: {
          $url: 'printNote',
          sn: printerInfo.sn,
          voice: '16', 
          voicePlayTimes: 1,
          voicePlayInterval: 3,
          content: content,
          copies: 1,
          expiresInSeconds: 7200,
          outTradeNo: 'TEST_' + Date.now() // 测试订单号
        }
      })

      wx.hideLoading()

      if (printRes.result && printRes.result.success) {
        wx.showToast({
          title: '测试打印成功',
          icon: 'success'
        })
      } else {
        wx.showToast({
          title: printRes.result?.error || '测试打印失败',
          icon: 'none'
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('测试打印失败', err)
      wx.showToast({
        title: err.message || '测试打印失败',
        icon: 'none'
      })
    }
  },

  // 设置打印浓度
  async setDensity(e) {
    const density = parseInt(e.currentTarget.dataset.value)
    const printerInfo = this.data.printerInfo
    if (!printerInfo) return

    try {
      wx.showLoading({ title: '设置中...' })

      const res = await wx.cloud.callFunction({
        name: 'printManage',
        data: {
          $url: 'setDensity',
          sn: printerInfo.sn,
          density: density
        }
      })

      if (res.result && res.result.success) {
        // 更新数据库
        await db.collection('printer').doc(printerInfo._id).update({
          data: {
            density: density
          }
        })

        this.setData({
          'printerInfo.density': density
        })

        wx.hideLoading()
        wx.showToast({
          title: '设置成功',
          icon: 'success'
        })
      } else {
        wx.hideLoading()
        wx.showToast({
          title: res.result?.error || '设置失败',
          icon: 'none'
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('设置浓度失败', err)
      wx.showToast({
        title: '设置失败',
        icon: 'none'
      })
    }
  },

  // 设置打印速度
  async setPrintSpeed(e) {
    const printSpeed = parseInt(e.currentTarget.dataset.value)
    const printerInfo = this.data.printerInfo
    if (!printerInfo) return

    try {
      wx.showLoading({ title: '设置中...' })

      const res = await wx.cloud.callFunction({
        name: 'printManage',
        data: {
          $url: 'setPrintSpeed',
          sn: printerInfo.sn,
          printSpeed: printSpeed
        }
      })

      if (res.result && res.result.success) {
        // 更新数据库
        await db.collection('printer').doc(printerInfo._id).update({
          data: {
            printSpeed: printSpeed
          }
        })

        this.setData({
          'printerInfo.printSpeed': printSpeed
        })

        wx.hideLoading()
        wx.showToast({
          title: '设置成功',
          icon: 'success'
        })
      } else {
        wx.hideLoading()
        wx.showToast({
          title: res.result?.error || '设置失败',
          icon: 'none'
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('设置速度失败', err)
      wx.showToast({
        title: '设置失败',
        icon: 'none'
      })
    }
  },

  // 设置音量
  async setVolume(e) {
    const volume = parseInt(e.currentTarget.dataset.value)
    const printerInfo = this.data.printerInfo
    if (!printerInfo) return

    try {
      wx.showLoading({ title: '设置中...' })

      const res = await wx.cloud.callFunction({
        name: 'printManage',
        data: {
          $url: 'setVolume',
          sn: printerInfo.sn,
          volume: volume
        }
      })

      if (res.result && res.result.success) {
        // 更新数据库
        await db.collection('printer').doc(printerInfo._id).update({
          data: {
            volume: volume
          }
        })

        this.setData({
          'printerInfo.volume': volume
        })

        wx.hideLoading()
        wx.showToast({
          title: '设置成功',
          icon: 'success'
        })
      } else {
        wx.hideLoading()
        wx.showToast({
          title: res.result?.error || '设置失败',
          icon: 'none'
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('设置音量失败', err)
      wx.showToast({
        title: '设置失败',
        icon: 'none'
      })
    }
  }
})

