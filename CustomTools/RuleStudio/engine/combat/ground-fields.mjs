// Rule-backed ground creation and contact state. Rendering never owns contact or time.
import { E, KEYS } from './common.mjs';

export const GROUND_TYPES = Object.freeze([
  { trigger: 'hit_burning_ground', type: 'burn', element: E.fire },
  { trigger: 'hit_chilled_ground', type: 'chill', element: E.frost },
  { trigger: 'hit_shocked_ground', type: 'shock', element: E.lightning },
  { trigger: 'hit_poison_ground', type: 'poison', element: E.poison },
  { trigger: 'hit_mirror_ground', type: 'mirror', element: null },
]);
const typeElement = Object.fromEntries(GROUND_TYPES.map(t => [t.type, t.element]));
const byTrigger = new Map(GROUND_TYPES.map(t => [t.trigger, t]));
const elementalGround = element => [E.fire, E.frost, E.lightning, E.poison].includes(element);
const EPS = 1e-7, CONTACT_EPS = 1e-5, TICK = .5;
export const GROUND_CAPACITY = 128;

// First contact of the actual swept carrier footprint with a circle, with a height gate.
export function groundContact(from, to, radius, ground) {
  const dx = to.x - from.x, dy = to.y - from.y, x = from.x - ground.x, y = from.y - ground.y;
  const reach = radius + ground.radius, a = dx * dx + dy * dy, b = x * dx + y * dy, c = x * x + y * y - reach * reach;
  let enter = 0, exit = 1;
  if (a > EPS) {
    const d = b * b - a * c; if (d < 0) return null;
    enter = Math.max(0, (-b - Math.sqrt(d)) / a); exit = Math.min(1, (-b + Math.sqrt(d)) / a);
  } else if (c > EPS) return null;
  const height = radius + .15, dz = to.z - from.z;
  if (Math.abs(dz) < EPS) { if (from.z > height) return null; }
  else if (dz < 0) enter = Math.max(enter, (height - from.z) / dz);
  else exit = Math.min(exit, (height - from.z) / dz);
  return enter <= exit + EPS && exit >= 0 && enter <= 1 ? Math.max(0, enter) : null;
}

export class GroundFields {
  constructor(R) { this.R = R; this.fields = []; this.ids = new WeakMap(); this.nextId = 1; }
  onHit(hit) {
    if (hit.dot || hit.minion || hit.silent || !(hit.amount > 0) || !hit.m) return;
    const R = this.R;
    if (this.triggerEntries !== R.c.triggers) {
      this.triggerEntries = R.c.triggers;
      this.activeTriggers = R.c.triggers.filter(t => byTrigger.has(t.name));
    }
    for (const t of this.activeTriggers) {
      const spec = byTrigger.get(t.name);
      if (R.time + EPS < (t.groundReady ?? -Infinity) || !R.chance(t.params.chance)) continue;
      const duration = Math.max(.05, Math.min(60, t.params.duration)), radius = Math.max(.1, Math.min(20, t.params.radius));
      t.groundReady = R.time + Math.max(.05, t.params.cooldown);
      if (this.fields.length >= GROUND_CAPACITY) this.fields.shift();
      this.fields.push({ ...spec, x: hit.m.x / 100, y: hit.m.y / 100, radius, left: duration,
        tick: 0, strength: Math.max(0, t.params.amount), inside: new Set() });
    }
  }
  tick(dt) {
    const R = this.R;
    for (const f of this.fields) {
      // Never apply a tick beyond the field's lifetime, even on a long frame.
      f.tick += Math.min(dt, Math.max(0, f.left)); f.left -= dt;
      f.inside = new Set(R.enemiesNear(f.x, f.y, f.radius).map(m => m.id));
      while (f.tick + EPS >= TICK) {
        f.tick -= TICK;
        if (f.type === 'mirror') continue;
        for (const id of f.inside) {
          if (f.type === 'burn') R.world.hostDot(R.hero.owner, id, f.strength * TICK, E.fire);
          else if (f.type === 'poison') R.ailments.applyPoison(id, { amount: f.strength * 5, element: E.poison, layers: 1, duration: 2 });
          else R.world.applyStatusKey(id, f.type === 'shock' ? KEYS.shock : KEYS.chill, f.strength, TICK + .25, R.hero.owner);
        }
      }
    }
    this.fields = this.fields.filter(f => f.left > EPS);
  }
  // All real eligible ground producers share the contact path, including older affixes.
  contacts() {
    const out = [], add = (source, radius, element) => {
      if (!(source.left > 0) && !(source.life > source.t)) return;
      if (!elementalGround(element) && source.type !== 'mirror') return;
      if (!this.ids.has(source)) this.ids.set(source, this.nextId++);
      out.push({ id: this.ids.get(source), x: source.x, y: source.y, radius, element, type: source.type });
    };
    for (const f of this.fields) add(f, f.radius, f.element);
    for (const f of this.R.ailments.fields) add(f, f.radius, typeElement[f.type]);
    for (const f of this.R.projectiles.fields) add(f, 1.2, f.element);
    for (const f of this.R.zones.zones) if (f.ground && !f.ended && f.shape === 'circle' && f.t >= f.nextAt) add(f, f.currentRadius || f.radius, f.element);
    return out;
  }
  mirror(index, field, position, fields) {
    const R = this.R, c = R.world.carriers, parent = R.rootInfo(c.root[index]);
    const rootIndex = R.openRoot(R.world.roots[c.root[index]].plan, { kind: 'cast', mirrored: true,
      more: parent?.more ?? 1, increased: parent?.increased ?? 0, critBonus: parent?.critBonus ?? 0,
      ...(parent?.minion ? { minion: parent.minion } : {}), triggered: !!parent?.triggered });
    if (rootIndex < 0) return;
    const child = R.projectiles.clone(index, rootIndex, { preserveAge: true });
    R.world.releaseHeldRoot(rootIndex);
    if (child < 0) return;
    c.px[child] = position.x; c.py[child] = position.y; c.pz[child] = position.z;
    const st = R.projectiles.state.get(c.id[child]);
    st.groundPosition = { x: c.px[child], y: c.py[child], z: c.pz[child] };
    st.groundContacts = new Set(fields.filter(f => groundContact(st.groundPosition, st.groundPosition, c.radius[child] + CONTACT_EPS, f) !== null).map(f => f.id));
    st.groundContacts.add(field.id); // A child born on the boundary must leave before it can enter.
    R.world.trace?.('ground_mirror', { field: field.id, source: c.id[index], copy: c.id[child], ...position });
  }
  onProjectilesMoved() {
    const R = this.R, fields = this.contacts(), c = R.world.carriers, count = c.num;
    // Only carriers present at the start of the contact pass may create copies.
    for (let i = 0; i < count; i++) {
      if (c.flags[i] & 1 || !R.isHeroRoot(R.world.roots[c.root[i]])) continue;
      const st = R.projectiles.state.get(c.id[i]); if (!st?.groundContactEnabled) continue;
      const to = { x: c.px[i], y: c.py[i], z: c.pz[i] }, from = st.groundPosition || to;
      if (!fields.length) { st.groundContacts = null; st.groundPosition = to; continue; }
      const inside = new Set(), entries = [];
      for (const f of fields) {
        // Keep boundary contact through Float32 position rounding; this is ten
        // micrometers of hysteresis, not a gameplay cooldown or ancestry cap.
        if (groundContact(to, to, c.radius[i] + CONTACT_EPS, f) !== null) inside.add(f.id);
        const entry = groundContact(from, to, c.radius[i], f);
        if (entry === null || st.groundContacts?.has(f.id)) continue;
        entries.push({ field: f, at: entry });
      }
      entries.sort((a, b) => Math.abs(a.at - b.at) <= EPS ? a.field.id - b.field.id : a.at - b.at);
      for (const { field, at } of entries) {
        if (field.type === 'mirror') this.mirror(i, field, { x: from.x + (to.x - from.x) * at, y: from.y + (to.y - from.y) * at, z: from.z + (to.z - from.z) * at }, fields);
        else if (st.groundTintEnabled) st.groundTint = field.element;
      }
      st.groundContacts = inside; st.groundPosition = to;
    }
  }
  view() { return this.fields.map(f => ({ type: f.type, element: f.element, x: f.x, y: f.y, radius: f.radius, left: f.left })); }
}
