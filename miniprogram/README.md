# 小程序

## OpenID全局拦截机制

为了确保页面在获取到用户OpenID后再进行加载，我们在app.js中实现了全局拦截器。该方案无需在每个页面都添加对checkOpenid的调用，大大简化了开发工作。

### 实现原理

我们在app.js中重写了全局的Page构造函数，拦截了所有页面的onLoad生命周期：

```javascript
// 在app.js中的实现片段
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
}
```

## 使用说明

1. 无需在各个页面添加checkOpenid调用，app.js会自动处理
2. 页面的onLoad函数会在openid加载完成后才执行
3. 正常编写页面逻辑即可，不需要关心openid是否已获取
4. app.globalData.openid 可以在页面onLoad中直接使用

## 优化说明

- 通过重写Page构造函数实现全局拦截，无需修改每个页面
- 仅获取一次openid，避免重复请求
- 统一处理loading提示和错误情况
- 大大减少了样板代码，提高开发效率

## 重要提示

- app.globalData.openidReady 为true时表示openid已经准备好
- 所有页面的onLoad执行时，openid已经获取完成
- 该机制对组件的lifetimes.attached等生命周期不生效，仅针对Page页面 