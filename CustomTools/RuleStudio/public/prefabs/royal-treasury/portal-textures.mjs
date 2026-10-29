// Presentation assets only. Shared by all active treasury portal batches.
import { assetUrl } from '../../asset-url.mjs';
export const portalTextureUrls = Object.freeze(['sword', 'bow', 'axe'].map(type =>
  new URL(assetUrl(`/prefabs/royal-treasury/assets/imagegen-colors-v1/portal-${type}.png`), typeof location === 'undefined' ? 'http://localhost' : location.href).href));
const sets = new WeakMap();

export function acquirePortalTextures(T) {
  let entry = sets.get(T);
  if (!entry) {
    const pending = [], loader = typeof document === 'undefined' ? null : new T.TextureLoader();
    const textures = portalTextureUrls.map(url => {
      let texture;
      if (loader) {
        pending.push(new Promise((resolve, reject) => {
          texture = loader.load(url, resolve, undefined, reject);
        }));
      } else {
        // Headless simulation imports the same prefab without a browser or image API.
        texture = new T.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, T.RGBAFormat);
        texture.needsUpdate = true;
      }
      texture.colorSpace = T.SRGBColorSpace;
      texture.wrapS = texture.wrapT = T.ClampToEdgeWrapping;
      texture.minFilter = T.LinearMipmapLinearFilter;
      texture.magFilter = T.LinearFilter;
      return texture;
    });
    entry = { textures, refs: 0, ready: Promise.all(pending).then(() => undefined) };
    // Most callers update continuously and need no loading callback; still report failures.
    entry.ready.catch(error => console.warn('王之宝库法阵纹理加载失败', error));
    sets.set(T, entry);
  }
  ++entry.refs;
  let released = false;
  return { textures: entry.textures, ready: entry.ready, release() {
    if (released) return;
    released = true;
    if (--entry.refs === 0) {
      entry.textures.forEach(texture => texture.dispose());
      sets.delete(T);
    }
  } };
}
