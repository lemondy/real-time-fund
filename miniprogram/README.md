# 基估宝 - 微信小程序版

这是将原有的 Next.js 版本的实时基金估值项目改造为微信小程序版本，支持微信登录和数据云端同步。

## 项目结构

```
miniprogram/
├── pages/              # 页面文件
│   ├── index/         # 首页（基金列表）
│   ├── login/         # 登录页
│   └── my/            # 我的页面
├── components/         # 组件
│   └── intraday-chart/ # 分时图组件
├── utils/             # 工具类
│   ├── api.js         # 基金数据API
│   ├── storage.js     # 本地存储工具
│   ├── auth.js        # 认证工具
│   ├── valuation-timeseries.js # 估值分时数据
│   └── chart.js       # 图表工具
├── cloudfunctions/    # 云函数（可选）
│   └── login/         # 登录云函数
├── images/            # 图片资源（需自行添加）
├── app.js             # 小程序入口文件
├── app.json           # 小程序全局配置
├── app.wxss           # 小程序全局样式
├── project.config.json # 项目配置文件
└── sitemap.json       # 索引配置
```

## 功能特性

### ✨ 核心功能

1. **微信登录** 🔐
   - 使用微信账号一键登录
   - 支持用户信息展示
   - 登录态持久化
   - 支持三种登录模式：本地/云开发/自定义服务器
   - 详见 [微信登录配置指南.md](./微信登录配置指南.md)

2. **基金搜索与添加**
   - 支持按基金代码或名称搜索
   - 一键添加基金到列表
   - 智能搜索建议

3. **实时估值追踪**
   - 实时显示基金净值和估值
   - 显示涨跌幅和涨跌金额
   - 自动刷新功能
   - 估值分时图展示（v1.1.0+）

4. **持仓信息**
   - 显示前10大重仓股
   - 实时追踪重仓股涨跌
   - 可展开/收起持仓详情

5. **自选管理**
   - 支持添加基金到自选
   - 独立的自选列表视图
   - 快速切换全部/自选

6. **数据持久化**
   - 本地存储基金列表
   - 云端同步（需配置后端）
   - 多设备数据共享

7. **个性化设置**
   - 自定义刷新间隔
   - 自动刷新开关
   - 默认展开持仓设置

## 快速开始

### 1. 环境准备

- 下载并安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
- 注册微信小程序账号，获取 AppID

### 2. 项目配置

1. 用微信开发者工具打开 `miniprogram` 目录

2. 修改 `project.config.json` 中的 `appid`:
```json
{
  "appid": "你的小程序AppID"
}
```

3. 在微信公众平台后台配置服务器域名（设置 → 开发设置 → 服务器域名）:

**request 合法域名:**
```
https://fundgz.1234567.com.cn
https://fundf10.eastmoney.com
https://fundsuggest.eastmoney.com
https://qt.gtimg.cn
```

### 3. 运行项目

1. 在微信开发者工具中点击"编译"
2. 预览效果或真机调试

## 数据接口说明

### 基金数据来源

1. **基金估值数据**: 天天基金网 (https://fundgz.1234567.com.cn)
2. **基金持仓数据**: 东方财富网 (https://fundf10.eastmoney.com)
3. **股票行情数据**: 腾讯财经 (https://qt.gtimg.cn)
4. **基金搜索**: 东方财富基金搜索 API

### 数据更新频率

- 基金估值: 交易日实时更新（延迟约15分钟）
- 基金净值: T+1日更新
- 股票行情: 实时更新
- 持仓数据: 季度更新

## 后端服务配置（可选）

如需实现云端数据同步功能，需要配置后端服务。

### 1. 创建云开发环境

在微信公众平台 → 开发 → 云开发中创建环境

### 2. 配置云函数

创建 `wx-login` 云函数处理微信登录：

```javascript
// cloud/wx-login/index.js
const cloud = require('wx-server-sdk')
cloud.init()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  }
}
```

### 3. 修改 app.js

在 `wxLogin` 方法中修改为调用云函数：

```javascript
wxLogin() {
  return wx.cloud.callFunction({
    name: 'wx-login'
  }).then(res => {
    this.globalData.openid = res.result.openid;
    wx.setStorageSync('openid', res.result.openid);
    return res.result;
  });
}
```

## 注意事项

### ⚠️ 重要提醒

1. **服务器域名配置**: 必须在微信公众平台配置合法域名，否则无法请求数据
2. **网络请求限制**: 小程序对网络请求有并发限制，建议合理控制刷新频率
3. **数据延迟**: 基金估值数据存在约15分钟延迟，仅供参考
4. **本地测试**: 开发工具可以不校验域名，但真机预览和发布必须配置合法域名

### 📱 图片资源

项目需要以下图片资源（需自行添加到 `images` 目录）:

- `logo.png` - 应用logo (建议 512x512px)
- `fund.png` - 底部导航栏基金图标
- `fund-active.png` - 底部导航栏基金图标（选中）
- `user.png` - 底部导航栏我的图标
- `user-active.png` - 底部导航栏我的图标（选中）
- `user-default.png` - 默认用户头像

## 功能演示

### 主要页面

1. **首页（基金列表）**
   - 搜索并添加基金
   - 查看基金实时估值
   - 管理自选基金
   - 设置刷新选项

2. **登录页**
   - 微信一键登录
   - 显示登录状态

3. **我的页面**
   - 用户信息展示
   - 数据统计
   - 功能设置
   - 退出登录

## 技术栈

- **框架**: 微信小程序原生开发
- **语言**: JavaScript
- **样式**: WXSS (玻璃拟态设计)
- **数据**: 本地存储 (localStorage) + 云开发（可选）

## 开发计划

- [x] 基础框架搭建
- [x] 微信登录功能
- [x] 基金搜索与添加
- [x] 实时估值显示
- [x] 持仓信息展示
- [x] 自选管理
- [x] 个性化设置
- [ ] 云端数据同步
- [ ] 消息推送
- [ ] 分享功能
- [ ] 数据分析图表

## 免责声明

本项目所有数据均来自公开接口，仅供个人学习及参考使用。数据可能存在延迟，不作为任何投资建议。

## 开源协议

本项目采用 **GNU Affero General Public License v3.0** (AGPL-3.0) 开源协议。

## 联系方式

如有问题或建议，欢迎反馈。

---

Made with ❤️ by 基估宝团队
