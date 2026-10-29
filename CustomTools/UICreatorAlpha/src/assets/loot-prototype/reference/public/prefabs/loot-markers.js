// Standalone loot presentation: plain meter-space rows + a pausable clock; no gameplay imports.
import { lootStyle } from './loot-style.js';
const clamp = n => Math.max(0, Math.min(1, n));
export const meta = Object.freeze({ id: 'loot-burst', name: '掉落喷散', category: '掉落', duration: 2.2 });
function seedOf(key) {
  let n = 2166136261;
  for (const char of String(key)) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return (n >>> 0) / 4294967296;
}
function trajectory(row, age, seed, flight, ground = .13) {
  const u = clamp(age / flight), start = .48, peak = 1.65 + seed * .8;
  const bounce = age > flight && age < flight + .2 ? Math.sin((age - flight) / .2 * Math.PI) * .13 : 0;
  return {
    x: (row.sourceX ?? row.x) + (row.x - (row.sourceX ?? row.x)) * u,
    y: start * (1 - u) + ground * u + 4 * peak * u * (1 - u) + bounce,
    z: (row.sourceZ ?? row.z) + (row.z - (row.sourceZ ?? row.z)) * u,
    landed: age >= flight + .2,
  };
}

export function createLootMarkers(T, capacity = 600) {
  const group = new T.Group(); group.name = 'GroundLoot';
  const births = new Map(), anchors = new Map();
  const metal = new T.MeshStandardMaterial({ metalness: .45, roughness: .3 });
  const additive = opacity => new T.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });
  function batch(name, geometry, material, limit = capacity) {
    const mesh = new T.InstancedMesh(geometry, material, limit);
    mesh.name = name; mesh.count = 0; mesh.frustumCulled = false; group.add(mesh); return mesh;
  }
  const gear = batch('Equipment', new T.BoxGeometry(.28, .13, .2), metal);
  const items = batch('Items', new T.OctahedronGeometry(.14), metal);
  const beams = batch('LootBeams', new T.CylinderGeometry(.022, .055, 1, 6), additive(.13));
  const shadows = batch('LootShadows', new T.CircleGeometry(.2, 12), new T.MeshBasicMaterial({ color: 0x05080e, transparent: true, opacity: .5, depthWrite: false }));
  const impacts = batch('LandingRings', new T.RingGeometry(.17, .2, 16), additive(.45));
  const trails = batch('LootTrails', new T.SphereGeometry(.035, 4, 3), additive(.55), capacity * 4);
  const coins = batch('CoinBurst', new T.CylinderGeometry(.085, .085, .035, 8), new T.MeshStandardMaterial({ color: 0x82edbf, emissive: 0x164e36, metalness: .65, roughness: .3 }), 1200);
  const meshes = [gear, items, beams, shadows, impacts, trails, coins];
  const m = new T.Matrix4(), p = new T.Vector3(), s = new T.Vector3(), q = new T.Quaternion(), e = new T.Euler(), c = new T.Color();
  function put(mesh, at, scale, rotation, color) {
    if (mesh.count >= mesh.instanceMatrix.count) return;
    p.set(at.x, at.y, at.z); s.set(...scale); e.set(...rotation); q.setFromEuler(e); m.compose(p, q, s);
    mesh.setMatrixAt(mesh.count, m);
    if (color !== undefined) mesh.setColorAt(mesh.count, c.setHex(color));
    mesh.count++;
  }
  function update(rows, time = 0, bursts = []) {
    for (const mesh of meshes) mesh.count = 0;
    const alive = new Set(); anchors.clear();
    for (const row of rows.slice(0, capacity)) {
      alive.add(row.key);
      if (!births.has(row.key)) births.set(row.key, time);
      const seed = seedOf(row.key), age = Math.max(0, time - births.get(row.key)), flight = .68 + seed * .18;
      const at = trajectory(row, age, seed, flight), appearance = lootStyle(row), color = appearance.color;
      const spin = Math.min(age, flight + .2), yaw = seed * Math.PI * 2 + spin * 5;
      const rotation = at.landed ? [0, yaw, 0] : [spin * 5, yaw, spin * 3];
      put(row.kind === 'equipment' ? gear : items, at, row.kind === 'equipment' ? [1, 1, 1] : [.85, 1.3, .85], rotation, color);
      put(shadows, { x: at.x, y: .012, z: at.z }, [.65 + clamp(age / flight) * .5, .65 + clamp(age / flight) * .5, 1], [-Math.PI / 2, 0, 0]);
      if (age < flight) {
        for (let i = 1; i <= 4; i++) {
          const previous = age - i * .032; if (previous < 0) continue;
          put(trails, trajectory(row, previous, seed, flight), [1 - i * .15, 1 - i * .15, 1 - i * .15], [0, 0, 0], color);
        }
      }
      if (age >= flight && age < flight + .35) {
        const fade = 1 - (age - flight) / .35, scale = 1 + (1 - fade) * 2.4;
        put(impacts, { x: row.x, y: .018, z: row.z }, [scale, scale, 1], [-Math.PI / 2, 0, 0], c.setHex(color).multiplyScalar(fade).getHex());
      }
      if (at.landed) {
        anchors.set(row.key, { x: row.x, y: .2, z: row.z });
        const reveal = clamp((age - flight - .2) / .18), height = appearance.beamHeight;
        put(beams, { x: row.x, y: height * reveal / 2, z: row.z }, [appearance.beamWidth, height * reveal, appearance.beamWidth], [0, 0, 0], color);
      }
    }
    for (const key of births.keys()) if (!alive.has(key)) births.delete(key);
    // Currency was already awarded by combat. These local fragments rise and land at the death site.
    for (const burst of bursts) {
      if (burst.age < 0 || burst.age >= 1.2) continue;
      const count = Math.min(10, 5 + Math.floor(burst.stones / 6)), seed = seedOf(`${burst.x},${burst.z},${burst.stones}`);
      for (let i = 0; i < count; i++) {
        const angle = seed * Math.PI * 2 + i * 2.3999632297, variant = (seed + i * .173) % 1, radius = .35 + variant * .8, flight = .54 + variant * .22;
        const row = { sourceX: burst.x, sourceZ: burst.z, x: burst.x + Math.cos(angle) * radius, z: burst.z + Math.sin(angle) * radius };
        const at = trajectory(row, burst.age, variant * .6, flight, .045), fade = clamp((1.2 - burst.age) / .24);
        const spin = Math.min(burst.age, flight + .2);
        put(coins, at, [fade, fade, fade], [spin * 9, angle, spin * 6]);
      }
    }
    for (const mesh of meshes) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }
  function reset() { births.clear(); anchors.clear(); for (const mesh of meshes) mesh.count = 0; }
  let disposed = false;
  function dispose() {
    if (disposed) return; disposed = true; reset();
    const materials = new Set();
    for (const mesh of meshes) { mesh.geometry.dispose(); materials.add(mesh.material); }
    for (const material of materials) material.dispose();
    group.clear();
  }
  return { group, update, reset, anchor: key => anchors.get(key) || null, dispose };
}

// The preview uses the same batch and trajectory as combat; its clock can be scrubbed or replayed.
export function createEffect(T) {
  const effect = createLootMarkers(T, 8);
  const samples = [
    { kind: 'equipment', rarity: 'common' }, { kind: 'equipment', rarity: 'rare' }, { kind: 'equipment', rarity: 'legendary' },
    ...[1, 2, 3].map(currencyGrade => ({ kind: 'item', category: 'currency', currencyGrade, rarity: 'common' })),
    { kind: 'item', category: 'currency', rarity: 'rare' }, { kind: 'item', category: 'omen', rarity: 'magic' },
  ];
  const rows = samples.map((sample, i) => ({ ...sample, key: `preview_loot_${i}`, sourceX: 0, sourceZ: 0,
    x: Math.cos(i * Math.PI / 4) * 1.75, z: Math.sin(i * Math.PI / 4) * 1.75 }));
  let previous = Infinity;
  return { group: effect.group, dispose: effect.dispose, update(age) {
    if (age < previous) { effect.reset(); effect.update(rows, 0); }
    effect.update(rows, age, [{ x: 0, z: 0, stones: 30, age }]); previous = age;
  } };
}

// Authoring-only access to the unchanged original trajectory.
export { seedOf, trajectory };
