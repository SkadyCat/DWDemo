// No game imports: endpoints are local Three.js coordinates supplied by the presenter.
export const meta = Object.freeze({ id: 'lightning-chain', name: '连锁电弧', category: '雷电', duration: .38 });
export function createEffect(T, options = {}) {
  const group = new T.Group(); group.name = meta.id;
  const geometry = new T.CylinderGeometry(1, 1, 1, 5);
  const coreMaterial = new T.MeshBasicMaterial({ color: 0xecfaff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });
  const haloMaterial = coreMaterial.clone(); haloMaterial.color.setHex(0x417cff);
  const core = new T.InstancedMesh(geometry, coreMaterial, 48), halo = new T.InstancedMesh(geometry, haloMaterial, 48);
  core.frustumCulled = halo.frustumCulled = false; group.add(core, halo);
  const a = new T.Vector3(), b = new T.Vector3(), center = new T.Vector3(), d = new T.Vector3(), up = new T.Vector3(0, 1, 0), scale = new T.Vector3(), q = new T.Quaternion(), m = new T.Matrix4();
  const noise = n => Math.sin(n * 127.1 + 3.7) * Math.cos(n * 33.7);
  function update(age, data = {}) {
    group.visible = age < meta.duration;
    const from = data.from ?? options.from ?? { x: -2, y: .8, z: 0 }, to = data.to ?? options.to ?? { x: 2, y: .8, z: 0 };
    const tick = Math.floor(age * 35), fade = Math.exp(-Math.max(0, age - .06) * 13);
    coreMaterial.opacity = fade; haloMaterial.opacity = fade * .18;
    let n = 0;
    for (let branch = 0; branch < 3; branch++) {
      const count = 16;
      for (let i = 0; i < count; i++) {
        for (const [point, j] of [[a, i], [b, i + 1]]) {
          const u = j / count, jitter = Math.sin(u * Math.PI) * (branch ? .28 : .14), seed = j + tick * 17 + branch * 41;
          point.set(from.x + (to.x - from.x) * u + noise(seed) * jitter, from.y + (to.y - from.y) * u + noise(seed + 70) * jitter, from.z + (to.z - from.z) * u + noise(seed + 110) * jitter);
        }
        center.copy(a).add(b).multiplyScalar(.5); d.copy(b).sub(a); const length = Math.max(.001, d.length()); q.setFromUnitVectors(up, d.normalize());
        const width = branch ? .009 : .023;
        scale.set(width, length, width); m.compose(center, q, scale); core.setMatrixAt(n, m);
        scale.set(width * 5, length, width * 5); m.compose(center, q, scale); halo.setMatrixAt(n++, m);
      }
    }
    core.count = halo.count = n; core.instanceMatrix.needsUpdate = halo.instanceMatrix.needsUpdate = true;
  }
  let disposed = false;
  function dispose() { if (disposed) return; disposed = true; geometry.dispose(); coreMaterial.dispose(); haloMaterial.dispose(); group.clear(); }
  update(0); return { group, update, dispose };
}
