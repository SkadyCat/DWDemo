import { E } from './common.mjs';

// Authoring preview of the AS reactive-aura contract. No browser code runs in UE.
export class RetaliationPulses {
  constructor(runtime) { this.r = runtime; this.waves = []; this.emitted = 0; }
  onHit(originalDamage) {
    const r = this.r, percent = r.s('retaliation.hit_percent');
    const radius = r.s('retaliation.radius'), speed = r.s('retaliation.speed');
    if (!(originalDamage > 0 && percent > 0 && radius > 0 && speed > 0)) return;
    const p = r.heroPos();
    this.waves.push({ x: p.x, y: p.y, radius, speed, age: 0, amount: originalDamage * percent / 100, victims: new Set() });
    this.emitted++;
    r.world.trace?.('area', { x: p.x, y: p.y, radius, element: E.physical, effect: 'wind_breath', shape: 'ring' });
  }
  tick(dt) {
    const r = this.r;
    if (r.c.dead) { this.waves = []; return; }
    for (const wave of this.waves) {
      wave.age += dt;
      const front = Math.min(wave.radius, wave.age * wave.speed);
      const hits = r.strike(wave.x, wave.y, front, wave.amount, E.physical, {
        plan: r.neutralPlan, area: false, silent: true, effect: 'reflected_pulse', exclude: wave.victims,
        info: { reflected: true },
      });
      for (const hit of hits) wave.victims.add(hit.m.id);
    }
    this.waves = this.waves.filter(wave => wave.age * wave.speed < wave.radius);
  }
}
