// Self-contained status presentation; the caller supplies only transforms and visual strength.
export const meta=Object.freeze({id:"status-ignite",name:"点燃",category:'状态',continuous:true,duration:3});
export function createBatch(T,capacity=96){
 const group=new T.Group();group.name=meta.id;const kind="ignite",pieces=7;
 const material=new T.MeshBasicMaterial({color:16742692,transparent:true,opacity:.7,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,toneMapped:false});
 const geometry=new T.ConeGeometry(1,1,5);const mesh=new T.InstancedMesh(geometry,material,capacity*pieces);mesh.frustumCulled=false;mesh.count=0;group.add(mesh);
 const m=new T.Matrix4(),p=new T.Vector3(),s=new T.Vector3(),q=new T.Quaternion(),e=new T.Euler(),up=new T.Vector3(0,1,0),d=new T.Vector3();
 function update(rows,time=0){let n=0;for(const row of rows.slice(0,capacity)){
  const radius=Math.max(.2,row.radius??.45),height=row.height??1.5,power=Math.min(1.7,1+Math.log2(1+(row.stacks??1))*.08);
  for(let j=0;j<pieces;j++){
   const phase=time*(kind==='bleed'?2.5:1.2)+j/pieces,a=j*2.399963+time*(kind==='slow'?-1:1),u=(phase%1+1)%1;
   p.set(row.x+Math.cos(a)*radius*.9,(row.y??0)+.1+u*height,row.z+Math.sin(a)*radius*.9);e.set(time+j,a,0);s.setScalar(.055*power);
   p.y=(row.y??0)+height*(.1+u*.65);s.set(.09*(1-u)*power,.3*(1-u)*power,.09*(1-u)*power);e.set(0,a,Math.sin(time*8+j)*.3);
   if(kind!=='shock')q.setFromEuler(e);m.compose(p,q,s);mesh.setMatrixAt(n++,m);
  }
 }mesh.count=n;mesh.instanceMatrix.needsUpdate=true;material.opacity=.7*(.85+.15*Math.sin(time*8));}
 let disposed=false;function dispose(){if(disposed)return;disposed=true;geometry.dispose();material.dispose();group.clear();}
 return {group,update,dispose};
}
export function createEffect(T){const batch=createBatch(T,1);return {...batch,update(age){batch.update([{x:0,y:0,z:0,radius:.55,height:1.6,stacks:5}],age);}};}
