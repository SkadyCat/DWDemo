// Export the actual equipped instances from a completed acquisition record. Values are copied.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PROJECT_ROOT, TOOL_ROOT, readRuleFiles } from './rule-files.mjs';
import { checkRuleSet, progressionLoadout } from '../engine/index.mjs';
import { applyBuildPreset } from '../public/build-presets.mjs';
import { runTower, summarizeRuns, ruleFilesHash } from './test-tower.mjs';

const source = path.join(PROJECT_ROOT, 'Saved/TowerTests/from-zero-bd.json');
const text = fs.readFileSync(source, 'utf8'), record = JSON.parse(text);
const reportDigest = createHash('sha256').update(text).digest('hex');
if (!record.readiness.complete) throw new Error('构筑目标尚未完成');
const files = readRuleFiles(), check = checkRuleSet(files);
if (!check.ok || ruleFilesHash(files) !== record.rulesHash) throw new Error(check.error || '记录与当前规则不同');
const earned = progressionLoadout(record.final, check.collections), equipment = {}, instances = {};
for (const [slot, original] of Object.entries(earned.equipment)) {
  const uid = `grown_${record.seed}_${original}_${reportDigest.slice(0, 8)}`;
  equipment[slot] = uid; instances[uid] = { ...earned.instances[original], uid };
}
const preset = { skills: earned.skills, equipment, instances, belt: [],
  provenance: { source: 'earned-from-zero', seed: record.seed, attempts: record.runs.length, kills: record.final.stats.kills,
    equipmentDrops: record.final.progression.drops, crafts: record.events.filter(e => e.event === 'craft').length,
    stonesEarned: record.final.stats.earned, stonesSpent: record.final.stats.spent,
    startingWeapon: 'common T1 frostthorn_staff, zero affixes', startingStones: 0, startingMaterials: 0,
    reportSha256: reportDigest } };
const probe = { stones: 0, owned: { skill: {}, equipment: {}, item: {} }, instances: {}, loadout: {} };
const applied = applyBuildPreset(probe, preset, check.collections, check.library);
if (applied.error) throw new Error(applied.error);
const root = path.join(TOOL_ROOT, '../../Content/Rules/Presets'), id = 'frost_progression';
fs.writeFileSync(path.join(root, `${id}.json`), JSON.stringify(preset, null, 2) + '\n');
const index = JSON.parse(fs.readFileSync(path.join(root, 'index.json'))).filter(e => e.id !== id);
index.push({ id, name: '冰锥聚射·成长', description: '从普通 T1 法杖、零资源打起所得的九件六词条装备。汇聚冰锥齐射，生命附加火焰和虚空伤害，配合后续受击减伤、命中回血回蓝与偷取。可展开查看实际掉落底材。' });
fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify(index, null, 2) + '\n');

const validation = { rulesHash: record.rulesHash, provenance: preset.provenance, conditions: { frozenGear: true, autoUpgrade: false, god: false, autoCast: false, floorSeconds: 30, maxFloors: 20 }, runs: [] };
const destination = path.join(PROJECT_ROOT, 'Saved/TowerTests/from-zero-validation.json');
for (const mode of ['stand', 'kite']) for (const monsterCount of [20, 100, 200, 300]) for (const seed of [1, 18, 57]) {
  const result = runTower({ files, check, loadout: preset, seed, monsterCount, mode, maxFloors: 20,
    onFloor: e => console.log(JSON.stringify({ event: 'floor', mode, monsterCount, seed, floor: e.floor, result: e.result, seconds: e.seconds, metrics: e.metrics })) });
  validation.runs.push(result);
  console.log(JSON.stringify({ mode, monsterCount, seed, cleared: result.cleared, status: result.status, failedFloor: result.failedFloor }));
  fs.writeFileSync(destination, JSON.stringify(validation, null, 2) + '\n');
}
validation.summary = summarizeRuns(validation.runs);
fs.writeFileSync(destination, JSON.stringify(validation, null, 2) + '\n');
console.log(`VALIDATION ${destination}`);
