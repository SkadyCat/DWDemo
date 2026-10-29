import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet } from '../engine/index.mjs';
import { TowerRun } from '../public/sim/dungeon-battle.mjs';
import { TowerPilot } from '../scripts/test-tower.mjs';
import { createBattleAudio } from '../public/audio/battle-audio.mjs';

const files = readRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const preset = JSON.parse(fs.readFileSync(new URL('../../../Content/Rules/Presets/myriad_swords.json', import.meta.url), 'utf8'));
const monsterTypes = [...check.monsters.values()].map(entry => entry.doc);
const tick = 1 / 60;

// This fake only exercises the sound adapter in a Node test. Actual encoded files,
// native playback and audible output are verified separately in an Edge browser.
function fakeOutput() {
  const metrics = { starts: 0, stops: 0 };
  const node = extra => ({ connect() {}, disconnect() {}, ...extra });
  const context = { state: 'running', currentTime: 0, destination: {},
    createGain: () => node({ gain: { value: 1, setValueAtTime(value) { this.value = value; } } }),
    createStereoPanner: () => node({ pan: { value: 0 } }),
    createBufferSource: () => node({ buffer: null, playbackRate: { value: 1 },
      start() { metrics.starts++; queueMicrotask(() => this.onended?.()); }, stop() { metrics.stops++; this.onended?.(); } }),
    decodeAudioData: async () => ({ duration: .1, length: 4800, sampleRate: 48000 }),
  };
  return { context, metrics };
}

function run(seed, monsterCount) {
  const tower = new TowerRun(files, { seed, floor: 1, monsterCount, collections: check.collections, monsterTypes, timeLimitEnabled: true });
  tower.setLoadout(preset);
  return tower;
}

async function simulate(withAudio, { seed, monsterCount }) {
  const tower = run(seed, monsterCount), battle = tower.battle, world = battle.host.world;
  const trace = createHash('sha256'), counts = {}, hashes = [];
  const previous = world.trace;
  world.trace = function (kind, payload) {
    previous?.call(this, kind, payload);
    counts[kind] = (counts[kind] ?? 0) + 1;
    // Primitive trace fields include damage, target IDs, contacts and coordinates.
    // We never serialize mutable roots or timing performance counters.
    trace.update(JSON.stringify([kind, Object.fromEntries(Object.entries(payload).filter(([, value]) =>
      value == null || ['string', 'number', 'boolean'].includes(typeof value)))]));
  };
  const fake = fakeOutput(), errors = [];
  let clock = 0;
  const audio = withAudio ? createBattleAudio({ fakeContext: fake.context, storage: null, now: () => clock,
    random: () => .5, fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) }), onError: error => errors.push(String(error)) }) : null;
  if (audio) { assert.equal(await audio.unlock(), true); await audio.preload(); audio.bind(battle); }
  const pilot = new TowerPilot({ mode: 'kite' });
  for (let frame = 0; frame < 60 * 35 && !['cleared', 'failed'].includes(battle.phase); frame++) {
    clock += tick; fake.context.currentTime = clock;
    pilot.update(battle); tower.step(tick);
    audio?.update(battle);
    hashes.push(world.stateHash().toString());
    await Promise.resolve();
  }
  await Promise.resolve();
  audio?.dispose();
  assert.deepEqual(errors, []);
  const result = { hashes, trace: trace.digest('hex'), counts, phase: battle.phase, casts: battle.hero.casts,
    kills: battle.kills, spawned: battle.spawned, waves: battle.wavesCompleted, dealt: battle.damageDealt,
    taken: battle.damageTaken, life: battle.character.life, shield: battle.character.shield, mana: battle.character.mana };
  return { result, starts: fake.metrics.starts };
}

test('音效接入：真实战斗逐帧状态、伤害和命中事件与无音效完全一致', async () => {
  for (const options of [{ seed: 20261025, monsterCount: 20 }, { seed: 41, monsterCount: 300 }]) {
    const silent = await simulate(false, options), audible = await simulate(true, options);
    assert.deepEqual(audible.result, silent.result, `sound is presentation only for ${options.monsterCount} monsters`);
    assert.equal(audible.result.phase, 'cleared');
    assert.equal(audible.result.kills, options.monsterCount);
    assert.equal(audible.result.waves, 3);
    assert.ok(audible.result.counts.damage > 0 && audible.result.counts.projectile_hit > 0);
    assert.ok(audible.starts > 0, 'the sound adapter actually traverses playback paths during the comparison');
  }
});

test('音效接入：更换战斗后旧world仍正常运行，后装表现观察链不会串音或丢事件', async () => {
  const first = run(101, 20), second = run(102, 20), fake = fakeOutput();
  let clock = 0;
  const errors = [];
  const audio = createBattleAudio({ fakeContext: fake.context, storage: null, now: () => clock, random: () => .5,
    fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) }), onError: error => errors.push(String(error)) });
  await audio.unlock(); await audio.preload(); audio.bind(first.battle);
  let presentationEvents = 0;
  const wrapped = first.battle.host.world.trace;
  first.battle.host.world.trace = function (...args) { presentationEvents++; return wrapped.apply(this, args); };
  audio.bind(second.battle);
  const pilot = new TowerPilot({ mode: 'kite' });
  for (let frame = 0; frame < 40; frame++) {
    clock += tick; fake.context.currentTime = clock;
    pilot.update(first.battle); first.step(tick);
    await Promise.resolve();
  }
  assert.ok(presentationEvents > 0 && first.battle.damageDealt > 0, 'the old simulation and later presentation observer remain intact');
  assert.equal(fake.metrics.starts, 0, 'an unbound world cannot trigger sounds in the new battle');
  for (let frame = 0; frame < 40; frame++) {
    clock += tick; fake.context.currentTime = clock;
    pilot.update(second.battle); second.step(tick); audio.update(second.battle);
    await Promise.resolve();
  }
  assert.ok(fake.metrics.starts > 0, 'the new actual battle can play its own sounds');
  audio.dispose();
  assert.deepEqual(errors, []);
});
