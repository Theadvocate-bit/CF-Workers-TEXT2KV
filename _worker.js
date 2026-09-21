// CF-Workers-TEXT2KV — Cloudflare Workers + KV 文本存储
// 架构参考 edgeone-text2kv，后端从 Upstash Redis 改为 Cloudflare Workers KV
//
// 单文件部署：直接粘贴到 Cloudflare Workers 编辑器即可运行
// 需要配置 KV 绑定（binding: KV）和 TOKEN 环境变量
//
// 路由结构：
//   /              → 管理界面（内嵌 HTML）
//   /api/list      → GET  列出所有 key（需 admin token）
//   /api/save      → POST 保存 key-value（需 admin token）
//   /api/delete    → POST 删除 key（需 admin token）
//   /api/get       → GET  读取 key 内容（纯文本，readToken 鉴权）
//   /config        → 配置信息页（旧版兼容）
//   /{key}         → 直接访问 key 内容（旧版兼容）
//   /{key}?text=   → 通过 URL 写入（旧版兼容）

// ===== 内嵌 HTML（管理界面）=====
var INDEX_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CF-Workers-TEXT2KV Admin</title>
<script>
(function(){
    try {
        var stored = localStorage.getItem('text2kv_cf_theme');
        var mode = stored;
        if (mode !== 'light' && mode !== 'dark') {
            mode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
        }
        document.documentElement.setAttribute('data-theme', mode);
    } catch(e) {
        document.documentElement.setAttribute('data-theme', 'light');
    }
})();
</script>
<style>
* { box-sizing: border-box; }
:root {
    --bg: #f6f7f9; --surface: #ffffff; --text: #1f2937; --text-secondary: #4b5563;
    --text-muted: #6b7280; --border: #e5e7eb; --border-strong: #d1d5db; --hover: #f3f4f6;
    --header-bg: linear-gradient(135deg, #f97316, #ea580c); --header-text: #ffffff;
    --header-btn-bg: rgba(255,255,255,0.2); --header-btn-border: rgba(255,255,255,0.3);
    --header-btn-text: #ffffff; --primary-bg: #fb923c; --primary-text: #1c0a00;
    --primary-hover-bg: #f97316; --secondary-bg: #ffffff; --secondary-text: #1f2937;
    --secondary-hover-bg: #f3f4f6; --danger-bg: #dc2626; --danger-text: #ffffff;
    --danger-hover-bg: #b91c1c; --badge-locked-bg: #fef3c7; --badge-locked-text: #7c2d12;
    --badge-public-bg: #dcfce7; --badge-public-text: #166534; --toast-bg: #ffffff;
    --toast-text: #1f2937; --toast-shadow: 0 4px 12px rgba(0,0,0,0.15);
    --modal-shadow: 0 10px 40px rgba(0,0,0,0.25);
}
:root[data-theme="dark"] {
    --bg: #0f172a; --surface: #1e293b; --text: #f3f4f6; --text-secondary: #cbd5e1;
    --text-muted: #94a3b8; --border: #374151; --border-strong: #4b5563; --hover: #334155;
    --header-bg: linear-gradient(135deg, #fdba74, #fb923c); --header-text: #1c0a00;
    --header-btn-bg: rgba(0,0,0,0.15); --header-btn-border: rgba(0,0,0,0.25);
    --header-btn-text: #1c0a00; --primary-bg: #fb923c; --primary-text: #1c0a00;
    --primary-hover-bg: #f97316; --secondary-bg: #334155; --secondary-text: #f3f4f6;
    --secondary-hover-bg: #475569; --danger-bg: #ef4444; --danger-text: #0f172a;
    --danger-hover-bg: #dc2626; --badge-locked-bg: #fbbf24; --badge-locked-text: #7c2d12;
    --badge-public-bg: #86efac; --badge-public-text: #14532d; --toast-bg: #1e293b;
    --toast-text: #f3f4f6; --toast-shadow: 0 4px 12px rgba(0,0,0,0.5);
    --modal-shadow: 0 10px 40px rgba(0,0,0,0.6);
}
body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; background: var(--bg); color: var(--text); line-height: 1.5; }
header { background: var(--header-bg); color: var(--header-text); padding: 16px 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.header-inner { max-width: 1000px; margin: 0 auto; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.header-title { font-size: 18px; font-weight: 600; margin: 0; }
.header-subtitle { font-size: 13px; opacity: 0.8; margin-left: 8px; }
.header-spacer { flex: 1; }
.header-status { font-size: 13px; opacity: 0.9; }
.btn-header { padding: 5px 12px; background: var(--header-btn-bg); color: var(--header-btn-text); border: 1px solid var(--header-btn-border); border-radius: 4px; cursor: pointer; font-size: 13px; transition: background 0.15s; }
.btn-header:hover { background: rgba(255,255,255,0.35); }
:root[data-theme="dark"] .btn-header:hover { background: rgba(0,0,0,0.25); }
#theme-btn { padding: 5px 10px; background: #ffffff; color: #ea580c; border: 1px solid rgba(255,255,255,0.5); border-radius: 4px; cursor: pointer; font-size: 13px; transition: background 0.15s, color 0.15s; }
#theme-btn:hover { background: #f0f0f0; }
main { max-width: 1000px; margin: 24px auto; padding: 0 24px; }
.card { background: var(--surface); padding: 24px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); margin-bottom: 20px; }
:root[data-theme="dark"] .card { box-shadow: 0 2px 10px rgba(0,0,0,0.4); }
.login-card { max-width: 480px; margin: 60px auto; }
.login-card h2 { margin-top: 0; }
.login-card p { color: var(--text-secondary); }
.login-card code { background: var(--hover); padding: 2px 6px; border-radius: 3px; font-size: 13px; color: var(--text); }
.toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
.toolbar input[type="search"] { flex: 1; min-width: 200px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 4px; font-size: 14px; background: var(--surface); color: var(--text); }
.toolbar input[type="search"]::placeholder { color: var(--text-muted); }
.toolbar .stats { color: var(--text-muted); font-size: 14px; white-space: nowrap; }
button.btn { padding: 8px 14px; border-radius: 4px; border: 1px solid var(--border); background: var(--secondary-bg); color: var(--secondary-text); cursor: pointer; font-size: 14px; transition: background 0.15s; }
button.btn:hover { background: var(--secondary-hover-bg); }
button.btn:disabled { opacity: 0.6; cursor: not-allowed; }
button.btn-primary { background: var(--primary-bg); color: var(--primary-text); border-color: var(--primary-bg); font-weight: 500; }
button.btn-primary:hover { background: var(--primary-hover-bg); border-color: var(--primary-hover-bg); }
button.btn-danger { background: var(--danger-bg); color: var(--danger-text); border-color: var(--danger-bg); }
button.btn-danger:hover { background: var(--danger-hover-bg); border-color: var(--danger-hover-bg); }
button.btn-sm { padding: 4px 10px; font-size: 13px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
thead th { text-align: left; padding: 10px 12px; background: var(--hover); border-bottom: 2px solid var(--border); font-weight: 600; color: var(--text-secondary); font-size: 13px; }
tbody td { padding: 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
tbody tr:hover { background: var(--hover); }
td.key { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; word-break: break-all; color: var(--text); font-weight: 500; }
td.actions { text-align: right; white-space: nowrap; }
td.actions .btn-sm { margin-left: 6px; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 500; }
.badge-locked { background: var(--badge-locked-bg); color: var(--badge-locked-text); }
.badge-public { background: var(--badge-public-bg); color: var(--badge-public-text); }
.empty { text-align: center; padding: 48px 20px; color: var(--text-muted); }
.empty h3 { color: var(--text-secondary); margin: 0 0 8px 0; }
.empty p { margin: 0; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
.modal-backdrop[hidden] { display: none; }
.modal { background: var(--surface); border-radius: 8px; box-shadow: var(--modal-shadow); width: 100%; max-width: 640px; max-height: 90vh; display: flex; flex-direction: column; }
.modal-header { padding: 16px 20px; border-bottom: 1px solid var(--border); }
.modal-header h3 { margin: 0; font-size: 16px; }
.modal-body { padding: 20px; overflow-y: auto; flex: 1; }
.modal-footer { padding: 14px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }
.field { margin-bottom: 16px; }
.field:last-child { margin-bottom: 0; }
.field label { display: block; margin-bottom: 6px; font-weight: 500; color: var(--text-secondary); font-size: 14px; }
.field .hint { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.field input, .field textarea { width: 100%; padding: 10px 12px; border: 1px solid var(--border-strong); border-radius: 4px; font-family: inherit; font-size: 14px; background: var(--surface); color: var(--text); }
.field input::placeholder, .field textarea::placeholder { color: var(--text-muted); }
.field input:focus, .field textarea:focus { outline: none; border-color: #fb923c; box-shadow: 0 0 0 3px rgba(251, 146, 60, 0.2); }
.field textarea { min-height: 220px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; resize: vertical; line-height: 1.5; }
.field input[disabled] { background: var(--hover); color: var(--text-muted); cursor: not-allowed; }
.checkbox-row { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); margin-top: 8px; }
.checkbox-row input { width: auto; margin: 0; }
#toasts { position: fixed; top: 20px; right: 20px; display: flex; flex-direction: column; gap: 8px; z-index: 200; pointer-events: none; }
.toast { background: var(--toast-bg); color: var(--toast-text); padding: 12px 16px; border-radius: 6px; box-shadow: var(--toast-shadow); border-left: 4px solid #fb923c; min-width: 240px; max-width: 380px; font-size: 14px; animation: slide-in 0.2s ease-out; pointer-events: auto; }
.toast.success { border-left-color: #22c55e; }
.toast.error { border-left-color: #ef4444; }
@keyframes slide-in { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
[hidden] { display: none !important; }
@media (max-width: 640px) { main { padding: 0 12px; } .card { padding: 16px; } .header-inner { flex-wrap: wrap; } }
</style>
</head>
<body>
<header>
    <div class="header-inner">
        <h1 class="header-title">CF-Workers-TEXT2KV</h1>
        <span class="header-subtitle">Admin Console</span>
        <div class="header-spacer"></div>
        <span id="status" class="header-status">未登录</span>
        <button id="theme-btn" class="btn-header" onclick="toggleTheme()" title="切换浅色/深色主题">🌙 深色</button>
        <button id="logout-btn" class="btn-header" onclick="logout()" hidden>退出</button>
    </div>
</header>
<main>
    <div id="login-view" class="card login-card">
        <h2>登录</h2>
        <p>输入你在 Cloudflare Workers 环境变量中配置的 <code>TOKEN</code>。</p>
        <div class="field" style="margin-top:16px;">
            <label for="login-token">Admin Token</label>
            <input type="password" id="login-token" placeholder="粘贴你的 Admin Token" autocomplete="off">
        </div>
        <label class="checkbox-row">
            <input type="checkbox" id="remember">
            记住我（Token 将保存至本浏览器 localStorage）
        </label>
        <button id="login-btn" class="btn btn-primary" style="margin-top:16px;" onclick="login()">登录</button>
    </div>
    <div id="admin-view" hidden>
        <div class="card">
            <div class="toolbar">
                <button class="btn btn-primary" onclick="openCreate()">＋ 新建 Key</button>
                <input type="search" id="search" placeholder="🔍 过滤 key..." oninput="renderList()">
                <span class="stats" id="stats">加载中…</span>
                <button class="btn" onclick="loadList()">🔄 刷新</button>
            </div>
            <div id="list-container">
                <table>
                    <thead><tr><th style="width:50%;">Key</th><th style="width:20%;">Read Token</th><th style="width:30%;">操作</th></tr></thead>
                    <tbody id="list-body"></tbody>
                </table>
            </div>
            <div id="empty" hidden class="empty">
                <h3>还没有 Key</h3>
                <p>点击「＋ 新建 Key」创建第一条记录</p>
            </div>
        </div>
    </div>
</main>
<div id="edit-modal" class="modal-backdrop" hidden>
    <div class="modal">
        <div class="modal-header"><h3 id="edit-title">新建 Key</h3></div>
        <div class="modal-body">
            <div class="field">
                <label for="edit-key">Key</label>
                <input type="text" id="edit-key" placeholder="my-key" maxlength="200" autocomplete="off">
                <div class="hint">仅允许字母、数字、连字符，最长 200 字符</div>
            </div>
            <div class="field">
                <label for="edit-content">Content <span id="content-size" style="font-weight:normal;color:var(--text-muted);font-size:13px;"></span></label>
                <textarea id="edit-content" placeholder="输入文本内容..."></textarea>
            </div>
            <div class="field">
                <label for="edit-token">Read Token <span style="font-weight:normal;color:var(--text-muted);">(可选)</span></label>
                <input type="text" id="edit-token" placeholder="留空则公开可读" autocomplete="off">
                <div class="hint">设置后，读取此 key 需要提供匹配的 readToken。</div>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn" onclick="closeEdit()">取消</button>
            <button id="edit-save-btn" class="btn btn-primary" onclick="saveKey()">保存</button>
        </div>
    </div>
</div>
<div id="delete-modal" class="modal-backdrop" hidden>
    <div class="modal" style="max-width:440px;">
        <div class="modal-header"><h3>确认删除</h3></div>
        <div class="modal-body">
            <p>确定要删除以下 key 吗？此操作不可撤销：</p>
            <pre id="delete-key" style="background:var(--hover);padding:10px;border-radius:4px;font-family:ui-monospace,monospace;font-size:13px;word-break:break-all;margin:8px 0;color:var(--text);"></pre>
        </div>
        <div class="modal-footer">
            <button class="btn" onclick="closeDelete()">取消</button>
            <button id="delete-confirm-btn" class="btn btn-danger" onclick="confirmDelete()">删除</button>
        </div>
    </div>
</div>
<div id="toasts"></div>
<script>
var THEME_KEY = 'text2kv_cf_theme';
function currentTheme() { return document.documentElement.getAttribute('data-theme') || 'light'; }
function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    var btn = document.getElementById('theme-btn');
    if (btn) {
        if (t === 'dark') { btn.innerHTML = '☀️ 浅色'; btn.title = '切换到浅色主题'; }
        else { btn.innerHTML = '🌙 深色'; btn.title = '切换到深色主题'; }
    }
}
function toggleTheme() {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
}
(function() {
    var stored = (function() { try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; } })();
    if (stored !== 'light' && stored !== 'dark') {
        try {
            var mq = window.matchMedia('(prefers-color-scheme: dark)');
            if (mq.addEventListener) mq.addEventListener('change', function(e) {
                var s = (function(){ try { return localStorage.getItem(THEME_KEY); } catch(_){ return null; } })();
                if (s !== 'light' && s !== 'dark') applyTheme(e.matches ? 'dark' : 'light');
            });
        } catch (e) {}
    }
    applyTheme(currentTheme());
})();
var STORAGE_KEY = 'text2kv_cf_admin_token';
var KEY_REGEX = /^[a-zA-Z0-9-]{1,200}$/;
var state = { token: null, keys: [], editing: null, deleting: null };
function $(id) { return document.getElementById(id); }
function toast(msg, type) {
    type = type || 'info';
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(function() {
        el.style.transition = 'opacity 0.3s';
        el.style.opacity = '0';
        setTimeout(function() { el.remove(); }, 300);
    }, 3000);
}
async function api(method, path, body) {
    if (!state.token) throw new Error('未登录');
    var opts = { method: method, headers: { 'Authorization': 'Bearer ' + state.token } };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    var res;
    try { res = await fetch(path, opts); } catch (e) { throw new Error('网络错误，请检查连接'); }
    var ct = res.headers.get('content-type') || '';
    var data;
    if (ct.indexOf('application/json') !== -1) {
        try { data = await res.json(); } catch (e) { data = {}; }
    } else {
        var txt = await res.text();
        var urlObj = new URL(path, window.location.origin);
        data = { key: urlObj.searchParams.get('key') || '', content: txt };
    }
    if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
    return data;
}
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
}
async function login() {
    var t = $('login-token').value.trim();
    if (!t) { toast('请输入 Admin Token', 'error'); return; }
    var btn = $('login-btn');
    btn.disabled = true; btn.textContent = '登录中…'; state.token = t;
    try {
        var data = await api('GET', '/api/list');
        state.keys = Array.isArray(data) ? data : [];
        if ($('remember').checked) localStorage.setItem(STORAGE_KEY, t);
        else localStorage.removeItem(STORAGE_KEY);
        enterAdmin();
    } catch (e) { state.token = null; toast('登录失败: ' + e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = '登录'; }
}
async function tryAutoLogin() {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    state.token = saved;
    $('login-token').value = saved; $('remember').checked = true;
    try {
        var data = await api('GET', '/api/list');
        state.keys = Array.isArray(data) ? data : [];
        enterAdmin();
    } catch (e) { state.token = null; localStorage.removeItem(STORAGE_KEY); toast('自动登录失败: ' + e.message, 'error'); }
}
function logout() {
    state.token = null; state.keys = [];
    localStorage.removeItem(STORAGE_KEY);
    $('login-token').value = ''; $('remember').checked = false;
    $('status').textContent = '未登录'; $('logout-btn').hidden = true;
    $('admin-view').hidden = true; $('login-view').hidden = false;
}
function enterAdmin() {
    $('status').textContent = '已登录'; $('logout-btn').hidden = false;
    $('login-view').hidden = true; $('admin-view').hidden = false;
    renderList();
}
async function loadList() {
    if (!state.token) return;
    $('stats').textContent = '加载中…';
    try { var data = await api('GET', '/api/list'); state.keys = Array.isArray(data) ? data : []; renderList(); }
    catch (e) { $('stats').textContent = '加载失败'; toast('加载列表失败: ' + e.message, 'error'); }
}
function renderList() {
    var q = ($('search').value || '').trim().toLowerCase();
    var filtered = state.keys.filter(function(k) { return !q || k.key.toLowerCase().includes(q); });
    $('stats').textContent = filtered.length + ' / ' + state.keys.length + ' 条';
    if (state.keys.length === 0) { $('list-container').hidden = true; $('empty').hidden = false; $('list-body').innerHTML = ''; return; }
    $('list-container').hidden = false; $('empty').hidden = true;
    if (filtered.length === 0) { $('list-body').innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:24px;">没有匹配的 Key</td></tr>'; return; }
    $('list-body').innerHTML = filtered.map(function(k) {
        var tokenBadge = k.readToken ? '<span class="badge badge-locked">🔒 需 Token</span>' : '<span class="badge badge-public">🌐 公开</span>';
        return '<tr data-key="' + escapeHtml(k.key) + '"><td class="key">' + escapeHtml(k.key) + '</td><td>' + tokenBadge + '</td><td class="actions"><button class="btn btn-sm" data-action="copy" title="复制访问链接">链接</button><button class="btn btn-sm btn-primary" data-action="edit">编辑</button><button class="btn btn-sm btn-danger" data-action="delete">删除</button></td></tr>';
    }).join('');
}
function openCreate() {
    state.editing = 'new';
    $('edit-title').textContent = '新建 Key';
    $('edit-key').value = ''; $('edit-key').disabled = false;
    $('edit-content').value = ''; $('edit-token').value = '';
    updateContentSize(); $('edit-modal').hidden = false;
    setTimeout(function() { $('edit-key').focus(); }, 0);
}
async function openEdit(key) {
    state.editing = { key: key, readToken: null };
    $('edit-title').textContent = '编辑 Key';
    $('edit-key').value = key; $('edit-key').disabled = true;
    $('edit-content').value = '加载中…'; $('edit-token').value = '';
    updateContentSize(); $('edit-modal').hidden = false;
    try {
        var found = state.keys.find(function(k) { return k.key === key; });
        var readToken = (found && found.readToken) || '';
        state.editing.readToken = readToken;
        var url = '/api/get?key=' + encodeURIComponent(key) + '&readToken=' + encodeURIComponent(readToken);
        var data = await api('GET', url);
        $('edit-content').value = (data.content != null) ? data.content : '';
        $('edit-token').value = readToken; updateContentSize();
    } catch (e) { $('edit-content').value = ''; toast('加载内容失败: ' + e.message, 'error'); }
}
function closeEdit() { state.editing = null; $('edit-modal').hidden = true; }
async function saveKey() {
    var key = $('edit-key').value.trim();
    var content = $('edit-content').value;
    var readToken = $('edit-token').value.trim();
    if (!key) { toast('Key 不能为空', 'error'); return; }
    if (!KEY_REGEX.test(key)) { toast('Key 仅允许字母、数字、连字符，最长 200 字符', 'error'); return; }
    var btn = $('edit-save-btn'); btn.disabled = true; btn.textContent = '保存中…';
    try { await api('POST', '/api/save', { key: key, content: content, readToken: readToken }); toast('保存成功', 'success'); closeEdit(); loadList(); }
    catch (e) { toast('保存失败: ' + e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = '保存'; }
}
function openDelete(key) {
    var found = state.keys.find(function(k) { return k.key === key; });
    state.deleting = { key: key, readToken: (found && found.readToken) || '' };
    $('delete-key').textContent = key; $('delete-modal').hidden = false;
}
function closeDelete() { state.deleting = null; $('delete-modal').hidden = true; }
async function confirmDelete() {
    if (!state.deleting) return;
    var btn = $('delete-confirm-btn'); btn.disabled = true; btn.textContent = '删除中…';
    try { await api('POST', '/api/delete', { key: state.deleting.key, readToken: state.deleting.readToken }); toast('已删除: ' + state.deleting.key, 'success'); closeDelete(); loadList(); }
    catch (e) { toast('删除失败: ' + e.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = '删除'; }
}
async function copyKey(key) {
    var url = window.location.origin + '/api/get?key=' + encodeURIComponent(key);
    var found = state.keys.find(function(k) { return k.key === key; });
    if (found && found.readToken) url += '&readToken=' + encodeURIComponent(found.readToken);
    try { await navigator.clipboard.writeText(url); toast('访问链接已复制', 'success'); }
    catch (e) {
        try {
            var ta = document.createElement('textarea'); ta.value = url;
            ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
            toast('访问链接已复制', 'success');
        } catch (e2) { toast('复制失败', 'error'); }
    }
}
function updateContentSize() { var len = $('edit-content').value.length; $('content-size').textContent = len > 0 ? '(' + len + ' 字符)' : ''; }
function initEvents() {
    $('list-body').addEventListener('click', function(e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        var tr = btn.closest('tr');
        if (!tr || !tr.dataset.key) return;
        var key = tr.dataset.key, action = btn.dataset.action;
        if (action === 'copy') copyKey(key);
        else if (action === 'edit') openEdit(key);
        else if (action === 'delete') openDelete(key);
    });
    ['edit-modal', 'delete-modal'].forEach(function(id) {
        $(id).addEventListener('click', function(e) {
            if (e.target === $(id)) {
                $(id).hidden = true;
                if (id === 'edit-modal') state.editing = null;
                else state.deleting = null;
            }
        });
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { $('edit-modal').hidden = true; $('delete-modal').hidden = true; state.editing = null; state.deleting = null; }
    });
    $('login-token').addEventListener('keydown', function(e) { if (e.key === 'Enter') login(); });
    $('edit-content').addEventListener('input', updateContentSize);
}
document.addEventListener('DOMContentLoaded', function() { initEvents(); tryAutoLogin(); });
</script>
</body>
</html>`;

// ===== Worker =====
export default {
    async fetch(request, env) {
        try {
            const url = new URL(request.url);
            const path = url.pathname;

            // CORS
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

            const json = (data, status = 200) => new Response(JSON.stringify(data), {
                status, headers: { ...baseHeaders, 'Content-Type': 'application/json; charset=utf-8' }
            });
            const text = (body, status = 200) => new Response(body, {
                status, headers: { ...baseHeaders, 'Content-Type': 'text/plain; charset=utf-8' }
            });
            const html = (body, status = 200) => new Response(body, {
                status, headers: { ...baseHeaders, 'Content-Type': 'text/html; charset=utf-8' }
            });

            const getAuth = (req, u) => {
                const h = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
                return h || (u.searchParams.get('token') || '').trim();
            };
            const adminToken = (env.TOKEN || 'passwd').trim();
            const isAdmin = () => getAuth(request, url) === adminToken;

            const validateKey = (k) => {
                if (!k || typeof k !== 'string') return 'Key 不能为空';
                if (!/^[a-zA-Z0-9-]{1,200}$/.test(k))
                    return 'Key 仅允许字母、数字、连字符，最长 200 字符';
                return null;
            };

            const buildFullKey = (filename, readToken) => readToken ? filename + ':' + readToken : filename;

            // ===== 管理界面（内嵌 HTML）=====
            if (path === '/' || path === '/index.html') {
                return html(INDEX_HTML);
            }

            // ===== API Routes =====
            if (path === '/api/list') {
                if (!isAdmin()) return json({ error: '鉴权失败' }, 403);
                const list = await env.KV.list({ limit: 1000 });
                const keys = [];
                for (const kvKey of list.keys) {
                    const ci = kvKey.name.indexOf(':');
                    if (ci === -1) {
                        keys.push({ key: kvKey.name, readToken: '' });
                    } else {
                        keys.push({ key: kvKey.name.substring(0, ci), readToken: kvKey.name.substring(ci + 1) });
                    }
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
                await env.KV.put(buildFullKey(key, readToken || ''), content || '');
                return json({ success: true });
            }

            if (path === '/api/delete') {
                if (!isAdmin()) return json({ error: '鉴权失败' }, 403);
                let body = {};
                try { body = await request.json(); } catch { return json({ error: '无效的 JSON 请求体' }, 400); }
                const { key, readToken } = body;
                if (!key) return json({ error: 'Key 不能为空' }, 400);
                await env.KV.del(buildFullKey(key, readToken || ''));
                return json({ success: true });
            }

            if (path === '/api/get') {
                const key = (url.searchParams.get('key') || '').trim();
                const readToken = (url.searchParams.get('readToken') || '').trim();
                if (!key) return json({ error: 'Key 无效' }, 400);
                const content = await env.KV.get(buildFullKey(key, readToken));
                if (content === null) return json({ error: 'Key 不存在' }, 404);
                return text(content);
            }

            // ===== Legacy Routes（旧版兼容）=====
            if (path === '/config' || path === '/' + adminToken) {
                const legacyAuth = url.searchParams.get('token') === adminToken;
                if (!legacyAuth) return text('token 有误', 403);
                return html(configHTML(url.hostname, adminToken));
            }

            if (path === '/config/update.bat') {
                if (url.searchParams.get('token') !== adminToken) return text('token 有误', 403);
                return new Response(generateBatScript(url.hostname, adminToken), {
                    headers: { ...baseHeaders, 'Content-Disposition': 'attachment; filename=update.bat' }
                });
            }

            if (path === '/config/update.sh') {
                if (url.searchParams.get('token') !== adminToken) return text('token 有误', 403);
                return new Response(generateShScript(url.hostname, adminToken), {
                    headers: { ...baseHeaders, 'Content-Disposition': 'attachment; filename=update.sh' }
                });
            }

            // 旧版直接访问：/{key}?token=xxx
            const isSkip = (path === '/') || path.startsWith('/config') || path.startsWith('/api/');
            const isConfigPath = path === '/' + adminToken;

            if (!isSkip && !isConfigPath) {
                const legacyKey = path.substring(1);
                const textParam = url.searchParams.get('text');
                const b64Param = url.searchParams.get('b64');
                const legacyAuth = url.searchParams.get('token') === adminToken;

                if (textParam || b64Param) {
                    if (!legacyAuth) return text('token 有误', 403);
                    const content = textParam || base64Decode(replaceSpacesWithPlus(b64Param));
                    await env.KV.put(legacyKey, content);
                    const verified = await env.KV.get(legacyKey);
                    if (verified !== content) return text('Content verification failed', 500);
                    return text(verified);
                } else {
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
    } catch (e) { throw new Error('无效的 Base64 字符串'); }
}
function replaceSpacesWithPlus(str) { return str.replace(/ /g, '+'); }

function generateBatScript(domain, token) {
    return [
        '@echo off', 'chcp 65001', 'setlocal', '',
        `set "DOMAIN=${domain}"`, `set "TOKEN=${token}"`, '',
        'set "FILENAME=%~nx1"', '',
        "for /f \"delims=\" %%i in ('powershell -command \"$content = ((Get-Content -Path '%cd%/%FILENAME%' -Encoding UTF8) | Select-Object -First 65) -join [Environment]::NewLine; [convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content))\"') do set \"BASE64_TEXT=%%i\"",
        '', 'set "URL=https://%DOMAIN%/%FILENAME%?token=%TOKEN%^&b64=%BASE64_TEXT%"', '',
        'start %URL%', 'endlocal', '',
        'echo 更新数据完成，5秒后自动关闭窗口...', 'timeout /t 5 >nul', 'exit'
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
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CF-Workers-TEXT2KV 配置信息</title>
<style>
*{box-sizing:border-box}body{font-family:'Segoe UI',system-ui,sans-serif;padding:20px;max-width:800px;margin:0 auto;background:#f6f7f9;color:#1f2937}
h1{text-align:center;font-size:1.5rem}h2{font-size:1.2rem;margin-top:20px}
pre{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px;overflow-x:auto}
.container{background:#fff;border-radius:10px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
.tips{color:#6b7280;font-size:0.85em;border-left:3px solid #e5e7eb;padding-left:10px;margin:10px 0}
button{padding:8px 16px;border:none;border-radius:5px;cursor:pointer;font-size:0.9rem}
.btn-primary{background:#0052d9;color:#fff}.btn-primary:hover{background:#003ebb}
a{color:#0052d9;text-decoration:none}a:hover{text-decoration:underline}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:0.75em;font-weight:600}
.badge-new{background:#d1fae5;color:#065f46}
.flex-row{display:flex;align-items:center;gap:8px;margin-bottom:12px}
</style>
</head>
<body>
<div class="container">
<h1>TEXT2KV 配置信息</h1>
<p><strong>服务域名:</strong> ${domain}<br><strong>TOKEN:</strong> ${token}<br>
<strong>管理界面:</strong> <a href="/">点击进入</a> <span class="badge badge-new">NEW</span></p>
<p class="tips"><strong>注意!</strong> 脚本更新方式因 URL 长度限制，一次最多更新 65 行内容。推荐使用管理界面进行完整 CRUD 操作。</p>
<h2>Windows 脚本</h2>
<div class="flex-row"><button class="btn-primary" onclick="window.open('https://${domain}/config/update.bat?token=${token}&t='+Date.now(),'_blank')">下载 update.bat</button></div>
<pre><code>update.bat 文件名</code></pre>
<h2>Linux 脚本</h2>
<div class="flex-row"><button class="btn-primary" onclick="copyLinuxScript()">复制安装命令</button></div>
<pre><code>curl "https://${domain}/config/update.sh?token=${token}" -o update.sh && chmod +x update.sh</code></pre>
<h2>API 调用示例</h2>
<pre><code># 创建 Key
curl -X POST "https://${domain}/api/save?token=${token}" -H "Content-Type: application/json" -d '{"key":"my-key","content":"Hello World"}'

# 读取 Key（返回纯文本）
curl "https://${domain}/api/get?key=my-key"

# 列出所有 Key
curl "https://${domain}/api/list?token=${token}"</code></pre>
</div>
<script>
function copyLinuxScript(){
    var cmd='curl "https://${domain}/config/update.sh?token=${token}" -o update.sh && chmod +x update.sh';
    navigator.clipboard.writeText(cmd).then(function(){alert('已复制到剪贴板');});
}
</script>
</body>
</html>`;
}
