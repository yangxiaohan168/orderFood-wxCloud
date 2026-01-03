//app.js
App({
  onLaunch: async function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {

      this.globalData = {
        openid: '',
        openidReady: false,
        openidPromise: null, // 用于存储获取openid的Promise对象
        userInfo: null, // 用户信息
        userInfoReady: false,
        userInfoPromise: null // 用于存储获取用户信息的Promise对象
      }

      wx.cloud.init({
        env: '填写你的环境ID',
        traceUser: true,
      })
      
      // 启动时立即获取openid
      this.getOpenidPromise();
      
      // 重写Page方法，实现全局拦截
      this.overridePage();
      
      // 检查小程序更新
      this.checkForUpdate();
    }
  },
  
  // 重写Page方法，拦截所有页面的onLoad
  overridePage: function() {
    const originalPage = Page;
    const that = this;
    
    // 替换全局的Page方法
    Page = function(pageConfig) {
      // 保存原来的onLoad方法
      const originalOnLoad = pageConfig.onLoad;
      
      // 重写onLoad方法
      pageConfig.onLoad = async function(options) {
        wx.showLoading({
          title: '加载中...',
        });
        
        try {
          // 等待openid获取完成
          await that.checkOpenid();
          wx.hideLoading();
          
          // 调用原来的onLoad
          if (originalOnLoad) {
            originalOnLoad.call(this, options);
          }
        } catch (error) {
          console.error('获取用户信息失败', error);
          wx.hideLoading();
          wx.showToast({
            title: '加载失败，请重试',
            icon: 'none'
          });
        }
      }
      
      // 调用原始的Page构造函数
      return originalPage(pageConfig);
    };
  },
  
  // 将获取openid封装为Promise，方便页面等待openid加载完成
  getOpenidPromise: function() {
    // 如果已经获取过openid，直接返回
    if (this.globalData.openidReady && this.globalData.openid) {
      return Promise.resolve(this.globalData.openid);
    }
    
    // 如果已经有一个正在进行的Promise，直接返回该Promise
    if (this.globalData.openidPromise) {
      return this.globalData.openidPromise;
    }
    
    // 创建新的Promise并保存
    const db = wx.cloud.database();
    let that = this;
    
    this.globalData.openidPromise = new Promise(async (resolve, reject) => {
      try {
        let openid = wx.getStorageSync('openid');
        if (!openid) {
          const res = await wx.cloud.callFunction({
            name: 'login'
          });
          openid = res.result.openid;
          that.globalData.openid = res.result.openid;
          wx.setStorageSync('openid', res.result.openid);
        }
        
        that.globalData.openid = openid;
        const queryRes = await db.collection('user').where({
          _openid: openid
        }).get();
        if (queryRes.data && queryRes.data.length === 0) {
          // 创建新用户记录
          const addRes = await db.collection('user').add({
            data: {
              balance: 0,
              createTime: new Date().getTime(),
            }
          });
          // 获取创建的用户信息
          const newUserRes = await db.collection('user').doc(addRes._id).get()
          if (newUserRes.data) {
            that.globalData.userInfo = newUserRes.data
          }
        }else{
          that.globalData.userInfo = queryRes.data[0]
        }
        
        // 标记openid已准备好
        that.globalData.openidReady = true;
        that.globalData.userInfoReady = true;
        resolve(openid);
      } catch (error) {
        console.error('获取openid失败', error);
        reject(error);
      }
    });
    
    return this.globalData.openidPromise;
  },
  
  // 检查openid是否已获取，供页面使用
  checkOpenid: function() {
    return this.getOpenidPromise();
  },

  // 检查小程序更新
  checkForUpdate: function() {
    // 判断是否支持更新API
    if (wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager()

      // 检查更新
      updateManager.onCheckForUpdate((res) => {
        if (res.hasUpdate) {
          console.log('发现新版本')
        }
      })

      // 更新下载完成
      updateManager.onUpdateReady(() => {
        wx.showModal({
          title: '更新提示',
          content: '新版本已准备好，是否重启应用？',
          showCancel: true,
          confirmText: '立即更新',
          cancelText: '稍后',
          success: (res) => {
            if (res.confirm) {
              // 应用新版本
              updateManager.applyUpdate()
            }
          }
        })
      })

      // 更新失败
      updateManager.onUpdateFailed(() => {
        wx.showModal({
          title: '更新失败',
          content: '新版本下载失败，请删除小程序后重新打开',
          showCancel: false
        })
      })
    } else {
      // 不支持更新API，静默处理，不打扰用户
      console.log('当前微信版本不支持更新API')
    }
  }
})
