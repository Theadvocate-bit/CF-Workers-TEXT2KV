# CF-Workers-TEXT2KV

Cloudflare Workers + Workers KV 文本存储。单文件部署 — 将 `_worker.js` 粘贴到 Cloudflare Workers 编辑器即可运行。

## 功能

- Web 管理界面：登录、CRUD、搜索、字符统计
- 深色模式（跟随系统 + 手动切换 + 持久化）
- readToken 访问控制，一键复制访问链接
- 旧版 URL 路径兼容 + Windows bat / Linux sh 上传脚本
- 编辑 readToken 时自动清理旧 key

## 项目结构

```
CF-Workers-TEXT2KV/
├── _worker.js      # 全部代码（Worker + 内嵌 HTML + 工具函数）
├── LICENSE         # GPL v3
└── README.md
```

## 配置与部署

| 变量 / 绑定 | 说明 | 默认值 |
|-------------|------|--------|
| `TOKEN`（环境变量） | 管理 token（API 鉴权 + 旧版访问） | `passwd` |
| `KV`（KV 绑定） | Cloudflare Workers KV 命名空间 | — |

部署步骤（[Dashboard](https://dash.cloudflare.com/?to=/:account/workers)）：

1. 创建新 Worker，将 `_worker.js` 粘贴到编辑器
2. 创建 KV 命名空间并绑定（binding 名称必须为 `KV`）
3. Settings → Variables 中添加 `TOKEN`
4. 部署

Wrangler CLI（可选）：

```bash
wrangler login
wrangler kv:namespace create TEXT2KV
wrangler deploy
```

## 数据模型

每个逻辑 key 对应 KV 中的一条记录，格式为 `filename` 或 `filename:readToken`（第一个冒号分隔）。

| 场景 | KV Key 格式 | 示例 |
|------|------------|------|
| 无 readToken | `filename` | `user-profile` |
| 有 readToken | `filename:readToken` | `user-profile:a1b2c3` |

- 同一个 filename 下只能有一个 readToken 版本（保存时自动清理旧版本）
- 列表接口按第一个冒号拆分，无冒号则 readToken 为空

## Key 命名规则

| 规则 | 说明 |
|------|------|
| 字符集 | 仅允许字母（a-z, A-Z）、数字（0-9）、连字符（-）、下划线（_） |
| 长度 | 1-200 字符 |
| 禁止字符 | `.`、`:`、`/`、空格及其他特殊字符 |
| 示例 | `user-profile-v2` ✅ / `my_key` ✅ / `my.file` ❌ |

> 所有写入路径（含旧版 `/{key}?text=...`）均校验 key 格式，不符返回 HTTP 400。

## API

鉴权：`Authorization: Bearer <token>` 或 `?token=<token>`。

### GET /api/list

列出所有 key 及 readToken。需 admin token。

```json
[
  { "key": "user-profile", "readToken": "" },
  { "key": "private-doc", "readToken": "a1b2c3" }
]
```

### POST /api/save

保存 key-value。需 admin token。

```json
{ "key": "user-profile", "content": "my-value", "readToken": "optional-read-token" }
```

响应：`{ "success": true }`

### POST /api/delete

删除 key。需 admin token。

```json
{ "key": "user-profile", "readToken": "optional-read-token" }
```

响应：`{ "success": true }`

### GET /api/get?key=xxx&readToken=yyy

公开读取，返回纯文本（`Content-Type: text/plain; charset=utf-8`）。

- 未设置 readToken：`/api/get?key=my-key`
- 设置了 readToken：需附加 `&readToken=yyy`
- 错误时返回 JSON（如 `{ "error": "Key 不存在" }`）

## 旧版兼容接口

```
GET https://your-worker.com/{key}?token=YOUR_TOKEN                  # 读取
GET https://your-worker.com/{key}?token=YOUR_TOKEN&text=新内容       # 写入
GET https://your-worker.com/{key}?token=YOUR_TOKEN&b64=Base64内容    # 写入（Base64）
GET https://your-worker.com/config?token=YOUR_TOKEN                 # 配置页面
GET https://your-worker.com/config/update.bat?token=YOUR_TOKEN      # 下载 bat
GET https://your-worker.com/config/update.sh?token=YOUR_TOKEN       # 下载 sh
```

> 脚本更新因 URL 长度限制，一次最多更新 65 行内容。推荐使用管理界面进行完整 CRUD。

## 许可证

GPL v3 — 见 [LICENSE](./LICENSE)
