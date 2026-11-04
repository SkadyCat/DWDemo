import { rollEconomyDrops, talentCost, canPay, pay, mapIncome, itemPrice } from '../../public/game/economy.mjs';
let seed = 9; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const fams = ['ember', 'frost', 'storm', 'blight', 'ruin'];
const node = (n) => { const k = n % 9 === 8 ? 'notable' : n % 23 === 22 ? 'keystone' : 'small'; return { kind: k, domain: n % 5 === 4 ? null : (n % 2 ? 'fire' : 'blade') }; };
for (const mercs of [0, 1]) {
const save = { silver: 0, materials: {} }; let pts = 0, used = 0, rows = [];
for (let m = 1; m <= 140; ++m) {
  const tier = Math.min(16, 1 + Math.floor(m / 7)), fam = m % 3 === 0 ? 'ember' : m % 3 === 1 ? 'ruin' : fams[m % 5];
  for (let k = 0; k < 150; ++k) for (const d of rollEconomyDrops(tier, fam, 'monster', rng)) d.type === 'silver' ? save.silver += d.count : save.materials[d.id] = (save.materials[d.id] ?? 0) + d.count;
  for (let k = 0; k < 8; ++k) for (const d of rollEconomyDrops(tier, fam, 'elite', rng)) d.type === 'silver' ? save.silver += d.count : save.materials[d.id] = (save.materials[d.id] ?? 0) + d.count;
  for (const d of rollEconomyDrops(tier, fam, 'boss', rng)) d.type === 'silver' ? save.silver += d.count : save.materials[d.id] = (save.materials[d.id] ?? 0) + d.count;
  save.silver += 6 * itemPrice({ tier: Math.round(tier * 10 / 16) }, rng() < 0.3 ? 'rare' : 'magic', 1);   // sell ~6 pieces
  if (mercs && m % 3 === 0) { save.silver += mapIncome(Math.max(1, tier - 1)) * 0.55 * 2; const g = tier - 1 <= 5 ? 0 : tier - 1 <= 10 ? 1 : 2; for (const f of ['ember','ruin']) save.materials[`${f}_${g}`] = (save.materials[`${f}_${g}`] ?? 0) + 4 + Math.floor(tier / 3); }
  pts += m % 6 === 0 ? 2 : 1;
  // convert surplus lower grades into upper (refine 4:1) when short
  for (;;) { if (used >= pts) break; const c = talentCost(node(used), used);
    if (!canPay(save, c)) { // try refining
      let fixed = false;
      for (const [id, n] of Object.entries(c.mats)) { if ((save.materials[id] ?? 0) >= n || id === 'sand' || id === 'dust') continue; const [r, g] = id.split('_'); const low = `${r}_${+g - 1}`; if (+g > 0 && (save.materials[low] ?? 0) >= 4) { save.materials[low] -= 4; save.materials[id] = (save.materials[id] ?? 0) + 1; save.silver -= 20; fixed = true; } }
      if (!fixed) break; continue; }
    pay(save, c); used++; }
  if (m % 10 === 0) rows.push(`图${m} T${tier} 点数${pts} 已点${used} 星银${save.silver} 下一点${talentCost(node(used), used).silver} ${JSON.stringify(talentCost(node(used), used).mats)}`);
}
console.log(mercs ? '--- 有佣兵' : '--- 没有佣兵'); console.log(rows.join('\n'));
}
