// CF-Workers-TEXT2KV — Cloudflare Workers + KV 文本存储
// 架构参考 edgeone-text2kv，后端从 Upstash Redis 改为 Cloudflare Workers KV
//
// 路由结构：
//   /              → public/index.html（静态资源，由 CF Workers 自动路由）
//   /api/list      → GET  列出所有 key（需 admin token）
//   /api/save      → POST 保存 key-value（需 admin token）
//   /api/delete    → POST 删除 key（需 admin token）
//   /api/get       → GET  读取 key 内容（纯文本，readToken 鉴权）
//   /config        → 配置信息页（旧版兼容）
//   /{key}         → 直接访问 key 内容（旧版兼容）
//   /{key}?text=   → 通过 URL 写入（旧版兼容）

export default {
    async fetch(request, env) {
        try {
            const url = new URL(request.url);
            const path = url.pathname;

            // ===== CORS =====
            if (request.method === 'OPTIONS') {
                return new Response(null, {
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    }
                });
            }

            const baseHeaders = {
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            };

            // ===== Helpers =====
            const json = (data, status = 200) => new Response(JSON.stringify(data), {
                status,
                headers: { ...baseHeaders, 'Content-Type': 'application/json; charset=utf-8' }
            });

            const text = (body, status = 200) => new Response(body, {
                status,
                headers: { ...baseHeaders, 'Content-Type': 'text/plain; charset=utf-8' }
            });

            const html = (body, status = 200) => new Response(body, {
                status,
                headers: { ...baseHeaders, 'Content-Type': 'text/html; charset=utf-8' }
            });

            // Auth: 从 Authorization header 或 URL query 中提取 token
            const getAuth = (req, u) => {
                const h = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
                return h || (u.searchParams.get('token') || '').trim();
            };

            const adminToken = (env.TOKEN || 'passwd').trim();
            const isAdmin = () => getAuth(request, url) === adminToken;

            const validateKey = (k) => {
                if (!k || typeof k !== 'string') return 'Key 不能为空';
                if (k.startsWith('_meta:')) return 'Key 不允许使用 _meta: 前缀';
                if (!/^[\w.\-:/]{1,200}$/.test(k))
                    return 'Key 仅允许字母、数字、_ - . : /，最长 200 字符';
                return null;
            };

            // ===== API Routes =====

            if (path === '/api/list') {
                if (!isAdmin()) return json({ error: '鉴权失败' }, 403);
                const list = await env.KV.list({ limit: 1000 });
                const keys = [];
                for (const key of list.keys) {
                    if (key.name.startsWith('_meta:')) continue;
                    const meta = await env.KV.get('_meta:' + key.name);
                    let readToken = '';
                    if (meta) { try { readToken = JSON.parse(meta).readToken || ''; } catch {} }
                    keys.push({ key: key.name, readToken });
                }
                return json(keys);
            }

            if (path === '/api/save') {
                if (!isAdmin()) return json({ error: '鉴权失败' }, 403);
                let body = {};
                try { body = await request.json(); } catch { return json({ error: '无效的 JSON 请求体' }, 400); }
                const { key, content, readToken } = body;
                const err = validateKey(key);
                if (err) return json({ error: err }, 400);
                await env.KV.put(key, content || '');
                await env.KV.put('_meta:' + key, JSON.stringify({ readToken: readToken || '' }));
                return json({ success: true });
            }

            if (path === '/api/delete') {
                if (!isAdmin()) return json({ error: '鉴权失败' }, 403);
                let body = {};
                try { body = await request.json(); } catch { return json({ error: '无效的 JSON 请求体' }, 400); }
                const { key } = body;
                if (!key) return json({ error: 'Key 不能为空' }, 400);
                await env.KV.del(key);
                await env.KV.del('_meta:' + key);
                return json({ success: true });
            }

            if (path === '/api/get') {
                const key = (url.searchParams.get('key') || '').trim();
                if (!key || key.startsWith('_meta:')) return json({ error: 'Key 无效' }, 400);
                const content = await env.KV.get(key);
                if (content === null) return json({ error: 'Key 不存在' }, 404);
                const meta = await env.KV.get('_meta:' + key);
                let requiredToken = '';
                if (meta) { try { requiredToken = JSON.parse(meta).readToken || ''; } catch {} }
                if (requiredToken) {
                    const provided = (url.searchParams.get('readToken') || '').trim();
                    if (provided !== requiredToken) return json({ error: '需要有效的读取 Token' }, 403);
                }
                return text(content);
            }

            // ===== Legacy Routes（旧版兼容）=====

            // Config 页面
            if (path === '/config' || path === '/' + adminToken) {
                const legacyAuth = url.searchParams.get('token') === adminToken;
                if (!legacyAuth) return text('token 有误', 403);
                return html(configHTML(url.hostname, adminToken));
            }

            // 脚本下载
            if (path === '/config/update.bat') {
                const legacyAuth = url.searchParams.get('token') === adminToken;
                if (!legacyAuth) return text('token 有误', 403);
                return new Response(generateBatScript(url.hostname, adminToken), {
                    headers: { ...baseHeaders, 'Content-Disposition': 'attachment; filename=update.bat' }
                });
            }

            if (path === '/config/update.sh') {
                const legacyAuth = url.searchParams.get('token') === adminToken;
                if (!legacyAuth) return text('token 有误', 403);
                return new Response(generateShScript(url.hostname, adminToken), {
                    headers: { ...baseHeaders, 'Content-Disposition': 'attachment; filename=update.sh' }
                });
            }

            // 旧版直接访问：/{key}?token=xxx
            // 排除已处理的路径
            const isSkip = (path === '/') || path.startsWith('/config') || path.startsWith('/api/');
            const isConfigPath = path === '/' + adminToken;

            if (!isSkip && !isConfigPath && path !== '/') {
                const legacyKey = path.substring(1); // 去掉开头的 /
                const textParam = url.searchParams.get('text');
                const b64Param = url.searchParams.get('b64');
                const legacyAuth = url.searchParams.get('token') === adminToken;

                if (textParam || b64Param) {
                    // 写入模式
                    if (!legacyAuth) return text('token 有误', 403);
                    const content = textParam || base64Decode(replaceSpacesWithPlus(b64Param));
                    await env.KV.put(legacyKey, content);
                    const verified = await env.KV.get(legacyKey);
                    if (verified !== content) return text('Content verification failed', 500);
                    return text(verified);
                } else {
                    // 读取模式
                    if (!legacyAuth) return text('token 有误', 403);
                    const value = await env.KV.get(legacyKey);
                    if (value === null) return text('File not found', 404);
                    return text(value);
                }
            }

            return text('Not found', 404);
        } catch (error) {
            console.error('Worker error:', error);
            return text('服务器内部错误: ' + error.message, 500);
        }
    }
};

// ===== 工具函数 =====

function base64Decode(str) {
    try {
        const bytes = new Uint8Array(atob(str).split('').map(c => c.charCodeAt(0)));
        return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
        throw new Error('无效的 Base64 字符串');
    }
}

function replaceSpacesWithPlus(str) {
    return str.replace(/ /g, '+');
}

// ===== 旧版辅助函数 =====

function generateBatScript(domain, token) {
    return [
        '@echo off',
        'chcp 65001',
        'setlocal',
        '',
        `set "DOMAIN=${domain}"`,
        `set "TOKEN=${token}"`,
        '',
        'set "FILENAME=%~nx1"',
        '',
        "for /f \"delims=\" %%i in ('powershell -command \"$content = ((Get-Content -Path '%cd%/%FILENAME%' -Encoding UTF8) | Select-Object -First 65) -join [Environment]::NewLine; [convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content))\"') do set \"BASE64_TEXT=%%i\"",
        '',
        'set "URL=https://%DOMAIN%/%FILENAME%?token=%TOKEN%^&b64=%BASE64_TEXT%"',
        '',
        'start %URL%',
        'endlocal',
        '',
        'echo 更新数据完成，5秒后自动关闭窗口...',
        'timeout /t 5 >nul',
        'exit'
    ].join('\r\n');
}

function generateShScript(domain, token) {
    return `#!/bin/bash
export LANG=zh_CN.UTF-8
DOMAIN="${domain}"
TOKEN="${token}"
if [ -n "$1" ]; then
  FILENAME="$1"
else
  echo "无文件名"
  exit 1
fi
BASE64_TEXT=$(head -n 65 $FILENAME | base64 -w 0)
curl -k "https://\${DOMAIN}/\${FILENAME}?token=\${TOKEN}&b64=\${BASE64_TEXT}"
echo "更新数据完成"
`;
}

function configHTML(domain, token) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CF-Workers-TEXT2KV 配置信息</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', system-ui, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; background: #f6f7f9; color: #1f2937; }
        h1 { text-align: center; font-size: 1.5rem; }
        h2 { font-size: 1.2rem; margin-top: 20px; }
        pre { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; overflow-x: auto; }
        .container { background: #fff; border-radius: 10px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .tips { color: #6b7280; font-size: 0.85em; border-left: 3px solid #e5e7eb; padding-left: 10px; margin: 10px 0; }
        button { padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; font-size: 0.9rem; }
        .btn-primary { background: #0052d9; color: #fff; }
        .btn-primary:hover { background: #003ebb; }
        .btn-secondary { background: #e5e7eb; color: #1f2937; }
        .btn-secondary:hover { background: #d1d5db; }
        input[type="text"] { padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 5px; font-size: 0.9rem; width: 100%; }
        .flex-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        a { color: #0052d9; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.75em; font-weight: 600; }
        .badge-new { background: #d1fae5; color: #065f46; }
    </style>
</head>
<body>
    <div class="container">
        <h1>TEXT2KV 配置信息</h1>
        <p>
            <strong>服务域名:</strong> ${domain}<br>
            <strong>TOKEN:</strong> ${token}<br>
            <strong>管理界面:</strong> <a href="/">点击进入</a> <span class="badge badge-new">NEW</span><br>
        </p>
        <p class="tips"><strong>注意!</strong> 脚本更新方式因 URL 长度限制，一次最多更新 65 行内容。推荐使用管理界面进行完整 CRUD 操作。</p>

        <h2>Web 管理界面</h2>
        <p>访问 <a href="/">/${''}</a> 打开管理界面，支持：创建、编辑、删除、搜索、深色模式、访问链接。</p>

        <h2>Windows 脚本</h2>
        <div class="flex-row">
            <button class="btn-primary" onclick="window.open('https://${domain}/config/update.bat?token=${token}&t='+Date.now(), '_blank')">下载 update.bat</button>
        </div>
        <pre><code>update.bat 文件名</code></pre>

        <h2>Linux 脚本</h2>
        <div class="flex-row">
            <button class="btn-primary" onclick="copyLinuxScript()">复制安装命令</button>
        </div>
        <pre><code>curl "https://${domain}/config/update.sh?token=${token}" -o update.sh && chmod +x update.sh</code></pre>

        <h2>API 调用示例</h2>
        <pre><code># 创建 Key
curl -X POST "https://${domain}/api/save?token=${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"key":"my-key","content":"Hello World"}'

# 读取 Key（返回纯文本）
curl "https://${domain}/api/get?key=my-key"

# 列出所有 Key
curl "https://${domain}/api/list?token=${token}"</code></pre>
    </div>
    <script>
        function copyLinuxScript() {
            var cmd = 'curl "https://${domain}/config/update.sh?token=${token}" -o update.sh && chmod +x update.sh';
            navigator.clipboard.writeText(cmd).then(() => alert('已复制到剪贴板'));
        }
    </script>
</body>
</html>`;
}
