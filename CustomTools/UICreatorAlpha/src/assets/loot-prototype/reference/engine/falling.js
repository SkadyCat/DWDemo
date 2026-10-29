// Generic vertical launch geometry. No skill, rendering or equipment policy.
export function fallingLaunch({ x, y, groundZ = 0, height = 8, speed = 2, gravity = 24, radius = .2 }) {
  const floor = groundZ + Math.max(0, radius);
  const z = Math.max(floor, groundZ + Math.max(0, height));
  const down = Math.max(0, speed), acceleration = Math.max(.01, Math.abs(gravity));
  const duration = Math.max(1 / 60, (Math.sqrt(down * down + 2 * acceleration * (z - floor)) - down) / acceleration);
  return { x, y, z, vx: 0, vy: 0, vz: -down, gravity: -acceleration, duration };
}

/** One centered hit plus evenly distributed landings; count cannot move the selected center. */
export function fallingOffset(index, count, radius, phase = 0, radial = index / Math.max(1, count - 1)) {
  if (index === 0 || count <= 1) return [0, 0];
  const reach = Math.sqrt(Math.max(0, Math.min(1, radial))) * Math.max(0, radius);
  const angle = phase + index * 2.399963229728653;
  return [Math.cos(angle) * reach, Math.sin(angle) * reach];
}
