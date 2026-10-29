// Generic seeded roaming for persistent areas. Coordinates and speeds are in meters.
// The host supplies collision movement; neither skill IDs nor presentation participate.
const TWO_PI = Math.PI * 2;
function random(m) {
  m.seed = (Math.imul(m.seed, 1664525) + 1013904223) >>> 0;
  return m.seed / 4294967296;
}
export function createAreaRoaming(spec, x, y, dir, seed) {
  return { ...spec, x, y, originX: x, originY: y, dir, turnLeft: spec.interval, seed: seed >>> 0 || 1 };
}
export function stepAreaRoaming(m, dt, move) {
  let remaining = Math.max(0, dt);
  while (remaining > 1e-9) {
    if (m.turnLeft <= 1e-9) {
      // A decisive new heading after each short run, rather than jitter every frame.
      m.dir += (random(m) < .5 ? -1 : 1) * (Math.PI / 3 + random(m) * Math.PI / 3);
      m.dir %= TWO_PI;
      m.turnLeft = m.interval * (.75 + random(m) * .5);
    }
    const seconds = Math.min(remaining, m.turnLeft, .5 / Math.max(.01, m.speed));
    const distance = m.speed * seconds;
    let dx = Math.cos(m.dir), dy = Math.sin(m.dir);
    let x = m.x + dx * distance, y = m.y + dy * distance;
    const ox = x - m.originX, oy = y - m.originY, reach = Math.hypot(ox, oy);
    if (reach > m.range) {
      const nx = ox / reach, ny = oy / reach, dot = dx * nx + dy * ny;
      x = m.originX + nx * m.range; y = m.originY + ny * m.range;
      dx -= 2 * dot * nx; dy -= 2 * dot * ny; m.dir = Math.atan2(dy, dx);
    }
    const actual = move(x, y);
    // Reflect the blocked axes using the arena's existing collision result.
    const blockedX = Math.abs(actual.x - x) > 1e-5, blockedY = Math.abs(actual.y - y) > 1e-5;
    if (blockedX || blockedY) {
      m.dir = Math.atan2(blockedY ? -dy : dy, blockedX ? -dx : dx);
      m.turnLeft = Math.min(m.turnLeft, m.interval * .25);
    }
    m.x = actual.x; m.y = actual.y;
    m.turnLeft -= seconds; remaining -= seconds;
  }
  return m;
}
