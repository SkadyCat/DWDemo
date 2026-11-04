import * as THREE from '/vendor/three.module.js';

// 夜阙城各区的地面颜色（town.mjs 的 rooms）
const TOWN_FLOOR = { plaza: 0x8a7e6a, sanctum: 0xa08a5a, forge: 0x6e625a, tavern: 0x84705a, market: 0x8a7a5e, shanty: 0x6a604e, dock: 0x5e6468, astral: 0x6a6a80, vault: 0x7a6c54, avenue: 0x9a8660 };

/** A tile of cobblestones (the town's streets): irregular rounded stones in dark grout, white so instance colours tint it. */
function cobbles() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'); g.fillStyle = '#8a857c'; g.fillRect(0, 0, S, S);
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rows = 6;
  for (let j = 0; j < rows; ++j) {
    const h = S / rows, off = (j % 2) * 0.5;
    for (let i = -1; i < 6; ++i) {
      const w = S / 5 * (0.8 + r() * 0.4), x = (i + off) * S / 5 + (r() - .5) * 6, y = j * h + (r() - .5) * 4, v = 196 + Math.floor(r() * 40);
      g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
      g.beginPath(); g.roundRect(x + 3, y + 3, w - 6, h - 6, 10 + r() * 8); g.fill();
      g.fillStyle = 'rgba(255,255,255,.05)'; g.beginPath(); g.roundRect(x + 6, y + 5, w - 14, (h - 10) * .45, 8); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createDungeonFloor(layout) {
  const group = new THREE.Group(), unit = layout.tile * .01, matrix = new THREE.Matrix4(), color = new THREE.Color(), isTown = layout.blocks.length > 0;
  const floors = new THREE.InstancedMesh(new THREE.BoxGeometry(unit - (isTown ? 0 : .035), .18, unit - (isTown ? 0 : .035)),
    new THREE.MeshStandardMaterial({ roughness: .91, metalness: .08, map: isTown && typeof document !== 'undefined' ? cobbles() : null }), layout.tiles.length);
  floors.receiveShadow = true;
  layout.tiles.forEach((tile, i) => {
    const center = layout.tileCenter(tile.x, tile.y), kind = layout.rooms[tile.room]?.kind;
    matrix.makeTranslation(center.x * .01, -.09, -center.y * .01); floors.setMatrixAt(i, matrix);
    if (layout.blocks.length) color.setHex(TOWN_FLOOR[kind] ?? 0x766c5c);   // the town: cobbles, a different shade per district
    else color.setHex(kind === 'boss' ? 0x40303b : kind === 'entry' ? 0x343d47 : kind === 'home' ? 0x433a2e : kind === 'sanctum' ? 0x34304a : kind === 'vault' ? 0x463a26 : tile.room >= 0 ? 0x303a48 : 0x25303c);
    color.multiplyScalar(.9 + ((tile.x * 17 + tile.y * 7) % 13) * .012); floors.setColorAt(i, color);
  });
  // town houses draw their own walls (hub-props); only the cavern edge is drawn here, taller and rockier
  const edge = layout.walls.filter(w => w.block === undefined), H = layout.wallHeight ?? 1.45, town = layout.blocks.length > 0;
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(unit - .02, H, unit - .02), new THREE.MeshStandardMaterial({ color: town ? 0x2a2622 : 0x273342, roughness: .9 }), edge.length);
  walls.castShadow = walls.receiveShadow = true;
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(unit + .04, .12, unit + .04), new THREE.MeshStandardMaterial({ color: town ? 0x3a342c : 0x475365, roughness: .72 }), edge.length);
  edge.forEach((tile, i) => {
    const center = layout.tileCenter(tile.x, tile.y), h = town ? H * (0.85 + ((tile.x * 31 + tile.y * 17) % 7) * 0.05) : H;
    matrix.makeTranslation(center.x * .01, h / 2, -center.y * .01).multiply(new THREE.Matrix4().makeScale(1, h / H, 1)); walls.setMatrixAt(i, matrix);
    matrix.makeTranslation(center.x * .01, h + .03, -center.y * .01); caps.setMatrixAt(i, matrix);
  });
  // Torch flames are drawn by the effects system (particles), at layout.torches.
  group.add(floors, walls, caps);
  for (const mesh of [floors, walls, caps]) mesh.frustumCulled = false;
  return {
    group,
    dispose() { group.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); }); group.removeFromParent(); },
  };
}
