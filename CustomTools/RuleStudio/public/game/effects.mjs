// 特效桥：新引擎的事件 → 预制体特效。只观察、不改玩法。
// One-shot effects come from world events (area, strike, blink, hit, shatter, telegraph…);
// continuous ones (projectiles, ground zones, status auras, minions) are read from the run's views each frame.
import { modules } from '../vfx/catalog.mjs';

const EL = { fire: 0, cold: 1, lightning: 2, physical: 3, chaos: 4 };
const M = 0.01;
const PROJECTILE_PREFAB = {
  fireball: 'projectile-fireball', frost_bolt: 'projectile-ice-lance', viper_knife: 'projectile-viper-knife', thunder_bolt: 'projectile-ball-lightning',
  spark: 'projectile-ball-lightning', mob_bolt: 'projectile-void-bolt', bolt: 'projectile-void-bolt',
};
// Fast chaining bolts (arc) are drawn as lightning between hits, not as a flying body.
const INVISIBLE = new Set(['arc']);
const ZONE_PREFAB = { flame_wall: 'ground-burning', pod: 'ground-poison', blade: 'ground-mirror' };
const STATUS_PREFAB = { chilled: 'status-chill', frozen: 'status-freeze', shocked: 'status-shock', ignited: 'status-ignite', bleeding: 'status-bleed', poisoned: 'status-poison', electrocuted: 'status-stun', frostbite: 'status-chill' };
const MINION_PREFAB = { spirit_blade: 'summon-spirit', storm_totem: 'summon-storm-totem' };

function mainElement(e) {
  if (e.byType) { let best = 'physical', v = -1; for (const [k, x] of Object.entries(e.byType)) if (x > v) { v = x; best = k; } return best; }
  for (const t of e.tags ?? []) if (t in EL) return t;
  return 'physical';
}

export function createEffects(T, scene) {
  const group = new T.Group(); group.name = 'CoreEffects'; scene.add(group);
  const batches = new Map(), slots = [], queue = [], impacts = [], persistent = new Map();
  let run = null, detach = null, lastHit = null;
  const batch = (id, cap = 256) => { if (!batches.has(id)) { const fx = modules[id].createBatch(T, cap); group.add(fx.group); batches.set(id, fx); } return batches.get(id); };
  const push = (id, data, x, y, scale = 1, rotation = 0, height = 0) => { if (modules[id] && queue.length < 160) queue.push({ id, data, position: { x: x * M, y: height, z: -y * M }, scale, rotation, born: run.elapsed }); };
  const dirOf = e => { const s = e.source; if (!s) return 0; const ax = (e.x ?? s.x) - s.x, ay = (e.y ?? s.y) - s.y; return Math.hypot(ax, ay) > 1 ? Math.atan2(ay, ax) : Math.atan2(s.aim?.y ?? 0, s.aim?.x ?? 1); };

  function receive(e) {
    const hostile = e.source?.team === 1;
    switch (e.type) {
      case 'area': {
        const r = e.radius * M, el = mainElement(e), rot = dirOf(e);
        const style = { ice_nova: ['gs-nova', 'frost'], cleave: ['gs-crescent', 'cleave'], cyclone: ['gs-crescent', 'whirl'], slam: ['gs-crescent', 'thunder'], ice_burst: ['gs-nova', 'frost'], thunder: ['gs-nova', 'storm'] }[e.fx];
        if (e.fx === 'slam') push('gs-quake', { radius: r }, e.x, e.y, 1, rot);
        if (e.fx === 'thunder' || e.tags?.includes('herald_thunder')) push('death-lightning', {}, e.x, e.y, r);
        if (style) push(style[0], { style: style[1], radius: r, seed: (e.x * 7 + e.y * 13) % 17 }, e.x, e.y, 1, rot);
        else if (e.fx === 'telegraph') push('element-explosion', { element: EL[el] }, e.x, e.y, r);
        else if (e.fx === 'overload' || e.tags?.includes('overload')) { push('element-explosion', { element: 0 }, e.x, e.y, r); push('death-lightning', {}, e.x, e.y, r * 0.7); }
        else if (e.fx === 'explode' || e.tags?.includes('explosion')) push('element-explosion', { element: EL[el] }, e.x, e.y, r);
        else { push('element-explosion', { element: EL[el] }, e.x, e.y, r); push('area-circle', { radius: r, element: EL[el] }, e.x, e.y); }
        break;
      }
      case 'strike': push(hostile ? 'melee-claw' : 'melee-slash', { radius: 1.4, element: 3 }, e.source.x, e.source.y, 1, dirOf(e)); break;
      case 'blink': push('gs-blink', { length: Math.hypot(e.x - e.fromX, e.y - e.fromY) * M }, e.fromX, e.fromY, 1, Math.atan2(e.y - e.fromY, e.x - e.fromX)); break;
      case 'telegraph': push('area-circle', { radius: e.radius * M, element: 0, warning: true }, e.x, e.y); break;
      case 'shatter': push('status-freeze', {}, e.x, e.y, 1.2); push('element-explosion', { element: 1 }, e.x, e.y, 1.1); break;
      case 'projectileHit': if (impacts.length < 256) impacts.push({ x: e.x * M, y: .7, z: -e.y * M, dx: 0, dy: 0, dz: 0, element: EL[mainElement(e)] ?? 3, radius: .2, born: run.elapsed }); break;
      case 'hit': {
        if (!e.target || e.amount <= 0) break;
        const el = mainElement(e);
        const chained = e.skill?.def.id === 'arc' || e.skill?.def.id === 'totem_bolt';
        if (chained) {
          const from = lastHit && run.elapsed - lastHit.t < 0.08 && lastHit.skill === e.skill ? lastHit : { x: e.source.x, y: e.source.y };
          push('lightning-chain', { from: { x: from.x * M, y: .9, z: -from.y * M }, to: { x: e.target.x * M, y: .9, z: -e.target.y * M } }, 0, 0);
        }
        if (!e.tags?.includes('projectile') || chained) push('element-hit', { element: EL[el] }, e.target.x, e.target.y, .65, 0, .7);
        lastHit = { x: e.target.x, y: e.target.y, t: run.elapsed, skill: e.skill };
        break;
      }
    }
  }

  function bind(next) {
    detach?.(); run = next; queue.length = 0; impacts.length = 0; lastHit = null;
    for (const s of slots) { s.active = false; s.effect.group.visible = false; }
    for (const p of persistent.values()) { group.remove(p.effect.group); p.effect.dispose(); }
    persistent.clear();
    const listener = e => { try { receive(e); } catch (err) { console.error('[VFX]', err); } };
    next.world.listeners.push(listener);
    detach = () => { const i = next.world.listeners.indexOf(listener); if (i >= 0) next.world.listeners.splice(i, 1); };
  }

  function acquire(ev) {
    let slot = slots.find(s => !s.active && s.id === ev.id);
    if (!slot) {
      if (slots.length >= 120) {
        slot = slots.find(s => !s.active) || slots.reduce((a, b) => a.born < b.born ? a : b);
        if (slot.id !== ev.id) { group.remove(slot.effect.group); slot.effect.dispose(); slot.effect = modules[ev.id].createEffect(T); group.add(slot.effect.group); }
      } else { slot = { effect: modules[ev.id].createEffect(T) }; group.add(slot.effect.group); slots.push(slot); }
    }
    Object.assign(slot, ev, { active: true });
    slot.effect.group.visible = true;
    slot.effect.group.position.set(ev.position.x, ev.position.y, ev.position.z);
    slot.effect.group.scale.set(ev.scale, 1, ev.scale); slot.effect.group.rotation.set(0, ev.rotation, 0);
  }

  function update(next) {
    if (next !== run) bind(next);
    for (const ev of queue) acquire(ev); queue.length = 0;
    for (const s of slots) {
      if (!s.active) continue;
      const age = run.elapsed - s.born;
      if (age >= modules[s.id].meta.duration) { s.active = false; s.effect.group.visible = false; } else s.effect.update(age, s.data);
    }
    const liveImpacts = impacts.filter(h => run.elapsed - h.born < modules['projectile-hit'].meta.duration).map(h => ({ ...h, age: run.elapsed - h.born }));
    impacts.length = 0; impacts.push(...liveImpacts.map(({ age, ...h }) => h));
    if (liveImpacts.length || batches.has('projectile-hit')) batch('projectile-hit', 256).update(liveImpacts);
    // Projectiles
    const rows = {};
    for (const id of new Set(Object.values(PROJECTILE_PREFAB))) rows[id] = [];
    const live = ['cleared', 'failed'].includes(run.phase) ? [] : run.projectiles();
    for (const p of live) {
      if (INVISIBLE.has(p.kind)) continue;
      const id = PROJECTILE_PREFAB[p.kind] ?? (p.hostile ? 'projectile-void-bolt' : 'projectile-void-bolt');
      rows[id].push({ x: p.x * M, y: p.z * M, z: -p.y * M, dx: p.vx * M, dy: 0, dz: -p.vy * M, vx: p.vx * M, vy: p.vy * M, radius: Math.max(.12, p.radius * M), hostile: p.hostile, element: EL[p.element] ?? 3, ordinal: p.id, visualSeed: p.id, age: p.age });
    }
    for (const [id, list] of Object.entries(rows)) if (list.length || batches.has(id)) batch(id, 1024).update(list, run.elapsed);
    // Ground zones
    const grounds = {};
    for (const z of run.zones()) {
      const id = ZONE_PREFAB[z.kind] ?? (z.element === 'fire' ? 'ground-burning' : z.element === 'cold' ? 'ground-chill' : z.element === 'lightning' ? 'ground-shock' : z.element === 'chaos' ? 'ground-poison' : null);
      if (!id || z.kind === 'brand') continue;
      (grounds[id] ??= []).push({ x: z.x * M, z: -z.y * M, radius: z.radius * M, seed: z.id * 2654435761 >>> 0, age: run.elapsed, left: z.remaining });
    }
    for (const id of ['ground-burning', 'ground-poison', 'ground-chill', 'ground-shock', 'ground-mirror']) if (grounds[id]?.length || batches.has(id)) batch(id, 128).update(grounds[id] ?? [], run.elapsed);
    // Status auras on monsters and the hero
    const st = {};
    const add = (a, size) => { for (const s of a.statuses) { const id = STATUS_PREFAB[s.def.id]; if (id) (st[id] ??= []).push({ x: a.x * M, z: -a.y * M, radius: .46 * size, height: 1.5 * size, stacks: s.stacks }); } };
    for (const m of run.monsters) add(m, m.boss ? 2.2 : m.kind === 'elite' ? 1.25 : 1);
    if (run.hero.alive) add(run.hero, 1);
    for (const id of new Set(Object.values(STATUS_PREFAB))) if (st[id]?.length || batches.has(id)) batch(id, 256).update(st[id] ?? [], run.elapsed);
    // Minions as their summon prefabs
    const seen = new Set();
    for (const m of run.minions) {
      const id = MINION_PREFAB[m.template]; if (!id) continue;
      seen.add(m.id);
      if (!persistent.has(m.id)) { const effect = modules[id].createEffect(T); group.add(effect.group); persistent.set(m.id, { effect }); }
      const fx = persistent.get(m.id).effect;
      fx.group.position.set(m.x * M, 0, -m.y * M); fx.update(run.elapsed, { x: m.x * M, y: m.y * M, remaining: 1 });
    }
    for (const [id, p] of persistent) if (!seen.has(id)) { group.remove(p.effect.group); p.effect.dispose(); persistent.delete(id); }
  }

  function dispose() { detach?.(); for (const s of slots) s.effect.dispose(); for (const b of batches.values()) b.dispose(); for (const p of persistent.values()) p.effect.dispose(); group.clear(); scene.remove(group); }
  return { group, update, dispose };
}
