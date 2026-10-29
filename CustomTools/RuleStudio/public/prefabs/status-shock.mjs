// Self-contained status presentation; the caller supplies only transforms and visual strength.
export const meta=Object.freeze({id:"status-shock",name:"感电",category:'状态',continuous:true,duration:3});
export function createBatch(T,capacity=96){
 const group=new T.Group();group.name=meta.id;const kind="shock",pieces=8;
 const material=new T.MeshBasicMaterial({color:16771704,transparent:true,opacity:.7,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,toneMapped:false});
 const geometry=new T.CylinderGeometry(1,1,1,4);const mesh=new T.InstancedMesh(geometry,material,capacity*pieces);mesh.frustumCulled=false;mesh.count=0;group.add(mesh);
 const m=new T.Matrix4(),p=new T.Vector3(),s=new T.Vector3(),q=new T.Quaternion(),e=new T.Euler(),up=new T.Vector3(0,1,0),d=new T.Vector3();
 function update(rows,time=0){let n=0;for(const row of rows.slice(0,capacity)){
  const radius=Math.max(.2,row.radius??.45),height=row.height??1.5,power=Math.min(1.7,1+Math.log2(1+(row.stacks??1))*.08);
  for(let j=0;j<pieces;j++){
   const phase=time*(kind==='bleed'?2.5:1.2)+j/pieces,a=j*2.399963+time*(kind==='slow'?-1:1),u=(phase%1+1)%1;
   p.set(row.x+Math.cos(a)*radius*.9,(row.y??0)+.1+u*height,row.z+Math.sin(a)*radius*.9);e.set(time+j,a,0);s.setScalar(.055*power);
   const yy=(j+.5)/pieces*height,zig=Math.sin(time*35+j*5)*radius*.4;
        p.set(row.x+Math.cos(j*1.7)*radius+zig,(row.y??0)+yy,row.z+Math.sin(j*1.7)*radius);d.set(.14*Math.sin(j+time*30),height/pieces,.16*Math.cos(j*3+time*22));q.setFromUnitVectors(up,d.clone().normalize());s.set(.013*power,d.length()*1.8,.013*power);
   if(kind!=='shock')q.setFromEuler(e);m.compose(p,q,s);mesh.setMatrixAt(n++,m);
  }
 }mesh.count=n;mesh.instanceMatrix.needsUpdate=true;material.opacity=.7*(.85+.15*Math.sin(time*8));}
 let disposed=false;function dispose(){if(disposed)return;disposed=true;geometry.dispose();material.dispose();group.clear();}
 return {group,update,dispose};
}
export function createEffect(T){const batch=createBatch(T,1);return {...batch,update(age){batch.update([{x:0,y:0,z:0,radius:.55,height:1.6,stacks:5}],age);}};}
