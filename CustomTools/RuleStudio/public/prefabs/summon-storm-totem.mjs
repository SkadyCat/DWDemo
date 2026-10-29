export const meta=Object.freeze({id:'summon-storm-totem',name:'引雷图腾',category:'召唤物',continuous:true,duration:3});
export function createEffect(T){
 const group=new T.Group();group.name=meta.id;const body=new T.Group();group.add(body);let pose=()=>{};
 const part=(geometry,material,x=0,y=0,z=0,parent=body)=>{const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};

 const stone=new T.MeshStandardMaterial({color:0x303e5b,roughness:.7}),rune=new T.MeshBasicMaterial({color:0x92cfff,toneMapped:false}),glow=new T.MeshBasicMaterial({color:0x5497ff,transparent:true,opacity:.22,blending:T.AdditiveBlending,depthWrite:false});
 part(new T.CylinderGeometry(.42,.5,.22,6),stone,0,.12,0);part(new T.CylinderGeometry(.2,.3,.8,6),stone,0,.62,0);const crystal=part(new T.OctahedronGeometry(.3),rune,0,1.4,0);crystal.scale.y=1.8;
 const halo=part(new T.TorusGeometry(.43,.024,5,24),rune,0,1.3,0);halo.rotation.x=Math.PI/2;
 for(let i=0;i<3;i++){const ring=part(new T.TorusGeometry(.23,.025,4,12),rune,0,.4+i*.23,0);ring.rotation.x=Math.PI/2;}
 const aura=part(new T.SphereGeometry(.48,12,8),glow,0,1.4,0);aura.scale.y=1.5;
 pose=(age,flash)=>{crystal.rotation.y=age;crystal.position.y=1.4+Math.sin(age*3)*.07;halo.rotation.z=age*.6;glow.opacity=.18+flash*.4;aura.scale.setScalar(1+flash*.4);};
 function update(age,data={}){group.visible=data.visible!==false;pose(age,Math.max(0,1-(data.shotAge??1)/.22));}
 let disposed=false;function dispose(){if(disposed)return;disposed=true;const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m)});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.clear();}
 update(0);return{group,update,dispose};
}
