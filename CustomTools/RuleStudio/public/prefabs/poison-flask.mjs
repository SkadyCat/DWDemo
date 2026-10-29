// Presentation only. Three.js and plain projectile rows are supplied by the caller.
export function createFlaskProjectiles(T, capacity = 512) {
  const group = new T.Group(); group.name = 'PoisonFlasks';
  const body = new T.SphereGeometry(.15, 12, 8); body.scale(1, 1.3, 1);
  const neck = new T.CylinderGeometry(.055, .075, .14, 8); neck.translate(0, .21, 0);
  const cork = new T.CylinderGeometry(.065, .065, .075, 8); cork.translate(0, .31, 0);
  const liquid = new T.SphereGeometry(.12, 10, 8); liquid.scale(1, .9, 1); liquid.translate(0, -.03, 0);
  const parts = [
    [body, new T.MeshStandardMaterial({ color: 0xb9edb0, transparent: true, opacity: .48, roughness: .15, metalness: .15 })],
    [neck, new T.MeshStandardMaterial({ color: 0x99c7a0, roughness: .25 })],
    [cork, new T.MeshStandardMaterial({ color: 0x73533b, roughness: .9 })],
    [liquid, new T.MeshBasicMaterial({ color: 0x75e12a, toneMapped: false })],
  ].map(([geometry, material]) => {
    const mesh = new T.InstancedMesh(geometry, material, capacity); mesh.count = 0; mesh.frustumCulled = false; group.add(mesh); return mesh;
  });
  const matrix = new T.Matrix4(), rotation = new T.Quaternion(), euler = new T.Euler(), position = new T.Vector3(), scale = new T.Vector3();
  function update(rows) {
    let count = 0;
    for (const row of rows) {
      if (count >= capacity) break;
      position.set(row.x, row.y ?? .6, row.z);
      euler.set(0, Math.atan2(row.vx, -row.vy), .45); rotation.setFromEuler(euler);
      scale.setScalar(Math.max(.7, row.radius / .16)); matrix.compose(position, rotation, scale);
      for (const mesh of parts) mesh.setMatrixAt(count, matrix);
      count++;
    }
    for (const mesh of parts) { mesh.count = count; mesh.instanceMatrix.needsUpdate = true; }
  }
  let disposed = false;
  function dispose() { if (disposed) return; disposed = true; for (const mesh of parts) { mesh.geometry.dispose(); mesh.material.dispose(); } group.clear(); }
  return { group, update, dispose };
}

export function createPoisonBurst(T) {
  const group = new T.Group(); group.name = 'PoisonFlaskBurst';
  const mat = new T.MeshBasicMaterial({ color: 0x83e72e, transparent: true, opacity: .4, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, toneMapped: false });
  const ring = new T.Mesh(new T.RingGeometry(.8, 1, 48), mat); ring.rotation.x = -Math.PI / 2; ring.position.y = .035; group.add(ring);
  const mistMat = mat.clone(); mistMat.color.setHex(0x4a9d23);
  const mist = new T.Mesh(new T.SphereGeometry(1, 18, 10), mistMat); group.add(mist);
  const splashes = new T.InstancedMesh(new T.SphereGeometry(.035, 5, 4), mat, 24); splashes.frustumCulled = false; group.add(splashes);
  const matrix = new T.Matrix4(), position = new T.Vector3(), rotation = new T.Quaternion(), scale = new T.Vector3();
  function update(age) {
    const t = Math.max(0, age), progress = Math.min(1, t / .75), radius = .3 + .7 * Math.sqrt(progress);
    group.visible = t < .75;
    ring.scale.setScalar(radius); mat.opacity = .7 * (1 - progress);
    mist.position.y = .05 + progress * .35; mist.scale.set(radius, .14 + progress * .22, radius); mistMat.opacity = .25 * (1 - progress);
    for (let i = 0; i < 24; i++) {
      const a = i * 2.399963, reach = progress * (.35 + (i % 5) * .13);
      position.set(Math.cos(a) * reach, Math.max(.015, progress * (1 - progress) * (1 + i % 3)), Math.sin(a) * reach);
      scale.setScalar(1 - progress); matrix.compose(position, rotation, scale); splashes.setMatrixAt(i, matrix);
    }
    splashes.instanceMatrix.needsUpdate = true;
  }
  let disposed = false;
  function dispose() { if (disposed) return; disposed = true; ring.geometry.dispose(); mist.geometry.dispose(); splashes.geometry.dispose(); mat.dispose(); mistMat.dispose(); group.clear(); }
  return { group, update, dispose };
}
