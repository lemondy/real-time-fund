// utils/valuation-timeseries.js - 估值分时数据管理

const STORAGE_KEY = 'fundValuationTimeseries';

/**
 * 获取存储的所有分时数据
 */
function getStored() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch (error) {
    console.error('获取分时数据失败:', error);
    return {};
  }
}

/**
 * 保存分时数据
 */
function setStored(data) {
  try {
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('保存分时数据失败:', error);
  }
}

/**
 * 从 gztime 获取日期字符串 YYYY-MM-DD
 */
function toDateStr(gztimeOrNow) {
  if (typeof gztimeOrNow === 'string' && /^\d{4}-\d{2}-\d{2}/.test(gztimeOrNow)) {
    return gztimeOrNow.slice(0, 10);
  }
  
  try {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (error) {
    return null;
  }
}

/**
 * 记录一条估值数据
 * @param {string} code - 基金代码
 * @param {Object} payload - { gsz, gztime }
 * @returns {Array} 该基金当前分时序列
 */
export function recordValuation(code, payload) {
  const value = payload?.gsz != null ? Number(payload.gsz) : NaN;
  if (!Number.isFinite(value)) return getValuationSeries(code);

  const gztime = payload?.gztime ?? null;
  const dateStr = toDateStr(gztime);
  if (!dateStr) return getValuationSeries(code);

  // 提取时间部分 HH:mm
  const timeLabel = typeof gztime === 'string' && gztime.length > 10
    ? gztime.slice(11, 16)
    : (() => {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      })();

  const newPoint = { time: timeLabel, value, date: dateStr };

  const all = getStored();
  const list = Array.isArray(all[code]) ? all[code] : [];

  // 找出已存储的最新日期
  const existingDates = list.map(p => p.date).filter(Boolean);
  const latestStoredDate = existingDates.length 
    ? existingDates.reduce((a, b) => (a > b ? a : b), '') 
    : '';

  let nextList;
  
  if (dateStr > latestStoredDate) {
    // 新日期，清空旧数据，只保留新的这一条
    nextList = [newPoint];
  } else if (dateStr === latestStoredDate) {
    // 同一天，检查是否已有相同时间的数据
    const hasSameTime = list.some(p => p.time === timeLabel);
    if (hasSameTime) return list;
    nextList = [...list, newPoint];
  } else {
    // 旧日期，不记录
    return list;
  }

  all[code] = nextList;
  setStored(all);
  return nextList;
}

/**
 * 获取某基金的分时序列
 * @param {string} code - 基金代码
 * @returns {Array} 分时数据数组
 */
export function getValuationSeries(code) {
  const all = getStored();
  const list = Array.isArray(all[code]) ? all[code] : [];
  return list;
}

/**
 * 删除某基金的全部分时数据
 * @param {string} code - 基金代码
 */
export function clearFund(code) {
  const all = getStored();
  if (!(code in all)) return;
  
  const next = { ...all };
  delete next[code];
  setStored(next);
}

/**
 * 获取全部分时数据
 * @returns {Object} 所有基金的分时数据
 */
export function getAllValuationSeries() {
  return getStored();
}

/**
 * 清空所有分时数据
 */
export function clearAllValuationSeries() {
  try {
    wx.removeStorageSync(STORAGE_KEY);
  } catch (error) {
    console.error('清空分时数据失败:', error);
  }
}
