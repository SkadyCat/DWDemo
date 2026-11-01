// 账号接口：新建 / 列表 / 读写存档 / 改名 / 删除（移进 .trash）。用临时目录，不碰真实账号。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('account API keeps one save per account', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-acc-'));
  const port = 5600 + Math.floor(Math.random() * 300);
  const srv = spawn(process.execPath, ['server.mjs', String(port)], { cwd: ROOT, env: { ...process.env, DW_ACCOUNTS_DIR: dir }, stdio: 'pipe' });
  try {
    await new Promise((ok, bad) => { srv.stdout.on('data', d => String(d).includes('http') && ok()); srv.on('exit', bad); setTimeout(() => bad(new Error('server timeout')), 8000).unref(); });
    const call = async (p, method = 'GET', body) => {
      const r = await fetch(`http://127.0.0.1:${port}/api/accounts${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    };
    assert.deepEqual((await call('')).body, []);
    const a = (await call('', 'POST', { name: '甲' })).body;
    assert.match(a.id, /^[a-z0-9]{6,24}$/);
    assert.equal((await call('', 'POST', { name: '甲' })).status, 409);
    assert.equal((await call('', 'POST', { name: '' })).status, 400);
    const b = (await call('', 'POST', { name: '乙', save: { version: 2, unlocked: 4 } })).body;
    assert.equal((await call(`/${a.id}`)).body.save, null);
    await call(`/${a.id}`, 'PUT', { save: { version: 2, unlocked: 7 } });
    assert.equal((await call(`/${a.id}`)).body.save.unlocked, 7);
    assert.equal((await call(`/${b.id}`)).body.save.unlocked, 4);
    await call(`/${b.id}`, 'PUT', { name: '丙' });
    const list = (await call('')).body;
    assert.deepEqual(list.map(x => x.name).sort(), ['甲', '丙'].sort());
    assert.equal(list.find(x => x.id === a.id).summary.unlocked, 7);
    assert.equal((await call(`/${b.id}`, 'DELETE')).status, 200);
    assert.equal((await call(`/${b.id}`)).status, 404);
    assert.equal(fs.readdirSync(path.join(dir, '.trash')).length, 1);
    assert.equal((await call('/../etc')).status, 404);
  } finally { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); }
});
