import { readRuleFiles } from '../scripts/rule-files.mjs';

// Runtime unit tests exercise the original skills and three archetypes. Authored content may
// acquire new builds, traits and much harder lineages; those have separate production-file tests.
const BASELINE_BUILDS = {
  frost_lance: { id: 'frost_lance', name: '冰锥术', active: 'create_ice_lance', traits: ['create_ice_lance', 'chill'] },
  sentinel: { id: 'sentinel', name: '召唤哨卫', active: 'summon_sentinel', traits: ['summon_sentinel', 'sentinel_ice_lance', 'chill'] },
};
const BASELINE_MONSTERS = new Set(['claw_beast', 'frost_caster', 'void_caster']);

// Explicit test equipment for aggregation / combat regressions; never served or dropped in game.
export const projectileWeaponFixture = () => ({ path: 'Equipment/test_projectile_weapon.json', text: JSON.stringify({
  id: 'test_projectile_weapon', name: '测试投射武器', slot: 'weapon', rarity: 'rare', level: 12,
  skills: ['frost_lance'], traits: ['cold_mastery', 'multiple_projectiles', 'pierce', { id: 'frost_damage', params: { amount: 6 } }, 'lightning_damage'],
}) });

export function readBaselineRuleFiles() {
  return [...readRuleFiles().filter(file => {
    const match = /^monsters[\\/](\w+)\.json$/i.exec(file.path);
    // Disabled rule-created monsters remain available as action dependencies, never as random spawns.
    return !match || BASELINE_MONSTERS.has(match[1]) || JSON.parse(file.text).enabled === false;
  }).map(file => {
    // Keep formula tests independent of authored lineage balance; monster-lineages.test.mjs
    // exercises the real equipped life, point damage, shields and resistances.
    const lineage = /^equipment[\\/]monster_lineage_(\w+)\.json$/i.exec(file.path);
    if (lineage && BASELINE_MONSTERS.has(lineage[1])) {
      return { ...file, text: JSON.stringify({ ...JSON.parse(file.text), traits: [] }) };
    }
    const match = /^builds[\\/](\w+)\.json$/i.exec(file.path);
    const build = match && BASELINE_BUILDS[match[1].toLowerCase()];
    return build ? { ...file, text: JSON.stringify(build) } : file;
  }), projectileWeaponFixture()];
}
