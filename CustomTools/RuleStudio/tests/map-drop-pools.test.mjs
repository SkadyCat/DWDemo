import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {readMapDropPools} from '../scripts/drop-pool-view.mjs';
import {mapPoolEntries} from '../public/drop-studio-model.mjs';

async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'drop-pool-view-'));
  t.after(async()=>{
    const relative=path.relative(os.tmpdir(),root);
    assert.ok(!path.isAbsolute(relative)&&!relative.startsWith('..')&&relative.startsWith('drop-pool-view-'));
    await fs.rm(root,{recursive:true,force:true});
  });
  for(const group of ['Equipment','Items'])await fs.mkdir(path.join(root,group));
  const docs={'Equipment/a.json':{id:'map_a',name:'地图 A',slot:'map',tier:1},
    'Equipment/b.json':{id:'map_b',name:'地图 B',slot:'map',tier:2},
    'Equipment/staff.json':{id:'staff',name:'法杖',slot:'weapon'},
    'Equipment/helm.json':{id:'helm',name:'头盔',slot:'helmet'},
    'Equipment/system.json':{id:'system',name:'系统表',slot:'character'},
    'Items/orb.json':{id:'orb',name:'通货',category:'currency'},
    'Items/omen.json':{id:'omen',name:'预兆',category:'omen'},
    'Items/ticket.json':{id:'ticket',name:'地图票',category:'map',tier:1}};
  for(const [file,doc]of Object.entries(docs))await fs.writeFile(path.join(root,file),JSON.stringify(doc));
  const config=path.join(root,'pools.json');
  const save=async maps=>fs.writeFile(config,JSON.stringify({maps}));await save({});
  return {root,config,save,read:()=>readMapDropPools(root,config)};
}

test('map viewer excludes system sheets and map tickets from the shared pool',async t=>{
  const f=await fixture(t),data=await f.read();
  assert.deepEqual(data.maps.map(m=>m.id),['map_a','map_b']);
  assert.deepEqual(data.maps[0].equipmentIds,['helm','staff']);
  assert.deepEqual(data.maps[0].itemIds,['omen','orb']);
  assert.equal(data.entries.length,4);
});
test('per-map restrictions and empty arrays never broaden into another map or the default pool',async t=>{
  const f=await fixture(t),before=await f.read();
  await f.save({map_a:{equipmentIds:[],itemIds:['orb']},map_b:{equipmentIds:['staff'],itemIds:[]}});
  const data=await f.read();assert.equal(data.catalogVersion,before.catalogVersion);
  assert.deepEqual(mapPoolEntries(data,'map_a').map(e=>e.id),['orb']);
  assert.deepEqual(mapPoolEntries(data,'map_a','equipment'),[]);
  assert.deepEqual(mapPoolEntries(data,'map_b').map(e=>e.id),['staff']);
  assert.deepEqual(mapPoolEntries(data,'map_b','currency'),[]);
  assert.throws(()=>mapPoolEntries(data,'missing'));
});
test('omitted or null candidate arrays retain their category defaults without changing config',async t=>{
  const f=await fixture(t);await f.save({map_a:{equipmentIds:['staff'],itemIds:null}});
  const bytes=await fs.readFile(f.config),data=await f.read();
  assert.deepEqual(data.maps[0].itemIds,['omen','orb']);
  assert.deepEqual(data.maps[1].equipmentIds,['helm','staff']);
  assert.deepEqual(await fs.readFile(f.config),bytes);
});
test('unknown, duplicate, system and wrong-category candidates are reported instead of silently shown',async t=>{
  const f=await fixture(t);
  for(const config of [{missing:{}},{map_a:{equipmentIds:['missing']}},{map_a:{equipmentIds:['staff','staff']}},
    {map_a:{equipmentIds:['system']}},{map_a:{itemIds:['ticket']}},{map_a:{itemIds:['staff']}},
    {map_a:'invalid'},{map_a:{equipmentIds:'staff'}}]){
    await f.save(config);await assert.rejects(f.read());
  }
});
