// A launch portal, not a maintained skill object. One instance per real emission.
import { treasuryVariant } from './weapons.mjs';
import { acquirePortalTextures } from './portal-textures.mjs';
export const meta = Object.freeze({ id: 'royal-treasury-gate', name: '王之宝库法阵', category: '法阵', duration: .32 });
const smooth = (a, b, t) => { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return u * u * (3 - 2 * u); };
export function portalEnvelope(age) {
  if (age < 0 || age >= meta.duration) return { size: 0, strength: 0 };
  const opening = Math.min(1, age / .035), fade = smooth(.12, meta.duration, age);
  return { size: (.025 + .975 * (1 - (1 - opening) ** 3)) * (1 + .14 * Math.sin(Math.min(1, age / .09) * Math.PI)) * (1 - .85 * fade),
    strength: (1.1 + .6 * Math.exp(-age * 35)) * (1 - fade) };
}
export function createBatch(T, capacity = 512) {
  const group = new T.Group(); group.name = meta.id;
  const assets = acquirePortalTextures(T);
  const geometry = new T.PlaneGeometry(2, 2);
  const timing = new T.InstancedBufferAttribute(new Float32Array(capacity * 2), 2); timing.setUsage(T.DynamicDrawUsage); geometry.setAttribute('portalTiming', timing);
  const styles = new T.InstancedBufferAttribute(new Float32Array(capacity), 1); styles.setUsage(T.DynamicDrawUsage); geometry.setAttribute('portalStyle', styles);
  const material = new T.ShaderMaterial({ transparent: true, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending,
    toneMapped: false,
    uniforms: { swordPortal: { value: assets.textures[0] }, bowPortal: { value: assets.textures[1] }, axePortal: { value: assets.textures[2] } },
    vertexShader: `attribute vec2 portalTiming;attribute float portalStyle;varying vec2 vUv;varying vec2 timing;varying float style;
      void main(){vUv=uv;timing=portalTiming;style=portalStyle;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform sampler2D swordPortal;uniform sampler2D bowPortal;uniform sampler2D axePortal;
      varying vec2 vUv;varying vec2 timing;varying float style;
      vec2 rotate(vec2 p,float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c)*p;}
      void main(){
        float angle=style<.5?timing.x*.35:style<1.5?sin(timing.x*6.)*.06:-timing.x*1.3;
        vec2 uv=rotate((vUv-.5)*1.12,angle)+.5;
        if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))discard;
        vec4 art;
        if(style<.5)art=texture2D(swordPortal,uv);
        else if(style<1.5)art=texture2D(bowPortal,uv);
        else art=texture2D(axePortal,uv);
        gl_FragColor=vec4(art.rgb,art.a*clamp(timing.y,0.,1.));
        #include <colorspace_fragment>
      }` });
  const mesh = new T.InstancedMesh(geometry, material, capacity); mesh.count = 0; mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); group.add(mesh);
  const matrix = new T.Matrix4(), position = new T.Vector3(), rotation = new T.Quaternion(), scale = new T.Vector3(), direction = new T.Vector3(), forward = new T.Vector3(0, 0, 1);
  function update(rows) {
    let count = 0;
    for (const row of rows) {
      if (count >= capacity) break;
      const age = row.age ?? 0, envelope = portalEnvelope(age); if (!envelope.strength) continue;
      position.set(row.x, row.y ?? .8, row.z); direction.set(row.dx ?? 0, row.dy ?? 0, row.dz ?? 1);
      if (direction.lengthSq() < 1e-8) direction.set(0, 0, 1);
      rotation.setFromUnitVectors(forward, direction.normalize());
      scale.setScalar(Math.max(.38, Math.min(1.6, (row.radius ?? .2) * 2.6)) * envelope.size);
      matrix.compose(position, rotation, scale); mesh.setMatrixAt(count, matrix);
      styles.setX(count, treasuryVariant(row, count)); timing.setXY(count++, age, envelope.strength);
    }
    mesh.count = count; mesh.instanceMatrix.needsUpdate = true; timing.needsUpdate = true; styles.needsUpdate = true;
  }
  let disposed = false;
  return { group, update, ready: assets.ready, dispose() { if (disposed) return; disposed = true; geometry.dispose(); material.dispose(); assets.release(); group.clear(); } };
}
export function createEffect(T) {
  const batch = createBatch(T, 1);
  return { ...batch, update(age, data = {}) { batch.update([{ x: 0, y: 1.3, z: 0, ...data, radius: data.launchRadius ?? .2, age }]); } };
}
