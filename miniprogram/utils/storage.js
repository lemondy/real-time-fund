// utils/storage.js - 本地存储工具类

/**
 * 保存基金列表
 * @param {Array} funds - 基金列表
 */
export const saveFunds = (funds) => {
  try {
    wx.setStorageSync('funds', funds);
    return true;
  } catch (error) {
    console.error('保存基金列表失败:', error);
    return false;
  }
};

/**
 * 获取基金列表
 * @returns {Array} 基金列表
 */
export const getFunds = () => {
  try {
    return wx.getStorageSync('funds') || [];
  } catch (error) {
    console.error('获取基金列表失败:', error);
    return [];
  }
};

/**
 * 添加基金
 * @param {Object} fund - 基金数据
 * @returns {boolean} 是否成功
 */
export const addFund = (fund) => {
  try {
    const funds = getFunds();
    
    // 检查是否已存在
    const exists = funds.some(f => f.code === fund.code);
    if (exists) {
      wx.showToast({
        title: '基金已存在',
        icon: 'none'
      });
      return false;
    }
    
    funds.push({
      ...fund,
      addTime: Date.now(),
      favorite: false
    });
    
    saveFunds(funds);
    return true;
  } catch (error) {
    console.error('添加基金失败:', error);
    return false;
  }
};

/**
 * 删除基金
 * @param {string} code - 基金代码
 * @returns {boolean} 是否成功
 */
export const removeFund = (code) => {
  try {
    const funds = getFunds();
    const newFunds = funds.filter(f => f.code !== code);
    saveFunds(newFunds);
    return true;
  } catch (error) {
    console.error('删除基金失败:', error);
    return false;
  }
};

/**
 * 更新基金数据
 * @param {string} code - 基金代码
 * @param {Object} data - 更新的数据
 * @returns {boolean} 是否成功
 */
export const updateFund = (code, data) => {
  try {
    const funds = getFunds();
    const index = funds.findIndex(f => f.code === code);
    
    if (index >= 0) {
      funds[index] = {
        ...funds[index],
        ...data,
        updateTime: Date.now()
      };
      saveFunds(funds);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('更新基金失败:', error);
    return false;
  }
};

/**
 * 切换自选状态
 * @param {string} code - 基金代码
 * @returns {boolean} 是否成功
 */
export const toggleFavorite = (code) => {
  try {
    const funds = getFunds();
    const index = funds.findIndex(f => f.code === code);
    
    if (index >= 0) {
      funds[index].favorite = !funds[index].favorite;
      saveFunds(funds);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('切换自选失败:', error);
    return false;
  }
};

/**
 * 保存设置
 * @param {Object} settings - 设置对象
 */
export const saveSettings = (settings) => {
  try {
    wx.setStorageSync('settings', settings);
    return true;
  } catch (error) {
    console.error('保存设置失败:', error);
    return false;
  }
};

/**
 * 获取设置
 * @returns {Object} 设置对象
 */
export const getSettings = () => {
  try {
    return wx.getStorageSync('settings') || {
      refreshInterval: 30, // 默认30秒刷新一次
      autoRefresh: true,
      showHoldings: true
    };
  } catch (error) {
    console.error('获取设置失败:', error);
    return {
      refreshInterval: 30,
      autoRefresh: true,
      showHoldings: true
    };
  }
};

/**
 * 清除所有数据
 */
export const clearAllData = () => {
  try {
    // 保留用户登录信息
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    const openid = wx.getStorageSync('openid');
    
    wx.clearStorageSync();
    
    // 恢复登录信息
    if (token) wx.setStorageSync('token', token);
    if (userInfo) wx.setStorageSync('userInfo', userInfo);
    if (openid) wx.setStorageSync('openid', openid);
    
    return true;
  } catch (error) {
    console.error('清除数据失败:', error);
    return false;
  }
};

/**
 * 获取分组列表
 * @returns {Array} 分组列表
 */
export const getGroups = () => {
  try {
    return wx.getStorageSync('groups') || [{ id: 'default', name: '默认分组' }];
  } catch (error) {
    console.error('获取分组列表失败:', error);
    return [{ id: 'default', name: '默认分组' }];
  }
};

/**
 * 保存分组列表
 * @param {Array} groups - 分组列表
 */
export const saveGroups = (groups) => {
  try {
    wx.setStorageSync('groups', groups);
    return true;
  } catch (error) {
    console.error('保存分组列表失败:', error);
    return false;
  }
};

/**
 * 添加分组
 * @param {string} name - 分组名称
 * @returns {Object} 新分组对象
 */
export const addGroup = (name) => {
  try {
    const groups = getGroups();
    const newGroup = {
      id: 'group_' + Date.now(),
      name: name,
      order: groups.length
    };
    groups.push(newGroup);
    saveGroups(groups);
    return newGroup;
  } catch (error) {
    console.error('添加分组失败:', error);
    return null;
  }
};

/**
 * 删除分组
 * @param {string} groupId - 分组ID
 */
export const removeGroup = (groupId) => {
  try {
    if (groupId === 'default') {
      wx.showToast({ title: '默认分组不能删除', icon: 'none' });
      return false;
    }
    
    const groups = getGroups();
    const newGroups = groups.filter(g => g.id !== groupId);
    saveGroups(newGroups);
    
    // 将该分组下的基金移到默认分组
    const funds = getFunds();
    funds.forEach(fund => {
      if (fund.groupId === groupId) {
        updateFund(fund.code, { groupId: 'default' });
      }
    });
    
    return true;
  } catch (error) {
    console.error('删除分组失败:', error);
    return false;
  }
};
