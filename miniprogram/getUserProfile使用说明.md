# wx.getUserProfile 调用注意事项 ⚠️

## 核心规则

`wx.getUserProfile()` **必须在用户点击事件的同步代码中直接调用！**

---

## ✅ 正确写法

### 方式 1：直接调用
```javascript
handleLogin() {
  wx.getUserProfile({
    desc: '用于完善用户资料',
    success: (res) => {
      console.log('用户信息:', res.userInfo);
    }
  });
}
```

### 方式 2：先获取用户信息，再进行其他操作
```javascript
handleLogin() {
  // 1. 先获取用户信息（同步调用）
  wx.getUserProfile({
    desc: '用于完善用户资料',
    success: (res) => {
      const userInfo = res.userInfo;
      wx.setStorageSync('userInfo', userInfo);
      
      // 2. 再进行其他异步操作
      wx.login({
        success: (loginRes) => {
          console.log('登录成功');
        }
      });
    }
  });
}
```

---

## ❌ 错误写法

### 错误 1：在 async 函数中调用
```javascript
// ❌ 会报错！
async handleLogin() {
  await someOperation();
  await wx.getUserProfile({...});  // ❌ 不在同步代码中
}
```

### 错误 2：先登录再获取信息
```javascript
// ❌ 会报错！
handleLogin() {
  wx.login({
    success: () => {
      wx.getUserProfile({...});  // ❌ 在异步回调中
    }
  });
}
```

### 错误 3：使用 Promise 链
```javascript
// ❌ 会报错！
handleLogin() {
  app.wxLogin()
    .then(() => {
      return app.getUserInfo();  // ❌ 在 Promise then 中
    });
}
```

### 错误 4：在定时器中调用
```javascript
// ❌ 会报错！
handleLogin() {
  setTimeout(() => {
    wx.getUserProfile({...});  // ❌ 在定时器中
  }, 100);
}
```

---

## 🔍 错误信息

如果调用方式错误，会看到以下错误：

```
getUserProfile:fail can only be invoked by user TAP gesture.
```

**翻译：** getUserProfile 只能在用户点击手势中调用

---

## 💡 最佳实践

### 推荐的登录流程

```javascript
// pages/login/login.js
Page({
  // 用户点击登录按钮
  handleWxLogin() {
    this.setData({ loading: true });

    // ✅ 步骤1：立即获取用户信息（同步）
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        // 保存用户信息
        const userInfo = res.userInfo;
        wx.setStorageSync('userInfo', userInfo);
        getApp().globalData.userInfo = userInfo;

        // ✅ 步骤2：再进行登录（异步）
        getApp().wxLogin()
          .then(() => {
            wx.showToast({ title: '登录成功' });
            this.setData({ loading: false });
            wx.switchTab({ url: '/pages/index/index' });
          })
          .catch(error => {
            console.error('登录失败:', error);
            this.setData({ loading: false });
          });
      },
      fail: (error) => {
        this.setData({ loading: false });
        if (error.errMsg.includes('auth deny')) {
          wx.showToast({ title: '您拒绝了授权', icon: 'none' });
        }
      }
    });
  }
});
```

---

## 📋 检查清单

登录代码编写完成后，检查以下几点：

- [ ] `wx.getUserProfile()` 在点击事件处理函数中直接调用
- [ ] 没有使用 `async/await` 关键字
- [ ] 没有在 `.then()` 或 `.catch()` 中调用
- [ ] 没有在 `setTimeout/setInterval` 中调用
- [ ] 没有在其他异步回调中调用
- [ ] 按钮绑定了 `bindtap` 事件

---

## 🎯 为什么有这个限制？

微信的设计目的是：
1. **保护用户隐私**：确保用户知道自己在授权
2. **防止滥用**：防止自动弹窗骚扰用户
3. **用户体验**：用户必须主动点击才授权

---

## 🔗 相关文档

- [wx.getUserProfile 官方文档](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/user-info/wx.getUserProfile.html)
- [用户信息接口调整说明](https://developers.weixin.qq.com/community/develop/doc/000cacfa20ce88df04cb468bc52801)

---

## 📝 快速记忆

**口诀：**
> 用户点击立即调，异步操作放后面。  
> 先拿信息存起来，再做登录不会错。

**记住：**
- ✅ 点击 → getUserProfile → 其他操作
- ❌ 点击 → 其他操作 → getUserProfile

---

*最后更新：2026-02-25*
