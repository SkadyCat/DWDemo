// Fixed world-space tiles preserve the engraved terrain while bounding raster work.
function hash(value) { let n = 2166136261; for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; }
function random(seed) { let n = seed >>> 0; return () => { n += 0x6d2b79f5; let t = Math.imul(n ^ n >>> 15, n | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function noise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi;
  const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
  const at = (a, b) => { let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ seed; n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296; };
  return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
}
function elevation(x, y, seed) {
  return noise(x * .00095 + 7, y * .00095 - 3, seed) * .52 + noise(x * .0028, y * .0028, seed + 11) * .28 + noise(x * .008, y * .008, seed + 29) * .14 + noise(x * .022, y * .022, seed + 79) * .06;
}
function createTerrainTile(bounds, seedValue) {
  const seed = hash(seedValue), size = 384;
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  const context = canvas.getContext('2d', { alpha: false }), pixels = context.createImageData(size, size);
  const step = bounds.width / size;
  // Work at half resolution, retaining the fine engraved contours as vectors below.
  for (let py = 0; py < size; py += 2) for (let px = 0; px < size; px += 2) {
    const x = bounds.x + px * step, y = bounds.y + py * step, h = elevation(x, y, seed);
    const grain = noise(x * .19, y * .19, seed + 101) * 3;
    let color;
    if (h < .39) color = [11 + h * 8, 27 + h * 15, 29 + h * 13];
    else if (h < .44) color = [24 + (h - .39) * 140, 42 + (h - .39) * 190, 41 + (h - .39) * 100];
    else if (h < .57) color = [36 + (h - .44) * 55, 53 + (h - .44) * 80, 44 + (h - .44) * 43];
    else color = [43 + (h - .57) * 100, 59 + (h - .57) * 105, 49 + (h - .57) * 75];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = ((py + dy) * size + px + dx) * 4;
      pixels.data[i] = color[0] + grain; pixels.data[i + 1] = color[1] + grain; pixels.data[i + 2] = color[2] + grain; pixels.data[i + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const grid = 32, heights = [];
  for (let y = 0; y <= grid; y++) for (let x = 0; x <= grid; x++) heights.push(elevation(bounds.x + x / grid * bounds.width, bounds.y + y / grid * bounds.height, seed));
  for (const level of [.36, .39, .42, .45, .48, .51, .54, .57, .60, .63, .66, .69]) {
    context.beginPath();
    for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
      const points = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
      const values = [heights[y * (grid + 1) + x], heights[y * (grid + 1) + x + 1], heights[(y + 1) * (grid + 1) + x + 1], heights[(y + 1) * (grid + 1) + x]];
      const intersections = [];
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; if ((values[i] >= level) === (values[j] >= level)) continue; const t = (level - values[i]) / (values[j] - values[i]); intersections.push([(points[i][0] + (points[j][0] - points[i][0]) * t) / grid * size, (points[i][1] + (points[j][1] - points[i][1]) * t) / grid * size]); }
      for (let i = 0; i + 1 < intersections.length; i += 2) { context.moveTo(...intersections[i]); context.lineTo(...intersections[i + 1]); }
    }
    context.strokeStyle = level < .44 ? 'rgba(102,146,133,.13)' : 'rgba(177,188,142,.13)'; context.lineWidth = .7; context.stroke();
  }
  const rng = random(hash(`${seedValue}|${bounds.x}:${bounds.y}`) + 41);
  for (let i = 0; i < 210; i++) {
    const x = rng() * size, y = rng() * size, h = elevation(bounds.x + x * step, bounds.y + y * step, seed);
    if (h > .56) {
      const r = 2 + rng() * 5; context.strokeStyle = 'rgba(169,175,135,.18)'; context.lineWidth = .65;
      context.beginPath(); context.moveTo(x - r, y + r * .55); context.lineTo(x, y - r); context.lineTo(x + r, y + r * .55); context.moveTo(x, y - r); context.lineTo(x + r * .22, y); context.lineTo(x + r * .5, y - r * .13); context.stroke();
    } else if (h > .44 && h < .53) {
      context.strokeStyle = 'rgba(8,27,19,.25)'; context.lineWidth = .75;
      context.beginPath(); context.moveTo(x, y - 2); context.lineTo(x - 1.7, y + 1); context.lineTo(x + 1.7, y + 1); context.closePath(); context.stroke();
    }
  }
  return { canvas, bounds };
}

export const ATLAS_TERRAIN_TILE = 1024;
export function createAtlasTerrain(seed, { capacity = 64, createTile = createTerrainTile } = {}) {
  const tiles = new Map();
  const terrain = {
    seed, pending: false,
    get size() { return tiles.size; },
    draw(context, bounds) {
      const size = ATLAS_TERRAIN_TILE, visible = [], missing = [];
      for (let y = Math.floor(bounds.minY / size); y <= Math.floor(bounds.maxY / size); y++) for (let x = Math.floor(bounds.minX / size); x <= Math.floor(bounds.maxX / size); x++) {
        const key = `${x}:${y}`, box = { x: x * size, y: y * size, width: size, height: size };
        visible.push({ key, box }); if (!tiles.has(key)) missing.push({ key, box });
      }
      // At most one small raster per frame, centered on the current view. Rapid
      // dragging never queues work for terrain that has already left the screen.
      const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
      missing.sort((a, b) => Math.hypot(a.box.x + size / 2 - cx, a.box.y + size / 2 - cy) - Math.hypot(b.box.x + size / 2 - cx, b.box.y + size / 2 - cy));
      if (missing.length) { const { key, box } = missing[0]; tiles.set(key, createTile(box, seed)); }
      for (const { key, box } of visible) {
        const tile = tiles.get(key); if (!tile) continue;
        tiles.delete(key); tiles.set(key, tile);
        context.drawImage(tile.canvas, box.x, box.y, box.width, box.height);
      }
      while (tiles.size > capacity) { const key = tiles.keys().next().value; tiles.get(key).canvas.width = 0; tiles.delete(key); }
      terrain.pending = missing.length > 1;
    },
    dispose() { for (const tile of tiles.values()) tile.canvas.width = 0; tiles.clear(); terrain.pending = false; },
  };
  return terrain;
}

