// Generates parity/scenarios.json — deterministic inputs shared by the UE automation test
// (DWB.Rules.WebParity) and the web interpreter. All geometry is precomputed here so both
// sides only parse decimal numbers (no platform trig in the inputs).
import fs from 'node:fs';
import path from 'node:path';
import {triggerSummonScenarios} from './trigger-summon-scenarios.mjs';
import { TOOL_ROOT } from '../scripts/rule-files.mjs';

const r = x => Math.round(x * 1e5) / 1e5;
const dir = deg => [r(Math.cos(deg * Math.PI / 180)), r(Math.sin(deg * Math.PI / 180)), 0];
const ALL = ['multiple_projectiles', 'pierce', 'ricochet', 'brittle', 'shatter', 'cold_mastery'];

const lane = health => Array.from({ length: 12 }, (_, k) => ({ id: k + 1, position: [2 * (k + 1), r(((k + 1) % 3 - 1) * 0.6), 0], radius: 0.45, health, team: 1 }));
const ring = (count, health) => Array.from({ length: count }, (_, i) => {
  const angle = i * 2.399963, distance = 3 + 0.25 * i;
  return { id: i + 1, position: [r(Math.cos(angle) * distance), r(Math.sin(angle) * distance), 0], radius: 0.5, health, team: 1 };
});
const hero = { key: 'hero', externalId: 1, team: 0, position: [0, 0, 0], aim: [1, 0, 0] };

const scenarios = [
  ...[
    ['splash_frost', 'frost_lance', ['splash', 'fire_damage'], {}],
    ['splash_multi_pierce', 'frost_lance', ['splash', 'multiple_projectiles', 'pierce'], {}],
    ['splash_void', 'monster_bolt', ['splash'], {}],
    ['splash_sentinel', 'sentinel', ['splash'], {}],
    ['splash_params', 'frost_lance', ['splash'], { splash: { radius: 3, ratio: .25 } }],
    ['splash_ignores_area', 'flame_burst', ['splash'], {}],
  ].map(([id, build, extra, params]) => ({
    id, commit: true, frames: 180, dt: 1 / 60,
    plans: [{ key: 'p', build, extra, params }], owners: [hero],
    targets: [
      { id: 100, position: [3, 0, 0], radius: .2, health: 10000, team: 1 },
      { id: 101, position: [3, 1.2, 0], radius: .2, health: 10000, team: 1 },
      { id: 102, position: [5, 0, 0], radius: .2, health: 10000, team: 1 },
      { id: 103, position: [3, 4, 0], radius: .2, health: 10000, team: 1 },
      { id: 104, position: [3, -1, 0], radius: .2, health: 10000, team: 0 },
    ],
    casts: [{ frame: 0, plan: 'p', owner: 'hero', origin: build === 'flame_burst' ? [3, 0, 0] : [0, 0, 0], direction: [1, 0, 0], seed: 17, power: 16 }],
    statusQuery: ['chill', 'poison'],
  })),
  {
    id: 'sentinel_live', commit: true, frames: 120, dt: 1 / 60,
    plans: [{ key: 'p', build: 'sentinel' }], owners: [hero],
    targets: [{ id: 200, position: [3, 0, 0], radius: 0.45, health: 500, team: 1 }],
    casts: [{ frame: 0, plan: 'p', owner: 'hero', origin: [0, 0, 0], direction: [1, 0, 0], seed: 90 }],
    statusQuery: ['chill'],
  },
  {
    id: 'sentinel', commit: true, frames: 660, dt: 1 / 60,
    plans: [{ key: 'p', build: 'sentinel' }], owners: [hero],
    targets: [
      { id: 200, position: [3, 0, 0], radius: 0.45, health: 32, team: 1 },
      { id: 201, position: [0, 5, 0], radius: 0.45, health: 500, team: 1 },
      { id: 202, position: [0, 1, 0], radius: 0.45, health: 500, team: 0 },
      { id: 203, position: [15, 0, 0], radius: 0.45, health: 500, team: 1 },
    ],
    casts: [
      { frame: 0, plan: 'p', owner: 'hero', origin: [0, 0, 0], direction: [1, 0, 0], seed: 91 },
      { frame: 120, plan: 'p', owner: 'hero', origin: [1, 1, 0], direction: [1, 0, 0], seed: 92 },
    ], statusQuery: ['chill'],
  },
  {
    id: 'frost_lance_lane', commit: true, frames: 90, dt: 1 / 60,
    plans: [{ key: 'p', build: 'frost_lance' }], owners: [hero], targets: lane(60),
    casts: [{ frame: 0, plan: 'p', owner: 'hero', origin: [0, 0, 0], direction: [1, 0, 0], seed: 7 }], statusQuery: ['chill'],
  },
  {
    id: 'all_traits_lane', commit: true, frames: 90, dt: 1 / 60,
    plans: [{ key: 'p', build: 'frost_lance', extra: ALL }], owners: [hero], targets: lane(60),
    casts: [{ frame: 0, plan: 'p', owner: 'hero', origin: [0, 0, 0], direction: [1, 0, 0], seed: 7 }], statusQuery: ['chill'],
  },
  {
    id: 'stacked_sample_ring', commit: false, frames: 180, dt: 1 / 60,
    plans: [{ key: 'p', sample: 'stacked' }], owners: [{ ...hero, externalId: 100 }], targets: ring(40, 60),
    casts: [{ frame: 0, plan: 'p', owner: 'hero', origin: [0, 0, 0], direction: [1, 0, 0], seed: 7 }],
  },
  {
    id: 'budget_defers', commit: false, frames: 900, dt: 1 / 60, config: { WorkPerFrame: 50 },
    plans: [{ key: 'p', sample: 'stacked' }], owners: [hero],
    targets: Array.from({ length: 60 }, (_, i) => ({ id: i + 1, position: [r(3 + 0.5 * i), 0, 0], radius: 0.4, health: 20, team: 1 })),
    casts: Array.from({ length: 40 }, (_, c) => ({ frame: 0, plan: 'p', owner: 'hero', origin: [0, 0, 0], direction: [1, r(0.02 * c), 0], seed: c })),
  },
  (() => {
    // Swarm closing in on the hero while it spins and casts the full build: crits, chains, statuses, deaths.
    const targets = [];
    for (let i = 0; i < 120; ++i) {
      const angle = i * 0.7853981 + i * 0.013, distance = 9 + (i % 7) * 1.3;
      const p = [r(Math.cos(angle) * distance), r(Math.sin(angle) * distance), 0];
      const speed = 1.1 + (i % 5) * 0.25;
      targets.push({ id: 1000 + i, position: p, velocity: [r(-p[0] / distance * speed), r(-p[1] / distance * speed), 0], radius: 0.45, health: 45 + (i % 9) * 10, team: 1 });
    }
    const casts = Array.from({ length: 100 }, (_, c) => ({ frame: c * 6, plan: 'p', owner: 'hero', origin: [0, 0, 0], direction: dir(c * 23), seed: 5000 + c }));
    return { id: 'storm_all_traits', commit: true, frames: 660, dt: 1 / 60, plans: [{ key: 'p', build: 'frost_lance', extra: ALL }], owners: [hero], targets, casts, statusQuery: ['chill'] };
  })(),
  {
    id: 'monster_attacks', commit: true, frames: 240, dt: 1 / 60,
    plans: [{ key: 'claw', build: 'monster_claw' }, { key: 'strike', build: 'monster_strike' }, { key: 'bolt', build: 'monster_bolt' }, { key: 'nova', build: 'monster_nova' }, { key: 'slash', build: 'player_slash' }],
    owners: [{ key: 'monsters', externalId: 2, team: 1, position: [3, 0, 0], aim: [-1, 0, 0] }, hero],
    targets: [
      { id: 1, position: [0, 0, 0], radius: 0.45, health: 400, team: 0 },
      { id: 50, position: [1.2, 0.4, 0], radius: 0.45, health: 80, team: 1 },
      { id: 51, position: [1.6, -0.5, 0], radius: 0.45, health: 80, team: 1 },
    ],
    casts: [
      { frame: 0, plan: 'claw', owner: 'monsters', origin: [0.6, 0, 0], direction: [-1, 0, 0], seed: 11 },
      { frame: 10, plan: 'strike', owner: 'monsters', origin: [0.5, 0.2, 0], direction: [-1, 0, 0], seed: 12, power: 18 },
      { frame: 20, plan: 'bolt', owner: 'monsters', origin: [8, 0, 0], direction: [-1, 0, 0], seed: 13, power: 25 },
      { frame: 40, plan: 'nova', owner: 'monsters', origin: [3, 0, 0], direction: [-1, 0, 0], seed: 14, power: 30 },
      { frame: 60, plan: 'slash', owner: 'hero', origin: [0.8, 0, 0], direction: [1, 0, 0], seed: 15, power: 44 },
      { frame: 61, plan: 'slash', owner: 'hero', origin: [0.8, 0, 0], direction: [1, 0, 0], seed: 16, power: 44 },
    ],
  },
  {
    id: 'monster_tower_level', commit: true, frames: 180, dt: 1 / 60,
    plans: [
      { key: 'claw', build: 'monster_claw', extra: ['monster_tower_level'], params: { monster_tower_level: { level: 5 } } },
      { key: 'bolt', build: 'monster_bolt', extra: ['monster_tower_level'], params: { monster_tower_level: { level: 5 } } },
      { key: 'mixed', traits: ['create_ice_lance', 'fire_damage', 'lightning_damage', 'poison_damage', 'monster_tower_level'], params: { monster_tower_level: { level: 5 } } },
    ],
    owners: [{ key: 'monster', externalId: 2, team: 1, position: [0, 0, 0], aim: [1, 0, 0] }],
    targets: [
      { id: 101, position: [1, 0, 0], radius: .45, health: 100000, team: 0, resistance: [20, 30, 40, 0] },
      { id: 102, position: [3, 0, 0], radius: .45, health: 100000, team: 0 },
    ],
    casts: [
      { frame: 1, plan: 'claw', owner: 'monster', origin: [0, 0, 0], direction: [1, 0, 0], seed: 11, power: 100 },
      { frame: 20, plan: 'bolt', owner: 'monster', origin: [0, 0, 0], direction: [1, 0, 0], seed: 12, power: 10 },
      { frame: 60, plan: 'mixed', owner: 'monster', origin: [0, 0, 0], direction: [1, 0, 0], seed: 13 },
    ],
  },
  {
    id: 'typed_damage_and_defense', commit: true, frames: 240, dt: 1 / 60,
    plans: [
      { key: 'p', traits: ['create_ice_lance', 'chill', 'fire_damage', 'frost_damage', 'lightning_damage', 'poison_damage', 'void_damage', 'physical_damage'] },
      { key: 'def', traits: ['frost_resistance', 'fire_resistance'] },
    ],
    owners: [hero], defense: [{ targetId: 7, plan: 'def' }],
    targets: [
      { id: 7, position: [3, 0, 0], radius: 0.45, health: 5000, team: 1, resistance: [10, 20, 30, 40] },
      { id: 8, position: [3, 2, 0], radius: 0.45, health: 5000, team: 1, resistance: [-20, 80, 0, 75] },
    ],
    casts: Array.from({ length: 12 }, (_, c) => ({ frame: c * 15, plan: 'p', owner: 'hero', origin: [0, 0, 0], direction: c % 2 ? [3, 2, 0] : [1, 0, 0], seed: 300 + c })),
  },
  {
    // Ailments: ignite/bleed damage over time, shock damage taken, chill -> freeze, stacking slow.
    id: 'ailments', commit: true, frames: 480, dt: 1 / 60,
    plans: [{ key: 'p', build: 'frost_lance', extra: ['multiple_projectiles', 'pierce', 'fire_damage', 'ignite', 'lightning_damage', 'shock', 'physical_damage', 'bleed', 'freeze', 'hobble'] }],
    owners: [{ ...hero, statusId: 900 }],
    targets: lane(140).map((t, i) => ({ ...t, resistance: [(i % 4) * 15, 10, (i % 3) * 20, 0] })),
    casts: Array.from({ length: 10 }, (_, c) => ({ frame: 5 + c * 24, plan: 'p', owner: 'hero', origin: [0, 0, 0], direction: c % 3 ? [1, r(0.05 * (c % 3)), 0] : [1, 0, 0], seed: 700 + c })),
    statusQuery: ['chill', 'freeze', 'shock', 'ignite', 'bleed', 'slow'],
  },
  {
    // Melee bleed stacks (up to 5) ticking on a pack, plus stacking slow.
    id: 'melee_bleed', commit: true, frames: 360, dt: 1 / 60,
    plans: [{ key: 'slash', build: 'player_slash', extra: ['bleed', 'hobble'] }],
    owners: [hero],
    targets: Array.from({ length: 6 }, (_, i) => ({ id: 60 + i, position: [r(1 + 0.3 * i), r((i % 3 - 1) * 0.5), 0], radius: 0.45, health: 150 + 20 * i, team: 1 })),
    casts: Array.from({ length: 8 }, (_, c) => ({ frame: c * 20, plan: 'slash', owner: 'hero', origin: [0.8, 0, 0], direction: [1, 0, 0], seed: 600 + c, power: 30 })),
    statusQuery: ['bleed', 'slow'],
  },
];

scenarios.push(...triggerSummonScenarios);
const out = path.join(TOOL_ROOT, 'parity', 'scenarios.json');
fs.writeFileSync(out, JSON.stringify({ schema: 1, scenarios }, null, 1) + '\n');
console.log(`wrote ${scenarios.length} scenarios -> ${out}`);
