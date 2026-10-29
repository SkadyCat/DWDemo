import * as T from '/vendor/three.module.js';

const colors = { altar: 0x81dccb, fusion: 0xc4a1ef, choice: 0xf0cc83, vault: 0xe6ad7d };

// Scene objects read the same descriptors as the local map; no reward logic here.
export function createDungeonMapEvents() {
  const group = new T.Group(), objects = new Map(); group.name = 'dungeon-map-events';
  function remove(object) {
    object.group.removeFromParent();
    const geometries = new Set(), materials = new Set();
    object.group.traverse(node => { if (node.geometry) geometries.add(node.geometry); if (node.material) materials.add(node.material); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  }
  function create(event) {
    const root = new T.Group(), ornaments = [], color = colors[event.kind];
    root.name = event.id; root.userData.mapEventId = event.id;
    const stone = new T.MeshStandardMaterial({ color: 0x4b5365, roughness: .8 });
    const trim = new T.MeshStandardMaterial({ color: 0xb59c69, roughness: .4, metalness: .65 });
    const glow = new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .8, roughness: .3 });
    const mesh = (geometry, material, x, y, z) => {
      const node = new T.Mesh(geometry, material); node.position.set(x, y, z);
      node.castShadow = node.receiveShadow = true; root.add(node); return node;
    };
    const box = (w, h, d, material, x, y, z) => mesh(new T.BoxGeometry(w, h, d), material, x, y, z);
    const cylinder = (top, bottom, height, material, y) => mesh(new T.CylinderGeometry(top, bottom, height, 8), material, 0, y, 0);
    cylinder(.88, .96, .18, stone, .09); cylinder(.7, .78, .16, trim, .24);
    if (event.kind === 'vault') {
      box(1.25, .65, .85, stone, 0, .65, 0); box(1.35, .24, .95, trim, 0, 1.08, 0);
      box(.2, .35, .06, glow, 0, .91, .49);
    } else {
      cylinder(.5, .35, .75, stone, .66); cylinder(.68, .48, .18, trim, 1.12);
      if (event.kind === 'choice') {
        for (const x of [-.55, .55]) box(.18, 1.25, .23, stone, x, 1.7, -.15);
        box(1.3, .2, .32, trim, 0, 2.3, -.15);
      }
      for (const x of event.kind === 'fusion' ? [-.28, .28] : [0]) {
        const gem = mesh(new T.OctahedronGeometry(event.kind === 'fusion' ? .28 : .36), glow, x, 1.65, 0);
        ornaments.push(gem);
      }
    }
    const auraMaterial = new T.MeshBasicMaterial({ color, transparent: true, opacity: .65, side: T.DoubleSide, depthWrite: false, toneMapped: false });
    const aura = mesh(new T.RingGeometry(.96, 1.02, 48), auraMaterial, 0, .025, 0); aura.rotation.x = -Math.PI / 2;
    group.add(root); return { group: root, kind: event.kind, ornaments, glow, aura };
  }
  return { group,
    update(events = [], time = 0) {
      const active = new Set();
      for (const event of events) {
        if (!colors[event.kind]) continue;
        active.add(event.id); let object = objects.get(event.id);
        if (object && object.kind !== event.kind) { remove(object); objects.delete(event.id); object = null; }
        if (!object) { object = create(event); objects.set(event.id, object); }
        object.group.position.set(event.x * .01, 0, -event.y * .01);
        object.glow.emissiveIntensity = event.completed ? .08 : .8;
        object.aura.material.opacity = event.completed ? .15 : .55 + Math.sin(time * 2) * .1;
        for (const [i, gem] of object.ornaments.entries()) {
          gem.rotation.y = time * .65 + i; gem.position.y = 1.65 + Math.sin(time * 2 + i) * .08;
        }
      }
      for (const [id, object] of objects) if (!active.has(id)) { remove(object); objects.delete(id); }
    },
    dispose() { for (const object of objects.values()) remove(object); objects.clear(); group.removeFromParent(); }
  };
}
