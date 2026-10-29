import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet } from '../engine/index.mjs';
import { TowerRun } from '../public/sim/dungeon-battle.mjs';
import { TowerPilot } from '../scripts/test-tower.mjs';
import { AtlasSession, ATLAS_STORAGE_KEY } from '../public/atlas-session.mjs';
import { travelAtlas } from '../public/atlas-travel.mjs';
import { mapEquipmentPanel } from '../public/battle-panels.mjs';

const files = readRuleFiles();
const check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const preset = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/myriad_swords.json', import.meta.url), 'utf8'));
const monsterTypes = [...check.monsters.values()].map(entry => entry.doc);

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

function createRun(options, armed = true) {
  const tower = new TowerRun(files, { ...options, collections: check.collections, monsterTypes, monsterCount: 20, timeLimitEnabled: !armed });
  if (armed) tower.setLoadout(preset);
  return tower;
}

// The pilot supplies normal aim, movement and casting. No health, phase, rewards or
// victory state is edited by these tests.
function play(tower, observer = () => {}) {
  const pilot = new TowerPilot({ mode: 'kite' });
  for (let frame = 0; frame < 60 * 180 && !['cleared', 'failed'].includes(tower.battle.phase); frame++) {
    pilot.update(tower.battle);
    tower.step(1 / 60);
    observer(tower.battle);
  }
  return tower.battle;
}

test('地图 T 级贯穿真实战斗、守卫名、HUD 与掉落上限，地图核心保持原词条',()=>{
 const session=new AtlasSession(memoryStorage(),{seed:41}),initial=session.prepare('0:0'),first=createRun(initial.options);
 session.bind(initial,first.battle);play(first);assert.equal(session.observe(first.battle),'cleared');
 const node=session.state.nodes.find(n=>n.status==='available'),id='map_t03_common';
 const player={owned:{item:{[id]:1}},mapDeviceSlots:{map:'item:'+id}};
 let tower;
 const entered=travelAtlas(session,player,check.collections,node.id,p=>{
  tower=new TowerRun(files,{...p.options,collections:check.collections,monsterTypes,monsterCount:20,rewards:{catalog:check.catalog}});return tower.battle;
 });
 assert.equal(entered.battle.floor,3);assert.equal(entered.battle.mapTier,3);
 assert.equal(entered.battle.rewards.floor,3);assert.equal(entered.battle.rewards.maxTier,3);
 assert.equal(mapEquipmentPanel(entered.battle).tier,3);
 const core=tower.battle.map.equipment.map.id;
 tower.setMapEquipment({map:core});assert.equal(tower.battle.rewards.maxTier,3,'core refresh cannot reset the admitted map tier');
 for(let i=0;i<180&&!tower.battle.boss;i++)tower.step(1/60);
 assert.equal(tower.battle.boss?.name,'第 3 层守卫');
 assert.equal(player.owned.item[id],undefined);
});

test('异界接入：真实随机地牢与首领通关只结算绑定区域一次', () => {
  const storage = memoryStorage();
  const session = new AtlasSession(storage, { seed: 20261024 });
  const prepared = session.prepare('0:0');
  assert.equal(session.state.activeNodeId, null, 'preparing is not a battle or completion');
  const tower = createRun(prepared.options);
  session.bind(prepared, tower.battle);
  const results = [];
  const battle = play(tower, current => {
    const result = session.observe(current);
    if (result) results.push(result);
  });
  assert.equal(battle.hero.god, false);
  assert.equal(battle.phase, 'cleared');
  assert.equal(battle.completionMode, 'boss'); assert.ok(battle.exitPortal);
  assert.ok(battle.kills > 0 && battle.kills <= 20);
  assert.equal(battle.spawned, 20);
  assert.ok(battle.boss && battle.boss.health <= 0);
  assert.ok(battle.damageDealt > 0 && battle.hero.casts > 0);
  assert.deepEqual(results, ['cleared']);
  assert.deepEqual(session.state.completedIds, ['0:0']);
  assert.ok(session.state.nodes.some(node => node.status === 'available' && node.id !== '0:0'));
  for (let observation = 0; observation < 12; observation++) assert.equal(session.observe(battle), null);
  assert.deepEqual(JSON.parse(storage.getItem(ATLAS_STORAGE_KEY)).completedIds, ['0:0']);
});

test('异界接入：其它真实战斗通关不替当前区域结算，失败保留已探索进度', () => {
  const session = new AtlasSession(memoryStorage(), { seed: 41 });
  const first = session.prepare('0:0');
  const completedRun = createRun(first.options);
  session.bind(first, completedRun.battle);
  play(completedRun);
  assert.equal(session.observe(completedRun.battle), 'cleared');
  const next = session.state.nodes.find(node => node.status === 'available');
  const prepared = session.prepare(next.id);
  const unarmedRun = createRun(prepared.options, false);
  session.bind(prepared, unarmedRun.battle);
  assert.equal(session.observe(completedRun.battle), null);
  assert.equal(session.state.activeNodeId, next.id);
  assert.deepEqual(session.state.completedIds, ['0:0']);
  const failed = play(unarmedRun);
  assert.equal(failed.phase, 'failed');
  assert.equal(session.observe(failed), 'failed');
  assert.equal(session.state.activeNodeId, null);
  assert.deepEqual(session.state.completedIds, ['0:0']);
  assert.equal(session.state.nodes.find(node => node.id === next.id).status, 'failed');
  assert.equal(session.observe(failed), null);
});

test('异界接入：刷新中断的挑战可重试，存储失败不阻止真实挑战和结算', () => {
  const storage = memoryStorage();
  const original = new AtlasSession(storage, { seed: 61 });
  const beforeAnyChallenge = new AtlasSession(storage, { seed: 999 });
  assert.equal(beforeAnyChallenge.state.seed, 61, 'the initial world is saved before any selection or challenge');
  assert.deepEqual(beforeAnyChallenge.state.completedIds, []);
  const prepared = original.prepare('0:0');
  original.bind(prepared, createRun(prepared.options).battle);
  const refreshed = new AtlasSession(storage, { seed: 999 });
  assert.equal(refreshed.state.seed, original.state.seed);
  assert.equal(refreshed.state.activeNodeId, null);
  assert.equal(refreshed.state.nodes.find(node => node.id === '0:0').status, 'failed');
  assert.deepEqual(refreshed.state.completedIds, []);
  assert.equal(refreshed.prepare('0:0').id, '0:0');

  const errors = [];
  const blocked = new AtlasSession({ getItem() { throw new Error('read blocked'); }, setItem() { throw new Error('quota'); } },
    { seed: 71, onStorageError: error => errors.push(error.message) });
  const challenge = blocked.prepare('0:0');
  const run = createRun(challenge.options);
  blocked.bind(challenge, run.battle);
  play(run);
  assert.equal(blocked.observe(run.battle), 'cleared');
  assert.deepEqual(blocked.state.completedIds, ['0:0']);
  assert.deepEqual(errors, ['quota', 'quota', 'quota']);
});
