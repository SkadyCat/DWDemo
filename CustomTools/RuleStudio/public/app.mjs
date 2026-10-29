// RuleStudio site controller. Every number shown comes from the web interpreter in /engine.
import { RuleLibrary, compileBuild, readTraitText, readBuildText, readStatusText, ELEMENT_NAMES } from '/engine/index.mjs';
import { describePlan } from '/plan-view.mjs';
import { runCombat } from '/combat.mjs';
import { Arena, TOGGLES, ARENA_HALF_EXTENT, STATUS_COLORS } from '/sim/arena.mjs';
import { mountEditors, reloadStore, store } from '/editors.mjs';
import { mountBattle } from '/battle3d.mjs';
import { mountHideout } from '/hideout/page.mjs';
import { mountShop } from '/shop.mjs';
import { mountCraft } from '/craft.mjs';
import { mountMonsters } from '/monsters.mjs';
import { mountFamilies } from '/families.mjs';
import { loadTalentTree } from '/talents/state.mjs';

const $ = id => document.getElementById(id);
const bootPhase = name => { if(new URLSearchParams(location.search).get('debug')==='boot') console.info(`[Studio boot] ${Math.round(performance.now())}ms ${name}`); };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (v, d = 1) => (Number.isInteger(v) ? String(v) : v.toFixed(d));
const ELEMENT_COLORS = ['#ff8a3d', '#8fdcff', '#ffe066', '#c9c9c9', '#8cff6b', '#c07bff'];

let files = [];
let library = new RuleLibrary();

function toast(text, bad = false) {
  const el = $('toast');
  el.textContent = text;
  el.className = bad ? 'bad' : '';
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 3500);
}

async function loadFiles(refresh = true) {
  if (refresh) await reloadStore();
  files = store.files;
  const status = $('libstatus');
  if (store.error || !store.library) { status.textContent = `规则库错误：${store.error || '尚未加载'}`; status.className = 'status bad'; return false; }
  library = store.library;
  status.textContent = `${library.traits.size} 特性 · ${library.builds.size} 技能 · ${store.root}`;
  status.className = 'status';
  return true;
}

// ---------------------------------------------------------------- tabs

const tabs = new Map();
let battlePage = null;
let hideoutPage = null;
document.querySelectorAll('#tabs button').forEach(button => button.addEventListener('click', () => {
  if(button.dataset.tab==='talents') {
    document.querySelector('#tabs [data-tab=battle]').click();
    battlePage?.openTalents();return;
  }
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b === button));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === `tab-${button.dataset.tab}`));
  if (button.dataset.tab !== 'battle') battlePage?.hide();
  if (button.dataset.tab !== 'hideout') hideoutPage?.hide();
  tabs.get(button.dataset.tab)?.();
}));
tabs.set('battle', () => battlePage?.show());
tabs.set('hideout', () => { hideoutPage ||= mountHideout($('hideout-root')); hideoutPage.show(); });
const mountedPages = new Set();
const mountPage = (id, mount) => tabs.set(id, () => { if(!mountedPages.has(id)){mount();mountedPages.add(id);} });
mountPage('monsters', () => mountMonsters($('monster-root'), { onTest: id => {
  battlePage.previewMonster(id);
  document.querySelector('#tabs [data-tab=battle]').click();
} }));
mountPage('shop', () => mountShop($('shop-root')));
mountPage('craft', () => mountCraft($('craft-root')));
mountPage('families', () => mountFamilies($('families-root')));
mountPage('drops', () => { void import('/drop-studio-page.mjs').then(m => m.mountDropStudio($('drops-root'))).catch(error => toast(error.message, true)); });
// The independent design table can open while the shared gameplay library is loading.
if (new URLSearchParams(location.search).get('view') === 'drops') document.querySelector('#tabs [data-tab=drops]').click();

// ---------------------------------------------------------------- shared build picker

const optionalTraits = buildId => {
  const build = library.build(buildId);
  const own = new Set((build?.traits || []).map(id => id.toLowerCase()));
  const active = build?.activeId?.toLowerCase();
  return [...library.traits.values()].filter(t => !own.has(t.source.id.toLowerCase()) && (!t.source.parentId || t.source.parentId.toLowerCase() === active || own.has(t.source.parentId.toLowerCase()) || !library.trait(t.source.parentId)) && !/^monster_|^player_/.test(t.source.id));
};

function fillBuildSelect(select, preferred = 'frost_lance') {
  const current = select.value || preferred;
  select.innerHTML = [...library.builds.values()].map(b => `<option value="${esc(b.id)}">${esc(b.displayName || b.id)} · ${esc(b.id)}</option>`).join('');
  select.value = library.build(current) ? library.build(current).id : select.options[0]?.value;
}

function renderChips(container, buildId, selected, onChange) {
  const build = library.build(buildId);
  const fixed = (build?.traits || []).map(id => `<span class="chip fixed" title="技能自带">${esc(library.traitDisplayName(id))}</span>`).join('');
  const options = optionalTraits(buildId).map(t => `<span class="chip ${selected.has(t.source.id) ? 'on' : ''}" data-id="${esc(t.source.id)}" title="${esc(t.description || t.source.id)}">${esc(t.displayName || t.source.id)}</span>`).join('');
  container.innerHTML = fixed + options;
  container.querySelectorAll('.chip[data-id]').forEach(chip => chip.addEventListener('click', () => {
    const id = chip.dataset.id;
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    chip.classList.toggle('on');
    onChange();
  }));
}

// ---------------------------------------------------------------- 规则引擎

const engine = { selectedPath: null, extras: new Set(['multiple_projectiles', 'pierce', 'ricochet', 'brittle', 'shatter', 'cold_mastery']) };

function renderLists() {
  const filter = $('traitFilter').value.trim().toLowerCase();
  const item = file => {
    const isBuild = /^(builds|webbuilds)\//i.test(file.path);
    const isStatus = /^(statuses|webstatuses)\//i.test(file.path);
    const pool = isBuild ? library.builds : isStatus ? library.statuses : library.traits;
    const entry = [...pool.values()].find(e => e.path === file.path);
    const name = entry ? entry.displayName : '';
    return `<div class="item ${engine.selectedPath === file.path ? 'on' : ''}" data-path="${esc(file.path)}"><b>${esc(name || file.path)}</b><span>${esc(file.path.split('/').pop().replace(/\.json$/, ''))}</span></div>`;
  };
  $('buildList').innerHTML = files.filter(f => /^(builds|webbuilds)\//i.test(f.path)).map(item).join('');
  $('statusList').innerHTML = files.filter(f => /^(statuses|webstatuses)\//i.test(f.path)).map(item).join('');
  const groups = [['traits', '特性 · Traits（UE 加载）'], ['timed', '附带持续时间 · Timed（网页专用）'], ['affixes', '角色词条 · Affixes（网页专用）'], ['webtraits', '主动动作 · WebTraits（网页专用）']];
  const matches = f => !filter || f.path.toLowerCase().includes(filter) || f.text.toLowerCase().includes(filter) || ([...library.traits.values()].find(e => e.path === f.path)?.displayName || '').toLowerCase().includes(filter);
  $('traitList').innerHTML = groups.map(([dir, title]) => {
    const list = files.filter(f => f.path.toLowerCase().startsWith(`${dir}/`) && matches(f));
    return list.length ? `<div class="list-group">${title} <i>${list.length}</i></div>${list.map(item).join('')}` : '';
  }).join('');
  const total = files.filter(f => /^(traits|timed|affixes|webtraits)\//i.test(f.path)).length;
  $('traitCount').textContent = String(total);
  document.querySelectorAll('#tab-engine .item').forEach(el => el.addEventListener('click', () => selectFile(el.dataset.path)));
}

function selectFile(path) {
  engine.selectedPath = path;
  const file = files.find(f => f.path === path);
  $('editTitle').textContent = path;
  $('editText').value = file ? file.text : '';
  $('editError').hidden = true;
  $('editState').textContent = '';
  renderLists();
  const build = [...library.builds.values()].find(b => b.path === path);
  if (build) { $('planBuild').value = build.id; renderPlanChips(); compilePlan(); }
}

function validateEdit() {
  const text = $('editText').value;
  const isBuild = /^(builds|webbuilds)\//i.test(engine.selectedPath || '');
  const isStatus = /^(statuses|webstatuses)\//i.test(engine.selectedPath || '');
  const result = isBuild ? readBuildText(text) : isStatus ? readStatusText(text) : readTraitText(text);
  const error = isBuild ? (result.build ? '' : result.error) : isStatus ? (result.def ? '' : result.error) : (result.trait ? '' : result.error);
  if (error) { $('editError').hidden = false; $('editError').textContent = error; return null; }
  // Whole-library check with the edited file, like LoadRuleLibrary.
  const trial = files.map(f => (f.path === engine.selectedPath ? { ...f, text } : f));
  const check = new RuleLibrary().load(trial);
  if (!check.ok) { $('editError').hidden = false; $('editError').textContent = check.error; return null; }
  $('editError').hidden = true;
  return trial;
}

$('editValidate').addEventListener('click', () => {
  const trial = validateEdit();
  if (!trial) return;
  const lib = new RuleLibrary();
  lib.load(trial);
  const { source } = lib.namedBuildSource($('planBuild').value, [...engine.extras]);
  const compiled = source ? compileBuild(source) : { error: 'no build' };
  if (compiled.plan) { $('editState').textContent = '✓ 读取与编译通过'; toast('校验通过：读取器与编译器均接受'); }
  else { $('editError').hidden = false; $('editError').textContent = `编译失败：${compiled.error}`; }
});

$('editSave').addEventListener('click', async () => {
  if (!engine.selectedPath || !validateEdit()) return;
  const response = await fetch(`/api/rules/${engine.selectedPath}`, { method: 'PUT', body: $('editText').value });
  const result = await response.json();
  if (!response.ok) { $('editError').hidden = false; $('editError').textContent = result.error; return; }
  toast(/^(timed|affixes|webtraits|webbuilds)\//i.test(result.path) ? `已保存 ${result.path}（网页专用，UE 不加载）` : `已保存 ${result.path}（UE 下次加载规则库即生效）`);
  await loadFiles();
  renderLists();
  compilePlan();
});

$('traitFilter').addEventListener('input', renderLists);
$('planBuild').addEventListener('change', () => { renderPlanChips(); compilePlan(); });

function renderPlanChips() { renderChips($('planExtras'), $('planBuild').value, engine.extras, compilePlan); }

function actionHtml(a) {
  const extra = Object.entries(a).filter(([k]) => !['op', 'fields', 'then'].includes(k)).map(([k, v]) => `<span class="k">${k}=</span>${esc(Array.isArray(v) ? v.join('|') : v)}`).join(' ');
  const fields = Object.entries(a.fields).map(([k, v]) => `<span class="k">${k}=</span>${esc(v)}`).join(' ');
  return `<div class="act"><b>${a.op}</b> ${extra} ${fields}${(a.then || []).map(actionHtml).join('')}</div>`;
}

function compilePlan() {
  const { source, error } = library.namedBuildSource($('planBuild').value, [...engine.extras]);
  const compiled = source ? compileBuild(source) : { plan: null, error };
  if (!compiled.plan) { $('planError').hidden = false; $('planError').textContent = compiled.error; $('planView').innerHTML = ''; return; }
  $('planError').hidden = true;
  const d = describePlan(compiled.plan);
  const statRows = d.stats.map(s => `<tr><td>${esc(s.name)}</td><td>${num(s.default, 3)}</td><td>${s.set === null ? '' : num(s.set, 3)}</td><td>${s.add ? num(s.add, 3) : ''}</td><td>${s.increased ? num(s.increased, 2) + '%' : ''}</td><td>${s.more !== 1 ? '×' + num(s.more, 3) : ''}</td><td><b>${num(s.value, 3)}</b></td></tr>`).join('');
  $('planView').innerHTML = `
    <div class="meta"><span>hash ${d.hash}</span><span>启用 ${d.traits.join(' → ')}</span><span>${d.counts.rules} 规则 · ${d.counts.actions} 动作 · ${d.counts.conditions} 条件 · ${d.counts.expr} 表达式指令 · ${d.counts.tags} 标签</span></div>
    <h4>属性分区 <small>(set|base + Σadd) × (1+Σinc%) × Πmore</small></h4>
    <table class="stats"><tr><th>属性</th><th>默认</th><th>set</th><th>add</th><th>inc</th><th>more</th><th>结果</th></tr>${statRows || '<tr><td colspan=7 class="muted">无修饰</td></tr>'}</table>
    <h4>事件 → 规则</h4>
    ${d.events.map(e => `<div class="event"><b>${esc(e.event)}</b>${e.rules.map(r => `
      <div class="rule"><div class="head">${esc(r.trait)}/${esc(r.id)} <i>depth≤${r.maxDepth}${r.channel ? ` channel=${esc(r.channel)}` : ''} max=${r.maxEvents}</i></div>
      ${r.conditions.length ? `<div class="cond">当 ${r.conditions.map(esc).join(' 且 ')}</div>` : ''}
      ${r.actions.map(actionHtml).join('')}</div>`).join('')}</div>`).join('')}`;
}

tabs.set('engine', () => { renderLists(); });

// ---------------------------------------------------------------- 基础战斗

const combat = { extras: new Set(), result: null, frame: 0, playing: false };

function renderCombatChips() { renderChips($('cbExtras'), $('cbBuild').value, combat.extras, () => {}); }
$('cbBuild').addEventListener('change', renderCombatChips);

$('cbRun').addEventListener('click', () => {
  const resist = $('cbResist').value.split(/[,，\s]+/).map(Number).slice(0, 4);
  const result = runCombat(files, {
    build: $('cbBuild').value, extra: [...combat.extras], layout: $('cbLayout').value, count: +$('cbCount').value, health: +$('cbHealth').value,
    resist: [0, 1, 2, 3].map(i => resist[i] || 0), casts: +$('cbCasts').value, castInterval: +$('cbInterval').value, seed: +$('cbSeed').value,
    frames: Math.max(360, +$('cbCasts').value * +$('cbInterval').value + 480),
  });
  if (result.error) { toast(result.error, true); return; }
  combat.result = result;
  combat.frame = 0;
  $('cbScrub').max = result.snapshots.length - 1;
  const t = result.total;
  const live = result.statuses.filter(name => result.remaining[name] > 0).map(name => `${esc(library.statusDisplayName(name))} <b>${result.remaining[name]}</b>`).join(' · ');
  $('cbSummary').innerHTML = `总伤害 <b>${t.damage.toFixed(1)}</b><br>命中 <b>${t.hits}</b> · 暴击 <b>${t.crits}</b> · 击杀 <b>${t.kills}</b><br>结束时状态：${live || '无'}<br>模拟 ${result.frames} 帧 · 状态哈希 <span class="muted">${result.hash}</span>`;
  $('cbRows').innerHTML = `<table><tr><th>帧</th><th>目标</th><th>伤害</th><th>元素</th><th></th></tr>${result.rows.map(r => `<tr class="${r.killed ? 'kill' : r.critical ? 'crit' : ''}"><td>${r.frame}</td><td>#${r.target}</td><td>${r.amount.toFixed(2)}</td><td>${r.element}</td><td>${r.critical ? '暴击 ' : ''}${r.killed ? '击杀' : ''}</td></tr>`).join('')}</table>`;
  $('cbTrace').innerHTML = `<table><tr><th>帧</th><th>类型</th><th>详情</th></tr>${result.trace.map(e => `<tr><td>${e.frame}</td><td>${e.kind}</td><td>${traceText(e)}</td></tr>`).join('')}</table>`;
  combat.playing = true;
  drawCombat();
});

function traceText(e) {
  if (e.kind === 'rule') return `${esc(e.event)} → <b>${esc(e.rule)}</b> gen=${e.generation}${e.target ? ` 目标#${e.target}` : ''}`;
  if (e.kind === 'damage') return `#${e.target} ${e.amount.toFixed(2)}/${e.requested.toFixed(2)} ${e.element}${e.dot ? ` 持续伤害(${esc(library.statusDisplayName(e.dot))})` : ''}${e.resistance ? ` 抗${e.resistance}%` : ''}${e.critical ? ' 暴击' : ''}${e.killed ? ' 击杀' : ''}`;
  if (e.kind === 'status') return `#${e.target} ${esc(library.statusDisplayName(e.key.replace(/^status:/, '')))} = ${e.value.toFixed(1)}${e.stacks > 1 ? ` ×${e.stacks}层` : ''}`;
  if (e.kind === 'spawn') return `生成 ${esc(e.carrier)} id=${e.id}`;
  if (e.kind === 'area') return `范围 r=${e.radius.toFixed(2)} 伤害=${e.amount.toFixed(1)} 目标=${e.victims}`;
  if (e.kind === 'grant') return `${e.target === null ? '自身' : `#${e.target}`} 获得 ${esc(e.key)} ${e.duration.toFixed(1)}s`;
  return '';
}

$('cbScrub').addEventListener('input', () => { combat.playing = false; combat.frame = +$('cbScrub').value; drawCombat(); });
$('cbPlay').addEventListener('click', () => { if (!combat.result) return; combat.frame = 0; combat.playing = true; });

function drawCombat() {
  const canvas = $('cbCanvas');
  const ctx = canvas.getContext('2d');
  const r = combat.result;
  ctx.fillStyle = '#0a0d12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!r) return;
  const snap = r.snapshots[Math.min(combat.frame, r.snapshots.length - 1)];
  const xs = r.targets.map(t => t.x), ys = r.targets.map(t => t.y);
  const minX = Math.min(-1, ...xs) - 1, maxX = Math.max(...xs) + 1, minY = Math.min(...ys, -2) - 1.5, maxY = Math.max(...ys, 2) + 1.5;
  const scale = Math.min(canvas.width / (maxX - minX), canvas.height / (maxY - minY));
  const X = x => (x - minX) * scale, Y = y => canvas.height - (y - minY) * scale;
  ctx.strokeStyle = '#18212d';
  for (let gx = Math.ceil(minX); gx < maxX; ++gx) { ctx.beginPath(); ctx.moveTo(X(gx), 0); ctx.lineTo(X(gx), canvas.height); ctx.stroke(); }
  ctx.fillStyle = '#f3c04a';
  ctx.beginPath(); ctx.arc(X(0), Y(0), 0.45 * scale, 0, 7); ctx.fill();
  for (const [id, x, y, hp, status] of snap.targets) {
    if (hp <= 0) { ctx.strokeStyle = '#3a2020'; ctx.beginPath(); ctx.arc(X(x), Y(y), r.radius * scale, 0, 7); ctx.stroke(); continue; }
    ctx.fillStyle = status >= 0 ? (STATUS_COLORS.find(([name]) => name === r.statuses[status])?.[1] || '#3d8fc4') : '#8a2a22';
    ctx.beginPath(); ctx.arc(X(x), Y(y), r.radius * scale, 0, 7); ctx.fill();
    ctx.fillStyle = '#222'; ctx.fillRect(X(x) - 16, Y(y) - r.radius * scale - 8, 32, 4);
    ctx.fillStyle = '#ff6b6b'; ctx.fillRect(X(x) - 16, Y(y) - r.radius * scale - 8, 32 * hp, 4);
    ctx.fillStyle = '#9fb0c6'; ctx.font = '10px monospace'; ctx.fillText(`#${id}`, X(x) - 8, Y(y) + 3);
  }
  ctx.fillStyle = '#bff0ff';
  for (const [x, y, radius] of snap.projectiles) { ctx.beginPath(); ctx.arc(X(x), Y(y), Math.max(2, radius * scale), 0, 7); ctx.fill(); }
  for (const [x, y, dx, dy] of snap.summons || []) {
    ctx.save(); ctx.translate(X(x), Y(y)); ctx.rotate(Math.atan2(-dy, dx));
    ctx.fillStyle = '#8fdcff'; ctx.strokeStyle = '#8fdcff'; ctx.lineWidth = 2;
    ctx.fillRect(-5, -5, 10, 10); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12, 0); ctx.stroke(); ctx.restore();
  }
  $('cbScrub').value = combat.frame;
  $('cbFrame').textContent = `${combat.frame} / ${r.snapshots.length - 1}  carriers=${snap.projectiles.length} events=${snap.stats.Events} actions=${snap.stats.Actions}`;
}

tabs.set('combat', () => { fillBuildSelect($('cbBuild')); renderCombatChips(); drawCombat(); });

// ---------------------------------------------------------------- 模拟

const sim = { arena: null, paused: false, keys: new Set(), mouse: { x: 0, y: 0, down: false }, last: 0, active: false, fps: 0 };

function resetArena() {
  sim.arena = new Arena(files, { maxMonsters: +$('simMax').value, god: $('simGod').checked, autoCast: $('simAuto').checked });
  renderToggles();
}

function renderToggles() {
  const keyOf = i => (i < 9 ? String(i + 1) : '0');
  const label = t => (t.traits.length > 1 ? `${library.traitDisplayName(t.id)}（含${t.traits.filter(id => id !== t.id).map(id => library.traitDisplayName(id)).join('、')}）` : library.traitDisplayName(t.id));
  $('simToggles').innerHTML = sim.arena.hero.toggles.map((t, i) => `<div class="toggle ${t.on ? 'on' : ''}" data-i="${i}"><span>${esc(label(t))}</span><kbd>${keyOf(i)}</kbd></div>`).join('');
  document.querySelectorAll('#simToggles .toggle').forEach(el => el.addEventListener('click', () => { sim.arena.toggleTrait(+el.dataset.i); renderToggles(); }));
}

$('simReset').addEventListener('click', resetArena);
$('simPause').addEventListener('click', () => { sim.paused = !sim.paused; $('simPause').textContent = sim.paused ? '继续' : '暂停'; });
$('simAuto').addEventListener('change', () => { sim.arena.hero.autoCast = $('simAuto').checked; });
$('simGod').addEventListener('change', () => { sim.arena.hero.god = $('simGod').checked; });
$('simMax').addEventListener('change', () => { sim.arena.maxMonsters = +$('simMax').value; });

const simCanvas = $('simCanvas');
simCanvas.addEventListener('mousemove', e => { const r = simCanvas.getBoundingClientRect(); sim.mouse.x = (e.clientX - r.left) * simCanvas.width / r.width; sim.mouse.y = (e.clientY - r.top) * simCanvas.height / r.height; });
simCanvas.addEventListener('mousedown', e => { if (e.button === 0) sim.mouse.down = true; simCanvas.focus(); });
window.addEventListener('mouseup', () => { sim.mouse.down = false; });
window.addEventListener('keydown', e => {
  if (!sim.active || e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') || e.target.tagName === 'SELECT') return;
  sim.keys.add(e.code);
  if (/^Digit[0-9]$/.test(e.code)) { const d = +e.code.slice(5); sim.arena.toggleTrait(d === 0 ? 9 : d - 1); renderToggles(); }
  if (e.code === 'KeyR' && sim.arena.hero.dead) sim.arena.respawn();
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', e => sim.keys.delete(e.code));

const SIM_SCALE = 0.32; // pixels per cm

function simFrame(now) {
  requestAnimationFrame(simFrame);
  if (combat.playing && combat.result) {
    combat.frame = Math.min(combat.frame + 1, combat.result.snapshots.length - 1);
    if (combat.frame >= combat.result.snapshots.length - 1) combat.playing = false;
    drawCombat();
  }
  if (!sim.active || !sim.arena) { sim.last = now; return; }
  const dt = sim.last ? (now - sim.last) / 1000 : 1 / 60;
  sim.last = now;
  sim.fps = sim.fps * 0.9 + (1 / Math.max(dt, 1e-3)) * 0.1;
  const a = sim.arena, hero = a.hero;
  const w = simCanvas.width, h = simCanvas.height;
  const toWorld = (px, py) => ({ x: hero.x + (px - w / 2) / SIM_SCALE, y: hero.y - (py - h / 2) / SIM_SCALE });
  hero.move = { x: (sim.keys.has('KeyD') ? 1 : 0) - (sim.keys.has('KeyA') ? 1 : 0), y: (sim.keys.has('KeyW') ? 1 : 0) - (sim.keys.has('KeyS') ? 1 : 0) };
  if (!hero.autoCast) { const m = toWorld(sim.mouse.x, sim.mouse.y); a.setAim(m.x, m.y); }
  hero.casting = sim.mouse.down || sim.keys.has('Space');
  if (!sim.paused) a.step(dt);
  drawSim();
}

function drawSim() {
  const a = sim.arena, hero = a.hero, ctx = simCanvas.getContext('2d');
  const w = simCanvas.width, h = simCanvas.height;
  const X = x => w / 2 + (x - hero.x) * SIM_SCALE, Y = y => h / 2 - (y - hero.y) * SIM_SCALE;
  ctx.fillStyle = '#0b0f15'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#141c27'; ctx.lineWidth = 1;
  const step = 500;
  for (let gx = Math.floor((hero.x - w / 2 / SIM_SCALE) / step) * step; gx < hero.x + w / 2 / SIM_SCALE; gx += step) { ctx.beginPath(); ctx.moveTo(X(gx), 0); ctx.lineTo(X(gx), h); ctx.stroke(); }
  for (let gy = Math.floor((hero.y - h / 2 / SIM_SCALE) / step) * step; gy < hero.y + h / 2 / SIM_SCALE; gy += step) { ctx.beginPath(); ctx.moveTo(0, Y(gy)); ctx.lineTo(w, Y(gy)); ctx.stroke(); }
  ctx.strokeStyle = '#3a4a60'; ctx.lineWidth = 3;
  ctx.strokeRect(X(-ARENA_HALF_EXTENT), Y(ARENA_HALF_EXTENT), 2 * ARENA_HALF_EXTENT * SIM_SCALE, 2 * ARENA_HALF_EXTENT * SIM_SCALE);
  for (const m of a.monsters) {
    const s = (0.75 + 0.35 * Math.min(1, m.maxHealth / 200)) * m.radius * SIM_SCALE * 1.1;
    ctx.fillStyle = m.hitFlash > 0 ? '#ffffff' : m.statusColor || '#8c1e14';
    ctx.save(); ctx.translate(X(m.x), Y(m.y)); ctx.rotate(-Math.atan2(m.facing.y, m.facing.x)); ctx.fillRect(-s, -s * 0.8, s * 2, s * 1.6);
    if (m.frozen) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.strokeRect(-s - 3, -s * 0.8 - 3, s * 2 + 6, s * 1.6 + 6); }
    ctx.restore();
  }
  for (const p of a.projectiles()) {
    const speed = Math.hypot(p.vx, p.vy) || 1, len = Math.max(6, p.radius * SIM_SCALE * 3.5);
    ctx.strokeStyle = p.hostile ? '#c07bff' : ELEMENT_COLORS[p.element] || '#bff0ff';
    ctx.lineWidth = Math.max(2, p.radius * SIM_SCALE * 1.4); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(X(p.x), Y(p.y)); ctx.lineTo(X(p.x) - p.vx / speed * len, Y(p.y) + p.vy / speed * len); ctx.stroke();
  }
  ctx.font = 'bold 12px monospace';
  for (const f of a.flashes) {
    ctx.globalAlpha = 1 - f.age / 0.6;
    ctx.fillStyle = f.critical ? '#ffb44d' : ELEMENT_COLORS[f.element] || '#fff';
    ctx.fillText(Math.round(f.amount), X(f.x) - 6, Y(f.y) - 18 - f.age * 40);
  }
  ctx.globalAlpha = 1;
  if (!hero.dead) {
    ctx.fillStyle = '#f2bf33'; ctx.beginPath(); ctx.arc(X(hero.x), Y(hero.y), hero.radius * SIM_SCALE * 1.2, 0, 7); ctx.fill();
    ctx.strokeStyle = '#33e6ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(hero.x), Y(hero.y)); ctx.lineTo(X(hero.x + hero.aim.x * 90), Y(hero.y + hero.aim.y * 90)); ctx.stroke();
  }
  const r = a.report;
  const shown = a.activeReport || r;
  $('simDead').hidden = !hero.dead;
  $('simHud').innerHTML = `<div>生命 ${Math.ceil(hero.health)} / ${hero.maxHealth}</div><div class="bar"><i style="width:${100 * hero.health / hero.maxHealth}%"></i></div>
    <div>技能 ${esc(library.buildDisplayName(hero.skill))} · 施法 ${hero.castsPerSecond.toFixed(1)}/s · 已施放 ${hero.casts}</div>
    <div>怪物 ${a.monsters.length} · 击杀 ${a.kills} · 输出 ${Math.round(a.damageDealt)} · 承伤 ${Math.round(a.damageTaken)}</div>
    <div>投射物 ${r.Projectiles} · 规则 ${shown.TotalMs.toFixed(2)} ms · ${sim.fps.toFixed(0)} FPS</div>${hero.error ? `<div style="color:#ff6b6b">${esc(hero.error)}</div>` : ''}`;
  if ((sim.reportTick = (sim.reportTick || 0) + 1) % 10 === 0) {
    $('simReport').innerHTML = Object.entries(shown).map(([k, v]) => `<span>${k}</span><span>${typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : v}</span>`).join('');
  }
}

tabs.set('sim', () => { if (!sim.arena) resetArena(); sim.active = true; simCanvas.focus(); });
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => { if (b.dataset.tab !== 'sim') sim.active = false; }));

// ---------------------------------------------------------------- 一致性

async function renderParity() {
  const response = await fetch('/api/parity', { cache: 'no-store' });
  if (!response.ok) { $('parityReport').innerHTML = '<p class="muted">还没有对比报告：先运行 <code>Run-Parity.ps1</code>（UE 自动化测试 + Node 对比）。</p>'; return; }
  const report = await response.json();
  $('parityReport').innerHTML = `<table class="parity"><tr><th>场景</th><th>结果</th><th>伤害记录</th><th>数值逐位一致</th><th>状态哈希</th><th>Web 总伤/击杀/暴击</th><th>UE 总伤/击杀/暴击</th></tr>${report.map(r => `
    <tr><td class="mono">${esc(r.id)}</td><td class="${r.ok ? 'pass' : 'fail'}">${r.ok ? 'PASS' : 'FAIL'}</td><td>${r.rows}</td><td>${r.exactAmounts}/${r.rows}</td><td>${r.stateHashEqual ? '相同' : '不同'}</td>
    <td>${r.web.damage} / ${r.web.kills} / ${r.web.crits}</td><td>${r.ue.damage} / ${r.ue.kills} / ${r.ue.crits}</td></tr>${r.issues.map(i => `<tr><td></td><td colspan=6 class="fail mono">${esc(i)}</td></tr>`).join('')}`).join('')}</table>`;
}

$('parityRun').addEventListener('click', async () => {
  const { runAll } = await import('/parity/driver.mjs');
  const scenarios = (await (await fetch('/parity/scenarios.json')).json()).scenarios;
  const started = performance.now();
  const web = runAll(files, scenarios);
  const rows = web.scenarios.reduce((n, s) => n + s.damage.length, 0);
  $('parityWeb').textContent = `浏览器内执行 ${web.scenarios.length} 个场景、${rows} 条伤害记录，用时 ${(performance.now() - started).toFixed(0)} ms；状态哈希：${web.scenarios.map(s => `${s.id}=${s.stateHash}`).join(' ')}`;
});

tabs.set('parity', renderParity);

// ---------------------------------------------------------------- boot

(async () => {
  bootPhase('rules:start');
  await Promise.all([mountEditors(), loadTalentTree()]);
  bootPhase('rules:ready');
  battlePage = mountBattle($('battle-root'));
  bootPhase('battle:mounted');
  if (!(await loadFiles(false))) return;
  bootPhase('shared:ready');
  fillBuildSelect($('planBuild'));
  bootPhase('build-select:ready');
  renderPlanChips();
  bootPhase('plan-chips:ready');
  compilePlan();
  bootPhase('plan:compiled');
  renderLists();
  bootPhase('rule-lists:ready');
  selectFile(files.find(f => /frost_lance\.json$/i.test(f.path))?.path || files[0]?.path);
  bootPhase('editors:ready');
  requestAnimationFrame(simFrame);
  // Read-only inspection handle for automated checks.
  window.ruleStudio = { sim, combat, get library() { return library; } };
  const requestedBuild = new URLSearchParams(location.search).get('bd');
  if (requestedBuild && /^[a-z0-9_]+$/.test(requestedBuild)) {
    document.querySelector('#tabs [data-tab=battle]').click();
    battlePage.openBuildGuide(requestedBuild);
  } else if (new URLSearchParams(location.search).get('view') === 'talents') {
    document.querySelector('#tabs [data-tab=talents]').click();
  } else if (new URLSearchParams(location.search).get('view') === 'battle') {
    bootPhase('battle:enter');
    document.querySelector('#tabs [data-tab=battle]').click();
    bootPhase('battle:entered');
    if(new URLSearchParams(location.search).get('panel')==='talents')battlePage.openTalents();
  } else if (new URLSearchParams(location.search).get('view') === 'hideout') {
    document.querySelector('#tabs [data-tab=hideout]').click();
  } else if (new URLSearchParams(location.search).get('view') === 'affix-categories') {
    document.querySelector('#tabs [data-tab=families]').click();
  }
})().catch(error => {
  const status = $('libstatus');
  status.textContent = `加载失败：${error.message}`; status.className = 'status bad';
});

// Editors saved or deleted a collection: refresh the shared library used by the other pages.
window.addEventListener('rulestudio:changed', async () => {
  if (!(await loadFiles(false))) return;
  fillBuildSelect($('planBuild'));
  fillBuildSelect($('cbBuild'));
  renderPlanChips();
  compilePlan();
  renderLists();
});

export { ELEMENT_NAMES };
