import test from 'node:test';
import assert from 'node:assert/strict';
import {generateDungeon} from '../public/sim/dungeon.mjs';
import {DungeonMapCamera, mapBounds, mapHeroPoint, mapWorldPoint} from '../public/dungeon-map-model.mjs';
import {createDungeonMapProject, DUNGEON_MAP} from '../../UICreatorAlpha/src/assets/rulestudio-hud/dungeon-map.js';
import {validateDocument, indexTree} from '../../UICreatorAlpha/src/core/model.js';
import {computeLayout} from '../../UICreatorAlpha/src/core/layout.js';
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);
const map = generateDungeon(412, 3);

test('map coordinates match the real dungeon entry and north-positive world axes', () => {
  const entry = mapWorldPoint(map, map.entry.x, map.entry.y), room = map.rooms[map.entryRoom];
  near(entry.x, room.centerX); near(entry.y, map.size - room.centerY);
  assert.ok(mapWorldPoint(map, map.entry.x, map.entry.y + 200).y < entry.y);
  assert.deepEqual(mapHeroPoint(map, {heroX: entry.x, heroY: map.size-entry.y}), entry);
});
test('fit shows every real dungeon room and corridor without touching the layout', () => {
  for (let seed=1; seed<=25; seed++) {
    const floor = generateDungeon(seed, 1), before = JSON.stringify(floor.rooms);
    const cam = new DungeonMapCamera(floor, DUNGEON_MAP.panel.viewport);
    for (const tile of floor.tiles) for (const p of [{x:tile.x,y:floor.size-tile.y}, {x:tile.x+1,y:floor.size-tile.y-1}]) {
      const screen=cam.project(p); assert.ok(screen.x >= 0 && screen.x <= cam.viewport.width); assert.ok(screen.y >= 0 && screen.y <= cam.viewport.height);
    }
    assert.equal(JSON.stringify(floor.rooms), before);
  }
});
test('pointer anchored zoom preserves the world point and clamps repeated zoom operations', () => {
  const cam=new DungeonMapCamera(map,DUNGEON_MAP.panel.viewport), anchor={x:420,y:220}; cam.zoomBy(2);
  const point=cam.unproject(anchor); cam.zoomBy(1.25,anchor);
  const after=cam.unproject(anchor); near(point.x,after.x); near(point.y,after.y);
  for(let i=0;i<100;i++)cam.zoomBy(2); assert.equal(cam.zoom,4);
  for(let i=0;i<100;i++)cam.zoomBy(.5); assert.equal(cam.zoom,.75);
});
test('round map follows the hero, pan releases follow, locate restores it and fit restores full view', () => {
  const cam=new DungeonMapCamera(map,DUNGEON_MAP.mini.viewport,true), hero=mapWorldPoint(map,map.entry.x,map.entry.y);
  cam.locate(hero); cam.zoomBy(2); const p=cam.project(hero); near(p.x,76);near(p.y,76);
  cam.pan(25,-20);assert.equal(cam.follow,false);cam.locate(hero);assert.equal(cam.follow,true);
  cam.fit();assert.equal(cam.zoom,1);assert.equal(cam.follow,false);
  cam.pan(1e9,-1e9);const b=mapBounds(map);assert.ok(cam.x>b.x-b.width&&cam.x<b.x+2*b.width);assert.ok(cam.y>b.y-b.height&&cam.y<b.y+2*b.height);
});
test('fit stays centered and zoomed panning stops at content edges with 32px padding', () => {
  const cam=new DungeonMapCamera(map,DUNGEON_MAP.panel.viewport), fitted={x:cam.x,y:cam.y};
  cam.pan(500,-500);near(cam.x,fitted.x);near(cam.y,fitted.y);
  cam.zoomBy(4);
  for(const direction of [-1,1]) {
    cam.pan(direction*1e6,direction*1e6);const limits=cam.limits();
    near(cam.x,direction>0?limits.minX:limits.maxX);near(cam.y,direction>0?limits.minY:limits.maxY);
    const b=cam.bounds, edge=cam.project({x:direction>0?b.x:b.x+b.width,y:direction>0?b.y:b.y+b.height});
    near(edge.x,direction>0?32:cam.viewport.width-32);near(edge.y,direction>0?32:cam.viewport.height-32);
  }
});
test('drag overscroll has resistance, stays capped through repeated grabs and returns an exact legal target', () => {
  const cam=new DungeonMapCamera(map,DUNGEON_MAP.panel.viewport);
  for(let i=0;i<20;i++) {
    const start={x:cam.x,y:cam.y};cam.beginDrag();cam.dragBy(0,0);near(cam.x,start.x);near(cam.y,start.y);
    cam.dragBy(10000,-10000);const target=cam.endDrag();
    assert.ok(cam.x<target.x&&cam.y>target.y);
    assert.ok((target.x-cam.x)*cam.scale<72.001);assert.ok((cam.y-target.y)*cam.scale<=cam.viewport.height*.12+.001);
    assert.equal(cam.drag,null);
  }
  const target=cam.endDrag();Object.assign(cam,target);assert.deepEqual(cam.boundedPosition(),target);
});
test('regrabbing during return or after locating preserves the visible position without jumping', () => {
  const cam=new DungeonMapCamera(map,DUNGEON_MAP.panel.viewport);
  cam.beginDrag();cam.dragBy(-450,260);const target=cam.endDrag();
  cam.x=(cam.x+target.x)/2;cam.y=(cam.y+target.y)/2;
  for(const locate of [false,true]) {
    if(locate)cam.locate(mapWorldPoint(map,map.entry.x,map.entry.y));
    const before={x:cam.x,y:cam.y};cam.beginDrag();cam.dragBy(0,0);near(cam.x,before.x);near(cam.y,before.y);
    const bounded=cam.endDrag();assert.ok(Number.isFinite(bounded.x)&&Number.isFinite(bounded.y));
  }
  cam.beginDrag();cam.dragBy(400,-500);cam.zoomBy(2);assert.equal(cam.drag,null);assert.deepEqual(cam.boundedPosition(),{x:cam.x,y:cam.y});
});
test('UICreator source has a real circular clip, accessible controls and a separate expanded panel', () => {
  const doc=createDungeonMapProject(); assert.deepEqual(validateDocument(doc), []);
  const mini=doc.prefabs['dungeon-minimap'], nodes=indexTree(mini.root).nodes;
  const viewport=nodes.get('dmap-mini-viewport');assert.equal(viewport.style.clip,true);assert.equal(viewport.style.radius,76);
  assert.equal(viewport.slot.offsets.right,152);assert.equal(viewport.slot.offsets.bottom,152);
  for(const op of ['open','in','out'])assert.ok([...nodes.values()].some(n=>n.type==='Button'&&n.action?.op===op));
  const panel=indexTree(doc.root).nodes;
  for(const op of ['close','in','out','fit','locate'])assert.ok([...panel.values()].some(n=>n.type==='Button'&&n.action?.op===op));
  for(const data of [doc,{...doc,root:mini.root,viewport:{width:mini.width,height:mini.height}}]) {
    const layout=computeLayout(data);
    for(const item of layout.entries.values()) {
      assert.ok(Number.isFinite(item.globalX)&&Number.isFinite(item.globalY));
      assert.ok(item.globalX>=0&&item.globalY>=0, item.node.id);
      assert.ok(item.globalX+item.globalWidth<=data.viewport.width+.01,item.node.id);
      assert.ok(item.globalY+item.globalHeight<=data.viewport.height+.01,item.node.id);
    }
  }
});
