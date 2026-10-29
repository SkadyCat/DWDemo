// Deterministic floor geometry, in centimeters. Independent of rendering and combat rules.
export const TILE = 200;
export const MAP_SIZE = 45;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export function dungeonRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

export function generateDungeon(seed, floor = 1) {
  const rng = dungeonRandom((seed ^ Math.imul(floor, 0x9e3779b9)) >>> 0);
  const cells = new Uint8Array(MAP_SIZE * MAP_SIZE), edges = [], rooms = [];
  const desired = 11 + Math.floor(rng() * 4);
  for (let attempt = 0; attempt < 700 && rooms.length < desired; attempt++) {
    const w = 5 + 2 * Math.floor(rng() * 3), h = 5 + 2 * Math.floor(rng() * 3);
    const x = 2 + Math.floor(rng() * (MAP_SIZE - w - 4)), y = 2 + Math.floor(rng() * (MAP_SIZE - h - 4));
    if (rooms.some(r => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
    rooms.push({ id: rooms.length, x, y, w, h, centerX: x + w / 2, centerY: y + h / 2, kind: 'room' });
  }
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) cells[y * MAP_SIZE + x] = 1;
  }
  // A spanning tree guarantees connectivity. Three-tile corridors leave room
  // for real capsule/projectile sweeps; extra links create alternate routes.
  const carve = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx > 0 && y + dy > 0 && x + dx < MAP_SIZE - 1 && y + dy < MAP_SIZE - 1) cells[(y + dy) * MAP_SIZE + x + dx] = 1; };
  const connect = (a, b) => {
    let x = Math.floor(a.centerX), y = Math.floor(a.centerY); const bx = Math.floor(b.centerX), by = Math.floor(b.centerY);
    const horizontalFirst = rng() < .5;
    const goX = () => { while (x !== bx) { carve(x, y); x += Math.sign(bx - x); } carve(x, y); };
    const goY = () => { while (y !== by) { carve(x, y); y += Math.sign(by - y); } carve(x, y); };
    if (horizontalFirst) { goX(); goY(); } else { goY(); goX(); }
    edges.push({ source: a.id, target: b.id });
  };
  const joined = new Set([0]);
  while (joined.size < rooms.length) {
    let best = null, distance = Infinity;
    for (const a of rooms) if (joined.has(a.id)) for (const b of rooms) if (!joined.has(b.id)) {
      const d = Math.hypot(a.centerX - b.centerX, a.centerY - b.centerY);
      if (d < distance) { distance = d; best = [a, b]; }
    }
    connect(...best); joined.add(best[1].id);
  }
  for (let i = 0; i < 2; i++) {
    const a = rooms[Math.floor(rng() * rooms.length)], b = rooms[Math.floor(rng() * rooms.length)];
    if (a !== b && !edges.some(e => e.source === a.id && e.target === b.id || e.source === b.id && e.target === a.id)) connect(a, b);
  }
  const half = MAP_SIZE * TILE / 2;
  const tileCenter = (x, y) => ({ x: (x + .5) * TILE - half, y: (y + .5) * TILE - half });
  const tileOf = (x, y) => ({ x: Math.floor((x + half) / TILE), y: Math.floor((y + half) / TILE) });
  const roomTile = (x, y) => rooms.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)?.id ?? -1;
  const isFloor = (x, y) => x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE && !!cells[y * MAP_SIZE + x];
  const walkable = isFloor;
  const tiles = [], walls = [];
  for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) {
    if (isFloor(x, y)) {
      tiles.push({ x, y, room: roomTile(x, y) });
    } else if (DIRS.some(([dx, dy]) => isFloor(x + dx, y + dy))) walls.push({ x, y });
  }
  // Segment versus expanded solid tiles. Return the earliest fraction, or -1.
  const sweep = (sx, sy, ex, ey, radius = 0) => {
    const min = tileOf(Math.min(sx, ex) - radius, Math.min(sy, ey) - radius);
    const max = tileOf(Math.max(sx, ex) + radius, Math.max(sy, ey) + radius);
    let earliest = Infinity;
    for (let y = min.y; y <= max.y; y++) for (let x = min.x; x <= max.x; x++) {
      if (walkable(x, y)) continue;
      let enter = 0, exit = 1;
      for (const [start, delta, lo, hi] of [[sx, ex - sx, x * TILE - half - radius, (x + 1) * TILE - half + radius], [sy, ey - sy, y * TILE - half - radius, (y + 1) * TILE - half + radius]]) {
        if (Math.abs(delta) < 1e-8) { if (start <= lo || start >= hi) { enter = Infinity; break; } }
        else { const a = (lo - start) / delta, b = (hi - start) / delta; enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b)); }
      }
      if (enter <= exit && enter >= 0 && enter <= 1) earliest = Math.min(earliest, enter);
    }
    return Number.isFinite(earliest) ? earliest : -1;
  };
  const move = (actor, x, y) => {
    const r = actor.radius + 1;
    const tx = sweep(actor.x, actor.y, x, actor.y, r);
    if (tx < 0) actor.x = x; else actor.x += (x - actor.x) * Math.max(0, tx - .001);
    const ty = sweep(actor.x, actor.y, actor.x, y, r);
    if (ty < 0) actor.y = y; else actor.y += (y - actor.y) * Math.max(0, ty - .001);
  };
  const flow = (worldX, worldY) => {
    const target = tileOf(worldX, worldY), result = new Int32Array(cells.length).fill(-1);
    if (!walkable(target.x, target.y)) return result;
    const queue = [target.y * MAP_SIZE + target.x]; result[queue[0]] = 0;
    for (let i = 0; i < queue.length; i++) {
      const cell = queue[i], x = cell % MAP_SIZE, y = Math.floor(cell / MAP_SIZE);
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, n = ny * MAP_SIZE + nx;
        if (walkable(nx, ny) && result[n] < 0) { result[n] = result[cell] + 1; queue.push(n); }
      }
    }
    return result;
  };
  const entryRoom = rooms.reduce((best, r) => r.centerX < best.centerX ? r : best);
  const entry = { x: entryRoom.centerX * TILE - half, y: entryRoom.centerY * TILE - half };
  const distances = flow(entry.x, entry.y);
  const bossRoom = rooms.reduce((best, r) => distances[Math.floor(r.centerY) * MAP_SIZE + Math.floor(r.centerX)] > distances[Math.floor(best.centerY) * MAP_SIZE + Math.floor(best.centerX)] ? r : best).id;
  entryRoom.kind = 'entry'; rooms[bossRoom].kind = 'boss';
  return { seed, floor, size: MAP_SIZE, tile: TILE, half, cells, rooms, edges, bossRoom, entryRoom: entryRoom.id, tiles, walls, tileCenter, tileOf, roomTile, walkable, sweep, move, flow,
    entry,
    mapPath: tiles.map(t => `M${t.x} ${t.y}h1v1h-1z`).join('') };
}
