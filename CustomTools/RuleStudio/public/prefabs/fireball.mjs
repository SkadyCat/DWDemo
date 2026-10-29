export const meta = Object.freeze({ id: 'projectile-fireball', name: '炽焰火球', category: '投射物', duration: 1.6, continuous: true });

export function createBatch(T, capacity = 4096) {
  const group = new T.Group(); group.name = meta.id;
  const coreMat = new T.MeshBasicMaterial({ color: 0xffe6a0, toneMapped: false });
  const flameMat = new T.MeshBasicMaterial({ color: 0xff7a18, transparent: true, opacity: .65, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glowMat = new T.MeshBasicMaterial({ color: 0xff4810, transparent: true, opacity: .16, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  const core = new T.InstancedMesh(new T.IcosahedronGeometry(1, 1), coreMat, capacity);
  const flame = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), flameMat, capacity);
  const glow = new T.InstancedMesh(new T.SphereGeometry(1, 10, 6), glowMat, capacity);
  const trail = new T.InstancedMesh(new T.ConeGeometry(1, 1, 7).rotateX(Math.PI / 2).translate(0, 0, -.5), flameMat, capacity);
  const meshes = [core, flame, glow, trail];
  for (const mesh of meshes) { mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); group.add(mesh); }
  const matrix = new T.Matrix4(), position = new T.Vector3(), rotation = new T.Quaternion(), scale = new T.Vector3();
  const direction = new T.Vector3(), forward = new T.Vector3(0, 0, 1);
  function update(rows, time = 0) {
    let count = 0;
    for (const row of rows) {
      if (count >= capacity) break;
      position.set(row.x, row.y ?? .6, row.z);
      direction.set(row.dx ?? 1, row.dy ?? 0, row.dz ?? 0);
      if (direction.lengthSq() < 1e-8) direction.set(1, 0, 0);
      const speed = direction.length(), radius = Math.max(.12, row.radius ?? .2);
      rotation.setFromUnitVectors(forward, direction.normalize());
      scale.setScalar(radius); matrix.compose(position, rotation, scale); core.setMatrixAt(count, matrix);
      const pulse = 1.35 + .12 * Math.sin(time * 19 + count * 2.3);
      scale.set(radius * pulse, radius * pulse, radius * 1.8); matrix.compose(position, rotation, scale); flame.setMatrixAt(count, matrix);
      scale.setScalar(radius * 2.2); matrix.compose(position, rotation, scale); glow.setMatrixAt(count, matrix);
      scale.set(radius * .85, radius * .85, Math.min(2.4, .5 + speed * .045)); matrix.compose(position, rotation, scale); trail.setMatrixAt(count, matrix);
      count++;
    }
    for (const mesh of meshes) { mesh.count = count; mesh.instanceMatrix.needsUpdate = true; }
  }
  let disposed = false;
  function dispose() {
    if (disposed) return; disposed = true;
    for (const mesh of meshes) mesh.geometry.dispose();
    for (const material of [coreMat, flameMat, glowMat]) material.dispose();
    group.clear();
  }
  return { group, update, dispose };
}

export function createEffect(T) {
  const batch = createBatch(T, 1);
  return { ...batch, update(age) { batch.update([{ x: Math.sin(age * 2) * 1.6, y: .8, z: 0, dx: 18, dz: 0, radius: .25 }], age); } };
}
