import test from 'node:test';
import assert from 'node:assert/strict';
import {reactive,computed,watch,nextTick} from '../public/vendor/vue.esm-browser.prod.js';
import {inventoryEntries} from '../public/battle-panels.mjs';
import {partitionInventory} from '../public/inventory-compartments.mjs';
import {reconcileInventoryLayout} from '../public/inventory-layout.mjs';
import {freshHideout,hideoutInventoryEntries} from '../public/hideout/model.mjs';

test('simultaneously mounted battle and hideout bags converge instead of fighting over worn copies',async()=>{
  const state=reactive({owned:{equipment:{staff:3},item:{},skill:{}},instances:{},
    loadout:{equipment:{weapon:'staff'},skills:[],belt:[]},bagLayout:null,hideout:freshHideout()});
  const collections={equipment:new Map([['staff',{doc:{id:'staff',name:'Staff',slot:'weapon',rarity:'common'}}]])};
  const before=JSON.stringify(state.owned),stops=[];let writes=0,feedback=false;
  const battle=computed(()=>reconcileInventoryLayout(state.bagLayout,partitionInventory(inventoryEntries(state,collections)).ordinary));
  const hideout=computed(()=>reconcileInventoryLayout(state.bagLayout,hideoutInventoryEntries({bag:state},collections).bag));
  const sync=view=>watch(()=>view.value.layout,layout=>{
    if(JSON.stringify(state.bagLayout)===JSON.stringify(layout))return;
    if(++writes>10){feedback=true;stops.forEach(stop=>stop());return;}
    state.bagLayout=layout;
  },{immediate:true});
  stops.push(sync(battle),sync(hideout));
  try{
    await nextTick();assert.equal(feedback,false,'shared layout must settle without a recursive update loop');
    assert.equal(writes,1);assert.equal(state.bagLayout.slots[0].count,2,'one copy is worn');
    delete state.loadout.equipment.weapon;await nextTick();
    assert.equal(feedback,false);assert.equal(state.bagLayout.slots[0].count,3);
    state.loadout.equipment.weapon='staff';await nextTick();
    assert.equal(feedback,false);assert.equal(state.bagLayout.slots[0].count,2);
    assert.equal(JSON.stringify(state.owned),before,'placement must not alter ownership');
  }finally{stops.forEach(stop=>stop());}
});

test('stash and merchant storage retain every owned copy',()=>{
  const storage={owned:{equipment:{staff:3},item:{},skill:{}},instances:{},loadout:{equipment:{weapon:'staff'},skills:[],belt:[]}};
  const collections={equipment:new Map([['staff',{doc:{slot:'weapon'}}]])};
  const entries=hideoutInventoryEntries({bag:storage,stash:storage,goods:storage},collections);
  assert.equal(entries.bag[0].count,2);assert.equal(entries.stash[0].count,3);assert.equal(entries.goods[0].count,3);
});
