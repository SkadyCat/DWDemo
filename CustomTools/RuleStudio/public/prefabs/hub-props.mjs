// 家（夜阙城）的房子和摆设：金殿、灯井、半盏灯酒馆、赛琳的铺子、观星阁、库房、民房、棚屋、暗河码头、
// 集市摊位、长椅、布告板、祈愿龛、路灯、晾衣绳、木箱木桶；NPC 脚下的台子、仓库宝箱。只是画面。
// 每栋房子合并成一个网格（顶点色、平直着色），发光的窗户和灯另合一个；英雄走到房子后面时那栋变半透明。
import * as THREE from '/vendor/three.module.js';
import { POIS } from '../game/town.mjs';

const M = 0.01;
const hash = n => { n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) | 0; n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };
const C = {
  plaster: [0xcbb89a, 0xb8a27e, 0xd4c4a4, 0xc2ab88, 0xa8977c], timber: 0x4a3020, stone: 0x6a6258, stoneDark: 0x4e4840, wood: 0x6b4a2c, plank: 0x8a6a44,
  roof: [0x4a4e5a, 0x8a4a32, 0x55603a, 0x7a5a3a, 0x5a4648], window: 0xffc46a, gold: 0xd8b46a, goldDeep: 0xb8913a, marble: 0xd9d0bf, cloth: [0xa83a32, 0x3a6a9a, 0xc8a038, 0x4a7a44, 0x7a4a8a, 0xd07a3a],
};

/** Collects boxes / cylinders / prisms into one vertex-coloured geometry. */
class Batch {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.m = new THREE.Matrix4(); this.n = new THREE.Matrix3(); this.c = new THREE.Color(); this.v = new THREE.Vector3(); }
  add(geo, color, x, y, z, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    this.m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    this.n.getNormalMatrix(this.m); this.c.setHex(color);
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; ++i) {
      this.v.fromBufferAttribute(P, i).applyMatrix4(this.m); this.pos.push(this.v.x, this.v.y, this.v.z);
      this.v.fromBufferAttribute(N, i).applyMatrix3(this.n).normalize(); this.nor.push(this.v.x, this.v.y, this.v.z);
      this.col.push(this.c.r, this.c.g, this.c.b);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }
  box(w, h, d, color, x, y, z, o) { this.add(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, o); }
  cyl(rt, rb, h, seg, color, x, y, z, o) { this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y + h / 2, z, o); }
  cone(r, h, seg, color, x, y, z, o) { this.add(new THREE.ConeGeometry(r, h, seg), color, x, y + h / 2, z, o); }
  /** Gable roof: ridge along x, width w (x), depth d (z), height h, eaves at y. */
  roof(w, d, h, color, x, y, z, o = {}) {
    const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2);
    this.add(g, color, x, y, z, o);
  }
  get empty() { return !this.pos.length; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}
const litMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .82, metalness: .06 });
const glowMat = () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

// ------------------------------------------------------------------ buildings
/** b: a TOWN_LAYOUT block. Footprint in metres: x0..x1 (east), z0..z1 (z0 = north edge). */
function footprint(b, half) {
  const x0 = b.x * 2 - half, x1 = (b.x + b.w) * 2 - half, z0 = -((b.y + b.h) * 2 - half), z1 = -(b.y * 2 - half);
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, W: x1 - x0, D: z1 - z0 };
}
const DOOR = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };

function house(L, G, f, b, i, tall = 1) {
  const r = k => hash(i * 7919 + k), inset = .25, W = f.W - inset * 2, D = f.D - inset * 2, H = (2.3 + r(1) * .7) * tall;
  const wall = C.plaster[Math.floor(r(2) * C.plaster.length)], roof = C.roof[Math.floor(r(3) * C.roof.length)];
  L.box(W + .1, .45, D + .1, C.stone, f.cx, 0, f.cz);
  L.box(W, H, D, wall, f.cx, .45, f.cz);
  // timber frame: corner posts, a beam under the eaves and one at the floor line
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) L.box(.18, H, .18, C.timber, f.cx + sx * W / 2, .45, f.cz + sz * D / 2);
  for (const sz of [-1, 1]) { L.box(W + .1, .16, .14, C.timber, f.cx, .45 + H - .16, f.cz + sz * D / 2); L.box(W + .1, .14, .14, C.timber, f.cx, .45 + H * .5, f.cz + sz * D / 2); }
  for (const sx of [-1, 1]) L.box(.14, .16, D + .1, C.timber, f.cx + sx * W / 2, .45 + H - .16, f.cz);
  // the roof runs along the longer side
  const along = W >= D, rh = 1.2 + r(4) * .5;
  if (along) L.roof(W + .6, D + .7, rh, roof, f.cx, .45 + H, f.cz); else L.roof(D + .6, W + .7, rh, roof, f.cx, .45 + H, f.cz, { ry: Math.PI / 2 });
  if (r(5) < .7) L.box(.45, rh + .7, .45, C.stoneDark, f.cx + (r(6) - .5) * W * .5, .45 + H, f.cz + (r(7) - .5) * D * .3);
  // door and lit windows on the street side
  const [dx, dz] = DOOR[b.door ?? 's'];
  const front = dz ? { x: f.cx, z: f.cz + dz * (D / 2 + .02), len: W } : { x: f.cx + dx * (W / 2 + .02), z: f.cz, len: D };
  const ry = dz ? 0 : Math.PI / 2;
  L.box(.9, 1.6, .08, C.timber, front.x, .45, front.z, { ry });
  L.box(1.05, .12, .12, C.timber, front.x, .45 + 1.6, front.z, { ry });
  for (const s of [-1, 1]) {
    const off = s * Math.min(front.len * .32, 1.6), wx = dz ? front.x + off : front.x, wz = dz ? front.z : front.z + off;
    G.box(.55, .55, .06, C.window, wx, .45 + 1.1, wz, { ry });
    L.box(.7, .08, .1, C.timber, wx, .45 + 1.05, wz, { ry });
    if (tall > 1.2) G.box(.5, .5, .06, C.window, wx, .45 + H * .72, wz, { ry });
  }
}

function shack(L, G, f, i) {
  const r = k => hash(i * 4271 + k), W = f.W - .5, D = f.D - .5, H = 1.5 + r(1) * .3;
  L.box(W, H, D, r(2) < .5 ? C.plank : C.wood, f.cx, 0, f.cz);
  for (let k = 0; k < 4; ++k) L.box(W + .02, .06, .02, C.timber, f.cx, .3 + k * .35, f.cz + D / 2);
  // lean-to roof of mismatched boards and a cloth patch
  L.box(W + .5, .1, D + .6, C.roof[Math.floor(r(3) * C.roof.length)], f.cx, H + .25, f.cz, { rx: .22 });
  L.box(W * .5, .04, D * .5, C.cloth[Math.floor(r(4) * C.cloth.length)], f.cx + (r(5) - .5), H + .36, f.cz, { rx: .22 });
  L.box(.7, 1.2, .05, 0x2a2018, f.cx + (r(6) - .5) * W * .4, 0, f.cz + D / 2 + .03);
  if (r(7) < .6) G.box(.3, .25, .04, C.window, f.cx - W * .3, .9, f.cz + D / 2 + .04);
}

function tavern(L, G, f, b, i) {
  house(L, G, f, b, i, 1.6);
  // a hanging sign with a half-burnt lamp on it, tables and benches out front
  const z = f.z1 + .6, sx = f.cx + f.W * .32;
  L.box(.08, 2.6, .08, C.timber, sx, 0, z); L.box(1.1, .08, .08, C.timber, sx - .5, 2.5, z);
  L.box(.8, .5, .06, C.wood, sx - .7, 1.85, z); G.cyl(.09, .12, .22, 6, 0xffa84a, sx - .7, 1.6, z + .06);
  for (const ox of [-2.2, -0.2]) { L.box(1.4, .08, .8, C.plank, f.cx + ox, .72, z + 1.1); L.box(.1, .72, .1, C.timber, f.cx + ox, 0, z + 1.1); for (const s of [-1, 1]) L.box(1.3, .06, .3, C.wood, f.cx + ox, .42, z + 1.1 + s * .65); }
}

function forge(L, G, f) {
  // a back wall, a roof on posts, the furnace glowing, an anvil and a quench trough
  const W = f.W - .4, D = f.D - .4, H = 2.8;
  L.box(W, .2, D, C.stoneDark, f.cx, 0, f.cz);
  L.box(W, H, .5, C.stone, f.cx, 0, f.z0 + .45);
  for (const s of [-1, 1]) L.box(.5, H, D, C.stone, f.cx + s * (W / 2 - .25), 0, f.cz);
  // only a lean-to over the back wall, so the furnace and the anvil show from above
  for (const s of [-1, 1]) L.box(.2, H - .3, .2, C.timber, f.cx + s * W * .42, 0, f.z0 + 1.9);
  L.box(W + .4, .12, 2.2, C.roof[1], f.cx, H - .2, f.z0 + 1.05, { rx: -.28 });
  L.box(1.8, 1.3, 1.2, C.stoneDark, f.cx - W * .25, 0, f.z0 + 1.3); G.box(.9, .45, .05, 0xff7a2a, f.cx - W * .25, .45, f.z0 + 1.92);
  L.box(.5, H + 2.2, .5, C.stoneDark, f.cx - W * .25, 0, f.z0 + .7);
  L.box(.7, .55, .35, 0x3a3a40, f.cx + W * .1, 0, f.cz + .6); L.box(1, .2, .4, 0x55585e, f.cx + W * .1, .55, f.cz + .6);
  L.box(1.4, .5, .6, C.wood, f.cx + W * .32, 0, f.cz + .4); G.box(1.2, .04, .45, 0x2a5a7a, f.cx + W * .32, .48, f.cz + .4);
}

function tower(L, G, f) {
  const r = Math.min(f.W, f.D) / 2 - .3, H = 7.5;
  L.cyl(r + .2, r + .35, .6, 8, C.stone, f.cx, 0, f.cz);
  L.cyl(r, r + .1, H, 8, 0x8a8aa0, f.cx, .6, f.cz);
  for (let k = 0; k < 3; ++k) L.cyl(r + .06, r + .06, .18, 8, 0x5a5a72, f.cx, 1.8 + k * 2.1, f.cz);
  L.cone(r + .6, 3, 8, 0x3a3e6a, f.cx, .6 + H, f.cz);
  L.cyl(.12, .2, 2.2, 6, C.gold, f.cx + .6, .6 + H + 1.2, f.cz, { rz: -.6 });   // the telescope pokes out at the cracked dome
  for (let k = 0; k < 6; ++k) { const a = k / 6 * Math.PI * 2 + .3, y = 2.2 + (k % 3) * 2; G.box(.35, .55, .05, 0x9fc8ff, f.cx + Math.sin(a) * (r + .02), y, f.cz + Math.cos(a) * (r + .02), { ry: a }); }
  L.box(.9, 1.7, .1, C.timber, f.cx, .6, f.cz + r + .05);
}

function vault(L, G, f) {
  const W = f.W - .4, D = f.D - .4, H = 3.4;
  L.box(W, H, D, 0x6e655a, f.cx, 0, f.cz);
  for (let k = 0; k < 4; ++k) L.box(W + .04, .1, D + .04, C.stoneDark, f.cx, .7 + k * .8, f.cz);
  L.box(W + .4, .5, D + .4, C.stoneDark, f.cx, H, f.cz);
  // the sealed inner door: gold bands across, a big round lock
  L.box(2.4, 2.6, .2, 0x3a2a18, f.cx, 0, f.z1 + .02);
  for (let k = 0; k < 3; ++k) L.box(2.5, .14, .26, C.gold, f.cx, .5 + k * .8, f.z1 + .04);
  L.cyl(.32, .32, .12, 12, C.gold, f.cx, 1.2, f.z1 + .14, { rx: Math.PI / 2 });
}

function hall(L, G, f) {
  // 金殿: a long gilded hall, columns along the front, broad steps down to the map device
  const W = f.W - .4, D = f.D - .3, H = 5;
  L.box(W + 1, .3, D + 1.6, C.marble, f.cx, 0, f.cz + .4);
  L.box(W - 1, .3, 1.2, C.marble, f.cx, 0, f.z1 + 1.1); L.box(W - 3, .15, .8, C.marble, f.cx, 0, f.z1 + 2);
  L.box(W, H, D - 1.6, 0xb89a62, f.cx, .3, f.cz - .8);
  for (let k = 0; k <= 10; ++k) {
    const x = f.x0 + .6 + k * (W - .8) / 10;
    L.cyl(.3, .36, H, 10, C.marble, x, .3, f.z1 - .4); L.box(.85, .25, .85, C.gold, x, .3 + H - .25, f.z1 - .4); L.box(.8, .2, .8, C.marble, x, .3, f.z1 - .4);
  }
  L.box(W + .6, .5, D + .4, C.goldDeep, f.cx, .3 + H, f.cz);
  L.roof(W + .6, D + .8, 2.2, C.gold, f.cx, .8 + H, f.cz);
  L.box(3, 3.4, .1, 0x2a1a0c, f.cx, .3, f.z1 - 1.65);   // the doors to the deep vaults, shut
  for (let k = 0; k < 3; ++k) L.box(3.1, .12, .14, C.gold, f.cx, .9 + k * 1, f.z1 - 1.6);
  for (const s of [-1, 1]) for (let k = 0; k < 3; ++k) G.box(.6, 1.4, .05, 0xffd27a, f.cx + s * (3 + k * 3.4), 1.6, f.z1 - 1.65);
}

function well(L, G, f) {
  const r = Math.min(f.W, f.D) / 2 - .35;
  L.cyl(r + .35, r + .45, .35, 16, C.stone, f.cx, 0, f.cz);
  L.cyl(r, r + .05, .85, 16, 0x8a8070, f.cx, .35, f.cz);
  for (let k = 0; k < 8; ++k) { const a = k / 8 * Math.PI * 2; L.box(.35, .3, .5, C.stoneDark, f.cx + Math.cos(a) * r, 1.2, f.cz + Math.sin(a) * r, { ry: -a }); }
  // four posts and a gilded ring holding the lamp over the shaft
  for (let k = 0; k < 4; ++k) { const a = k / 4 * Math.PI * 2 + Math.PI / 4; L.cyl(.1, .12, 3.2, 6, C.timber, f.cx + Math.cos(a) * (r - .2), 1.2, f.cz + Math.sin(a) * (r - .2)); }
  L.add(new THREE.TorusGeometry(r - .2, .07, 6, 24), C.gold, f.cx, 4.4, f.cz, { rx: Math.PI / 2 });
  G.cyl(r - .4, r - .4, .05, 16, 0xc8a466, f.cx, 1.0, f.cz);   // the starlight down the shaft
}

function water(L, G, f, i) {
  G.box(f.W, .02, f.D, 0x0e2a3a, f.cx, -.32, f.cz);
  L.box(f.W, .3, .3, C.stoneDark, f.cx, -.3, f.z1 - .15);
  if (i % 2 === 0) {
    // a wooden pier and two little boats
    L.box(1.6, .12, f.D * .8, C.plank, f.cx - f.W * .2, -.05, f.cz + f.D * .1);
    for (const [ox, oz, ry] of [[-.25, -.1, .2], [.12, .05, -.3]]) {
      const x = f.cx + ox * f.W, z = f.cz + oz * f.D;
      L.box(2.4, .35, .9, C.wood, x, -.3, z, { ry }); L.box(2.0, .08, .7, 0x3a2a1a, x, 0, z, { ry });
    }
  }
}

// ------------------------------------------------------------------ small things
function stall(L, x, z, i, faceX) {
  const cl = C.cloth[i % C.cloth.length], cl2 = C.cloth[(i + 2) % C.cloth.length];
  L.box(1.6, .08, .9, C.plank, x, .8, z); L.box(1.5, .8, .08, C.wood, x, 0, z);
  for (const [sx, sz] of [[-.75, -.4], [.75, -.4], [-.75, .4], [.75, .4]]) L.box(.07, 1.9, .07, C.timber, x + sx, 0, z + sz);
  L.box(1.9, .05, 1.3, cl, x, 1.95, z, { rz: faceX * .18 });
  for (let k = 0; k < 5; ++k) L.box(.38, .05, .02, k % 2 ? cl : cl2, x - .76 + k * .38, 1.78, z + .64);
  for (let k = 0; k < 5; ++k) { const h = hash(i * 131 + k); L.box(.22, .14 + h * .1, .22, [0x9a7a3a, 0x6a8a3a, 0xa04a3a, 0xd0c090, 0x7a5a8a][k], x - .6 + k * .3, .88, z + (h - .5) * .4); }
}
function bench(L, x, z) { L.box(1.8, .08, .45, C.plank, x, .42, z); for (const s of [-.75, .75]) L.box(.12, .42, .4, C.timber, x + s, 0, z); }
function lamp(L, G, x, z) { L.cyl(.06, .08, 2.6, 6, 0x2c2a2a, x, 0, z); L.box(.5, .06, .06, 0x2c2a2a, x + .22, 2.5, z); G.box(.22, .3, .22, 0xffc870, x + .42, 2.15, z); }
function crates(L, x, z, i) {
  const r = k => hash(i * 977 + k);
  for (let k = 0; k < 2 + Math.floor(r(0) * 3); ++k) {
    if (r(k + 1) < .5) L.box(.6, .6, .6, C.wood, x + (r(k + 5) - .5) * 1.2, 0, z + (r(k + 9) - .5) * .8, { ry: r(k + 3) });
    else L.cyl(.3, .3, .75, 8, 0x6a4628, x + (r(k + 5) - .5) * 1.2, 0, z + (r(k + 9) - .5) * .8);
  }
}

// ------------------------------------------------------------------ the old hub bits: chest, NPC daises, braziers
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .6, metalness: .2, ...o });
function chest() {
  const g = new THREE.Group(), wood = mat(0x5a3218, { roughness: .8 }), gold = mat(0xd8b46a, { metalness: .85, roughness: .3, emissive: 0x2a1a04 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, .7, .8), wood); body.position.y = .35;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, 1.3, 16, 1, false, 0, Math.PI), wood); lid.rotation.z = Math.PI / 2; lid.position.y = .7;
  g.add(body, lid);
  for (const x of [-.5, 0, .5]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(.09, .72, .84), gold); band.position.set(x, .36, 0);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(.41, .035, 6, 16, Math.PI), gold); arc.rotation.y = Math.PI / 2; arc.position.set(x, .7, 0);
    g.add(band, arc);
  }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(.2, .24, .06), gold); lock.position.set(0, .55, .42); g.add(lock);
  for (const m of g.children) { m.castShadow = true; m.receiveShadow = true; }
  return g;
}
/** run: a hub MapRun (stations + the town dungeon). Returns { group, update(time, hero, night), dispose }. */
export function createHubProps(run) {
  const group = new THREE.Group(), d = run.dungeon, half = d.half * M, lights = [], fades = [];
  const at = (x, y, h = 0) => new THREE.Vector3(x * M, h, -y * M);
  const tile = (tx, ty) => ({ x: tx * 2 - half, z: -(ty * 2 - half) });
  const mk = (L, G, block) => {
    const parts = [];
    if (!L.empty) { const m = new THREE.Mesh(L.geometry(), litMat()); m.castShadow = m.receiveShadow = true; parts.push(m); }
    if (!G.empty) parts.push(new THREE.Mesh(G.geometry(), glowMat()));
    for (const p of parts) group.add(p);
    if (block) fades.push({ parts, f: block });
  };
  // the buildings, one mesh each so the one in front of you can fade
  d.blocks.forEach((b, i) => {
    const L = new Batch(), G = new Batch(), f = footprint(b, half);
    ({ house: () => house(L, G, f, b, i), workshop: () => house(L, G, f, b, i, .85), shack: () => shack(L, G, f, i), tavern: () => tavern(L, G, f, b, i), forge: () => forge(L, G, f),
      tower: () => tower(L, G, f), vault: () => vault(L, G, f), hall: () => hall(L, G, f), well: () => well(L, G, f), water: () => water(L, G, f, i) })[b.kind]?.();
    mk(L, G, b.kind === 'water' || b.kind === 'well' ? null : { ...f, h: b.kind === 'tower' ? 10 : b.kind === 'hall' ? 8 : 4.5 });
    if (b.kind === 'well') {
      const l = new THREE.PointLight(0xffe2a8, 22, 22, 1.3); l.position.set(f.cx, 5, f.cz); group.add(l); lights.push({ l, base: 22, well: true });
      // (no light shaft: from above it reads as a big glass cone)
    }
    if (b.kind === 'forge') { const l = new THREE.PointLight(0xff7a2a, 14, 9, 1.6); l.position.set(f.cx - f.W * .25, 1.2, f.z0 + 2.2); group.add(l); lights.push({ l, base: 14, flicker: true }); }
  });
  // street furniture
  const L = new Batch(), G = new Batch(), poi = Object.fromEntries(POIS.map(p => [p.id, tile(p.x, p.y)]));
  POIS.filter(p => p.id.startsWith('stall_')).forEach((p, i) => { const q = poi[p.id], fx = p.face[0]; stall(L, q.x + fx * 1.2, q.z, i, fx); });
  bench(L, poi.bench_w.x - .2, poi.bench_w.z + .9); bench(L, poi.bench_e.x + .2, poi.bench_e.z - .9);
  { const q = poi.board; L.box(.1, 2.2, .1, C.timber, q.x - .8, 0, q.z - .6); L.box(.1, 2.2, .1, C.timber, q.x + .8, 0, q.z - .6); L.box(1.9, 1.1, .08, C.wood, q.x, 1, q.z - .6);
    for (let k = 0; k < 7; ++k) L.box(.28, .34, .02, [0xe8e0c8, 0xd8ccb0, 0xf0e8d8][k % 3], q.x - .7 + k * .23, 1.2 + (k % 2) * .4, q.z - .55, { rz: (hash(k) - .5) * .3 }); }
  { const q = poi.shrine; L.box(2.2, .3, 1, C.stone, q.x, 0, q.z - .9); L.box(1.6, .3, .7, C.stone, q.x, .3, q.z - .95); L.box(1, .5, .5, C.marble, q.x, .6, q.z - 1);
    for (let k = 0; k < 9; ++k) { const x = q.x - .9 + k * .22, z = q.z - .55 - (k % 2) * .2, y = k % 3 ? .3 : .6, h = .16 + hash(k + 3) * .12; L.cyl(.03, .03, h, 5, 0xe8e0c0, x, y, z); G.box(.04, .06, .04, 0xffb850, x, y + h, z); }
    for (let k = 0; k < 5; ++k) L.box(.14, .14, .14, C.cloth[k], q.x - .4 + k * .2, 1.1, q.z - 1); }
  // street lamps along the main streets and round the plaza
  for (const [tx, ty] of [[18.5, 17], [26.5, 26], [18.5, 26], [26.5, 17], [19, 12], [26, 7], [19, 4], [21, 31], [24.5, 33], [14, 22], [30.5, 22], [12, 30], [33, 30], [9, 15], [33, 8], [30, 15]]) {
    const q = tile(tx, ty); lamp(L, G, q.x, q.z);
  }
  for (const [tx, ty, k] of [[16, 18, 1], [28.5, 19, 2], [17, 33, 3], [29, 33.5, 4], [14.5, 4, 5], [26.5, 3.5, 6], [3, 18, 7], [40, 25, 8], [31.5, 26, 9], [11.5, 15.5, 10], [13.6, 9, 11], [35, 14.8, 12], [40.5, 30, 13], [3.5, 30, 14]]) { const q = tile(tx, ty); crates(L, q.x, q.z, k); }
  // washing lines in the shanty town
  for (const [ax, ay, bx, by] of [[6.5, 6.5, 11, 6], [6, 11.5, 9, 12.5], [10.5, 9, 13.5, 12]]) {
    const a = tile(ax, ay), b = tile(bx, by), len = Math.hypot(b.x - a.x, b.z - a.z), ry = -Math.atan2(b.z - a.z, b.x - a.x);
    L.cyl(.04, .05, 2, 5, C.timber, a.x, 0, a.z); L.cyl(.04, .05, 2, 5, C.timber, b.x, 0, b.z);
    L.box(len, .02, .02, 0x8a8070, (a.x + b.x) / 2, 1.9, (a.z + b.z) / 2, { ry });
    for (let k = 1; k < 5; ++k) { const t = k / 5; L.box(.45, .55, .02, C.cloth[(k * 3 + Math.round(ax)) % C.cloth.length], a.x + (b.x - a.x) * t, 1.35, a.z + (b.z - a.z) * t, { ry }); }
  }
  mk(L, G, null);
  // a few warm lamp lights (the rest only glow)
  for (const [tx, ty, c, p] of [[8, 19.6, 0xffb060, 10], [22.5, 33.5, 0xffd890, 14], [36, 30.5, 0xffd890, 8], [11, 31, 0x9fc0ff, 8], [22.5, 9, 0xffc070, 10], [8, 8, 0xff9a50, 8], [33, 7, 0x9fd0ff, 7]]) {
    const q = tile(tx, ty), l = new THREE.PointLight(c, p, 10, 1.5); l.position.set(q.x, 2.6, q.z); group.add(l); lights.push({ l, base: p, flicker: c === 0xff9a50 });
  }
  // the old hub bits: the stash chest and a dais under each NPC (the street lamps light them now)
  for (const st of run.stations) {
    if (st.id === 'stash') { const ch = chest(); ch.position.copy(at(st.x, st.y)); ch.rotation.y = Math.PI / 3; group.add(ch); }
    if (st.kind === 'npc') {
      const dais = new THREE.Mesh(new THREE.CylinderGeometry(.62, .7, .12, 20), mat(0x3a3024, { roughness: .8 }));
      dais.position.copy(at(st.x, st.y, .06)); dais.receiveShadow = true; group.add(dais);
    }
  }
  const fadeMat = (parts, o) => { for (const p of parts) { const m = p.material, t = o < .99; if (m.transparent !== t) { m.transparent = t; m.depthWrite = !t; m.needsUpdate = true; } m.opacity = o; } };
  return {
    group,
    /** hero: { x, y } in game units; night: 0 day … 1 night (the lamp turned down). */
    update(time, hero, night = 0) {
      for (const L of lights) {
        const k = L.well ? 1 + night * .35 : 1 + night * .5;
        L.l.intensity = L.base * k * (L.flicker ? .85 + .15 * Math.sin(time * 9 + L.base) + .08 * Math.sin(time * 23) : 1);
      }
      if (!hero) return;
      // a building between the camera (south) and you goes see-through
      const hx = hero.x * M, hz = -hero.y * M;
      for (const F of fades) {
        const f = F.f, hide = hx > f.x0 - .8 && hx < f.x1 + .8 && hz < f.z1 + .2 && hz > f.z0 - f.h * .75;
        F.o = (F.o ?? 1) + ((hide ? .28 : 1) - (F.o ?? 1)) * .15;
        fadeMat(F.parts, F.o);
      }
    },
    dispose() { group.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); }); group.removeFromParent(); },
  };
}
