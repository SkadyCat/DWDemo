export const meta = Object.freeze({ id: 'projectile-ice-lance', name: '冰晶长锥', category: '投射物', duration: 1.4, continuous: true });
export function createBatch(T, capacity = 4096) {
  const group = new T.Group(); group.name = meta.id;
  const crystal = new T.OctahedronGeometry(1, 0); crystal.rotateX(Math.PI / 2);
  const coreMat = new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const glowMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .13, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  const tailMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .32, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  const tip = new T.InstancedMesh(crystal, coreMat, capacity), glow = new T.InstancedMesh(crystal.clone(), glowMat, capacity), tails = new T.InstancedMesh(new T.ConeGeometry(1, 1, 5).rotateX(-Math.PI / 2).translate(0, 0, -.5), tailMat, capacity);
  for (const mesh of [tip, glow, tails]) { mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); group.add(mesh); }
  const m = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3(), d = new T.Vector3(), fwd = new T.Vector3(0, 0, 1), color = new T.Color(), white = new T.Color(0xffffff);
  function update(rows, time = 0) {
    let n = 0;
    for (const row of rows) {
      if (n >= capacity) break;
      p.set(row.x, row.y ?? .6, row.z); d.set(row.dx ?? 1, row.dy ?? 0, row.dz ?? 0); if (d.lengthSq() < 1e-8) d.set(1, 0, 0);
      const speed = d.length(); q.setFromUnitVectors(fwd, d.normalize()); const r = Math.max(.1, row.radius ?? .22);
      s.set(r * .48, r * .64, r * 2.7); m.compose(p, q, s); tip.setMatrixAt(n, m);
      s.multiplyScalar(1.6); m.compose(p, q, s); glow.setMatrixAt(n, m);
      s.set(r * .65, r * .65, Math.min(2.4, .6 + speed * .035)); m.compose(p, q, s); tails.setMatrixAt(n, m);
      color.setHex([0xff782e, 0x73dcff, 0x9ecbff, 0xe7ca9b, 0x85e934, 0xba74ff][row.element ?? 1] ?? 0x73dcff);
      glow.setColorAt(n, color); tails.setColorAt(n, color); color.lerp(white, .5); tip.setColorAt(n, color);
      n++;
    }
    for (const mesh of [tip, glow, tails]) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }
  let disposed = false;
  function dispose() { if (disposed) return; disposed = true; for (const mesh of [tip, glow, tails]) { mesh.geometry.dispose(); mesh.material.dispose(); } group.clear(); }
  return { group, update, dispose };
}
export function createEffect(T) { const batch = createBatch(T, 1); return { ...batch, update(age) { batch.update([{ x: Math.sin(age * 2) * 1.6, y: .8, z: 0, dx: 24, dz: 0, radius: .24 }], age); } }; }
