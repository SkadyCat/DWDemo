import * as THREE from '/vendor/three.module.js';

export function createDungeonFloor(layout) {
  const group = new THREE.Group(), unit = layout.tile * .01, matrix = new THREE.Matrix4(), color = new THREE.Color();
  const floors = new THREE.InstancedMesh(new THREE.BoxGeometry(unit - .035, .18, unit - .035), new THREE.MeshStandardMaterial({ roughness: .91, metalness: .08 }), layout.tiles.length);
  floors.receiveShadow = true;
  layout.tiles.forEach((tile, i) => {
    const center = layout.tileCenter(tile.x, tile.y), kind = layout.rooms[tile.room]?.kind;
    matrix.makeTranslation(center.x * .01, -.09, -center.y * .01); floors.setMatrixAt(i, matrix);
    color.setHex(kind === 'boss' ? 0x40303b : kind === 'entry' ? 0x343d47 : tile.room >= 0 ? 0x303a48 : 0x25303c);
    color.multiplyScalar(.9 + ((tile.x * 17 + tile.y * 7) % 13) * .012); floors.setColorAt(i, color);
  });
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(unit - .02, 1.45, unit - .02), new THREE.MeshStandardMaterial({ color: 0x273342, roughness: .83 }), layout.walls.length);
  walls.castShadow = walls.receiveShadow = true;
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(unit + .04, .12, unit + .04), new THREE.MeshStandardMaterial({ color: 0x475365, roughness: .72 }), layout.walls.length);
  layout.walls.forEach((tile, i) => {
    const center = layout.tileCenter(tile.x, tile.y);
    matrix.makeTranslation(center.x * .01, .725, -center.y * .01); walls.setMatrixAt(i, matrix);
    matrix.makeTranslation(center.x * .01, 1.48, -center.y * .01); caps.setMatrixAt(i, matrix);
  });
  const flames = new THREE.InstancedMesh(new THREE.ConeGeometry(.13, .52, 6), new THREE.MeshBasicMaterial({ color: 0xffba65, toneMapped: false }), layout.rooms.length * 4);
  let index = 0;
  for (const room of layout.rooms) for (const [x, y] of [[room.x + .6, room.y + .6], [room.x + room.w - .6, room.y + .6], [room.x + .6, room.y + room.h - .6], [room.x + room.w - .6, room.y + room.h - .6]]) {
    matrix.makeTranslation((x * layout.tile - layout.half) * .01, 1.5, -(y * layout.tile - layout.half) * .01); flames.setMatrixAt(index++, matrix);
  }
  group.add(floors, walls, caps, flames);
  for (const mesh of [floors, walls, caps, flames]) mesh.frustumCulled = false;
  return {
    group,
    dispose() { group.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); }); group.removeFromParent(); },
  };
}
