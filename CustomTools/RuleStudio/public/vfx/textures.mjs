// 程序化贴图集：所有粒子共用一张 800² 图集（5×5 格），开局在画布上画好，不依赖任何外部图片。
// 格子都是「白色 + 透明度」，颜色在着色器里乘上去，所以同一张烟、同一道火舌能染成任何元素。

export const CELL = Object.freeze({
  glow: 0, core: 1, streak: 2, smoke: 3, smoke2: 4, flame: 5, ring: 6, flare: 7,
  shard: 8, ember: 9, crackle: 10, rune: 11, bubble: 12, wisp: 13, dust: 14, star: 15,
  beam: 16, flame2: 17, petal: 18, orb: 19,
});
const GRID = 5, SIZE = 160;

// ---- tiny deterministic noise ----------------------------------------------------------------
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct = 5) { let f = 0, amp = .5, fr = 1; for (let i = 0; i < oct; ++i) { f += vnoise(x * fr, y * fr, s + i * 17) * amp; fr *= 2.03; amp *= .5; } return f; }
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Paint one cell pixel by pixel: fn(u, v) → alpha 0..1, where u,v ∈ [-1, 1]. */
function paint(ctx, cell, fn) {
  const img = ctx.createImageData(SIZE, SIZE), d = img.data;
  for (let y = 0; y < SIZE; ++y) for (let x = 0; x < SIZE; ++x) {
    const u = (x + .5) / SIZE * 2 - 1, v = (y + .5) / SIZE * 2 - 1, a = clamp(fn(u, v));
    const edge = 1 - smooth(.86, .99, Math.max(Math.abs(u), Math.abs(v)));
    const i = (y * SIZE + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(a * edge * 255);
  }
  ctx.putImageData(img, (cell % GRID) * SIZE, Math.floor(cell / GRID) * SIZE);
}

const PAINTERS = {
  glow: (u, v) => { const r = Math.hypot(u, v); return Math.exp(-r * r * 5.5) * (1 - smooth(.85, 1, r)); },
  core: (u, v) => { const r = Math.hypot(u, v); return (1 - smooth(.18, .62, r)) * .9 + Math.exp(-r * r * 9) * .4; },
  streak: (u, v) => { const x = Math.abs(u), y = Math.abs(v); return Math.exp(-y * y * 90) * (1 - smooth(.2, 1, x)) + Math.exp(-(x * x * 3 + y * y * 260)) * .6; },
  smoke: (u, v) => { const r = Math.hypot(u, v), n = fbm(u * 2.2 + 3, v * 2.2 + 7, 11); return clamp((n * 1.35 - .25) * (1 - smooth(.35, .98, r + (n - .5) * .35))); },
  smoke2: (u, v) => { const r = Math.hypot(u, v), n = fbm(u * 3.1 - 5, v * 3.1 + 2, 29, 6); return clamp((n * 1.5 - .4) * (1 - smooth(.3, .95, r + (n - .5) * .45))) * .95; },
  flame: (u, v) => {
    const y = (v + 1) / 2;                    // 0 top … 1 bottom
    const w = .12 + .55 * Math.pow(y, .7) * (1 - smooth(.85, 1, y));
    const n = fbm(u * 3 + 1, y * 4.5, 41);
    const x = Math.abs(u + (n - .5) * .5 * (1 - y));
    return clamp((1 - smooth(w * .35, w, x)) * smooth(0, .35, y) * (1 - smooth(.75, .97, y)) * (.55 + n * .7));
  },
  ring: (u, v) => { const r = Math.hypot(u, v); return Math.exp(-Math.pow((r - .82) * 14, 2)) + Math.exp(-Math.pow((r - .82) * 5, 2)) * .25; },
  flare: (u, v) => { const r = Math.hypot(u, v), x = Math.abs(u), y = Math.abs(v); return Math.exp(-r * r * 22) + Math.exp(-(x * x * 1.6 + y * y * 900)) * .9 + Math.exp(-(y * y * 1.6 + x * x * 900)) * .9 + Math.exp(-r * r * 4) * .25; },
  shard: (u, v) => {
    // A long faceted crystal splinter pointing up, with a bright ridge.
    const y = (v + 1) / 2, half = .22 * (1 - Math.abs(y - .62) / .62) * (y < .62 ? y / .62 : 1);
    const x = Math.abs(u);
    const body = 1 - smooth(half * .85, half, x);
    const ridge = Math.exp(-Math.pow(u / (half * .25 + .01), 2)) * .6;
    return clamp(body * (.55 + ridge + (u > 0 ? .2 : 0)) * smooth(.02, .1, y) * (1 - smooth(.95, 1, y)));
  },
  ember: (u, v) => { const r = Math.hypot(u, v); return (1 - smooth(.05, .28, r)) + Math.exp(-r * r * 14) * .55; },
  crackle: (u, v) => {
    // Branching electric filaments.
    let a = 0;
    for (let k = 0; k < 5; ++k) {
      const ang = k * 1.2566 + .3, cx = Math.cos(ang), cy = Math.sin(ang);
      const along = u * cx + v * cy, across = -u * cy + v * cx;
      if (along < 0) continue;
      const wob = (fbm(along * 6, k * 3.1, 53, 3) - .5) * .5 * along;
      a += Math.exp(-Math.pow((across - wob) * 70, 2)) * (1 - smooth(.3, .95, along));
    }
    return clamp(a + Math.exp(-(u * u + v * v) * 30) * .8);
  },
  rune: (u, v) => {
    // Magic circle: two rings, ticks and glyph-like blocks between them.
    const r = Math.hypot(u, v), a = Math.atan2(v, u);
    const ring = Math.exp(-Math.pow((r - .93) * 60, 2)) + Math.exp(-Math.pow((r - .70) * 70, 2)) + Math.exp(-Math.pow((r - .45) * 80, 2)) * .7;
    const ticks = r > .72 && r < .9 ? (Math.abs(Math.sin(a * 36)) > .96 ? .8 : 0) : 0;
    const glyph = r > .74 && r < .88 ? (hash(Math.floor((a + Math.PI) / (Math.PI * 2) * 24), Math.floor((r - .74) / .035), 7) > .55 ? .55 : 0) * (Math.abs(Math.sin(a * 12)) < .8 ? 1 : 0) : 0;
    let star = 0;
    if (r < .7) for (let k = 0; k < 6; ++k) { const th = k * Math.PI / 3; star = Math.max(star, Math.exp(-Math.pow((Math.abs(u * Math.cos(th) + v * Math.sin(th)) - .34) * 70, 2))); }
    star *= .7;
    return clamp(ring + ticks + glyph + star);
  },
  bubble: (u, v) => { const r = Math.hypot(u, v); return clamp(Math.exp(-Math.pow((r - .78) * 9, 2)) * .9 + Math.exp(-((u + .3) ** 2 + (v + .35) ** 2) * 40) * .9 + (1 - smooth(.7, .8, r)) * .12); },
  wisp: (u, v) => { const n = fbm(u * 1.5, v * 3 + 5, 61); const x = Math.abs(u + (n - .5) * .9); return clamp(Math.exp(-x * x * 18) * (1 - smooth(.5, 1, Math.abs(v))) * (.4 + n)); },
  dust: (u, v) => { const r = Math.hypot(u, v), n = fbm(u * 5, v * 5, 71, 4); return clamp((1 - smooth(.2, 1, r)) * (n * 1.6 - .35)) * .8; },
  beam: (u, v) => Math.exp(-v * v * 14) * (1 - smooth(.8, 1, Math.abs(u))) * (.75 + .25 * Math.exp(-v * v * 80)),
  flame2: (u, v) => {
    const y = (v + 1) / 2, n = fbm(u * 2.5 + 9, y * 3.5 + 2, 83), n2 = fbm(u * 6, y * 7, 89, 3);
    const w = .2 + .6 * Math.pow(y, .55) * (1 - smooth(.8, 1, y));
    const x = Math.abs(u + (n - .5) * .7 * (1 - y));
    return clamp((1 - smooth(w * .2, w, x)) * smooth(0, .5, y) * (1 - smooth(.72, .97, y)) * (.35 + n2 * .9));
  },
  petal: (u, v) => { const x = u * 1.6, y = v; return clamp(Math.exp(-(x * x * 4 + y * y * 1.2)) * (1 - smooth(.8, 1, Math.hypot(u, v)))); },
  orb: (u, v) => { const r = Math.hypot(u, v), n = fbm(u * 3 + 4, v * 3 - 1, 97, 4); return clamp((1 - smooth(.45, .75, r + (n - .5) * .25)) * (.55 + n * .6) + Math.exp(-r * r * 6) * .5); },
  star: (u, v) => { const r = Math.hypot(u, v), a = Math.atan2(v, u); const k = Math.pow(Math.abs(Math.cos(a * 3)), 18) * .9 + .1; return clamp(Math.exp(-r * r * 30) + Math.exp(-r * 4 / (k + .05)) * .9 * (1 - smooth(.6, 1, r))); },
};

let cached = null;
/** The shared atlas texture (created once). */
export function atlasTexture(T) {
  if (cached) return cached;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = GRID * SIZE;
  const ctx = canvas.getContext('2d');
  for (const [name, cell] of Object.entries(CELL)) paint(ctx, cell, PAINTERS[name]);
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = T.LinearMipmapLinearFilter; tex.magFilter = T.LinearFilter; tex.anisotropy = 4;
  return (cached = tex);
}
export const ATLAS_GRID = GRID;
