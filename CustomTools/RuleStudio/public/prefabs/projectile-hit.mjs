// Standalone impact prefab. Three.js and copied visual inputs are its only dependencies.
export const meta = Object.freeze({ id: 'projectile-hit', name: '投射物命中', category: '命中', duration: .55,
  elements: ['fire', 'frost', 'lightning', 'physical', 'poison', 'void'] });
const PALETTE = [0xf58b30, 0x71c8e5, 0xa0d8ff, 0xb39c79, 0x86bc35, 0xb074ed];
const LIFETIME = [.36, .45, .22, .25, .5, .45];
const random = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

const solidVertex = `
attribute vec3 impactColor; attribute float impactAlpha;
varying vec3 tint; varying float opacityHit; varying float shade;
void main(){
  tint=impactColor;opacityHit=impactAlpha;
  vec3 n=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*normal);
  shade=.68+.32*max(0.,dot(n,normalize(vec3(.4,1.,.35))));
  gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);
}`;
const solidFragment = `
varying vec3 tint;varying float opacityHit;varying float shade;
void main(){gl_FragColor=vec4(tint*shade,opacityHit);
#include <colorspace_fragment>
}`;
const spriteVertex = `
attribute vec3 impactColor;attribute float impactAlpha;attribute float impactStyle;
attribute float impactPhase;attribute float impactSpin;attribute float impactSeed;
varying vec2 uvHit;varying vec3 tint;varying float opacityHit;varying float styleHit;
varying float phaseHit;varying float seedHit;
void main(){
  uvHit=uv;tint=impactColor;opacityHit=impactAlpha;styleHit=impactStyle;phaseHit=impactPhase;seedHit=impactSeed;
  vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
  vec2 size=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
  float c=cos(impactSpin),s=sin(impactSpin);
  center.xy+=mat2(c,s,-s,c)*(position.xy*size);
  gl_Position=projectionMatrix*center;
}`;
const spriteFragment = `
varying vec2 uvHit;varying vec3 tint;varying float opacityHit;varying float styleHit;
varying float phaseHit;varying float seedHit;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+1.),f.x),f.y);}
void main(){
  vec2 p=uvHit*2.-1.;float t=phaseHit;
  float grain=noise(p*4.5+vec2(seedHit*13.,-t*3.));
  float r=length(p);float mask=pow(max(0.,1.-r+(grain-.5)*.25),1.8);
  vec3 color=tint;
  if(styleHit<.5){
    float width=.68*(1.-uvHit.y)+.08;
    float bend=sin(p.y*4.-t*7.+seedHit*6.)*.13;
    float flame=(1.-smoothstep(width*.25,width,abs(p.x+bend)));
    mask=flame*smoothstep(-1.,-.6,p.y)*(1.-smoothstep(-.25,.85,p.y+(grain-.5)*.7));
    color=mix(tint*.65,vec3(1.,.65,.2),pow(max(0.,1.-r),2.));
  }else if(styleHit<1.5){
    mask*=.7+grain*.3;
  }else if(styleHit<2.5){
    float a=exp(-abs(p.x+p.y*.3)*38.)*exp(-abs(p.y)*5.);
    float b=exp(-abs(p.y-p.x*.6)*42.)*exp(-abs(p.x)*5.);
    mask=(a+b)*(1.-t);color=mix(tint,vec3(.9,.96,1.),.35);
  }else if(styleHit<3.5){
    mask*=grain*.55+.25;
  }else if(styleHit<4.5){
    float edge=r+(grain-.5)*.42;
    mask=(1.-smoothstep(.45,.92,edge))*(.75+grain*.25);
    color=mix(tint*.6,tint,grain);
  }else{
    float angle=atan(p.y,p.x);
    mask*=.4+.6*pow(.5+.5*sin(angle*3.+r*8.-t*4.),2.);
    color=mix(tint*.55,tint,grain*.7);
  }
  float alpha=clamp(mask*opacityHit,0.,1.);
  if(alpha<.003)discard;
  gl_FragColor=vec4(color,alpha);
#include <colorspace_fragment>
}`;

export function createBatch(T, capacity = 256) {
  capacity = Math.max(1, Math.floor(capacity));
  const group = new T.Group(); group.name = meta.id;
  const batches = [];
  function make(name, geometry, perHit, { sprite = false, additive = false } = {}) {
    const count = capacity * perHit;
    const attributes = {};
    for (const [key, width] of [['impactColor',3],['impactAlpha',1],['impactStyle',1],['impactPhase',1],['impactSpin',1],['impactSeed',1]]) {
      const attribute = new T.InstancedBufferAttribute(new Float32Array(count * width), width);
      attribute.setUsage(T.DynamicDrawUsage); geometry.setAttribute(key, attribute); attributes[key] = attribute;
    }
    const material = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide,
      blending: additive ? T.AdditiveBlending : T.NormalBlending,
      vertexShader: sprite ? spriteVertex : solidVertex, fragmentShader: sprite ? spriteFragment : solidFragment });
    const mesh = new T.InstancedMesh(geometry, material, count); mesh.name = name;
    mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    group.add(mesh);
    const batch = { mesh, attributes, limit: count, count: 0 }; batches.push(batch); return batch;
  }
  const chips = make('ice-fragments', new T.OctahedronGeometry(1,0), 8);
  const streaks = make('embers-and-arcs', new T.CylinderGeometry(1,1,1,4), 12, { additive: true });
  const droplets = make('poison-droplets', new T.SphereGeometry(1,8,5), 7);
  const clouds = make('element-puffs', new T.PlaneGeometry(2,2), 5, { sprite: true });
  // One small contact mark per impact, rather than an expanding circular outline.
  const contact = make('impact-contact', new T.PlaneGeometry(2,2), 1, { sprite: true });
  const matrix = new T.Matrix4(), position = new T.Vector3(), scale = new T.Vector3();
  const rotation = new T.Quaternion(), orientation = new T.Quaternion(), identity = new T.Quaternion();
  const forward = new T.Vector3(0,0,1), up = new T.Vector3(0,1,0), axis = new T.Vector3();
  const origin = new T.Vector3(), offset = new T.Vector3(), a = new T.Vector3(), b = new T.Vector3(), direction = new T.Vector3();
  const color = new T.Color(), tint = new T.Color(), euler = new T.Euler();
  function put(batch, p, q, s, c, alpha, style, phase, spin = 0, seed = 0) {
    if (batch.count >= batch.limit) return;
    const i = batch.count++, attrs = batch.attributes;
    matrix.compose(p,q,s); batch.mesh.setMatrixAt(i,matrix);
    attrs.impactColor.setXYZ(i,c.r,c.g,c.b); attrs.impactAlpha.setX(i,Math.max(0,alpha));
    attrs.impactStyle.setX(i,style); attrs.impactPhase.setX(i,phase);
    attrs.impactSpin.setX(i,spin); attrs.impactSeed.setX(i,seed);
  }
  function place(x,y,z,ground) {
    offset.set(x,y,ground ? Math.abs(z) : z).applyQuaternion(rotation);
    position.copy(origin).add(offset); position.y = Math.max(.035,position.y);
  }
  function segment(start,end,width,c,alpha,style,phase) {
    direction.subVectors(end,start); const length = direction.length();
    if (length < 1e-5) return;
    orientation.setFromUnitVectors(up,direction.multiplyScalar(1/length));
    position.copy(start).add(end).multiplyScalar(.5); scale.set(width,length,width);
    put(streaks,position,orientation,scale,c,alpha,style,phase);
  }
  let disposed = false;
  function update(rows) {
    for (const batch of batches) batch.count = 0;
    let hits = 0;
    for (const row of rows) {
      const age = Math.max(0,row.age ?? 0);
      if (age >= meta.duration || hits >= capacity) { if (hits >= capacity) break; continue; }
      const el = typeof row.element === 'number' ? row.element : meta.elements.indexOf(row.element);
      const style = el >= 0 && el < 6 ? el : 3;
      const t = age, u = Math.min(1,t/LIFETIME[style]), fade = Math.pow(1-u,1.4);
      const size = Math.min(1.4,Math.max(.65,row.scale ?? .7+(row.radius ?? .2)*1.4));
      const ground = row.surface === 'ground';
      origin.set(row.x,Math.max(.07,row.y ?? .6),row.z);
      axis.set(row.dx ?? 1,row.dy ?? 0,row.dz ?? 0);
      if (axis.lengthSq()<1e-8) axis.copy(forward); axis.normalize();
      rotation.setFromUnitVectors(forward,ground ? up : axis);
      color.setHex(PALETTE[style]);
      // Tiny, quickly fading center: no shield-like hoop or long-lived white core.
      const flash = style === 2 ? .17 : style === 4 ? .17+u*.13 : style === 5 ? .22*(1-u) : .14+u*.08;
      scale.setScalar(Math.max(.001,flash*size));
      const flashAlpha = style === 1 ? fade*.22 : style === 2 ? Math.exp(-t*27) : style === 3 ? fade*.16 : style === 5 ? fade*.5 : fade*.42;
      put(contact,origin,identity,scale,color,flashAlpha,style,u,0,.3);
      if (fade>0) {
        if (style===1) for (let i=0;i<8;i++) {
          const angle=i*2.399963,seed=random(i),reach=(1-Math.exp(-t*16))*(.12+seed*.26)*size;
          place(Math.cos(angle)*reach,Math.sin(angle)*reach*.75,-t*(.7+seed)*size,ground);
          position.y=Math.max(.035,position.y-t*t*2.3);
          euler.set(i+t*(3+seed*5),angle+t*2,seed*4); orientation.setFromEuler(euler);
          const chip=(.7+seed*.6)*size*Math.sqrt(fade);
          scale.set(.018*chip,.026*chip,(.055+seed*.035)*chip);
          tint.setHex(i%3===0 ? 0xaedce9 : i%3===1 ? 0x5ca9c7 : 0x80c8e3);
          put(chips,position,orientation,scale,tint,fade*.88,style,u);
        }
        if (style===0 || style===1 || style===3 || style===4 || style===5) {
          const count=style===3 ? 2 : style===5 ? 5 : 4;
          for (let i=0;i<count;i++) {
            const seed=random(i+40),angle=i*2.399963+(style===5 ? u*3 : 0);
            const reach=style===5 ? .24*(1-u)*(1-u)*size : t*(.65+seed)*size;
            place(Math.cos(angle)*reach,Math.sin(angle)*reach*.7,-t*.45*size,ground);
            if (style===0) position.y+=t*.6;
            const width=(style===0 ? .085+u*.07 : style===1 ? .1+u*.2 : style===4 ? .1+u*.12 : style===5 ? .07+u*.02 : .09+u*.18)*size;
            scale.set(width,style===0 ? width*(1.9+seed) : style===5 ? width*2.2 : width*.8,1);
            tint.copy(color);
            if (style===1) tint.multiplyScalar(.8);
            if (style===3) tint.setHex(0x8f8371);
            if (style===5) tint.multiplyScalar(.8+seed*.2);
            const opacity=fade*(style===0 ? .65 : style===1 ? .2 : style===4 ? .32 : style===5 ? .5 : .16);
            put(clouds,position,identity,scale,tint,opacity,style,u,style===5 ? angle : (seed-.5)*.5,seed);
          }
        }
        if (style===4) for (let i=0;i<7;i++) {
          const seed=random(i+10),angle=i*2.399963,reach=t*(1.2+seed*1.5)*size;
          place(Math.cos(angle)*reach,Math.sin(angle)*reach,-t*(1+seed)*size,ground);
          position.y=Math.max(.035,position.y-t*t*5);
          const radius=(.021+seed*.016)*size*Math.sqrt(fade);
          scale.set(radius,radius*(1.3+u),radius); tint.setHex(i%2 ? 0x9dce45 : 0x477a29);
          put(droplets,position,identity,scale,tint,fade*.85,style,u);
        }
        if (style===0 || style===3) for (let i=0;i<(style===0 ? 7 : 5);i++) {
          const seed=random(i+80),angle=i*2.399963,reach=t*(1.3+seed*1.6)*size;
          place(Math.cos(angle)*reach,Math.sin(angle)*reach,-t*size,ground);
          position.y=Math.max(.035,position.y-t*t*2);
          a.copy(position); direction.copy(offset).normalize();
          b.copy(a).addScaledVector(direction,(.045+seed*.055)*size*fade);
          tint.setHex(style===0 ? (i%2 ? 0xe5a042 : 0xb64d20) : 0xbba477);
          segment(a,b,.004*size*fade,tint,fade*.75,style,u);
        }
        if (style===2) for (let branch=0;branch<4;branch++) {
          const angle=branch*1.7+random(branch+30),length=(.26+random(branch+9)*.15)*size;
          a.copy(origin);
          for (let k=1;k<=3;k++) {
            const jitter=(random(branch*11+k+Math.floor(t*35))-.5)*.1*size;
            offset.set(Math.cos(angle)*length*k/3-Math.sin(angle)*jitter,Math.sin(angle)*length*k/3+Math.cos(angle)*jitter,-.045*size*k).applyQuaternion(rotation);
            b.copy(origin).add(offset); b.y=Math.max(.04,b.y);
            tint.setHex(k===1 ? 0xc5e6f5 : 0x6ab3e0);
            segment(a,b,(k===1 ? .006 : .004)*size*fade,tint,fade,style,u);
            a.copy(b);
          }
        }
      }
      hits++;
    }
    for (const batch of batches) {
      batch.mesh.count=batch.count;batch.mesh.instanceMatrix.needsUpdate=true;
      for (const attribute of Object.values(batch.attributes)) attribute.needsUpdate=true;
    }
  }
  function dispose(){if(disposed)return;disposed=true;for(const batch of batches){batch.mesh.geometry.dispose();batch.mesh.material.dispose();}group.clear();}
  return {group,update,dispose};
}

export function createEffect(T, options = {}) {
  const batch=createBatch(T,1);
  return {...batch,update(age,data={}){batch.update([{x:0,y:.8,z:0,dx:1,dy:0,dz:0,...options,...data,age}]);}};
}
