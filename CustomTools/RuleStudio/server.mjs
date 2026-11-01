// RuleStudio local server: serves the site and the live Beta rule library.
//   GET    /api/rules                                           -> { files:[{path,text}] } from <Beta>/Content/Rules
//   PUT    /api/rules/<Traits|Timed|Builds|Statuses|Equipment|Items|Shop>/<id>.json -> write a file (whole rule set re-validated here)
//   DELETE /api/rules/<Builds|Equipment|Items>/<id>.json        -> delete a collection (refused while referenced)
//   GET    /api/parity                                          -> Saved/RuleParity/report.json (if present)
//   POST   /api/update                                          -> git fetch + fast-forward to the latest commit (「更新」按钮)
// node --watch server.mjs [port] (reload validation modules when engine sources change)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { readRuleFiles, RULES_DIR, TOOL_ROOT, PROJECT_ROOT, RULE_DIRS } from './scripts/rule-files.mjs';
import { Worker } from 'node:worker_threads';
import { respond, serveFile, within } from './scripts/web-delivery.mjs';
import { WEB_ROOT, releaseHtml, cosBase } from './scripts/web-release.mjs';
import { loadWebRelease } from './scripts/web-release-loader.mjs';
import { readMapDropPools } from './scripts/drop-pool-view.mjs';
import { selfUpdate } from './scripts/self-update.mjs';
import { spawn } from 'node:child_process';

function validateRules(files, skill = '') {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./scripts/validate-rules.mjs', import.meta.url), { workerData: { files, skill }, execArgv: [] });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', code => { if (code !== 0) reject(new Error(`规则校验进程退出：${code}`)); });
  });
}

const PORT = Number(process.argv[2] || process.env.PORT || 5291);
const STATIC = [['/talent-data/', path.join(RULES_DIR, 'Talents')], ['/presets/', path.join(RULES_DIR, 'Presets')], ['/engine/', path.join(TOOL_ROOT, 'engine')], ['/parity/', path.join(TOOL_ROOT, 'parity')], ['/', path.join(TOOL_ROOT, 'public')]];

// The map device renders the actual UICreator control tree, using its shared SVG runtime.
STATIC.unshift(['/uicreator/', path.resolve(TOOL_ROOT, '../UICreatorAlpha/src')]);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => { size += chunk.length; if (size > 1 << 20) { reject(new Error('body too large')); req.destroy(); } else chunks.push(chunk); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handle(req, res) {
  const send = (res, code, body) => respond(req, res, code, body);
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/rules' && req.method === 'GET') return send(res, 200, { root: RULES_DIR, files: readRuleFiles() });
  if (url.pathname === '/api/drop-pools' && req.method === 'GET') {
    return send(res, 200, await readMapDropPools(path.join(PROJECT_ROOT, 'Content', 'RulesTower'),
      path.resolve(TOOL_ROOT, '../TradeBackend/config/drop-pools.json')));
  }
  const write = url.pathname.match(/^\/api\/rules\/([A-Za-z]+)\/([a-z0-9_]+)\.json$/);
  const dir = write && RULE_DIRS.find(name => name.toLowerCase() === write[1].toLowerCase());
  if (dir && (req.method === 'PUT' || req.method === 'DELETE')) {
    const relative = `${dir}/${write[2]}.json`;
    const file = path.join(RULES_DIR, dir, `${write[2]}.json`);
    const others = readRuleFiles().filter(entry => entry.path.toLowerCase() !== relative.toLowerCase());
    if (req.method === 'DELETE') {
      if (dir === 'Traits' || dir === 'Timed' || dir === 'Affixes' || dir === 'WebTraits') return send(res, 400, { error: '特性文件不能在网页里删除' });
      if (!fs.existsSync(file)) return send(res, 404, { error: `${relative} 不存在` });
      if (dir === 'Builds' || dir === 'WebBuilds') {
        const full = await validateRules(readRuleFiles(), write[2]);
        const users = full.users;
        if (users.length) return send(res, 400, { error: `仍被引用：${users.map(u => u.name || u.id).join('、')}` });
      }
      const check = await validateRules(others);
      if (!check.ok) return send(res, 400, { error: check.error });
      fs.unlinkSync(file);
      return send(res, 200, { ok: true, path: relative, deleted: true });
    }
    const text = await readBody(req);
    // Validate the whole rule set with this file replaced, exactly as it will be loaded.
    const check = await validateRules([...others, { path: relative, text }]);
    if (!check.ok) return send(res, 400, { error: check.error });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text.endsWith('\n') ? text : text + '\n');
    return send(res, 200, { ok: true, path: relative });
  }
  if (url.pathname === '/api/update' && req.method === 'POST') {
    // Local players only: the server listens on 127.0.0.1, and this refuses anything else as well.
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return send(res, 403, { error: 'local only' });
    const result = await selfUpdate(TOOL_ROOT, { restartPaths: ['CustomTools/RuleStudio/server.mjs', 'CustomTools/RuleStudio/scripts/'] });
    send(res, 200, result);
    if (result.restart) setTimeout(restartServer, 300);
    return;
  }
  if (url.pathname === '/api/version' && req.method === 'GET') return send(res, 200, { pid: process.pid, started: STARTED });
  if (url.pathname === '/api/parity') {
    const file = path.join(PROJECT_ROOT, 'Saved', 'RuleParity', 'report.json');
    return fs.existsSync(file) ? send(res, 200, fs.readFileSync(file)) : send(res, 404, { error: 'no parity report yet' });
  }
  const release = url.pathname.match(/^\/_release\/([a-f0-9]{20})\/(.+)$/);
  if (release && ['GET','HEAD'].includes(req.method)) {
    const root = path.join(WEB_ROOT, 'releases', release[1]);
    const file = path.resolve(root, decodeURIComponent(release[2]));
    if (within(root,file) && fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(req,res,file,{immutable:true});
    return send(res,404,{error:'release asset not found'});
  }
  for (const [prefix, dir] of STATIC) {
    if (!url.pathname.startsWith(prefix)) continue;
    const relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
    const file = path.resolve(dir, relative);
    if (!within(dir,file) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) continue;
    if (!['GET','HEAD'].includes(req.method)) return send(res,405,{error:'method not allowed'});
    if (file === path.join(TOOL_ROOT,'public','index.html')) {
      const manifest = await loadWebRelease();
      if (manifest) {
        res.setHeader('X-RuleStudio-Release',manifest.id);
        return serveFile(req,res,file,{body:releaseHtml(fs.readFileSync(file,'utf8'),manifest,cosBase(manifest.id))});
      }
    }
    return serveFile(req,res,file);
  }
  send(res, 404, { error: 'not found' });
}

const STARTED = Date.now();
// Server-side code changed in an update: hand over to a fresh process on the same port.
function restartServer() {
  console.log('RuleStudio：服务端代码已更新，正在重启…');
  server.close(() => {
    const child = spawn(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, RULESTUDIO_RESTARTED: '1' } });
    child.on('exit', code => process.exit(code ?? 0));
  });
  setTimeout(() => server.closeAllConnections?.(), 100);
}

const server = http.createServer((req, res) => handle(req, res).catch(error => {
  if (res.headersSent) return res.destroy(error);
  return respond(req,res,500,{error:error.message});
})).listen(PORT, '127.0.0.1', () => {
  console.log(`RuleStudio http://127.0.0.1:${PORT}/  (rules: ${RULES_DIR})`);
});
