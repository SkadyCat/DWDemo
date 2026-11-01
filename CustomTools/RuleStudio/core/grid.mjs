// 均匀空间网格（按队伍分桶）：每帧重建，所有「附近的单位」查询都走它。
// Team buckets matter in dense fights: a monster looking for the hero never walks through 5000 allies.
const CELL = 200;
const key = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);

export class Grid {
  constructor(cell = CELL) { this.cell = cell; this.teams = new Map(); this.maxRadius = 0; }
  bucket(team) { let m = this.teams.get(team); if (!m) this.teams.set(team, m = new Map()); return m; }
  rebuild(actors) {
    for (const m of this.teams.values()) m.clear();
    this.maxRadius = 0;
    for (const a of actors) if (a.alive) this.insert(a);
  }
  insert(a) {
    const cells = this.bucket(a.team), k = key(Math.floor(a.x / this.cell), Math.floor(a.y / this.cell));
    let list = cells.get(k);
    if (!list) cells.set(k, list = []);
    list.push(a);
    if (a.radius > this.maxRadius) this.maxRadius = a.radius;
  }
  /**
   * Calls fn(actor) for every live actor whose cell overlaps the circle (x, y, r + largest radius).
   * filter: undefined (all teams) · { team } (only that team) · { notTeam } (every other team).
   */
  query(x, y, r, fn, filter) {
    const R = r + this.maxRadius, c = this.cell;
    const x0 = Math.floor((x - R) / c), x1 = Math.floor((x + R) / c), y0 = Math.floor((y - R) / c), y1 = Math.floor((y + R) / c);
    for (const [team, cells] of this.teams) {
      if (filter && (filter.team !== undefined ? team !== filter.team : team === filter.notTeam)) continue;
      if (!cells.size) continue;
      for (let cx = x0; cx <= x1; ++cx) for (let cy = y0; cy <= y1; ++cy) {
        const list = cells.get(key(cx, cy));
        if (list) for (let i = 0; i < list.length; ++i) if (list[i].alive) fn(list[i]);
      }
    }
  }
}
