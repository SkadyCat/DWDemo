// 生命体征系统：状态计时与持续伤害、回复、能量护盾充能、充能球过期、光环、死亡清理。
import { dotDamage } from './damage.mjs';
import { activeInstances } from './status.mjs';
import { CHARGES } from './registry.mjs';

const AURA_PULSE = 0.25;

export const vitals = {
  step(world, dt) {
    const pulse = Math.floor(world.time / AURA_PULSE) !== Math.floor((world.time - dt) / AURA_PULSE);
    for (const a of world.actors.values()) {
      if (!a.alive) continue;
      // Statuses
      if (a.statuses.length) {
        const seen = new Set();
        for (const s of a.statuses) {
          if (s.def.dot && !seen.has(s.def)) { seen.add(s.def); for (const inst of activeInstances(a, s.def)) dotDamage(world, a, inst, dt); }
          if (pulse && s.def.aura) pulseAura(world, a, s);
        }
        let expired = false;
        for (const s of a.statuses) { s.remaining -= dt; if (s.remaining <= 0) expired = true; }
        if (expired) {
          const gone = a.statuses.filter(s => s.remaining <= 0);
          a.statuses = a.statuses.filter(s => s.remaining > 0);
          a.statusVersion++;
          for (const s of gone) world.emit({ type: 'statusExpired', source: a, key: s.def.id, tags: s.def.tags });
          if (gone.some(s => s.def.mods.get('life') || s.def.mods.get('mana') || s.def.mods.get('es'))) world.refreshPools(a);
        }
        if (!a.alive) continue;
      }
      // Recovery
      const lr = world.mayHave(a, 'life.regen') ? world.stat(a, 'life.regen') : 0;
      if (lr) a.life = Math.min(a.max.life, a.life + lr * dt);
      const mr = world.mayHave(a, 'mana.regen') ? world.stat(a, 'mana.regen') : 0;
      if (mr) a.mana = Math.min(a.max.mana * (1 - a.reserved / 100), a.mana + mr * dt);
      if (a.max.es > 0) {
        if (a.esDelay > 0) a.esDelay -= dt;
        else if (a.es < a.max.es) a.es = Math.min(a.max.es, a.es + a.max.es * world.stat(a, 'es.rechargeRate') / 100 * dt);
      }
      // Charges expire together when not refreshed
      if (a.resourceTimers.size) for (const c of CHARGES) {
        const t = a.resourceTimers.get(c);
        if (t === undefined) continue;
        if (t - dt <= 0) { a.resourceTimers.delete(c); if (a.resource(c) > 0) world.consume(a, c, 1); if (a.resource(c) > 0) a.resourceTimers.set(c, world.stat(a, `charge.duration.${c}`)); }
        else a.resourceTimers.set(c, t - dt);
      }
      // Generic resources with decay (rage, meters)
      if (world.content.resources) for (const [key, def] of world.content.resources) {
        if (!def.decay) continue;
        const v = a.resource(key);
        if (v > 0 && (world.time - (a.lastEvent.get(def.decayAfter ?? '') ?? -1e9)) > (def.decayDelay ?? 0)) a.resources.set(key, Math.max(0, v - def.decay * dt));
      }
    }
    // Dead actors leave once their death events are queued; minions die with their owner.
    for (const a of [...world.actors.values()]) if (!a.alive || (a.owner && !a.owner.alive && a.owner.kind !== 'hero')) { if (a.alive) a.alive = false; world.remove(a); }
  },
};

function pulseAura(world, bearer, inst) {
  const { radius = 300, team = 'ally', status, self = true } = inst.def.aura;
  const r2 = radius * radius;
  world.grid.query(bearer.x, bearer.y, radius, o => {
    if (o === bearer && !self) return;
    const dx = o.x - bearer.x, dy = o.y - bearer.y;
    if (dx * dx + dy * dy > r2) return;
    world.applyStatus(o, status, { source: bearer, magnitude: inst.magnitude, duration: AURA_PULSE * 2 + 0.01, silent: true });
  }, team === 'enemy' ? { notTeam: bearer.team } : { team: bearer.team });
}
