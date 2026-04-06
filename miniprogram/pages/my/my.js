// pages/my/my.js
const app = getApp();

Page({
  data: {
    hasUserInfo: false,
    userInfo: null,
    openid: '',
    fundCount: 0,
    // 持仓汇总
    hasPnlData: false,
    totalCost: '0.00',
    todayPnl: 0,
    todayPnlStr: '--',
    totalPnl: 0,
    totalPnlRateStr: '--',
    version: '1.1.0'
  },

  onShareAppMessage() {
    return {
      title: '咕咕看板 - 养鸡信息追踪',
      path: '/pages/index/index'
    };
  },

  onShareTimeline() {
    return {
      title: '咕咕看板 - 养鸡信息追踪'
    };
  },

  onLoad() {
    this.loadUserData();
  },

  onShow() {
    this.loadUserData();
    this.loadFundStats();
  },

  // 加载用户数据
  loadUserData() {
    const hasUserInfo = app.checkLoginStatus();
    const openid = wx.getStorageSync('openid') || '';
    
    this.setData({
      hasUserInfo,
      userInfo: app.globalData.userInfo,
      openid: openid ? openid.substring(0, 16) + '...' : ''
    });
  },

  // 加载基金统计数据（含持仓汇总）
  loadFundStats() {
    try {
      const funds = wx.getStorageSync('funds') || [];
      const allHoldings = wx.getStorageSync('fund_holdings') || {};

      let totalCost = 0;
      let totalMarketValue = 0;
      let totalTodayPnl = 0;
      let hasHolding = false;

      funds.forEach(fund => {
        const holding = allHoldings[fund.code];
        if (!holding) return;

        const nav = parseFloat(fund.dwjz) || 0;
        if (nav === 0) return;

        // 计算份额与成本
        let shares = 0;
        let cost = 0;
        if (holding.mode === 'amount') {
          const costPrice = parseFloat(holding.costPrice) || nav;
          shares = (parseFloat(holding.amount) || 0) / costPrice;
          cost = parseFloat(holding.amount) || 0;
        } else {
          shares = parseFloat(holding.shares) || 0;
          const costPrice = parseFloat(holding.costPrice) || nav;
          cost = shares * costPrice;
        }

        const marketValue = shares * nav;
        totalCost += cost;
        totalMarketValue += marketValue;

        // 今日产蛋：份额 × 最新净值 × 估算日涨跌幅
        const gszzl = parseFloat(fund.gszzl) || 0;
        totalTodayPnl += marketValue * gszzl / 100;

        hasHolding = true;
      });

      const totalPnl = totalMarketValue - totalCost;
      const totalPnlRate = totalCost > 0 ? totalPnl / totalCost * 100 : 0;

      this.setData({
        fundCount: funds.length,
        hasPnlData: hasHolding,
        totalCost: totalCost.toFixed(2),
        todayPnl: totalTodayPnl,
        todayPnlStr: (totalTodayPnl >= 0 ? '+' : '') + totalTodayPnl.toFixed(2),
        totalPnl,
        totalPnlRateStr: (totalPnlRate >= 0 ? '+' : '') + totalPnlRate.toFixed(2) + '%'
      });
    } catch (error) {
      console.error('加载统计数据失败:', error);
    }
  },

  // 跳转到登录页
  goToLogin() {
    wx.navigateTo({
      url: '/pages/login/login'
    });
  },

  // 更新用户信息
  updateUserInfo() {
    wx.showModal({
      title: '更新用户信息',
      content: '需要重新授权获取您的微信昵称和头像',
      confirmText: '去更新',
      success: (res) => {
        if (res.confirm) {
          // 清除旧信息
          wx.removeStorageSync('userInfo');
          app.globalData.userInfo = null;
          app.globalData.hasUserInfo = false;
          
          // 跳转到登录页
          wx.navigateTo({
            url: '/pages/login/login'
          });
        }
      }
    });
  },

  // 数据同步
  handleSync() {
    if (!this.data.hasUserInfo) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '同步中...' });

    // 模拟同步
    setTimeout(() => {
      wx.hideLoading();
      wx.showToast({
        title: '同步成功',
        icon: 'success'
      });
    }, 1500);
  },

  // 清除缓存
  handleClearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除所有缓存数据吗?这将删除所有小鸡列表和设置。',
      confirmColor: '#D4A84B',
      success: (res) => {
        if (res.confirm) {
          try {
            // 保留用户登录信息
            const token = wx.getStorageSync('token');
            const userInfo = wx.getStorageSync('userInfo');
            const openid = wx.getStorageSync('openid');

            // 清除所有缓存
            wx.clearStorageSync();

            // 恢复登录信息
            if (token) wx.setStorageSync('token', token);
            if (userInfo) wx.setStorageSync('userInfo', userInfo);
            if (openid) wx.setStorageSync('openid', openid);

            wx.showToast({
              title: '清除成功',
              icon: 'success'
            });

            // 刷新统计数据
            this.loadFundStats();
          } catch (error) {
            wx.showToast({
              title: '清除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 关于我们
  handleAbout() {
    wx.showModal({
      title: '关于咕咕看板',
      content: '咕咕看板是一款小鸡追踪小程序，帮助您轻松管理和追踪小鸡成长信息。\n\n版本: ' + this.data.version + '\n\n© 2025 咕咕看板团队',
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 退出登录
  handleLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗?',
      confirmColor: '#D4A84B',
      success: (res) => {
        if (res.confirm) {
          try {
            // 清除登录信息
            wx.removeStorageSync('token');
            wx.removeStorageSync('userInfo');
            wx.removeStorageSync('openid');

            // 清除全局数据
            app.globalData.userInfo = null;
            app.globalData.openid = null;
            app.globalData.hasUserInfo = false;

            wx.showToast({
              title: '已退出登录',
              icon: 'success'
            });

            // 刷新页面
            this.loadUserData();
          } catch (error) {
            wx.showToast({
              title: '退出失败',
              icon: 'none'
            });
          }
        }
      }
    });
  }
});
