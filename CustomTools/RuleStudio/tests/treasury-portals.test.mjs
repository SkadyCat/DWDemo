import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three.module.js';
import { treasuryVariant } from '../public/prefabs/royal-treasury/weapons.mjs';
import { createBatch as createGates } from '../public/prefabs/royal-treasury/gate.mjs';
import { createBatch as createProjectiles } from '../public/prefabs/royal-treasury/projectiles.mjs';
import { createBattleEffects } from '../public/vfx/battle-effects.mjs';
import { Battle } from '../public/sim/battle.mjs';
import { readRuleFiles, RULES_DIR } from '../scripts/rule-files.mjs';
import { checkRuleSet } from '../engine/index.mjs';
import fs from 'node:fs';

test('法阵纹理在活动批次间共享，最后释放才销毁；重开可重新创建，无DOM可运行', async () => {
  const first=createGates(T,1),second=createGates(T,1);
  await Promise.all([first.ready,second.ready]);
  const textures=Object.values(first.group.children[0].material.uniforms).map(u=>u.value);
  const other=Object.values(second.group.children[0].material.uniforms).map(u=>u.value);
  assert.equal(textures.length,3);textures.forEach((texture,i)=>assert.equal(texture,other[i]));
  let disposed=0;for(const texture of textures)texture.addEventListener('dispose',()=>++disposed);
  first.dispose();first.dispose();assert.equal(disposed,0);
  second.dispose();second.dispose();assert.equal(disposed,3);
  const reopened=createGates(T,1);await reopened.ready;
  assert.notEqual(reopened.group.children[0].material.uniforms.swordPortal.value,textures[0]);reopened.dispose();
});

test('剑、弓、斧的法阵与兵器共用确定性类型，单个实例批次保存三种不同结构', () => {
  const rows=Array.from({length:30},(_,i)=>({x:i,y:2,z:0,dx:0,dy:0,dz:1,age:.05,radius:.2,visualSeed:Math.imul(i+3,2654435761)>>>0}));
  const gates=createGates(T,30),weapons=createProjectiles(T,30);gates.update(rows);weapons.update(rows);
  const mesh=gates.group.children[0],counts=[0,0,0];assert.equal(mesh.count,30);assert.equal(gates.group.children.length,1);
  rows.forEach((row,i)=>{const type=treasuryVariant(row);assert.equal(mesh.geometry.attributes.portalStyle.getX(i),type);++counts[type];});
  assert.ok(counts.every(n=>n>0));assert.deepEqual(weapons.group.children[0].children.map(m=>m.count),counts);
  gates.update([]);assert.equal(mesh.count,0);gates.dispose();weapons.dispose();
});
test('实际战斗中，每个发射起点携带与对应宝物相同的法阵类型，表现不改变状态哈希', () => {
  const files=readRuleFiles(),c=checkRuleSet(files);assert.ok(c.ok,c.error);
  const preset=JSON.parse(fs.readFileSync(`${RULES_DIR}/Presets/royal_treasury_elements.json`,'utf8'));
  function run(visible){const b=new Battle(files,{collections:c.collections,maxMonsters:0,spawnRate:0,god:false,seed:37});b.setLoadout(preset);
    const fx=visible?createBattleEffects(T,new T.Scene()):null;fx?.update(b);let compared=0;
    b.hero.castClock=10;b.hero.casting=true;
    for(let frame=0;frame<100;frame++){b.step(1/60);b.hero.casting=false;fx?.update(b);
      const mesh=fx?.group.children.find(g=>g.name==='royal-treasury-gate')?.children[0];
      if(mesh?.count){for(let i=0;i<mesh.count;i++)assert.ok([0,1,2].includes(mesh.geometry.attributes.portalStyle.getX(i)));compared+=mesh.count;}}
    const hash=b.host.world.stateHash();fx?.dispose();return{hash,compared};}
  const shown=run(true),hidden=run(false);assert.equal(shown.hash,hidden.hash);assert.ok(shown.compared>0);
});
