import * as T from '../vendor/three.module.js';

export const HIDEOUT_TARGETS = Object.freeze([
  { id: 'stash', name: '仓库', x: -4.2, z: .7, label: [-4.2, 2.05, -1.1] },
  { id: 'merchant', name: '商家商品', x: 4, z: 1.2, label: [4, 3, -1.4] },
]);
const BOUNDS = { x: 7.1, z: 5.2 };
const BLOCKS = [ [-5.7,-2.7,-2.2,-.2], [2.3,5.7,-3.7,.25], [-7,-5.9,-4.6,-2], [5.9,7,-4.7,-2] ];
export function canWalk(x, z, radius = .3) {
  return Math.abs(x) <= BOUNDS.x - radius && Math.abs(z) <= BOUNDS.z - radius
    && !BLOCKS.some(([x0,x1,z0,z1]) => x > x0-radius && x < x1+radius && z > z0-radius && z < z1+radius);
}

/** Only meshes and scene resources. No battle, player inventory or rule-world dependencies. */
export function createHideoutWorld() {
  const group = new T.Group(); group.name = 'hideout';
  const materials = new Map(), geometries = new Map();
  const material = (color, metalness = 0, emissive = 0) => {
    const key = `${color}|${metalness}|${emissive}`;
    if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({ color, roughness: .82-metalness*.35, metalness, emissive }));
    return materials.get(key);
  };
  const geometry = (key, make) => { if (!geometries.has(key)) geometries.set(key, make()); return geometries.get(key); };
  function mesh(shape, mat, x, y, z, parent = group) {
    const obj = new T.Mesh(shape, mat); obj.position.set(x,y,z); obj.castShadow = obj.receiveShadow = true; parent.add(obj); return obj;
  }
  const box = (w,h,d,color,x,y,z,parent=group,metal=0) => mesh(geometry(`box:${w}:${h}:${d}`,()=>new T.BoxGeometry(w,h,d)),material(color,metal),x,y,z,parent);
  const cylinder = (r0,r1,h,color,x,y,z,parent=group,n=10) => mesh(geometry(`cylinder:${r0}:${r1}:${h}:${n}`,()=>new T.CylinderGeometry(r0,r1,h,n)),material(color),x,y,z,parent);
  const wood = 0x59402d, edge = 0x927452, iron = 0x3e4950, stone = 0x4d5557;
  // One instanced draw for the stone paving, with stable visual-only variation.
  const tiles = new T.InstancedMesh(geometry('tile',()=>new T.BoxGeometry(.97,.16,.97)),material(0xffffff),192);
  const matrix = new T.Matrix4(), color = new T.Color(); tiles.receiveShadow = true;
  for (let z=0;z<12;z++) for (let x=0;x<16;x++) {
    const i=z*16+x; matrix.makeTranslation(x-7.5,-.08,z-5.5); tiles.setMatrixAt(i,matrix);
    color.setHex([0x62605a,0x555957,0x666762,0x535b59,0x5e635f][(x*13+z*7)%5]); tiles.setColorAt(i,color);
  }
  group.add(tiles);
  box(16.4,.5,12.4,0x333a3c,0,-.4,0);
  box(16.2,.18,.22,edge,0,.05,6.05); box(.22,.18,12.2,edge,-8.05,.05,0); box(.22,.18,12.2,edge,8.05,.05,0);
  for (let i=0;i<16;i++) {
    box(.98,2.2,.45,stone,i-7.5,1.1,-5.8);
    box(.99,.16,.58,0x6b7270,i-7.5,2.25,-5.8);
    box(.96,.2,.54,0x384244,i-7.5,.12,-5.78);
  }
  for (const x of [-7.7,-2.6,2.6,7.7]) {
    box(.65,2.75,.65,0x606866,x,1.35,-5.7); box(.85,.18,.85,0x7b8079,x,2.75,-5.7);
  }
  // Open front and low side walls keep the avatar and stations visible.
  for (const x of [-7.9,7.9]) for (let z=-4.5;z<=4.5;z+=1) {
    box(.38,.65,.98,stone,x,.32,z); box(.52,.13,1.02,0x737970,x,.7,z);
  }
  for (const x of [-5.2,5.2]) {
    box(1.25,1.55,.05,0x273e46,x,1.5,-5.52);
    box(1.3,.1,.12,0xa28c60,x,2.32,-5.48);
    box(.12,.85,.08,0xb4a075,x,1.55,-5.45);
  }
  function crate(x,z,size=1) {
    box(size,size,size,wood,x,size/2,z);
    for(const side of [-1,1]) { box(size+.04,.1,size+.04,edge,x,size/2+side*size*.34,z); box(.12,size+.06,size+.06,iron,x+side*size*.34,size/2,z); }
  }
  crate(-6.5,-3.3,1.15); crate(-6.6,-4.5,.85); crate(6.5,-3.7,1.1);
  // Broad, readable stash chest.
  const chest = new T.Group(); chest.name='stash'; chest.userData.targetId='stash'; group.add(chest);
  box(2.5,.9,1.45,0x403927,-4.2,.55,-1.2,chest);
  box(2.65,.22,1.55,0x655139,-4.2,1.11,-1.2,chest);
  for (const x of [-5.1,-3.3]) box(.16,1.12,1.58,0x88908a,x,.65,-1.2,chest,.65);
  box(2.6,.14,1.5,iron,-4.2,.18,-1.2,chest,.4);
  box(.44,.48,.12,0xb89d65,-4.2,.75,-.43,chest,.6);
  mesh(geometry('seal',()=>new T.OctahedronGeometry(.15)),material(0x8ee3ef,.25,0x245a6c),-4.2,.8,-.32,chest);
  const chestLight = new T.PointLight(0x7ad8ee,6,4); chestLight.position.set(-4.2,1.4,-.4); group.add(chestLight);
  // Merchant counter, canopy, stock and a quiet shopkeeper.
  const stall = new T.Group(); stall.name='merchant'; stall.userData.targetId='merchant'; group.add(stall);
  box(3.1,.9,1.05,wood,4,.45,-.5,stall); box(3.3,.16,1.2,0x8a6742,4,.98,-.5,stall);
  box(2.8,.7,.05,0x5e3530,4,.53,.05,stall);
  for(const x of [2.4,5.6]) { cylinder(.06,.08,3.1,edge,x,1.55,-2.9,stall); box(.16,.15,2.5,wood,x,3.04,-2,stall); }
  for(let i=0;i<7;i++) {
    const cloth=box(.49,.08,2.6,i%2?0x6b3d35:0x947656,2.52+i*.49,3.07,-2,stall);
    cloth.rotation.x=.12;
    box(.49,.32,.08,i%2?0x6b3d35:0x947656,2.52+i*.49,2.91,-.72,stall);
  }
  box(3.5,.12,.13,edge,4,3.1,-3.25,stall);
  const npc = new T.Group(); npc.position.set(4,0,-1.8); stall.add(npc);
  cylinder(.28,.44,.95,0x38545c,0,.65,0,npc); cylinder(.15,.16,.25,0x232e30,-.17,.13,0,npc); cylinder(.15,.16,.25,0x232e30,.17,.13,0,npc);
  mesh(geometry('head',()=>new T.SphereGeometry(.23,12,8)),material(0xb89972),0,1.36,0,npc);
  cylinder(.29,.27,.16,0x473e30,0,1.53,0,npc);
  for(const x of [3.05,3.35]) { cylinder(.1,.13,.25,x===3.05?0x799e8a:0x667e99,x,1.2,-.48,stall); cylinder(.05,.06,.12,0xb39b72,x,1.38,-.48,stall); }
  box(.42,.12,.4,0x978565,4.8,1.12,-.48,stall); box(.35,.05,.4,0x4d3c30,4.8,1.22,-.48,stall);
  function lantern(x,z,y=1.5) {
    box(.11,y,.11,iron,x,y/2,z); box(.34,.42,.34,0xb59c64,x,y+.18,z);
    box(.24,.3,.24,0xffc779,x,y+.18,z); box(.4,.08,.4,iron,x,y+.43,z);
    const light=new T.PointLight(0xffca85,10,7,2);light.position.set(x,y+.22,z);group.add(light);
  }
  lantern(-6.6,2.2,1.7); lantern(6.5,2.1,1.7); lantern(0,-5.15,1.55);
  // Small patches of greenery along the masonry.
  const leaves = new T.InstancedMesh(geometry('leaf',()=>new T.ConeGeometry(.15,.45,4)),material(0x476351),36);
  for(let i=0;i<36;i++) { const side=i%2?-1:1; matrix.makeRotationZ(Math.sin(i*7)*.35); matrix.setPosition(side*(7.1+(i%3)*.18),.12,-4.7+Math.floor(i/2)*.54);leaves.setMatrixAt(i,matrix); } group.add(leaves);
  const avatar = new T.Group(); avatar.name='hideout-player'; avatar.position.set(0,0,3.5); group.add(avatar);
  cylinder(.28,.4,.85,0xa78846,0,.65,0,avatar);
  for(const x of [-.16,.16]) box(.2,.3,.31,0x30383b,x,.15,.04,avatar);
  mesh(geometry('head',()=>new T.SphereGeometry(.23,12,8)),material(0xd2bb8f),0,1.28,0,avatar);
  const marker=mesh(geometry('marker',()=>new T.RingGeometry(.4,.45,32)),new T.MeshBasicMaterial({color:0xbbe5d6,transparent:true,opacity:.6,side:T.DoubleSide}),0,.02,0,avatar);marker.rotation.x=-Math.PI/2;
  const destination=new T.Mesh(geometry('destination',()=>new T.RingGeometry(.1,.22,24)),new T.MeshBasicMaterial({color:0xe2c587,transparent:true,opacity:.7,side:T.DoubleSide}));destination.rotation.x=-Math.PI/2;destination.visible=false;destination.position.y=.03;group.add(destination);
  // Batch repeated static masonry and carpentry, preserving station parents for picking.
  for (const parent of [group,chest,stall]) {
    const buckets=new Map();
    for(const child of parent.children) if(child.isMesh&&!child.isInstancedMesh&&child!==destination) {
      const key=child.geometry.uuid+'|'+child.material.uuid;
      if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(child);
    }
    for(const list of buckets.values()) if(list.length>1) {
      const batch=new T.InstancedMesh(list[0].geometry,list[0].material,list.length);batch.castShadow=batch.receiveShadow=true;
      list.forEach((child,i)=>{child.updateMatrix();batch.setMatrixAt(i,child.matrix);parent.remove(child);});parent.add(batch);
    }
  }
  return { group, avatar, destination, stations:[chest,stall], dispose() {
    group.traverse(obj=>{if(obj.isInstancedMesh)obj.dispose();});
    const mats=new Set([...materials.values(),marker.material,destination.material]); for(const m of mats)m.dispose(); for(const g of geometries.values())g.dispose(); group.removeFromParent();
  } };
}

export class HideoutScene {
  constructor(host, { onInteract=()=>{}, onHud=()=>{} }={}) {
    this.host=host;this.onInteract=onInteract;this.onHud=onHud;this.keys=new Set();this.active=false;this.blocked=false;this.dirty=true;
    this.renderer=new T.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap;
    this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;host.prepend(this.renderer.domElement);
    this.scene=new T.Scene();this.scene.background=new T.Color(0x111a1d);
    this.camera=new T.OrthographicCamera(-12,12,9,-9,.1,80);this.camera.position.set(12,14,16);this.camera.lookAt(0,.2,-.3);
    this.scene.add(new T.HemisphereLight(0xc4d6d5,0x4a4034,2.4));
    const sun=new T.DirectionalLight(0xffe8bf,3);sun.position.set(-4,12,6);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
    Object.assign(sun.shadow.camera,{left:-12,right:12,top:10,bottom:-10,near:1,far:40});sun.shadow.bias=-.0006;this.scene.add(sun);
    this.world=createHideoutWorld();this.scene.add(this.world.group);this.ray=new T.Raycaster();this.pointer=new T.Vector2();this.plane=new T.Plane(new T.Vector3(0,1,0),0);this.hit=new T.Vector3();
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);
    this.click=e=>this.pick(e);this.keydown=e=>this.key(e,true);this.keyup=e=>this.key(e,false);this.blur=()=>this.release();
    this.renderer.domElement.addEventListener('pointerdown',this.click);window.addEventListener('keydown',this.keydown);window.addEventListener('keyup',this.keyup);window.addEventListener('blur',this.blur);
  }
  release(){this.keys.clear();this.goal=null;this.world.destination.visible=false;this.dirty=true;}
  setBlocked(value){this.blocked=value;if(value)this.release();}
  resize(){const {clientWidth:w,clientHeight:h}=this.host;if(!w||!h||w===this.width&&h===this.height)return;this.width=w;this.height=h;this.renderer.setSize(w,h,false);this.dirty=true;const a=w/h,v=Math.max(16,22.5/a);Object.assign(this.camera,{left:-v*a/2,right:v*a/2,top:v/2,bottom:-v/2});this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();this.labels=HIDEOUT_TARGETS.map(t=>{const p=new T.Vector3(...t.label).project(this.camera);return{...t,left:(p.x*.5+.5)*w,top:(-p.y*.5+.5)*h};});this.emitHud();}
  key(e,down){if(!this.active||this.blocked||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.ctrlKey||e.altKey||e.metaKey)return;if(!down){this.keys.delete(e.code);return;}if(['KeyW','KeyA','KeyS','KeyD'].includes(e.code)){e.preventDefault();this.keys.add(e.code);this.goal=null;this.world.destination.visible=false;this.dirty=true;}if(e.code==='KeyE'&&!e.repeat){e.preventDefault();this.interact(this.nearest().id);}}
  nearest(){const p=this.world.avatar.position;return HIDEOUT_TARGETS.map(t=>({...t,distance:Math.hypot(t.x-p.x,t.z-p.z)})).sort((a,b)=>a.distance-b.distance)[0];}
  interact(id){if(this.blocked||!HIDEOUT_TARGETS.some(t=>t.id===id))return;this.release();this.onInteract(id);}
  pick(e){if(!this.active||this.blocked||e.button!==0)return;const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);
    const hits=this.ray.intersectObjects(this.world.stations,true);if(hits.length){let object=hits[0].object;while(object&&!object.userData.targetId)object=object.parent;if(object){this.interact(object.userData.targetId);return;}}
    if(this.ray.ray.intersectPlane(this.plane,this.hit)&&canWalk(this.hit.x,this.hit.z)){this.goal={x:this.hit.x,z:this.hit.z};this.world.destination.position.set(this.hit.x,.03,this.hit.z);this.world.destination.visible=true;}}
  emitHud(){if(this.labels)this.onHud({labels:this.labels,nearest:this.nearest()});}
  step(dt){if(this.blocked)return;const p=this.world.avatar.position;let dx=(this.keys.has('KeyD')?1:0)-(this.keys.has('KeyA')?1:0),dz=(this.keys.has('KeyS')?1:0)-(this.keys.has('KeyW')?1:0);let distance=Infinity;
    if(!dx&&!dz&&this.goal){dx=this.goal.x-p.x;dz=this.goal.z-p.z;distance=Math.hypot(dx,dz);if(distance<.12){this.release();return;}}
    const length=Math.hypot(dx,dz);if(length){const amount=Math.min(dt*4.2,distance),x=dx/length*amount,z=dz/length*amount;if(canWalk(p.x+x,p.z))p.x+=x;if(canWalk(p.x,p.z+z))p.z+=z;this.world.avatar.rotation.y=Math.atan2(dx,dz);}
  }
  async show(){
    if(this.active)return this.ready;
    this.active=true;const run=this.run=(this.run||0)+1;this.resize();this.scene.updateMatrixWorld(true);
    // Compile every material with the final lights before drawing. First-use compilation otherwise
    // serializes GPU work in render(), blocking the page for seconds on software WebGL.
    try{await(this.ready||=this.renderer.compileAsync(this.scene,this.camera));}
    catch(error){if(this.run===run)this.active=false;this.ready=null;throw error;}
    if(!this.active||this.run!==run)return;
    this.last=0;
    const frame=now=>{if(!this.active||this.run!==run)return;const dt=this.last?Math.min(.05,(now-this.last)/1000):0;this.last=now;const moving=!this.blocked&&(this.keys.size>0||!!this.goal);this.step(dt);if((moving||this.dirty)&&now>(this.nextHud||0)){this.emitHud();this.nextHud=now+100;}if(moving||this.dirty){this.renderer.render(this.scene,this.camera);this.dirty=false;}this.raf=requestAnimationFrame(frame);};
    this.raf=requestAnimationFrame(frame);
  }
  hide(){this.active=false;this.run=(this.run||0)+1;cancelAnimationFrame(this.raf);this.release();}
  dispose(){this.hide();this.observer.disconnect();this.renderer.domElement.removeEventListener('pointerdown',this.click);window.removeEventListener('keydown',this.keydown);window.removeEventListener('keyup',this.keyup);window.removeEventListener('blur',this.blur);this.world.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
