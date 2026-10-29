import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RULES_DIR, readRuleFiles } from '../scripts/rule-files.mjs';
import { scatterConstellation, constellationEdgePath } from '../public/talents/layout.mjs';
import { placeNodeCard } from '../public/talents/node-card.mjs';
import { LEGENDARY_ICONS } from '../public/talents/legendary-icons.mjs';
import { auditTalentLayout } from '../scripts/audit-talent-layout.mjs';
import { checkRuleSet, aggregate, compileBuild, computeSheet } from '../engine/index.mjs';
import { freshAllocation, validateTree, validateAllocation, pathTo, allocateNode, changeAttribute, chooseNodeAttribute, refundNode, talentParts, spentPoints, attributeTotals, adjacency, upgradeAllocation } from '../public/talents/model.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { TowerRun } from '../public/sim/dungeon-battle.mjs';
import { characterPanel } from '../public/battle-panels.mjs';

const tree = JSON.parse(fs.readFileSync(path.join(RULES_DIR, 'Talents/constellation.json'), 'utf8'));
const files = readRuleFiles(), check = checkRuleSet(files);
assert.ok(check.ok, check.error);
const legends = tree.nodes.filter(n => n.kind === 'legendary');
const plan = (ids, attribute = 'intelligence') => {
  let state = freshAllocation(tree);
  for (const id of ids) { const result = allocateNode(tree, state, id, attribute, true); assert.equal(result.error, '', id); state = result.state; }
  return state;
};
const loadout = (state, skills = ['frost_lance']) => ({ skills, equipment: {}, belt: [], passives: talentParts(tree, state).parts });
const battle = () => new Battle(files, { collections: check.collections, maxMonsters: 0, spawnRate: 0, god: true, seed: 71 });

test('all 100 legendary talents have their own occupied cell in twelve Imagegen 3x3 PNG atlases', () => {
  const manifest=JSON.parse(fs.readFileSync(new URL('../public/talents/icons/legendary/imagegen-manifest.json',import.meta.url)));
  assert.equal(manifest.generator,'Built-in image_gen');assert.equal(manifest.sheets.length,12);
  assert.equal(manifest.sheets.flatMap(s=>s.entries).length,100);assert.equal(manifest.sheets.at(-1).entries.length,1);
  assert.deepEqual(Object.keys(LEGENDARY_ICONS).sort(),legends.map(n=>n.id).sort());
  const cells=new Set();
  for(const node of legends) {
    const icon=LEGENDARY_ICONS[node.id],key=[icon.sheet,icon.row,icon.column].join(':');
    assert.ok(!cells.has(key),node.id+' must have a unique icon');cells.add(key);
    assert.ok(Number.isInteger(icon.row)&&icon.row>=0&&icon.row<3);assert.ok(Number.isInteger(icon.column)&&icon.column>=0&&icon.column<3);
    const data=fs.readFileSync(new URL('../public'+icon.sheet,import.meta.url));
    assert.equal(data.subarray(1,4).toString(),'PNG');assert.equal(data[25],6,'atlas must retain its RGBA transparency');
    const sheet=manifest.sheets.find(s=>icon.sheet.endsWith('/'+s.file));
    assert.equal(sheet.entries.find(e=>e.id===node.id).row,icon.row);
    assert.equal(sheet.entries.find(e=>e.id===node.id).column,icon.column);
  }
});

test('one attribute icon click spends one adjacent point; later icon clicks replace it for free', () => {
  const fresh=freshAllocation(tree),node=tree.nodes.find(n=>n.kind==='attribute' && pathTo(tree,fresh,n.id).length===1);
  const first=chooseNodeAttribute(tree,fresh,node.id,'strength');
  assert.equal(first.error,'');assert.deepEqual(first.state.allocated,[node.id]);assert.equal(spentPoints(tree,first.state),1);
  assert.equal(attributeTotals(tree,first.state).find(a=>a.id==='strength').total,5);
  const next=chooseNodeAttribute(tree,first.state,node.id,'dexterity');
  assert.equal(next.error,'');assert.equal(spentPoints(tree,next.state),1);assert.deepEqual(next.state.allocated,[node.id]);
  assert.equal(attributeTotals(tree,next.state).find(a=>a.id==='strength').total,0);
  assert.equal(attributeTotals(tree,next.state).find(a=>a.id==='dexterity').total,5);
  assert.deepEqual(fresh.allocated,[],'selection must not mutate the previous plan');
  const refunded=refundNode(tree,next.state,node.id).state;
  assert.equal(refunded.choices[node.id],'dexterity','refunded points may remember their old choice');
  const reallocated=chooseNodeAttribute(tree,refunded,node.id,'intelligence');
  assert.equal(reallocated.error,'');assert.equal(reallocated.state.choices[node.id],'intelligence','the clicked icon must override a remembered choice');
  assert.equal(spentPoints(tree,reallocated.state),1);
});

test('an attribute icon cannot buy a remote path, spend an exhausted budget or change a legendary', () => {
  const fresh=freshAllocation(tree),far=tree.nodes.find(n=>n.kind==='attribute' && pathTo(tree,fresh,n.id).length>1);
  const blocked=chooseNodeAttribute(tree,fresh,far.id,'strength');
  assert.ok(blocked.error);assert.equal(blocked.state,fresh);assert.deepEqual(fresh.allocated,[]);assert.deepEqual(fresh.choices,{});
  const adjacent=tree.nodes.find(n=>n.kind==='attribute' && pathTo(tree,fresh,n.id).length===1),empty={...fresh,budget:0};
  const noPoints=chooseNodeAttribute(tree,empty,adjacent.id,'intelligence');
  assert.equal(noPoints.error,'规划点数不足');assert.equal(noPoints.state,empty);
  assert.ok(chooseNodeAttribute(tree,fresh,legends[0].id,'strength').error);
  assert.ok(chooseNodeAttribute(tree,fresh,adjacent.id,'unknown').error);
});

test('node cards stay beside their anchor and flip at the right edge', () => {
  const bounds={left:20,top:100,width:1200,height:700},size={width:424,height:480};
  const right=placeNodeCard(bounds,{left:400,right:420,top:430,bottom:450},size);
  assert.equal(right.left,438);assert.equal(right.top,200);
  const flipped=placeNodeCard(bounds,{left:1100,right:1120,top:430,bottom:450},size);
  assert.equal(flipped.left,658);assert.equal(flipped.top,200);
});

test('node cards keep readable content and actions within every workspace edge', () => {
  for(const bounds of [{left:20,top:100,width:1200,height:700},{left:18,top:140,width:320,height:360}]) {
    for(const x of [bounds.left,bounds.left+bounds.width/2,bounds.left+bounds.width])for(const y of [bounds.top,bounds.top+bounds.height]) {
      const card=placeNodeCard(bounds,{left:x,right:x+4,top:y,bottom:y+4},{width:424,height:740});
      assert.ok(card.left>=bounds.left+12);assert.ok(card.top>=bounds.top+12);
      assert.ok(card.left+card.width<=bounds.left+bounds.width-12);
      assert.ok(card.top+Math.min(740,card.maxHeight)<=bounds.top+bounds.height-12);
    }
  }
});

test('exactly 1000 connected nodes: 100 legendary, 899 freely chosen attributes and one origin', () => {
  assert.equal(tree.nodes.length, 1000); assert.equal(legends.length, 100);
  assert.equal(tree.nodes.filter(n => n.kind === 'attribute').length, 899);
  assert.equal(tree.sectors.length, 20); assert.equal(new Set(tree.nodes.map(n => `${n.x},${n.y}`)).size, 1000);
  assert.deepEqual(['attack','defense','special'].map(c => legends.filter(n => n.category === c).length), [40,30,30]);
  assert.equal(validateTree(tree, check.library), '');
  assert.deepEqual(scatterConstellation(structuredClone(tree)), tree, 'regenerating the layout must not drift or invalidate a saved plan');
  for (const sector of tree.sectors) assert.equal(sector.legends.length, 5);
});

test('frozen provenance payloads match granted traits even when the source BD is later edited', () => {
  // Source BD files are mutable authoring documents. The talent catalogue deliberately retains
  // the original extraction; a visual re-layout must not re-roll its numbers from a newer BD.
  for (const node of legends) {
    assert.deepEqual(node.traits,node.sources.filter(source=>!source.mounted).flatMap(source=>source.traits),node.id);
    for (const source of node.sources) {
      assert.ok(fs.existsSync(path.join(RULES_DIR,source.path || `Presets/${source.preset}.json`)));
      const walk=entry=>{
        const actual=check.library.trait(entry.id)?.source;assert.ok(actual,entry.id);
        assert.ok(Object.values(entry.params).every(Number.isFinite));
        for(const key of Object.keys(entry.params))assert.ok([...actual.params.keys()].some(k=>k.toLowerCase()===key.toLowerCase()),entry.id+'/'+key);
        (entry.with||[]).forEach(walk);
      };
      source.traits.forEach(walk);
    }
  }
});

test('the scattered layout has 100 distinct small rings, finite curved connections and no collapsed overview',()=>{
  assert.equal(tree.layout.orbits.length,100);
  assert.equal(new Set(tree.layout.orbits.map(o=>o.id)).size,100);
  const orbitMap=new Map(tree.layout.orbits.map(o=>[o.id,o])),nodes=new Map(tree.nodes.map(n=>[n.id,n])),routes=new Map(Object.entries(tree.layout.edgeRoutes||{}));
  for(const orbit of tree.layout.orbits) {
    const members=tree.nodes.filter(n=>n.orbit===orbit.id);assert.equal(members.length,8);
    for(const n of members)assert.ok(Math.abs(Math.hypot(n.x-orbit.x,n.y-orbit.y)-orbit.radius)<1.5);
  }
  let arcs=0;
  for(const [a,b] of tree.edges) {
    const d=constellationEdgePath(nodes.get(a),nodes.get(b),orbitMap,routes);
    assert.ok(d.startsWith('M'));assert.ok(!/NaN|undefined|Infinity/.test(d));if(d.includes('A'))arcs++;
  }
  assert.equal(arcs,tree.layout.orbits.reduce((sum,o)=>sum+(o.closed?8:7),0));
  assert.ok(new Set(tree.layout.orbits.map(o=>o.radius)).size>12,'small rings vary in radius');
});

test('the atlas has local branching and central coverage instead of twenty radial hub flowers',()=>{
  const graph=adjacency(tree),root=tree.nodes.find(n=>n.id===tree.root);
  assert.ok(graph.get(tree.root).length<=4,'the start must not radiate ten large petals');
  for(const n of tree.nodes.filter(n=>n.id.endsWith('_hub')))assert.equal(graph.get(n.id).length,2,'former sector hubs are ordinary travel points');
  assert.ok(tree.nodes.filter(n=>Math.hypot(n.x-root.x,n.y-root.y)<400).length>=30,'central area must contain actual nodes');
  assert.ok(legends.some(n=>Math.hypot(n.x-root.x,n.y-root.y)<300),'important traits must also occupy the center');
  assert.ok(tree.layout.orbits.some(o=>o.closed)&&tree.layout.orbits.some(o=>!o.closed),'mix closed rings and open arcs');
  assert.ok(tree.edges.length-tree.nodes.length+1>100,'the backbone offers alternative routes between clusters');
});

test('rendered routes have no unjoined crossings, obstructed nodes or overlapping node rims',()=>{
  const audit=auditTalentLayout(tree);
  assert.deepEqual(audit.crossings,[],'a line crossing must be an actual graph junction');
  assert.deepEqual(audit.obstructions,[],'a connection must not pass through unrelated node icons');
  assert.deepEqual(audit.overlaps,[],'node rims must remain separate');
  const nodes=new Map(tree.nodes.map(n=>[n.id,n])),edges=new Set(tree.edges.map(ids=>[...ids].sort().join(':')));
  for(const[k,route]of Object.entries(tree.layout.edgeRoutes)){
    assert.ok(edges.has(k));
    assert.deepEqual(route.points[0],{x:nodes.get(route.from).x,y:nodes.get(route.from).y});
    assert.deepEqual(route.points.at(-1),{x:nodes.get(route.to).x,y:nodes.get(route.to).y});
    assert.ok(route.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  }
});

test('each of the 100 legendary paths compiles through the unchanged collection compiler', () => {
  for (const node of legends) {
    const state = plan([node.id]), {parts,error} = talentParts(tree,state); assert.equal(error,'');
    const agg = aggregate(check.library,node.skill,parts,Infinity); assert.equal(agg.error,'',node.id); assert.deepEqual(agg.warnings,[],node.id);
    const compiled = compileBuild(agg.source); assert.ok(compiled.plan,`${node.id}: ${compiled.error}`);
  }
});

test('automatic routing does not silently acquire another transformative legendary on the way',()=>{
  for(const node of legends){
    const state=plan([node.id]);
    assert.deepEqual(state.allocated.filter(id=>legends.some(n=>n.id===id)),[node.id]);
  }
});

test('a previous plan is retained when compatible and backed up instead of silently rewritten when disconnected',()=>{
  const empty={...freshAllocation(tree),revision:tree.revision-1,budget:177};
  const upgraded=upgradeAllocation(tree,empty);assert.equal(upgraded.state.budget,177);assert.equal(upgraded.state.revision,tree.revision);assert.equal(upgraded.legacy,null);
  const compatible={...plan(['embers_echo']),revision:tree.revision-1};
  assert.deepEqual(upgradeAllocation(tree,compatible).state,{...compatible,revision:tree.revision});
  const disconnected={...empty,allocated:['embers_echo']};
  const result=upgradeAllocation(tree,disconnected);assert.deepEqual(result.legacy,disconnected);assert.deepEqual(result.state.allocated,[]);assert.equal(result.state.budget,177);
});

test('the maximum allocation of 999 paid nodes still compiles with all 100 mechanics', () => {
  const state={...freshAllocation(tree),budget:999,allocated:tree.nodes.filter(n=>n.kind!=='origin').map(n=>n.id),choices:Object.fromEntries(tree.nodes.filter(n=>n.kind==='attribute').map(n=>[n.id,'intelligence']))};
  assert.equal(validateAllocation(tree,state),'');
  const agg=aggregate(check.library,'frost_lance',talentParts(tree,state).parts,Infinity);
  assert.equal(agg.error,'');assert.deepEqual(agg.warnings,[]);
  assert.ok(compileBuild(agg.source).plan);
});

test('single allocation requires an adjacent connected node; routing spends its actual path cost', () => {
  const state = freshAllocation(tree), path = pathTo(tree,state,'rime_thunder');
  assert.ok(path.length > 10);
  assert.match(allocateNode(tree,state,'rime_thunder').error,/前置/);
  const result = allocateNode(tree,state,'rime_thunder','strength',true);
  assert.equal(result.error,''); assert.equal(spentPoints(tree,result.state),path.length);
  assert.equal(validateAllocation(tree,result.state),''); assert.equal(state.allocated.length,0,'transaction does not mutate input');
  assert.match(allocateNode(tree,{...state,budget:path.length-1},'rime_thunder','strength',true).error,/不足/);
  for (const budget of [-1,1.2,1000]) assert.match(validateAllocation(tree,{...state,budget}),/点数/);
});

test('every transit point can choose any of the four attributes and change freely without spending a point', () => {
  let state = plan(['embers_echo']); const id = state.allocated.find(id => tree.nodes.find(n=>n.id===id).kind==='attribute');
  const spent = spentPoints(tree,state);
  for (const attribute of tree.attributes) {
    assert.equal(attribute.value,5);
    assert.ok(attribute.traits.every(t=>t.params.n===5));
    const result=changeAttribute(tree,state,id,attribute.id);assert.equal(result.error,'');state=result.state;
    const parts=talentParts(tree,state).parts,agg=aggregate(check.library,'frost_lance',parts,Infinity);
    const sheet=computeSheet(agg.source.traits.map(source=>({source})));
    const expected = state.allocated.filter(id=>state.choices[id]===attribute.id).length*5;
    assert.equal(sheet.stats.get('attr.'+attribute.id),expected);
    assert.equal(spentPoints(tree,state),spent);
    assert.equal(attributeTotals(tree,state).find(a=>a.id===attribute.id).total,expected);
  }
  assert.match(changeAttribute(tree,state,id,'unknown').error,/属性/);
});

test('refund rejects disconnected descendants and refunds a leaf; corrupt or foreign imports provide no passives', () => {
  const state = plan(['embers_echo']), first=state.allocated[0];
  assert.match(refundNode(tree,state,first).error,/后续/);
  assert.equal(refundNode(tree,state,'embers_echo').error,'');
  for (const bad of [ {...state,treeId:'another'}, {...state,allocated:[...state.allocated,'unknown']}, {...state,choices:{...state.choices,[first]:'unknown'}}, {...state,allocated:[...state.allocated,first]}, {...state,allocated:['embers_echo']} ]) {
    assert.ok(validateAllocation(tree,bad));assert.deepEqual(talentParts(tree,bad).parts,[]);
  }
});

test('allocation click order does not change the canonical compiled plan', () => {
  const a=plan(['embers_echo','mana_echo']),b={...a,allocated:[...a.allocated].reverse()};
  const hash=s=>compileBuild(aggregate(check.library,'flame_burst',talentParts(tree,s).parts,Infinity).source).plan.hash;
  assert.equal(hash(a),hash(b));
});

test('talent attribute sources reach combat exactly once, retain non-equipment origin, and disappear after refund', () => {
  const state=plan(['storm_swarm'],'strength'),b=battle();b.setLoadout(loadout(state));
  assert.equal(b.character.attributes.strength,attributeTotals(tree,state).find(a=>a.id==='strength').total);
  assert.ok(b.skills[0].sheetEntries.filter(e=>e.source.id.startsWith('attr_strength')).every(e=>!e.equipment));
  const group=characterPanel(b).traits.groups.find(g=>g.key==='talent');
  assert.equal(group.name,'天赋');assert.ok(group.rows.every(row=>!row.from.includes('_')));
  b.setLoadout(loadout(freshAllocation(tree)));
  assert.equal(b.character.attributes.strength,0);assert.equal(b.character.triggers.filter(t=>t.name==='trig_interval').length,0);
});

test('allocated storm keystone grants mirror and echo, without retired timed whirlwind', () => {
  const b=battle();b.setLoadout(loadout(plan(['storm_swarm']),['whirlwind','echo']));
  assert.equal(b.projectiles().length,0);
  for(let i=0;i<210;i++)b.step(1/60);
  assert.equal(b.projectiles().length,0);assert.equal(b.combat.triggers.fired,0);
  assert.ok(b.character.triggers.some(t=>t.name==='hit_mirror_ground'));assert.equal(b.skills[1]?.id,'echo');
  b.hero.castClock=10;b.hero.casting=true;b.step(1/60);b.hero.casting=false;
  assert.ok(b.projectiles().some(p=>p.kind==='whirlwind'));assert.equal(b.hero.error,'');
});

test('the sacrifice keystone grants its existing active skill in the battle host', () => {
  const state=plan(['sacrifice_thunder']),b=battle();b.setLoadout(loadout(state,['iron_guard','sacrifice']));
  assert.equal(b.skills[1]?.id,'sacrifice');assert.equal(b.skills[1]?.error,'');
  b.setLoadout(loadout(freshAllocation(tree),['iron_guard','sacrifice']));assert.equal(b.skills[1],null);
});

test('passives apply with an empty skill bar and survive a tower floor rebuild', () => {
  const state=plan(['shield_from_life'],'constitution'),b=battle();b.setLoadout(loadout(state,[]));
  assert.ok(b.character.attributes.constitution>0);assert.ok(b.character.maxShield>0);
  const tower=new TowerRun(files,{collections:check.collections,monsterCount:20,god:true,seed:13});
  tower.setLoadout(loadout(state));const value=tower.battle.character.attributes.constitution;
  tower.startFloor();assert.equal(tower.battle.character.attributes.constitution,value);
});
