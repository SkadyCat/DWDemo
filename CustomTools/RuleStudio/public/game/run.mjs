// 一张地图的一次挑战：地牢 + 新引擎世界 + 英雄 + 按地图压力生成的怪物 + 首领 + 掉落。
// 只管玩法；画面从这里读视图（hero / monsters / projectiles / flashes / loot），特效订阅 world 的事件。
import { createWorld } from '../../core/index.mjs';
import { gameContent } from '../../core/content/game.mjs';
import { mapProfile, ELITE_MODS } from '../../core/content/maps.mjs';
import { HERO_BASE } from '../../core/sim.mjs';
import { rollDrops } from '../../core/content/items.mjs';
import { castTime } from '../../core/skills.mjs';
import { detachRules } from '../../core/rules.mjs';
import { generateDungeon, dungeonRandom } from './dungeon.mjs';

export const STATUS_LOOK = {
  ignited: { color: '#ff7a2e', glyph: '燃', fx: 'ignite' }, poisoned: { color: '#7ee36b', glyph: '毒', fx: 'poison' }, bleeding: { color: '#e0334a', glyph: '血', fx: 'bleed' },
  shocked: { color: '#ffe14d', glyph: '电', fx: 'shock' }, chilled: { color: '#5ab8f0', glyph: '缓', fx: 'chill' }, frozen: { color: '#d8f6ff', glyph: '冻', fx: 'freeze' },
  electrocuted: { color: '#fff27a', glyph: '击', fx: 'stun' }, brittle: { color: '#bfe8ff', glyph: '脆', fx: null }, sapped: { color: '#e8d36b', glyph: '疲', fx: null },
  scorched: { color: '#ff9d5c', glyph: '灼', fx: null }, superconduct: { color: '#9fd7ff', glyph: '导', fx: null }, enraged: { color: '#ff4040', glyph: '狂', fx: null },
  frostbite: { color: '#a6e6ff', glyph: '冻', fx: 'chill' }, onslaught: { color: '#ffd166', glyph: '猛', fx: null }, fortify: { color: '#c0c8d8', glyph: '护', fx: null },
  thunder_ready: { color: '#ffe680', glyph: '雷', fx: null },
};
const ELEMENT_COLOR = { physical: 0x8a3a2a, fire: 0xa8401c, cold: 0x2c6c9a, lightning: 0x9a8a24, chaos: 0x5a2a7a };

function dungeonTerrain(d) {
  return { move: d.move, sweep: d.sweep, flow: d.flow, tileOf: d.tileOf, tileCenter: d.tileCenter, size: d.size };
}

export class MapRun {
  /**
   * build: { skills:[id], affixes:[compiled affix], keepDistance? }
   * opts: { tier, family, seed, quantity }
   */
  constructor(build, { tier = 1, family = 'ruin', seed = Date.now() % 1e9, quantity = 1 } = {}) {
    this.profile = mapProfile(tier, family);
    this.tier = this.profile.tier;
    this.seed = seed;
    this.quantity = quantity;
    this.dungeon = generateDungeon(seed, this.tier);
    this.world = createWorld(gameContent(), { seed, terrain: dungeonTerrain(this.dungeon) });
    this.rng = dungeonRandom(seed ^ 0x51ab);
    this.elapsed = 0;
    this.phase = 'running';
    this.flashes = []; this.loot = []; this.log = []; this.kills = 0; this.pickedUp = [];
    this.build = build;
    this.spawnHero();
    this.populate();
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
        for (let i = 0; i < 4; ++i) { const t = tiles[Math.floor(this.rng() * tiles.length)], q = d.tileCenter(t.x, t.y); this.spawnMonster(q.x, q.y); }
        continue;
      }
      const count = Math.round(p.density * (0.45 + this.rng() * 0.4));
      for (let i = 0; i < count; ++i) {
        const t = tiles[Math.floor(this.rng() * tiles.length)], q = d.tileCenter(t.x, t.y);
        this.spawnMonster(q.x + (this.rng() - .5) * 120, q.y + (this.rng() - .5) * 120, { elite: this.rng() < p.eliteChance });
      }
    }
    this.total = [...this.world.actors.values()].filter(a => a.team === 1).length;
  }

  spawnMonster(x, y, { elite = false, boss = false } = {}) {
    const p = this.profile, r = this.rng;
    let acc = 0, type = 'physical';
    const roll = r();
    for (const [t, w] of Object.entries(p.mix)) { acc += w; if (roll < acc) { type = t; break; } }
    const ranged = !boss && r() < 0.3;
    const mods = [
      { stat: 'life', value: boss ? p.bossLife : p.monsterLife * (elite ? 3 : 1) },
      { stat: `added.${type}`, value: p.monsterDamage * (boss ? 2 : elite ? 1.5 : 1) },
      { stat: 'armour', value: p.monsterArmour }, { stat: 'evasion', value: p.monsterEvasion }, { stat: 'accuracy', value: p.monsterAccuracy },
      ...['fire', 'cold', 'lightning'].map(e => ({ stat: `res.${e}`, value: p.monsterResist })), { stat: 'res.chaos', value: p.monsterResist / 2 },
    ];
    if (p.ailmentChance) for (const [a, from] of [['ignite', 'fire'], ['shock', 'lightning'], ['freeze', 'cold'], ['poison', 'chaos']]) if (type === from) mods.push({ stat: `chance.${a}`, value: p.ailmentChance });
    const names = [];
    if (elite || boss) {
      const keys = Object.keys(ELITE_MODS);
      for (let i = 0; i < p.eliteMods; ++i) { const k = keys[Math.floor(r() * keys.length)]; if (!names.includes(k)) { names.push(k); mods.push(...ELITE_MODS[k].mods); } }
    }
    const m = this.world.spawnActor({ team: 1, kind: boss ? 'boss' : elite ? 'elite' : 'monster', x, y, radius: boss ? 70 : elite ? 40 : 28,
      name: boss ? `${p.name} 首领` : elite ? `精英·${names.map(n => ELITE_MODS[n].name).join('·')}` : ranged ? '投弹手' : '掠食者',
      mods, skills: boss ? ['mob_strike', 'boss_slam', 'boss_nova'] : [ranged ? 'mob_bolt' : 'mob_strike'], aggro: boss ? 900 : 750 });
    if (names.includes('shielded')) { m.max.es = m.max.life * ELITE_MODS.shielded.esFromLife; m.es = m.max.es; }
    if (ranged) m.keepDistance = 420;
    m.element = type; m.eliteMods = names; m.boss = boss; m.facing = { x: 0, y: 1 }; m.hitFlash = 0; m.lastSkill = ''; m.lastCastAt = -9;
    return m;
  }

  // ---- input ------------------------------------------------------------------------------
  setMove(x, y) { this.hero.vx = x; this.hero.vy = y; }
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
    if (this.phase !== 'running' && this.phase !== 'cleared') return;
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
    w.step(dt);
    for (const m of w.actors.values()) {
      if (m.team !== 1) continue;
      m.hitFlash = Math.max(0, m.hitFlash - dt * 6);
      if (m.brainTarget) { const dx = m.brainTarget.x - m.x, dy = m.brainTarget.y - m.y, l = Math.hypot(dx, dy) || 1; m.facing = { x: dx / l, y: dy / l }; }
    }
    for (const f of this.flashes) f.age += dt;
    this.flashes = this.flashes.filter(f => f.age < 1.1);
    // Loot: walk over it to pick it up.
    for (const l of this.loot) if (!l.taken && Math.hypot(l.x - h.x, l.y - h.y) < 110) { l.taken = true; this.pickedUp.push(l.drop); }
    this.loot = this.loot.filter(l => !l.taken);
    if (!h.alive || h.life <= 0) { this.phase = 'failed'; this.endedAt = this.elapsed; }
  }

  onEvent(e) {
    if (e.type === 'hit' && e.amount > 0) {
      if (e.target.team === 1) e.target.hitFlash = 1;
      if (this.flashes.length < 240) this.flashes.push({ x: e.target.x, y: e.target.y, amount: e.amount, critical: e.crit, hero: e.target === this.hero, age: 0 });
    }
    if (e.type === 'cast' && e.source.team === 1) { e.source.lastSkill = e.skill.def.name; e.source.lastCastAt = this.elapsed; }
    if (e.type === 'kill' && e.target.team === 1) {
      this.kills++;
      const kind = e.target.kind === 'boss' ? 'boss' : e.target.kind === 'elite' ? 'elite' : 'monster';
      for (const drop of rollDrops(this.tier, kind, this.rng, { quantity: this.quantity })) {
        const a = this.rng() * Math.PI * 2, r = 30 + this.rng() * (kind === 'boss' ? 160 : 60);
        this.loot.push({ key: `${this.elapsed.toFixed(3)}:${this.loot.length}:${this.rng()}`, x: e.target.x + Math.cos(a) * r, y: e.target.y + Math.sin(a) * r, sourceX: e.target.x, sourceY: e.target.y, drop, born: this.elapsed });
      }
      if (e.target === this.boss) { this.phase = 'cleared'; this.clearedAt = this.elapsed; }
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
      hostile: p.inv.caster.team !== 0, kind: p.action.kind ?? (p.inv.skill?.def.id ?? 'bolt'), element: elementOf(p.inv), age: p.lifetime - p.life }));
  }
  zones() { return this.world.carriers.zones.filter(z => z.alive).map(z => ({ id: z.id, x: z.x, y: z.y, radius: z.radius, kind: z.kind ?? z.action.kind, remaining: z.remaining, element: elementOf(z.inv) })); }
}

const ELEMENTS = ['fire', 'cold', 'lightning', 'physical', 'chaos'];
export function elementOf(inv) {
  const tags = inv?.tags;
  if (tags) for (const e of ELEMENTS) if (tags.has(e)) return e;
  const dmg = inv?.skill?.def.damage;
  if (dmg) { let best = 'physical', v = -1; for (const [k, x] of Object.entries(dmg)) if (typeof x === 'number' && x > v) { v = x; best = k; } return best; }
  return 'physical';
}
