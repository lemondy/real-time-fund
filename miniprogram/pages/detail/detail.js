// pages/detail/detail.js
import { getFunds } from '../../utils/storage';
import { getHolding, saveHolding, deleteHolding } from '../../utils/storage';
import { fetchNavHistory } from '../../utils/api';

// 图表内边距 (px)
const CP = { top: 22, right: 12, bottom: 30, left: 54 };
const CH = 200; // canvas 高度 (px)

// value = 向前追溯的自然天数（传给 fetchNavHistory 的 days 参数）
const PERIODS = [
  { value: 45,   label: '近1月', short: '1月' },
  { value: 100,  label: '近3月', short: '3月' },
  { value: 200,  label: '近6月', short: '6月' },
  { value: 400,  label: '近1年', short: '1年' },
  { value: 1200, label: '近3年', short: '3年' },
  { value: 9999, label: '成立来', short: '全部' }
];

Page({
  // 实例变量（不需要响应式）
  _code: '',
  _cw: 0,        // 图表宽度 (px)
  _data: null,   // 图表数据（从旧到新）
  _meta: null,   // 坐标映射元数据
  _tf: false,    // touch 节流标志

  data: {
    fund: {},
    gztimeShort: '',
    yesterdayChangeStr: '--',
    historyList: [],
    historyAll: [],
    loading: false,
    chartWidth: 0,
    periods: PERIODS,
    currentPeriod: 100,
    periodChange: 0,
    periodChangeStr: '--',
    periodShort: '3月',
    crosshairInfo: null,   // { date, nav, changeStr, change } | null

    // 持仓相关
    holdingInfo: null,     // 存储的持仓数据
    holdingStats: null,    // 计算后的持仓统计
    showHoldingModal: false,
    holdingMode: 'amount', // 'amount' | 'shares'
    holdingDateMode: 'date', // 'date' | 'days'
    holdingForm: {
      amount: '',
      shares: '',
      costPrice: '',
      firstBuyDate: '',
      days: ''
    }
  },

  onLoad(options) {
    const { code } = options;
    if (!code) return;
    this._code = code;

    const funds = getFunds();
    const fund = funds.find(f => f.code === code) || { code };
    this.setData({ fund });

    if (fund.gztime) {
      const m = fund.gztime.match(/(\d{4}-)?(\d{2}-\d{2})\s+(\d{2}:\d{2})/);
      this.setData({ gztimeShort: m ? `${m[2]} ${m[3]}` : fund.gztime });
    }

    // 加载持仓数据
    const holdingInfo = getHolding(code);
    if (holdingInfo) {
      this.setData({ holdingInfo, holdingMode: holdingInfo.mode || 'amount' });
      this._computeHoldingStats(holdingInfo, fund);
    }
  },

  onReady() {
    // onReady 时页面已渲染完毕，用 selectorQuery 获取精确宽度
    const query = wx.createSelectorQuery();
    query.select('.chart-wrap').boundingClientRect();
    query.exec(res => {
      let cw = 0;
      if (res && res[0]) {
        cw = Math.floor(res[0].width);
      } else {
        // fallback：系统宽度 - 容器 padding(20rpx×2) - section padding(30rpx×2)
        const { windowWidth } = wx.getSystemInfoSync();
        cw = Math.floor(windowWidth * 650 / 750);
      }
      this._cw = cw;
    this.setData({ chartWidth: cw }, () => {
      this.loadHistory(100);
    });
    });
  },

  // ── 数据加载 ─────────────────────────────────────────────────

  async loadHistory(per) {
    if (!this._code) return;
    this.setData({ loading: true, crosshairInfo: null });

    const list = await fetchNavHistory(this._code, per);

    const yc = (list.length > 0 && list[0].change != null) ? list[0].change : null;
    const periodChange = this._calcChange(list);
    const cfg = PERIODS.find(p => p.value === per) || PERIODS[1];

    this.setData({
      historyAll: list,
      historyList: list.slice(0, 20),
      loading: false,
      yesterdayChangeStr: yc != null ? (yc > 0 ? '+' : '') + yc + '%' : '--',
      periodChange,
      periodChangeStr: Math.abs(periodChange).toFixed(2) + '%',
      periodShort: cfg.short
    }, () => {
      // setData 渲染完成后绘图，避免 canvas 未刷新导致无效
      this._data = [...list].reverse();
      this._drawChart(null);
    });
  },

  _calcChange(list) {
    if (list.length < 2) return 0;
    const oldest = list[list.length - 1].nav;
    const newest = list[0].nav;
    if (!oldest) return 0;
    return parseFloat(((newest - oldest) / oldest * 100).toFixed(2));
  },

  switchPeriod(e) {
    const per = parseInt(e.currentTarget.dataset.period);
    this.setData({ currentPeriod: per });
    this.loadHistory(per);
  },

  loadMoreHistory() {
    const { historyAll, historyList } = this.data;
    const next = Math.min(historyList.length + 20, historyAll.length);
    if (next > historyList.length) {
      this.setData({ historyList: historyAll.slice(0, next) });
    }
  },

  // ── 图表绘制 ─────────────────────────────────────────────────

  /**
   * ch = { lx, ly, idx } 时绘制十字线；null 时只绘基础图
   */
  _drawChart(ch) {
    const data = this._data;
    const cw = this._cw;
    if (!data || !data.length || !cw) return;

    const navs = data.map(d => d.nav);
    const minNav = Math.min(...navs);
    const maxNav = Math.max(...navs);
    const navRange = (maxNav - minNav) || 0.001;
    const iw = cw - CP.left - CP.right;
    const ih = CH - CP.top - CP.bottom;

    const gx = i => CP.left + (iw / Math.max(data.length - 1, 1)) * i;
    const gy = v => CP.top + ih - ((v - minNav) / navRange) * ih;

    this._meta = { data, minNav, navRange, iw, ih, gx, gy };

    const ctx = wx.createCanvasContext('historyChart', this);
    ctx.clearRect(0, 0, cw, CH);

    const isRise = navs[data.length - 1] >= navs[0];
    const lineColor = isRise ? '#D32F2F' : '#388E3C';

    // 网格线
    ctx.setLineWidth(0.5);
    ctx.setStrokeStyle('rgba(212,168,75,0.08)');
    for (let i = 0; i <= 4; i++) {
      const y = CP.top + (ih / 4) * i;
      ctx.beginPath(); ctx.moveTo(CP.left, y); ctx.lineTo(CP.left + iw, y); ctx.stroke();
    }

    // Y 轴标签
    ctx.setFontSize(9);
    ctx.setFillStyle('rgba(255,255,255,0.4)');
    ctx.setTextAlign('right');
    for (let i = 0; i <= 4; i++) {
      const v = maxNav - (navRange / 4) * i;
      ctx.fillText(v.toFixed(4), CP.left - 3, CP.top + (ih / 4) * i + 4);
    }

    // X 轴标签
    ctx.setTextAlign('center');
    const step = Math.max(1, Math.ceil(data.length / 6));
    for (let i = 0; i < data.length; i += step) {
      ctx.fillText(data[i].date.substring(5), gx(i), CH - 3);
    }

    // 面积渐变
    const grad = ctx.createLinearGradient(0, CP.top, 0, CP.top + ih);
    grad.addColorStop(0, isRise ? 'rgba(211,47,47,0.28)' : 'rgba(56,142,60,0.28)');
    grad.addColorStop(1, isRise ? 'rgba(211,47,47,0.02)' : 'rgba(56,142,60,0.02)');
    ctx.beginPath();
    data.forEach((d, i) => {
      i === 0 ? ctx.moveTo(gx(i), gy(d.nav)) : ctx.lineTo(gx(i), gy(d.nav));
    });
    ctx.lineTo(gx(data.length - 1), CP.top + ih);
    ctx.lineTo(CP.left, CP.top + ih);
    ctx.closePath();
    ctx.setFillStyle(grad);
    ctx.fill();

    // 折线
    ctx.beginPath();
    data.forEach((d, i) => {
      i === 0 ? ctx.moveTo(gx(i), gy(d.nav)) : ctx.lineTo(gx(i), gy(d.nav));
    });
    ctx.setStrokeStyle(lineColor);
    ctx.setLineWidth(1.5);
    ctx.stroke();

    // ── 十字线 ───────────────────────────────────────────────
    if (ch) {
      const item = data[ch.idx];
      const { lx, ly } = ch;

      ctx.setStrokeStyle('rgba(212,168,75,0.8)');
      ctx.setLineWidth(1);

      // 竖虚线
      this._dashLine(ctx, lx, CP.top, lx, CP.top + ih);
      // 横虚线
      this._dashLine(ctx, CP.left, ly, CP.left + iw, ly);

      // 交叉点圆点
      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.setFillStyle(lineColor);
      ctx.fill();
      ctx.setStrokeStyle('rgba(255,255,255,0.9)');
      ctx.setLineWidth(1.5);
      ctx.stroke();

      // Y 轴标签（左侧金色背景小牌）
      const navStr = item.nav.toFixed(4);
      const yl = Math.max(CP.top + 9, Math.min(CP.top + ih - 9, ly));
      ctx.setFillStyle('rgba(212,168,75,0.95)');
      ctx.fillRect(1, yl - 9, CP.left - 3, 18);
      ctx.setFontSize(9);
      ctx.setFillStyle('#1A1510');
      ctx.setTextAlign('right');
      ctx.fillText(navStr, CP.left - 4, yl + 4);

      // X 轴标签（底部金色背景小牌）
      const dateStr = item.date.substring(5);
      const xl = Math.max(24, Math.min(cw - 24, lx));
      ctx.setFillStyle('rgba(212,168,75,0.95)');
      ctx.fillRect(xl - 24, CP.top + ih + 2, 48, 16);
      ctx.setFontSize(9);
      ctx.setFillStyle('#1A1510');
      ctx.setTextAlign('center');
      ctx.fillText(dateStr, xl, CP.top + ih + 13);
    }

    ctx.draw();
  },

  /**
   * 手动绘制虚线（兼容所有基础库版本）
   */
  _dashLine(ctx, x1, y1, x2, y2, dash = 4, gap = 4) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (!len) return;
    const ux = dx / len, uy = dy / len;
    let pos = 0, draw = true;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    while (pos < len) {
      const seg = draw ? dash : gap;
      pos = Math.min(pos + seg, len);
      const cx = x1 + ux * pos, cy = y1 + uy * pos;
      draw ? ctx.lineTo(cx, cy) : ctx.moveTo(cx, cy);
      draw = !draw;
    }
    ctx.stroke();
  },

  // ── 触摸交互 ─────────────────────────────────────────────────

  onChartTouchStart(e) {
    this._onTouch(e);
  },

  onChartTouchMove(e) {
    // 节流：~60fps
    if (this._tf) return;
    this._tf = true;
    this._onTouch(e);
    setTimeout(() => { this._tf = false; }, 16);
  },

  onChartTouchEnd() {
    this.setData({ crosshairInfo: null });
    // 恢复无十字线的基础图
    this._drawChart(null);
  },

  _onTouch(e) {
    const m = this._meta;
    if (!m) return;
    const { data, iw, gx, gy } = m;

    // canvas 的 touch 坐标相对于 canvas 左上角
    const tx = e.touches[0].x;
    const relX = Math.max(0, Math.min(iw, tx - CP.left));
    const idx = Math.round((relX / iw) * Math.max(data.length - 1, 0));
    const si = Math.max(0, Math.min(idx, data.length - 1));
    const item = data[si];

    const lx = gx(si);
    const ly = gy(item.nav);

    const changeStr = item.change != null
      ? (item.change > 0 ? '+' : '') + item.change + '%'
      : '--';

    this.setData({
      crosshairInfo: {
        date: item.date,
        nav: item.nav.toFixed(4),
        change: item.change || 0,
        changeStr
      }
    });

    this._drawChart({ lx, ly, idx: si });
  },

  // ── 持仓功能 ─────────────────────────────────────────────────

  /** 打开设置持仓弹窗 */
  openHoldingModal() {
    const { holdingInfo, holdingMode } = this.data;
    const form = holdingInfo ? {
      amount:       String(holdingInfo.amount   || ''),
      shares:       String(holdingInfo.shares   || ''),
      costPrice:    String(holdingInfo.costPrice || ''),
      firstBuyDate: holdingInfo.firstBuyDate    || '',
      days:         ''
    } : { amount: '', shares: '', costPrice: '', firstBuyDate: '', days: '' };

    this.setData({
      showHoldingModal: true,
      holdingMode: holdingInfo?.mode || 'amount',
      holdingDateMode: 'date',
      holdingForm: form
    });
  },

  /** 关闭弹窗 */
  closeHoldingModal() {
    this.setData({ showHoldingModal: false }, () => {
      this._redrawAfterModalClose();
    });
  },

  /** canvas 由 wx:if 重新挂载后，重新查询宽度再绘图，确保坐标正确 */
  _redrawAfterModalClose() {
    if (!this._data || !this._data.length) return;
    // 用 setTimeout 保证 canvas 节点完成布局后再操作（nextTick 不够）
    setTimeout(() => {
      const query = wx.createSelectorQuery();
      query.select('.chart-wrap').boundingClientRect();
      query.exec(res => {
        if (res && res[0] && res[0].width > 0) {
          this._cw = Math.floor(res[0].width);
          this.setData({ chartWidth: this._cw }, () => {
            this._drawChart(null);
          });
        } else {
          this._drawChart(null);
        }
      });
    }, 100);
  },

  /** 阻止点击弹窗内部时关闭 */
  preventModalClose() {},

  /** 切换按金额/按份额 */
  switchHoldingMode(e) {
    this.setData({ holdingMode: e.currentTarget.dataset.mode });
  },

  /** 切换日期 / 天数 输入模式 */
  switchDateMode() {
    const next = this.data.holdingDateMode === 'date' ? 'days' : 'date';
    this.setData({ holdingDateMode: next });
  },

  /** 表单字段输入 */
  onHoldingAmountInput(e)    { this.setData({ 'holdingForm.amount':    e.detail.value }); },
  onHoldingSharesInput(e)    { this.setData({ 'holdingForm.shares':    e.detail.value }); },
  onHoldingCostInput(e)      { this.setData({ 'holdingForm.costPrice': e.detail.value }); },
  onHoldingDaysInput(e)      { this.setData({ 'holdingForm.days':      e.detail.value }); },
  onFirstBuyDateChange(e)    { this.setData({ 'holdingForm.firstBuyDate': e.detail.value }); },

  /** 保存持仓 */
  saveHoldingForm() {
    const { holdingMode, holdingDateMode, holdingForm, fund } = this.data;

    // 校验必填项
    if (holdingMode === 'amount' && !holdingForm.amount) {
      wx.showToast({ title: '请输入购鸡费用', icon: 'none' }); return;
    }
    if (holdingMode === 'shares' && !holdingForm.shares) {
      wx.showToast({ title: '请输入持有只数', icon: 'none' }); return;
    }
    if (!holdingForm.costPrice) {
      wx.showToast({ title: '请输入养殖成本', icon: 'none' }); return;
    }

    // 处理日期
    let firstBuyDate = holdingForm.firstBuyDate;
    if (holdingDateMode === 'days' && holdingForm.days) {
      const d = new Date();
      d.setDate(d.getDate() - parseInt(holdingForm.days || 0));
      const pad = n => String(n).padStart(2, '0');
      firstBuyDate = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    }

    const info = {
      mode:         holdingMode,
      amount:       parseFloat(holdingForm.amount)    || null,
      shares:       parseFloat(holdingForm.shares)    || null,
      costPrice:    parseFloat(holdingForm.costPrice) || null,
      firstBuyDate: firstBuyDate || null
    };

    saveHolding(fund.code, info);
    this.setData({ holdingInfo: info, showHoldingModal: false }, () => {
      this._redrawAfterModalClose();
    });
    this._computeHoldingStats(info, fund);
    wx.showToast({ title: '保存成功', icon: 'success' });
  },

  /** 清除持仓 */
  clearHolding() {
    wx.showModal({
      title: '清除持仓',
      content: '确定要清除持仓信息吗？',
      confirmColor: '#D4A84B',
      success: (res) => {
        if (res.confirm) {
          deleteHolding(this.data.fund.code);
          this.setData({ holdingInfo: null, holdingStats: null, showHoldingModal: false }, () => {
            this._redrawAfterModalClose();
          });
        }
      }
    });
  },

  /**
   * 根据持仓信息和当前净值计算市值、盈亏等
   * @param {Object} info - 持仓信息
   * @param {Object} fund - 基金数据
   */
  _computeHoldingStats(info, fund) {
    if (!info || !fund) return;
    const nav = parseFloat(fund.dwjz) || 0;
    if (!nav) return;

    const costPrice = parseFloat(info.costPrice) || 0;

    let shares = 0;
    if (info.mode === 'shares') {
      shares = parseFloat(info.shares) || 0;
    } else {
      const amount = parseFloat(info.amount) || 0;
      shares = costPrice > 0 ? amount / costPrice : 0;
    }

    const marketValue = shares * nav;
    const costBasis   = shares * costPrice;
    const pnl         = marketValue - costBasis;
    const pnlRate     = costBasis > 0 ? pnl / costBasis * 100 : 0;

    const fmt = n => {
      const abs = Math.abs(n);
      if (abs >= 10000) return (n / 10000).toFixed(2) + '万';
      return n.toFixed(2);
    };

    this.setData({
      holdingStats: {
        shares:      shares.toFixed(2),
        marketValue: marketValue.toFixed(2),
        costBasis:   costBasis.toFixed(2),
        pnl,
        pnlStr:  fmt(pnl),
        pnlRate: (pnlRate >= 0 ? '+' : '') + pnlRate.toFixed(2) + '%'
      }
    });
  }
});
