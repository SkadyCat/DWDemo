export const meta=Object.freeze({id:'summon-fire-turret',name:'火球炮台',category:'召唤物',continuous:true,duration:3});
export function createEffect(T){
 const group=new T.Group();group.name=meta.id;const body=new T.Group();group.add(body);let pose=()=>{};
 const part=(geometry,material,x=0,y=0,z=0,parent=body)=>{const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};

 const stone=new T.MeshStandardMaterial({color:0x40332c,metalness:.45,roughness:.55}),metal=new T.MeshStandardMaterial({color:0xa37438,metalness:.7,roughness:.3}),fire=new T.MeshBasicMaterial({color:0xff8c32,toneMapped:false}),glow=new T.MeshBasicMaterial({color:0xff6b18,transparent:true,opacity:.18,blending:T.AdditiveBlending,depthWrite:false});
 part(new T.CylinderGeometry(.43,.52,.25,8),stone,0,.13,0);part(new T.CylinderGeometry(.18,.3,.6,8),metal,0,.54,0);
 const barrel=new T.Group();barrel.position.y=.94;body.add(barrel);const gun=part(new T.CylinderGeometry(.18,.24,.7,10),metal,0,0,.28,barrel);gun.rotation.x=Math.PI/2;
 part(new T.SphereGeometry(.2,12,8),fire,0,0,.67,barrel);const aura=part(new T.SphereGeometry(.32,12,8),glow,0,0,.67,barrel);
 for(const x of [-.35,.35]){const brace=part(new T.BoxGeometry(.14,.55,.14),stone,x,.5,0);brace.rotation.z=x>0?-.3:.3;}
 pose=(age,flash)=>{barrel.position.z=-flash*.13;fire.color.setHex(flash>.1?0xffe4a1:0xff8c32);glow.opacity=.18+flash*.4;aura.scale.setScalar(1+Math.sin(age*6)*.08+flash*.3);};
 function update(age,data={}){group.visible=data.visible!==false;pose(age,Math.max(0,1-(data.shotAge??1)/.22));}
 let disposed=false;function dispose(){if(disposed)return;disposed=true;const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m)});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.clear();}
 update(0);return{group,update,dispose};
}
