// 家（初始地牢）的摆设：东厢的仓库宝箱、大厅中央的地毯、几只火盆、NPC 脚下的小台子。只是画面。
import * as THREE from '/vendor/three.module.js';

const M = 0.01;
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .6, metalness: .2, ...o });

function chest() {
  const g = new THREE.Group(), wood = mat(0x5a3218, { roughness: .8 }), gold = mat(0xd8b46a, { metalness: .85, roughness: .3, emissive: 0x2a1a04 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, .7, .8), wood); body.position.y = .35;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, 1.3, 16, 1, false, 0, Math.PI), wood); lid.rotation.z = Math.PI / 2; lid.position.y = .7;
  g.add(body, lid);
  for (const x of [-.5, 0, .5]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(.09, .72, .84), gold); band.position.set(x, .36, 0);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(.41, .035, 6, 16, Math.PI), gold); arc.rotation.y = Math.PI / 2; arc.position.set(x, .7, 0);
    g.add(band, arc);
  }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(.2, .24, .06), gold); lock.position.set(0, .55, .42); g.add(lock);
  for (const m of g.children) { m.castShadow = true; m.receiveShadow = true; }
  return g;
}
function brazier() {
  const g = new THREE.Group(), iron = mat(0x2c2a2a, { metalness: .7, roughness: .45 });
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(.06, .1, 1, 6), iron); leg.position.y = .5;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.36, .2, .25, 10), iron); bowl.position.y = 1.08;
  const coals = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .05, 10), new THREE.MeshBasicMaterial({ color: 0xff7a2a })); coals.position.y = 1.2;
  const light = new THREE.PointLight(0xff9a4a, 6, 6, 1.6); light.position.y = 1.6;
  g.add(leg, bowl, coals, light); g.userData.light = light;
  leg.castShadow = bowl.castShadow = true;
  return g;
}

/** run: a hub MapRun (stations + dungeon). Returns { group, update(time), dispose }. */
export function createHubProps(run) {
  const group = new THREE.Group(), d = run.dungeon, braziers = [];
  const at = (x, y, h = 0) => new THREE.Vector3(x * M, h, -y * M);
  const hall = d.rooms[0], c = d.tileCenter(Math.floor(hall.centerX), Math.floor(hall.centerY));
  // the rug in the middle of the hall: deep red with a gold border
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.8), mat(0x5a1418, { roughness: .95, metalness: 0 }));
  rug.rotation.x = -Math.PI / 2; rug.position.copy(at(c.x, c.y, .012)); rug.receiveShadow = true;
  group.add(rug);
  const gold = mat(0xd8b46a, { metalness: .6, roughness: .4 }), p0 = at(c.x, c.y, .018);
  for (const [w, h, dx, dz] of [[6, .08, 0, 1.75], [6, .08, 0, -1.75], [.08, 3.5, 2.95, 0], [.08, 3.5, -2.95, 0]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, .01, h), gold); b.position.set(p0.x + dx, p0.y, p0.z + dz); group.add(b);
  }
  for (const st of run.stations) {
    if (st.id === 'stash') { const ch = chest(); ch.position.copy(at(st.x, st.y)); ch.rotation.y = Math.PI; group.add(ch); }
    if (st.kind === 'npc') {
      // a low round dais under each NPC, and a brazier beside them
      const dais = new THREE.Mesh(new THREE.CylinderGeometry(.62, .7, .12, 20), mat(0x3a3024, { roughness: .8 }));
      dais.position.copy(at(st.x, st.y, .06)); dais.receiveShadow = true; group.add(dais);
      const b = brazier(); b.position.copy(at(st.x + (st.x < c.x ? -120 : 120), st.y + 60)); group.add(b); braziers.push(b);
    }
  }
  return {
    group,
    update(time) { braziers.forEach((b, i) => { b.userData.light.intensity = 5.5 + Math.sin(time * 9 + i * 2.1) * .8 + Math.sin(time * 23 + i) * .4; }); },
    dispose() { group.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); }); group.removeFromParent(); },
  };
}
