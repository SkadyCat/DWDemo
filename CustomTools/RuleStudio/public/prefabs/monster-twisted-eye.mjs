// Presentation only: real monster positions and lifetimes come from the combat simulation.
export function createTwistedEyes(THREE, capacity = 128) {
  const group = new THREE.Group();
  group.name = 'monster-twisted-eyes';
  const body = new THREE.InstancedMesh(new THREE.SphereGeometry(.48, 16, 10),
    new THREE.MeshStandardMaterial({ color: 0xd9b9eb, roughness: .3, emissive: 0x30143e }), capacity);
  const irisGeometry = new THREE.CircleGeometry(.26, 16);
  irisGeometry.translate(0, 0, .485);
  const iris = new THREE.InstancedMesh(irisGeometry, new THREE.MeshBasicMaterial({ color: 0x8b3fe8 }), capacity);
  const pupilGeometry = new THREE.CircleGeometry(.12, 12);
  pupilGeometry.scale(.45, 1.5, 1); pupilGeometry.translate(0, 0, .491);
  const pupil = new THREE.InstancedMesh(pupilGeometry, new THREE.MeshBasicMaterial({ color: 0x160c20 }), capacity);
  const meshes = [body, iris, pupil];
  for (const mesh of meshes) { mesh.count = 0; mesh.frustumCulled = false; group.add(mesh); }
  const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, 1),
    euler = new THREE.Euler(), matrix = new THREE.Matrix4();
  return {
    group,
    update(monsters, time, hero) {
      let count = 0;
      for (const monster of monsters) {
        if (monster.type?.id !== 'twisted_eye' || count >= capacity) continue;
        scale.setScalar(monster.type.scale ?? 1);
        position.set(monster.x / 100, .85 + Math.sin(time * 3 + monster.id) * .08, -monster.y / 100);
        euler.set(0, Math.atan2(hero.x - monster.x, -(hero.y - monster.y)), 0);
        rotation.setFromEuler(euler); matrix.compose(position, rotation, scale);
        for (const mesh of meshes) mesh.setMatrixAt(count, matrix);
        ++count;
      }
      for (const mesh of meshes) { mesh.count = count; mesh.instanceMatrix.needsUpdate = true; }
    },
    dispose() { for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); } group.removeFromParent(); },
  };
}
