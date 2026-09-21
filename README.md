# CF-Workers-TEXT2KV

部署在 [Cloudflare Workers](https://workers.cloudflare.com/) 上的轻量 KV 文本存储工具，使用 Cloudflare Workers KV 作为后端，提供完整的 Web 管理界面。

参考 [edgeone-text2kv](https://github.com/Theadvocate-bit/edgeone-text2kv) 改造。

**单文件部署** — 整个项目就是 `_worker.js` 一个文件，直接粘贴到 Cloudflare Workers 编辑器即可运行。

## 功能

- **Web 管理界面** — 登录、创建、编辑、删除、搜索 key-value
- **深色模式** — 跟随系统偏好，支持手动切换，自动持久化
- **访问链接** — 一键复制公开访问 URL，浏览器直接显示纯文本内容
- **内容加密** — 为 key 设置 readToken，访问时自动附加到链接
- **搜索过滤** — 按 key 实时搜索
- **复制功能** — 复制访问链接
- **字符统计** — 显示 content 字符数
- **旧版兼容** — 保留原有 URL 路径操作方式（`/{key}?token=xxx&text=...`）
- **脚本工具** — 提供 Windows bat 和 Linux sh 上传脚本
- **智能清理** — 编辑 readToken 时自动清理旧 key，避免孤儿数据

## 项目结构

```
CF-Workers-TEXT2KV/
├── _worker.js      # 全部代码（Worker + 内嵌 HTML + 工具函数）
├── LICENSE         # GPL v3
└── README.md
```

## 数据模型

每个逻辑 key 对应 KV 中的一条记录，格式为 `filename` 或 `filename:readToken`（第一个冒号分隔）。

| 场景 | KV Key 格式 | 示例 |
|------|------------|------|
| 无 readToken | `filename` | `user-profile` |
| 有 readToken | `filename:readToken` | `user-profile:a1b2c3` |

- `filename` 仅允许字母、数字、连字符，最长 200 字符
- 同一个 filename 下只能有一个 readToken 版本（保存时自动清理旧版本）
- 列表接口按第一个冒号拆分，无冒号则 readToken 为空

## 部署

### 方式一：Cloudflare Dashboard（推荐）

1. 进入 [Cloudflare Workers Dashboard](https://dash.cloudflare.com/?to=/:account/workers)
2. 创建新 Worker
3. 将 `_worker.js` 内容粘贴到编辑器
4. 创建 KV 命名空间并绑定（binding 名称必须为 `KV`）
5. 在 Settings → Variables 中添加 `TOKEN` 变量（管理 token）
6. 部署

### 方式二：Wrangler CLI（可选）

```bash
wrangler login
wrangler kv:namespace create TEXT2KV
# 将返回的 ID 填入代码中的 KV 绑定配置
wrangler deploy
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TOKEN` | 管理 token（API 鉴权 + 旧版访问） | `passwd` |

### KV 绑定

| Binding | 说明 |
|---------|------|
| `KV` | Cloudflare Workers KV 命名空间 |

## API 说明

所有 API 均支持 `Authorization: Bearer <token>` 或 URL 参数 `?token=<token>` 两种鉴权方式。

### GET /api/list

列出所有 key 及其 readToken。需要 admin token。

**请求**
```
GET /api/list?token=YOUR_TOKEN
```

**响应**
```json
[
  { "key": "user-profile", "readToken": "" },
  { "key": "private-doc", "readToken": "a1b2c3" }
]
```

### POST /api/save

保存 key-value。需要 admin token。

- filename 仅允许字母、数字、连字符（`[a-zA-Z0-9-]`），最长 200 字符
- 同一个 filename 下只能有一个 readToken 版本，保存时自动清理旧版本

**请求**
```json
{
  "key": "user-profile",
  "content": "my-value",
  "readToken": "optional-read-token"
}
```

**响应**
```json
{ "success": true }
```

### POST /api/delete

删除 key。需要 admin token。

**请求**
```json
{
  "key": "user-profile",
  "readToken": "optional-read-token"
}
```

**响应**
```json
{ "success": true }
```

### GET /api/get?key=xxx&readToken=yyy

公开读取接口。返回纯文本内容（`Content-Type: text/plain; charset=utf-8`），浏览器直接显示。

- 如果 key 未设置 readToken：直接访问 `/api/get?key=my-key`
- 如果 key 设置了 readToken：需要提供 `&readToken=yyy`
- 错误时返回 JSON（如 `{ "error": "Key 不存在" }`）

## Key 命名规则

| 规则 | 说明 |
|------|------|
| 字符集 | 仅允许字母（a-z, A-Z）、数字（0-9）、连字符（-） |
| 长度 | 1-200 字符 |
| 禁止字符 | `.`、`_`、`:`、`/`、空格及其他特殊字符 |
| 示例 | `user-profile-v2` ✅ / `my.file` ❌ / `my_key` ❌ |

> **注意**：旧版兼容路由（`/{key}?token=xxx`）不校验 key 格式，可能创建含特殊字符的 key。建议通过管理界面操作。

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

## 与 edgeone-text2kv 的差异

| 项 | edgeone-text2kv | CF-Workers-TEXT2KV |
|---|---|---|
| 平台 | EdgeOne Makers | Cloudflare Workers |
| 存储 | Upstash Redis | Cloudflare Workers KV |
| 架构 | 多文件（API + 静态 UI） | 单文件（内嵌 HTML） |
| Token 变量 | `ADMIN_TOKEN` | `TOKEN` |
| KV Key 格式 | `filename` + `_meta:filename` | `filename` 或 `filename:readToken` |
| 旧版兼容 | 无 | 保留 URL 路径操作 |
| 部署方式 | wrangler / 平台 | Dashboard 粘贴即用 |

## 许可证

GPL v3 — 见 [LICENSE](./LICENSE)