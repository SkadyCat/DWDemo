// Presentation preview: production UI and portal mesh; no player/profile writes.
import {createApp,reactive} from '/vendor/vue.esm-browser.prod.js';
import * as THREE from '/vendor/three.module.js';
import {BattleExitPortal} from '/battle-exit-portal.mjs';
import {createDungeonPortal} from '/prefabs/dungeon-portal.mjs';
const host=document.querySelector('#world'),scene=new THREE.Scene();
scene.background=new THREE.Color('#11171f');
const camera=new THREE.PerspectiveCamera(39,1,.1,100);camera.position.set(0,13,11);camera.lookAt(0,0,0);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;host.prepend(renderer.domElement);
scene.add(new THREE.HemisphereLight('#bed1d7','#22222c',2));const light=new THREE.DirectionalLight('#efdaba',2.2);light.position.set(-5,10,6);light.castShadow=true;scene.add(light);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(15,13),new THREE.MeshStandardMaterial({color:'#25232b',roughness:.95}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
const grid=new THREE.GridHelper(16,16,'#10131c','#10131c');grid.position.y=.005;scene.add(grid);
for(const x of [-5.4,5.4]){const wall=new THREE.Mesh(new THREE.BoxGeometry(.35,.8,12),new THREE.MeshStandardMaterial({color:'#2b3546',roughness:1}));wall.position.set(x,.4,0);wall.castShadow=true;scene.add(wall);}
const hero=new THREE.Mesh(new THREE.CapsuleGeometry(.22,.62,4,12),new THREE.MeshStandardMaterial({color:'#c1aa65',roughness:.65}));hero.position.set(0,.56,2.7);hero.castShadow=true;scene.add(hero);
const portal=createDungeonPortal();scene.add(portal.group);const point={x:0,y:40};
const info=reactive({visible:true,x:0,y:0,near:false,approaching:false});let activations=0;
const activate=()=>{document.querySelector('#action').textContent=`激活事件 ${++activations} 次 · ${info.near?'打开世界地图':'前往传送阵'}（仅控件预览）`;};
createApp({components:{BattleExitPortal},setup:()=>({info,activate}),template:'<BattleExitPortal :info="info" @activate="activate" />'}).mount('#portal-preview');
createApp({components:{BattleExitPortal},setup:()=>({rows:[{label:'远处 · 自动前往',near:false,approaching:false},{label:'走近 · 选择下一处冒险',near:true,approaching:false},{label:'行走中 · 到达后自动打开',near:false,approaching:true}],activate}),template:'<div v-for="row in rows" class="swatch"><p>{{row.label}}</p><BattleExitPortal :info="{visible:true,x:160,y:117,near:row.near,approaching:row.approaching}" @activate="activate" /></div>'}).mount('#swatches');
function resize(){const w=host.clientWidth,h=host.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);const p=new THREE.Vector3(0,1.15,-.4).project(camera);info.x=(p.x+1)*w/2;info.y=(-p.y+1)*h/2;}
new ResizeObserver(resize).observe(host);resize();
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>{const mode=button.dataset.mode;info.near=mode==='near';info.approaching=mode==='travel';hero.position.z=info.near?1.3:2.7;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('on',b===button));};
renderer.setAnimationLoop(time=>{portal.update(point,time/1000);renderer.render(scene,camera);});
