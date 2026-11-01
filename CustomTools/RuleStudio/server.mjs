// DWDemo 本地服务：提供游戏网页与新规则引擎（core/），以及「更新到最新」。
//   GET  /            -> public/（游戏）
//   GET  /core/...    -> core/（规则引擎，浏览器直接加载）
//   POST /api/update  -> git fetch + 快进到最新提交（仅本机）
//   GET  /api/version -> { pid, started }，更新后用来判断服务是否已重启
//   GET  /api/overrides -> data/overrides.json（编辑器对内容的修改；没有时为 {}）
//   PUT  /api/overrides -> 编辑器保存修改（仅本机）
//   GET  /api/accounts            -> 账号列表 [{ id, name, created, updated, summary }]
//   POST /api/accounts {name, save?} -> 新建账号（不带 save 即全新开始）
//   GET  /api/accounts/:id        -> { id, name, save }
//   PUT  /api/accounts/:id {save?, name?} -> 保存存档 / 改名
//   DELETE /api/accounts/:id      -> 删除账号（移到 data/accounts/.trash，可手动找回）
// node server.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { respond, serveFile, within } from './scripts/web-delivery.mjs';
import { selfUpdate } from './scripts/self-update.mjs';

const TOOL_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 5291);
const STATIC = [['/core/', path.join(TOOL_ROOT, 'core')], ['/', path.join(TOOL_ROOT, 'public')]];
const STARTED = Date.now();
const OVERRIDES_FILE = path.join(TOOL_ROOT, 'data', 'overrides.json');
const LOCAL = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
const ACCOUNTS = process.env.DW_ACCOUNTS_DIR || path.join(TOOL_ROOT, 'data', 'accounts');
const accountFile = id => /^[a-z0-9]{6,24}$/.test(id) ? path.join(ACCOUNTS, `${id}.json`) : null;
function summaryOf(save) {
  if (!save) return null;
  return { unlocked: save.unlocked ?? 1, maps: save.stats?.maps ?? 0, kills: save.stats?.kills ?? 0, archetype: save.archetype ?? null, nodes: save.atlas?.done?.length ?? 0 };
}
function listAccounts() {
  if (!fs.existsSync(ACCOUNTS)) return [];
  return fs.readdirSync(ACCOUNTS).filter(f => f.endsWith('.json')).map(f => {
    try { const a = JSON.parse(fs.readFileSync(path.join(ACCOUNTS, f), 'utf8')); return { id: a.id, name: a.name, created: a.created, updated: a.updated, summary: summaryOf(a.save) }; } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.updated - a.updated);
}
function writeAccount(a) { fs.mkdirSync(ACCOUNTS, { recursive: true }); a.updated = Date.now(); fs.writeFileSync(accountFile(a.id), JSON.stringify(a)); return a; }
async function accounts(req, url, send) {
  const local = LOCAL.includes(req.socket.remoteAddress);
  const id = url.pathname.split('/')[3];
  if (!id) {
    if (req.method === 'GET') return send(200, listAccounts());
    if (req.method !== 'POST') return send(405, { error: 'method not allowed' });
    if (!local) return send(403, { error: 'local only' });
    const body = JSON.parse((await readBody(req)) || '{}');
    const name = String(body.name ?? '').trim().slice(0, 24);
    if (!name) return send(400, { error: '账号名不能为空' });
    if (listAccounts().some(a => a.name === name)) return send(409, { error: '这个名字已经有了' });
    const a = writeAccount({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), name, created: Date.now(), save: body.save ?? null });
    return send(200, { id: a.id, name: a.name });
  }
  const file = accountFile(id);
  if (!file || !fs.existsSync(file)) return send(404, { error: '账号不存在' });
  const a = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (req.method === 'GET') return send(200, a);
  if (!local) return send(403, { error: 'local only' });
  if (req.method === 'PUT') {
    const body = JSON.parse((await readBody(req, 8 << 20)) || '{}');
    if (body.save !== undefined) a.save = body.save;
    if (body.name) a.name = String(body.name).trim().slice(0, 24) || a.name;
    writeAccount(a);
    return send(200, { ok: true, updated: a.updated });
  }
  if (req.method === 'DELETE') {
    const trash = path.join(ACCOUNTS, '.trash'); fs.mkdirSync(trash, { recursive: true });
    fs.renameSync(file, path.join(trash, `${id}-${Date.now()}.json`));
    return send(200, { ok: true });
  }
  return send(405, { error: 'method not allowed' });
}

function readBody(req, limit = 2 << 20) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handle(req, res) {
  const send = (code, body) => respond(req, res, code, body);
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/update' && req.method === 'POST') {
    // Local players only: the server listens on 127.0.0.1, and this refuses anything else as well.
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return send(403, { error: 'local only' });
    const result = await selfUpdate(TOOL_ROOT, { restartPaths: ['CustomTools/RuleStudio/server.mjs', 'CustomTools/RuleStudio/scripts/'] });
    send(200, result);
    if (result.restart) setTimeout(restartServer, 300);
    return;
  }
  if (url.pathname === '/api/version' && req.method === 'GET') return send(200, { pid: process.pid, started: STARTED });
  if (url.pathname === '/api/accounts' || url.pathname.startsWith('/api/accounts/')) return accounts(req, url, send);
  if (url.pathname === '/api/overrides') {
    if (req.method === 'GET') return send(200, fs.existsSync(OVERRIDES_FILE) ? JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8')) : {});
    if (req.method !== 'PUT') return send(405, { error: 'method not allowed' });
    if (!LOCAL.includes(req.socket.remoteAddress)) return send(403, { error: 'local only' });
    const data = JSON.parse(await readBody(req));
    if (!data || typeof data !== 'object' || Array.isArray(data)) return send(400, { error: 'expected an object' });
    fs.mkdirSync(path.dirname(OVERRIDES_FILE), { recursive: true });
    fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(data, null, 2) + '\n');
    return send(200, { ok: true, categories: Object.keys(data).length });
  }
  for (const [prefix, dir] of STATIC) {
    if (!url.pathname.startsWith(prefix)) continue;
    // Folders serve their index.html ("/design/" → design/index.html).
    let relative = decodeURIComponent(url.pathname.slice(prefix.length));
    if (!relative || relative.endsWith('/')) relative += 'index.html';
    const file = path.resolve(dir, relative);
    if (!within(dir, file) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
    if (!['GET', 'HEAD'].includes(req.method)) return send(405, { error: 'method not allowed' });
    return serveFile(req, res, file);
  }
  send(404, { error: 'not found' });
}

// Server-side code changed in an update: hand over to a fresh process on the same port.
function restartServer() {
  console.log('DWDemo：服务端代码已更新，正在重启…');
  server.close(() => {
    const child = spawn(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, DWDEMO_RESTARTED: '1' } });
    child.on('exit', code => process.exit(code ?? 0));
  });
  setTimeout(() => server.closeAllConnections?.(), 100);
}

const server = http.createServer((req, res) => handle(req, res).catch(error => {
  if (res.headersSent) return res.destroy(error);
  return respond(req, res, 500, { error: error.message });
})).listen(PORT, '127.0.0.1', () => console.log(`DWDemo http://127.0.0.1:${PORT}/`));
