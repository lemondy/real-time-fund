// app.js
App({
  globalData: {
    userInfo: null,
    openid: null,
    session_key: null,
    hasUserInfo: false,
    // 配置项
    useCloudBase: false, // 是否使用云开发（如果配置了云开发环境，设置为 true）
    serverUrl: '', // 自定义后端服务器地址（如果有）
  },

  onLaunch() {
    // 检查登录态
    this.checkLoginStatus();
    
    // 获取系统信息
    wx.getSystemInfo({
      success: (res) => {
        this.globalData.systemInfo = res;
      }
    });

    // 如果使用云开发，初始化云环境
    if (this.globalData.useCloudBase) {
      this.initCloud();
    }
  },

  // 初始化云开发
  initCloud() {
    if (typeof wx.cloud !== 'undefined') {
      wx.cloud.init({
        // env 参数说明：
        //   env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会默认请求到哪个云环境的资源
        //   此处请填入环境 ID, 环境 ID 可打开云控制台查看
        //   如不填则使用默认环境（第一个创建的环境）
        // env: 'your-env-id',
        traceUser: true,
      });
      this.globalData.cloudInitialized = true;
      console.log('云开发初始化成功');
    } else {
      console.warn('请使用 2.2.3 或以上的基础库以使用云能力');
    }
  },

  // 检查登录状态
  checkLoginStatus() {
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    const openid = wx.getStorageSync('openid');
    
    if (userInfo) {
      this.globalData.hasUserInfo = true;
      this.globalData.userInfo = userInfo;
      this.globalData.openid = openid;
      return true;
    }
    return false;
  },

  // 微信登录 - 支持多种模式
  wxLogin() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (res.code) {
            console.log('wx.login success, code:', res.code);

            // 模式1: 使用云开发
            if (this.globalData.useCloudBase && this.globalData.cloudInitialized) {
              this.loginWithCloud(res.code)
                .then(resolve)
                .catch(reject);
            }
            // 模式2: 使用自定义后端服务器
            else if (this.globalData.serverUrl) {
              this.loginWithServer(res.code)
                .then(resolve)
                .catch(reject);
            }
            // 模式3: 本地模式（仅开发测试用）
            else {
              this.loginLocalMode()
                .then(resolve)
                .catch(reject);
            }
          } else {
            reject(new Error('获取code失败'));
          }
        },
        fail: reject
      });
    });
  },

  // 云开发登录
  loginWithCloud(code) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'login',
        data: { code },
        success: res => {
          console.log('云函数登录成功', res);
          if (res.result && res.result.openid) {
            const { openid, session_key } = res.result;
            wx.setStorageSync('openid', openid);
            wx.setStorageSync('token', openid); // 使用 openid 作为 token
            this.globalData.openid = openid;
            this.globalData.session_key = session_key;
            resolve({ openid, session_key });
          } else {
            reject(new Error('云函数返回数据异常'));
          }
        },
        fail: err => {
          console.error('云函数调用失败', err);
          reject(err);
        }
      });
    });
  },

  // 自定义服务器登录
  loginWithServer(code) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${this.globalData.serverUrl}/api/wx-login`,
        method: 'POST',
        data: { code },
        success: (result) => {
          if (result.data.success) {
            wx.setStorageSync('token', result.data.token);
            wx.setStorageSync('openid', result.data.openid);
            this.globalData.openid = result.data.openid;
            this.globalData.session_key = result.data.session_key;
            resolve(result.data);
          } else {
            reject(new Error(result.data.message || '登录失败'));
          }
        },
        fail: reject
      });
    });
  },

  // 本地模式（仅用于开发测试）
  loginLocalMode() {
    return new Promise((resolve) => {
      console.log('使用本地模式登录');
      const mockOpenid = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      wx.setStorageSync('openid', mockOpenid);
      wx.setStorageSync('token', mockOpenid);
      this.globalData.openid = mockOpenid;
      
      wx.showToast({
        title: '本地模式（测试）',
        icon: 'none',
        duration: 2000
      });
      
      resolve({ openid: mockOpenid, local: true });
    });
  },

  // 获取用户信息
  getUserInfo() {
    return new Promise((resolve, reject) => {
      wx.getUserProfile({
        desc: '用于完善用户资料',
        success: (res) => {
          console.log('获取用户信息成功', res.userInfo);
          this.globalData.userInfo = res.userInfo;
          this.globalData.hasUserInfo = true;
          wx.setStorageSync('userInfo', res.userInfo);
          resolve(res.userInfo);
        },
        fail: (err) => {
          console.error('获取用户信息失败', err);
          reject(err);
        }
      });
    });
  },

  // 退出登录
  logout() {
    return new Promise((resolve) => {
      // 清除登录信息
      wx.removeStorageSync('token');
      wx.removeStorageSync('userInfo');
      wx.removeStorageSync('openid');
      
      this.globalData.userInfo = null;
      this.globalData.openid = null;
      this.globalData.hasUserInfo = false;
      
      wx.showToast({
        title: '已退出登录',
        icon: 'success'
      });
      
      resolve();
    });
  }
});
