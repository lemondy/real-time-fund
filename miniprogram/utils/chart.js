// utils/chart.js - 图表工具函数

/**
 * 为图表生成渐变色
 * @param {Object} ctx - Canvas 2D 上下文
 * @param {string} color - 基础颜色
 * @param {number} height - 图表高度
 * @returns {CanvasGradient} 渐变对象
 */
export function createGradient(ctx, color, height = 150) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `${color}4D`); // 30% opacity
  gradient.addColorStop(1, `${color}00`); // 0% opacity
  return gradient;
}

/**
 * 格式化百分比
 * @param {number} value - 数值
 * @param {number} decimals - 小数位数
 * @returns {string} 格式化后的字符串
 */
export function formatPercent(value, decimals = 2) {
  if (value == null || isNaN(value)) return '--';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * 根据涨跌获取颜色 - 中国标准：红涨绿跌
 * @param {number} value - 数值
 * @returns {string} 颜色值
 */
export function getChangeColor(value) {
  if (value > 0) return '#D32F2F'; // 朱红（涨）
  if (value < 0) return '#388E3C'; // 墨绿（跌）
  return '#999999'; // 平灰
}

/**
 * 计算涨跌幅数据
 * @param {Array} series - 原始数据 [{ time, value }]
 * @param {number} referenceValue - 参考值（如单位净值）
 * @returns {Array} 涨跌幅数据
 */
export function calculateChangePercent(series, referenceValue) {
  if (!series || series.length === 0) return [];
  
  const ref = referenceValue != null && !isNaN(referenceValue)
    ? referenceValue
    : series[0]?.value;
  
  if (!ref) return [];
  
  return series.map(item => {
    const percent = ((item.value - ref) / ref) * 100;
    return {
      ...item,
      percent: percent
    };
  });
}

/**
 * 获取图表配置 - 专业金融配色，支持渐变填充
 * @param {Object} options - 配置选项
 * @returns {Object} 图表配置对象
 */
export function getIntradayChartConfig(series = [], referenceNav) {
  if (!series || series.length === 0) {
    return null;
  }

  const data = calculateChangePercent(series, referenceNav);
  const times = data.map(d => d.time);
  const percents = data.map(d => d.percent);
  
  const lastPercent = percents[percents.length - 1] || 0;
  // 中国标准：红涨绿跌
  const lineColor = lastPercent >= 0 ? '#D32F2F' : '#388E3C';
  // 使用半透明渐变填充，增强专业感
  const areaColor = lastPercent >= 0 
    ? 'rgba(211, 47, 47, 0.15)' // 浅朱红渐变
    : 'rgba(56, 142, 60, 0.15)'; // 浅墨绿渐变

  return {
    categories: times,
    data: percents,
    lineColor: lineColor,
    areaColor: areaColor,
    minValue: Math.min(...percents),
    maxValue: Math.max(...percents)
  };
}

/**
 * 生成趋势图数据 - 专业金融配色
 * @param {Array} historyData - 历史净值数据
 * @returns {Object} 图表配置
 */
export function getTrendChartConfig(historyData = []) {
  if (!historyData || historyData.length === 0) {
    return null;
  }

  const dates = historyData.map(d => d.date);
  const values = historyData.map(d => d.value);
  
  const firstValue = values[0];
  const lastValue = values[values.length - 1];
  const change = ((lastValue - firstValue) / firstValue) * 100;
  
  // 中国标准：红涨绿跌
  const lineColor = change >= 0 ? '#D32F2F' : '#388E3C';
  const areaColor = change >= 0 
    ? 'rgba(211, 47, 47, 0.15)' 
    : 'rgba(56, 142, 60, 0.15)';

  return {
    categories: dates,
    data: values,
    lineColor: lineColor,
    areaColor: areaColor,
    change: change
  };
}

/**
 * 简化图表数据（减少数据点）
 * @param {Array} data - 原始数据
 * @param {number} maxPoints - 最大数据点数
 * @returns {Array} 简化后的数据
 */
export function simplifyChartData(data, maxPoints = 100) {
  if (!data || data.length <= maxPoints) return data;
  
  const step = Math.ceil(data.length / maxPoints);
  const simplified = [];
  
  for (let i = 0; i < data.length; i += step) {
    simplified.push(data[i]);
  }
  
  // 确保包含最后一个点
  if (simplified[simplified.length - 1] !== data[data.length - 1]) {
    simplified.push(data[data.length - 1]);
  }
  
  return simplified;
}
