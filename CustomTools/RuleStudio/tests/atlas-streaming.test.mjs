import test from 'node:test';
import assert from 'node:assert/strict';
import { createAtlas, normalizeAtlas, enterAtlasNode, completeAtlasNode, atlasNodeAt, atlasNodesInBounds } from '../public/atlas-state.mjs';
import { createAtlasTerrain } from '../public/atlas-terrain.mjs';

const box=(x=0,y=0)=>({minX:x-1600,maxX:x+1600,minY:y-1000,maxY:y+1000});

test('drag projections generate deterministic random nodes far beyond the initial map in every direction',()=>{
 const state=createAtlas(41),before=JSON.stringify(state);
 for(const [x,y] of [[0,0],[100000,0],[-100000,0],[0,100000],[0,-100000],[10000000,-20000000]]){
  const a=atlasNodesInBounds(state,box(x,y)),b=atlasNodesInBounds(createAtlas(41),box(x,y));
  assert.ok(a.length>300&&a.length<500);assert.deepEqual(a,b);
  assert.ok(a.every(n=>n.x>=x-1600&&n.x<=x+1600&&n.y>=y-1000&&n.y<=y+1000));
  if(x||y)assert.ok(a.every(n=>n.depth>10&&n.status==='hidden'&&n.floor===null));
 }
 assert.equal(JSON.stringify(state),before,'browsing cannot unlock, select, charge or persist generated nodes');
 assert.notDeepEqual(atlasNodesInBounds(createAtlas(42),box()).map(n=>[n.id,n.x,n.y]),atlasNodesInBounds(state,box()).map(n=>[n.id,n.x,n.y]));
});

test('overlapping viewport chunks agree on positions, names, biomes and complete bidirectional roads',()=>{
 const state=createAtlas(3),a=atlasNodesInBounds(state,box(8000,-6000)),b=new Map(atlasNodesInBounds(state,box(8800,-6000)).map(n=>[n.id,n]));
 let overlap=0;
 for(const n of a){if(b.has(n.id)){assert.deepEqual(n,b.get(n.id));overlap++;}for(const id of n.neighbors)assert.ok(atlasNodeAt(state,id).neighbors.includes(n.id));}
 assert.ok(overlap>150);
});

test('unbounded browsing has bounded projection size, leaves save data unchanged and restores identical geometry',()=>{
 let state=completeAtlasNode(enterAtlasNode(createAtlas(76),'0:0'));
 const frontier=state.nodes.find(n=>n.status==='available');state=enterAtlasNode(state,frontier.id,{floor:16});
 const before=JSON.stringify(state),size=state.nodes.length;
 for(let i=0;i<120;i++)assert.ok(atlasNodesInBounds(state,box(i*7500,-i*4200)).length<500);
 assert.equal(state.nodes.length,size);assert.equal(JSON.stringify(state),before);
 const loaded=normalizeAtlas(JSON.parse(before));
 assert.deepEqual(atlasNodesInBounds(loaded,box(50000,-75000)),atlasNodesInBounds(state,box(50000,-75000)));
 assert.equal(atlasNodeAt(state,frontier.id).floor,16);assert.equal(atlasNodeAt(state,frontier.id).status,'active');
 for(const n of state.nodes)assert.equal(atlasNodeAt(state,n.id).status,n.status,'streaming keeps existing exploration visibility and admission');
});

test('terrain generation is incremental, bounded and reproducible after eviction',()=>{
 const calls=[],images=[],created=[];
 const terrain=createAtlasTerrain(41,{capacity:8,createTile(bounds,seed){calls.push({bounds,seed});const canvas={width:384};created.push(canvas);return {canvas,bounds};}});
 const ctx={drawImage(...args){images.push(args);}},start=box();
 terrain.draw(ctx,start);assert.equal(calls.length,1);assert.equal(terrain.pending,true);
 for(let i=0;i<30;i++){const n=calls.length;terrain.draw(ctx,box(i*5000,i*6000));assert.ok(calls.length-n<=1);assert.ok(terrain.size<=8);}
 assert.ok(created.some(c=>c.width===0),'eviction releases raster backing storage');
 terrain.draw(ctx,start);assert.deepEqual(calls.at(-1),calls[0]);assert.ok(images.every(a=>a[3]===1024&&a[4]===1024));
 terrain.dispose();assert.equal(terrain.size,0);assert.ok(created.every(c=>c.width===0));
});

test('invalid or unbounded-size viewports are rejected before allocating nodes',()=>{
 const s=createAtlas(1);
 for(const bounds of [{...box(),minX:Infinity},{...box(),minX:NaN},{...box(),maxY:-2000},{minX:-1e9,minY:-1e9,maxX:1e9,maxY:1e9}])assert.throws(()=>atlasNodesInBounds(s,bounds),/视野/);
});
