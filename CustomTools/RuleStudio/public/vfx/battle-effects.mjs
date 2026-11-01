// The only game-facing adapter. Observes traces and reads views; never casts, deals damage,
// consumes random numbers, alters rules, or owns gameplay time.
import { modules, summonPresentation } from './catalog.mjs';

export function observeBattle(battle, receive, onError = error => console.error('[VFX]', error)) {
  const world = battle.host.world, previous = world.trace;
  const wrapper = function(kind, payload) {
    // Copy presentation inputs before later simulation steps recycle roots/targets.
    try { receive(kind, payload); } catch (error) { onError(error); }
    return previous?.call(this, kind, payload);
  };
  world.trace = wrapper;
  return () => { if (world.trace === wrapper) world.trace = previous; };
}

export function createBattleEffects(T, scene, { capacity = 96, impactCapacity = 256 } = {}) {
  const group = new T.Group(); group.name = 'BattlePresentation'; scene.add(group);
  const batches = new Map(), slots = [], queue = [];
  impactCapacity = Math.max(1, Math.floor(impactCapacity));
  const impacts = []; let impactCursor = 0, impactCount = 0;
  const launches = new Map(), portals = []; const portalCapacity = 512; let portalCursor = 0;
  let battle = null, detach = null, lastHit = null, ruleDirection = 0, disposed = false, tailAge = 0, lastWall = 0;
  let groundLooks = new WeakMap(), groundSerial = 0;
  function batch(id, cap = 96) {
    if (!batches.has(id)) { const fx = modules[id].createBatch(T, cap); group.add(fx.group); batches.set(id, fx); }
    return batches.get(id);
  }
  const point = id => {
    const w = battle.host.world, i = w.targetIndexOf(id);
    return i >= 0 ? { x: w.targets.px[i], y: .7, z: -w.targets.py[i] } : null;
  };
  function push(id, data, position = null, scale = 1, rotation = 0) {
    if (queue.length < 128) queue.push({ id, data, position, scale, rotation, born: battle.elapsed });
  }
  function receive(kind, p) {
    if (kind === 'rule') {
      if (Math.hypot(p.event.dx, p.event.dy) > .001) ruleDirection = Math.atan2(p.event.dy, p.event.dx);
    } else if (kind === 'spawn' && ['treasury_weapon', 'treasury_ea'].includes(p.plan.kindNames.names[p.kind])) {
      // Snapshot the real scattered muzzle after projectile modifiers. Portals stay
      // at this launch plane and expire independently of the projectile's lifetime.
      const c = battle.host.world.carriers, i = p.index, speed = Math.hypot(c.vx[i], c.vy[i], c.vz[i]) || 1;
      const launch = { x: c.px[i], y: c.pz[i], z: -c.py[i], dx: c.vx[i] / speed, dy: c.vz[i] / speed, dz: -c.vy[i] / speed,
        radius: c.radius[i], born: battle.elapsed, kind: p.plan.kindNames.names[p.kind], visualSeed: battle.combat?.projectiles.state.get(p.id)?.visualSeed ?? c.id[i] };
      if (launches.size >= 4096) launches.delete(launches.keys().next().value);
      launches.set(p.id, launch); portals[portalCursor] = launch; portalCursor = (portalCursor + 1) % portalCapacity;
    } else if (kind === 'area') {
      const z = battle.combat?.zones.zones.find(z => z.effect === p.effect && z.shape === p.shape && Math.abs(z.x - p.x) < .001 && Math.abs(z.y - p.y) < .001);
      let radius = p.radius;
      if (z?.shape === 'ring') radius *= z.outer / z.radius;
      if (z?.shape === 'sector') radius *= z.sectorRadius / z.radius;
      const data = { radius, inner: z ? z.inner * p.radius / z.radius : radius * .5, angle: z?.angle, width: z?.width, length: p.length, element: p.element };
      const position = { x: p.x, y: 0, z: -p.y }, rotation = p.dir ?? ruleDirection;
      const shaped = { ring: 'area-ring', sector: 'area-sector', line: 'area-earth-wave' }[p.shape];
      const melee = radius <= 3.2 ? { player_slash: 'melee-slash', monster_claw: 'melee-claw', monster_strike: 'melee-heavy-strike',
        // Growth builds: the swing itself; larger areas from the same skill (bursts, stages) read as explosions.
        create_rage_cleave: 'melee-heavy-strike', create_thunder_strike: 'melee-slash', create_ground_slam: 'melee-heavy-strike',
        create_shield_slam: 'melee-heavy-strike', create_soul_reap: 'melee-slash', create_flicker_strike: 'melee-slash' }[p.effect] : null;
      if (p.effect === 'death_lightning' || p.effect === 'shock_consume_strike' || (p.effect === 'create_thunder_strike' && radius > 3.2)) { push('death-lightning', {}, position, radius); if(p.effect === 'shock_consume_strike')push('area-circle',data,position); }
      else if (p.effect === 'poison_flask_burst') push('poison-flask-burst', {}, position, radius);
      else if (shaped) push(shaped, data, position, 1, rotation);
      else if (melee) push(melee, data, position, 1, rotation);
      else { push('element-explosion', { element: p.element }, position, radius); push('area-circle', data, position); }
    } else if (kind === 'summon_fire') {
      const minion = battle.combat?.minions?.states?.get(p.id);
      const summon = battle.host.world.summons.find(s => s.id === p.id);
      const presentation = summonPresentation[minion?.kind || summon?.kindName || p.kind];
      const attack = presentation?.attack, target = point(p.target);
      if (attack && target) push(attack.id, { element: attack.element },
        attack.origin === 'target' ? target : { x: p.x, y: .6, z: -p.y }, attack.scale,
        Math.atan2(target.z + p.y, target.x - p.x));
    } else if (kind === 'ground_mirror') {
      push('element-hit', { element: 5 }, { x: p.x, y: Math.max(.15, p.z), z: -p.y }, .35);
    } else if (kind === 'projectile_hit') {
      if (p.kind === 'treasury_ea') push('treasury-ea-impact', { element: 3 }, { x: p.x, y: Math.max(.05,p.z), z: -p.y }, 3.5);
      // Every accepted contact, including shield absorption and zero-damage hits.
      // Copy before roots and carriers are recycled; no per-kind gameplay hooks.
      impacts[impactCursor] = { x: p.x, y: p.z, z: -p.y, dx: p.dx, dy: p.dz, dz: -p.dy,
        element: p.element, kind: p.kind, radius: p.radius, surface: p.surface, born: battle.elapsed };
      impactCursor = (impactCursor + 1) % impactCapacity;
    } else if (kind === 'damage' && !p.dot && p.Amount > 0) {
      const target = point(p.TargetExternalId), row = battle.host.world.damageLog.at(-1), info = row?.Info;
      if (!target) return;
      if (info?.strike === 'arc' || info?.strike === 'chain') {
        const origin = lastHit?.time === battle.elapsed ? lastHit.position : point(p.OwnerExternalId);
        if (origin) push('lightning-chain', { from: origin, to: target });
      }
      if (info?.kind !== 'projectile') push('element-hit', { element: p.Element }, target, .65);
      lastHit = { time: battle.elapsed, position: target };
    }
  }
  function bind(next) {
    detach?.(); battle = next; queue.length = 0; impacts.length = 0; impactCursor = impactCount = 0; lastHit = null; ruleDirection = 0;
    groundLooks = new WeakMap(); groundSerial = 0;
    launches.clear(); portals.length = 0; portalCursor = 0;
    for (const slot of slots) { slot.active = false; slot.effect.group.visible = false; }
    detach = observeBattle(next, receive);
  }
  function acquire(event) {
    let slot = slots.find(s => !s.active && s.id === event.id);
    if (!slot) {
      if (slots.length >= capacity) {
        slot = slots.find(s => !s.active) || slots.reduce((a, b) => a.born < b.born ? a : b);
        if (slot.id !== event.id) { group.remove(slot.effect.group); slot.effect.dispose(); slot.effect = modules[event.id].createEffect(T); group.add(slot.effect.group); }
      } else { slot = { effect: modules[event.id].createEffect(T) }; group.add(slot.effect.group); slots.push(slot); }
    }
    Object.assign(slot, event, { active: true });
    slot.effect.group.position.set(event.position?.x ?? 0, event.position?.y ?? 0, event.position?.z ?? 0);
    slot.effect.group.scale.set(event.scale, 1, event.scale); slot.effect.group.rotation.set(0, event.rotation, 0);
  }
  const summons = new Map(), persistent = new Map();
  function clearPersistent() { for (const s of persistent.values()) { group.remove(s.effect.group); s.effect.dispose(); } persistent.clear(); }
  function update(next, wallTime = next.elapsed) {
    if (disposed) return;
    if (next !== battle) { bind(next); tailAge = 0; lastWall = wallTime; for (const s of summons.values()) { group.remove(s.effect.group); s.effect.dispose(); } summons.clear(); clearPersistent(); }
    if (['cleared', 'failed'].includes(battle.phase)) tailAge += Math.max(0, Math.min(.1, wallTime - lastWall));
    lastWall = wallTime;
    for (const event of queue) acquire(event); queue.length = 0;
    for (const slot of slots) {
      if (!slot.active) continue;
      const age = Math.max(0, battle.elapsed - slot.born + tailAge);
      if (age >= modules[slot.id].meta.duration) { slot.active = false; slot.effect.group.visible = false; }
      else slot.effect.update(age, slot.data);
    }
    const liveImpacts = [];
    for (const hit of impacts) {
      const age = Math.max(0, battle.elapsed - hit.born + tailAge);
      if (age < modules['projectile-hit'].meta.duration) liveImpacts.push({ ...hit, age });
    }
    impactCount = liveImpacts.length;
    if (impactCount || batches.has('projectile-hit')) batch('projectile-hit', impactCapacity).update(liveImpacts);
    const projectiles = { 'projectile-ice-lance': [], 'projectile-fireball': [], 'projectile-void-bolt': [], 'projectile-poison-flask': [], 'projectile-treasury-weapon': [], 'projectile-treasury-ea': [] }, whirlwinds = [];
    for (const p of ['cleared', 'failed'].includes(battle.phase) ? [] : battle.projectiles()) {
      if (p.kind === 'whirlwind') { whirlwinds.push(p); continue; }
      const id = p.kind === 'treasury_ea' ? 'projectile-treasury-ea' : p.kind === 'treasury_weapon' || p.kind === 'dance_blade' ? 'projectile-treasury-weapon' : p.kind === 'poison_flask' ? 'projectile-poison-flask' : p.kind === 'ice_lance' ? 'projectile-ice-lance' : p.kind === 'fireball' ? 'projectile-fireball' : 'projectile-void-bolt';
      projectiles[id].push({ x: p.x * .01, y: p.z * .01, z: -p.y * .01, dx: p.vx, dy: p.vz, dz: -p.vy, vx: p.vx, vy: p.vy, radius: p.radius * .01, hostile: p.hostile, element: p.element, ordinal: p.ordinal, visualSeed: p.visualSeed, age: p.age, launch: launches.get(p.id) });
    }
    for (const [id, rows] of Object.entries(projectiles)) if (id !== 'projectile-treasury-ea' && (rows.length || batches.has(id))) batch(id, id === 'projectile-poison-flask' ? 512 : 4096).update(rows, battle.elapsed);
    const livePortals = [], eaPortals = [];
    for (const launch of portals) {
      const age = Math.max(0, battle.elapsed - launch.born + tailAge);
      if (launch.kind === 'treasury_ea') { if(age < .52)eaPortals.push({...launch,age}); }
      else if (age < modules['royal-treasury-gate'].meta.duration) livePortals.push({ ...launch, age });
    }
    if (livePortals.length || batches.has('royal-treasury-gate')) batch('royal-treasury-gate', portalCapacity).update(livePortals);
    if (projectiles['projectile-treasury-ea'].length || eaPortals.length || batches.has('projectile-treasury-ea')) batch('projectile-treasury-ea',64).update(projectiles['projectile-treasury-ea'],battle.elapsed,eaPortals);
    for (const [id, launch] of launches) if (battle.elapsed - launch.born >= (launch.kind === 'treasury_ea' ? 1.2 : .2)) launches.delete(id);
    const statuses = Object.fromEntries(['chill', 'freeze', 'shock', 'ignite', 'bleed', 'slow', 'poison', 'erosion', 'stun'].map(id => [`status-${id}`, []]));
    for (const mon of battle.monsters) {
      const size = mon.boss ? 2.2 : .85 + .45 * Math.min(1, mon.maxHealth / 300);
      for (const s of battle.monsterStatuses(mon)) statuses[`status-${s.id}`]?.push({ x: mon.x * .01, z: -mon.y * .01, radius: .46 * size, height: 1.5 * size, stacks: s.stacks });
    }
    if (battle.hero && !battle.hero.dead) for (const s of battle.monsterStatuses({ id: battle.heroTargetId })) {
      statuses[`status-${s.id}`]?.push({ x: battle.hero.x * .01, z: -battle.hero.y * .01, radius: .46, height: 1.5, stacks: s.stacks });
    }
    for (const [id, rows] of Object.entries(statuses)) if (rows.length || batches.has(id)) batch(id).update(rows, battle.elapsed);
    const grounds = { 'ground-burning': [], 'ground-poison': [], 'ground-chill': [], 'ground-shock': [], 'ground-mirror': [] };
    const addField = (id, f, radius = f.radius) => {
      if (!groundLooks.has(f)) groundLooks.set(f, { seed: Math.imul(++groundSerial, 2654435761) >>> 0, born: battle.elapsed });
      const look = groundLooks.get(f);
      grounds[id].push({ x: f.x, z: -f.y, radius, seed: look.seed, age: battle.elapsed - look.born, left: f.left ?? f.life - f.t });
    };
    for (const f of battle.combat?.ailments?.fields ?? []) addField({ burn: 'ground-burning', poison: 'ground-poison', chill: 'ground-chill' }[f.type] ?? 'ground-poison', f);
    for (const f of battle.combat?.grounds?.fields ?? []) addField({ burn: 'ground-burning', poison: 'ground-poison', chill: 'ground-chill', shock: 'ground-shock', mirror: 'ground-mirror' }[f.type], f);
    for (const f of battle.combat?.projectiles?.fields ?? []) if ([0, 1, 4].includes(f.element)) addField(f.element === 0 ? 'ground-burning' : f.element === 1 ? 'ground-chill' : 'ground-poison', f, 1.2);
    for (const f of battle.combat?.zones?.zones ?? []) if (f.ground && !f.ended && f.t >= f.nextAt && f.shape === 'circle' && [0, 1, 4].includes(f.element)) addField(f.element === 0 ? 'ground-burning' : f.element === 1 ? 'ground-chill' : 'ground-poison', f, f.currentRadius || f.radius);
    for (const [id, rows] of Object.entries(grounds)) if (rows.length || batches.has(id)) batch(id, 128).update(rows, battle.elapsed);
    const liveZones = new Set();
    function showZone(key, data, age = battle.elapsed, prefab = null) {
      if (liveZones.size >= 48) return;
      liveZones.add(key); const id = prefab ?? ({ ring: 'area-ring', sector: 'area-sector', line: 'area-earth-wave' }[data.shape] ?? 'area-circle');
      if (persistent.get(key)?.id !== id) { const old = persistent.get(key); if (old) { group.remove(old.effect.group); old.effect.dispose(); } const effect = modules[id].createEffect(T); group.add(effect.group); persistent.set(key, { id, effect }); }
      const state = persistent.get(key), effect = state.effect; Object.assign(state, { data, age, exitStarted: null });
      effect.group.position.set(data.x, data.height ?? 0, -data.y); effect.group.rotation.y = data.dir ?? 0; effect.update(age, { ...data, persistent: true });
    }
    for (const p of whirlwinds) showZone(`projectile:${p.id}`, { x: p.x * .01, y: p.y * .01, radius: p.radius * .01, life: p.lifetime, groundTint: p.groundTint }, p.age, 'whirlwind');
    for (const z of battle.combat?.zones?.zones ?? []) {
      if ((!z.persistent && !z.ground) || z.t < z.nextAt || z.ended) continue;
      const radius = z.currentRadius || z.radius, scale = radius / z.radius;
      showZone(`zone:${z.id}`, { ...z, radius: (z.shape === 'ring' ? z.outer : z.shape === 'sector' ? z.sectorRadius : z.radius) * scale, inner: z.inner * scale }, z.t);
    }
    for (const [i, f] of (battle.combat?.projectiles?.view() ?? []).entries()) showZone(`field:${i}`, { ...f, shape: 'circle' });
    for (const [key, fx] of persistent) if (!liveZones.has(key)) {
      const outro = modules[fx.id].meta.outro || 0;
      if (outro && fx.exitStarted == null) fx.exitStarted = wallTime;
      const closingAge = wallTime - fx.exitStarted;
      if (outro && closingAge < outro) { fx.effect.update(fx.age + closingAge, { ...fx.data, stock: 0, persistent: true, closingAge }); continue; }
      group.remove(fx.effect.group); fx.effect.dispose(); persistent.delete(key);
    }
    const live = new Set();
    for (const s of battle.summons()) {
      const presentation = summonPresentation[s.kind];
      if (!presentation) continue;
      live.add(s.id);
      if (!summons.has(s.id)) { const effect = modules[presentation.prefab].createEffect(T); group.add(effect.group); summons.set(s.id, { effect }); }
      const fx = summons.get(s.id).effect;
      fx.group.position.set(s.x * .01, 0, -s.y * .01); fx.group.rotation.y = Math.atan2(s.dx, -s.dy); fx.group.scale.setScalar(Math.max(.01, Math.min(1, s.remaining / .3))); fx.update(battle.elapsed, s);
    }
    for (const [id, s] of summons) if (!live.has(id)) { group.remove(s.effect.group); s.effect.dispose(); summons.delete(id); }
  }
  function dispose() { if (disposed) return; disposed = true; detach?.(); launches.clear(); portals.length = 0; clearPersistent(); for (const s of slots) s.effect.dispose(); for (const b of batches.values()) b.dispose(); for (const s of summons.values()) s.effect.dispose(); group.clear(); scene.remove(group); }
  return { group, update, dispose, get activeCount() { return slots.filter(s => s.active).length; }, get impactCount() { return impactCount; } };
}
