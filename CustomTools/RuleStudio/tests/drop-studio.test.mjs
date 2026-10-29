import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {expectedLoot,sourceStats,poolEntries,tierDistribution,normalized,designCsv,validateDesign} from '../public/drop-studio-model.mjs';
import {createDropStudioProject} from '../../UICreatorAlpha/src/assets/rulestudio-hud/drop-studio.js';
import {validateDocument,indexTree} from '../../UICreatorAlpha/src/core/model.js';
const data=JSON.parse(await fs.readFile(new URL('../public/assets/data/drop-design.v1.json',import.meta.url),'utf8'));
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
test('current baseline separates crafting units, omens, consumables and equipment',()=>{
  const v=expectedLoot(data,'current');close(v.equipment,30.7);close(v.quality[3],.614);close(v.currency,13.815);close(v.omen,15.35);close(v.consumable,6.14);assert.equal(v.maps,0);
});
test('draft rewards more dangerous monsters, and a boss always has a rare-or-better slot',()=>{
  const gear=data.monsters.map(m=>sourceStats(data,'draft',m.id).equipment);
  gear.forEach((value,i)=>close(value,[.06,.20,1.25,2.15][i]));
  const boss=data.draft.equipment.boss;assert.ok(boss.some(s=>s.chance===1&&s.qualityWeights[0]===0&&s.qualityWeights[1]===0));
  const v=expectedLoot(data);close(v.equipment,14.95);close(v.quality[2],4.6404);close(v.quality[3],.2496);close(v.currency,20.2);close(v.omen,1.17);close(v.consumable,2.7);close(v.maps,1);
});
test('source-specific currency weights normalize and preserve uncommon currency access',()=>{
  for(const m of data.monsters){const p=poolEntries(data,'draft',m.id,'currency');close(p.entries.reduce((n,e)=>n+e.conditional,0),1);assert.ok(p.entries.every(e=>e.expected>0));}
  const normal=poolEntries(data,'draft','common','currency').entries,boss=poolEntries(data,'draft','boss','currency').entries;
  assert.ok(normal[0].conditional>normal[2].conditional*100);assert.ok(boss[2].conditional>normal[2].conditional);
});
test('snapshot pool probabilities are marginal, because its 20 entries share one draw',()=>{
  const c=poolEntries(data,'current','common','currency'),o=poolEntries(data,'current','common','omen'),p=poolEntries(data,'current','common','consumable');
  close(c.chance+o.chance+p.chance,.3);close(c.entries[0].expected,.0225);close(o.entries[0].expected,.015);
});
test('all map levels normalize and cap equipment at T10, with T1 and T2 boundaries',()=>{
  for(const mode of ['draft','current'])for(let t=1;t<=16;t++){const tiers=tierDistribution(t,mode);close(tiers.reduce((n,v)=>n+v.probability,0),1);assert.ok(tiers.filter(v=>v.probability).every(v=>v.tier<=Math.min(10,t)));}
  assert.equal(tierDistribution(1)[0].probability,1);close(tierDistribution(2)[1].probability,.75);
  assert.throws(()=>tierDistribution(17));
});
test('equipment quality edits cannot upgrade currencies; the design source is not mutated by analysis',()=>{
  const clone=structuredClone(data),before=JSON.stringify(clone);expectedLoot(clone);tierDistribution(16);assert.equal(JSON.stringify(clone),before);
  clone.draft.equipment.common[0].qualityWeights=[0,0,0,100];close(expectedLoot(clone).currency,expectedLoot(data).currency);
});
test('UICreator owns the complete panel, and all declared action branches have nodes',()=>{
  const project=createDropStudioProject();assert.deepEqual(validateDocument(project),[]);const nodes=indexTree(project.root).nodes;
  assert.ok(nodes.has('ds-item-scroll'));assert.equal(nodes.get('ds-item-scroll').type,'ScrollBox');
  assert.equal(nodes.get('ds-item-scroll').locked,false);assert.equal(nodes.get('ds-item-scroll').layout.gap,0);
  for(const m of data.monsters)assert.equal(nodes.get('ds-monster-'+m.id).action.op,'monster:'+m.id);
  assert.ok(nodes.has('ds-export'));assert.ok(nodes.has('ds-mode-current'));assert.ok(nodes.has('ds-tier-up'));
});
test('exports include both states, all 20 catalogued items, boss directed rolls and independent map draft',()=>{
  const csv=designCsv(data);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('当前实现快照'));assert.ok(csv.includes('未应用'));assert.ok(csv.includes('Boss额外定向装备'));
  for(const item of data.items)assert.ok(csv.includes('"'+item.id+'"'));assert.ok(csv.includes('"map_reward"'));
  assert.deepEqual(validateDesign(data),data);assert.throws(()=>normalized([0,0]));
});
