// 五版游戏内 UI 样张的共用内容：同一个角色、同一件传奇、同一组特性，只换视觉。
// 物品与技能图标是程序绘制的原创 SVG（按主题配色）。
export const HERO = { name: '霜烬', cls: '冰川行者', stage: '毕业 · 绝对零度', level: 87, life: [2934, 3410], es: [612, 980], mana: [150, 220] };

export const MAP = { name: '废墟', tier: 14, time: '2:41', kills: 213, total: 312, penalty: 70 };

export const SKILLS = [
  { key: '1', name: '冰霜新星', el: 'cold', glyph: 'nova', on: true },
  { key: '2', name: '寒潮', el: 'cold', glyph: 'wave', cd: 0.42 },
  { key: '3', name: '闪现', el: 'phys', glyph: 'blink' },
  { key: '4', name: '火墙', el: 'fire', glyph: 'flame', cd: 0.75 },
  { key: 'Q', name: '药剂', el: 'life', glyph: 'flask', charges: 3 },
];

export const BUFFS = [
  { name: '猛攻', n: 0, el: 'gold' }, { name: '耐力', n: 3, el: 'phys' }, { name: '护体', n: 0, el: 'phys' }, { name: '法术迸发', n: 4, el: 'cold' },
];

export const LEGENDARY = {
  name: '永冬之心', base: '玛瑙坠', slot: '项链', tier: 10, rarity: 'legendary',
  skill: null,
  legend: '传奇特性 · 冰封王座：击碎冰冻的敌人时，寒潮冻住范围内所有敌人 2 秒；本场每 10 连杀，寒潮半径扩大 10%。',
  traits: [
    { layer: 'core', text: '核心·绝对零度：每次击碎都在原地掀起寒潮；对冰冻敌人的冰霜伤害提高 60%（更多）', t: 3 },
    { layer: 'link', text: '碎冰：击碎冰冻敌人时爆出寒霜，造成其最大生命 70% 的冰霜伤害并冰冻周围', t: 5 },
  ],
  lines: ['+46% 冰霜抗性', '冰霜伤害提高 45%', '法术附加 10 冰霜伤害', '+140 最大生命', '暴击率提高 90%', '每秒回复 16 魔力'],
  flavor: '「冬天从不进攻。它只是等，等你的心跳慢下来。」',
  compare: { name: 'T8 玉坠', delta: ['+1 核心特性', '+18% 冰霜伤害', '−12% 闪电抗性'] },
};

export const TRAITS = [
  { layer: 'core', name: '绝对零度', text: '每次击碎都在原地掀起寒潮', stage: '毕业', el: 'cold', icon: 'orb' },
  { layer: 'link', name: '碎冰', text: '击碎冰冻敌人爆出寒霜，冻住周围', stage: '卡关', el: 'cold', icon: 'shatter' },
  { layer: 'form', name: '回响', text: '每次施法打两轮', stage: '突破', el: 'cold', icon: 'cast' },
  { layer: 'form', name: '余震', text: '范围技能在周围再落 4 次', stage: '—', el: 'phys', icon: 'blades' },
];

export const LADDER = [
  { name: '冻土', done: true }, { name: '寒域', done: true }, { name: '碎冰', done: true }, { name: '回响', done: true }, { name: '绝对零度', done: true, now: true },
];

export const SLOTS = [
  { id: 'weapon', name: '武器', icon: 'staff', r: 'rare' }, { id: 'helmet', name: '头盔', icon: 'helm', r: 'magic' }, { id: 'amulet', name: '项链', icon: 'amulet', r: 'legendary' },
  { id: 'offhand', name: '副手', icon: 'focus', r: 'rare' }, { id: 'chest', name: '胸甲', icon: 'robe', r: 'rare' }, { id: 'ring1', name: '戒指', icon: 'ring', r: 'magic' },
  { id: 'ring2', name: '戒指', icon: 'ring', r: 'rare' }, { id: 'gloves', name: '手套', icon: 'gloves', r: 'rare' }, { id: 'belt', name: '腰带', icon: 'belt', r: 'normal' }, { id: 'boots', name: '鞋子', icon: 'boots', r: 'magic' },
];

export const BAG = [
  ['sword', 'rare'], ['ring', 'magic'], ['helm', 'legendary'], ['boots', 'normal'], ['gloves', 'rare'], ['amulet', 'magic'],
  ['robe', 'magic'], ['orb', 'currency'], ['orb2', 'currency'], ['ring', 'rare'], ['staff', 'normal'], ['belt', 'magic'],
  ['shield', 'rare'], ['dagger', 'magic'], ['orb3', 'currency'], null, null, null, null, null, null, null, null, null,
];

export const STATS = [['生命', '3410'], ['能量护盾', '980'], ['火 / 冰 / 电', '78 / 78 / 78%'], ['混沌抗性', '24%'], ['施法速度', '+62%'], ['暴击率', '11.4%']];

// ---------------------------------------------------------------- icons: game-icons.net (CC BY 3.0) via the Iconify API
// Each icon is a CSS mask over a gradient, so every theme can paint the same silhouettes in its own metal / glow.
const GI = name => `url(https://api.iconify.design/game-icons/${name}.svg)`;
const SKILL_ICON = { nova: 'snowflake-1', wave: 'wave-crest', blink: 'teleport', flame: 'fire-wave', flask: 'health-potion', orb: 'frozen-orb', shatter: 'shatter', cast: 'ice-spell-cast', blades: 'spinning-blades' };
const ITEM_ICON = { staff: 'wizard-staff', sword: 'broadsword', dagger: 'plain-dagger', helm: 'visored-helm', amulet: 'gem-pendant', ring: 'diamond-ring', robe: 'robe',
  gloves: 'gauntlet', boots: 'leather-boot', belt: 'belt', focus: 'crystal-ball', shield: 'round-shield', orb: 'crystal-cluster', orb2: 'cut-diamond', orb3: 'gold-bar' };
export const skillIcon = (glyph, el = 'cold') => `<i class="gi ico el-${el}" style="--i:${GI(SKILL_ICON[glyph] ?? glyph)}"></i>`;
export const itemIcon = (kind, rarity = 'normal') => `<i class="gi ico r-${rarity}" style="--i:${GI(ITEM_ICON[kind] ?? kind)}"></i>`;

// ---------------------------------------------------------------- the scene behind the UI
/** A stylised dungeon battle (canvas): floor tiles, a horde, a frost nova mid-cast. Not a screenshot. */
export function paintScene(canvas, { tint = '#0b1018', frost = '#9fe0ff', ember = '#ff8a3d' } = {}) {
  const c = canvas.getContext('2d'), W = canvas.width = canvas.clientWidth * devicePixelRatio, H = canvas.height = canvas.clientHeight * devicePixelRatio;
  c.fillStyle = tint; c.fillRect(0, 0, W, H);
  const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);
  // isometric-ish floor
  c.save(); c.translate(W / 2, H * 0.52); c.scale(1, 0.55); c.rotate(Math.PI / 4);
  const T = W / 14;
  for (let i = -9; i < 9; i++) for (let j = -9; j < 9; j++) {
    const l = 12 + rnd() * 8; c.fillStyle = `hsl(220 14% ${l}%)`; c.fillRect(i * T + 1, j * T + 1, T - 2, T - 2);
  }
  c.restore();
  // vignette light
  const g = c.createRadialGradient(W / 2, H * .52, 10, W / 2, H * .52, W * .55); g.addColorStop(0, 'rgba(160,210,255,.18)'); g.addColorStop(1, 'rgba(0,0,0,.85)');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // horde
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, r = (0.12 + rnd() * 0.35) * W, x = W / 2 + Math.cos(a) * r, y = H * .52 + Math.sin(a) * r * .55, s = W * (0.0045 + rnd() * .003);
    const frozen = r < W * .24;
    c.fillStyle = frozen ? 'rgba(190,235,255,.85)' : `rgba(${70 + rnd() * 40},${22 + rnd() * 12},${20},.95)`;
    c.beginPath(); c.ellipse(x, y, s, s * 1.3, 0, 0, Math.PI * 2); c.fill();
    if (frozen) { c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1.5 * devicePixelRatio; c.stroke(); }
  }
  // nova
  for (let k = 0; k < 3; k++) {
    c.strokeStyle = frost; c.globalAlpha = .55 - k * .15; c.lineWidth = (6 - k * 2) * devicePixelRatio;
    c.beginPath(); c.ellipse(W / 2, H * .52, W * (.14 + k * .05), W * (.14 + k * .05) * .55, 0, 0, Math.PI * 2); c.stroke();
  }
  c.globalAlpha = 1;
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, r = rnd() * W * .2;
    c.fillStyle = 'rgba(220,245,255,.8)'; c.beginPath(); c.arc(W / 2 + Math.cos(a) * r, H * .52 + Math.sin(a) * r * .55, (1 + rnd() * 2.5) * devicePixelRatio, 0, 7); c.fill();
  }
  // a fire wall far right
  const fg = c.createRadialGradient(W * .8, H * .4, 4, W * .8, H * .4, W * .08); fg.addColorStop(0, ember); fg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = fg; c.fillRect(0, 0, W, H);
  // hero
  c.fillStyle = '#e8eef8'; c.beginPath(); c.ellipse(W / 2, H * .5, W * .011, W * .02, 0, 0, 7); c.fill();
}

/** Fit a fixed 1600×900 stage into the window. */
export function fitStage(stage) {
  const fit = () => { const k = Math.min(innerWidth / 1600, innerHeight / 900); stage.style.transform = `translate(-50%, -50%) scale(${k})`; };
  fit(); addEventListener('resize', fit);
}

export const pct = (a, b) => `${Math.round(100 * a / b)}%`;

// ---------------------------------------------------------------- shared markup (each version styles it its own way)
const LAYER = { core: '核心', link: '联动', form: '形态' };
export function render(root, { title = '', panelTitle = '角色', bagTitle = '行囊' } = {}) {
  const h = HERO, L = LEGENDARY;
  root.innerHTML = `
  <div class="stage">
    <canvas class="scene"></canvas>
    <div class="vignette"></div>

    <section class="plate" aria-label="当前地图">
      <div class="plate-tier"><small>T</small>${MAP.tier}</div>
      <div class="plate-body"><h2>${MAP.name}</h2>
        <div class="plate-bar"><i style="width:${pct(MAP.kills, MAP.total)}"></i></div>
        <p><span>${MAP.time}</span><span>击杀 ${MAP.kills} / ${MAP.total}</span><span class="warn">全抗 −${MAP.penalty}%</span></p></div>
    </section>
    <div class="minimap"><div class="mm-inner"></div><i class="mm-hero"></i></div>

    <div class="combo"><b>87</b><span>连杀</span><small>连锁 94%</small></div>
    <p class="clearflash">清 屏</p>

    <div class="floaters"><b class="f1">12,480</b><b class="f2 crit">48,211</b><b class="f3">9,066</b><b class="f4">31,402</b></div>

    <section class="dock">
      <div class="orb life"><div class="orb-fill" style="height:${pct(h.life[0], h.life[1])}"></div><div class="orb-es" style="--p:${h.es[0] / h.es[1]}"></div><div class="orb-glass"></div><span>${h.life[0]}<small>/ ${h.life[1]}</small></span></div>
      <div class="dock-mid">
        <div class="buffs">${BUFFS.map(b => `<span class="buff el-${b.el}">${b.name}${b.n ? `<sub>${b.n}</sub>` : ''}</span>`).join('')}</div>
        <div class="xp"><i style="width:63%"></i></div>
        <div class="skills">${SKILLS.map(s => `<button class="skill el-${s.el}${s.on ? ' on' : ''}" title="${s.name}">${skillIcon(s.glyph, s.el)}${s.cd ? `<i class="cd" style="--p:${s.cd}"></i>` : ''}${s.charges ? `<em class="charges">${s.charges}</em>` : ''}<kbd>${s.key}</kbd><span class="sname">${s.name}</span></button>`).join('')}</div>
      </div>
      <div class="orb mana"><div class="orb-fill" style="height:${pct(h.mana[0], h.mana[1])}"></div><div class="orb-glass"></div><span>${h.mana[0]}<small>/ ${h.mana[1]}</small></span></div>
    </section>

    <section class="window char" aria-label="${panelTitle}">
      <header class="win-head"><h1>${panelTitle}</h1><nav class="tabs"><b class="on">装备</b><b>特性</b><b>属性</b></nav><button class="x" aria-label="关闭">×</button></header>
      <div class="hero-card"><div class="portrait">${skillIcon('nova', 'cold')}</div><div><h3>${h.name}<small>Lv ${h.level}</small></h3><p>${h.cls} · ${h.stage}</p></div></div>
      <div class="doll">${SLOTS.map(s => `<button class="slot s-${s.id} r-${s.r}${s.id === 'amulet' ? ' hover' : ''}">${itemIcon(s.icon, s.r)}<small>${s.name}</small></button>`).join('')}<div class="silhouette"></div></div>
      <dl class="stats">${STATS.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <div class="ladder"><h4>质变</h4><ol>${LADDER.map(l => `<li class="${l.done ? 'done' : ''}${l.now ? ' now' : ''}"><i></i><span>${l.name}</span></li>`).join('')}</ol></div>
      <div class="traits"><h4>特性 <small>29 条 · 22 种</small></h4>${TRAITS.map(t => `<article class="trait l-${t.layer} el-${t.el}"><div class="t-icon">${skillIcon(t.icon, t.el)}</div><div><h5>${t.name}<em>${LAYER[t.layer]}</em></h5><p>${t.text}</p></div></article>`).join('')}</div>
    </section>

    <section class="window bag" aria-label="${bagTitle}">
      <header class="win-head"><h1>${bagTitle}</h1><span class="gold">◆ 12,480</span></header>
      <div class="grid">${BAG.map(b => b ? `<button class="cell r-${b[1]}">${itemIcon(b[0], b[1])}</button>` : '<button class="cell empty"></button>').join('')}</div>
      <div class="wallet"><span>${itemIcon('orb', 'currency')}<b>34</b></span><span>${itemIcon('orb2', 'currency')}<b>12</b></span><span>${itemIcon('orb3', 'currency')}<b>3</b></span></div>
    </section>

    <article class="tip r-legendary" aria-label="物品说明">
      <header class="tip-head"><div class="tip-icon">${itemIcon('amulet', 'legendary')}</div><div><h2>${L.name}</h2><p>传奇${L.slot} · ${L.base} · 物品 T${L.tier}</p></div></header>
      <p class="tip-legend">${L.legend}</p>
      <ul class="tip-traits">${L.traits.map(t => `<li class="l-${t.layer}"><span>${t.text}</span><em>${LAYER[t.layer]} T${t.t}</em></li>`).join('')}</ul>
      <ul class="tip-lines">${L.lines.map(x => `<li>${x}</li>`).join('')}</ul>
      <p class="tip-flavor">${L.flavor}</p>
      <footer class="tip-cmp"><b>对比身上 ${L.compare.name}</b>${L.compare.delta.map(d => `<span class="${d.startsWith('−') ? 'down' : 'up'}">${d}</span>`).join('')}</footer>
    </article>

    <div class="version">${title}</div>
  </div>`;
  const stage = root.querySelector('.stage');
  stage.insertAdjacentHTML('beforeend', '<p class="credit">图标：game-icons.net（CC BY 3.0）· 动效 GSAP · 定位 Floating UI · 拖拽 SortableJS</p>');
  fitStage(stage);
  enhance(stage);
  return stage;
}

// ---------------------------------------------------------------- interaction (proven libraries, from the CDN)
// GSAP for motion, Floating UI for tooltip placement, SortableJS for bag drag & drop.
export async function enhance(stage) {
  const [{ gsap }, { computePosition, flip, shift, offset }, Sortable] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm'),
    import('https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.6.10/+esm'),
    import('https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/+esm').then(m => m.default),
  ]).catch(() => [{}, {}, null]);
  const tip = stage.querySelector('.tip');
  // Tooltip: hover any equipped slot or bag item; the legendary card follows it and flips at screen edges.
  if (computePosition) for (const el of stage.querySelectorAll('.slot, .cell:not(.empty)')) {
    el.addEventListener('mouseenter', async () => {
      const scale = stage.getBoundingClientRect().width / 1600;
      const { x, y } = await computePosition(el, tip, { placement: 'right-start', middleware: [offset(14 * scale), flip(), shift({ padding: 8 })] });
      const s = stage.getBoundingClientRect();
      gsap?.to(tip, { left: (x - s.left) / scale, top: (y - s.top) / scale, duration: .18, ease: 'power2.out' });
    });
  }
  if (Sortable) Sortable.create(stage.querySelector('.grid'), { animation: 160, ghostClass: 'ghost', filter: '.empty' });
  if (!gsap) return;
  // Kill streak: the number punches up every beat; screen clear flashes; damage numbers rise and fade.
  const combo = stage.querySelector('.combo b');
  let n = 87;
  gsap.timeline({ repeat: -1, repeatDelay: .6 }).call(() => { n += 7; combo.textContent = n; })
    .fromTo(combo, { scale: 1.45 }, { scale: 1, duration: .35, ease: 'back.out(3)' });
  gsap.timeline({ repeat: -1, repeatDelay: 2.4 }).fromTo(stage.querySelector('.clearflash'), { opacity: 0, scale: 1.6, letterSpacing: '2em' }, { opacity: 1, scale: 1, letterSpacing: '1em', duration: .4, ease: 'expo.out' }).to(stage.querySelector('.clearflash'), { opacity: 0, duration: .9, delay: .6 });
  stage.querySelectorAll('.floaters b').forEach((b, i) => gsap.fromTo(b, { y: 0, opacity: 0, scale: .7 }, { y: -70, opacity: 1, scale: 1, duration: 1.2, ease: 'power2.out', repeat: -1, delay: i * .35, repeatDelay: .4, onRepeat() { b.textContent = (Math.round(8000 + Math.random() * 42000)).toLocaleString(); } }));
  gsap.to(stage.querySelectorAll('.skill .cd'), { '--p': 0, duration: 2.2, repeat: -1, ease: 'none' });
  gsap.from(stage.querySelectorAll('.window, .tip'), { y: 18, opacity: 0, duration: .5, stagger: .08, ease: 'power3.out' });
}
