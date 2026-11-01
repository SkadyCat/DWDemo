// Presentation registry only. Every prefab receives Three.js and plain visual inputs.
import * as explosion from '../prefabs/element-explosion.mjs';
import * as hit from '../prefabs/element-hit.mjs';
import * as projectileHit from '../prefabs/projectile-hit.mjs';
import * as ice from '../prefabs/ice-lance.mjs';
import * as fireball from '../prefabs/fireball.mjs';
import * as bolt from '../prefabs/void-bolt.mjs';
import * as lightning from '../prefabs/death-lightning.mjs';
import * as chain from '../prefabs/lightning-chain.mjs';
import * as sentinel from '../prefabs/summon-sentinel.mjs';
import * as spirit from '../prefabs/summon-spirit.mjs';
import * as iron_guard from '../prefabs/summon-iron-guard.mjs';
import * as ember_hound from '../prefabs/summon-ember-hound.mjs';
import * as fire_turret from '../prefabs/summon-fire-turret.mjs';
import * as storm_totem from '../prefabs/summon-storm-totem.mjs';
import * as circle from '../prefabs/area-circle.mjs';
import * as ring from '../prefabs/area-ring.mjs';
import * as sector from '../prefabs/area-sector.mjs';
import * as earth from '../prefabs/area-earth-wave.mjs';
import * as slash from '../prefabs/melee-slash.mjs';
import * as claw from '../prefabs/melee-claw.mjs';
import * as heavy from '../prefabs/melee-heavy-strike.mjs';
import * as chill from '../prefabs/status-chill.mjs';
import * as freeze from '../prefabs/status-freeze.mjs';
import * as shock from '../prefabs/status-shock.mjs';
import * as ignite from '../prefabs/status-ignite.mjs';
import * as bleed from '../prefabs/status-bleed.mjs';
import * as slow from '../prefabs/status-slow.mjs';
import * as poison from '../prefabs/status-poison.mjs';
import * as erosion from '../prefabs/status-erosion.mjs';
import * as stun from '../prefabs/status-stun.mjs';
import * as burningGround from '../prefabs/ground-burning.mjs';
import * as poisonGround from '../prefabs/ground-poison.mjs';
import * as chillGround from '../prefabs/ground-chill.mjs';
import * as shockGround from '../prefabs/ground-shock.mjs';
import * as mirrorGround from '../prefabs/ground-mirror.mjs';
import * as whirlwind from '../prefabs/whirlwind.mjs';
import * as treasuryWeapons from '../prefabs/royal-treasury/projectiles.mjs';
import * as treasuryGate from '../prefabs/royal-treasury/gate.mjs';
import * as treasuryEa from '../prefabs/royal-treasury/ea.mjs';
import { createFlaskProjectiles, createPoisonBurst } from '../prefabs/poison-flask.mjs';
import * as loot from '../prefabs/loot-markers.mjs';
import { GROWTH_PREFABS } from '../prefabs/growth-skills.mjs';

const flask = {
  meta: { id: 'projectile-poison-flask', name: '毒瓶抛射', category: '投射物', continuous: true, duration: 2 },
  createBatch: createFlaskProjectiles,
  createEffect(T) { const effect = createFlaskProjectiles(T, 1); return { ...effect, update(t) { const u = t % 2 / 2; effect.update([{ x: -2 + u * 4, y: .35 + Math.sin(u * Math.PI) * 1.8, z: 0, vx: 4, vy: 0, radius: .24 }]); } }; },
};
const poisonBurst = {
  meta: { id: 'poison-flask-burst', name: '毒瓶碎裂', category: '爆炸', duration: .9 },
  createEffect(T) {
    const a = createPoisonBurst(T), b = explosion.createEffect(T, { element: 4 }); const group = new T.Group(); group.add(a.group, b.group);
    let disposed = false;
    return { group, update(t) { a.update(t); b.update(t); group.visible = t < .9; }, dispose() { if (disposed) return; disposed = true; a.dispose(); b.dispose(); group.clear(); } };
  },
};
export const modules = Object.freeze(Object.fromEntries([explosion, hit, projectileHit, ice, fireball, bolt, lightning, chain, sentinel, spirit, iron_guard, ember_hound, fire_turret, storm_totem, circle, ring, sector, earth, slash, claw, heavy, chill, freeze, shock, ignite, bleed, slow, poison, erosion, stun, burningGround, poisonGround, chillGround, shockGround, mirrorGround, whirlwind, treasuryWeapons, treasuryGate, treasuryEa, treasuryEa.impact, flask, poisonBurst, loot, ...GROWTH_PREFABS].map(m => [m.meta.id, m])));
export const elementNames = ['火焰', '冰霜', '闪电', '物理', '毒素', '虚空'];
export const elementColors = ['#ff8b48', '#83dfff', '#a8cfff', '#e6cfaa', '#a3ef57', '#cb9aff'];
export const presets = Object.freeze(Object.values(modules).flatMap(m => m.meta.styles
  ? m.meta.styles.map(([style, label]) => ({ ...m.meta, id: `${m.meta.id}-${style}`, prefab: m.meta.id, name: `${label}·${m.meta.name}`, style }))
  : m.meta.elements
  ? elementNames.map((name, element) => ({ ...m.meta, id: `${m.meta.id}-${element}`, prefab: m.meta.id, name: `${name}${m.meta.id === 'projectile-hit' ? '投射命中' : m.meta.id === 'element-hit' ? '命中' : '爆炸'}`, element, color: elementColors[element] }))
  : [{ ...m.meta, prefab: m.meta.id }]));

// Kind-to-prefab registration is presentation data; attacks still come from the rule traces.
export const summonPresentation=Object.freeze({
 sentinel:{prefab:'summon-sentinel'},spirit:{prefab:'summon-spirit'},
 iron_guard:{prefab:'summon-iron-guard',attack:{id:'melee-slash',element:3,scale:1,origin:'source'}},
 ember_hound:{prefab:'summon-ember-hound',attack:{id:'melee-claw',element:0,scale:1,origin:'source'}},
 fire_turret:{prefab:'summon-fire-turret'},
 storm_totem:{prefab:'summon-storm-totem',attack:{id:'death-lightning',element:2,scale:1,origin:'target'}},
});
