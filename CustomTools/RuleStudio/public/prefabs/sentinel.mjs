// 召唤哨卫 (kind "sentinel"). Presentation only. The caller supplies position, aim, remaining time and shot age.
import * as THREE from '/vendor/three.module.js';

export function createSentinel() {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x40566e, metalness: 0.65, roughness: 0.4 });
  const ice = new THREE.MeshStandardMaterial({ color: 0x9de7ff, emissive: 0x1681ba, emissiveIntensity: 0.7, metalness: 0.25, roughness: 0.18 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x7edfff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.5, 0.28, 8), stone);
  base.position.y = 0.14;
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), ice);
  crystal.position.y = 0.72;
  crystal.scale.y = 1.55;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.55, 8), stone);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.94, 0.35);
  const muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 6), ice);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, 0.94, 0.62);
  const rune = new THREE.Mesh(new THREE.RingGeometry(0.47, 0.53, 40), glow);
  rune.rotation.x = -Math.PI / 2;
  rune.position.y = 0.025;
  group.add(base, crystal, barrel, muzzle, rune);
  base.castShadow = crystal.castShadow = barrel.castShadow = true;
  group.visible = false;
  return {
    group,
    update(data, time) {
      group.visible = !!data;
      if (!data) return;
      group.position.set(data.x * 0.01, 0, -data.y * 0.01);
      group.rotation.y = Math.atan2(data.dx, -data.dy);
      group.scale.setScalar(Math.min(1, data.remaining / 0.3));
      const flash = Math.max(0, 1 - data.shotAge / 0.16);
      crystal.rotation.y = time * 1.3;
      ice.emissiveIntensity = 0.7 + flash * 1.8;
      glow.color.setHex(data.hostile ? 0xc07bff : 0x7edfff);
      glow.opacity = 0.45 + Math.sin(time * 4) * 0.1 + flash * 0.3;
      barrel.position.z = 0.35 - flash * 0.08;
      muzzle.position.z = 0.62 - flash * 0.08;
    },
    dispose() {
      group.traverse(object => object.geometry?.dispose());
      stone.dispose(); ice.dispose(); glow.dispose();
    },
  };
}
