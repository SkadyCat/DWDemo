// Shared geometry within this prefab folder. No game imports, rules, or randomness.
export function treasuryVariant(row, ordinal = 0) {
  if (Number.isInteger(row.variant) && row.variant >= 0 && row.variant < 3) return row.variant;
  return row.visualSeed == null ? Math.abs(Math.trunc(row.ordinal ?? ordinal)) % 3 : (Math.imul(row.visualSeed, 1103515245) >>> 0) % 3;
}
const profiles = [
  [ // sword: silver blade, gold ridge/guard, dark grip
    [[[-.09, -.16], [-.09, .65], [0, .98], [.09, .65], [.09, -.16]], 0xffefd1],
    [[[0, -.16], [0, .94], [.03, .62], [.03, -.16]], 0xd9a143],
    [[[-.3, -.23], [-.25, -.12], [.25, -.12], [.3, -.23]], 0xeac36d],
    [[[-.045, -.52], [-.045, -.23], [.045, -.23], [.045, -.52]], 0x6e432c],
    [[[-.08, -.6], [-.08, -.52], [.08, -.52], [.08, -.6]], 0xffd97c],
  ],
  [ // bow: curved limbs and taut string; the entire stored weapon is projected
    [[[-.06, -.68], [-.28, -.44], [-.38, 0], [-.28, .44], [-.06, .68], [-.19, .39], [-.25, 0], [-.19, -.39]], 0xd99a43],
    [[[-.065, -.68], [-.055, .68], [-.035, .68], [-.045, -.68]], 0xfff0b8],
    [[[-.28, -.13], [-.28, .13], [-.22, .13], [-.22, -.13]], 0x775036],
    [[[-.08, .03], [-.08, .73], [-.11, .73], [0, .94], [.08, .73], [.02, .73], [.02, .03]], 0xffe3a1],
  ],
  [ // axe: long haft and a broad double head
    [[[-.045, -.68], [-.045, .7], [.045, .7], [.045, -.68]], 0x815036],
    [[[-.06, .35], [-.37, .15], [-.48, .32], [-.45, .73], [-.23, .6], [-.06, .59]], 0xffe6ba],
    [[[.06, .35], [.37, .15], [.48, .32], [.45, .73], [.23, .6], [.06, .59]], 0xd9af63],
    [[[-.085, .26], [-.085, .71], [.085, .71], [.085, .26]], 0xf7cd6f],
    [[[-.07, -.72], [-.07, -.61], [.07, -.61], [.07, -.72]], 0xf7cd6f],
  ],
];

export function createWeaponGeometries(T) {
  return profiles.map(parts => {
    const positions = [], normals = [], colors = [], tint = new T.Color();
    for (const [points, color] of parts) {
      const shape = new T.Shape(points.map(([x, y]) => new T.Vector2(x, y)));
      const geometry = new T.ExtrudeGeometry(shape, { depth: .055, bevelEnabled: false, steps: 1 });
      geometry.translate(0, 0, -.0275); geometry.rotateX(Math.PI / 2);
      const plain = geometry.index ? geometry.toNonIndexed() : geometry;
      positions.push(...plain.attributes.position.array); normals.push(...plain.attributes.normal.array); tint.setHex(color);
      for (let i = 0; i < plain.attributes.position.count; i++) colors.push(tint.r, tint.g, tint.b);
      if (plain !== geometry) plain.dispose(); geometry.dispose();
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    out.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    out.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    out.computeBoundingSphere(); return out;
  });
}

export function createWeapons(T, capacity) {
  const group = new T.Group(), material = new T.ShaderMaterial({ vertexColors: true, toneMapped: false,
    vertexShader: `attribute float emergeDistance;varying vec3 tint;varying float portalSide;
      void main(){tint=color;portalSide=position.z+emergeDistance;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 tint;varying float portalSide;
      void main(){if(portalSide<0.)discard;gl_FragColor=vec4(tint,1.);
        #include <colorspace_fragment>
      }` });
  const meshes = createWeaponGeometries(T).map(geometry => {
    // The tip follows the real carrier; the rest emerges from its launch plane.
    geometry.computeBoundingBox(); geometry.translate(0, 0, -geometry.boundingBox.max.z);
    geometry.setAttribute('emergeDistance', new T.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(T.DynamicDrawUsage));
    return new T.InstancedMesh(geometry, material, capacity);
  });
  for (const mesh of meshes) { mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); group.add(mesh); }
  let disposed = false;
  return { group, meshes,
    dispose() { if (disposed) return; disposed = true; for (const mesh of meshes) mesh.geometry.dispose(); material.dispose(); group.clear(); } };
}
