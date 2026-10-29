export const meta=Object.freeze({id:'summon-ember-hound',name:'赤焰战犬',category:'召唤物',continuous:true,duration:3});
export function createEffect(T){
 const group=new T.Group();group.name=meta.id;const body=new T.Group();group.add(body);let pose=()=>{};
 const part=(geometry,material,x=0,y=0,z=0,parent=body)=>{const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};

 const dark=new T.MeshStandardMaterial({color:0x4c2523,roughness:.85}),ember=new T.MeshBasicMaterial({color:0xff6b24,toneMapped:false}),glow=new T.MeshBasicMaterial({color:0xffa13b,transparent:true,opacity:.23,blending:T.AdditiveBlending,depthWrite:false});
 part(new T.BoxGeometry(.48,.43,.9),dark,0,.52,0);const head=part(new T.BoxGeometry(.42,.38,.38),dark,0,.67,.58);part(new T.BoxGeometry(.3,.14,.24),ember,0,.52,.82);
 for(const x of [-.2,.2]){part(new T.ConeGeometry(.1,.24,4),ember,x,.94,.55);part(new T.BoxGeometry(.055,.055,.04),ember,x*.6,.72,.79);}
 const legs=[];for(const x of [-.2,.2])for(const z of [-.3,.3])legs.push(part(new T.BoxGeometry(.13,.38,.16),dark,x,.22,z));
 for(let i=0;i<4;i++)part(new T.ConeGeometry(.1,.34,4),ember,0,.85,-.32+i*.2);
 const aura=part(new T.SphereGeometry(.62,12,8),glow,0,.56,0);aura.scale.set(.65,.65,1);const tail=part(new T.ConeGeometry(.12,.55,5),ember,0,.62,-.7);tail.rotation.x=-1.1;
 pose=(age,flash)=>{legs.forEach((leg,i)=>leg.rotation.x=Math.sin(age*9+i*Math.PI/2)*.2);head.rotation.x=-flash*.4;glow.opacity=.16+flash*.25;tail.rotation.z=Math.sin(age*4)*.2;};
 function update(age,data={}){group.visible=data.visible!==false;pose(age,Math.max(0,1-(data.shotAge??1)/.22));}
 let disposed=false;function dispose(){if(disposed)return;disposed=true;const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m)});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.clear();}
 update(0);return{group,update,dispose};
}
