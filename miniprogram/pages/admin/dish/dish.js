// pages/admin/dish/dish.js
const db = wx.cloud.database()

Page({
  data: {
    // 分类相关
    categories: [],
    currentCategoryId: '', // 当前选中的分类ID
    showCategoryModal: false,
    editCategoryMode: false,
    currentCategory: {
      _id: '',
      name: '',
      sort: 0
    },
    
    // 菜品相关
    dishes: [],
    showDishModal: false,
    editDishMode: false,
      currentDish: {
        _id: '',
        name: '',
        price: '',
        originalPrice: '',
        description: '',
        categoryId: '',
        categoryName: '',
        image: '',
        status: 1, // 1: 上架, 0: 下架
        sort: 0,
        tags: [], // 标签数组
        canUseMiandan: false // 是否可以参与免单
      },
    
    // 标签编辑
    showTagModal: false,
    editingTagIndex: -1, // -1表示新增，>=0表示编辑
    currentTag: {
      name: '',
      type: 'single', // single: 单选, multiple: 多选
      required: true, // 是否必选
      options: []
    },
    newOption: '', // 临时输入的选项
    // 菜品分页
    dishPage: 0,
    dishPageSize: 20,
    dishHasMore: true,
    loadingDishes: false
  },

  onLoad() {
    this.loadCategories()
    this.loadDishes()
  },

  onShow() {
    this.loadCategories()
    this.loadDishes()
  },

  // ==================== 分类管理 ====================
  
  // 加载分类列表
  async loadCategories() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getCategory'
      })
      const result = res.result || {}
      const categories = result.success ? (result.data || []) : []
      
      // 如果有分类且没有选中分类，默认选中第一个
      if (categories.length > 0 && !this.data.currentCategoryId) {
        this.setData({
          categories: categories,
          currentCategoryId: categories[0]._id
        }, () => {
          this.loadDishes()
        })
      } else {
        this.setData({
          categories: categories
        }, () => {
          if (this.data.currentCategoryId) {
            this.loadDishes()
          }
        })
      }
    } catch (err) {
      console.error('加载分类失败', err)
    }
  },

  // 切换分类
  switchCategory(e) {
    const categoryId = e.currentTarget.dataset.id
    this.setData({
      currentCategoryId: categoryId
    }, () => {
      this.loadDishes()
    })
  },

  // 显示添加分类弹窗
  showAddCategoryModal() {
    this.setData({
      showCategoryModal: true,
      editCategoryMode: false,
      currentCategory: {
        _id: '',
        name: '',
        sort: this.data.categories.length
      }
    })
  },

  // 显示编辑分类弹窗
  showEditCategoryModal(e) {
    const category = e.currentTarget.dataset.category
    this.setData({
      showCategoryModal: true,
      editCategoryMode: true,
      currentCategory: { ...category }
    })
  },

  // 关闭分类弹窗
  closeCategoryModal() {
    this.setData({
      showCategoryModal: false
    })
  },

  // 输入分类名称
  onCategoryNameInput(e) {
    this.setData({
      'currentCategory.name': e.detail.value
    })
  },

  // 输入分类排序
  onCategorySortInput(e) {
    this.setData({
      'currentCategory.sort': parseInt(e.detail.value) || 0
    })
  },


  // 保存分类
  async saveCategory() {
    const { editCategoryMode, currentCategory } = this.data

    if (!currentCategory.name.trim()) {
      wx.showToast({
        title: '请输入分类名称',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })

      if (editCategoryMode) {
        // 编辑
        const { _id, _openid,...updateData } = currentCategory
        await db.collection('dishCategory').doc(_id).update({
          data: updateData
        })
      } else {
        // 添加
        const addRes =         await db.collection('dishCategory').add({
          data: {
            name: currentCategory.name,
            sort: currentCategory.sort,
            createTime: new Date()
          }
        })
        
        // 添加后自动选中新分类
        this.setData({
          currentCategoryId: addRes._id
        })
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      this.closeCategoryModal()
      this.loadCategories()
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }
  },

  // 删除分类
  deleteCategory(e) {
    const category = e.currentTarget.dataset.category

    wx.showModal({
      title: '确认删除',
      content: `确定要删除分类"${category.name}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })

            await db.collection('dishCategory').doc(category._id).remove()

            wx.hideLoading()
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })

            // 如果删除的是当前选中的分类，清空选中状态
            if (this.data.currentCategoryId === category._id) {
              this.setData({
                currentCategoryId: '',
                dishes: []
              })
            }

            this.loadCategories()
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
  },

  // ==================== 菜品管理 ====================

  // 加载菜品
  async loadDishes(append = false) {
    if (!this.data.currentCategoryId) {
      this.setData({
        dishes: []
      })
      return
    }

    try {
      if (this.data.loadingDishes) {
        return
      }
      this.setData({ loadingDishes: true })

      const pageSize = this.data.dishPageSize
      const page = append ? this.data.dishPage + 1 : 0
      const skip = page * pageSize

      const res = await db.collection('dish')
        .where({
          categoryId: this.data.currentCategoryId
        })
        .orderBy('sort', 'asc')
        .skip(skip)
        .limit(pageSize)
        .get()
      
      const list = res.data || []
      const newDishes = append ? this.data.dishes.concat(list) : list
      const hasMore = list.length === pageSize

      this.setData({
        dishes: newDishes,
        dishPage: page,
        dishHasMore: hasMore
      })
    } catch (err) {
      console.error('加载菜品失败', err)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loadingDishes: false })
    }
  },

  // 显示添加菜品弹窗
  showAddDishModal() {
    if (!this.data.currentCategoryId) {
      wx.showToast({
        title: '请先选择分类',
        icon: 'none'
      })
      return
    }

    const currentCategory = this.data.categories.find(c => c._id === this.data.currentCategoryId)

    this.setData({
      showDishModal: true,
      editDishMode: false,
      currentDish: {
        _id: '',
        name: '',
        price: '',
        originalPrice: '',
        description: '',
        categoryId: this.data.currentCategoryId,
        categoryName: currentCategory ? currentCategory.name : '',
        image: '',
        status: 1,
        sort: this.data.dishes.length,
        tags: [],
        canUseMiandan: false // 是否可以参与免单
      }
    })
  },

  // 显示编辑菜品弹窗
  showEditDishModal(e) {
    const dish = e.currentTarget.dataset.dish
    this.setData({
      showDishModal: true,
      editDishMode: true,
      currentDish: { ...dish }
    })
  },

  // 关闭菜品弹窗
  closeDishModal() {
    this.setData({
      showDishModal: false
    })
  },

  // 切换菜品上下架状态
  async toggleDishStatus(e) {
    const dish = e.currentTarget.dataset.dish
    const newStatus = dish.status === 1 ? 0 : 1

    try {
      await db.collection('dish').doc(dish._id).update({
        data: {
          status: newStatus
        }
      })

      wx.showToast({
        title: newStatus === 1 ? '已上架' : '已下架',
        icon: 'success'
      })

      this.loadDishes()
    } catch (err) {
      console.error('切换状态失败', err)
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      })
    }
  },

  // 输入菜品名称
  onDishNameInput(e) {
    let value = e.detail.value
    // 限制最多10个字
    if (value.length > 10) {
      value = value.substring(0, 10)
      wx.showToast({
        title: '名称最多10个字',
        icon: 'none'
      })
    }
    this.setData({
      'currentDish.name': value
    })
  },

  // 输入菜品价格
  onDishPriceInput(e) {
    let value = e.detail.value
    if (isNaN(value)) {
      value = ''
    } else {
      // 不能为负数，最高10000
      if (value < 0) {
        value = 0
        wx.showToast({
          title: '价格不能为负数',
          icon: 'none'
        })
      } else if (value > 10000) {
        value = 10000
        wx.showToast({
          title: '价格最高10000',
          icon: 'none'
        })
      }
    }
    this.setData({
      'currentDish.price': value
    })
  },

  // 输入菜品原价
  onDishOriginalPriceInput(e) {
    let value = e.detail.value
    if (isNaN(value)) {
      value = ''
    } else {
      // 不能为负数，最高10000
      if (value < 0) {
        value = 0
        wx.showToast({
          title: '价格不能为负数',
          icon: 'none'
        })
      } else if (value > 10000) {
        value = 10000
        wx.showToast({
          title: '价格最高10000',
          icon: 'none'
        })
      }
    }
    this.setData({
      'currentDish.originalPrice': value
    })
  },

  // 输入菜品描述
  onDishDescriptionInput(e) {
    let value = e.detail.value
    // 限制最多10个字
    if (value.length > 10) {
      value = value.substring(0, 10)
      wx.showToast({
        title: '描述最多10个字',
        icon: 'none'
      })
    }
    this.setData({
      'currentDish.description': value
    })
  },

  // 输入菜品排序
  onDishSortInput(e) {
    this.setData({
      'currentDish.sort': parseInt(e.detail.value) || 0
    })
  },

  // 切换可参与免单
  onCanUseMiandanChange(e) {
    this.setData({
      'currentDish.canUseMiandan': e.detail.value
    })
  },

  // 选择菜品图片
  async chooseDishImage() {
    try {
      const res = await wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })

      const tempFilePath = res.tempFilePaths[0]

      wx.showLoading({ title: '上传中...' })

      const cloudPath = `dish/${Date.now()}_${Math.random().toString(36).substr(2)}.jpg`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempFilePath
      })

      wx.hideLoading()

      this.setData({
        'currentDish.image': uploadRes.fileID
      })

      wx.showToast({
        title: '上传成功',
        icon: 'success'
      })
    } catch (err) {
      wx.hideLoading()
      console.error('上传图片失败', err)
      wx.showToast({
        title: '上传失败',
        icon: 'none'
      })
    }
  },

  // 保存菜品
  async saveDish() {
    const { editDishMode, currentDish } = this.data

    // 验证必填项：图片
    if (!currentDish.image || !currentDish.image.trim()) {
      wx.showToast({
        title: '请上传菜品图片',
        icon: 'none'
      })
      return
    }

    // 验证必填项：名称
    if (!currentDish.name || !currentDish.name.trim()) {
      wx.showToast({
        title: '请输入菜品名称',
        icon: 'none'
      })
      return
    }

    // 验证名称字数（最多10个字）
    if (currentDish.name.trim().length > 10) {
      wx.showToast({
        title: '菜品名称最多10个字',
        icon: 'none'
      })
      return
    }

    // 验证描述字数（最多10个字）
    if (currentDish.description && currentDish.description.trim().length > 10) {
      wx.showToast({
        title: '菜品描述最多10个字',
        icon: 'none'
      })
      return
    }

    // 验证必填项：分类
    if (!currentDish.categoryId) {
      wx.showToast({
        title: '请选择分类',
        icon: 'none'
      })
      return
    }

    // 验证价格：不能为空、不能为负数、最高10000
    const price = parseFloat(currentDish.price)
    if (isNaN(price) || price === '' || price === null || price === undefined) {
      wx.showToast({
        title: '请输入售价',
        icon: 'none'
      })
      return
    }

    if (price < 0) {
      wx.showToast({
        title: '售价不能为负数',
        icon: 'none'
      })
      return
    }

    if (price > 10000) {
      wx.showToast({
        title: '售价最高10000',
        icon: 'none'
      })
      return
    }

    // 验证必填项：原价
    const originalPrice = parseFloat(currentDish.originalPrice)
    if (isNaN(originalPrice) || originalPrice === '' || originalPrice === null || originalPrice === undefined) {
      wx.showToast({
        title: '请输入原价',
        icon: 'none'
      })
      return
    }

    if (originalPrice < 0) {
      wx.showToast({
        title: '原价不能为负数',
        icon: 'none'
      })
      return
    }

    if (originalPrice > 10000) {
      wx.showToast({
        title: '原价最高10000',
        icon: 'none'
      })
      return
    }

    // 验证原价不能小于售价
    if (originalPrice < price) {
      wx.showToast({
        title: '原价不能小于售价',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })
      const { _id, _openid, ...updateData } = currentDish
      // 确保价格和原价是数字类型
      updateData.price = price
      updateData.originalPrice = originalPrice
      
      if (editDishMode) {
        // 编辑（去掉 _id 和 _openid 等系统字段）
        
        await db.collection('dish').doc(_id).update({
          data: updateData
        })
      } else {
        // 添加
        await db.collection('dish').add({
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

      this.closeDishModal()
      this.loadDishes()
    } catch (err) {
      wx.hideLoading()
      console.error('保存失败', err)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }
  },

  // 删除菜品
  deleteDish(e) {
    const dish = e.currentTarget.dataset.dish

    wx.showModal({
      title: '确认删除',
      content: `确定要删除菜品"${dish.name}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })

            await db.collection('dish').doc(dish._id).remove()

            wx.hideLoading()
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })

            this.loadDishes()
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
  },

  // ==================== 标签管理 ====================

  // 显示添加标签弹窗
  showAddTagModal() {
    this.setData({
      showTagModal: true,
      editingTagIndex: -1,
      currentTag: {
        name: '',
        type: 'single',
        required: true,
        options: []
      },
      newOption: ''
    })
  },

  // 显示编辑标签弹窗
  showEditTagModal(e) {
    const index = e.currentTarget.dataset.index
    const tag = this.data.currentDish.tags[index]
    this.setData({
      showTagModal: true,
      editingTagIndex: index,
      currentTag: JSON.parse(JSON.stringify(tag)), // 深拷贝
      newOption: ''
    })
  },

  // 关闭标签弹窗
  closeTagModal() {
    this.setData({
      showTagModal: false
    })
  },

  // 输入标签名称
  onTagNameInput(e) {
    this.setData({
      'currentTag.name': e.detail.value
    })
  },

  // 选择标签类型
  selectTagType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({
      'currentTag.type': type
    })
  },

  // 切换是否必选
  onTagRequiredChange(e) {
    this.setData({
      'currentTag.required': e.detail.value
    })
  },

  // 输入新选项
  onOptionInput(e) {
    this.setData({
      newOption: e.detail.value
    })
  },

  // 添加选项
  addOption() {
    const { currentTag, newOption } = this.data
    if (!newOption.trim()) {
      wx.showToast({
        title: '请输入选项内容',
        icon: 'none'
      })
      return
    }

    if (currentTag.options.includes(newOption.trim())) {
      wx.showToast({
        title: '选项已存在',
        icon: 'none'
      })
      return
    }

    currentTag.options.push(newOption.trim())
    this.setData({
      currentTag,
      newOption: ''
    })
  },

  // 删除选项
  deleteOption(e) {
    const index = e.currentTarget.dataset.index
    const { currentTag } = this.data
    currentTag.options.splice(index, 1)
    this.setData({
      currentTag
    })
  },

  // 保存标签
  saveTag() {
    const { currentTag, editingTagIndex, currentDish } = this.data

    if (!currentTag.name.trim()) {
      wx.showToast({
        title: '请输入标签名称',
        icon: 'none'
      })
      return
    }

    if (currentTag.options.length === 0) {
      wx.showToast({
        title: '请至少添加一个选项',
        icon: 'none'
      })
      return
    }

    if (editingTagIndex === -1) {
      // 新增
      currentDish.tags.push({
        id: Date.now().toString(),
        ...currentTag
      })
    } else {
      // 编辑
      currentDish.tags[editingTagIndex] = {
        id: currentDish.tags[editingTagIndex].id,
        ...currentTag
      }
    }

    this.setData({
      currentDish,
      showTagModal: false
    })
  },

  // 删除标签
  deleteTag(e) {
    const index = e.currentTarget.dataset.index
    const { currentDish } = this.data

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个标签吗？',
      success: (res) => {
        if (res.confirm) {
          currentDish.tags.splice(index, 1)
          this.setData({
            currentDish
          })
        }
      }
    })
  },

  // 阻止冒泡
  stopPropagation() {}
})
