// Standalone sentinel appearance; all position/aim/lifetime handling belongs to the caller.
export const meta = Object.freeze({ id: 'summon-sentinel', name: '冰晶哨卫', category: '召唤物', continuous: true, duration: 3 });
export function createEffect(T) {
  const group = new T.Group(); group.name = meta.id;
  const stone = new T.MeshStandardMaterial({ color: 0x344c6b, metalness: .65, roughness: .35 });
  const ice = new T.MeshStandardMaterial({ color: 0xb6f2ff, emissive: 0x188bd1, emissiveIntensity: 1, metalness: .3, roughness: .16 });
  const glow = new T.MeshBasicMaterial({ color: 0x56ceff, transparent: true, opacity: .65, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });
  const base = new T.Mesh(new T.CylinderGeometry(.36, .5, .28, 8), stone); base.position.y = .14;
  const crystal = new T.Mesh(new T.OctahedronGeometry(.34), ice); crystal.scale.y = 1.55; crystal.position.y = .85;
  const barrel = new T.Mesh(new T.CylinderGeometry(.13, .21, .55, 8), stone); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, .94, .35);
  const muzzle = new T.Mesh(new T.TorusGeometry(.14, .025, 6, 24), glow); muzzle.position.set(0, .94, .64);
  const halo = new T.Mesh(new T.RingGeometry(.58, .61, 64), glow); halo.rotation.x = -Math.PI / 2; halo.position.y = .04;
  const crown = new T.Group(); crown.position.y = .7;
  for (let i = 0; i < 6; i++) { const shard = new T.Mesh(new T.OctahedronGeometry(.07), ice); const a = i / 6 * Math.PI * 2; shard.position.set(Math.cos(a) * .42, .12 * Math.sin(a), Math.sin(a) * .42); shard.scale.y = 2.6; crown.add(shard); }
  const sigil = new T.Mesh(new T.RingGeometry(.37, .44, 6), glow); sigil.rotation.x = -Math.PI / 2; sigil.position.y = .035;
  group.add(base, crystal, barrel, muzzle, halo, crown, sigil);
  function update(age, data = {}) {
    group.visible = data.visible !== false;
    const flash = Math.max(0, 1 - (data.shotAge ?? 1) / .16);
    crystal.rotation.y = age * 1.3; crystal.position.y = .85 + Math.sin(age * 2.5) * .04;
    crown.rotation.y = -age * .7; halo.rotation.z = age * .4; sigil.rotation.z = -age * .6;
    ice.emissiveIntensity = 1 + flash * 2; glow.opacity = .5 + Math.sin(age * 4) * .12 + flash * .35;
    muzzle.scale.setScalar(1 + flash * .65); barrel.position.z = .35 - flash * .08;
  }
  let disposed = false;
  function dispose() { if (disposed) return; disposed = true; group.traverse(o => o.geometry?.dispose()); stone.dispose(); ice.dispose(); glow.dispose(); group.clear(); }
  update(0); return { group, update, dispose };
}
