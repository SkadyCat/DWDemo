// Read-only counters around actual Battle methods: never inject statuses or damage.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_DIR, readRuleFiles } from './rule-files.mjs';
import { checkRuleSet } from '../engine/index.mjs';
import { simulateRoyalSovereign, withoutSovereignAffixes } from './research-royal-sovereign.mjs';

export function observeRoyalElements(b) {
  const R = b.combat, a = R.ailments;
  const seen = { damageByElement: {}, poisonDotDamage: 0, poisonBurstDamage: 0, poisonApplications: 0,
    chilledPoisons: 0, shockedPoisons: 0, elementalPoisons: 0, poisonLayers: 0, poisonDuration: 0,
    poisonStrength: 0, ignites: 0, detonations: 0, burningDetonations: 0, detonationBase: 0, poisonConsumptions: 0 };
  const apply = a.applyPoison.bind(a), ignite = a.addIgnite.bind(a), detonate = a.detonateNow.bind(a);
  a.applyPoison = (id, opts) => {
    const before = new Set(a.poison.get(id)?.layers || []);
    const chilled = R.status(id, 'chill') > 0, shocked = R.status(id, 'shock') > 0;
    apply(id, opts);
    const added = (a.poison.get(id)?.layers || []).filter(layer => !before.has(layer));
    if (added.length) {
      ++seen.poisonApplications; if (chilled) ++seen.chilledPoisons; if (shocked) ++seen.shockedPoisons;
      if ([0,1,2].includes(opts.element)) ++seen.elementalPoisons;
      for (const layer of added) { ++seen.poisonLayers; seen.poisonDuration += layer.left; seen.poisonStrength += layer.dps; }
    }
  };
  a.addIgnite = (...args) => { ++seen.ignites; return ignite(...args); };
  a.detonateNow = (id, st, layers) => {
    const before = st.layers.length; ++seen.detonations;
    if (a.isBurning(id)) ++seen.burningDetonations;
    detonate(id, st, layers); seen.poisonConsumptions += Math.max(0, before - st.layers.length);
  };
  const trace = b.host.world.trace;
  b.host.world.trace = (kind, p) => { trace?.(kind, p); if (kind === 'area' && p.effect === 'poison_detonate') seen.detonationBase += p.amount; };
  const damage = b.onDamageDealt;
  b.onDamageDealt = row => {
    damage?.(row); seen.damageByElement[row.Element] = (seen.damageByElement[row.Element] || 0) + row.Amount;
    if (row.Element === 4 && row.bDot) seen.poisonDotDamage += row.Amount;
    if (row.Info?.strike === 'poison_detonate') seen.poisonBurstDamage += row.Amount;
  };
  return seen;
}

export function researchRoyalElements(files, collections, preset, options = {}) {
  const run = (sample = preset) => simulateRoyalSovereign(files, collections, sample, { ...options, observe: observeRoyalElements });
  return { full: run(),
    noColdReaction: run(withoutSovereignAffixes(preset, ['poison_vs_chill'])),
    noShockReaction: run(withoutSovereignAffixes(preset, ['poison_vs_shock'])),
    noFireReaction: run(withoutSovereignAffixes(preset, ['poison_detonate_vs_burning'])),
    noPoison: run(withoutSovereignAffixes(preset, ['poison_chance'])),
    noIgnition: run(withoutSovereignAffixes(preset, ['igniting_hits'])),
    noDetonation: run(withoutSovereignAffixes(preset, ['poison_hit_detonate'])),
    noConsumers: run(withoutSovereignAffixes(preset, ['shock_consume', 'poison_hit_detonate'])),
    noEquipment: simulateRoyalSovereign(files, collections, { skills: ['royal_treasury'], equipment: { weapon: 'royal_key' } }, { ...options, observe: observeRoyalElements }) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = readRuleFiles(), checked = checkRuleSet(files); if (!checked.ok) throw Error(checked.error);
  const preset = JSON.parse(fs.readFileSync(path.join(RULES_DIR, 'Presets/royal_treasury_elements.json'), 'utf8'));
  const result = researchRoyalElements(files, checked.collections, preset);
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
