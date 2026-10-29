// Presentation-only splats. One instanced draw contains the puddle and eight GPU spray cards.
// Seeds and elapsed ages are supplied by the adapter; no combat random numbers are consumed.
export function createGroundField(T, { id, color, mirror = false }, capacity = 32) {
  const group = new T.Group(); group.name = id;
  const material = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.NormalBlending,
    uniforms: { color: { value: new T.Color(color) }, mirror: { value: mirror ? 1 : 0 } },
    vertexShader: `attribute float splashPart;attribute vec4 instanceLook;
      varying vec2 vUv;varying vec4 vLook;varying float vPart,vFade;
      float h(float n){return fract(sin(n*127.1+311.7)*43758.5453);}
      void main(){vUv=uv;vLook=instanceLook;vPart=splashPart;vFade=instanceLook.w;
        vec4 p=vec4(position,1.);float seed=instanceLook.x*.08447265625;
        if(splashPart>.5){
          float k=seed+splashPart*7.13,delay=h(k+1.)*.18,period=2.1+h(k+2.)*3.9;
          float age=max(0.,instanceLook.y-delay),cycle=floor(age/period);
          float life=.32+h(k+3.)*.38,progress=mod(age,period)/life;
          float showDrop=step(delay,instanceLook.y)*(1.-step(1.,progress));progress=clamp(progress,0.,1.);
          float angle=h(k+4.)*6.2831853,reach=mix(.45+h(k+5.)*.42,.08+h(k+5.)*.18,step(.5,cycle));
          vec2 origin=step(.5,cycle)*(vec2(h(k+6.),h(k+7.))-.5)*.8;
          float height=mix(.22+h(k+8.)*.38,.08+h(k+8.)*.13,step(.5,cycle));
          p=vec4(origin+vec2(cos(angle),sin(angle))*reach*progress,0.,1.);
          p=vec4(p.x,4.*height*progress*(1.-progress),p.y,1.);
          vFade*=showDrop*(1.-progress*.65);
          #ifdef USE_INSTANCING
          float radius=length(instanceMatrix[0].xyz);
          p=instanceMatrix*p;
          #else
          float radius=1.;
          #endif
          vec4 view=viewMatrix*modelMatrix*p;
          float size=(.035+h(k+9.)*.055)*sqrt(radius)*showDrop*pow(max(0.,sin(progress*3.14159265)),.3);
          view.xy+=(uv-.5)*vec2(.85,1.5)*size;gl_Position=projectionMatrix*view;
        }else{
      #ifdef USE_INSTANCING
      p=instanceMatrix*p;
      #endif
          gl_Position=projectionMatrix*modelViewMatrix*p;
        }
      }`,
    fragmentShader: `varying vec2 vUv;varying vec4 vLook;varying float vPart,vFade;uniform vec3 color;uniform float mirror;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
      float join(float a,float b,float k){float s=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,s)-k*s*(1.-s);}
      void main(){
        if(vFade<.002)discard;
        vec2 p=vUv*2.-1.;
        if(vPart>.5){float d=length(p*vec2(1.,.8));if(d>1.)discard;
          float shine=pow(max(0.,1.-length(p-vec2(-.25,.3))),5.);
          gl_FragColor=vec4(mix(color,vec3(1.),shine*.45),smoothstep(1.,.55,d)*vFade*.8);return;}
        // Quantize the interpolated seed before hashing: interpolation ULPs must
        // not turn one droplet or shoreline into per-pixel salt-and-pepper noise.
        float seed=floor(vLook.x+.5)*.03125,age=vLook.y,speed=vLook.z;
        float spread=.16+.84*(1.-exp(-age*(5.+speed*3.)));
        p/=spread;
        // An asymmetric union of liquid lobes and a narrow thrown streak; no circular rim.
        vec2 q=p+(vec2(n(p*4.+seed),n(p*4.-seed+19.))-.5)*.21;
        float d=(length(q/vec2(.64,.41))-1.)*.41;
        vec2 offset=vec2(.26+h(vec2(seed,1.))*.12,.16+h(vec2(seed,2.))*.1);
        d=join(d,(length((q-offset)/vec2(.35,.24))-1.)*.24,.12);
        vec2 lobe=vec2(.21+h(vec2(seed,3.))*.16,.16+h(vec2(seed,4.))*.14);
        d=join(d,(length((q+lobe)/vec2(.19+h(vec2(seed,5.))*.12,.26))-1.)*.24,.1);
        d=join(d,length(vec2(max(abs(q.x-.54)-.22,0.),q.y+.15))-.035,.07);
        // Detached beads around the main stain are stable in shape, with individually seeded cells.
        vec2 cell=floor(p*7.),local=fract(p*7.);
        vec2 dotCenter=vec2(.18)+vec2(h(cell+seed),h(cell-seed+8.))*.64;
        float bead=(length((local-dotCenter)/vec2(.14+.12*h(cell+seed+5.),.10+.08*h(cell-seed+3.)))-1.)*.035;
        if(h(cell+seed+13.)>.84 && length((cell+dotCenter)/7.)<.94)d=min(d,bead);
        float mask=1.-smoothstep(-.012,.018,d);if(mask<.005)discard;
        vec2 flow=vec2(.8,.35)*age*speed;
        float liquid=n(q*8.+seed+flow),detail=n(q*19.-flow*.7+seed);
        float edge=exp(-abs(d)*55.),shine=smoothstep(.65,.88,liquid*.7+detail*.3);
        float alpha=mask*(.20+liquid*.14+edge*.13+shine*.07)*min(1.,age*7.)*vFade;
        float reflection=mirror*pow(max(0.,1.-abs(fract((q.x+q.y*.6)*3.-age*.35)-.5)*2.),12.);
        gl_FragColor=vec4(color*(.5+liquid*.42)+shine*.07+reflection*.45,alpha+reflection*mask*.18*vFade);
      }` });
  const positions = [-1, 0, 1, 1, 0, 1, -1, 0, -1, 1, 0, -1], uvs = [0, 0, 1, 0, 0, 1, 1, 1];
  const parts = [0, 0, 0, 0], indices = [0, 2, 1, 2, 3, 1];
  for (let part = 1; part <= 8; part++) {
    const base = positions.length / 3;
    positions.push(...Array(12).fill(0)); uvs.push(0, 0, 1, 0, 0, 1, 1, 1); parts.push(part, part, part, part);
    indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('splashPart', new T.Float32BufferAttribute(parts, 1)); geometry.setIndex(indices);
  const look = new T.InstancedBufferAttribute(new Float32Array(capacity * 4), 4); look.setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('instanceLook', look);
  const mesh = new T.InstancedMesh(geometry, material, capacity); mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.count = 0; mesh.frustumCulled = false; group.add(mesh);
  const matrix = new T.Matrix4(), position = new T.Vector3(), scale = new T.Vector3(), rotation = new T.Quaternion();
  const random = (seed, k) => ((Math.imul((seed + k * 374761393) | 0, 1664525) + 1013904223) >>> 0) / 4294967296;
  function update(rows, time = 0) {
    let i = 0;
    for (const row of rows) {
      if (i >= capacity) break;
      const seed = row.seed ?? ((Math.round(row.x * 1000) * 73856093) ^ (Math.round(row.z * 1000) * 19349663));
      position.set(row.x, .055 + (row.y ?? 0), row.z); scale.set(row.radius ?? 1, 1, row.radius ?? 1);
      rotation.setFromAxisAngle(T.Object3D.DEFAULT_UP, random(seed, 1) * Math.PI * 2);
      look.setXYZW(i, 1 + Math.floor(random(seed, 2) * 2048), Math.max(0, row.age ?? time), .35 + random(seed, 3) * 1.2,
        row.left == null ? 1 : Math.min(1, Math.max(0, row.left) / .35));
      matrix.compose(position, rotation, scale); mesh.setMatrixAt(i++, matrix);
    }
    mesh.count = i; mesh.instanceMatrix.needsUpdate = true; look.needsUpdate = true;
  }
  let disposed = false;
  function dispose() { if (disposed) return; disposed = true; mesh.geometry.dispose(); material.dispose(); group.clear(); }
  return { group, update, dispose };
}
export function groundEffect(T, spec) {
  const batch = createGroundField(T, spec, 1);
  return { ...batch, update(age, data = {}) { batch.update([{ x: 0, z: 0, radius: data.radius ?? 1.6, seed: data.seed ?? 47, age, left: data.left }], age); } };
}
