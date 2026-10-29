import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {readRuleFiles} from '../scripts/rule-files.mjs';
import {checkRuleSet, isFixedEquipmentSlot} from '../engine/index.mjs';
import {ICON_SHEETS, ICON_ENTRIES} from '../public/icon-catalog.mjs';
import {iconSrc} from '../public/game-icons.mjs';
import {createHash} from 'node:crypto';
import {COMPLETION_ENTRIES, COMPLETION_SHEETS} from '../public/icon-completion-20261026.mjs';

const dimensions = url => { const png=readFileSync(new URL('../public'+url,import.meta.url)); assert.equal(png.subarray(1,4).toString(),'PNG'); return [png.readUInt32BE(16),png.readUInt32BE(20)]; };
test('图标资源: every live item, equipment template and skill has a dedicated PNG', () => {
  const check=checkRuleSet(readRuleFiles()); assert.ok(check.ok,check.error);
  const keys=new Set(ICON_ENTRIES.map(i=>`${i.kind}:${i.id}`)); assert.equal(keys.size,ICON_ENTRIES.length);
  for(const kind of ['item','equipment','skill']) for(const {doc} of check.collections[kind].values()) {
    if(kind==='equipment'&&isFixedEquipmentSlot(doc.slot))continue;
    assert.ok(keys.has(`${kind}:${doc.id}`),`${kind}:${doc.id} needs an authored icon`);
    assert.equal(iconSrc(kind,doc),`/assets/icons/warcraft-v1/${kind}/${doc.id}.png`);
  }
  for(const icon of ICON_ENTRIES) assert.deepEqual(dimensions(icon.src),[256,256],icon.id);
});
test('九宫格: historical A-G and appended exact 3x3 atlases agree with the manifest', () => {
  assert.deepEqual(ICON_SHEETS.slice(0,7).map(s=>s.id),['a','b','c','d','e','f','g']);
  assert.equal(ICON_SHEETS.length,7+COMPLETION_SHEETS.length);
  assert.equal(new Set(ICON_SHEETS.map(s=>s.id)).size,ICON_SHEETS.length);
  for(const sheet of ICON_SHEETS){
    assert.ok(sheet.entries.length>0&&sheet.entries.length<=9);
    assert.equal(sheet.entries.length+(sheet.emptyCells?.length||0),9);
    assert.deepEqual(dimensions(`/assets/icons/warcraft-v1/sheets/${sheet.id}.png`),[768,768]);
    for(const [at,[kind,id]] of sheet.entries.entries()){
      const icon=ICON_ENTRIES.find(i=>i.kind===kind&&i.id===id);
      assert.ok(icon,`${kind}:${id}`);assert.equal(icon.sheet,sheet.id);
      assert.equal(icon.row,Math.floor(at/3));assert.equal(icon.column,at%3);
    }
  }
  const manifest=JSON.parse(readFileSync(new URL('../public/assets/icons/warcraft-v1/manifest.json',import.meta.url),'utf8'));
  assert.deepEqual(manifest.icons,ICON_ENTRIES);assert.deepEqual(manifest.sheets,ICON_SHEETS);
  assert.deepEqual(manifest.grid,{columns:3,rows:3,cellSize:256,sheetSize:768});
});

test('新专属图标: distinct original art is installed identically for browser and UE',()=>{
  const art=COMPLETION_ENTRIES.filter(e=>!e.copyFrom);
  assert.equal(art.length,32);assert.equal(art.filter(e=>e.kind==='skill').length,27);
  const hashes=new Set();
  for(const icon of art){
    const web=readFileSync(new URL('../public'+icon.src,import.meta.url));
    const native=readFileSync(new URL('../../../Content/OpusIcons/'+icon.kind+'/'+icon.id+'.png',import.meta.url));
    assert.deepEqual(web,native,icon.id);assert.ok(!icon.copyFrom);
    assert.deepEqual(dimensions(icon.src),[256,256]);
    hashes.add(createHash('sha256').update(web).digest('hex'));
    assert.ok(existsSync(new URL('../public/assets/icons/warcraft-v1/'+icon.sourceImage,import.meta.url)));
  }
  assert.equal(hashes.size,32,'every new artwork must be distinct');
  assert.equal(iconSrc('item',{id:'rolled_map_uid',category:'map'}),iconSrc('item','map'));
});
test('实例图标: base item and bound skill survive rerolling; old custom equipment has a valid slot fallback', () => {
  assert.equal(iconSrc('equipment',{id:'rolled_1',baseId:'multishot_ring',slot:'ring'}),iconSrc('equipment','multishot_ring'));
  assert.equal(iconSrc('equipment',{id:'old_weapon',slot:'weapon',skill:'poison_flask'}),iconSrc('equipment','venomglass_flask'));
  assert.equal(iconSrc('equipment',{id:'old_chest',slot:'chest'}),iconSrc('equipment','aegis_of_recharge'));
  for(const kind of ['item','equipment','skill']) assert.ok(existsSync(new URL('../public'+iconSrc(kind,'new_unmapped'),import.meta.url)));
});
