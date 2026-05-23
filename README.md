# 杨洋的补号系统

支持：

- 从 `codexproxy` 导入账号
- 从 `sub2api` 导入账号
- 本地查看账号状态
- 本地手动入池
- 向 `codexproxy` 推送账号
- 向 `sub2api` 推送账号

## 技术栈

- Next.js 16
- React 19
- Node `node:sqlite` 本地持久化
- Docker / 云服务器部署

## 本地启动

```bash
npm install
npm run dev
```

默认地址：

```text
http://localhost:3000
```

数据文件默认落在：

```text
./data/account-pool.sqlite
```

## Docker 启动

```bash
docker compose up -d --build
```

默认映射端口：

```text
3015 -> account-pool-proxy:80 -> account-pool-manager:3000
```

浏览器访问：

```text
http://服务器IP:3015
```

## 云服务器部署建议

当前项目已经包含：

- `Dockerfile`
- `docker-compose.yml`
- 本地数据卷 `./data:/app/data`

适合直接丢到云服务器执行：

```bash
git clone <your-repo>
cd 号池管理系统
docker compose up -d --build
```

如果服务器 `80/443` 已被 Lucky 或 Nginx 占用：

- 容器继续监听 `3015`
- 反代转发到 `127.0.0.1:3015`
- 容器内置 Nginx 反代缓存，只缓存前端静态资源，不缓存页面和 API

## 连接配置说明

### codexproxy

已按 GitHub 代码对接：

- 导入: `GET /auth/accounts/export?format=full`
- 推送: `POST /auth/accounts/import`

常见鉴权方式：

- `Cookie`
- `Bearer`
- 自定义 Header

### sub2api

已按 GitHub 代码对接：

- 导入: `GET /api/v1/admin/accounts/data`
- 推送: `POST /api/v1/admin/accounts/import/codex-session`

常见鉴权方式：

- `Cookie`
- `Bearer`
- 自定义 Header

## 当前界面能力

- 远端连接新增 / 删除 / 测试
- 一键从远端导入
- 本地账号列表筛选
- 批量选择后推送到任意连接
- 本地账号手动新增 / 停用 / 删除
- 最近动作日志

## 验证

```bash
npm run lint
npm run build
```
