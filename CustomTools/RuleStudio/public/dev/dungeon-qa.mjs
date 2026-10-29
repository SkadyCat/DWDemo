// Local-only regression driver. Mounts the production Studio3D page and writes
// ordinary move/auto-aim/cast inputs. Never changes health, phase or rewards.
import {reloadStore,store} from '/editors.mjs';
import {mountBattle} from '/battle3d.mjs';
import {loadTalentTree} from '/talents/state.mjs';
import {player,ensureStarted} from '/player.mjs';
if(location.hostname!=='127.0.0.1'||location.port!=='5293')throw Error('QA requires an isolated loopback origin');
await reloadStore();await loadTalentTree();
ensureStarted(store.catalog,store.collections,store.library);
const preset=await fetch('/presets/myriad_swords.json').then(r=>r.json());
player.instances={...player.instances,...preset.instances};
player.loadout={skills:preset.skills,equipment:preset.equipment,belt:[]};
let page,stopped=false;
const input={read(){
 const b=page?.battle;if(!b||page.controlsBlocked||stopped||b.phase==='cleared'||b.hero.dead)return {};
 const h=b.hero,visible=b.monsters.filter(m=>m.health>0&&b.dungeon.sweep(h.x,h.y,m.x,m.y,24)<0).sort((a,c)=>Math.hypot(a.x-h.x,a.y-h.y)-Math.hypot(c.x-h.x,c.y-h.y));
 const target=visible[0]||b.boss;const distance=target?Math.hypot(target.x-h.x,target.y-h.y):Infinity;
 return{move:target&&distance>700?b.directionTo(h,target):{x:0,y:0},casting:visible.length>0,autoAim:true};
},reset(){}};
page=mountBattle(document.querySelector('#battle-root'),{input,rendering:{maxPixelRatio:1,shadowSize:1024}});page.show();
setInterval(()=>{const b=page.battle;if(!b)return;document.querySelector('#qa-status').textContent=`本地实战测试 · ${b.dungeon.rooms.length} 房间 · ${b.phase} · 首领 ${Math.max(0,b.boss?.health||0).toFixed(0)} · 击杀 ${b.kills}/${b.spawned} · ${b.elapsed.toFixed(1)} 秒 · 无修改血量/通关状态`;if(b.phase==='cleared')stopped=true;},200);
