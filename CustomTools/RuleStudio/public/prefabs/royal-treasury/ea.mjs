// Presentation only. Positions, direction and damage are supplied by real rule carriers.
import { acquirePortalTextures } from './portal-textures.mjs';
import { createEffect as createExplosion } from '../element-explosion.mjs';
export const meta = Object.freeze({ id: 'projectile-treasury-ea', name: '天地乖离剑', category: '投射物', continuous: true, duration: 1.8, previewHeight: 5 });
export const portalDuration = .52;
const clamp = value => Math.max(0, Math.min(1, value));

function swordGeometry(T) {
  const positions = [], colors = [], color = new T.Color();
  const parts = [
    [[[-.14,-3.7],[-.38,-2.8],[-.31,-.85],[0,0],[.31,-.85],[.38,-2.8],[.14,-3.7]],0x251420],
    [[[-.14,-3.6],[-.28,-2.7],[-.21,-.9],[0,-.08],[-.05,-1],[-.07,-3.6]],0xffd080],
    [[[.14,-3.6],[.28,-2.7],[.21,-.9],[0,-.08],[.05,-1],[.07,-3.6]],0xff914e],
    [[[-.055,-3.62],[-.085,-1.1],[0,-.23],[.085,-1.1],[.055,-3.62]],0xff2647],
    [[[-.95,-3.88],[-.67,-3.46],[-.12,-3.64],[.12,-3.64],[.67,-3.46],[.95,-3.88],[.55,-3.77],[0,-3.96],[-.55,-3.77]],0xe4ad53],
    [[[-.1,-5.1],[-.1,-3.9],[.1,-3.9],[.1,-5.1]],0x4b122a],
    [[[-.16,-5.25],[-.16,-5.05],[.16,-5.05],[.16,-5.25]],0xffd36a],
  ];
  for (const [layer,[points,tint]] of parts.entries()) {
    const shape = new T.Shape(points.map(([x,y]) => new T.Vector2(x,y)));
    const depth=.13+layer*.012,geometry = new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false});
    geometry.translate(0,0,-depth/2); geometry.rotateX(Math.PI/2);
    const plain = geometry.index ? geometry.toNonIndexed() : geometry;
    positions.push(...plain.attributes.position.array); color.setHex(tint);
    for(let i=0;i<plain.attributes.position.count;i++)colors.push(color.r,color.g,color.b);
    if(plain!==geometry)plain.dispose();geometry.dispose();
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geometry.computeBoundingSphere(); return geometry;
}

export function createBatch(T, capacity = 64) {
  const group = new T.Group(); group.name=meta.id;
  const assets = acquirePortalTextures(T), geometry=swordGeometry(T);
  const emerged = new T.InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('emerged',emerged);
  const material=new T.ShaderMaterial({vertexColors:true,toneMapped:false,side:T.DoubleSide,
    vertexShader:'attribute float emerged;varying vec3 tint;varying float front;void main(){tint=color;front=position.z+emerged;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 tint;varying float front;
      void main(){if(front<0.)discard;gl_FragColor=vec4(tint*1.15,1.);
      #include <colorspace_fragment>
      }`});
  const sword=new T.InstancedMesh(geometry,material,capacity);sword.frustumCulled=false;sword.count=0;group.add(sword);
  const portalGeometry=new T.PlaneGeometry(2,2), timing=new T.InstancedBufferAttribute(new Float32Array(capacity*2),2).setUsage(T.DynamicDrawUsage);
  portalGeometry.setAttribute('timing',timing);
  const portalMaterial=new T.ShaderMaterial({transparent:true,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,
    uniforms:{art:{value:assets.textures[0]}},
    vertexShader:'attribute vec2 timing;varying vec2 uv0;varying vec2 clock;void main(){uv0=uv;clock=timing;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
    fragmentShader:`uniform sampler2D art;varying vec2 uv0;varying vec2 clock;
      void main(){vec2 p=uv0-.5;float a=clock.x*.35,c=cos(a),s=sin(a);vec2 uv=mat2(c,-s,s,c)*p+.5;
      vec4 tex=texture2D(art,uv);float r=length(p)*2.;float outer=exp(-abs(r-.91)*150.);float inner=exp(-abs(r-.69)*130.);
      float glyph=pow(max(0.,cos(atan(p.y,p.x)*24.+clock.x*2.)),16.)*exp(-abs(r-.8)*90.);
      float ink=max(tex.r,max(tex.g,tex.b));vec3 color=mix(vec3(1.6,.06,.16),vec3(1.6,.9,.2),clamp(inner+outer+glyph,0.,1.));
      gl_FragColor=vec4(color*(ink+outer+inner+glyph),max(tex.a,outer+inner+glyph)*clock.y);
      #include <colorspace_fragment>
      }`});
  const portal=new T.InstancedMesh(portalGeometry,portalMaterial,capacity);portal.frustumCulled=false;portal.count=0;group.add(portal);
  const matrix=new T.Matrix4(),position=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3(),direction=new T.Vector3(),forward=new T.Vector3(0,0,1);
  function orient(row){position.set(row.x,row.y,row.z);direction.set(row.dx,row.dy,row.dz);if(direction.lengthSq()<1e-8)direction.set(0,-1,0);rotation.setFromUnitVectors(forward,direction.normalize());}
  function update(rows, time = 0, portals = []) {
    let n=0;
    for(const row of rows){if(n>=capacity)break;orient(row);const size=Math.max(.7,Math.min(2,(row.radius??.6)/.6));
      const launch=row.launch;
      emerged.setX(n,launch?Math.max(0,(row.x-launch.x)*launch.dx+(row.y-launch.y)*launch.dy+(row.z-launch.z)*launch.dz)/size:1e6);
      scale.setScalar(size);matrix.compose(position,rotation,scale);sword.setMatrixAt(n++,matrix);}
    sword.count=n;sword.instanceMatrix.needsUpdate=true;emerged.needsUpdate=true;n=0;
    for(const row of portals){if(n>=capacity)break;const age=row.age;if(age<0||age>=portalDuration)continue;orient(row);
      const open=1-(1-clamp(age/.055))**3,fade=1-clamp((age-.18)/(portalDuration-.18));
      scale.setScalar(3.2*(.015+.985*open)*(1+.07*Math.sin(age*22)));matrix.compose(position,rotation,scale);portal.setMatrixAt(n,matrix);
      timing.setXY(n++,age,fade);}
    portal.count=n;portal.instanceMatrix.needsUpdate=true;timing.needsUpdate=true;
  }
  let disposed=false;
  return {group,update,ready:assets.ready,dispose(){if(disposed)return;disposed=true;geometry.dispose();material.dispose();portalGeometry.dispose();portalMaterial.dispose();assets.release();group.clear();}};
}
export function createEffect(T) {
  const batch=createBatch(T,1),launch={x:0,y:6,z:0,dx:6/8.2,dy:-5.4/8.2,dz:-1/8.2,radius:.6};
  return {...batch,update(age){const t=age%1.8;batch.update(t<.8?[{x:launch.x+launch.dx*t*10,y:launch.y+launch.dy*t*10,z:launch.z+launch.dz*t*10,dx:launch.dx,dy:launch.dy,dz:launch.dz,radius:.6,launch}]:[],age,[{...launch,age:t}]);}};
}
export const impact=Object.freeze({meta:{id:'treasury-ea-impact',name:'乖离剑轰击',category:'爆炸',duration:.9},createEffect(T){return createExplosion(T,{element:3});}});
