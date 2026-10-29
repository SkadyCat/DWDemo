import { createWeapons, treasuryVariant } from './weapons.mjs';
import { createBatch as createPortals } from './gate.mjs';
export const meta = Object.freeze({ id: 'projectile-treasury-weapon', name: '宝库兵器', category: '投射物', continuous: true, duration: 1.2, previewHeight: 2.1 });
export function createBatch(T, capacity = 4096) {
  const group = new T.Group(); group.name = meta.id;
  const weapons = createWeapons(T, capacity); group.add(weapons.group);
  const tailGeometry = new T.ConeGeometry(1, 1, 4).rotateX(-Math.PI / 2).translate(0, 0, -.5);
  const tailMaterial = new T.MeshBasicMaterial({ color: 0xffcc68, transparent: true, opacity: .23,
    blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  const tails = new T.InstancedMesh(tailGeometry, tailMaterial, capacity); tails.count = 0; tails.frustumCulled = false;
  tails.instanceMatrix.setUsage(T.DynamicDrawUsage); group.add(tails);
  const matrix = new T.Matrix4(), position = new T.Vector3(), rotation = new T.Quaternion(), scale = new T.Vector3(), direction = new T.Vector3(), forward = new T.Vector3(0, 0, 1);
  function update(rows) {
    const counts = [0, 0, 0]; let total = 0;
    for (const row of rows) {
      if (total >= capacity) break;
      const variant = treasuryVariant(row, total);
      position.set(row.x, row.y ?? .8, row.z); direction.set(row.dx ?? 1, row.dy ?? 0, row.dz ?? 0);
      const speed = direction.length(); if (speed < 1e-8) direction.set(1, 0, 0);
      rotation.setFromUnitVectors(forward, direction.normalize());
      const size = Math.max(.25, Math.min(2, (row.radius ?? .2) * 3)), mesh = weapons.meshes[variant], index = counts[variant]++;
      const launch = row.launch, age = row.age ?? 1;
      // Clip the part still behind the actual portal. No flight delay or visual teleport.
      const distance = launch && age < .2 ? Math.max(0, (row.x - launch.x) * launch.dx + ((row.y ?? .8) - launch.y) * launch.dy + (row.z - launch.z) * launch.dz) / size : 1e6;
      mesh.geometry.attributes.emergeDistance.setX(index, distance);
      scale.setScalar(size); matrix.compose(position, rotation, scale); mesh.setMatrixAt(index, matrix);
      scale.set(size * .12, size * .06, Math.min(2.5, .45 + speed * .045));
      scale.multiplyScalar(Math.min(1, Math.max(0, (age - .04) / .06)));
      position.addScaledVector(direction, -size * 1.65);
      matrix.compose(position, rotation, scale); tails.setMatrixAt(total++, matrix);
    }
    weapons.meshes.forEach((mesh, i) => { mesh.count = counts[i]; mesh.instanceMatrix.needsUpdate = true; mesh.geometry.attributes.emergeDistance.needsUpdate = true; });
    tails.count = total; tails.instanceMatrix.needsUpdate = true;
  }
  let disposed = false;
  return { group, update, dispose() { if (disposed) return; disposed = true; weapons.dispose(); tailGeometry.dispose(); tailMaterial.dispose(); group.clear(); } };
}
export function createEffect(T) {
  const batch = createBatch(T, 48), portals = createPortals(T, 48), group = new T.Group(); group.name = meta.id; group.add(batch.group, portals.group);
  // Seeded visual sample inputs only, at the ten-layer base expectation of 11/s.
  // Combat never calls this demo scheduler; it supplies real carriers to createBatch.
  const sample = (i, salt) => { let n = Math.imul(i + salt, 0x45d9f3b); n = Math.imul(n ^ n >>> 16, 0x45d9f3b); return ((n ^ n >>> 16) >>> 0) / 4294967296; };
  const shots = []; let born = 0;
  for (let i = 1; i <= 96; i++) {
    born += -Math.log(Math.max(1e-7, 1 - sample(i, 37))) / 11; if (born > 2) break;
    const up = sample(i, 83), ring = 1.8 * Math.sqrt(1 - up * up), angle = sample(i, 127) * Math.PI * 2;
    const launch = { x: Math.cos(angle) * ring, y: 2 + 1.8 * up, z: Math.sin(angle) * ring };
    const dx = 6 - launch.x, dy = .7 - launch.y, dz = -2 - launch.z, distance = Math.hypot(dx, dy, dz);
    Object.assign(launch, { dx: dx / distance, dy: dy / distance, dz: dz / distance });
    shots.push({ born, launch, visualSeed: Math.imul(i + 1, 2654435761) >>> 0 });
  }
  return { group, dispose() { batch.dispose(); portals.dispose(); group.clear(); }, update(age) {
    const rows = [], gates = [], time = .5 + age % 3 * .25;
    for (const shot of shots) {
      const t = time - shot.born; if (t < 0 || t >= meta.duration) continue;
      const { launch } = shot;
      rows.push({ ...launch, x: launch.x + launch.dx * t * 22, y: launch.y + launch.dy * t * 22, z: launch.z + launch.dz * t * 22,
        dx: launch.dx * 22, dy: launch.dy * 22, dz: launch.dz * 22, radius: .2, visualSeed: shot.visualSeed, age: t, launch });
      gates.push({ ...launch, radius: .2, age: t, visualSeed: shot.visualSeed });
    }
    batch.update(rows); portals.update(gates);
  } };
}
