# CF-Workers-TEXT2KV

部署在 [Cloudflare Workers](https://workers.cloudflare.com/) 上的轻量 KV 文本存储工具，使用 Cloudflare Workers KV 作为后端，提供完整的 Web 管理界面。

参考 [edgeone-text2kv](https://github.com/Theadvocate-bit/edgeone-text2kv) 改造。

## 功能

- **Web 管理界面** — 登录、创建、编辑、删除、搜索 key-value
- **深色模式** — 跟随系统偏好，支持手动切换，自动持久化
- **访问链接** — 一键复制公开访问 URL，浏览器直接显示纯文本内容
- **内容加密** — 为 key 设置 readToken，访问时自动附加到链接
- **搜索过滤** — 按 key 实时搜索
- **复制功能** — 复制 key 名称或完整访问链接
- **字符统计** — 显示 content 字符数
- **旧版兼容** — 保留原有 URL 路径操作方式（`/{key}?token=xxx&text=...`）
- **脚本工具** — 提供 Windows bat 和 Linux sh 上传脚本

## 项目结构

```
CF-Workers-TEXT2KV/
├── _worker.js              # Worker 代码（API + 路由 + 旧版兼容）
├── public/
│   └── index.html          # Web 管理界面（静态资源）
├── wrangler.toml           # Cloudflare Workers 配置
├── LICENSE                 # GPL v3
└── README.md
```

## 部署

### 方式一：Wrangler CLI（推荐）

1. 安装 Wrangler：`npm install -g wrangler`
2. 登录：`wrangler login`
3. 创建 KV 命名空间：`wrangler kv:namespace create TEXT2KV`
4. 将返回的 ID 填入 `wrangler.toml` 的 `kv_namespaces` 配置
5. 修改 `wrangler.toml` 中的 `TOKEN` 为你想要的安全 token
6. 部署：`wrangler deploy`

### 方式二：Cloudflare Dashboard

1. 进入 [Cloudflare Workers Dashboard](https://dash.cloudflare.com/?to=/:account/workers)
2. 创建新 Worker
3. 将 `_worker.js` 内容粘贴到编辑器
4. 创建 KV 命名空间并绑定（binding 名称必须为 `KV`）
5. 在 Settings → Variables 中添加 `TOKEN` 变量
6. 在 Settings → Static Assets 中添加 `public/` 目录（或使用 Pages 部署静态文件）

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TOKEN` | 管理 token（API 鉴权 + 旧版访问） | `passwd` |

### KV 绑定

| Binding | 说明 |
|---------|------|
| `KV` | Cloudflare Workers KV 命名空间 |

## API 说明

### GET /api/list?token=xxx
列出所有 key 及其 readToken。需要 admin token。

### POST /api/save
保存 key-value。需要 admin token。

请求体：
```json
{
  "key": "my-key",
  "content": "my-value",
  "readToken": "optional-read-token"
}
```

### POST /api/delete
删除 key。需要 admin token。

请求体：
```json
{
  "key": "my-key"
}
```

### GET /api/get?key=xxx&readToken=yyy
公开读取接口。返回纯文本内容（`Content-Type: text/plain; charset=utf-8`），浏览器直接显示。

- 如果 key 未设置 readToken：直接访问 `/api/get?key=my-key`
- 如果 key 设置了 readToken：需要提供 `&readToken=yyy`
- 错误时返回 JSON（如 `{ "error": "Key 不存在" }`）

## 旧版兼容接口

原有的 URL 路径操作方式仍然可用：

### 读取文件
```
GET https://your-worker.com/{key}?token=YOUR_TOKEN
```

### 写入文件（通过 URL 参数）
```
GET https://your-worker.com/{key}?token=YOUR_TOKEN&text=新内容
GET https://your-worker.com/{key}?token=YOUR_TOKEN&b64=Base64编码内容
```

### 配置页面
```
GET https://your-worker.com/config?token=YOUR_TOKEN
```

### 脚本下载
```
GET https://your-worker.com/config/update.bat?token=YOUR_TOKEN
GET https://your-worker.com/config/update.sh?token=YOUR_TOKEN
```

## 管理界面功能

### 登录
- 首次使用需设置 Admin Token（浏览器本地存储）
- 后续自动填充，无需重复输入

### 创建 Key
- 点击「＋ 新建 Key」按钮，弹出表单
- 填写 key 名称和 content 内容
- 可选设置 readToken（加密读取权限）

### 编辑 Key
- 点击「编辑」按钮，弹出表单
- 修改 content 或 readToken
- 实时显示字符数统计

### 删除 Key
- 点击「删除」按钮，确认弹窗后删除

### 搜索
- 在搜索框输入关键词，按 key 实时过滤

### 复制
- 点击「链接」复制完整访问 URL（含 readToken 时自动附加）
- 访问链接打开后直接显示纯文本内容

### 深色模式
- 默认跟随系统偏好
- 右上角切换按钮手动切换
- 自动保存到浏览器本地存储

## 与 edgeone-text2kv 的差异

| 项 | edgeone-text2kv | CF-Workers-TEXT2KV |
|---|---|---|
| 平台 | EdgeOne Makers | Cloudflare Workers |
| 存储 | Upstash Redis | Cloudflare Workers KV |
| 路由 | 文件即路由（多文件） | 单文件路由（_worker.js） |
| 静态资源 | `edgeone.json` 指定 | `wrangler.toml` 配置 assets |
| Token 变量 | `ADMIN_TOKEN` | `TOKEN` |
| 旧版兼容 | 无 | 保留 URL 路径操作 |

## 迁移说明

本项目从原始单文件架构改造为结构化 API + Web 管理界面，参考 edgeone-text2kv 设计。

主要变更：
1. **新增 API 端点**：`/api/list`、`/api/save`、`/api/delete`、`/api/get`
2. **新增 Web 管理界面**：`public/index.html`（CRUD/搜索/深色模式）
3. **新增 per-key readToken**：支持为每个 key 设置独立的读取 token
4. **纯文本响应**：`/api/get` 返回 `text/plain`，浏览器直接显示内容
5. **旧版兼容**：保留原有的 URL 路径操作方式
6. **配置分离**：`wrangler.toml` 管理 KV 绑定和静态资源
