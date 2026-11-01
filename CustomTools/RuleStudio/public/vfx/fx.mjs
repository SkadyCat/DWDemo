// 特效导演：粒子、地面效果、刀光、闪电、动态光源、镜头震动、屏幕涟漪与闪光，全部在这里组合成「配方」。
// 所有坐标都是 three.js 世界坐标（米）：x 向右，y 向上，z 朝向镜头。玩法坐标换算由调用方（game/effects.mjs）完成。
import { createParticles } from './particles.mjs';
import { createMeshFx } from './meshfx.mjs';
import { CELL } from './textures.mjs';

/** Element palettes: HDR colours (bloom picks up anything above ~1). */
export const PAL = {
  fire: { core: [3.4, 1.9, .7], hot: [2.8, .9, .16], mid: [1.5, .3, .04], ember: [4, 1.5, .3], smoke: [.07, .05, .045], mist: null, light: [1, .55, .2], ring: [3.5, 1.3, .25], ringMode: 1, decal: 0 },
  cold: { core: [2.2, 3.1, 4], hot: [.7, 1.9, 3.8], mid: [.25, .85, 2], ember: [2.2, 3.6, 6], smoke: [.6, .78, .95], mist: true, light: [.45, .75, 1], ring: [1.2, 2.8, 5], ringMode: 2, decal: 1 },
  lightning: { core: [3.2, 3.4, 4.6], hot: [1.2, 1.5, 4.4], mid: [.7, .6, 2.6], ember: [3.5, 3.8, 6], smoke: [.42, .42, .6], mist: null, light: [.6, .7, 1], ring: [2, 2.4, 6], ringMode: 3, decal: 4 },
  physical: { core: [3, 2.7, 2.3], hot: [2.1, 1.5, .95], mid: [1, .7, .45], ember: [3.6, 2.6, 1.4], smoke: [.32, .28, .24], mist: null, light: [1, .85, .65], ring: [2.6, 2.2, 1.7], ringMode: 0, decal: 2 },
  chaos: { core: [2, 4, 1.1], hot: [.9, 2.6, .35], mid: [.8, .25, 1.8], ember: [2, 4.5, .8], smoke: [.15, .3, .07], mist: null, light: [.55, 1, .35], ring: [1.6, 3.6, .6], ringMode: 0, decal: 3 },
  void: { core: [3.6, 1.6, 5], hot: [2.6, .5, 3.6], mid: [.9, .1, 1.6], ember: [3, 1, 4.5], smoke: [.06, .02, .08], mist: null, light: [.8, .3, 1], ring: [2.4, .6, 3.6], ringMode: 0, decal: 0 },
  hostile: { core: [3.6, 1.2, .9], hot: [2.6, .35, .2], mid: [1.1, .06, .06], ember: [4, 1, .6], smoke: [.06, .02, .02], mist: null, light: [1, .25, .2], ring: [4, .6, .4], ringMode: 0, decal: 0 },
};
const pal = el => PAL[el] ?? PAL.physical;
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const R = (a, b) => a + Math.random() * (b - a);

export function createFx(T, scene) {
  const group = new T.Group(); group.name = 'Fx'; scene.add(group);
  const P = createParticles(T), G = createMeshFx(T);
  group.add(G.group, P.group);

  // ---- dynamic lights: a small pool shared by the brightest requests ----------------------------
  const LIGHTS = 8, lightPool = [];
  for (let i = 0; i < LIGHTS; ++i) { const l = new T.PointLight(0xffffff, 0, 6, 2); l.castShadow = false; group.add(l); lightPool.push(l); }
  const lightReq = [], frameLights = [];
  // ---- lightning bolts, ripples, shake, flashes ------------------------------------------------
  const bolts = [], ripples = [];
  let trauma = 0, aberr = 0, flash = 0, flashColor = [1, .8, .6], time = 0;
  // Screen heat: how much light big effects have thrown recently. Chain reactions in a horde would
  // otherwise stack into a white-out; past a point each new burst is drawn lighter and smaller.
  let heat = 0;
  const calm = () => 1 / (1 + heat * .35);
  const shakeOffset = new T.Vector3();

  function light(pos, color, intensity, distance = 5, life = .25) { lightReq.push({ pos: [...pos], color, intensity, distance, life, age: 0 }); }
  function frameLight(pos, color, intensity, distance = 4) { frameLights.push({ pos, color, intensity, distance }); }
  function shake(amount) { trauma = Math.min(1, trauma + amount); }
  function ripple(pos, radius = 2, strength = .02, life = .55) { if (ripples.length < 12) ripples.push({ pos: [...pos], radius, strength, life, age: 0 }); }
  function pulse(ab = .004, fl = 0, color = null) { aberr = Math.min(.012, aberr + ab); if (fl) { flash = Math.min(.14, flash + fl); if (color) flashColor = color; } }

  // A jagged polyline from a to b (midpoint displacement) with a few side branches.
  function boltPath(a, b, rough = .2, branches = 2) {
    let pts = [a, b];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    let amp = len * rough;
    for (let it = 0; it < 5; ++it) {
      const next = [pts[0]];
      for (let i = 1; i < pts.length; ++i) {
        const p = pts[i - 1], q = pts[i];
        next.push([(p[0] + q[0]) / 2 + (Math.random() - .5) * amp, (p[1] + q[1]) / 2 + (Math.random() - .5) * amp * .6, (p[2] + q[2]) / 2 + (Math.random() - .5) * amp], q);
      }
      pts = next; amp *= .52;
    }
    const lines = [pts];
    for (let k = 0; k < branches; ++k) {
      const i = 4 + Math.floor(Math.random() * (pts.length - 8)), s = pts[i];
      if (!s) continue;
      const bl = len * R(.18, .35), dir = [pts[i + 1][0] - s[0] + (Math.random() - .5) * len * .3, pts[i + 1][1] - s[1] - .1 * len, pts[i + 1][2] - s[2] + (Math.random() - .5) * len * .3];
      const dl = Math.hypot(...dir) || 1, e = [s[0] + dir[0] / dl * bl, Math.max(.05, s[1] + dir[1] / dl * bl), s[2] + dir[2] / dl * bl];
      lines.push(boltPath(s, e, .25, 0)[0]);
    }
    return lines;
  }
  /** A flickering lightning bolt between two points. */
  function lightning(a, b, { el = 'lightning', life = .22, width = 1, branches = 2, rough = .2 } = {}) {
    if (bolts.length > 90) bolts.shift();
    bolts.push({ a: [...a], b: [...b], el, life, age: 0, width, branches, rough, path: boltPath(a, b, rough, branches), next: .045 });
  }
  /** Draw a segment from a to b as a stretched sprite (core + glow). */
  function segment(a, b, size, color, alpha, cell = CELL.streak) {
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    P.sprite('add', mid, size, color, alpha, cell, 0, 1, [b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  }

  // ---- recipes ---------------------------------------------------------------------------------
  const recipes = {
    /** Small hit: a flare and a spray of sparks along the hit direction. */
    impact(pos, el = 'physical', { scale = 1, dir = null, crit = false } = {}) {
      const h = calm(), c0 = pal(el), c = h < .9 ? { ...c0, core: mul(c0.core, h), hot: mul(c0.hot, h) } : c0, k = scale * (crit ? 1.5 : 1) * (.6 + .4 * h);
      P.emit('add', 1, { pos, life: [.08, .12], size: [.9 * k, 1.2 * k], grow: 1.6, color: c.core, color1: c.hot, cell: CELL.flare, fadeIn: 0, fadePow: 2, noThin: true });
      P.emit('add', 1, { pos, life: [.18, .22], size: [1.1 * k, 1.3 * k], grow: 1.2, color: c.hot, alpha: .45, cell: CELL.glow, fadeIn: 0 });
      const axis = dir ? [dir[0], .35, dir[2]] : [0, 1, 0];
      P.emit('add', Math.round((crit ? 14 : 7) * scale), { pos, dir: 'cone', axis, angle: dir ? .9 : 1.4, speed: [3, 7 * k], life: [.15, .35], size: [.05, .09], color: c.core, color1: c.mid, cell: CELL.streak, stretch: .045, drag: 4, grav: -6, fadeIn: 0 });
      if (crit) { G.ring({ x: pos[0], z: pos[2], from: .1, to: 1.1 * k, width: .07, color: c.ring, life: .25, mode: c.ringMode, height: pos[1] * .3 + .05 }); ripple(pos, .9, .006, .3); }
    },

    /** A big burst: flash, fireball, smoke, debris, shockwave, scorch mark, light, shake. */
    explosion(pos, radius, el = 'fire', { big = false, ground = true } = {}) {
      const c0 = pal(el), r = Math.max(.4, radius), k = big ? 1 : calm();
      heat += r * r * (big ? .5 : 1);
      if (k < .3) {
        // Lite version inside a cascade: the ring and a few sparks keep each burst readable.
        if (Math.random() < k * 2) G.ring({ x: pos[0], z: pos[2], from: r * .2, to: r * 1.1, width: .06 + r * .03, color: mul(c0.ring, .4), life: .3, mode: c0.ringMode });
        P.emit('add', 5, { pos: [pos[0], .45, pos[2]], life: [.25, .5], size: [.05, .09], color: c0.ember, color1: c0.mid, cell: CELL.streak, stretch: .04, dir: 'sphere', half: true, speed: [r * 3, r * 7], drag: 2, grav: -8, fadeIn: 0 });
        P.emit('add', 1, { pos: [pos[0], .45, pos[2]], life: .2, size: r * 1.4, color: c0.hot, alpha: .15, cell: CELL.glow, fadeIn: 0 });
        if (Math.random() < .25) G.decal({ x: pos[0], z: pos[2], radius: r * .9, kind: c0.decal, life: 3 });
        return;
      }
      const c = { ...c0, core: mul(c0.core, k), hot: mul(c0.hot, k), mid: mul(c0.mid, k), ember: mul(c0.ember, Math.sqrt(k)), ring: mul(c0.ring, Math.sqrt(k)) }, q = Math.min(2.2, r) * (.5 + .5 * k);
      const at = [pos[0], .45, pos[2]];
      P.emit('add', 1, { pos: at, life: [.08, .12], size: r * 1.8, grow: 1.3, color: c.core, cell: CELL.flare, fadeIn: 0, fadePow: 2, noThin: true });
      P.emit('add', 1, { pos: at, life: [.25, .3], size: r * 2.4, grow: 1.3, color: c.hot, alpha: .28, cell: CELL.glow, fadeIn: 0, noThin: true });
      if (el === 'fire' || el === 'void' || el === 'hostile' || el === 'physical') {
        // rolling fireball: hot cores that cool as they rise
        P.emit('add', Math.round(10 * q), { pos: at, spread: r * .35, life: [.35, .7], size: [r * .55, r * .9], grow: 1.9, color: c.hot, color1: mul(c.mid, .6), alpha: .38, cell: el === 'physical' ? CELL.dust : CELL.smoke2, dir: 'sphere', half: true, speed: [r * 1.2, r * 3], drag: 3.5, grav: 1.2, spin: [-2, 2], fadeIn: .05, fadePow: 1.2 });
        P.emit('alpha', Math.round(9 * q), { pos: at, spread: r * .5, life: [.9, 1.8], size: [r * .6, r * .9], grow: 2.4, color: c.smoke, alpha: el === 'physical' ? .45 : .7, cell: CELL.smoke, dir: 'sphere', half: true, speed: [r * .6, r * 1.6], drag: 2.2, grav: .7, spin: [-.6, .6], fadeIn: .12, fadePow: 1.3, turb: 1.5 });
        P.emit('add', Math.round(22 * q), { pos: at, life: [.4, .9], size: [.06, .12], color: c.ember, color1: c.mid, cell: CELL.streak, stretch: .04, dir: 'sphere', half: true, speed: [r * 4, r * 9], drag: 1.6, grav: -9, bounce: true, fadeIn: 0 });
        P.emit('add', Math.round(10 * q), { pos: at, spread: r * .6, life: [1, 2.2], size: [.05, .09], color: c.ember, cell: CELL.ember, dir: 'up', angle: .9, speed: [.5, 2], drag: 1, grav: .6, turb: 3, fadeIn: .1 });
      } else if (el === 'cold') {
        P.emit('add', Math.round(12 * q), { pos: at, life: [.4, .8], size: [.22, .45], color: c.hot, color1: c.mid, alpha: .7, cell: CELL.shard, stretch: .07, dir: 'sphere', half: true, speed: [r * 3, r * 8], drag: 2, grav: -10, bounce: true, fadeIn: 0 });
        P.emit('alpha', Math.round(8 * q), { pos: at, spread: r * .5, life: [.8, 1.5], size: [r * .6, r], grow: 2, color: c.smoke, alpha: .32, cell: CELL.smoke, dir: 'flat', speed: [r, r * 2.4], drag: 2.5, fadeIn: .1 });
        P.emit('add', Math.round(16 * q), { pos: at, spread: r * .8, life: [.6, 1.4], size: [.06, .12], color: c.core, cell: CELL.star, dir: 'up', speed: [.3, 1.5], drag: 1, grav: -.4, spin: [-4, 4], fadeIn: .1 });
      } else if (el === 'lightning') {
        for (let i = 0; i < 3 + Math.round(q * 2); ++i) { const a = Math.random() * 6.28, L = r * R(.8, 1.4); lightning(at, [at[0] + Math.cos(a) * L, R(.05, .6), at[2] + Math.sin(a) * L], { life: R(.15, .3), branches: 1 }); }
        P.emit('add', Math.round(5 * q), { pos: at, spread: r * .4, life: [.12, .25], size: [r * .5, r * .9], color: c.core, cell: CELL.crackle, spin: [-8, 8], fadeIn: 0 });
        P.emit('add', Math.round(24 * q), { pos: at, life: [.2, .45], size: [.05, .09], color: c.core, color1: c.hot, cell: CELL.streak, stretch: .03, dir: 'sphere', speed: [r * 5, r * 10], drag: 5, fadeIn: 0 });
      } else if (el === 'chaos') {
        P.emit('alpha', Math.round(7 * q), { pos: at, spread: r * .5, life: [.9, 1.5], size: [r * .4, r * .7], grow: 2, color: c.smoke, alpha: .45, cell: CELL.smoke2, dir: 'sphere', half: true, speed: [r * .6, r * 1.8], drag: 2, grav: .25, turb: 2, fadeIn: .1 });
        P.emit('add', Math.round(10 * q), { pos: at, spread: r * .7, life: [.6, 1.2], size: [.08, .16], color: mul(c.hot, .7), cell: CELL.bubble, dir: 'up', speed: [.4, 2], drag: 1, grav: .8, turb: 2, fadeIn: .1 });
        P.emit('add', Math.round(14 * q), { pos: at, life: [.3, .6], size: [.06, .1], color: c.ember, color1: c.mid, cell: CELL.streak, stretch: .04, dir: 'sphere', half: true, speed: [r * 3, r * 7], drag: 2.5, grav: -6, fadeIn: 0 });
      }
      G.ring({ x: pos[0], z: pos[2], from: r * .15, to: r * 1.2, width: .1 + r * .05, color: c.ring, life: .42, mode: c.ringMode, ease: 3 });
      if (big && k > .6) G.ring({ x: pos[0], z: pos[2], from: r * .3, to: r * 2, width: .06, color: mul(c.ring, .6), life: .7, mode: 0, ease: 2 });
      if (ground) G.decal({ x: pos[0], z: pos[2], radius: r * 1.05, kind: c.decal, life: big ? 7 : 4.5 });
      light(at, c.light, (big ? 14 : 6) * q * k, r * 4 + 2, big ? .5 : .32);
      if (k > .6) ripple(at, r * .9 + .5, big ? .03 : .014, .5);
      shake((big ? .45 : Math.min(.25, .05 + r * .05)) * k);
      if (big) pulse(.004 * k);
    },

    /** Ice nova / radial waves: a fast ground ring with radial shards and mist. */
    nova(pos, radius, el = 'cold') {
      const k = calm(), c0 = pal(el), c = { ...c0, core: mul(c0.core, k), hot: mul(c0.hot, k), mid: mul(c0.mid, k), ring: mul(c0.ring, Math.sqrt(k)) }, r = Math.max(.5, radius), q = Math.min(2, r) * (.4 + .6 * k);
      heat += r * r * .6;
      G.ring({ x: pos[0], z: pos[2], from: .2, to: r, width: .22 + r * .05, color: mul(c.ring, 1.2), life: .42, mode: c.ringMode, ease: 2.5 });
      G.ring({ x: pos[0], z: pos[2], from: .1, to: r * .92, width: .3, color: mul(c.mid, .45), life: .55, mode: 0, ease: 2 });
      P.emit('add', Math.round(20 * q), { pos: [pos[0], .25, pos[2]], ring: .35, ringCount: Math.round(20 * q), dir: 'flat', lift: [.2, 1], speed: [r * 2.4, r * 3.2], life: [.3, .42], size: [.22, .4], color: c.hot, color1: c.mid, alpha: .55, cell: el === 'cold' ? CELL.shard : CELL.streak, stretch: .06, drag: 2.5, fadeIn: 0 });
      if (c.mist && k > .5) P.emit('alpha', Math.round(8 * q), { pos: [pos[0], .3, pos[2]], dir: 'flat', speed: [r * 1.5, r * 2.6], life: [.6, 1.1], size: [r * .25, r * .4], grow: 1.8, color: c.smoke, alpha: .16, cell: CELL.smoke, drag: 3, fadeIn: .1 });
      P.emit('add', Math.round(18 * q), { pos: [pos[0], .4, pos[2]], spread: r, flat: true, life: [.5, 1.2], size: [.05, .1], color: c.core, cell: CELL.star, dir: 'up', speed: [.4, 1.6], drag: 1, spin: [-3, 3], fadeIn: .1 });
      P.emit('add', 1, { pos: [pos[0], .6, pos[2]], life: .16, size: r * 1.2, grow: 1.5, color: c.hot, alpha: .22, cell: CELL.glow, fadeIn: 0, noThin: true });
      if (k > .45) G.decal({ x: pos[0], z: pos[2], radius: r * .95, kind: c.decal, life: 4 });
      light([pos[0], .8, pos[2]], c.light, 6.6 * q * k, r * 3 + 2, .35);
      if (k > .6) ripple(pos, r * .9, .016, .45);
      shake((.08 + r * .03) * k);
    },

    /** Blade arc (cleave, strikes, claws). */
    slash(pos, angle, radius, el = 'physical', { hostile = false, span = 2.1, heavy = false } = {}) {
      const c = hostile ? PAL.hostile : el === 'physical' ? { ...PAL.physical, hot: [1.6, 1.25, .6], core: [3.2, 2.9, 2.2] } : pal(el), r = Math.max(.6, radius);
      const dir = Math.random() < .5 ? 1 : -1;
      G.slash({ x: pos[0], z: pos[2], y: heavy ? .25 : .55, angle, span, r0: r * .4, r1: r, color: mul(c.hot, .9), core: c.core, life: heavy ? .34 : .26, lift: heavy ? .15 : .35, dir, tilt: (Math.random() - .5) * .25 });
      const ax = [Math.cos(angle), .25, -Math.sin(angle)];
      P.emit('add', 10, { pos: [pos[0] + ax[0] * r * .8, .6, pos[2] + ax[2] * r * .8], dir: 'cone', axis: ax, angle: .9, speed: [3, 7], life: [.15, .3], size: [.04, .08], color: c.core, color1: c.mid, cell: CELL.streak, stretch: .04, drag: 4, grav: -5, fadeIn: 0 });
      if (heavy) { P.emit('alpha', 6, { pos: [pos[0] + ax[0] * r * .7, .1, pos[2] + ax[2] * r * .7], spread: r * .3, flat: true, dir: 'flat', speed: [.6, 1.6], life: [.7, 1.1], size: [.5, .8], grow: 2, color: PAL.physical.smoke, alpha: .35, cell: CELL.dust, drag: 2, fadeIn: .1 }); }
    },

    /** Whirling blades around the caster (cyclone ticks). */
    whirl(pos, radius, el = 'physical') {
      const c = pal(el), r = Math.max(.8, radius);
      G.slash({ x: pos[0], z: pos[2], y: .55, angle: Math.random() * 6.28, span: 5.6, r0: r * .55, r1: r, color: mul(c.hot, .7), core: c.core, life: .3, lift: .25, dir: 1 });
      P.emit('alpha', 2, { pos: [pos[0], .08, pos[2]], ring: r * .8, dir: 'flat', speed: [1, 2], life: [.5, .8], size: [.35, .6], grow: 1.6, color: [.16, .14, .12], alpha: .25, cell: CELL.dust, drag: 2, fadeIn: .1 });
      P.emit('add', 8, { pos: [pos[0], .6, pos[2]], ring: r, dir: 'flat', speed: [3, 6], life: [.15, .3], size: [.04, .07], color: c.core, cell: CELL.streak, stretch: .04, drag: 3, fadeIn: 0 });
    },

    /** Ground slam: cracked earth, a dust wall, flying rocks, a heavy shake. */
    slam(pos, angle, radius, el = 'physical') {
      const k = calm(), c = pal(el), r = Math.max(.8, radius), q = Math.min(2.2, r) * (.3 + .7 * k);
      heat += r * r * .7;
      const ax = [Math.cos(angle), 0, -Math.sin(angle)], at = [pos[0] + ax[0] * r * .45, .1, pos[2] + ax[2] * r * .45];
      if (k > .35) G.decal({ x: at[0], z: at[2], radius: r * .8, kind: 2, life: 5 });
      G.ring({ x: at[0], z: at[2], from: .2, to: r, width: .14, color: mul(c.ring, .55), life: .4, mode: 1, ease: 3 });
      P.emit('alpha', Math.round(10 * q * k), { pos: at, spread: r * .45, flat: true, dir: 'flat', speed: [r * 1.2, r * 2.6], lift: [.1, .4], life: [.7, 1.2], size: [r * .25, r * .4], grow: 2, color: [.16, .14, .12], alpha: .4, cell: CELL.dust, drag: 2.6, fadeIn: .06, turb: 1 });
      P.emit('alpha', Math.round(14 * q), { pos: at, spread: r * .3, life: [.6, 1.1], size: [.08, .16], color: [.2, .17, .14], alpha: 1, cell: CELL.shard, dir: 'up', angle: .8, speed: [3, 7], grav: -14, bounce: true, spin: [-10, 10], fadeIn: 0 });
      P.emit('add', Math.round(16 * q), { pos: at, life: [.25, .5], size: [.05, .09], color: c.ember, color1: c.mid, cell: CELL.streak, stretch: .04, dir: 'up', angle: 1, speed: [3, 8], drag: 2, grav: -9, fadeIn: 0 });
      if (el === 'lightning') for (let i = 0; i < 4; ++i) { const a = angle + (Math.random() - .5) * 1.6, L = r * R(.6, 1.1); lightning([at[0], .3, at[2]], [at[0] + Math.cos(a) * L, .1, at[2] - Math.sin(a) * L], { life: .25, branches: 1 }); }
      light([at[0], .6, at[2]], el === 'physical' ? [1, .7, .4] : c.light, 7 * q * k, r * 3 + 2, .3);
      if (k > .5) ripple(at, r, .028, .5);
      shake(.3 * k + .05);
    },

    /** A bolt from the sky (falling thunder, storm totems' big hits). */
    thunder(pos, radius = 1) {
      const k = calm(); heat += radius * radius * .5;
      if (k < .3) { lightning([pos[0], 9, pos[2]], [pos[0], .05, pos[2]], { life: .18, width: .8, branches: 1, rough: .14 }); G.ring({ x: pos[0], z: pos[2], from: .1, to: radius, width: .07, color: mul(PAL.lightning.ring, .5), life: .3, mode: 3 }); return; }
      const c = PAL.lightning, top = [pos[0] + R(-.6, .6), 9, pos[2] + R(-.4, .4)], bot = [pos[0], .05, pos[2]];
      lightning(top, bot, { life: .3, width: 1.6, branches: 3, rough: .12 });
      lightning(top, bot, { life: .2, width: .8, branches: 1, rough: .16 });
      P.emit('add', 1, { pos: [pos[0], .4, pos[2]], life: .12, size: radius * 2, grow: 1.3, color: c.core, cell: CELL.flare, fadeIn: 0, noThin: true });
      G.ring({ x: pos[0], z: pos[2], from: .1, to: radius * 1.2, width: .1, color: c.ring, life: .35, mode: 3 });
      G.decal({ x: pos[0], z: pos[2], radius: radius * .8, kind: 4, life: 3.5 });
      P.emit('add', 18, { pos: [pos[0], .2, pos[2]], dir: 'up', angle: 1.2, speed: [3, 8], life: [.2, .45], size: [.05, .08], color: c.core, color1: c.hot, cell: CELL.streak, stretch: .03, drag: 3, grav: -8, fadeIn: 0 });
      light([pos[0], 1.5, pos[2]], c.light, 15.4, radius * 5 + 3, .22);
      ripple([pos[0], .2, pos[2]], radius * .9, .02, .35);
      shake(.18); pulse(.003, .02, [.6, .7, 1]);
    },

    /** Chain lightning hop between two points. */
    chain(a, b) { lightning(a, b, { life: .2, branches: 1, rough: .22 }); recipes.impact(b, 'lightning', { scale: .7 }); },

    /** A warning on the floor that fills up until the hit lands. */
    telegraph(pos, radius, delay) {
      G.ring({ x: pos[0], z: pos[2], from: radius, to: radius, width: .07, color: [3.5, .5, .3], life: delay, mode: 0, ease: 1, alpha: .9 });
      G.ring({ x: pos[0], z: pos[2], from: .05, to: radius, width: radius * .12 + .05, color: [1.6, .15, .1], life: delay, mode: 1, ease: 1, alpha: .7 });
      P.emit('add', 14, { pos: [pos[0], .05, pos[2]], ring: radius, dir: 'up', angle: .2, speed: [.3, 1], life: [delay * .6, delay], size: [.06, .12], color: [3, .5, .25], cell: CELL.ember, fadeIn: .2 });
    },

    /** Blink: a streak of light between two spots, bursts at both ends. */
    blink(a, b) {
      const n = Math.max(4, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) * 5));
      for (let i = 0; i <= n; ++i) { const t = i / n; P.emit('add', 1, { pos: [a[0] + (b[0] - a[0]) * t, .9, a[2] + (b[2] - a[2]) * t], life: [.18, .32], size: [.5, .7], grow: .2, color: [2.2, 2.6, 4.5], alpha: .5, cell: CELL.glow, fadeIn: 0, noThin: true }); }
      segment([a[0], .9, a[2]], [b[0], .9, b[2]], .25, [4, 4.5, 6], .9);
      for (const p of [a, b]) { P.emit('add', 12, { pos: [p[0], .8, p[2]], dir: 'sphere', speed: [2, 5], life: [.2, .4], size: [.04, .07], color: [4, 4.5, 6], color1: [1, 1.5, 4], cell: CELL.streak, stretch: .03, drag: 4, fadeIn: 0 }); }
      G.ring({ x: b[0], z: b[2], from: .1, to: 1.1, width: .07, color: [2, 2.6, 5], life: .3 });
      light([b[0], 1, b[2]], [.6, .7, 1], 4, 4, .2);
    },

    /** Frozen enemy shattering. */
    shatter(pos, scale = 1) {
      const c = PAL.cold, at = [pos[0], .6 * scale, pos[2]];
      P.emit('add', Math.round(22 * scale), { pos: at, spread: .3 * scale, life: [.5, 1], size: [.18 * scale, .36 * scale], color: c.core, color1: c.mid, cell: CELL.shard, dir: 'sphere', half: true, speed: [3, 8], drag: 1.4, grav: -14, bounce: true, spin: [-12, 12], fadeIn: 0 });
      P.emit('alpha', 6, { pos: at, spread: .4, life: [.7, 1.2], size: [.6 * scale, .9 * scale], grow: 2, color: c.smoke, alpha: .32, cell: CELL.smoke, dir: 'sphere', half: true, speed: [.5, 1.5], drag: 2, fadeIn: .1 });
      P.emit('add', 1, { pos: at, life: .14, size: 2.2 * scale, grow: 1.4, color: mul(c.core, 1.2), cell: CELL.flare, fadeIn: 0, noThin: true });
      G.ring({ x: pos[0], z: pos[2], from: .1, to: 1.3 * scale, width: .1, color: c.ring, life: .35, mode: 2 });
      G.decal({ x: pos[0], z: pos[2], radius: .9 * scale, kind: 1, life: 3 });
      light(at, c.light, 3.52 * scale, 4, .25);
    },

    /** A monster dying: puff, element sparks, a rising wisp; bigger for elites and bosses. */
    death(pos, el = 'physical', size = 1, { boss = false } = {}) {
      const c = pal(el), at = [pos[0], .6 * size, pos[2]];
      if (size <= 1.1 && calm() < .35) { P.emit('add', 4, { pos: at, life: [.25, .45], size: [.05, .08], color: c.ember, color1: c.mid, cell: CELL.streak, stretch: .035, dir: 'sphere', half: true, speed: [2, 4], drag: 2.5, grav: -6, fadeIn: 0 }); return; }
      P.emit('alpha', Math.round(4 * size), { pos: at, spread: .3 * size, life: [.5, .9], size: [.5 * size, .8 * size], grow: 1.8, color: [.1, .08, .09], alpha: .45, cell: CELL.smoke, dir: 'sphere', half: true, speed: [.4, 1.2], drag: 2, grav: .5, fadeIn: .05 });
      P.emit('add', Math.round(8 * size), { pos: at, spread: .2, life: [.25, .5], size: [.05, .08], color: c.ember, color1: c.mid, cell: CELL.streak, stretch: .035, dir: 'sphere', half: true, speed: [2, 5], drag: 2.5, grav: -6, fadeIn: 0 });
      P.emit('add', Math.round(2 * size), { pos: at, spread: .2, life: [.7, 1.1], size: [.35 * size, .5 * size], color: mul(c.hot, .6), cell: CELL.wisp, dir: 'up', angle: .3, speed: [1.2, 2.2], drag: 1.2, fadeIn: .1, rot: 0 });
      if (size > 1.1) {
        G.ring({ x: pos[0], z: pos[2], from: .2, to: 1.6 * size, width: .12, color: c.ring, life: .5, mode: c.ringMode });
        light(at, c.light, 5.5 * size, 5, .4); shake(boss ? .7 : .12);
        if (boss) { recipes.explosion(pos, 3.2, el, { big: true }); pulse(.012, .25, c.light); }
      }
    },

    /** A vortex bursting apart at the end of its life: a wind shockwave, flung debris, dust. */
    windBurst(pos, radius) {
      const r = Math.max(.6, radius), k = calm(), c = { hot: [1.6, 1.7, 1.8], core: [2.6, 2.7, 2.8] };
      heat += r * r * .4;
      G.ring({ x: pos[0], z: pos[2], from: r * .2, to: r * 1.2, width: .12 + r * .05, color: mul(c.hot, .8 * k + .2), life: .4, mode: 0, ease: 3 });
      P.emit('add', Math.round(18 * k + 4), { pos: [pos[0], .5, pos[2]], dir: 'flat', lift: [.2, 1.2], speed: [r * 4, r * 8], life: [.2, .4], size: [.05, .09], color: c.core, color1: c.hot, cell: CELL.streak, stretch: .05, drag: 3, fadeIn: 0 });
      P.emit('alpha', Math.round(8 * k + 2), { pos: [pos[0], .15, pos[2]], spread: r * .4, flat: true, dir: 'flat', speed: [r * 1.5, r * 3], life: [.6, 1], size: [r * .3, r * .5], grow: 2, color: [.18, .16, .14], alpha: .4, cell: CELL.dust, drag: 2.5, fadeIn: .05 });
      P.emit('alpha', Math.round(10 * k + 2), { pos: [pos[0], .6, pos[2]], spread: r * .3, dir: 'sphere', half: true, speed: [3, 8], life: [.5, .9], size: [.06, .12], color: [.16, .14, .12], alpha: 1, cell: CELL.shard, grav: -12, bounce: true, spin: [-12, 12], fadeIn: 0 });
      if (k > .5) ripple([pos[0], .3, pos[2]], r, .022, .45);
      shake(.1 * k);
    },

    /** Summon: runic flash where a minion appears. */
    summon(pos, el = 'physical') {
      const c = pal(el);
      G.ring({ x: pos[0], z: pos[2], from: .9, to: .3, width: .06, color: c.ring, life: .5, ease: 2 });
      P.emit('add', 16, { pos: [pos[0], .05, pos[2]], ring: .7, dir: 'up', angle: .15, speed: [1.5, 3], life: [.3, .6], size: [.05, .09], color: c.core, color1: c.hot, cell: CELL.streak, stretch: .05, drag: 1.5, fadeIn: 0 });
      P.emit('add', 1, { pos: [pos[0], .7, pos[2]], life: .25, size: 1.6, color: c.hot, alpha: .6, cell: CELL.glow, fadeIn: 0, noThin: true });
    },

    /** Muzzle flash where a spell leaves the caster. */
    cast(pos, el, dir) {
      const c = pal(el);
      P.emit('add', 1, { pos, life: .1, size: .9, grow: 1.5, color: c.core, cell: CELL.flare, fadeIn: 0, noThin: true });
      P.emit('add', 6, { pos, dir: 'cone', axis: dir, angle: .6, speed: [2, 5], life: [.1, .25], size: [.04, .07], color: c.core, color1: c.mid, cell: CELL.streak, stretch: .03, drag: 5, fadeIn: 0 });
      frameLight(pos, c.light, 2.8, 3);
    },
  };

  // ---- continuous visuals (called every frame by the host) ---------------------------------------
  const trails = new Map(); // carrier id → recent positions
  /**
   * Projectiles: [{ id, x, y, z, vx, vy, vz, radius, kind, element, hostile }]
   */
  function projectiles(list, dt) {
    const seen = new Set();
    let lit = 0;
    // Volleys of dozens overlap at the caster: thin each one out so the pack reads as many bolts, not one white blob.
    const dens = Math.min(1, 2.5 / Math.sqrt(Math.max(1, list.length))), em = n => Math.floor(n * dens + Math.random());
    for (const p of list) {
      seen.add(p.id);
      const el = p.hostile ? (p.element === 'chaos' ? 'void' : 'hostile') : p.element, c = pal(el), pos = [p.x, p.y, p.z], r = Math.max(.14, p.radius) * Math.min(1, .45 + (p.age ?? 1) * 7);
      const vel = [p.vx, p.vy, p.vz], speed = Math.hypot(...vel) || 1, back = [-p.vx / speed, 0, -p.vz / speed];
      let tr = trails.get(p.id);
      if (!tr) { tr = []; trails.set(p.id, tr); }
      tr.unshift(pos); if (tr.length > 9) tr.pop();
      const kind = p.kind;
      if (kind === 'fireball') {
        P.sprite('add', pos, r * 5, c.hot, .35, CELL.glow);
        P.sprite('add', pos, r * 2.6, c.hot, .9, CELL.orb, time * 5 + p.id);
        P.sprite('add', pos, r * 1.5, c.core, 1, CELL.core);
        // flame body streams off the head into a comet tail (particles are left behind as it flies)
        P.emit('add', em(4), { pos, spread: r * .45, life: [.2, .36], size: [r * 2.2, r * 3.2], grow: .4, color: c.hot, color1: mul(c.mid, .7), alpha: .85, cell: CELL.flame2, rot: [-.3, .3], dir: 'sphere', speed: [.2, .7], fadeIn: .05, fadePow: 1.2 });
        P.emit('add', em(1), { pos, spread: r, life: [.4, .9], size: [.04, .07], color: c.ember, cell: CELL.ember, dir: 'up', speed: [.4, 1.5], turb: 4, fadeIn: 0 });
        if (Math.random() < .5 * dens) P.emit('alpha', 1, { pos, spread: r * .4, life: [.5, .9], size: [r * 1.4, r * 2], grow: 2.2, color: c.smoke, alpha: .4, cell: CELL.smoke, dir: 'up', speed: [.3, .8], fadeIn: .15 });
        if (lit++ < 6) frameLight(pos, c.light, 3.15, 3.2);
      } else if (kind === 'frost_bolt') {
        P.sprite('add', pos, r * 5, c.hot, .4 * dens, CELL.glow);
        P.sprite('add', pos, r * 1.4, c.core, 1, CELL.streak, 0, .05, vel);
        P.sprite('add', pos, r * 2.2, mul(c.core, .8), .9, CELL.star, time * 6 + p.id);
        if (Math.random() < .6) P.emit('alpha', 1, { pos, spread: r * .4, life: [.4, .7], size: [r * 1.4, r * 2], grow: 1.8, color: c.smoke, alpha: .25, cell: CELL.smoke, dir: 'sphere', speed: [.1, .4], fadeIn: .1 });
        P.emit('add', 2, { pos, spread: r * .6, life: [.4, .8], size: [.04, .08], color: c.core, cell: CELL.star, dir: 'sphere', speed: [.2, .8], spin: [-5, 5], grav: -1, fadeIn: 0 });
        if (lit++ < 6) frameLight(pos, c.light, 2.1, 2.5);
      } else if (kind === 'spark' || kind === 'thunder_bolt') {
        const big = kind === 'thunder_bolt';
        P.sprite('add', pos, r * (big ? 7 : 5), c.hot, .5 * dens, CELL.glow);
        P.sprite('add', pos, r * (big ? 3.6 : 2.6), c.core, 1, CELL.crackle, time * 23 + p.id);
        P.sprite('add', pos, r * 1.6, mul(c.core, 1.3), 1, CELL.core);
        if (Math.random() < (big ? .5 : .25)) { const a = Math.random() * 6.28, L = r * R(2, 4); lightning(pos, [pos[0] + Math.cos(a) * L, pos[1] + R(-.3, .2), pos[2] + Math.sin(a) * L], { life: .07, branches: 0, rough: .35 }); }
        P.emit('add', 1, { pos, life: [.15, .3], size: [.04, .07], color: c.core, cell: CELL.streak, stretch: .03, dir: 'sphere', speed: [1, 3], drag: 4, fadeIn: 0 });
        if (lit++ < 6) frameLight(pos, c.light, big ? 3.5 : 1.8, 2.6);
      } else if (kind === 'viper_knife') {
        const cc = PAL.chaos;
        P.sprite('add', pos, r * 1.6, PAL.physical.core, 1, CELL.streak, 0, .07, vel);
        P.sprite('add', pos, r * 3.5, cc.hot, .35, CELL.glow);
        if (Math.random() < .35 * dens) P.emit('add', 1, { pos, life: [.25, .45], size: [r * 1, r * 1.5], color: mul(cc.hot, .45), cell: CELL.wisp, dir: 'none', fadeIn: .1, rot: [0, 6.28] });
      } else {
        // hostile bolts and anything else: a dark core inside a coloured halo
        P.sprite('add', pos, r * 6, c.hot, .5 * dens, CELL.glow);
        P.sprite('add', pos, r * 2.8, c.core, 1, CELL.flare, time * 4 + p.id);
        P.sprite('alpha', pos, r * 1.6, [.02, 0, .03], .9, CELL.core);
        if (Math.random() < .5) P.emit('add', 1, { pos, spread: r * .5, life: [.25, .45], size: [r * 1.2, r * 1.8], grow: .4, color: c.hot, alpha: .7, cell: CELL.smoke2, dir: 'sphere', speed: [.2, .6], fadeIn: .05 });
      }
      // ribbon trail
      for (let i = 1; i < tr.length; ++i) {
        const k = 1 - i / tr.length;
        const w = (kind === 'fireball' ? r * 2 : kind === 'frost_bolt' ? r * 1.1 : r * 1.3) * k;
        segment(tr[i - 1], tr[i], w, i === 1 ? c.core : c.hot, .45 * k * (.4 + .6 * dens), CELL.beam);
      }
    }
    for (const id of trails.keys()) if (!seen.has(id)) {
      // A projectile that just vanished leaves a fading puff where it was.
      trails.delete(id);
    }
  }

  /** Ground zones: [{ x, z, radius, kind, element, left }] */
  /** A vortex: a rotating funnel of wind streaks, a dust skirt at its foot, debris flung around it. */
  function tornado(z, dens) {
    const R = z.radius, H = 2.2 + R * .6, spin = 7, lv = 8, per = 5;
    const c = z.element === 'lightning' ? PAL.lightning : z.element === 'fire' ? PAL.fire : z.element === 'cold' ? PAL.cold : { hot: [1.1, 1.15, 1.2], core: [2, 2.1, 2.2], mid: [.5, .55, .6] };
    const a0 = time * spin + z.seed;
    for (let l = 0; l < lv; ++l) {
      const u = l / (lv - 1), h = .1 + u * H, rad = R * (.22 + .9 * Math.pow(u, 1.25)), sway = Math.sin(time * 2.3 + z.seed + u * 2) * R * .18 * u;
      for (let j = 0; j < per; ++j) {
        const th = a0 * (1.3 - u * .5) + j / per * 6.2832 + u * 1.7;
        const px = z.x + Math.cos(th) * rad + sway, pz = z.z + Math.sin(th) * rad;
        const tx = -Math.sin(th), tz = Math.cos(th), len = rad * .9;
        P.sprite('add', [px, h, pz], .16 + u * .34, c.hot, (.1 + .1 * (1 - u)) * dens, CELL.beam, 0, 1, [tx * len, .1, tz * len]);
        if (j % 2 === 0) P.sprite('alpha', [px * .5 + z.x * .5, h, pz * .5 + z.z * .5], rad * 1.4 + .2, [.32, .33, .36], .08 * dens, CELL.smoke, th);
      }
    }
    P.sprite('add', [z.x, H * .45, z.z], R * 2.6, c.mid, .12 * dens, CELL.glow);
    // wind wisps riding the funnel
    for (let i = 0; i < 2; ++i) if (Math.random() < dens) {
      const u = Math.random(), th = Math.random() * 6.28, rad = R * (.25 + .9 * Math.pow(u, 1.25)), sp = rad * spin * .9;
      P.emit('add', 1, { pos: [z.x + Math.cos(th) * rad, .1 + u * H, z.z + Math.sin(th) * rad], vel: [-Math.sin(th) * sp, 1.2, Math.cos(th) * sp], life: [.18, .3], size: [.1, .18], color: c.core, alpha: .35, cell: CELL.streak, stretch: .06, fadeIn: .1, noThin: true });
    }
    // dust skirt and debris
    if (Math.random() < .7 * dens) P.emit('alpha', 1, { pos: [z.x, .08, z.z], ring: R * .5, dir: 'flat', speed: [R * 1.5, R * 3], lift: [.3, 1], life: [.4, .8], size: [R * .5, R * .8], grow: 1.6, color: [.2, .18, .16], alpha: .35, cell: CELL.dust, drag: 2, spin: [-3, 3], fadeIn: .1 });
    if (Math.random() < .8 * dens) { const th = Math.random() * 6.28; P.emit('alpha', 1, { pos: [z.x + Math.cos(th) * R * .6, R * .3 + Math.random() * H * .6, z.z + Math.sin(th) * R * .6], vel: [-Math.sin(th) * R * 6, R * 2, Math.cos(th) * R * 6], life: [.4, .7], size: [.05, .1], color: [.16, .14, .12], alpha: 1, cell: CELL.shard, grav: -4, drag: 1.5, spin: [-12, 12], fadeIn: 0, noThin: true }); }
    if (z.element === 'lightning' && Math.random() < .12 * dens) { const th = Math.random() * 6.28, h = Math.random() * H; lightning([z.x, h, z.z], [z.x + Math.cos(th) * R * 1.2, Math.max(.1, h - .6), z.z + Math.sin(th) * R * 1.2], { life: .08, branches: 0, rough: .4 }); }
  }

  function zones(list) {
    const twisters = list.filter(z => z.kind === 'tornado'), dens = Math.min(1, 3 / Math.sqrt(Math.max(1, twisters.length)));
    for (const z of twisters) tornado(z, dens);
    for (const z of list) {
      if (z.kind === 'tornado') continue;
      const el = z.kind === 'flame_wall' ? 'fire' : z.element, c = pal(el), area = Math.min(30, z.radius * z.radius * 3.14);
      const n = Math.max(1, Math.round(area * .9));
      if (el === 'fire') {
        P.emit('add', n, { pos: [z.x, .05, z.z], spread: z.radius * .95, flat: true, life: [.35, .8], size: [.45, .9], grow: .35, color: c.core, color1: c.mid, cell: CELL.flame2, rot: [-.15, .15], dir: 'up', angle: .2, speed: [.8, 2], fadeIn: .1, turb: 1.5 });
        if (Math.random() < .5) P.emit('alpha', 1, { pos: [z.x, .9, z.z], spread: z.radius * .8, flat: true, life: [.9, 1.5], size: [.8, 1.2], grow: 2, color: c.smoke, alpha: .35, cell: CELL.smoke, dir: 'up', speed: [.4, 1], fadeIn: .15 });
        P.emit('add', 1, { pos: [z.x, .2, z.z], spread: z.radius, flat: true, life: [.8, 1.5], size: [.04, .07], color: c.ember, cell: CELL.ember, dir: 'up', speed: [.8, 2.4], turb: 4, fadeIn: 0 });
        frameLight([z.x, .6, z.z], c.light, 3 + z.radius * 1.5, z.radius * 2.5 + 2);
      } else {
        P.emit('add', Math.ceil(n / 3), { pos: [z.x, .05, z.z], spread: z.radius, flat: true, life: [.5, 1], size: [.1, .2], color: c.hot, cell: el === 'chaos' ? CELL.bubble : CELL.star, dir: 'up', speed: [.3, 1], fadeIn: .1 });
        P.sprite('add', [z.x, .05, z.z], z.radius * 2.2, mul(c.mid, .5), .35, CELL.glow);
      }
    }
  }

  /** Status visuals on actors: [{ x, z, size, status, stacks }] — budgeted per frame for hordes. */
  function statuses(list) {
    let budget = 70;
    for (const s of list) {
      const at = [s.x, .5 * s.size, s.z];
      switch (s.status) {
        case 'ignited': if (budget > 0 && Math.random() < .7) { budget--; P.emit('add', 1, { pos: at, spread: .3 * s.size, life: [.3, .55], size: [.35 * s.size, .55 * s.size], grow: .3, color: PAL.fire.core, color1: PAL.fire.mid, cell: CELL.flame2, rot: [-.15, .15], dir: 'up', angle: .2, speed: [1, 2], fadeIn: .1 }); } break;
        case 'shocked': if (budget > 0 && Math.random() < .12) { budget -= 2; const a = Math.random() * 6.28; lightning([at[0], at[1] + .3, at[2]], [at[0] + Math.cos(a) * .6 * s.size, at[1] - .2, at[2] + Math.sin(a) * .6 * s.size], { life: .08, branches: 0, rough: .4 }); } P.sprite('add', [at[0], at[1] + .2, at[2]], .9 * s.size, PAL.lightning.hot, .25 * calm(), CELL.crackle, time * 17 + s.x * 9); break;
        case 'chilled': case 'frostbite': if (budget > 0 && Math.random() < .12) { budget--; P.emit('add', 1, { pos: at, spread: .4 * s.size, life: [.5, .9], size: [.05, .09], color: PAL.cold.core, cell: CELL.star, dir: 'sphere', speed: [.1, .4], grav: -.6, spin: [-4, 4], fadeIn: .1 }); } break;
        case 'frozen': { const k = calm(); for (let i = 0; i < 3; ++i) { const a = i * 2.09 + s.x; P.sprite('add', [at[0] + Math.cos(a) * .22 * s.size, at[1] + .1, at[2] + Math.sin(a) * .22 * s.size], .8 * s.size, mul(PAL.cold.hot, .5 * k + .15), .6, CELL.shard, a); } P.sprite('add', at, 1.4 * s.size, PAL.cold.mid, .14 * k, CELL.glow); break; }
        case 'poisoned': if (budget > 0 && Math.random() < .12) { budget--; P.emit('add', 1, { pos: at, spread: .3 * s.size, life: [.5, 1], size: [.07, .14], color: PAL.chaos.hot, cell: CELL.bubble, dir: 'up', speed: [.4, 1], fadeIn: .1 }); } break;
        case 'bleeding': if (budget > 0 && Math.random() < .25) { budget--; P.emit('add', 1, { pos: at, spread: .25 * s.size, life: [.4, .7], size: [.05, .08], color: [2.4, .1, .1], cell: CELL.ember, dir: 'sphere', speed: [.2, .8], grav: -6, fadeIn: 0 }); } break;
        case 'electrocuted': P.sprite('add', [at[0], at[1] + .5, at[2]], 1.2 * s.size, PAL.lightning.core, .7, CELL.crackle, time * 31); break;
      }
    }
  }

  /** Minions: [{ x, z, template, id }] */
  function minions(list) {
    for (const m of list) {
      if (m.template === 'spirit_blade') {
        const a = time * 9 + m.id, pos = [m.x, .9 + Math.sin(time * 4 + m.id) * .1, m.z];
        P.sprite('add', pos, 1.3, [2.5, 3.2, 4.5], .9, CELL.streak, a);
        P.sprite('add', pos, 1.5, [.6, .9, 2], .35, CELL.glow);
        if (Math.random() < .4) P.emit('add', 1, { pos, life: [.2, .4], size: [.4, .6], color: [.8, 1.2, 2.4], alpha: .4, cell: CELL.streak, rot: a, fadeIn: 0 });
      } else if (m.template === 'storm_totem') {
        const top = [m.x, 1.7, m.z];
        P.sprite('add', top, 1.2, PAL.lightning.hot, .55, CELL.glow);
        P.sprite('add', top, .9, PAL.lightning.core, .9, CELL.crackle, time * 20);
        if (Math.random() < .1) { const a = Math.random() * 6.28; lightning(top, [m.x + Math.cos(a) * .8, .9, m.z + Math.sin(a) * .8], { life: .08, branches: 0, rough: .4 }); }
      }
    }
  }

  /** Wall torches: [[x, y, z]] near the camera. */
  function torches(list) {
    const c = PAL.fire;
    for (const t of list) {
      P.sprite('add', [t[0], t[1] + .15, t[2]], 1.1, mul(c.hot, .6), .3, CELL.glow);
      if (Math.random() < .6) P.emit('add', 1, { pos: t, spread: .05, life: [.25, .45], size: [.3, .45], grow: .4, color: c.core, color1: c.mid, alpha: .8, cell: CELL.flame2, rot: [-.12, .12], dir: 'up', angle: .15, speed: [.6, 1.1], fadeIn: .1, noThin: true });
      if (Math.random() < .06) P.emit('add', 1, { pos: t, life: [.6, 1.2], size: [.03, .05], color: c.ember, cell: CELL.ember, dir: 'up', speed: [.5, 1.2], turb: 3, fadeIn: 0 });
    }
  }

  // ---- per frame ----------------------------------------------------------------------------------
  const tmpV = new T.Vector3();
  function update(dt, camera) {
    time += dt;
    heat *= Math.exp(-dt * 1.4);
    // lightning: re-jitter and draw
    for (let i = bolts.length - 1; i >= 0; --i) {
      const b = bolts[i]; b.age += dt; b.next -= dt;
      if (b.age >= b.life) { bolts.splice(i, 1); continue; }
      if (b.next <= 0) { b.path = boltPath(b.a, b.b, b.rough, b.branches); b.next = .045; }
      const c = pal(b.el), fade = 1 - b.age / b.life, flick = .6 + Math.random() * .4;
      b.path.forEach((line, li) => {
        const w = (li ? .55 : 1) * b.width;
        for (let k = 1; k < line.length; ++k) {
          segment(line[k - 1], line[k], .07 * w, c.core, fade * flick, CELL.beam);
          if (k % 2) segment(line[k - 1], line[k], .45 * w, c.hot, .28 * fade * flick, CELL.glow);
        }
      });
      if (b.age < dt * 1.5) frameLight(b.b, c.light, 7.0 * b.width, 4);
    }
    P.update(dt); G.update(dt);
    // lights: decay requests, pick the brightest
    for (let i = lightReq.length - 1; i >= 0; --i) { lightReq[i].age += dt; if (lightReq[i].age >= lightReq[i].life) lightReq.splice(i, 1); }
    const cand = [...lightReq.map(l => ({ pos: l.pos, color: l.color, intensity: l.intensity * Math.pow(1 - l.age / l.life, 2), distance: l.distance })), ...frameLights];
    cand.sort((a, b) => b.intensity - a.intensity);
    for (let i = 0; i < LIGHTS; ++i) {
      const l = lightPool[i], c = cand[i];
      if (!c) { l.intensity = 0; l.visible = false; continue; }
      // Lights sit a little above the burst so they wash the floor instead of burning a hot spot into it;
      // the screen's heat dims them further when a cascade is going off everywhere.
      l.visible = true; l.position.set(c.pos[0], Math.max(1.1, c.pos[1]), c.pos[2]); l.color.setRGB(...c.color); l.intensity = c.intensity * .3 * calm(); l.distance = c.distance;
    }
    frameLights.length = 0;
    // shake
    trauma = Math.max(0, trauma - dt * 1.6);
    const s = trauma * trauma * .35;
    shakeOffset.set((Math.random() - .5) * s, (Math.random() - .5) * s * .6, (Math.random() - .5) * s);
    aberr = Math.max(0, aberr - dt * .03); flash = Math.max(0, flash - dt * 1.2);
    // ripples to screen space
    const out = [];
    for (let i = ripples.length - 1; i >= 0; --i) {
      const r = ripples[i]; r.age += dt;
      if (r.age >= r.life) { ripples.splice(i, 1); continue; }
      const t = r.age / r.life;
      tmpV.set(...r.pos).project(camera);
      if (tmpV.z > 1) continue;
      // world radius → screen radius: project a point r.radius away
      const c0 = tmpV.clone();
      tmpV.set(r.pos[0] + r.radius, r.pos[1], r.pos[2]).project(camera);
      const scr = Math.abs(tmpV.x - c0.x) * .5;
      out.push({ x: c0.x * .5 + .5, y: c0.y * .5 + .5, radius: scr * (.2 + t * 1.1), strength: r.strength * Math.pow(1 - t, 2) });
    }
    return { ripples: out, aberration: aberr, flash, flashColor, shake: shakeOffset, bloom: .7 / (1 + heat * .08) };
  }

  function clear() { P.clear(); G.clear(); bolts.length = 0; ripples.length = 0; lightReq.length = 0; trails.clear(); trauma = 0; flash = 0; aberr = 0; }
  function dispose() { P.dispose(); G.dispose(); for (const l of lightPool) l.dispose?.(); group.clear(); scene.remove(group); }

  return { group, recipes, torches, get heat() { return heat; }, get bolts() { return bolts.length; }, projectiles, zones, statuses, minions, lightning, light, shake, ripple, pulse, update, clear, dispose, particles: P, ground: G };
}
