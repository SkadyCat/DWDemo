// Rule-created temporary enemies use the same monster plans, AI and targets as room enemies.
import { INDEX_NONE } from '../types.mjs';

export class HostileSpawns {
  constructor(runtime) { this.R = runtime; this.types = new Map(); }
  spawn(request) {
    const R = this.R, arena = R.arena;
    if (request.owner !== R.hero.owner || R.hero.dead || !Number.isFinite(request.duration + request.radius)) return;
    const doc = arena.collections?.monsters?.get(request.kind)?.doc || arena.monsterDefinitions?.get(request.kind)?.doc;
    if (!doc) throw Error(`spawn_monster: unknown monster ${request.kind}`);
    if (!this.types.has(doc.id)) {
      const skills = doc.skills.filter(s => s.enabled).map(skill => {
        const compiled = R.host.compileNamedBuild(skill.id);
        if (compiled.plan === INDEX_NONE) throw Error(compiled.error);
        return { ...skill, plan: compiled.plan, name: R.host.library.buildDisplayName(skill.id) };
      });
      this.types.set(doc.id, { ...doc, skills });
    }
    const type = this.types.get(doc.id), start = R.rand() * Math.PI * 2;
    const count = Math.min(request.count, Math.max(0, 128 - arena.monsters.filter(m => m.temporary).length));
    for (let i = 0; i < count; i++) {
      const angle = start + i * Math.PI * 2 / count;
      arena.spawnMonsters(1, { type, temporary: true, duration: request.duration, invulnerable: request.invulnerable,
        position: { x: (request.x + Math.cos(angle) * request.radius) * 100, y: (request.y + Math.sin(angle) * request.radius) * 100 } });
    }
  }
}
