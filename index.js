import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml')

export const name = 'mcp-admin'
export const inject = ['webServer', 'mcpManager']

const JS_TYPE = new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', resolve: () => true, construct: (s) => s })
const SCHEMA = yaml.DEFAULT_SCHEMA.extend([JS_TYPE])

function patchFile(config) {
  const dir = (config && config.profileDir) || join(homedir(), '.dsh', 'profiles', 'desktop')
  return join(dir, 'cordis.patch.yml')
}

function loadServers(file) {
  const doc = yaml.load(readFileSync(file, 'utf8'), { schema: SCHEMA }) || []
  const entry = doc.find((e) => e && e.id === 'mcp-manager')
  return (entry && entry.config && entry.config.servers) || {}
}

function renderBlock(servers) {
  const body = yaml.dump({ servers }, { lineWidth: 200, noRefs: true })
  const indented = body.split('\n').filter((l) => l.length).map((l) => '    ' + l).join('\n')
  return '- id: mcp-manager\n  config:\n' + indented
}

function saveServers(file, servers) {
  const txt = readFileSync(file, 'utf8')
  const lines = txt.split(/\r?\n/)
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^-\s+id:\s*mcp-manager\s*$/.test(lines[i])) { start = i; break }
  }
  const block = renderBlock(servers)
  if (start === -1) {
    writeFileSync(file, txt.replace(/\s*$/, '') + '\n' + block + '\n', 'utf8')
    return
  }
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^-\s/.test(lines[i])) { end = i; break }
  }
  const before = lines.slice(0, start).join('\n').replace(/\s*$/, '')
  const after = lines.slice(end).join('\n').replace(/^\s*\n*/, '')
  const out = (before ? before + '\n' : '') + block + '\n' + (after ? after + '\n' : '')
  writeFileSync(file, out, 'utf8')
}

function isLoopback(req) {
  const a = (req.socket && req.socket.remoteAddress) || ''
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1'
}

function send(res, code, type, body) {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(body)
}

function sendJson(res, code, value) {
  send(res, code, 'application/json; charset=utf-8', JSON.stringify(value))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > 1024 * 1024) { reject(new Error('body too large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const PAGE = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MCP 服务器管理</title>
<style>
  :root { color-scheme: light dark; --bd: rgba(127,127,127,.35); --bg: rgba(127,127,127,.08); }
  * { box-sizing: border-box; }
  body { font: 14px/1.55 system-ui, "Segoe UI", "Microsoft YaHei", sans-serif; margin: 0; padding: 24px; max-width: 1080px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { margin: 0 0 18px; opacity: .65; }
  .card { border: 1px solid var(--bd); border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; background: var(--bg); }
  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .name { font-weight: 600; font-size: 15px; }
  .tag { font-size: 12px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--bd); opacity: .85; }
  .ok { color: #16874a; border-color: #16874a; }
  .bad { color: #c0392b; border-color: #c0392b; }
  .muted { opacity: .6; font-size: 12px; }
  button { font: inherit; padding: 5px 12px; border-radius: 7px; border: 1px solid var(--bd); background: transparent; cursor: pointer; }
  button.primary { background: #3b6fe0; border-color: #3b6fe0; color: #fff; }
  button.danger { color: #c0392b; border-color: #c0392b; }
  input, select, textarea { font: inherit; padding: 5px 8px; border-radius: 7px; border: 1px solid var(--bd); background: transparent; color: inherit; }
  textarea { width: 100%; min-height: 90px; font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
  label { display: block; font-size: 12px; opacity: .7; margin: 10px 0 3px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  #toast { position: fixed; right: 20px; bottom: 20px; padding: 10px 14px; border-radius: 8px; background: #222; color: #fff; opacity: 0; transition: opacity .2s; font-size: 13px; }
  #toast.show { opacity: .92; }
  dialog { border: 1px solid var(--bd); border-radius: 12px; padding: 18px; width: 560px; max-width: 92vw; background: Canvas; color: CanvasText; }
  .hint { font-size: 12px; opacity: .6; margin-top: 8px; }
</style>
</head>
<body>
<h1>MCP 服务器管理</h1>
<p class="sub">管理 <code>@deepseek-ai/dsh-mcp-manager</code> 的 <code>config.servers</code>（写入 profile 的 <code>cordis.patch.yml</code>）。保存后需重启 DSH 生效。</p>
<div id="list"></div>
<div class="row" style="margin:18px 0">
  <button class="primary" id="add">新增服务器</button>
  <button id="save" disabled>保存更改</button>
  <button id="restart">保存并重启 DSH</button>
  <button id="reload">重新载入</button>
</div>
<p class="hint" id="status"></p>
<dialog id="editor">
  <form method="dialog" id="form">
    <h2 style="font-size:16px;margin:0 0 8px" id="editorTitle">服务器</h2>
    <label>名称（[A-Za-z0-9_-]{1,32}）</label>
    <input id="f_name" style="width:100%">
    <div class="grid2">
      <div><label>传输</label><select id="f_transport"><option value="streamable-http">streamable-http</option><option value="stdio">stdio</option></select></div>
      <div><label>启用</label><select id="f_enabled"><option value="true">是</option><option value="false">否</option></select></div>
    </div>
    <div id="http_fields">
      <label>URL</label><input id="f_url" style="width:100%" placeholder="https://example.com/mcp">
      <label>Headers（每行 Key: Value）</label><textarea id="f_headers" placeholder="Authorization: Bearer xxx"></textarea>
    </div>
    <div id="stdio_fields" hidden>
      <label>命令</label><input id="f_command" style="width:100%" placeholder="npx">
      <label>参数（空格分隔）</label><input id="f_args" style="width:100%" placeholder="-y @modelcontextprotocol/server-github">
      <label>环境变量（每行 KEY=VALUE）</label><textarea id="f_env"></textarea>
      <label>工作目录</label><input id="f_cwd" style="width:100%">
    </div>
    <div class="row" style="margin-top:16px;justify-content:flex-end">
      <button value="cancel">取消</button>
      <button class="primary" value="ok" id="editorOk">确定</button>
    </div>
  </form>
</dialog>
<div id="toast"></div>
<script>
let servers = {};
let dirty = false;
let editing = null;

const $ = (id) => document.getElementById(id);
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600); }
function statusClass(s) { if (!s) return ''; if (String(s).includes('connected') || String(s).includes('running')) return 'ok'; return 'bad'; }

async function load() {
  const r = await fetch('/mcp-admin/api/state');
  const data = await r.json();
  servers = data.servers || {};
  const runtime = {};
  for (const item of data.runtime || []) runtime[item.name] = item;
  render(runtime);
  $('status').textContent = '配置文件: ' + data.file + (data.error ? ' | 错误: ' + data.error : '');
  dirty = false;
  $('save').disabled = true;
}

function render(runtime) {
  const list = $('list');
  list.innerHTML = '';
  const names = Object.keys(servers);
  if (!names.length) { list.innerHTML = '<div class="card muted">还没有配置任何 MCP 服务器。</div>'; return; }
  for (const name of names) {
    const s = servers[name] || {};
    const rt = runtime[name] || {};
    const el = document.createElement('div');
    el.className = 'card';
    const target = s.transport === 'stdio' ? ((s.command || '') + ' ' + ((s.args || []).join(' '))).trim() : (s.url || '');
    const statusText = rt.status ? JSON.stringify(rt.status).slice(0, 120) : '未加载';
    el.innerHTML = '<div class="row">' +
      '<span class="name"></span>' +
      '<span class="tag"></span>' +
      '<span class="tag"></span>' +
      '<span class="muted"></span>' +
      '<span style="flex:1"></span>' +
      '<button data-act="edit">编辑</button>' +
      '<button class="danger" data-act="del">删除</button>' +
      '</div>';
    el.querySelector('.name').textContent = name;
    const tags = el.querySelectorAll('.tag');
    tags[0].textContent = s.transport || 'streamable-http';
    tags[1].textContent = s.enabled === false ? '已停用' : '启用';
    const st = el.querySelector('.muted');
    st.textContent = target + ' | ' + statusText;
    st.classList.add(statusClass(statusText));
    el.querySelector('[data-act=edit]').onclick = () => openEditor(name, s);
    el.querySelector('[data-act=del]').onclick = () => { if (confirm('删除 ' + name + ' ?')) { delete servers[name]; markDirty(); render(runtime); } };
    list.appendChild(el);
  }
}

function markDirty() { dirty = true; $('save').disabled = false; }

function parseLines(text, sep) {
  const out = {};
  for (const line of (text || '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf(sep);
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function openEditor(name, s) {
  editing = name;
  $('editorTitle').textContent = name ? '编辑服务器：' + name : '新增服务器';
  $('f_name').value = name || '';
  $('f_name').disabled = !!name;
  $('f_transport').value = s.transport || 'streamable-http';
  $('f_enabled').value = s.enabled === false ? 'false' : 'true';
  $('f_url').value = s.url || '';
  $('f_headers').value = Object.entries(s.headers || {}).map(([k, v]) => k + ': ' + v).join('\n');
  $('f_command').value = s.command || '';
  $('f_args').value = (s.args || []).join(' ');
  $('f_env').value = Object.entries(s.env || {}).map(([k, v]) => k + '=' + v).join('\n');
  $('f_cwd').value = s.cwd || '';
  syncTransport();
  $('editor').showModal();
}

function syncTransport() {
  const http = $('f_transport').value === 'streamable-http';
  $('http_fields').hidden = !http;
  $('stdio_fields').hidden = http;
}

$('f_transport').onchange = syncTransport;
$('add').onclick = () => openEditor('', {});
$('reload').onclick = load;
$('save').onclick = async () => {
  const r = await fetch('/mcp-admin/api/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ servers }) });
  const data = await r.json();
  if (!r.ok) { toast('保存失败: ' + (data.error || r.status)); return; }
  dirty = false; $('save').disabled = true;
  toast('已保存，重启 DSH 后生效');
};
$('restart').onclick = async () => {
  if (dirty) { await $('save').onclick(); }
  if (!confirm('保存并重启 DeepSeek Harness？当前会话会中断，约 20 秒后自动重开。')) return;
  const r = await fetch('/mcp-admin/api/restart', { method: 'POST' });
  if (r.ok) toast('重启已安排（约 20 秒）'); else toast('重启失败');
};
$('form').onsubmit = (e) => {
  const ok = e.submitter && e.submitter.value === 'ok';
  if (!ok) return;
  const name = ($('f_name').value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) { toast('名称不合法'); e.preventDefault(); return; }
  const transport = $('f_transport').value;
  const s = { transport, enabled: $('f_enabled').value === 'true' };
  if (transport === 'streamable-http') {
    s.url = ($('f_url').value || '').trim();
    s.headers = parseLines($('f_headers').value, ':');
  } else {
    s.command = ($('f_command').value || '').trim();
    s.args = (($('f_args').value || '').trim() ? ($('f_args').value || '').trim().split(/\s+/) : []);
    s.env = parseLines($('f_env').value, '=');
    if ($('f_cwd').value.trim()) s.cwd = $('f_cwd').value.trim();
  }
  servers[name] = s;
  markDirty();
  render({});
  load();
};
load();
</script>
</body>
</html>`

export function apply(ctx, config) {
  const file = patchFile(config)

  ctx.webServer.register({
    kind: 'exact',
    path: '/mcp-admin',
    handler: (req, res) => {
      if (!isLoopback(req)) return send(res, 403, 'text/plain; charset=utf-8', 'loopback only')
      send(res, 200, 'text/html; charset=utf-8', PAGE)
    }
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/mcp-admin/api/state',
    handler: async (req, res) => {
      if (!isLoopback(req)) return send(res, 403, 'text/plain; charset=utf-8', 'loopback only')
      let servers = {}
      let error
      try { servers = loadServers(file) } catch (e) { error = String((e && e.message) || e) }
      let runtime = []
      try { runtime = ctx.mcpManager.list() || [] } catch (e) { error = error || String((e && e.message) || e) }
      sendJson(res, 200, { file, servers, runtime, error })
    }
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/mcp-admin/api/save',
    handler: async (req, res) => {
      if (!isLoopback(req)) return send(res, 403, 'text/plain; charset=utf-8', 'loopback only')
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' })
      try {
        const body = JSON.parse(await readBody(req))
        const servers = body.servers
        if (!servers || typeof servers !== 'object' || Array.isArray(servers)) throw new Error('servers must be an object')
        for (const [n, s] of Object.entries(servers)) {
          if (!/^[A-Za-z0-9_-]{1,32}$/.test(n)) throw new Error('bad server name: ' + n)
          if (!s || (s.transport !== 'stdio' && s.transport !== 'streamable-http')) throw new Error(n + ': transport must be stdio or streamable-http')
          if (s.transport === 'stdio' && !s.command) throw new Error(n + ': command required for stdio')
          if (s.transport === 'streamable-http' && !s.url) throw new Error(n + ': url required for streamable-http')
        }
        saveServers(file, servers)
        sendJson(res, 200, { ok: true, file })
      } catch (e) {
        sendJson(res, 400, { error: String((e && e.message) || e) })
      }
    }
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/mcp-admin/api/restart',
    handler: (req, res) => {
      if (!isLoopback(req)) return send(res, 403, 'text/plain; charset=utf-8', 'loopback only')
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' })
      try {
        const script = join(homedir(), '.dsh', 'restart-desktop.ps1')
        const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { detached: true, stdio: 'ignore' })
        child.unref()
        sendJson(res, 200, { ok: true })
      } catch (e) {
        sendJson(res, 500, { error: String((e && e.message) || e) })
      }
    }
  })
}
