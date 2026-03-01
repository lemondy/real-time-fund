// pages/index/index.js
import { searchFunds, fetchFullFundData, batchFetchFundData } from '../../utils/api';
import { getFunds, saveFunds, addFund, removeFund, updateFund, toggleFavorite as storageToggleFavorite, getSettings, saveSettings, getGroups, saveGroups, addGroup, removeGroup } from '../../utils/storage';
import { recordValuation, getAllValuationSeries, clearFund } from '../../utils/valuation-timeseries';
import { getIntradayChartConfig } from '../../utils/chart';

const app = getApp();

Page({
  data: {
    // 搜索相关
    searchKeyword: '',
    searchResults: [],
    
    // 基金列表
    allFunds: [],
    displayFunds: [],
    currentTab: 0, // 0: 全部, 1: 自选
    allCount: 0,
    favoriteCount: 0,
    
    // 分组相关
    groups: [],
    currentGroup: 'all', // all: 全部, default: 默认分组, 其他: 分组ID
    showGroupModal: false,
    
    // 估值分时数据
    valuationSeries: {},
    
    // 刷新相关
    refreshing: false,
    autoRefreshTimer: null,
    
    // 设置相关
    showSettings: false,
    settings: {
      autoRefresh: true,
      refreshInterval: 30,
      showHoldings: true,
      showIntraday: true // 是否显示分时图
    },
    refreshIntervals: [
      { value: 10, label: '10秒' },
      { value: 30, label: '30秒' },
      { value: 60, label: '1分钟' },
      { value: 120, label: '2分钟' },
      { value: 300, label: '5分钟' }
    ],
    refreshIntervalIndex: 1
  },

  onLoad() {
    this.loadSettings();
    this.loadGroups();
    this.loadFunds();
    this.loadValuationSeries();
  },

  onShow() {
    this.loadFunds();
    if (this.data.settings.autoRefresh) {
      this.startAutoRefresh();
    }
  },

  onHide() {
    this.stopAutoRefresh();
  },

  onUnload() {
    this.stopAutoRefresh();
  },

  // 加载设置
  loadSettings() {
    const settings = getSettings();
    const index = this.data.refreshIntervals.findIndex(
      item => item.value === settings.refreshInterval
    );
    
    this.setData({
      settings,
      refreshIntervalIndex: index >= 0 ? index : 1
    });
  },

  // 加载分组
  loadGroups() {
    const groups = getGroups();
    this.setData({ groups });
  },

  // 加载估值分时数据
  loadValuationSeries() {
    const valuationSeries = getAllValuationSeries();
    this.setData({ valuationSeries });
  },

  // 加载基金列表
  loadFunds() {
    const funds = getFunds();
    this.updateFundList(funds);
  },

  // 更新基金列表显示
  updateFundList(funds) {
    const favoriteCount = funds.filter(f => f.favorite).length;
    const displayFunds = this.data.currentTab === 0 
      ? funds 
      : funds.filter(f => f.favorite);

    this.setData({
      allFunds: funds,
      displayFunds,
      allCount: funds.length,
      favoriteCount
    });
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },

  // 执行搜索
  async handleSearch() {
    const keyword = this.data.searchKeyword.trim();
    
    if (!keyword) {
      this.setData({ searchResults: [] });
      return;
    }

    wx.showLoading({ title: '搜索中...' });

    try {
      const results = await searchFunds(keyword);
      this.setData({ searchResults: results });
      wx.hideLoading();
    } catch (error) {
      console.error('搜索失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '搜索失败',
        icon: 'none'
      });
    }
  },

  // 添加基金
  async handleAddFund(e) {
    const fund = e.currentTarget.dataset.fund;
    
    wx.showLoading({ title: '加载中...' });

    try {
      // 获取完整的基金数据
      const fullData = await fetchFullFundData(fund.code);
      
      // 添加到本地存储
      const success = addFund(fullData);
      
      wx.hideLoading();

      if (success) {
        wx.showToast({
          title: '添加成功',
          icon: 'success'
        });

        // 清空搜索
        this.setData({
          searchKeyword: '',
          searchResults: []
        });

        // 刷新列表
        this.loadFunds();
      }
    } catch (error) {
      console.error('添加基金失败:', error);
      wx.hideLoading();
      wx.showToast({
        title: '添加失败，请重试',
        icon: 'none'
      });
    }
  },

  // 切换Tab
  switchTab(e) {
    const tab = parseInt(e.currentTarget.dataset.tab);
    const displayFunds = tab === 0 
      ? this.data.allFunds 
      : this.data.allFunds.filter(f => f.favorite);

    this.setData({
      currentTab: tab,
      displayFunds
    });
  },

  // 刷新数据
  async handleRefresh() {
    if (this.data.refreshing) return;

    this.setData({ refreshing: true });

    try {
      const funds = getFunds();
      
      if (funds.length === 0) {
        this.setData({ refreshing: false });
        return;
      }

      // 批量获取基金数据
      const codes = funds.map(f => f.code);
      const updatedData = await batchFetchFundData(codes);

      // 记录估值分时数据
      const nextSeries = {};
      updatedData.forEach(data => {
        if (!data.error && data.gsz != null) {
          nextSeries[data.code] = recordValuation(data.code, {
            gsz: data.gsz,
            gztime: data.gztime
          });
        }
      });

      // 更新估值分时状态
      if (Object.keys(nextSeries).length > 0) {
        this.setData({
          valuationSeries: {
            ...this.data.valuationSeries,
            ...nextSeries
          }
        });
      }

      // 更新本地存储
      updatedData.forEach(data => {
        if (!data.error) {
          updateFund(data.code, {
            ...data,
            favorite: funds.find(f => f.code === data.code)?.favorite || false,
            showHoldings: funds.find(f => f.code === data.code)?.showHoldings || false
          });
        }
      });

      // 刷新显示
      this.loadFunds();

      wx.showToast({
        title: '刷新成功',
        icon: 'success',
        duration: 1500
      });
    } catch (error) {
      console.error('刷新失败:', error);
      wx.showToast({
        title: '刷新失败',
        icon: 'none'
      });
    } finally {
      this.setData({ refreshing: false });
    }
  },

  // 开始自动刷新
  startAutoRefresh() {
    this.stopAutoRefresh();
    
    const interval = this.data.settings.refreshInterval * 1000;
    
    this.autoRefreshTimer = setInterval(() => {
      this.handleRefresh();
    }, interval);
  },

  // 停止自动刷新
  stopAutoRefresh() {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  },

  // 切换自选
  toggleFavorite(e) {
    const code = e.currentTarget.dataset.code;
    storageToggleFavorite(code);
    this.loadFunds();
  },

  // 确认删除
  confirmDelete(e) {
    const code = e.currentTarget.dataset.code;
    const fund = this.data.allFunds.find(f => f.code === code);

    wx.showModal({
      title: '删除基金',
      content: `确定要删除 ${fund.name} 吗?`,
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          this.handleDelete(code);
        }
      }
    });
  },

  // 删除基金
  handleDelete(code) {
    removeFund(code);
    
    // 删除估值分时数据
    clearFund(code);
    const valuationSeries = { ...this.data.valuationSeries };
    delete valuationSeries[code];
    this.setData({ valuationSeries });
    
    this.loadFunds();
    
    wx.showToast({
      title: '删除成功',
      icon: 'success'
    });
  },

  // 切换持仓显示
  toggleHoldings(e) {
    const code = e.currentTarget.dataset.code;
    const fund = this.data.allFunds.find(f => f.code === code);
    
    updateFund(code, {
      showHoldings: !fund.showHoldings
    });
    
    this.loadFunds();
  },

  // 显示基金详情
  showFundDetail(e) {
    const fund = e.currentTarget.dataset.fund;
    
    wx.showModal({
      title: fund.name,
      content: `基金代码: ${fund.code}\n单位净值: ${fund.dwjz || '--'}\n估算净值: ${fund.gsz || '--'}\n涨跌幅: ${fund.gszzl > 0 ? '+' : ''}${fund.gszzl}%\n净值日期: ${fund.jzrq || '--'}\n更新时间: ${fund.gztime || '--'}`,
      showCancel: false
    });
  },

  // 显示设置弹窗
  showSettingsModal() {
    this.setData({ showSettings: true });
  },

  // 隐藏设置弹窗
  hideSettingsModal() {
    this.setData({ showSettings: false });
  },

  // 防止弹窗关闭
  preventClose() {
    // 阻止事件冒泡
  },

  // 切换自动刷新
  toggleAutoRefresh(e) {
    const autoRefresh = e.detail.value;
    const settings = { ...this.data.settings, autoRefresh };
    
    this.setData({ settings });
    saveSettings(settings);

    if (autoRefresh) {
      this.startAutoRefresh();
    } else {
      this.stopAutoRefresh();
    }
  },

  // 更改刷新间隔
  changeRefreshInterval(e) {
    const index = parseInt(e.detail.value);
    const interval = this.data.refreshIntervals[index].value;
    
    const settings = { 
      ...this.data.settings, 
      refreshInterval: interval 
    };

    this.setData({ 
      settings,
      refreshIntervalIndex: index 
    });
    
    saveSettings(settings);

    // 重启自动刷新
    if (settings.autoRefresh) {
      this.startAutoRefresh();
    }
  },

  // 切换默认展开持仓
  toggleShowHoldings(e) {
    const showHoldings = e.detail.value;
    const settings = { ...this.data.settings, showHoldings };
    
    this.setData({ settings });
    saveSettings(settings);
  },

  // 切换显示分时图
  toggleShowIntraday(e) {
    const showIntraday = e.detail.value;
    const settings = { ...this.data.settings, showIntraday };
    
    this.setData({ settings });
    saveSettings(settings);
  },

  // 获取分时图配置
  getIntradayChartData(fund) {
    const series = this.data.valuationSeries[fund.code];
    if (!series || series.length < 2) return null;
    
    return getIntradayChartConfig(series, fund.dwjz);
  }
});
