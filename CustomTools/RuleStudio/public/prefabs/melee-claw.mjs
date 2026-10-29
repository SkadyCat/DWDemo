// Standalone prefab. All dimensions are presentation inputs in meters.
export const meta = Object.freeze({id:"melee-claw",name:"撕裂爪痕",category:'范围与近战',duration:.75});
export function createEffect(T, options = {}) {
 const group=new T.Group();group.name=meta.id;const style="claw";
 const uniforms={clock:{value:0},fade:{value:1},color:{value:new T.Color()},inner:{value:.5},angle:{value:Math.PI/2}};
 const material=new T.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,vertexShader:"varying vec2 vUv;void main(){vUv=uv;vec4 p=vec4(position,1.);\n#ifdef USE_INSTANCING\np=instanceMatrix*p;\n#endif\ngl_Position=projectionMatrix*modelViewMatrix*p;}",
 fragmentShader:`varying vec2 vUv;uniform float clock,fade,inner,angle;uniform vec3 color;
 void main(){vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);float alpha=0.;
 float sweep=-1.15+min(1.,clock*5.)*2.3;float slash=exp(-abs(r-(.7+.15*sin(a*2.)))*55.)*exp(-abs(a-sweep)*2.2);
         alpha=slash*1.8*step(abs(a),1.5)*step(r,1.);alpha+=exp(-abs(r-.45)*65.)*exp(-abs(a-sweep)*2.)*step(abs(a),1.5);alpha+=exp(-abs(r-.9)*65.)*exp(-abs(a-sweep)*2.)*step(abs(a),1.5);
 gl_FragColor=vec4(color*2.2,alpha*fade);}`});
 const plane=new T.PlaneGeometry(2,2);plane.rotateX(-Math.PI/2);
 if(style==='line'){plane.scale(.5,1,.5);plane.translate(.5,0,0);}
 const disc=new T.Mesh(plane,material);disc.position.y=.07;group.add(disc);
 const shardMat=new T.MeshBasicMaterial({color:0xe8d5ad,transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
 const shards=new T.InstancedMesh(new T.OctahedronGeometry(1,0),shardMat,24);shards.frustumCulled=false;group.add(shards);
 const m=new T.Matrix4(),p=new T.Vector3(),s=new T.Vector3(),q=new T.Quaternion(),e=new T.Euler();
 function update(age,data={}){
  const t=Math.max(0,age),persistent=data.persistent||options.persistent;group.visible=persistent||t<meta.duration;
  const radius=Math.max(.01,data.radius??options.radius??1),element=data.element??options.element??3;
  const colors=[0xff7b2d,0x79ddff,0xb4dcff,0xffcf87,0x7cf647,0xc88aff];
  uniforms.color.value.setHex(colors[typeof element==='number'?element:['fire','frost','lightning','physical','poison','void'].indexOf(element)]??0xffffff);
  uniforms.clock.value=t;uniforms.fade.value=persistent?.5+.15*Math.sin(t*3):Math.pow(Math.max(0,1-t/meta.duration),.7);
  uniforms.inner.value=Math.min(.98,Math.max(0,(data.inner??options.inner??radius*.5)/radius));uniforms.angle.value=data.angle??options.angle??Math.PI/2;
  const length=data.length??options.length??7,width=data.width??options.width??1.2;
  disc.scale.set(style==='line'?length:radius,1,style==='line'?width:radius);
  shardMat.color.copy(uniforms.color.value).multiplyScalar(1.4);shardMat.opacity=uniforms.fade.value;
  shards.count=(style==='line'||style==='heavy')?24:0;
  for(let i=0;i<shards.count;i++){
   const a=i*2.399963,progress=Math.min(1,t*4),rise=Math.max(0,1-Math.abs(t*3-i/24*1.2));
   p.set(style==='line'?length*(i+.5)/24:Math.cos(a)*radius*progress,style==='line'?rise*.45:Math.max(.02,t*(1+(i%3)*.4)-t*t*3),style==='line'?Math.sin(i*17)*width*.4:Math.sin(a)*radius*progress);
   e.set(i,t*4,i*.7);q.setFromEuler(e);const size=style==='line'?.06+rise*.12:.045*(1-progress*.6);
   s.set(size,size*(style==='line'?2:1),size);m.compose(p,q,s);shards.setMatrixAt(i,m);
  }shards.instanceMatrix.needsUpdate=true;
 }
 let disposed=false;function dispose(){if(disposed)return;disposed=true;plane.dispose();material.dispose();shards.geometry.dispose();shardMat.dispose();group.clear();}
 update(0);return {group,update,dispose};
}
