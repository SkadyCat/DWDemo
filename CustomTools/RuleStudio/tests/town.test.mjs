// 夜阙城：家是一座城镇。英雄点哪儿都能绕开房子走到；镇民按日子走动、不卡在房子里；点镇民会回话。
import test from 'node:test';
import assert from 'node:assert/strict';
import { MapRun } from '../public/game/run.mjs';
import { newSave, buildOf } from '../public/game/save.mjs';
import { FOLK } from '../public/game/townsfolk.mjs';
import { CAST } from '../public/game/town.mjs';

const home = () => new MapRun(buildOf(newSave()), { hub: true, seed: 20261104 });
const walkable = (r, a) => { const t = r.dungeon.tileOf(a.x, a.y); return r.dungeon.walkable(t.x, t.y); };

test('家是城镇：出生在灯井南边，镇民全都在能走的地方，配角都有台词', () => {
  const r = home();
  assert.ok(walkable(r, r.hero));
  assert.equal(r.town.agents.length, FOLK.length);
  assert.ok(FOLK.length >= 40, '至少 40 个镇民');
  for (const a of r.town.agents) assert.ok(walkable(r, a), a.id);
  for (const id of Object.keys(CAST)) assert.ok(FOLK.some(f => f.id === id), `${id} 有模型`);
});

test('英雄绕着房子走到每一个 NPC、仓库和地图仪', () => {
  for (const st of home().stations) {
    const r = home();
    if (st.id === 'device') r.walkToPortal(); else r.walkToStation(st.id);
    let opened = false;
    for (let t = 0; t < 40 && !opened; t += 1 / 30) { r.step(1 / 30); opened = st.id === 'device' ? r.portalReached > 0 : r.arrivals > 0; }
    assert.ok(opened, `走到 ${st.name}`);
  }
});

test('镇民在走动：一段时间后大多换了地方，没有人卡进墙里；点一下会停下回话', () => {
  const r = home(), start = new Map(r.town.agents.map(a => [a.id, { x: a.x, y: a.y }]));
  for (let t = 0; t < 90; t += 1 / 20) r.step(1 / 20);
  const moved = r.town.agents.filter(a => Math.hypot(a.x - start.get(a.id).x, a.y - start.get(a.id).y) > 200).length;
  assert.ok(moved > r.town.agents.length * 0.5, `${moved} 个走动过`);
  for (const a of r.town.agents) assert.ok(walkable(r, a), `${a.id} 在路上`);
  const mati = r.town.agents.find(a => a.id === 'mati'), line = r.town.talk(mati);
  assert.ok(CAST.mati.lines.includes(line)); assert.equal(mati.mode, 'talk');
  assert.equal(r.town.at(mati.x, mati.y + 30), mati, '点在她身上（脚后面一点）能选中她');
});
