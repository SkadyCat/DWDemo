// DWDemo 本地服务：提供游戏网页与新规则引擎（core/），以及「更新到最新」。
//   GET  /            -> public/（游戏）
//   GET  /core/...    -> core/（规则引擎，浏览器直接加载）
//   POST /api/update  -> git fetch + 快进到最新提交（仅本机）
//   GET  /api/version -> { pid, started }，更新后用来判断服务是否已重启
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
  for (const [prefix, dir] of STATIC) {
    if (!url.pathname.startsWith(prefix)) continue;
    const relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
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
