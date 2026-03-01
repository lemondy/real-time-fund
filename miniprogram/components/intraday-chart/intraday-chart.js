// components/intraday-chart/intraday-chart.js
import { getIntradayChartConfig } from '../../utils/chart';

Component({
  properties: {
    series: {
      type: Array,
      value: []
    },
    referenceNav: {
      type: Number,
      value: null
    },
    canvasId: {
      type: String,
      value: 'default'
    }
  },

  data: {
    chartData: null,
    width: 0,
    height: 150,
    tooltipVisible: false,
    tooltipX: 0,
    tooltipY: 0,
    tooltipTime: '',
    tooltipPercent: 0,
    updateTime: ''
  },

  lifetimes: {
    attached() {
      this.initCanvas();
    }
  },

  observers: {
    'series, referenceNav': function(series, referenceNav) {
      if (series && series.length >= 2) {
        const chartData = getIntradayChartConfig(series, referenceNav);
        this.setData({ 
          chartData,
          updateTime: series[series.length - 1]?.time || ''
        });
        this.drawChart();
      }
    }
  },

  methods: {
    initCanvas() {
      // 获取canvas容器宽度
      const query = this.createSelectorQuery();
      query.select('.intraday-chart-container').boundingClientRect();
      query.exec(res => {
        if (res[0]) {
          this.setData({
            width: res[0].width
          });
          this.drawChart();
        }
      });
    },

    drawChart() {
      const { chartData, width, height } = this.data;
      if (!chartData || !width) return;

      const ctx = wx.createCanvasContext(`intradayChart${this.properties.canvasId}`, this);
      const padding = { top: 20, right: 10, bottom: 25, left: 40 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;

      // 清空画布
      ctx.clearRect(0, 0, width, height);

      const { categories, data, lineColor, areaColor, minValue, maxValue } = chartData;
      
      // 计算Y轴范围
      const yRange = maxValue - minValue;
      const yPadding = yRange * 0.1;
      const yMin = minValue - yPadding;
      const yMax = maxValue + yPadding;
      const ySpan = yMax - yMin;

      // 绘制背景网格 - 使用更专业的浅灰色
      ctx.setStrokeStyle('#E0E0E0');
      ctx.setLineWidth(0.5);
      
      for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();
      }

      // 绘制Y轴刻度 - 使用专业的深色字体
      ctx.setFontSize(10);
      ctx.setFillStyle('#666666');
      ctx.setTextAlign('right');
      
      for (let i = 0; i <= 4; i++) {
        const value = yMax - (ySpan / 4) * i;
        const y = padding.top + (chartHeight / 4) * i;
        const text = value >= 0 ? `+${value.toFixed(2)}%` : `${value.toFixed(2)}%`;
        ctx.fillText(text, padding.left - 5, y + 4);
      }

      // 绘制X轴刻度
      ctx.setTextAlign('center');
      ctx.setFillStyle('#999999');
      const xStep = Math.ceil(categories.length / 6);
      for (let i = 0; i < categories.length; i += xStep) {
        const x = padding.left + (chartWidth / (categories.length - 1)) * i;
        ctx.fillText(categories[i], x, height - 5);
      }

      // 创建渐变填充 - 增强专业视觉效果
      const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
      // 根据涨跌创建不同的渐变色
      if (data[data.length - 1] >= 0) {
        // 涨：朱红渐变
        gradient.addColorStop(0, 'rgba(211, 47, 47, 0.3)');
        gradient.addColorStop(0.5, 'rgba(211, 47, 47, 0.1)');
        gradient.addColorStop(1, 'rgba(211, 47, 47, 0)');
      } else {
        // 跌：墨绿渐变
        gradient.addColorStop(0, 'rgba(56, 142, 60, 0.3)');
        gradient.addColorStop(0.5, 'rgba(56, 142, 60, 0.1)');
        gradient.addColorStop(1, 'rgba(56, 142, 60, 0)');
      }

      // 绘制面积
      ctx.beginPath();
      data.forEach((value, index) => {
        const x = padding.left + (chartWidth / (data.length - 1)) * index;
        const y = padding.top + chartHeight - ((value - yMin) / ySpan) * chartHeight;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      // 完成面积路径
      const lastX = padding.left + chartWidth;
      const baseY = padding.top + chartHeight;
      ctx.lineTo(lastX, baseY);
      ctx.lineTo(padding.left, baseY);
      ctx.closePath();
      
      ctx.setFillStyle(gradient);
      ctx.fill();

      // 绘制折线 - 使用专业的金融配色
      ctx.beginPath();
      data.forEach((value, index) => {
        const x = padding.left + (chartWidth / (data.length - 1)) * index;
        const y = padding.top + chartHeight - ((value - yMin) / ySpan) * chartHeight;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.setStrokeStyle(lineColor);
      ctx.setLineWidth(2);
      ctx.stroke();

      ctx.draw();
      
      // 保存图表数据用于交互
      this.chartInfo = {
        padding,
        chartWidth,
        chartHeight,
        categories,
        data,
        yMin,
        ySpan
      };
    },

    onTouchStart(e) {
      this.handleTouch(e);
    },

    onTouchMove(e) {
      this.handleTouch(e);
    },

    onTouchEnd() {
      this.setData({
        tooltipVisible: false
      });
    },

    handleTouch(e) {
      if (!this.chartInfo) return;
      
      const touch = e.touches[0];
      const { padding, chartWidth, categories, data } = this.chartInfo;
      
      // 计算触摸点相对于图表的位置
      const x = touch.x - padding.left;
      
      if (x < 0 || x > chartWidth) {
        this.setData({ tooltipVisible: false });
        return;
      }

      // 找到最近的数据点
      const index = Math.round((x / chartWidth) * (data.length - 1));
      const value = data[index];
      const time = categories[index];

      this.setData({
        tooltipVisible: true,
        tooltipX: touch.x,
        tooltipY: touch.y,
        tooltipTime: time,
        tooltipPercent: value.toFixed(2)
      });
    }
  }
});
