// Standalone presentation prefab. Pass Three.js; the caller owns placement and time.
export const meta = Object.freeze({ id: 'death-lightning', name: '死亡落雷', english: 'THUNDER STRIKE', category: '落雷', element: '闪电', color: '#a8cdff', icon: 'ϟ', duration: 0.8, previewTarget: true, description: '从空中直劈目标的白蓝雷柱，带分叉电弧、落点闪光和沿圆形伤害范围扩散的地面电流。' });

export function createEffect(T, options = {}) {
  const group = new T.Group(); group.name = 'DeathLightningStrike'; group.scale.setScalar(options.scale ?? 1);
  const rand = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const material = (color, opacity = 1) => new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, side: T.DoubleSide });
  const coreMat = material(0xf0f8ff), haloMat = material(0x408dff), arcMat = material(0x99d9ff);
  const cylinder = new T.CylinderGeometry(1, 1, 1, 6);
  const segments = 44;
  const core = new T.InstancedMesh(cylinder, coreMat, segments), halo = new T.InstancedMesh(cylinder, haloMat, segments);
  core.frustumCulled = halo.frustumCulled = false; group.add(core, halo);
  const arcCount = 40;
  const arcs = new T.InstancedMesh(cylinder, arcMat, arcCount); arcs.frustumCulled = false; group.add(arcs);
  const flashMat = material(0xc9ecff), flash = new T.Mesh(new T.SphereGeometry(0.3, 14, 10), flashMat);
  flash.position.y = 0.25; group.add(flash);
  const discMat = material(0x398bff), disc = new T.Mesh(new T.CircleGeometry(1, 48), discMat);
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.035; group.add(disc);
  const ringMat = material(0xb7e7ff), ring = new T.Mesh(new T.RingGeometry(0.92, 1, 64), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.045; group.add(ring);
  const count = 52, positions = new Float32Array(count * 3);
  const sparkGeo = new T.BufferGeometry(); sparkGeo.setAttribute('position', new T.BufferAttribute(positions, 3));
  const sparkMat = new T.PointsMaterial({ color: 0xccecff, size: 0.065, transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
  const sparks = new T.Points(sparkGeo, sparkMat); sparks.frustumCulled = false; group.add(sparks);
  const up = new T.Vector3(0, 1, 0), center = new T.Vector3(), direction = new T.Vector3(), scale = new T.Vector3(), rotation = new T.Quaternion(), matrix = new T.Matrix4();
  function segment(mesh, index, a, b, width) {
    center.copy(a).add(b).multiplyScalar(0.5); direction.copy(b).sub(a);
    const length = Math.max(0.001, direction.length());
    rotation.setFromUnitVectors(up, direction.normalize()); scale.set(width, length, width);
    matrix.compose(center, rotation, scale); mesh.setMatrixAt(index, matrix);
  }
  function update(time) {
    const t = Math.max(0, time), tick = Math.floor(t * 35), envelope = Math.exp(-Math.max(0, t - 0.14) * 9);
    group.visible = t < meta.duration;
    coreMat.opacity = envelope; haloMat.opacity = envelope * 0.26;
    let used = 0;
    for (let path = 0; path < 4; path++) {
      const n = path === 0 ? 20 : 8;
      const points = [];
      const angle = path * 2.39996, branch = path !== 0, height = branch ? 5 + rand(path) * 3 : 12;
      for (let j = 0; j <= n; j++) {
        const u = j / n, jitter = Math.sin(u * Math.PI) * (branch ? 0.34 : 0.75);
        const spread = branch ? u * (0.45 + rand(path + 2) * 0.8) : 0;
        points.push(new T.Vector3(Math.cos(angle) * spread + (rand(j + tick * 91 + path * 7) - 0.5) * jitter,
          0.16 + height * (1 - u), Math.sin(angle) * spread + (rand(j * 7 + tick * 13 + path) - 0.5) * jitter));
      }
      for (let j = 0; j < n; j++, used++) {
        segment(core, used, points[j], points[j + 1], branch ? 0.018 : 0.045);
        segment(halo, used, points[j], points[j + 1], branch ? 0.065 : 0.16);
      }
    }
    core.instanceMatrix.needsUpdate = halo.instanceMatrix.needsUpdate = true;
    const reveal = Math.min(1, 0.15 + t * 7);
    for (let i = 0; i < 8; i++) {
      const points = [], angle = i * 2.39996;
      for (let j = 0; j <= 5; j++) {
        const r = j / 5 * reveal, a = angle + (rand(i * 31 + j + tick * 17) - 0.5) * 0.35;
        points.push(new T.Vector3(Math.cos(a) * r, 0.09 + rand(i + j) * 0.07, Math.sin(a) * r));
      }
      for (let j = 0; j < 5; j++) segment(arcs, i * 5 + j, points[j], points[j + 1], 0.016);
    }
    arcs.instanceMatrix.needsUpdate = true; arcMat.opacity = Math.exp(-t * 5);
    flash.scale.setScalar(0.8 + t * 5); flashMat.opacity = Math.exp(-t * 13);
    disc.scale.setScalar(reveal); discMat.opacity = Math.exp(-t * 10) * 0.35;
    ring.scale.setScalar(reveal); ringMat.opacity = Math.exp(-t * 6) * 0.8;
    for (let i = 0; i < count; i++) {
      const a = rand(i + 6) * Math.PI * 2, speed = 0.4 + rand(i + 40) * 2.5;
      positions[i * 3] = Math.cos(a) * t * speed;
      positions[i * 3 + 1] = Math.max(0.06, 0.2 + t * (1 + rand(i + 11) * 2.5) - 3 * t * t);
      positions[i * 3 + 2] = Math.sin(a) * t * speed;
    }
    sparkGeo.attributes.position.needsUpdate = true; sparkMat.opacity = Math.exp(-t * 4);
  }
  let disposed = false;
  function dispose() {
    if (disposed) return; disposed = true;
    const geometries = new Set(), materials = new Set();
    group.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) materials.add(o.material); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); group.clear();
  }
  return { group, update, reset: () => update(0), dispose };
}
