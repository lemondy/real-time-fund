# Supabase 云同步设计说明

## 目标
- 用户登录后，把本地关注/收藏基金、持仓信息、资金收益汇总同步到 Supabase。
- 支持全量同步 + 增量 CRUD。
- 多端时可从云端拉取并恢复本地数据。

## 安全架构（推荐）
- 小程序端 **不直接连 Supabase**（避免暴露高权限 key，且小程序环境不适合直连完整鉴权链）。
- 小程序调用你的后端：`serverUrl/api/sync/*`
- 后端使用 Supabase service role 进行写入，并按 `openid` 做数据隔离。

## 数据表
见 `miniprogram/supabase-schema.sql`，核心 4 张：
- `user_profiles`：用户资料（openid, 昵称, 头像）
- `user_funds`：关注基金与收藏状态
- `user_holdings`：每只基金的持仓详情（按金额/按份额）
- `user_portfolio_summary`：资金汇总快照（总投入、今日收益、累计收益率等）

可选：
- `sync_logs`：同步日志排障

## 同步时机
- 登录成功后自动触发一次全量同步
- “我的”页面手动点击“数据同步”触发全量同步
- 后续可在以下动作做增量同步：
  - 新增/删除关注基金
  - 切换收藏
  - 保存/删除持仓
  - 刷新资金汇总

## 已落地的小程序端实现
新增：`miniprogram/utils/cloud-sync.js`

### 核心方法
- `syncAllFromLocal()`：全量上行同步
- `pullAllToLocal()`：云端下行恢复本地
- `buildSummaryFromLocal()`：根据本地 `funds + fund_holdings` 计算汇总

### 增量 CRUD 方法
- `upsertFundRemote(fund)`
- `deleteFundRemote(fundCode)`
- `upsertHoldingRemote(holding)`
- `deleteHoldingRemote(fundCode)`
- `upsertSummaryRemote()`

### 已接入页面
- `pages/login/login.js`
  - 登录成功后调用 `syncAllFromLocal()`（失败不阻断登录）
- `pages/my/my.js`
  - “数据同步”按钮改为真实调用 `syncAllFromLocal()`

## 后端 API 约定（建议）

### 1) 全量同步上行
- `POST /api/sync/full`
- 请求体：
```json
{
  "openid": "xxx",
  "userInfo": { "nickName": "xx", "avatarUrl": "xx" },
  "funds": [],
  "holdings": [],
  "summary": {},
  "clientSyncAt": 1710000000000
}
```
- 后端动作（事务）：
  1. upsert `user_profiles`
  2. 批量 upsert `user_funds`
  3. 批量 upsert `user_holdings`
  4. upsert `user_portfolio_summary`
  5. 写 `sync_logs`

### 2) 全量下行
- `GET /api/sync/full?openid=xxx`
- 返回：
```json
{
  "funds": [],
  "holdings": [],
  "summary": {}
}
```

### 3) 增量接口
- `POST /api/sync/funds/upsert`
- `DELETE /api/sync/funds/:fundCode?openid=...`
- `POST /api/sync/holdings/upsert`
- `DELETE /api/sync/holdings/:fundCode?openid=...`
- `POST /api/sync/portfolio/upsert`

## 写入策略建议
- 以 `(openid, fund_code)` 做 upsert 主键约束，避免重复行。
- 时间字段建议保留：
  - `client_update_time`：客户端更新时间（毫秒）
  - `updated_at`：服务端入库时间（timestamptz）
- 冲突处理优先级：
  - 同一用户同一基金，`client_update_time` 更新更晚者覆盖。

## 读取策略建议
- App 启动或登录后：
  1. 拉取云端摘要（`summary`）可快速渲染
  2. 再拉取基金和持仓明细
  3. 本地与云端存在冲突时，按 `client_update_time` 判定

## 注意事项
- 当前 `syncAllFromLocal` 依赖 `app.globalData.serverUrl`。
- 若未配置 `serverUrl`，同步会返回 `skipped`，不会报错阻断使用。
- 建议在后端做请求签名/鉴权，避免伪造 `openid`。
