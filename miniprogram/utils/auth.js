// utils/auth.js - 认证工具类

const app = getApp();

/**
 * 检查是否已登录
 * @returns {boolean}
 */
export const isLoggedIn = () => {
  const userInfo = wx.getStorageSync('userInfo');
  return !!userInfo;
};

/**
 * 获取当前用户信息
 * @returns {Object|null}
 */
export const getCurrentUser = () => {
  return wx.getStorageSync('userInfo') || null;
};

/**
 * 获取 OpenID
 * @returns {string}
 */
export const getOpenId = () => {
  return wx.getStorageSync('openid') || '';
};

/**
 * 需要登录时的统一处理
 * @param {string} message - 提示信息
 * @param {boolean} navigate - 是否跳转到登录页
 */
export const requireLogin = (message = '请先登录', navigate = true) => {
  if (!isLoggedIn()) {
    wx.showToast({
      title: message,
      icon: 'none',
      duration: 2000
    });

    if (navigate) {
      setTimeout(() => {
        wx.navigateTo({
          url: '/pages/login/login'
        });
      }, 1500);
    }
    
    return false;
  }
  return true;
};

/**
 * 登录模式检测
 * @returns {string} 'local' | 'cloud' | 'server'
 */
export const getLoginMode = () => {
  const app = getApp();
  if (app.globalData.useCloudBase) {
    return 'cloud';
  } else if (app.globalData.serverUrl) {
    return 'server';
  }
  return 'local';
};

/**
 * 是否为本地测试模式
 * @returns {boolean}
 */
export const isLocalMode = () => {
  const openid = getOpenId();
  return openid.startsWith('local_');
};
