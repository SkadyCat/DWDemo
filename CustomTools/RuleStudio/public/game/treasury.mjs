// 宝库之门的兵器：低多边形的剑、矛、斧、戟、大剑（金柄、银刃、红宝石），每种一个实例化网格。
// 每扇门里探出一件兵器，尖端指着点的位置；射出去的宝具是同一种兵器，从门的高度斜着扎向目标。
import * as THREE from '../vendor/three.module.js';

const M = 0.01, CAP = 240, SCALE = 0.62;
const GOLD = [0.95, 0.7, 0.22], DARK = [0.25, 0.12, 0.08], STEEL = [0.86, 0.88, 0.92], GEM = [0.85, 0.05, 0.08], RED = [0.6, 0.04, 0.06];

/** Merge simple parts (geometry, colour, matrix) into one non-indexed geometry with vertex colours. Weapons point along +Z, butt at 0. */
function build(parts) {
  const pos = [], nor = [], col = [];
  for (const [g0, c, mat] of parts) {
    const g = (g0.index ? g0.toNonIndexed() : g0).applyMatrix4(mat);
    g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); col.push(...c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
const T = (x, y, z, rx = 0, ry = 0, rz = 0, s = [1, 1, 1]) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(...s));
const along = (geo) => geo.rotateX(Math.PI / 2);   // cylinders / cones are built along Y; turn them onto Z
const cyl = (r, l, seg = 6) => along(new THREE.CylinderGeometry(r, r, l, seg));
const cone = (r, l, seg = 4) => along(new THREE.ConeGeometry(r, l, seg));
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const ball = r => new THREE.IcosahedronGeometry(r, 0);

function sword(scale = 1) {
  const s = scale;
  return build([
    [ball(0.05 * s), GOLD, T(0, 0, 0.0)],
    [cyl(0.028 * s, 0.24 * s), DARK, T(0, 0, 0.13 * s)],
    [box(0.36 * s, 0.05 * s, 0.07 * s), GOLD, T(0, 0, 0.27 * s)],
    [ball(0.035 * s), GEM, T(0, 0.03 * s, 0.27 * s)],
    [box(0.11 * s, 0.022 * s, 0.95 * s), STEEL, T(0, 0, 0.78 * s)],
    [box(0.03 * s, 0.03 * s, 0.9 * s), GOLD, T(0, 0, 0.74 * s)],
    [cone(0.078 * s, 0.28 * s), STEEL, T(0, 0, 1.39 * s, 0, 0, Math.PI / 4, [1, 0.28, 1])],
  ]);
}
function spear() {
  return build([
    [cyl(0.024, 1.6), [0.55, 0.38, 0.14], T(0, 0, 0.8)],
    [cyl(0.04, 0.12, 8), GOLD, T(0, 0, 1.58)],
    [ball(0.03), GEM, T(0, 0.04, 1.58)],
    [cone(0.075, 0.46), STEEL, T(0, 0, 1.87, 0, 0, Math.PI / 4, [1, 0.35, 1])],
    [box(0.24, 0.02, 0.05), GOLD, T(0, 0, 1.66)],
  ]);
}
function axe(halberd = false) {
  const L = halberd ? 1.7 : 1.3;
  const parts = [
    [cyl(0.026, L), [0.5, 0.34, 0.14], T(0, 0, L / 2)],
    [cyl(0.045, 0.14, 8), GOLD, T(0, 0, L - 0.22)],
    // a crescent blade on both sides: two wide wedges, slightly swept back
    [box(0.42, 0.025, 0.3), STEEL, T(0.23, 0, L - 0.22, 0, 0, 0, [1, 1, 1])],
    [box(0.42, 0.025, 0.3), STEEL, T(-0.23, 0, L - 0.22)],
    [box(0.06, 0.04, 0.36), GOLD, T(0.44, 0, L - 0.22)],
    [box(0.06, 0.04, 0.36), GOLD, T(-0.44, 0, L - 0.22)],
    [ball(0.04), GEM, T(0, 0.04, L - 0.22)],
    [box(0.04, 0.12, 0.02), RED, T(0, -0.08, L - 0.42)],   // the red tassel
  ];
  if (halberd) parts.push([cone(0.06, 0.4), STEEL, T(0, 0, L + 0.08, 0, 0, Math.PI / 4, [1, 0.35, 1])]);
  return build(parts);
}
const KINDS = [() => sword(1), () => spear(), () => axe(false), () => axe(true), () => sword(1.45)];
// Length of each weapon, for how far it pokes out of its gate.
const LENGTH = [1.45, 2.1, 1.35, 1.8, 2.1];

const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
/** Height (m) of a gate in the air, and its size: higher and bigger the further back it sits. */
export const gateLook = id => ({ h: 1.7 + hash(id) * 2.6, size: 0.75 + hash(id + 7) * 0.7, weapon: Math.floor(hash(id * 3.7 + 11) * KINDS.length) % KINDS.length });

export class Treasury {
  constructor(scene) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.38, flatShading: true, emissive: 0x120b02 });
    this.meshes = KINDS.map(make => { const m = new THREE.InstancedMesh(make(), mat, CAP); m.count = 0; m.frustumCulled = false; scene.add(m); return m; });
    this.heights = new Map();   // projectile id -> [start height, kind]
    this.tmp = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), d: new THREE.Vector3(), s: new THREE.Vector3(), z: new THREE.Vector3(0, 0, 1) };
  }
  place(kind, x, h, z, dir, scale = 1) {
    const mesh = this.meshes[kind]; if (mesh.count >= CAP) return;
    const { m, q, p, s, z: Z } = this.tmp;
    q.setFromUnitVectors(Z, dir); p.set(x, h, z); s.setScalar(scale * SCALE);
    mesh.setMatrixAt(mesh.count++, m.compose(p, q, s));
  }
  update(run, time) {
    for (const mesh of this.meshes) mesh.count = 0;
    const gates = run.zones().filter(z => z.kind === 'gate');
    const { d } = this.tmp;
    // a weapon poking out of every gate, its tip on the clicked point; it slides out as the gate opens
    for (const g of gates) {
      const look = gateLook(g.id), gx = g.x * M, gz = -g.y * M, ax = (g.aimX ?? g.x) * M, az = -(g.aimY ?? g.y) * M;
      d.set(ax - gx, 0.8 - look.h, az - gz).normalize();
      const L = LENGTH[look.weapon] * look.size * SCALE, out = Math.min(1, (g.age ?? 1) * 4) * 0.55 * L, back = L - out;
      this.place(look.weapon, gx - d.x * back, look.h - d.y * back, gz - d.z * back, d, look.size);
    }
    // flying treasures: start at the height of the gate they came from, dive onto the target
    const live = new Set();
    for (const p of run.projectiles()) {
      if (p.kind !== 'treasure') continue;
      live.add(p.id);
      let st = this.heights.get(p.id);
      if (!st) {
        let best = null, bd = 90;
        for (const g of gates) { const dd = Math.hypot(g.x - p.x, g.y - p.y); if (dd < bd) { bd = dd; best = g; } }
        const look = best ? gateLook(best.id) : { h: 3.2, weapon: Math.floor(hash(p.id) * KINDS.length) % KINDS.length, size: 0.9 };
        st = [look.h, look.weapon, look.size]; this.heights.set(p.id, st);
      }
      const k = Math.max(0, 1 - (p.age ?? 0) / 0.26), h = 0.75 + (st[0] - 0.75) * k;
      d.set(p.vx * M, k > 0 ? -(st[0] - 0.75) / 0.26 : 0, -p.vy * M).normalize();
      const L = LENGTH[st[1]] * st[2] * SCALE;
      this.place(st[1], p.x * M - d.x * L, h - d.y * L, -p.y * M - d.z * L, d, st[2]);
    }
    for (const id of this.heights.keys()) if (!live.has(id)) this.heights.delete(id);
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { for (const m of this.meshes) { m.geometry.dispose(); m.removeFromParent(); } }
}
