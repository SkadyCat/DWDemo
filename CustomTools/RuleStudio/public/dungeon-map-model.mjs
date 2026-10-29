// Presentation coordinates only. No combat, navigation or exploration state is written.
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const rubber = (distance, limit) => Math.sign(distance) * limit * (1 - 1 / (1 + Math.abs(distance) * .35 / limit));
const unRubber = (distance, limit) => distance / (.35 * (1 - Math.abs(distance) / limit));
export const mapWorldPoint = (map, x, y) => ({x: (x + map.half) / map.tile, y: map.size - (y + map.half) / map.tile});
export const mapHeroPoint = (map, hud) => ({x: hud.heroX, y: map.size - hud.heroY});
export function mapBounds(map) {
  const rooms = map.rooms;
  if (!rooms.length) return {x: 0, y: 0, width: map.size, height: map.size};
  const x = Math.max(0, Math.min(...rooms.map(r => r.x)) - 2), y = Math.max(0, map.size - Math.max(...rooms.map(r => r.y + r.h)) - 2);
  return {x, y, width: Math.min(map.size, Math.max(...rooms.map(r => r.x + r.w)) + 2) - x,
    height: Math.min(map.size, map.size - Math.min(...rooms.map(r => r.y)) + 2) - y};
}
export class DungeonMapCamera {
  constructor(map, viewport, mini = false) {
    this.map = map; this.viewport = viewport; this.mini = mini; this.bounds = mapBounds(map);
    this.zoom = 1; this.follow = mini; this.fit(); this.follow = mini;
  }
  get baseScale() { const b = this.bounds, v = this.viewport; return this.mini ? Math.min(v.width, v.height) / this.map.size * 1.55 : Math.min((v.width - 64) / b.width, (v.height - 64) / b.height); }
  get scale() { return this.baseScale * this.zoom; }
  project(point) { return {x: this.viewport.width / 2 + (point.x - this.x) * this.scale, y: this.viewport.height / 2 + (point.y - this.y) * this.scale}; }
  unproject(point) { return {x: this.x + (point.x - this.viewport.width / 2) / this.scale, y: this.y + (point.y - this.viewport.height / 2) / this.scale}; }
  fit() { const b = this.bounds; this.drag = null; this.zoom = 1; this.x = b.x + b.width / 2; this.y = b.y + b.height / 2; this.follow = false; }
  locate(point) { this.drag = null; this.x = point.x; this.y = point.y; this.follow = true; }
  zoomBy(factor, anchor = {x: this.viewport.width / 2, y: this.viewport.height / 2}) {
    this.drag = null;
    const before = this.unproject(anchor); this.zoom = clamp(this.zoom * factor, this.mini ? 1 : .75, 4);
    if (!this.follow) { const after = this.unproject(anchor); this.x += before.x - after.x; this.y += before.y - after.y; this.constrain(); }
  }
  pan(dx, dy) { this.drag = null; this.follow = false; this.x -= dx / this.scale; this.y -= dy / this.scale; this.constrain(); }
  limits() {
    const b = this.bounds, v = this.viewport;
    // Keep 32px of breathing room at each edge. Content that fits stays centered.
    const rangeX = Math.max(0, (b.width - (v.width - 64) / this.scale) / 2);
    const rangeY = Math.max(0, (b.height - (v.height - 64) / this.scale) / 2);
    return {minX: b.x + b.width / 2 - rangeX, maxX: b.x + b.width / 2 + rangeX,
      minY: b.y + b.height / 2 - rangeY, maxY: b.y + b.height / 2 + rangeY};
  }
  boundedPosition() {
    const b = this.limits(); return {x: clamp(this.x, b.minX, b.maxX), y: clamp(this.y, b.minY, b.maxY)};
  }
  constrain() { Object.assign(this, this.boundedPosition()); }
  beginDrag() {
    const wasFollowing = this.follow; this.follow = false;
    const b = this.limits(), scale = this.scale;
    const axis = (value, low, high, size, previousLimit) => {
      const edge = clamp(value, low, high), over = (value - edge) * scale;
      // Preserve the displayed position when grabbing during a return or after locating.
      const normalLimit = Math.min(72, size * .12);
      const limit = Math.abs(over) < normalLimit ? normalLimit : wasFollowing ? Math.max(normalLimit, Math.abs(over) + 24) : previousLimit || normalLimit;
      return {raw: edge + unRubber(over, limit) / scale, limit};
    };
    this.drag = {x: axis(this.x, b.minX, b.maxX, this.viewport.width, this.elasticLimits?.x), y: axis(this.y, b.minY, b.maxY, this.viewport.height, this.elasticLimits?.y)};
    this.elasticLimits = {x: this.drag.x.limit, y: this.drag.y.limit};
  }
  dragBy(dx, dy) {
    if (!this.drag) return;
    const b = this.limits(), scale = this.scale;
    const axis = (state, delta, low, high) => {
      state.raw -= delta / scale;
      const edge = clamp(state.raw, low, high); return edge + rubber((state.raw - edge) * scale, state.limit) / scale;
    };
    this.x = axis(this.drag.x, dx, b.minX, b.maxX); this.y = axis(this.drag.y, dy, b.minY, b.maxY);
  }
  endDrag() { this.drag = null; return this.boundedPosition(); }
}
