// utils/cloud-sync.js
// 小程序侧云同步工具：通过自有后端写入 Supabase，避免在客户端暴露 service key

const getServerUrl = () => {
  const app = getApp();
  return app?.globalData?.serverUrl || '';
};

const request = ({ method = 'GET', path = '', data = null }) =>
  new Promise((resolve, reject) => {
    const base = getServerUrl();
    if (!base) {
      resolve({ skipped: true, message: '未配置 serverUrl' });
      return;
    }

    const token = wx.getStorageSync('token') || '';
    const url = `${base}${path}`;

    wx.request({
      url,
      method,
      data,
      header: {
        'content-type': 'application/json',
        Authorization: token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        const status = res.statusCode || 500;
        if (status >= 200 && status < 300) {
          resolve(res.data || {});
          return;
        }
        reject(new Error((res.data && res.data.message) || `请求失败(${status})`));
      },
      fail: reject
    });
  });

export const buildSummaryFromLocal = () => {
  const funds = wx.getStorageSync('funds') || [];
  const allHoldings = wx.getStorageSync('fund_holdings') || {};

  let totalCost = 0;
  let totalMarketValue = 0;
  let totalTodayPnl = 0;
  let holdingCount = 0;

  funds.forEach((fund) => {
    const holding = allHoldings[fund.code];
    if (!holding) return;

    const nav = parseFloat(fund.dwjz) || 0;
    if (!nav) return;

    let shares = 0;
    let cost = 0;
    const costPrice = parseFloat(holding.costPrice) || nav;

    if (holding.mode === 'amount') {
      const amount = parseFloat(holding.amount) || 0;
      shares = costPrice > 0 ? amount / costPrice : 0;
      cost = amount;
    } else {
      shares = parseFloat(holding.shares) || 0;
      cost = shares * costPrice;
    }

    const marketValue = shares * nav;
    totalCost += cost;
    totalMarketValue += marketValue;
    holdingCount += 1;

    const gszzl = parseFloat(fund.gszzl) || 0;
    totalTodayPnl += (marketValue * gszzl) / 100;
  });

  const totalPnl = totalMarketValue - totalCost;
  const totalPnlRate = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const favoriteCount = funds.filter((f) => !!f.favorite).length;

  return {
    fundCount: funds.length,
    favoriteCount,
    holdingCount,
    totalCost: Number(totalCost.toFixed(2)),
    totalMarketValue: Number(totalMarketValue.toFixed(2)),
    todayPnl: Number(totalTodayPnl.toFixed(2)),
    totalPnl: Number(totalPnl.toFixed(2)),
    totalPnlRate: Number(totalPnlRate.toFixed(2))
  };
};

const getCommonPayload = () => {
  const openid = wx.getStorageSync('openid') || '';
  const userInfo = wx.getStorageSync('userInfo') || null;
  return { openid, userInfo };
};

const buildFundRows = () => {
  const funds = wx.getStorageSync('funds') || [];
  return funds.map((f, idx) => ({
    fundCode: f.code,
    fundName: f.name || '',
    favorite: !!f.favorite,
    groupId: f.groupId || 'default',
    sortOrder: typeof f.order === 'number' ? f.order : idx,
    addTime: f.addTime || null,
    updateTime: f.updateTime || null
  }));
};

const buildHoldingRows = () => {
  const allHoldings = wx.getStorageSync('fund_holdings') || {};
  return Object.keys(allHoldings).map((code) => {
    const h = allHoldings[code] || {};
    return {
      fundCode: code,
      mode: h.mode || 'amount',
      amount: h.amount === '' || h.amount == null ? null : Number(h.amount),
      shares: h.shares === '' || h.shares == null ? null : Number(h.shares),
      costPrice: h.costPrice === '' || h.costPrice == null ? null : Number(h.costPrice),
      firstBuyDate: h.firstBuyDate || null,
      updatedAt: Date.now()
    };
  });
};

// 全量同步（推荐在登录后、手动同步按钮触发）
export const syncAllFromLocal = async () => {
  const { openid, userInfo } = getCommonPayload();
  if (!openid) throw new Error('缺少 openid，请先登录');

  const payload = {
    openid,
    userInfo,
    funds: buildFundRows(),
    holdings: buildHoldingRows(),
    summary: buildSummaryFromLocal(),
    clientSyncAt: Date.now()
  };

  return request({
    method: 'POST',
    path: '/api/sync/full',
    data: payload
  });
};

// 从云端拉取并覆盖本地（建议在“切换设备首次登录”时触发）
export const pullAllToLocal = async () => {
  const { openid } = getCommonPayload();
  if (!openid) throw new Error('缺少 openid，请先登录');

  const result = await request({
    method: 'GET',
    path: `/api/sync/full?openid=${encodeURIComponent(openid)}`
  });

  if (!result || result.skipped) return result;

  const funds = (result.funds || []).map((row) => ({
    code: row.fund_code || row.fundCode,
    name: row.fund_name || row.fundName,
    favorite: !!(row.favorite),
    groupId: row.group_id || row.groupId || 'default',
    order: row.sort_order || row.sortOrder || 0,
    addTime: row.add_time || row.addTime || null,
    updateTime: row.updated_at || row.updateTime || null
  }));

  const holdings = {};
  (result.holdings || []).forEach((row) => {
    const code = row.fund_code || row.fundCode;
    if (!code) return;
    holdings[code] = {
      mode: row.mode || 'amount',
      amount: row.amount == null ? '' : String(row.amount),
      shares: row.shares == null ? '' : String(row.shares),
      costPrice: row.cost_price == null ? '' : String(row.cost_price || row.costPrice),
      firstBuyDate: row.first_buy_date || row.firstBuyDate || ''
    };
  });

  wx.setStorageSync('funds', funds);
  wx.setStorageSync('fund_holdings', holdings);
  return result;
};

// ===== 单项 CRUD（便于后续在新增/删除/收藏时做增量同步） =====
export const upsertFundRemote = async (fund) => {
  const { openid } = getCommonPayload();
  if (!openid) throw new Error('缺少 openid，请先登录');
  return request({
    method: 'POST',
    path: '/api/sync/funds/upsert',
    data: { openid, fund }
  });
};

export const deleteFundRemote = async (fundCode) => {
  const { openid } = getCommonPayload();
  if (!openid) throw new Error('缺少 openid，请先登录');
  return request({
    method: 'DELETE',
    path: `/api/sync/funds/${encodeURIComponent(fundCode)}?openid=${encodeURIComponent(openid)}`
  });
};

export const upsertHoldingRemote = async (holding) => {
  const { openid } = getCommonPayload();
  if (!openid) throw new Error('缺少 openid，请先登录');
  return request({
    method: 'POST',
    path: '/api/sync/holdings/upsert',
    data: { openid, holding }
  });
};

export const deleteHoldingRemote = async (fundCode) => {
  const { openid } = getCommonPayload();
  if (!openid) throw new Error('缺少 openid，请先登录');
  return request({
    method: 'DELETE',
    path: `/api/sync/holdings/${encodeURIComponent(fundCode)}?openid=${encodeURIComponent(openid)}`
  });
};

export const upsertSummaryRemote = async () => {
  const { openid } = getCommonPayload();
  if (!openid) throw new Error('缺少 openid，请先登录');
  return request({
    method: 'POST',
    path: '/api/sync/portfolio/upsert',
    data: { openid, summary: buildSummaryFromLocal() }
  });
};
