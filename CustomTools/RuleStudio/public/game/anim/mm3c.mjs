// 运动匹配（照搬 DWCore Tools/WebExport/web/mm3c.js，只加了 loadPack）。主角的可见模型由它驱动：
// 外部运动（规则内核给位置）→ 轨迹 → 选库 → 搜索 → 根骨偏移 → 惯性化切换 → 蒙太奇槽（上半身 / 全身）。
// 动画包是从 UE（DWCore）导出、离线重定向到低多边形 Manny 骨架的 25 根骨局部旋转。

// DWCore hero 3C, web port.
//   * UCleanMotionAnimInstance (MoonScholar3C): external motion -> trajectory -> database chooser -> motion matching,
//     offset root bone, inertialized pose switches, montage slots (CleanAction full body, CleanUpperBody).
//   * FAnimNode_CleanRollRoot: world-space pose continuity when the capsule snaps to the roll direction.
//   * ADWHeroVisual::Drive: facing turns toward the aim at <= 720 deg/s, the rules own the position.
// Animation data: DWCore's GASP run set + Mage set + Roll, exported from UE and retargeted offline to the
// low-poly Manny rig (local rotations, identity rest).  Distances inside the pack are source metres.

const TAU = Math.PI * 2;
const wrapPi = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const deg = r => r * 180 / Math.PI;

// ---------------------------------------------------------------- quaternions (x,y,z,w in Float32Array)
export function qmul(o, a, ai, b, bi, oi = 0) {
  const ax = a[ai], ay = a[ai + 1], az = a[ai + 2], aw = a[ai + 3];
  const bx = b[bi], by = b[bi + 1], bz = b[bi + 2], bw = b[bi + 3];
  o[oi] = aw * bx + ax * bw + ay * bz - az * by;
  o[oi + 1] = aw * by - ax * bz + ay * bw + az * bx;
  o[oi + 2] = aw * bz + ax * by - ay * bx + az * bw;
  o[oi + 3] = aw * bw - ax * bx - ay * by - az * bz;
}
function qslerp(o, oi, a, ai, b, bi, t) {
  let ax = a[ai], ay = a[ai + 1], az = a[ai + 2], aw = a[ai + 3];
  let bx = b[bi], by = b[bi + 1], bz = b[bi + 2], bw = b[bi + 3];
  let c = ax * bx + ay * by + az * bz + aw * bw;
  if (c < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; c = -c; }
  let k0, k1;
  if (c > 0.9995) { k0 = 1 - t; k1 = t; }
  else { const th = Math.acos(c), s = Math.sin(th); k0 = Math.sin((1 - t) * th) / s; k1 = Math.sin(t * th) / s; }
  let x = ax * k0 + bx * k1, y = ay * k0 + by * k1, z = az * k0 + bz * k1, w = aw * k0 + bw * k1;
  const n = 1 / Math.hypot(x, y, z, w);
  o[oi] = x * n; o[oi + 1] = y * n; o[oi + 2] = z * n; o[oi + 3] = w * n;
}
const QID = new Float32Array([0, 0, 0, 1]);
function qyaw(a) { return new Float32Array([0, Math.sin(a / 2), 0, Math.cos(a / 2)]); }
function conjInto(o, oi, a, ai) { o[oi] = -a[ai]; o[oi + 1] = -a[ai + 1]; o[oi + 2] = -a[ai + 2]; o[oi + 3] = a[ai + 3]; }
const quintic = t => { t = Math.min(1, Math.max(0, t)); return 1 - t * t * t * (10 + t * (-15 + 6 * t)); };
const damp = (dt, hl) => hl <= 0 ? 0 : Math.pow(2, -dt / hl);
// rotate (x,z) by yaw (three.js Y rotation; forward = (sin yaw, cos yaw))
const rotX = (x, z, a) => x * Math.cos(a) + z * Math.sin(a);
const rotZ = (x, z, a) => -x * Math.sin(a) + z * Math.cos(a);

// ---------------------------------------------------------------- pack
/** Fetch an uncompressed pack (anim .bin). */
export async function loadPack(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(`动画包 ${url}: HTTP ${r.status}`);
  return new Pack(await r.arrayBuffer());
}
export async function decodePack(b64) {
  const bin = atob(b64.trim()); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const ds = new DecompressionStream('gzip');
  const buf = await new Response(new Blob([u]).stream().pipeThrough(ds)).arrayBuffer();
  return new Pack(buf);
}

export class Pack {
  constructor(buf) {
    const hl = new DataView(buf).getUint32(0, true);
    const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
    let base = 4 + hl; base += (4 - base % 4) % 4;
    this.bones = head.bones; this.nb = head.bones.length; this.hz = head.hz;
    this.bi = Object.fromEntries(this.bones.map((b, i) => [b, i]));
    this.clips = head.clips.map((c, idx) => {
      const n = c.n, nb = this.nb;
      const qi = new Int16Array(buf, base + c.q, n * nb * 3);
      const q = new Float32Array(n * nb * 4);
      for (let i = 0, j = 0; i < n * nb; i++, j += 3) {
        const x = qi[j] / 32767, y = qi[j + 1] / 32767, z = qi[j + 2] / 32767;
        q[i * 4] = x; q[i * 4 + 1] = y; q[i * 4 + 2] = z; q[i * 4 + 3] = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z));
      }
      const pi = new Int16Array(buf, base + c.p, n * 3), p = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++) p[i] = pi[i] / 10000;
      const fi = new Int16Array(buf, base + c.f, n * 9), f = new Float32Array(n * 9);
      for (let i = 0; i < n * 9; i++) f[i] = fi[i] / 10000;
      const r = new Float32Array(buf.slice(base + c.r, base + c.r + n * 12));
      for (let i = 1; i < n; i++) r[i * 3 + 2] = r[(i - 1) * 3 + 2] + wrapPi(r[i * 3 + 2] - r[(i - 1) * 3 + 2]); // unwrap yaw
      return { idx, name: c.name, dbs: c.dbs, n, len: c.length, loop: c.loop, notifies: c.notifies, q, p, f, r };
    });
    this.byName = Object.fromEntries(this.clips.map(c => [c.name, c]));
    this.dbs = {};
    for (const c of this.clips) for (const d of c.dbs) (this.dbs[d] = this.dbs[d] || []).push(c);
    this.buildFeatures();
  }
  // pose at time t (seconds): local quats (nb*4) + pelvis position (units of pelvis height)
  pose(c, t, oq, op) {
    const L = (c.n - 1) / this.hz;
    if (c.loop) { t %= L; if (t < 0) t += L; } else t = Math.min(L, Math.max(0, t));
    const f = t * this.hz, i0 = Math.min(c.n - 1, Math.floor(f)), i1 = Math.min(c.n - 1, i0 + 1), a = f - i0;
    const nb = this.nb;
    for (let b = 0; b < nb; b++) qslerp(oq, b * 4, c.q, (i0 * nb + b) * 4, c.q, (i1 * nb + b) * 4, a);
    for (let k = 0; k < 3; k++) op[k] = c.p[i0 * 3 + k] * (1 - a) + c.p[i1 * 3 + k] * a;
  }
  // root transform [x, z, yaw] at t, with loop accumulation and linear extrapolation outside non-looping clips
  rootAt(c, t, out = [0, 0, 0]) {
    const L = (c.n - 1) / this.hz, r = c.r;
    const raw = (tt, o) => {
      const f = Math.min(c.n - 1, Math.max(0, tt * this.hz)), i0 = Math.min(c.n - 2, Math.floor(f)), a = f - i0;
      for (let k = 0; k < 3; k++) o[k] = r[i0 * 3 + k] * (1 - a) + r[(i0 + 1) * 3 + k] * a;
      return o;
    };
    if (t >= 0 && t <= L) return raw(t, out);
    if (c.loop) {
      const k = Math.floor(t / L), rem = t - k * L;
      const e = raw(L, [0, 0, 0]), s = raw(0, [0, 0, 0]);
      // one cycle as a delta in the start frame
      const dx = rotX(e[0] - s[0], e[1] - s[1], -s[2]), dz = rotZ(e[0] - s[0], e[1] - s[1], -s[2]), dy = e[2] - s[2];
      let x = s[0], z = s[1], y = s[2];
      const steps = Math.abs(k);
      for (let i = 0; i < steps; i++) {
        if (k > 0) { x += rotX(dx, dz, y); z += rotZ(dx, dz, y); y += dy; }
        else { y -= dy; x -= rotX(dx, dz, y); z -= rotZ(dx, dz, y); }
      }
      const p = raw(rem, [0, 0, 0]);
      const lx = rotX(p[0] - s[0], p[1] - s[1], -s[2]), lz = rotZ(p[0] - s[0], p[1] - s[1], -s[2]);
      out[0] = x + rotX(lx, lz, y); out[1] = z + rotZ(lx, lz, y); out[2] = y + (p[2] - s[2]);
      return out;
    }
    // extrapolate with the boundary velocity (local frame), constant yaw rate
    const end = t > L, h = 4 / this.hz;
    const a = raw(end ? L - h : 0, [0, 0, 0]), b = raw(end ? L : h, [0, 0, 0]);
    const lvx = rotX(b[0] - a[0], b[1] - a[1], -a[2]) / h, lvz = rotZ(b[0] - a[0], b[1] - a[1], -a[2]) / h, w = (b[2] - a[2]) / h;
    const base = end ? b : a, dt = end ? t - L : t;
    const yaw = base[2] + w * dt * 0.5;
    out[0] = base[0] + rotX(lvx, lvz, yaw) * dt; out[1] = base[1] + rotZ(lvx, lvz, yaw) * dt; out[2] = base[2] + w * dt;
    return out;
  }
  buildFeatures() {
    const T = TRAJ_T, hz = this.hz, D = FDIM;
    const groups = FGROUPS;
    const sum = new Float64Array(groups.length), cnt = new Float64Array(groups.length);
    const r0 = [0, 0, 0], rt = [0, 0, 0], r1 = [0, 0, 0];
    for (const c of this.clips) {
      if (!c.dbs.length) continue;
      c.feat = new Float32Array(c.n * D);
      for (let i = 0; i < c.n; i++) {
        const t = i / hz, F = c.feat, o = i * D;
        this.rootAt(c, t, r0);
        for (let k = 0; k < T.length; k++) {
          this.rootAt(c, t + T[k], rt);
          const dx = rt[0] - r0[0], dz = rt[1] - r0[1];
          F[o + k * 2] = rotX(dx, dz, -r0[2]); F[o + k * 2 + 1] = rotZ(dx, dz, -r0[2]);
          const fy = rt[2] - r0[2];
          F[o + 8 + k * 2] = Math.sin(fy); F[o + 8 + k * 2 + 1] = Math.cos(fy);
        }
        // root velocity in the root frame
        this.rootAt(c, t + 1 / hz, r1);
        const rvx = rotX(r1[0] - r0[0], r1[1] - r0[1], -r0[2]) * hz, rvz = rotZ(r1[0] - r0[0], r1[1] - r0[1], -r0[2]) * hz;
        const ia = Math.max(0, i - 1), ib = Math.min(c.n - 1, i + 1), span = (ib - ia) / hz || 1 / hz;
        for (let j = 0; j < 2; j++) for (let k = 0; k < 3; k++) F[o + 16 + j * 3 + k] = c.f[i * 9 + j * 3 + k];
        for (let j = 0; j < 3; j++) {
          const vx = (c.f[ib * 9 + j * 3] - c.f[ia * 9 + j * 3]) / span + rvx;
          const vy = (c.f[ib * 9 + j * 3 + 1] - c.f[ia * 9 + j * 3 + 1]) / span;
          const vz = (c.f[ib * 9 + j * 3 + 2] - c.f[ia * 9 + j * 3 + 2]) / span + rvz;
          const oo = o + 22 + j * 3; F[oo] = vx; F[oo + 1] = vy; F[oo + 2] = vz;
        }
        for (let g = 0; g < groups.length; g++) {
          const [a, b] = groups[g].range;
          for (let k = a; k < b; k++) { sum[g] += F[o + k] * F[o + k]; cnt[g]++; }
        }
      }
    }
    // per-group RMS normalization (PSN_All normalizes over every database together)
    this.norm = new Float32Array(D);
    for (let g = 0; g < groups.length; g++) {
      const rms = Math.sqrt(sum[g] / Math.max(1, cnt[g])) || 1;
      const [a, b] = groups[g].range;
      for (let k = a; k < b; k++) this.norm[k] = groups[g].w / rms / Math.sqrt(b - a);
    }
  }
}

// Schema (PSS_Default-like): trajectory samples, foot positions / velocities, pelvis velocity
export const TRAJ_T = [-0.4, 0.35, 0.7, 1.0];
const FDIM = 31;
const FGROUPS = [
  { name: 'traj pos', range: [0, 8], w: 1.0 },
  { name: 'traj facing', range: [8, 16], w: 0.8 },
  { name: 'feet pos', range: [16, 22], w: 0.55 },
  { name: 'feet/pelvis vel', range: [22, 31], w: 0.55 },
];

// ---------------------------------------------------------------- the anim instance
const UPPER = ['spine_01', 'spine_02', 'spine_03', 'spine_04', 'spine_05', 'neck_01', 'neck_02', 'head',
  'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r'];
const UPPER_W = { spine_01: 0.5, spine_02: 0.8 };

export class CleanMotion {
  constructor(pack, opts) {
    this.pack = pack; this.nb = pack.nb;
    this.s = opts.scale;               // world metres per source metre
    this.pelvisH = opts.pelvisH;       // rig pelvis height (world)
    this.cfg = Object.assign({
      continuingBias: -0.012, loopingBias: -0.006, searchInterval: 0, minSwitch: 0.1, poseJump: 0.25,
      maxOffsetT: 0.5, rotHalfLifeMoving: 0.25, maxRotError: Math.PI,
    }, opts.cfg || {});
    this.outQ = new Float32Array(this.nb * 4); this.outP = new Float32Array(3);
    this.mmQ = new Float32Array(this.nb * 4); this.mmP = new Float32Array(3);
    this.tmpQ = new Float32Array(this.nb * 4); this.tmpP = new Float32Array(3);
    this.actQ = new Float32Array(this.nb * 4); this.actP = new Float32Array(3);
    this.inQ = new Float32Array(this.nb * 4); this.inP = new Float32Array(3); this.inT = 1; this.inDur = 0.2;
    for (let b = 0; b < this.nb; b++) { this.outQ[b * 4 + 3] = 1; this.inQ[b * 4 + 3] = 1; }
    this.clip = pack.dbs.PSD_Idle[0]; this.time = 0; this.db = 'PSD_Idle'; this.sinceSwitch = 0;
    this.vis = { x: 0, z: 0, yaw: 0 };
    this.hist = [];
    this.extVel = [0, 0];
    this.prev = { state: 0, gait: 1 };
    this.action = null;
    this.events = [];
    this.dbg = {}; this.query = new Float32Array(FDIM);
    this.traj = [];
    this.upperIdx = UPPER.map(n => pack.bi[n]);
    this.lastCost = 0;
  }
  teleport(x, z, yaw) { this.vis.x = x; this.vis.z = z; this.vis.yaw = yaw; this.hist.length = 0; this.extVel = [0, 0]; }

  // ---- montage adapter (PlayCleanAction / StopCleanAction / CancelCleanActionForMovement)
  playAction(name, rate = 1, upper = false, opt = {}) {
    const c = this.pack.byName[name]; if (!c) return false;
    const a = { clip: c, t: opt.start || 0, rate, upper, w: upper ? (this.action && this.action.upper ? this.action.w : 0) : 0,
      blendIn: 0.15, blendOut: 0.15, stopping: false, hold: !!opt.hold, fired: new Set(), name };
    if (upper && this.action && this.action.upper && this.action.w > 0) this.requestInertial(0.15);  // replay: old instance fades out
    if (!upper && opt.inertial) {
      // RequestMontageInertialization: switch at full weight and decay the previous pose
      a.w = 1; this.requestInertial(opt.inertial, true, opt.yawJump || 0, opt.moveJump);
    }
    this.action = a;
    return true;
  }
  stopAction(blendOut = 0.1) { if (this.action) { this.action.stopping = true; this.action.blendOut = blendOut; } }
  cancelForMovement(duration = 0.12) {
    if (!this.action || this.action.upper) return;
    this.requestInertial(duration, true, 0); this.action = null;
  }
  isActionActive() { return !!this.action; }
  isFullBody() { return !!this.action && !this.action.upper; }
  actionProgress() { return this.action ? Math.min(1, this.action.t / this.action.clip.len) : 1; }

  // Inertialization: hold the current output as an offset from whatever is evaluated next.
  // yawJump / moveJump keep the previous WORLD pose when the visual root snaps (CleanRollRoot).
  requestInertial(dur, fromOutput = true, yawJump = 0, moveJump = null) {
    this._pendingInertial = { dur, yawJump, moveJump };
  }
  _applyPendingInertial(newQ, newP) {
    const p = this._pendingInertial; if (!p) return; this._pendingInertial = null;
    const nb = this.nb, cur = this.outQ;
    for (let b = 0; b < nb; b++) {
      const t = new Float32Array(4); conjInto(t, 0, newQ, b * 4);
      qmul(this.inQ, cur, b * 4, t, 0, b * 4);
    }
    // pelvis: previous world orientation expressed in the new root frame
    const pi = this.pack.bi.pelvis * 4;
    if (p.yawJump) { const y = qyaw(p.yawJump), t = new Float32Array(4); qmul(t, y, 0, this.inQ, pi); this.inQ.set(t, pi); }
    let px = this.outP[0], py = this.outP[1], pz = this.outP[2];
    if (p.yawJump) { const nx = rotX(px, pz, p.yawJump), nz = rotZ(px, pz, p.yawJump); px = nx; pz = nz; }
    if (p.moveJump) { px += p.moveJump[0] / this.pelvisH; pz += p.moveJump[1] / this.pelvisH; }
    this.inP[0] = px - newP[0]; this.inP[1] = py - newP[1]; this.inP[2] = pz - newP[2];
    this.inT = 0; this.inDur = p.dur;
  }

  // ---- one frame. ext: actor (capsule) transform, velocity, intent and max speed in WORLD units.
  update(dt, ext) {
    if (dt <= 0) return;
    const P = this.pack, s = this.s, cfg = this.cfg;
    this.events.length = 0;
    // SetExternalMotion: decay the visual velocity so the chooser sees a real Stop
    const k = Math.min(1, dt * 12);
    this.extVel[0] += (ext.vx - this.extVel[0]) * k; this.extVel[1] += (ext.vz - this.extVel[1]) * k;
    const full = this.isFullBody();
    const vx = full ? 0 : this.extVel[0], vz = full ? 0 : this.extVel[1];
    const groundSpeed = Math.hypot(vx, vz) / s;  // source m/s
    // history (capsule)
    this.hist.push({ t: 0, x: ext.x, z: ext.z, yaw: ext.yaw });
    for (const h of this.hist) h.t -= dt;
    this.hist[this.hist.length - 1].t = 0;
    while (this.hist.length > 2 && this.hist[1].t < -3) this.hist.shift();
    // future trajectory (nav-intent spring, same closed form as the C++)
    const ix = full ? 0 : ext.ix, iz = full ? 0 : ext.iz;
    const fut = tt => { const T = Math.max(0, tt), g = T - (1 - Math.exp(-4 * T)) / 4; return [ext.x + vx * T + (ix - vx) * g, ext.z + vz * T + (iz - vz) * g]; };
    const p4 = fut(0.4), p5 = fut(0.5);
    const intentZero = Math.hypot(ix, iz) / s < 0.001;
    const fvx = intentZero ? 0 : (p5[0] - p4[0]) * 10, fvz = intentZero ? 0 : (p5[1] - p4[1]) * 10;
    const futureSpeed = Math.hypot(fvx, fvz) / s;
    const moving = futureSpeed > 0.001 && groundSpeed > 0.001;
    // offset root bone modes
    let tMode = (moving) ? 'Interpolate' : 'Release';
    if (!full && groundSpeed < 0.01) tMode = 'LockOffsetAndIgnoreAnimation';
    const tHalf = moving ? 0.3 : 0.1;
    // chooser (run gait: MaxSpeed 400 cm/s)
    const maxSpeed = ext.maxSpeed / s * 100;
    const gait = maxSpeed > 550 ? 2 : (maxSpeed > 300 ? 1 : 0);
    const curDb = this.db;
    const wasPivot = curDb && curDb.endsWith('_Pivots');
    const starting = moving && (futureSpeed >= groundSpeed + 1.0 || this.prev.state === 0) && !wasPivot;
    const velYaw = Math.atan2(vx, vz), futYaw = Math.atan2(fvx, fvz);
    const pivotAngle = Math.abs(deg(wrapPi(futYaw - velYaw)));
    const pivoting = moving && pivotAngle >= 60;
    const rootError = Math.abs(deg(wrapPi(this.vis.yaw - ext.yaw)));
    const spin = rootError >= 130 && groundSpeed >= 1.5 && !wasPivot;
    const turn = !full && rootError >= 50 && (starting || (!moving && this.prev.state === 0));
    const cand = [];
    const add = n => { if (P.dbs[n] && !cand.includes(n)) cand.push(n); };
    const prefix = gait === 0 ? 'PSD_Walk' : 'PSD_Run';
    if (!moving) {
      if (turn) add('PSD_TurnInPlace');
      else if (groundSpeed < 0.2) add('PSD_Idle');
      else add(gait === 0 ? 'PSD_Walk_Stops' : gait === 1 ? 'PSD_Run_Stops' : 'PSD_Sprint_Stops');
    } else {
      if (starting) add(prefix + '_Starts');
      add(prefix);
      if (pivoting) add(prefix + '_Pivots');
      if (!pivoting && spin) add(prefix + '_SpinTransitions');
    }
    if (!cand.length) add('PSD_Run');   // walk / sprint sets are not exported: run gait only
    if (!cand.length) add('PSD_Idle');
    const state = moving ? 1 : 0;
    const stoppedDbChanged = groundSpeed < 0.2 && !cand.includes(curDb);
    const changed = this.prev.gait !== gait || this.prev.state !== state || stoppedDbChanged;

    // ---- query (relative to the current visual root, source units)
    const q = this.query, vr = this.vis;
    const sampleHist = tt => {
      const H = this.hist; if (H.length < 2 || tt <= H[0].t) return H[0];
      for (let i = H.length - 1; i > 0; i--) if (H[i - 1].t <= tt) {
        const a = H[i - 1], b = H[i], u = (tt - a.t) / Math.max(1e-6, b.t - a.t);
        return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, yaw: a.yaw + wrapPi(b.yaw - a.yaw) * u };
      }
      return H[H.length - 1];
    };
    this.traj.length = 0;
    for (let i = 0; i < TRAJ_T.length; i++) {
      const tt = TRAJ_T[i];
      let x, z, yaw;
      if (tt < 0) { const h = sampleHist(tt); x = h.x; z = h.z; yaw = h.yaw; } else { [x, z] = fut(tt); yaw = ext.yaw; }
      const dx = x - vr.x, dz = z - vr.z;
      q[i * 2] = rotX(dx, dz, -vr.yaw) / s; q[i * 2 + 1] = rotZ(dx, dz, -vr.yaw) / s;
      const fy = wrapPi(yaw - vr.yaw); q[8 + i * 2] = Math.sin(fy); q[8 + i * 2 + 1] = Math.cos(fy);
    }
    for (let i = -6; i <= 10; i++) { const tt = i * 0.1; if (tt < 0) { const h = sampleHist(tt); this.traj.push([h.x, h.z, tt]); } else { const f = fut(tt); this.traj.push([f[0], f[1], tt]); } }
    // continuing pose features
    const cf = this.clip.feat;
    const ci = Math.min(this.clip.n - 1, Math.round(this.time * P.hz));
    if (cf) for (let k = 16; k < FDIM; k++) q[k] = cf[ci * FDIM + k];

    // ---- motion matching search
    this.sinceSwitch += dt;
    const norm = P.norm;
    const costAt = (c, i) => {
      const f = c.feat, o = i * FDIM; let sum = 0;
      for (let k = 0; k < FDIM; k++) { const d = (q[k] - f[o + k]) * norm[k]; sum += d * d; }
      return sum;
    };
    let curCost = Infinity;
    const curInCand = this.clip.dbs.some(d => cand.includes(d));
    if (curInCand && cf) {
      curCost = costAt(this.clip, ci) + cfg.continuingBias + (this.clip.loop ? cfg.loopingBias : 0);
      if (!this.clip.loop && this.time > this.clip.len - 0.05) curCost = Infinity; // ran out
    }
    let best = null, bestI = 0, bestCost = Infinity, bestDb = null;
    for (const dbn of cand) for (const c of P.dbs[dbn]) {
      const last = c.loop ? c.n - 1 : c.n - 1 - 6;
      for (let i = 0; i <= last; i++) {
        const cost = costAt(c, i) + (c.loop ? cfg.loopingBias : 0);
        if (cost < bestCost) { bestCost = cost; best = c; bestI = i; bestDb = dbn; }
      }
    }
    const forced = (changed && !curInCand) || (!curInCand) || curCost === Infinity;
    let switched = false;
    if (best && (forced || (bestCost < curCost && this.sinceSwitch >= cfg.minSwitch))) {
      const sameSpot = best === this.clip && Math.abs(bestI / P.hz - this.time) < cfg.poseJump;
      if (!sameSpot) {
        const blend = 0.2;  // MotionBlendTime on the ground
        P.pose(best, bestI / P.hz, this.tmpQ, this.tmpP);
        this.requestInertial(blend);
        this.clip = best; this.time = bestI / P.hz; this.db = bestDb; this.sinceSwitch = 0; switched = true;
        this._switchInertial = true;
      }
    }
    if (!switched && curInCand) {
      // keep the database label honest when the same clip belongs to several sets
      if (!cand.includes(this.db)) this.db = this.clip.dbs.find(d => cand.includes(d)) || this.db;
    }
    this.lastCost = switched ? bestCost : curCost;

    // ---- advance the matched clip and extract its root motion
    const r0 = P.rootAt(this.clip, this.time, [0, 0, 0]);
    let t1 = this.time + dt;
    if (!this.clip.loop) t1 = Math.min(t1, this.clip.len);
    const r1 = P.rootAt(this.clip, t1, [0, 0, 0]);
    this.time = this.clip.loop ? t1 % this.clip.len : t1;
    let ldx = rotX(r1[0] - r0[0], r1[1] - r0[1], -r0[2]) * s, ldz = rotZ(r1[0] - r0[0], r1[1] - r0[1], -r0[2]) * s;
    let dyaw = r1[2] - r0[2];
    if (full) { ldx = ldz = 0; dyaw = 0; }

    // ---- offset root bone (visual root vs capsule)
    if (tMode !== 'LockOffsetAndIgnoreAnimation') { vr.x += rotX(ldx, ldz, vr.yaw); vr.z += rotZ(ldx, ldz, vr.yaw); }
    vr.yaw += dyaw;
    let ox = vr.x - ext.x, oz = vr.z - ext.z;
    if (full) { ox = 0; oz = 0; }
    else if (tMode !== 'LockOffsetAndIgnoreAnimation') { const kk = damp(dt, tHalf); ox *= kk; oz *= kk; }
    const ol = Math.hypot(ox, oz), maxT = cfg.maxOffsetT * s;
    if (ol > maxT) { ox *= maxT / ol; oz *= maxT / ol; }
    vr.x = ext.x + ox; vr.z = ext.z + oz;
    let oy = wrapPi(vr.yaw - ext.yaw);
    if (full) oy = 0;
    else if (moving) oy *= damp(dt, cfg.rotHalfLifeMoving);
    oy = Math.max(-cfg.maxRotError, Math.min(cfg.maxRotError, oy));
    vr.yaw = ext.yaw + oy;

    // ---- evaluate: matched pose, slots, inertialization
    P.pose(this.clip, this.time, this.mmQ, this.mmP);
    const outQ = this.tmpQ, outP = this.tmpP;
    outQ.set(this.mmQ); outP.set(this.mmP);
    const a = this.action;
    if (a) {
      const prevT = a.t;
      a.t += dt * a.rate;
      for (const n of a.clip.notifies) if (!a.fired.has(n.name) && prevT <= n.t && a.t >= n.t) { a.fired.add(n.name); this.events.push(n.name); }
      const len = a.clip.len;
      if (a.t >= len) { if (a.hold) a.t = len; else if (!a.stopping) { a.stopping = true; a.blendOut = 0.15; } }
      if (a.stopping) a.w -= dt / a.blendOut; else a.w = Math.min(1, a.w + dt / a.blendIn);
      if (a.w <= 0) { this.action = null; }
      else {
        P.pose(a.clip, Math.min(a.t, len), this.actQ, this.actP);
        const w = a.w < 1 ? quintic(1 - a.w) * 0 + (a.w * a.w * (3 - 2 * a.w)) : 1;
        if (a.upper) {
          const pel = P.bi.pelvis * 4;
          for (let j = 0; j < UPPER.length; j++) {
            const b = this.upperIdx[j], name = UPPER[j];
            let src = this.actQ;
            if (name === 'spine_01') {
              // mesh-space: keep the action's chest orientation regardless of the legs' pelvis twist
              const ms = new Float32Array(4), ip = new Float32Array(4), loc = new Float32Array(4);
              qmul(ms, this.actQ, pel, this.actQ, b * 4);
              conjInto(ip, 0, outQ, pel);
              qmul(loc, ip, 0, ms, 0);
              qslerp(outQ, b * 4, outQ, b * 4, loc, 0, w * (UPPER_W[name] ?? 1) * 1.0);
              continue;
            }
            qslerp(outQ, b * 4, outQ, b * 4, src, b * 4, w * (UPPER_W[name] ?? 1));
          }
        } else {
          for (let b = 0; b < this.nb; b++) qslerp(outQ, b * 4, outQ, b * 4, this.actQ, b * 4, w);
          for (let kk = 0; kk < 3; kk++) outP[kk] += (this.actP[kk] - outP[kk]) * w;
        }
      }
    }
    if (this._pendingInertial) this._applyPendingInertial(outQ, outP);
    this.inT += dt;
    const wi = quintic(this.inT / this.inDur);
    if (wi > 0) {
      const t = new Float32Array(4);
      for (let b = 0; b < this.nb; b++) {
        qslerp(t, 0, QID, 0, this.inQ, b * 4, wi);
        qmul(this.outQ, t, 0, outQ, b * 4, b * 4);
      }
      for (let kk = 0; kk < 3; kk++) this.outP[kk] = outP[kk] + this.inP[kk] * wi;
    } else { this.outQ.set(outQ); this.outP.set(outP); }

    this.prev.state = state; this.prev.gait = gait;
    Object.assign(this.dbg, {
      groundSpeed, futureSpeed, moving, starting, pivoting, pivotAngle, rootError, spin, turn, cand, changed,
      db: this.db, clip: this.clip.name, time: this.time, cost: this.lastCost, tMode, offset: Math.hypot(ox, oz), offYaw: deg(oy),
      gait, action: this.action ? this.action.name : '', switched,
    });
  }
}
