# Go 后端（小程序 Supabase CRUD）

该服务提供小程序登录与云同步接口，供 `miniprogram/utils/cloud-sync.js` 调用。

## 1. 环境变量

复制 `.env.example` 并填写：

- `SUPABASE_DB_URL`：Supabase Postgres 连接串
- `JWT_SECRET`：签发鉴权 token 的密钥
- `PORT`：服务端口，默认 `8080`
- `ALLOWED_ORIGIN`：CORS，测试可设 `*`
- `WECHAT_APPID` / `WECHAT_APPSECRET`：可选，配置后走真实微信登录

> 未配置微信密钥时，`/api/wx-login` 会返回开发用 mock openid，便于联调。

## 2. 运行

```bash
cd backend-go
go mod tidy
go run .
```

## 3. 接口

- `POST /api/wx-login`
- `POST /api/sync/full`
- `GET /api/sync/full?openid=xxx`
- `POST /api/sync/funds/upsert`
- `DELETE /api/sync/funds/:fundCode?openid=xxx`
- `POST /api/sync/holdings/upsert`
- `DELETE /api/sync/holdings/:fundCode?openid=xxx`
- `POST /api/sync/portfolio/upsert`

## 4. 小程序对接

在 `miniprogram/app.js` 设置：

```js
globalData: {
  // ...
  serverUrl: 'http://你的后端地址:8080'
}
```

小程序登录后会先调用 `/api/wx-login` 获取 `token`，后续同步接口会自动在 `Authorization: Bearer <token>` 传入。
