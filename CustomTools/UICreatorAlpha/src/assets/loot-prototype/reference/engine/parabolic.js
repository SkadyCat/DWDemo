// Generic projectile launch geometry. All values are meters / seconds; no skill or rendering code.
export function parabolicLaunch({ x, y, z, dx, dy, speed, baseSpeed, lifetime, arcHeight, target = null, radius = 0 }) {
  const duration = Math.max(1 / 60, target && speed > 0 && baseSpeed > 0 ? lifetime * baseSpeed / speed : lifetime);
  const distance = target ? Math.hypot(target.x - x, target.y - y) : Math.max(0, speed) * duration;
  const endZ = Math.max(radius, target?.z ?? 0);
  const height = Math.max(0, arcHeight);
  return { vx: dx * distance / duration, vy: dy * distance / duration,
    vz: (endZ - z + 4 * height) / duration, gravity: -8 * height / (duration * duration), duration };
}
