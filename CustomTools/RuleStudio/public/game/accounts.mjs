// 账号：存档放在本地服务的 data/accounts/ 里，一个账号一份存档。进游戏前先选账号；
// 想重来就新建一个账号，旧账号原样留着，随时切回去。游戏照常读写浏览器里的存档，
// 每次保存时再同步到当前账号（防抖，关闭页面前立即写一次）。服务没开账号接口时退回单机存档。
import { createApp, ref, reactive, computed, onMounted } from '../vendor/vue.esm-browser.prod.js';
import { setSaveSink, SAVE_KEY } from './save.mjs';
import { ARCHETYPES } from '../../core/content/archetypes.mjs';

const CURRENT = 'dw.account';
const api = async (path, opts = {}) => {
  const r = await fetch(`/api/accounts${path}`, { ...opts, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
  return body;
};
const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };

/** The account this browser is playing on, if any. */
export const currentAccount = () => read(CURRENT);

let timer = 0, pending = null;
function syncTo(account) {
  const flush = keepalive => {
    if (!pending) return;
    const body = JSON.stringify({ save: pending }); pending = null;
    fetch(`/api/accounts/${account.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive }).catch(() => {});
  };
  setSaveSink(save => { pending = JSON.parse(JSON.stringify(save)); clearTimeout(timer); timer = setTimeout(() => flush(false), 800); });
  addEventListener('pagehide', () => flush(true));
  return () => flush(true);
}

/** Leave the current account (the save is flushed first) and go back to the account screen. */
export function switchAccount() {
  try { localStorage.removeItem(CURRENT); } catch { /* ignore */ }
  setTimeout(() => location.reload(), 150);
}

async function enter(account, startGame) {
  const a = await api(`/${account.id}`);
  try {
    if (a.save) localStorage.setItem(SAVE_KEY, JSON.stringify(a.save)); else localStorage.removeItem(SAVE_KEY);
    localStorage.setItem(CURRENT, JSON.stringify({ id: a.id, name: a.name }));
  } catch { /* storage unavailable */ }
  globalThis.__account = { id: a.id, name: a.name };
  syncTo(a);
  startGame();
}

const ago = t => { const s = (Date.now() - t) / 1000; return s < 90 ? '刚刚' : s < 3600 ? `${Math.round(s / 60)} 分钟前` : s < 86400 ? `${Math.round(s / 3600)} 小时前` : `${Math.round(s / 86400)} 天前`; };
const bdName = id => ARCHETYPES.find(a => a.id === id)?.name ?? '自由搭配';

const GATE = /* html */ `
<div class="acc">
  <section class="acc-panel panel">
    <h1 class="ttl">选 择 账 号</h1>
    <p class="acc-lead">每个账号一份独立存档。想从头开始就新建一个账号，旧账号原样保留，随时切回去。</p>
    <p v-if="offline" class="acc-warn">本地服务没有账号功能（需要重启服务）。现在可以先用本机存档继续玩。</p>
    <ul class="acc-list" v-if="!offline">
      <li v-for="a in list" :key="a.id" :class="{ last: a.id === lastId }">
        <div class="acc-main" @click="choose(a)">
          <b>{{ a.name }}</b>
          <small v-if="a.summary">最高 T{{ a.summary.unlocked }} · 打通 {{ a.summary.nodes }} 个节点 · 通关 {{ a.summary.maps }} 次 · {{ bdName(a.summary.archetype) }}</small>
          <small v-else>全新角色</small>
          <em>{{ ago(a.updated) }}</em>
        </div>
        <template v-if="renaming === a.id"><input v-model="newName" @keydown.enter="rename(a)" maxlength="24"><button class="orn-btn sm" @click="rename(a)">确定</button></template>
        <template v-else-if="deleting === a.id"><span class="acc-confirm">删除「{{ a.name }}」？</span><button class="orn-btn danger sm" @click="remove(a)">删除</button><button class="orn-btn ghost sm" @click="deleting = null">取消</button></template>
        <template v-else>
          <button class="orn-btn primary sm" @click="choose(a)">进入</button>
          <button class="orn-btn ghost sm" @click="renaming = a.id; newName = a.name">改名</button>
          <button class="orn-btn ghost sm" @click="deleting = a.id">删除</button>
        </template>
      </li>
      <li v-if="!list.length && loaded" class="acc-empty">还没有账号，在下面新建一个。</li>
    </ul>
    <div class="acc-new" v-if="!offline">
      <input v-model="name" placeholder="新账号名" maxlength="24" @keydown.enter="create(false)">
      <button class="orn-btn primary" :disabled="!name.trim() || busy" @click="create(false)">新建账号 · 全新开始</button>
      <button class="orn-btn" v-if="hasLocal" :disabled="!name.trim() || busy" @click="create(true)" title="把这个浏览器里现有的存档放进新账号">带上本机存档</button>
    </div>
    <p class="acc-msg" v-if="msg">{{ msg }}</p>
    <button v-if="offline" class="orn-btn primary" @click="offlinePlay">用本机存档继续</button>
  </section>
</div>`;

/**
 * Show the account screen unless this browser already plays on a known account, then start the game.
 * startGame: () => void — mounts the game (it reads the save from the browser as before).
 */
export async function enterGame(el, startGame) {
  const remembered = currentAccount();
  let list = null;
  try { list = await api(''); } catch { /* no account API: play offline */ }
  if (list && remembered && list.some(a => a.id === remembered.id)) return enter(remembered, startGame);
  const app = createApp({
    template: GATE,
    setup() {
      const state = reactive({ list: list ?? [] }), name = ref(''), msg = ref(''), busy = ref(false), renaming = ref(null), newName = ref(''), deleting = ref(null);
      const hasLocal = !!read(SAVE_KEY);
      async function refresh() { state.list = await api(''); }
      async function choose(a) { app.unmount(); el.innerHTML = ''; await enter(a, startGame); }
      async function create(withLocal) {
        busy.value = true; msg.value = '';
        try { const a = await api('', { method: 'POST', body: JSON.stringify({ name: name.value.trim(), save: withLocal ? read(SAVE_KEY) : null }) }); await choose(a); }
        catch (e) { msg.value = e.message; } finally { busy.value = false; }
      }
      async function rename(a) { try { await api(`/${a.id}`, { method: 'PUT', body: JSON.stringify({ name: newName.value.trim() }) }); renaming.value = null; await refresh(); } catch (e) { msg.value = e.message; } }
      async function remove(a) { try { await api(`/${a.id}`, { method: 'DELETE' }); deleting.value = null; await refresh(); } catch (e) { msg.value = e.message; } }
      function offlinePlay() { app.unmount(); el.innerHTML = ''; startGame(); }
      return { list: computed(() => state.list), loaded: true, offline: !list, lastId: remembered?.id, name, msg, busy, renaming, newName, deleting, hasLocal,
        choose, create, rename, remove, offlinePlay, ago, bdName };
    },
  });
  app.mount(el);
}
