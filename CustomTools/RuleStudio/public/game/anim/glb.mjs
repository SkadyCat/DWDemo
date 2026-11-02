// 低多边形角色的 glb（DWEngine Tools/LowPoly 生成器导出的格式）：一个蒙皮网格、按材质分的若干 primitive、
// 关节静止旋转全是单位四元数。读进来时把材质的底色烘进顶点色、合并成一个几何体，一个角色只占一次绘制调用；
// 几何体在同一种模型的所有实例之间共享，每个实例只有自己的骨骼。
import * as THREE from '../../vendor/three.module.js';

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function parse(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('不是 glb');
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
    else if (type === 0x004e4942) bin = new Uint8Array(buf, off + 8, len);
    off += 8 + len;
  }
  const read = i => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView], C = COMP[a.componentType], n = SIZE[a.type];
    const stride = v.byteStride ?? 0, start = bin.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    if (!stride || stride === n * C.BYTES_PER_ELEMENT) return { data: new C(bin.buffer.slice(start, start + a.count * n * C.BYTES_PER_ELEMENT)), n, count: a.count, normalized: !!a.normalized };
    const out = new C(a.count * n), src = new DataView(bin.buffer, start);
    for (let k = 0; k < a.count; ++k) for (let c = 0; c < n; ++c) {
      const o = k * stride + c * C.BYTES_PER_ELEMENT;
      out[k * n + c] = C === Float32Array ? src.getFloat32(o, true) : C === Uint16Array ? src.getUint16(o, true) : C === Uint8Array ? src.getUint8(o) : src.getUint32(o, true);
    }
    return { data: out, n, count: a.count, normalized: !!a.normalized };
  };
  return { json, read };
}

/** Load a character template: shared geometry (base colours baked into vertex colours) + its bind skeleton. */
export async function loadCharacter(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(`模型 ${url}: HTTP ${r.status}`);
  const { json, read } = parse(await r.arrayBuffer());
  const meshNode = json.nodes.find(n => n.mesh !== undefined && n.skin !== undefined);
  const skin = json.skins[meshNode.skin], prims = json.meshes[meshNode.mesh].primitives;
  const pos = [], nor = [], col = [], jnt = [], wgt = [];
  let transparent = false;
  for (const p of prims) {
    const P = read(p.attributes.POSITION), N = read(p.attributes.NORMAL), J = read(p.attributes.JOINTS_0), W = read(p.attributes.WEIGHTS_0);
    const mat = json.materials?.[p.material], base = mat?.pbrMetallicRoughness?.baseColorFactor ?? [0.6, 0.6, 0.6, 1];
    if (mat?.alphaMode === 'BLEND') transparent = true;
    const idx = p.indices !== undefined ? read(p.indices).data : null, count = idx ? idx.length : P.count;
    const wScale = W.normalized ? (W.data instanceof Uint8Array ? 1 / 255 : 1 / 65535) : 1;
    for (let k = 0; k < count; ++k) {
      const v = idx ? idx[k] : k;
      pos.push(P.data[v * 3], P.data[v * 3 + 1], P.data[v * 3 + 2]);
      nor.push(N.data[v * 3], N.data[v * 3 + 1], N.data[v * 3 + 2]);
      col.push(base[0], base[1], base[2]);
      for (let c = 0; c < 4; ++c) { jnt.push(J.data[v * 4 + c]); wgt.push(W.data[v * 4 + c] * wScale); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(jnt, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgt, 4));
  geo.computeBoundingBox();
  // Joint hierarchy in joint order, with rest translations (rest rotations are identity).
  const nodeToJoint = new Map(skin.joints.map((n, i) => [n, i]));
  const parent = new Array(skin.joints.length).fill(-1);
  skin.joints.forEach((n, i) => { for (const c of json.nodes[n].children ?? []) if (nodeToJoint.has(c)) parent[nodeToJoint.get(c)] = i; });
  const ibm = read(skin.inverseBindMatrices).data;
  const joints = skin.joints.map((n, i) => {
    const node = json.nodes[n];
    return { name: node.name, parent: parent[i], t: node.translation ?? [0, 0, 0], r: node.rotation ?? [0, 0, 0, 1], inverse: new THREE.Matrix4().fromArray(ibm, i * 16) };
  });
  const height = geo.boundingBox.max.y - geo.boundingBox.min.y;
  return { url, geometry: geo, joints, transparent, height };
}

/** One posable copy of a template. material: shared or per-instance (tints). */
export function instantiate(tpl, material) {
  const bones = tpl.joints.map(j => { const b = new THREE.Bone(); b.name = j.name; b.position.fromArray(j.t); b.quaternion.fromArray(j.r); return b; });
  const root = new THREE.Group();
  tpl.joints.forEach((j, i) => (j.parent >= 0 ? bones[j.parent] : root).add(bones[i]));
  const mesh = new THREE.SkinnedMesh(tpl.geometry, material);
  mesh.castShadow = true; mesh.frustumCulled = false;
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones, tpl.joints.map(j => j.inverse.clone())));
  const byName = Object.fromEntries(bones.map(b => [b.name, b]));
  return { root, mesh, bones: byName, list: bones, rest: Object.fromEntries(tpl.joints.map((j, i) => [j.name, bones[i].position.clone()])) };
}

/** The look of the low-poly set: flat-shaded, colour from the baked vertex colours. */
export function characterMaterial(tpl, extra = {}) {
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.72, metalness: 0.05,
    transparent: tpl.transparent, opacity: tpl.transparent ? 0.82 : 1, depthWrite: !tpl.transparent, ...extra });
}
