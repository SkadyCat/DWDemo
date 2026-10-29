import * as T from '/vendor/three.module.js';

// The hideout merchant's wood counter, striped canopy and shopkeeper palette.
export function createDungeonMerchant(){
  const group=new T.Group(),materials=new Map(),geometries=[];group.name='outpost-merchant';
  const material=color=>{if(!materials.has(color))materials.set(color,new T.MeshStandardMaterial({color,roughness:.82}));return materials.get(color);};
  function mesh(geometry,color,x,y,z,parent=group){geometries.push(geometry);const obj=new T.Mesh(geometry,material(color));obj.position.set(x,y,z);obj.castShadow=obj.receiveShadow=true;parent.add(obj);return obj;}
  const box=(w,h,d,c,x,y,z,parent)=>mesh(new T.BoxGeometry(w,h,d),c,x,y,z,parent);
  const cylinder=(a,b,h,c,x,y,z,parent)=>mesh(new T.CylinderGeometry(a,b,h,10),c,x,y,z,parent);
  box(3.1,.9,1.05,0x59402d,0,.45,.6);box(3.3,.16,1.2,0x8a6742,0,.98,.6);box(2.8,.7,.05,0x5e3530,0,.53,1.15);
  for(const x of [-1.6,1.6]){cylinder(.06,.08,3.1,0x927452,x,1.55,-1.4);box(.16,.15,2.5,0x59402d,x,3.04,-.5);}
  for(let i=0;i<7;i++){const x=-1.48+i*.49,c=i%2?0x6b3d35:0x947656;const cloth=box(.49,.08,2.6,c,x,3.07,-.5);cloth.rotation.x=.12;box(.49,.32,.08,c,x,2.91,.78);}
  box(3.5,.12,.13,0x927452,0,3.1,-1.75);
  const npc=new T.Group();npc.position.set(0,0,-.3);group.add(npc);
  cylinder(.28,.44,.95,0x38545c,0,.65,0,npc);for(const x of [-.17,.17])cylinder(.15,.16,.25,0x232e30,x,.13,0,npc);
  mesh(new T.SphereGeometry(.23,12,8),0xb89972,0,1.36,0,npc);cylinder(.29,.27,.16,0x473e30,0,1.53,0,npc);
  for(const x of [-.95,-.65]){cylinder(.1,.13,.25,0x799e8a,x,1.2,.62);cylinder(.05,.06,.12,0xb39b72,x,1.38,.62);}
  box(.42,.12,.4,0x978565,.8,1.12,.62);box(.35,.05,.4,0x4d3c30,.8,1.22,.62);
  group.scale.setScalar(.85);group.visible=false;
  return {group,update(station){group.visible=!!station;if(station)group.position.set(station.x*.01,0,-station.y*.01);},dispose(){group.removeFromParent();for(const geometry of geometries)geometry.dispose();for(const mat of materials.values())mat.dispose();}};
}
