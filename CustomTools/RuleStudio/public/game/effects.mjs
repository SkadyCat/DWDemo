// 特效桥：新引擎的事件 → 特效配方（public/vfx/fx.mjs）。只观察、不改玩法。
// 一次性特效来自世界事件（区域、打击、闪现、命中、碎冰、预警、击杀……）；
// 持续特效（投射物、地面区域、状态、召唤物）每帧从 run 的视图读取。
import { createFx } from '../vfx/fx.mjs';

const M = 0.01;
const ELEMENTS = ['fire', 'cold', 'lightning', 'chaos', 'physical'];
const V = (x, y, h = 0) => [x * M, h, -y * M];

function mainElement(e) {
  if (e.byType) { let best = null, v = 0; for (const [k, x] of Object.entries(e.byType)) if (x > v) { v = x; best = k; } if (best) return best; }
  const tags = e.tags ?? e.skill?.def?.tags ?? [];
  for (const el of ELEMENTS) if (tags.includes?.(el)) return el;
  const dmg = e.skill?.def?.damage;
  if (dmg) { let best = 'physical', v = -1; for (const [k, x] of Object.entries(dmg)) if (x > v) { v = x; best = k; } return best; }
  return 'physical';
}
const sizeOf = a => a?.boss ? 2.2 : a?.kind === 'elite' ? 1.4 : 1;

export function createEffects(T, scene) {
  const fx = createFx(T, scene), R = fx.recipes;
  globalThis.__fx = fx; // debug/automation hook
  let run = null, detach = null, lastHit = null, last = 0;
  const torches = { dungeon: null, list: [] };
  // Per-frame budgets keep a 200-monster cascade readable instead of a white-out.
  const budget = { impact: 0, death: 0, area: 0 };

  function receive(e) {
    const hostile = e.source?.team === 1;
    switch (e.type) {
      case 'area': {
        if (budget.area-- <= 0 && !e.fx) break;
        const r = e.radius * M, el = hostile ? 'hostile' : mainElement(e), at = V(e.x, e.y);
        const ang = e.source ? Math.atan2(e.y - e.source.y, e.x - e.source.x) : 0;
        const dir = Math.hypot(e.x - (e.source?.x ?? e.x), e.y - (e.source?.y ?? e.y)) > 5 ? ang : Math.atan2(e.source?.aim?.y ?? 0, e.source?.aim?.x ?? 1);
        if (e.tags?.includes('cascade')) { el === 'cold' ? R.nova(at, r, el) : R.explosion(at, r * .8, el, { ground: false }); break; }
        switch (e.fx) {
          case 'ice_nova': case 'ice_burst': R.nova(at, r, 'cold'); break;
          case 'cleave': R.slash(at, dir, r, el, { span: 2.2 }); break;
          case 'cyclone': R.whirl(at, r, el); break;
          case 'slam': R.slam(V(e.source?.x ?? e.x, e.source?.y ?? e.y), dir, r, mainElement(e)); break;
          case 'thunder': R.thunder(at, r); break;
          case 'flame_burst': R.explosion(at, r, 'fire'); break;
          case 'overload': R.explosion(at, r, 'lightning', { big: true }); R.explosion(at, r * .7, 'fire', { ground: false }); break;
          case 'poison': R.explosion(at, r, 'chaos'); break;
          case 'splash': if (budget.impact-- > 0) R.impact([at[0], .6, at[2]], el, { scale: r * 1.2 }); break;
          case 'telegraph': R.explosion(at, r, 'hostile', { big: true }); break;
          case 'explode': default:
            if (hostile && !e.fx) R.nova(at, r, 'hostile');
            else R.explosion(at, r, el, { big: r > 2.2 });
        }
        break;
      }
      case 'strike': {
        const s = e.source; if (!s) break;
        const ang = Math.atan2(e.y - s.y, e.x - s.x), heavy = e.skill?.def.id === 'heavy_strike';
        R.slash(V(s.x, s.y), ang, (heavy ? 1.9 : 1.5) * (hostile ? .75 : 1), hostile ? 'physical' : mainElement(e), { hostile, span: hostile ? 1.4 : heavy ? 1.6 : 2, heavy });
        break;
      }
      case 'remoteCast': R.cast(V(e.x, e.y, .7), mainElement(e), [0, 1, 0]); break;
      case 'cast': {
        if (hostile || e.depth > 0 || !e.source || e.source.kind !== 'hero' || !e.tags?.includes('spell')) break;
        const s = e.source, dx = (e.x ?? s.x + 1) - s.x, dy = (e.y ?? s.y) - s.y, l = Math.hypot(dx, dy) || 1;
        R.cast(V(s.x + dx / l * 45, s.y + dy / l * 45, 1.1), mainElement(e), [dx / l, .1, -dy / l]);
        break;
      }
      case 'blink': R.blink(V(e.fromX, e.fromY), V(e.x, e.y)); break;
      case 'telegraph': R.telegraph(V(e.x, e.y), e.radius * M, e.delay ?? 1); break;
      case 'shatter': R.shatter(V(e.x, e.y), sizeOf(e.target)); break;
      case 'summon': R.summon(V(e.x, e.y), mainElement(e)); break;
      case 'projectileEnd': if (e.skill?.def.id === 'fireball' && budget.impact-- > 0) R.impact(V(e.x, e.y, .7), 'fire', { scale: 1.3 }); break;
      case 'kill': {
        const t = e.target; if (!t || t.team !== 1) break;
        const big = t.boss || t.kind === 'elite';
        if (!big && budget.death-- <= 0) break;
        R.death(V(t.x, t.y), mainElement(e), sizeOf(t), { boss: !!t.boss });
        break;
      }
      case 'hit': {
        const t = e.target;
        if (!t || e.amount <= 0) break;
        if (t.kind === 'hero') { const k = Math.min(1, e.amount / Math.max(1, t.max.life) * 4); if (k > .15) { fx.pulse(.004 * k, .18 * k, [1, .08, .05]); fx.shake(.12 * k); } break; }
        const el = mainElement(e), id = e.skill?.def.id;
        if (id === 'arc' || id === 'totem_bolt') {
          const from = lastHit && run.elapsed - lastHit.t < .08 && lastHit.skill === e.skill ? lastHit : { x: e.source.x, y: e.source.y };
          R.chain(V(from.x, from.y, .9), V(t.x, t.y, .9));
          lastHit = { x: t.x, y: t.y, t: run.elapsed, skill: e.skill };
          break;
        }
        if (budget.impact-- <= 0) break;
        const s = e.source, dx = t.x - (s?.x ?? t.x), dy = t.y - (s?.y ?? t.y), l = Math.hypot(dx, dy) || 1;
        R.impact(V(t.x, t.y, .65 * sizeOf(t)), el, { scale: e.tags?.includes('projectile') ? .9 : .7, dir: [dx / l, 0, -dy / l], crit: !!e.crit });
        break;
      }
    }
  }

  function bind(next) {
    detach?.(); run = next; lastHit = null; fx.clear();
    const listener = e => { try { receive(e); } catch (err) { console.error('[VFX]', err); } };
    next.world.listeners.push(listener);
    detach = () => { const i = next.world.listeners.indexOf(listener); if (i >= 0) next.world.listeners.splice(i, 1); };
  }

  /** Called every frame after the run stepped; returns post-processing inputs (shake, ripples…). */
  function update(next, camera) {
    if (next !== run) bind(next);
    const now = run.elapsed, dt = Math.max(0, Math.min(.05, now - last)) || 1 / 60; last = now;
    budget.impact = 14; budget.death = 12; budget.area = 16;
    const live = ['cleared', 'failed'].includes(run.phase) ? [] : run.projectiles();
    fx.projectiles(live.filter(p => p.kind !== 'arc').map(p => ({ id: p.id, x: p.x * M, y: p.z * M, z: -p.y * M, vx: p.vx * M, vy: 0, vz: -p.vy * M, radius: p.radius * M, kind: p.kind, element: p.element, hostile: p.hostile, age: p.age })), dt);
    fx.zones(run.zones().filter(z => z.kind !== 'brand').map(z => ({ x: z.x * M, z: -z.y * M, radius: z.radius * M, kind: z.kind, element: z.element, left: z.remaining })));
    const hero = run.hero, st = [];
    for (const a of [hero, ...run.monsters]) {
      if (!a.alive || Math.hypot(a.x - hero.x, a.y - hero.y) > 1700) continue;
      const seen = new Set();
      for (const s of a.statuses) if (!seen.has(s.def.id)) { seen.add(s.def.id); st.push({ x: a.x * M, z: -a.y * M, size: sizeOf(a), status: s.def.id, stacks: s.stacks }); }
    }
    fx.statuses(st);
    fx.minions(run.minions.map(m => ({ x: m.x * M, z: -m.y * M, template: m.template, id: m.id })));
    // Wall torches at every room's corners (the dungeon only knows rooms; the flames are ours).
    if (torches.dungeon !== run.dungeon) {
      const d = run.dungeon; torches.dungeon = d; torches.list = [];
      for (const room of d.rooms) for (const [x, y] of [[room.x + .6, room.y + .6], [room.x + room.w - .6, room.y + .6], [room.x + .6, room.y + room.h - .6], [room.x + room.w - .6, room.y + room.h - .6]])
        torches.list.push([(x * d.tile - d.half) * M, 1.5, -(y * d.tile - d.half) * M]);
    }
    fx.torches(torches.list.filter(t => Math.hypot(t[0] - hero.x * M, t[2] + hero.y * M) < 18));
    return fx.update(dt, camera);
  }

  function dispose() { detach?.(); fx.dispose(); }
  return { group: fx.group, update, dispose, fx };
}
