// pages/login/login.js
const app = getApp();

Page({
  data: {
    hasUserInfo: false,
    userInfo: null,
    loading: false
  },

  onLoad() {
    // 检查是否已登录
    this.checkLoginStatus();
    
    // 清除可能的异常数据
    this.cleanInvalidUserInfo();
  },

  // 清除无效的用户信息
  cleanInvalidUserInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      // 检查是否是有效的用户信息
      if (!userInfo.nickName || userInfo.nickName === '微信用户' || 
          !userInfo.avatarUrl || userInfo.avatarUrl.includes('default')) {
        console.log('检测到无效的用户信息，清除...');
        wx.removeStorageSync('userInfo');
        wx.removeStorageSync('token');
        wx.removeStorageSync('openid');
        
        const app = getApp();
        app.globalData.userInfo = null;
        app.globalData.hasUserInfo = false;
        app.globalData.openid = null;
        
        this.setData({
          hasUserInfo: false,
          userInfo: null
        });
      }
    }
  },

  onShow() {
    // 每次显示页面时检查登录状态
    this.checkLoginStatus();
  },

  // 检查登录状态
  checkLoginStatus() {
    const hasUserInfo = app.checkLoginStatus();
    this.setData({
      hasUserInfo,
      userInfo: app.globalData.userInfo
    });
  },

  // 微信登录
  handleWxLogin() {
    console.log('=== 开始微信登录流程 ===');
    this.setData({ loading: true });

    // ⚠️ 重要：wx.getUserProfile 必须在用户点击事件中直接调用
    // 所以先获取用户信息，再进行登录流程
    console.log('即将调用 wx.getUserProfile...');
    
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        console.log('✅ 获取用户信息成功:', res.userInfo);
        
        // 保存用户信息
        const userInfo = res.userInfo;
        app.globalData.userInfo = userInfo;
        app.globalData.hasUserInfo = true;
        wx.setStorageSync('userInfo', userInfo);
        
        console.log('用户信息已保存:', {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl
        });

        // 再进行微信登录获取 openid
        console.log('开始调用 wx.login 获取 openid...');
        app.wxLogin()
          .then(() => {
            console.log('✅ 微信登录成功');
            wx.showToast({
              title: '登录成功',
              icon: 'success'
            });

            this.setData({
              hasUserInfo: true,
              userInfo,
              loading: false
            });

            // 延迟跳转
            setTimeout(() => {
              wx.switchTab({
                url: '/pages/index/index'
              });
            }, 1500);
          })
          .catch(error => {
            console.error('❌ 微信登录失败:', error);
            this.setData({ loading: false });
            wx.showToast({
              title: '登录失败，请重试',
              icon: 'none'
            });
          });
      },
      fail: (error) => {
        console.error('❌ 获取用户信息失败:', error);
        this.setData({ loading: false });

        if (error.errMsg && error.errMsg.includes('auth deny')) {
          wx.showToast({
            title: '您拒绝了授权',
            icon: 'none',
            duration: 2000
          });
        } else if (error.errMsg && error.errMsg.includes('user TAP gesture')) {
          wx.showToast({
            title: '请直接点击按钮',
            icon: 'none',
            duration: 2000
          });
        } else {
          wx.showToast({
            title: '获取用户信息失败: ' + (error.errMsg || '未知错误'),
            icon: 'none',
            duration: 3000
          });
        }
      }
    });
  },

  // 返回首页
  goBack() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },
  handleOpenPrivacy() {
    wx.openPrivacyContract({
      success: () => {
        console.log('隐私协议打开成功');
      },
      fail: (err) => {
        console.error('隐私协议打开失败', err);
        wx.showToast({
          title: '无法打开协议',
          icon: 'none'
        });
      }
    });
  }
});
