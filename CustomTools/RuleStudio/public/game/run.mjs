// 一张地图的一次挑战：地牢 + 新引擎世界 + 英雄 + 按地图压力生成的怪物 + 首领 + 掉落。
// 只管玩法；画面从这里读视图（hero / monsters / projectiles / flashes / loot），特效订阅 world 的事件。
import { createWorld } from '../../core/index.mjs';
import { gameContent } from '../../core/content/game.mjs';
import { mapProfile, ELITE_MODS, MONSTER_TYPES } from '../../core/content/maps.mjs';
import { HERO_BASE } from '../../core/sim.mjs';
import { rollDrops } from '../../core/content/items.mjs';
import { castTime } from '../../core/skills.mjs';
import { detachRules } from '../../core/rules.mjs';
import { generateDungeon, dungeonRandom } from './dungeon.mjs';
import { rollWaystoneDrops } from './waystones.mjs';
import { HUB_LAYOUT, NPCS, STATIONS } from './hub.mjs';
import { Town, steerOnFlow } from './town.mjs';
import { rollScarabDrops } from './scarabs.mjs';

export const STATUS_LOOK = {
  ignited: { color: '#ff7a2e', glyph: '燃', fx: 'ignite' }, poisoned: { color: '#7ee36b', glyph: '毒', fx: 'poison' }, bleeding: { color: '#e0334a', glyph: '血', fx: 'bleed' },
  shocked: { color: '#ffe14d', glyph: '电', fx: 'shock' }, chilled: { color: '#5ab8f0', glyph: '缓', fx: 'chill' }, frozen: { color: '#d8f6ff', glyph: '冻', fx: 'freeze' },
  electrocuted: { color: '#fff27a', glyph: '击', fx: 'stun' }, brittle: { color: '#bfe8ff', glyph: '脆', fx: null }, sapped: { color: '#e8d36b', glyph: '疲', fx: null },
  scorched: { color: '#ff9d5c', glyph: '灼', fx: null }, superconduct: { color: '#9fd7ff', glyph: '导', fx: null }, enraged: { color: '#ff4040', glyph: '狂', fx: null }, alerted: { color: '#ffd24a', glyph: '警', fx: null },
  frostbite: { color: '#a6e6ff', glyph: '冻', fx: 'chill' }, onslaught: { color: '#ffd166', glyph: '猛', fx: null }, fortify: { color: '#c0c8d8', glyph: '护', fx: null },
  thunder_ready: { color: '#ffe680', glyph: '雷', fx: null },
  primed: { color: '#ffb040', glyph: '引', fx: 'ignite' }, chained: { color: '#ffd76a', glyph: '锁', fx: null }, overgrown: { color: '#8fdc6a', glyph: '长', fx: null },
};
const PORTAL_REACH = 85;
const ELEMENT_COLOR = { physical: 0x8a3a2a, fire: 0xa8401c, cold: 0x2c6c9a, lightning: 0x9a8a24, chaos: 0x5a2a7a };

function dungeonTerrain(d) {
  return { move: d.move, sweep: d.sweep, flow: d.flow, tileOf: d.tileOf, tileCenter: d.tileCenter, size: d.size };
}

export class MapRun {
  /**
   * build: { skills:[id], affixes:[compiled affix], keepDistance? }
   * opts: { tier, family, seed, quantity, mods } — mods come from the atlas node (atlas.mjs nodeMods):
   *   { quantity, pack, elite, legend, life, damage, bossLife }
   */
  constructor(build, { tier = 1, family = 'ruin', seed = Date.now() % 1e9, quantity = 1, mods = {}, hub = false } = {}) {
    this.hub = hub;   // the home (初始地牢): no monsters, NPCs and stations instead
    this.profile = mapProfile(tier, family);
    this.tier = this.profile.tier;
    this.seed = seed;
    this.mods = { pack: 1, elite: 1, legend: 1, life: 1, damage: 1, bossLife: 1, aggro: 1, currency: 1, stones: 1, scarabs: 1, ...mods };
    this.quantity = quantity * (mods.quantity ?? 1);
    this.walkTo = null;
    this.dungeon = generateDungeon(seed, this.tier, hub ? HUB_LAYOUT : null);
    this.world = createWorld(gameContent(), { seed, terrain: dungeonTerrain(this.dungeon) });
    this.rng = dungeonRandom(seed ^ 0x51ab);
    this.elapsed = 0;
    this.phase = hub ? 'hub' : 'running';
    this.portal = null; this.portalReached = 0;
    this.flashes = []; this.loot = []; this.log = []; this.kills = 0; this.pickedUp = [];
    // The page says whether a drop still fits in the bag (5 × 12); a full bag leaves it on the floor.
    this.canTake = () => true; this.fullAt = -9; this.autoCurrency = true;
    this.recentKills = []; this.combo = 0; this.bestCombo = 0; this.lastKillAt = -9; this.cascadeKills = 0; this.screenClears = []; this.lastScreenClear = -9;
    this.build = build;
    this.spawnHero();
    if (hub) this.setupHub(); else this.populate();
    this.world.listeners.push(e => this.onEvent(e));
  }

  spawnHero(at = this.dungeon.entry) {
    const p = this.profile, e = at;
    const hero = this.hero = this.world.spawnActor({
      kind: 'hero', team: 0, brain: 'none', x: e.x, y: e.y, radius: 30, name: '你',
      mods: [...HERO_BASE, ...['fire', 'cold', 'lightning', 'chaos'].map(r => ({ stat: `res.${r}`, value: -p.resistPenalty }))],
      affixes: this.build.affixes, skills: [],
    });
    this.skills = this.build.skills.filter(Boolean).map(id => this.world.addSkill(hero, id, { manual: true }));
    hero.aim = { x: 1, y: 0 }; hero.aimPoint = { x: hero.x + 300, y: hero.y };
    this.selected = 0;
  }

  /**
   * Swap gear/skills mid-map (one-click builds, equipping from the bag): the hero is rebuilt in
   * place from the new build, keeping position, aim and how full the pools were.
   */
  rebuildHero(build) {
    const old = this.hero, fill = { life: old.life / Math.max(1, old.max.life), mana: old.mana / Math.max(1, old.max.mana), es: old.max.es ? old.es / old.max.es : 1 };
    if (old.channeling) this.world.stopChannel(old);
    detachRules(this.world, old);
    for (const m of [...old.minions]) { m.alive = false; this.world.remove(m); }
    old.alive = false; this.world.remove(old);
    this.build = build;
    this.spawnHero({ x: old.x, y: old.y });
    const h = this.hero;
    h.aim = old.aim; h.aimPoint = old.aimPoint; h.vx = old.vx; h.vy = old.vy;
    h.life = Math.max(1, h.max.life * fill.life); h.mana = h.max.mana * fill.mana; h.es = h.max.es * fill.es;
    for (const m of this.world.actors.values()) if (m.brainTarget === old) m.brainTarget = null;
    this.selected = Math.min(this.selected, Math.max(0, this.skills.length - 1));
  }

  /** Home: NPCs standing in the hall, the stash in the east wing; the map device is the portal in the north sanctum. */
  setupHub() {
    const d = this.dungeon, at = (room, [dx, dy]) => { const r = d.rooms[room]; return d.tileCenter(Math.floor(r.centerX + dx), Math.floor(r.centerY + dy)); };
    this.stations = [];
    for (const n of NPCS) {
      const p = at(n.room, n.at);
      const a = this.world.spawnActor({ kind: 'npc', team: 0, brain: 'none', x: p.x, y: p.y, radius: 34, name: n.name, mods: [{ stat: 'immortal', op: 'flag' }, { stat: 'cannotMove', op: 'flag' }] });
      a.template = 'npc'; a.npcSkin = n.skin; a.facing = { x: 0, y: -1 }; a.home = { x: p.x, y: p.y };
      this.stations.push({ ...n, kind: 'npc', x: p.x, y: p.y, actor: a, reach: 150 });
    }
    for (const s of STATIONS) { const p = at(s.room, s.at); this.stations.push({ ...s, kind: s.id, x: p.x, y: p.y, reach: s.id === 'device' ? PORTAL_REACH : 160 }); }
    const dev = this.stations.find(s => s.id === 'device');
    this.portal = { x: dev.x, y: dev.y, born: 0, inside: false, label: '地图仪', sub: '点我走过去 · 放入路石，打开图集' };
    this.arrivals = 0; this.arrived = null;
    this.town = new Town(this.dungeon, this.seed);   // the people of 夜阙 walking about
  }
  /** Direction to walk towards (tx, ty): straight in a map, round the houses at home. */
  steer(tx, ty) {
    const h = this.hero;
    if (!this.hub) return { x: tx - h.x, y: ty - h.y };
    const d = this.dungeon; let t = d.tileOf(tx, ty);
    // a click on a house: head for the nearest street tile instead
    for (let r = 1; r < 6 && !d.walkable(t.x, t.y); ++r) { const o = t; for (let dy = -r; dy <= r && o === t; ++dy) for (let dx = -r; dx <= r; ++dx) if (d.walkable(o.x + dx, o.y + dy)) { t = { x: o.x + dx, y: o.y + dy }; break; } }
    if (!d.walkable(d.tileOf(tx, ty).x, d.tileOf(tx, ty).y)) { const c = d.tileCenter(t.x, t.y); tx = c.x; ty = c.y; }
    const key = t.y * d.size + t.x;
    if (this.flowKey !== key) { this.flowKey = key; this.flowField = d.flow(tx, ty); }
    const p = steerOnFlow(d, this.flowField, h.x, h.y, tx, ty);
    return { x: p.x - h.x, y: p.y - h.y };
  }
  /** Walk to a station (NPC, stash); arriving there raises `arrivals` and sets `arrived` (the page opens its panel). */
  /** Home: click on the floor to walk there. */
  walkToPoint(x, y) { this.walkTo = { point: { x, y } }; }
  walkToStation(id) {
    const st = this.stations?.find(s => s.id === id); if (!st) return;
    if (st.id === 'device') { this.walkToPortal(); return; }
    if (Math.hypot(st.x - this.hero.x, st.y - this.hero.y) < st.reach) { this.arrived = st; this.arrivals++; return; }
    this.walkTo = { station: st };
  }

  /** Packs in every room by the map's pressure profile; the boss waits in the boss room. */
  populate() {
    const p = this.profile, d = this.dungeon;
    this.bossRoomId = d.bossRoom;
    for (const room of d.rooms) {
      if (room.kind === 'entry') continue;
      const tiles = d.tiles.filter(t => t.room === room.id);
      if (room.kind === 'boss') {
        const c = d.tileCenter(Math.floor(room.centerX), Math.floor(room.centerY));
        this.boss = this.spawnMonster(c.x, c.y, { boss: true });
        for (let i = 0; i < 10; ++i) { const t = tiles[Math.floor(this.rng() * tiles.length)], q = d.tileCenter(t.x, t.y); this.spawnMonster(q.x, q.y); }
        continue;
      }
      // Hordes: every room holds a few tight clusters (clearing is about reach and chain reactions).
      const count = Math.round(p.packSize * this.mods.pack * (0.7 + this.rng() * 0.6));
      const clusters = Math.max(2, Math.ceil(count / 9));
      const centers = Array.from({ length: clusters }, () => { const t = tiles[Math.floor(this.rng() * tiles.length)]; return d.tileCenter(t.x, t.y); });
      let elites = 0;
      for (let i = 0; i < count; ++i) {
        const c = centers[i % clusters], a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * 170;
        const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r;
        const elite = elites < Math.ceil(2 * this.mods.elite) && this.rng() < p.eliteChance * 0.5 * this.mods.elite;
        if (elite) elites++;
        const tt = d.tileOf(x, y); if (!d.walkable(tt.x, tt.y)) continue;
        this.spawnMonster(x, y, { elite });
      }
    }
    this.total = [...this.world.actors.values()].filter(a => a.team === 1).length;
  }

  spawnMonster(x, y, { elite = false, boss = false } = {}) {
    const p = this.profile, r = this.rng;
    let acc = 0, type = 'physical';
    const roll = r();
    for (const [t, w] of Object.entries(p.mix)) { acc += w; if (roll < acc) { type = t; break; } }
    const T = MONSTER_TYPES, ranged = !boss && r() < (T.ranged.share ?? 0.3) / ((T.ranged.share ?? 0.3) + (T.melee.share ?? 0.7));
    const kindRow = boss ? T.boss : elite ? T.elite : ranged ? T.ranged : T.melee, bodyRow = ranged ? T.ranged : T.melee;
    const mods = [
      { stat: 'life', value: (boss ? p.bossLife * this.mods.bossLife : elite ? p.eliteLife : p.monsterLife) * this.mods.life * (kindRow.life ?? 1) },
      { stat: `added.${type}`, value: p.monsterDamage * (kindRow.damage ?? 1) * this.mods.damage },
      { stat: 'armour', value: p.monsterArmour }, { stat: 'evasion', value: p.monsterEvasion }, { stat: 'accuracy', value: p.monsterAccuracy },
      ...['fire', 'cold', 'lightning'].map(e => ({ stat: `res.${e}`, value: p.monsterResist })), { stat: 'res.chaos', value: p.monsterResist / 2 },
    ];
    if (p.ailmentChance) for (const [a, from] of [['ignite', 'fire'], ['shock', 'lightning'], ['freeze', 'cold'], ['poison', 'chaos']]) if (type === from) mods.push({ stat: `chance.${a}`, value: p.ailmentChance });
    const names = [];
    if (elite || boss) {
      const keys = Object.keys(ELITE_MODS);
      for (let i = 0; i < p.eliteMods; ++i) { const k = keys[Math.floor(r() * keys.length)]; if (!names.includes(k)) { names.push(k); mods.push(...ELITE_MODS[k].mods); } }
    }
    const m = this.world.spawnActor({ team: 1, kind: boss ? 'boss' : elite ? 'elite' : 'monster', x, y, radius: kindRow.radius ?? 28,
      name: boss ? `${p.name} ${T.boss.name}` : elite ? `${T.elite.name}·${names.map(n => ELITE_MODS[n].name).join('·')}` : bodyRow.name,
      mods, skills: [...(boss ? T.boss.skills : kindRow.skills ?? bodyRow.skills)], aggro: (kindRow.aggro ?? 600) * this.mods.aggro, affixes: ['mob_instinct'] });
    if (names.includes('shielded')) { m.max.es = m.max.life * ELITE_MODS.shielded.esFromLife; m.es = m.max.es; }
    if (ranged && bodyRow.keepDistance) m.keepDistance = bodyRow.keepDistance;
    m.element = type; m.eliteMods = names; m.boss = boss; m.facing = { x: 0, y: 1 }; m.hitFlash = 0; m.lastSkill = ''; m.lastCastAt = -9;
    return m;
  }

  // ---- input ------------------------------------------------------------------------------
  setMove(x, y) {
    if (x || y) this.walkTo = null;                 // the keyboard always wins over click-to-loot
    if (!this.walkTo) { this.hero.vx = x; this.hero.vy = y; }
  }
  /** Click a ground label: walk to that drop and pick it up on arrival. */
  walkToLoot(key) { if (this.loot.some(l => l.key === key)) this.walkTo = key; }
  /** Walk to the portal the boss left behind; arriving there raises portalReached (the page opens the atlas). */
  walkToPortal() { if (!this.portal) return; if (this.portal.inside) this.portalReached++; else this.walkTo = 'portal'; }
  setAim(x, y) {
    const h = this.hero, dx = x - h.x, dy = y - h.y, l = Math.hypot(dx, dy) || 1;
    h.aim = { x: dx / l, y: dy / l }; h.aimPoint = { x, y };
  }
  select(i) { if (this.skills[i]) this.selected = i; }
  /** Hold to cast the selected skill toward the cursor (channelled skills channel while held). */
  setCasting(on) { this.casting = on; if (!on && this.hero.channeling) this.world.stopChannel(this.hero); }

  heroTarget() {
    const h = this.hero, aim = h.aimPoint;
    let best = null, bd = 260 * 260;
    for (const a of this.world.actors.values()) {
      if (!a.alive || a.team === h.team) continue;
      const d = (a.x - aim.x) ** 2 + (a.y - aim.y) ** 2;
      if (d < bd) { bd = d; best = a; }
    }
    return best ?? this.world.nearest(h, 'enemy', 500);
  }

  // ---- simulation ---------------------------------------------------------------------------
  step(dt) {
    if (this.phase !== 'running' && this.phase !== 'cleared' && this.phase !== 'hub') return;
    this.elapsed += dt;
    const h = this.hero, w = this.world;
    if (this.casting && h.alive && !w.quick(h, 'cannotAct')) {
      const sk = this.skills[this.selected];
      if (sk && !h.channeling && w.time >= (h.busyUntil ?? 0)) {
        const target = this.heroTarget();
        if (w.cast(h, sk, { aim: target ? { x: target.x, y: target.y } : h.aimPoint, target })) h.busyUntil = w.time + castTime(w, h, sk);
      }
      if (h.channeling) h.channelTarget = this.heroTarget();
    }
    for (const sk of this.skills) if (sk.def.reserve && !sk.active) w.cast(h, sk);
    if (this.portal) {
      // Only a click opens the atlas: walking over the portal while picking up loot does nothing.
      const d = Math.hypot(this.portal.x - h.x, this.portal.y - h.y), inside = d < PORTAL_REACH;
      if (inside && this.walkTo === 'portal') { this.portalReached++; this.walkTo = null; h.vx = h.vy = 0; }
      this.portal.inside = inside;
      if (this.walkTo === 'portal' && !inside) { const v = this.steer(this.portal.x, this.portal.y); h.vx = v.x; h.vy = v.y; }
    }
    if (this.walkTo?.point) {
      const t = this.walkTo.point;
      if (Math.hypot(t.x - h.x, t.y - h.y) < 40) { this.walkTo = null; h.vx = h.vy = 0; } else { const v = this.steer(t.x, t.y); h.vx = v.x; h.vy = v.y; }
    } else if (this.walkTo?.station) {
      const st = this.walkTo.station;
      if (Math.hypot(st.x - h.x, st.y - h.y) < st.reach) { this.arrived = st; this.arrivals++; this.walkTo = null; h.vx = h.vy = 0; }
      else { const v = this.steer(st.x, st.y); h.vx = v.x; h.vy = v.y; }
    } else if (this.walkTo && this.walkTo !== 'portal') {
      const l = this.loot.find(x => x.key === this.walkTo);
      if (!l) { this.walkTo = null; h.vx = h.vy = 0; }
      else if (Math.hypot(l.x - h.x, l.y - h.y) < 90) { if (this.canTake(l.drop)) { l.taken = true; this.pickedUp.push(l.drop); } else this.fullAt = this.elapsed; this.walkTo = null; h.vx = h.vy = 0; }
      else { h.vx = l.x - h.x; h.vy = l.y - h.y; }
    }
    w.step(dt);
    for (const m of w.actors.values()) {
      if (m.team !== 1) continue;
      m.hitFlash = Math.max(0, m.hitFlash - dt * 6);
      if (m.brainTarget) { const dx = m.brainTarget.x - m.x, dy = m.brainTarget.y - m.y, l = Math.hypot(dx, dy) || 1; m.facing = { x: dx / l, y: dy / l }; }
    }
    if (this.hub) this.town?.update(dt, h);
    // NPCs turn to face you when you come close
    if (this.hub) for (const st of this.stations) if (st.actor) {
      const dx = h.x - st.x, dy = h.y - st.y, l = Math.hypot(dx, dy);
      if (l < 700 && l > 1) st.actor.facing = { x: dx / l, y: dy / l };
    }
    for (const f of this.flashes) f.age += dt;
    this.flashes = this.flashes.filter(f => f.age < 1.1);
    // Loot: currency is picked up by walking over it; equipment waits for a click on its label (like PoE).
    if (this.autoCurrency) for (const l of this.loot) if (!l.taken && l.drop.type === 'currency' && this.elapsed - l.born > 0.9 && Math.hypot(l.x - h.x, l.y - h.y) < 110) { if (this.canTake(l.drop)) { l.taken = true; this.pickedUp.push(l.drop); } else if (this.elapsed - this.fullAt > 3) this.fullAt = this.elapsed; }
    this.loot = this.loot.filter(l => !l.taken);
    if (!h.alive || h.life <= 0) { this.phase = 'failed'; this.endedAt = this.elapsed; }
  }

  onEvent(e) {
    if (e.type === 'hit' && e.amount > 0) {
      if (e.target.team === 1) e.target.hitFlash = 1;
      if (this.flashes.length < 240) this.flashes.push({ x: e.target.x, y: e.target.y, amount: e.amount, critical: e.crit, hero: e.target === this.hero, age: 0 });
    }
    if (e.type === 'cast' && e.source.team === 1) { e.source.lastSkill = e.skill.def.name; e.source.lastCastAt = this.elapsed; }
    if (e.type === 'aggro' && e.source.team === 1 && e.target === this.hero) e.source.spottedAt = this.elapsed;
    if (e.type === 'kill' && e.target.team === 1) {
      this.kills++;
      // Kill streaks: how many died in the last second, and how many of them died to a chain reaction.
      const t = this.elapsed;
      this.recentKills.push({ t, cascade: (e.depth ?? 0) > 0 || !!e.dot });
      while (this.recentKills.length && t - this.recentKills[0].t > 1) this.recentKills.shift();
      this.combo = t - this.lastKillAt < 1.5 ? this.combo + 1 : 1;
      this.lastKillAt = t;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      if ((e.depth ?? 0) > 0) this.cascadeKills++;
      if (this.recentKills.length >= 20 && t - this.lastScreenClear > 2.5) { this.lastScreenClear = t; this.screenClears.push({ t, n: this.recentKills.length }); }
      const kind = e.target.kind === 'boss' ? 'boss' : e.target.kind === 'elite' ? 'elite' : 'monster';
      const drops = rollDrops(this.tier, kind, this.rng, { quantity: this.quantity, legend: this.mods.legend });
      // 财富圣甲虫: more currency (each stack's count, rounded by chance)
      for (const d of drops) if (d.type === 'currency' && this.mods.currency !== 1) { const c = d.count * this.mods.currency; d.count = Math.max(1, Math.floor(c) + (this.rng() < c - Math.floor(c) ? 1 : 0)); }
      drops.push(...rollScarabDrops(this.tier, kind, this.rng, this.quantity * this.mods.scarabs));
      for (const drop of drops) {
        const a = this.rng() * Math.PI * 2, r = 30 + this.rng() * (kind === 'boss' ? 160 : 60);
        this.loot.push({ key: `${this.elapsed.toFixed(3)}:${this.loot.length}:${this.rng()}`, x: e.target.x + Math.cos(a) * r, y: e.target.y + Math.sin(a) * r, sourceX: e.target.x, sourceY: e.target.y, drop, born: this.elapsed });
      }
      for (const stone of rollWaystoneDrops(this.tier, kind, this.rng, this.quantity * this.mods.stones)) {
        const a = this.rng() * Math.PI * 2, r = 40 + this.rng() * (kind === 'boss' ? 120 : 50);
        this.loot.push({ key: `w${this.elapsed.toFixed(3)}:${this.loot.length}:${this.rng()}`, x: e.target.x + Math.cos(a) * r, y: e.target.y + Math.sin(a) * r, sourceX: e.target.x, sourceY: e.target.y, drop: { type: 'waystone', stone }, born: this.elapsed });
      }
      if (e.target === this.boss) { this.phase = 'cleared'; this.clearedAt = this.elapsed; this.portal = { x: e.target.x, y: e.target.y, born: this.elapsed, inside: false }; }
    }
  }

  /** End the run: everything still on the ground is collected (the map is done). */
  collectAll() { for (const l of this.loot) this.pickedUp.push(l.drop); this.loot = []; return this.pickedUp; }

  // ---- views for the renderer -----------------------------------------------------------------
  get monsters() { return [...this.world.actors.values()].filter(a => a.team === 1 && a.alive && a.kind !== 'minion'); }
  get minions() { return [...this.world.actors.values()].filter(a => a.team === 0 && a.alive && a !== this.hero); }
  statuses(actor) {
    const by = new Map();
    for (const s of actor.statuses) {
      const look = STATUS_LOOK[s.def.id]; if (!look) continue;
      const cur = by.get(s.def.id) ?? { id: s.def.id, name: s.def.name, stacks: 0, remaining: 0, ...look };
      cur.stacks += s.stacks; cur.remaining = Math.max(cur.remaining, s.remaining); by.set(s.def.id, cur);
    }
    return [...by.values()];
  }
  monsterColor(m) { return ELEMENT_COLOR[m.element] ?? 0x7a2018; }
  projectiles() {
    return this.world.carriers.projectiles.filter(p => p.alive).map(p => ({ id: p.id, x: p.x, y: p.y, z: 70, vx: p.dx * p.speed, vy: p.dy * p.speed, vz: 0, radius: p.radius,
      hostile: p.inv.caster.team !== 0, kind: p.action.kind ?? (p.inv.skill?.def.id ?? 'bolt'), element: elementOf(p.inv), age: p.age }));
  }
  traps() { return this.world.carriers.traps.filter(t => t.alive).map(t => ({ id: t.id, x: t.x, y: t.y, trigger: t.trigger, kind: t.kind, armed: t.arm <= 0, left: t.remaining, element: elementOf(t.inv) })); }
  zones() { return this.world.carriers.zones.filter(z => z.alive).map(z => ({ id: z.id, x: z.x, y: z.y, radius: z.radius, kind: z.kind ?? z.action.kind, remaining: z.remaining, element: elementOf(z.inv),
    aimX: z.aimAt?.x, aimY: z.aimAt?.y, age: z.born !== undefined ? this.world.time - z.born : undefined })); }
}

const ELEMENTS = ['fire', 'cold', 'lightning', 'physical', 'chaos'];
export function elementOf(inv) {
  const tags = inv?.tags;
  if (tags) for (const e of ELEMENTS) if (tags.has(e)) return e;
  const dmg = inv?.skill?.def.damage;
  if (dmg) { let best = 'physical', v = -1; for (const [k, x] of Object.entries(dmg)) if (typeof x === 'number' && x > v) { v = x; best = k; } return best; }
  return 'physical';
}
