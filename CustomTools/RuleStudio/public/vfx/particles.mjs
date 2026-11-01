// GPU 实例化粒子：CPU 模拟（类型化数组），一次绘制调用画完一整个混合池。
// 两个池：add（发光：火焰、电光、火花、魔法）和 alpha（烟、尘、雾）。颜色允许 >1（HDR），交给泛光处理。
//
// emit(pool, n, spec) 的 spec（全部可选，数组表示 [最小, 最大] 随机）：
//   pos:[x,y,z]  spread:半径（球内）  flat:true 时只在水平圆盘上散开
//   dir:'sphere'|'up'|'flat'|'cone'  axis:[x,y,z]（cone 轴）  angle:半角（弧度）  speed:[a,b]  vel:[x,y,z] 额外速度
//   life:[a,b]  size:[a,b]  grow:终点尺寸倍数  color:[r,g,b]  color1:[r,g,b]（终点色）  alpha  fadeIn  fadePow
//   spin:[a,b]  drag  grav（负为下落）  cell  stretch（沿速度拉伸，秒）  turb  bounce:true  radial:true（速度从中心向外）
import { atlasTexture, ATLAS_GRID } from './textures.mjs';

const S = 28; // floats per particle
// layout
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, S0 = 8, S1 = 9, R0 = 10, G0 = 11, B0 = 12, R1 = 13, G1 = 14, B1 = 15,
  A = 16, FIN = 17, FPOW = 18, ROT = 19, SPIN = 20, DRAG = 21, GRAV = 22, CELLI = 23, STR = 24, TURB = 25, BOUNCE = 26, SEED = 27;

const rnd = r => Array.isArray(r) ? r[0] + Math.random() * (r[1] - r[0]) : (r ?? 0);

const VERT = /* glsl */`
attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute vec3 iD;
uniform float grid;
varying vec2 vUv; varying vec4 vCol;
void main(){
  vec4 mv = modelViewMatrix * vec4(iA.xyz, 1.);
  vec2 q = position.xy;
  float size = iA.w;
  vec2 off;
  if (iC.z > 0.) {
    vec2 d = (modelViewMatrix * vec4(iD, 0.)).xy; float l = length(d);
    vec2 dir = l > 1e-4 ? d / l : vec2(1., 0.);
    float len = size + l * iC.z;
    off = dir * q.x * len + vec2(-dir.y, dir.x) * q.y * size * .5;
  } else {
    float c = cos(iC.x), s = sin(iC.x);
    off = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * size;
  }
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
  float cx = mod(iC.y, grid), cy = floor(iC.y / grid);
  vUv = vec2((cx + q.x + .5) / grid, 1. - (cy + .5 - q.y) / grid);
  vCol = iB;
}`;
const FRAG = /* glsl */`
uniform sampler2D map; uniform float gain;
varying vec2 vUv; varying vec4 vCol;
void main(){
  float a = texture2D(map, vUv).a * vCol.a;
  if (a < .004) discard;
  gl_FragColor = vec4(vCol.rgb * gain, a);
}`;

class Pool {
  constructor(T, capacity, blend, transientCap = 3000) {
    this.cap = capacity; this.tcap = transientCap;
    this.data = new Float32Array(capacity * S); this.n = 0; this.t = 0; this.time = 0;
    const total = capacity + transientCap;
    const geo = new T.InstancedBufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (k, size) => { const a = new T.InstancedBufferAttribute(new Float32Array(total * size), size); a.setUsage(T.DynamicDrawUsage); geo.setAttribute(k, a); return a; };
    this.iA = mk('iA', 4); this.iB = mk('iB', 4); this.iC = mk('iC', 4); this.iD = mk('iD', 3);
    geo.instanceCount = 0;
    this.geo = geo;
    this.mat = new T.ShaderMaterial({
      uniforms: { map: { value: atlasTexture(T) }, grid: { value: ATLAS_GRID }, gain: { value: blend === 'add' ? .62 : 1 } }, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: true, blending: blend === 'add' ? T.AdditiveBlending : T.NormalBlending,
    });
    this.mesh = new T.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = blend === 'add' ? 20 : 10;
    this.transient = [];
  }
  get load() { return this.n / this.cap; }
  spawn(spec, i) {
    if (this.n >= this.cap) return;
    const d = this.data, o = this.n++ * S;
    const p = spec.pos ?? [0, 0, 0];
    let ox = 0, oy = 0, oz = 0;
    const spread = rnd(spec.spread);
    if (spread) {
      if (spec.flat) { const a = Math.random() * 6.2832, r = Math.sqrt(Math.random()) * spread; ox = Math.cos(a) * r; oz = Math.sin(a) * r; }
      else { let x, y, z; do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; } while (x * x + y * y + z * z > 1); ox = x * spread; oy = Math.abs(y) * spread * (spec.half ? 1 : Math.sign(y) || 1); oz = z * spread; }
    }
    if (spec.ring) { const a = (spec.ringAngle ?? 0) + (spec.ringCount ? i / spec.ringCount * 6.2832 : Math.random() * 6.2832); ox += Math.cos(a) * spec.ring; oz += Math.sin(a) * spec.ring; }
    d[o + PX] = p[0] + ox; d[o + PY] = p[1] + oy; d[o + PZ] = p[2] + oz;
    // velocity
    const sp = rnd(spec.speed);
    let vx = 0, vy = 0, vz = 0;
    switch (spec.dir) {
      case 'up': { const a = Math.random() * 6.2832, k = rnd(spec.angle ?? .35) * Math.random(); vx = Math.cos(a) * Math.sin(k); vz = Math.sin(a) * Math.sin(k); vy = Math.cos(k); break; }
      case 'flat': { const a = spec.ringCount ? (spec.ringAngle ?? 0) + i / spec.ringCount * 6.2832 : Math.random() * 6.2832; vx = Math.cos(a); vz = Math.sin(a); vy = rnd(spec.lift ?? 0); break; }
      case 'cone': {
        const ax = spec.axis ?? [0, 1, 0], ang = spec.angle ?? .5;
        // random direction in a cone around axis
        const u = Math.random() * 6.2832, c = 1 - Math.random() * (1 - Math.cos(ang)), s2 = Math.sqrt(1 - c * c);
        const l = Math.hypot(...ax) || 1, w = [ax[0] / l, ax[1] / l, ax[2] / l];
        const t = Math.abs(w[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
        const a1 = [w[1] * t[2] - w[2] * t[1], w[2] * t[0] - w[0] * t[2], w[0] * t[1] - w[1] * t[0]], la = Math.hypot(...a1);
        const e1 = a1.map(x => x / la), e2 = [w[1] * e1[2] - w[2] * e1[1], w[2] * e1[0] - w[0] * e1[2], w[0] * e1[1] - w[1] * e1[0]];
        vx = w[0] * c + (e1[0] * Math.cos(u) + e2[0] * Math.sin(u)) * s2; vy = w[1] * c + (e1[1] * Math.cos(u) + e2[1] * Math.sin(u)) * s2; vz = w[2] * c + (e1[2] * Math.cos(u) + e2[2] * Math.sin(u)) * s2; break;
      }
      case 'none': break;
      default: { if (spec.radial && (ox || oy || oz)) { const l = Math.hypot(ox, oy, oz); vx = ox / l; vy = oy / l; vz = oz / l; } else { let x, y, z, l; do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 1e-4); l = Math.sqrt(l); vx = x / l; vy = (spec.half ? Math.abs(y) : y) / l; vz = z / l; } }
    }
    const v = spec.vel ?? [0, 0, 0];
    d[o + VX] = vx * sp + v[0]; d[o + VY] = vy * sp + v[1]; d[o + VZ] = vz * sp + v[2];
    d[o + AGE] = 0; d[o + LIFE] = Math.max(.02, rnd(spec.life ?? .6));
    const s0 = rnd(spec.size ?? .3); d[o + S0] = s0; d[o + S1] = s0 * rnd(spec.grow ?? 1);
    const c0 = spec.color ?? [1, 1, 1], c1 = spec.color1 ?? c0, j = spec.jitter ? 1 + (Math.random() - .5) * spec.jitter : 1;
    d[o + R0] = c0[0] * j; d[o + G0] = c0[1] * j; d[o + B0] = c0[2] * j; d[o + R1] = c1[0]; d[o + G1] = c1[1]; d[o + B1] = c1[2];
    d[o + A] = rnd(spec.alpha ?? 1); d[o + FIN] = spec.fadeIn ?? .06; d[o + FPOW] = spec.fadePow ?? 1.5;
    d[o + ROT] = spec.rot !== undefined ? rnd(spec.rot) : Math.random() * 6.2832; d[o + SPIN] = rnd(spec.spin ?? 0);
    d[o + DRAG] = spec.drag ?? 0; d[o + GRAV] = spec.grav ?? 0; d[o + CELLI] = spec.cell ?? 0; d[o + STR] = spec.stretch ?? 0;
    d[o + TURB] = spec.turb ?? 0; d[o + BOUNCE] = spec.bounce ? 1 : 0; d[o + SEED] = Math.random() * 100;
  }
  update(dt) {
    this.time += dt;
    const d = this.data, A_ = this.iA.array, B_ = this.iB.array, C_ = this.iC.array, D_ = this.iD.array, tm = this.time;
    let i = 0;
    while (i < this.n) {
      const o = i * S;
      d[o + AGE] += dt;
      if (d[o + AGE] >= d[o + LIFE]) { const last = (this.n - 1) * S; if (o !== last) d.copyWithin(o, last, last + S); this.n--; continue; }
      const drag = d[o + DRAG];
      if (drag) { const k = Math.exp(-drag * dt); d[o + VX] *= k; d[o + VY] *= k; d[o + VZ] *= k; }
      d[o + VY] += d[o + GRAV] * dt;
      const tb = d[o + TURB];
      if (tb) { const sd = d[o + SEED]; d[o + VX] += Math.sin(d[o + PZ] * 2.3 + tm * 3.1 + sd) * tb * dt; d[o + VZ] += Math.cos(d[o + PX] * 2.1 + tm * 2.7 + sd) * tb * dt; d[o + VY] += Math.sin(d[o + PX] * 1.7 + tm * 2.2 + sd * 2) * tb * .35 * dt; }
      d[o + PX] += d[o + VX] * dt; d[o + PY] += d[o + VY] * dt; d[o + PZ] += d[o + VZ] * dt;
      if (d[o + BOUNCE] && d[o + PY] < .03 && d[o + VY] < 0) { d[o + PY] = .03; d[o + VY] *= -.32; d[o + VX] *= .6; d[o + VZ] *= .6; }
      d[o + ROT] += d[o + SPIN] * dt;
      const t = d[o + AGE] / d[o + LIFE];
      const fin = d[o + FIN], fade = (fin > 0 ? Math.min(1, t / fin) : 1) * Math.pow(1 - t, d[o + FPOW]);
      const w = i * 4;
      A_[w] = d[o + PX]; A_[w + 1] = d[o + PY]; A_[w + 2] = d[o + PZ]; A_[w + 3] = d[o + S0] + (d[o + S1] - d[o + S0]) * t;
      B_[w] = d[o + R0] + (d[o + R1] - d[o + R0]) * t; B_[w + 1] = d[o + G0] + (d[o + G1] - d[o + G0]) * t; B_[w + 2] = d[o + B0] + (d[o + B1] - d[o + B0]) * t; B_[w + 3] = d[o + A] * fade;
      C_[w] = d[o + ROT]; C_[w + 1] = d[o + CELLI]; C_[w + 2] = d[o + STR]; C_[w + 3] = 0;
      const v = i * 3; D_[v] = d[o + VX]; D_[v + 1] = d[o + VY]; D_[v + 2] = d[o + VZ];
      ++i;
    }
    // Immediate sprites (projectile heads, auras): drawn this frame only.
    let k = this.n;
    for (const s of this.transient) {
      if (k >= this.cap + this.tcap) break;
      const w = k * 4, v = k * 3;
      A_[w] = s[0]; A_[w + 1] = s[1]; A_[w + 2] = s[2]; A_[w + 3] = s[3];
      B_[w] = s[4]; B_[w + 1] = s[5]; B_[w + 2] = s[6]; B_[w + 3] = s[7];
      C_[w] = s[8]; C_[w + 1] = s[9]; C_[w + 2] = s[10]; C_[w + 3] = 0;
      D_[v] = s[11]; D_[v + 1] = s[12]; D_[v + 2] = s[13];
      ++k;
    }
    this.transient.length = 0;
    this.geo.instanceCount = k;
    for (const a of [this.iA, this.iB, this.iC, this.iD]) { a.clearUpdateRanges(); a.addUpdateRange(0, k * a.itemSize); a.needsUpdate = true; }
  }
  clear() { this.n = 0; this.transient.length = 0; }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

export function createParticles(T, { add = 16000, alpha = 6000 } = {}) {
  const group = new T.Group(); group.name = 'Particles';
  const pools = { add: new Pool(T, add, 'add'), alpha: new Pool(T, alpha, 'alpha') };
  group.add(pools.alpha.mesh, pools.add.mesh);
  return {
    group, pools,
    /** Fraction of the glow pool in use: recipes thin out when the screen is already busy. */
    get load() { return pools.add.load; },
    emit(pool, n, spec) {
      const P = pools[pool], q = Math.max(.12, 1 - Math.max(0, P.load - .18) * 2.4);
      const count = Math.max(spec.min ?? 0, Math.round(n * (spec.noThin ? 1 : q)));
      for (let i = 0; i < count; ++i) P.spawn(spec, i);
    },
    /** A one-frame sprite: [x,y,z], size, [r,g,b], alpha, cell, rot, stretch, [vx,vy,vz]. */
    sprite(pool, pos, size, color, alpha = 1, cell = 0, rot = 0, stretch = 0, vel = null) {
      pools[pool].transient.push([pos[0], pos[1], pos[2], size, color[0], color[1], color[2], alpha, rot, cell, stretch, vel ? vel[0] : 0, vel ? vel[1] : 0, vel ? vel[2] : 0]);
    },
    update(dt) {
      pools.add.update(dt); pools.alpha.update(dt);
      // Auto-exposure for glow: a screen full of sparks is dimmed so it never clips to white.
      const u = pools.add.mat.uniforms.gain; u.value += (.62 / (1 + Math.max(0, pools.add.load - .08) * 4) - u.value) * Math.min(1, dt * 6);
    },
    clear() { pools.add.clear(); pools.alpha.clear(); },
    dispose() { pools.add.dispose(); pools.alpha.dispose(); group.clear(); },
  };
}
