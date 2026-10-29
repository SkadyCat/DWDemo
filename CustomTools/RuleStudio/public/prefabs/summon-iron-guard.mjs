export const meta=Object.freeze({id:'summon-iron-guard',name:'铁刃守卫',category:'召唤物',continuous:true,duration:3});
export function createEffect(T){
 const group=new T.Group();group.name=meta.id;const body=new T.Group();group.add(body);let pose=()=>{};
 const part=(geometry,material,x=0,y=0,z=0,parent=body)=>{const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};

 const metal=new T.MeshStandardMaterial({color:0x728ba0,metalness:.8,roughness:.3}),dark=new T.MeshStandardMaterial({color:0x25313d,metalness:.5,roughness:.5}),light=new T.MeshBasicMaterial({color:0xa8eaff,toneMapped:false});
 part(new T.BoxGeometry(.5,.65,.3),metal,0,.85,0);part(new T.BoxGeometry(.34,.3,.3),metal,0,1.35,0);part(new T.BoxGeometry(.23,.05,.03),light,0,1.37,.17);
 for(const x of [-.16,.16])part(new T.BoxGeometry(.18,.4,.2),dark,x,.32,0);
 part(new T.BoxGeometry(.18,.43,.18),metal,-.38,.84,0);part(new T.BoxGeometry(.4,.48,.09),dark,-.4,.83,.2);
 const arm=new T.Group();arm.position.set(.37,1.04,0);body.add(arm);part(new T.BoxGeometry(.16,.45,.16),metal,0,-.2,0,arm);part(new T.BoxGeometry(.08,.75,.06),light,0,-.09,.36,arm);part(new T.BoxGeometry(.3,.07,.1),metal,0,-.4,.36,arm);
 pose=(age,flash)=>{body.position.y=Math.sin(age*3)*.025;arm.rotation.x=-.3-flash*1.5;};
 function update(age,data={}){group.visible=data.visible!==false;pose(age,Math.max(0,1-(data.shotAge??1)/.22));}
 let disposed=false;function dispose(){if(disposed)return;disposed=true;const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m)});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.clear();}
 update(0);return{group,update,dispose};
}
