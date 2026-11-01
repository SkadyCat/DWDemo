// 单位：英雄、怪物、召唤物、图腾都是同一种东西，规则对它们完全对称。
//
// owner: the actor that owns this one (a minion's summoner, a totem's placer). Root actors have none.
// Rules that say "your minions…" use scope:'minion' mods on the owner; kills by a minion count as
// kills for the owner chain (events carry both `source` and `root`).
import { ModIndex } from './mods.mjs';

export class Actor {
  constructor({ id, team = 0, kind = 'monster', owner = null, x = 0, y = 0, radius = 30, name = '' }) {
    Object.assign(this, { id, team, kind, owner, x, y, radius, name });
    this.alive = true;
    this.life = 1; this.mana = 0; this.es = 0;
    this.max = { life: 1, mana: 0, es: 0 };
    this.sheet = new ModIndex();         // permanent mods: gear, passives, monster affixes
    this.statuses = [];                  // status instances
    this.statusVersion = 0;
    this.resources = new Map();          // charges, meters, any named counter
    this.resourceTimers = new Map();     // charges expire as a group (PoE): refreshed on gain
    this.lastEvent = new Map();          // event type → world time it last happened with this actor as source
    this.moving = false; this.vx = 0; this.vy = 0;
    this.skills = [];                    // skill instances (compiled + links)
    this.rules = [];                     // rule instances listening to events
    this.esDelay = 0;                    // time until energy shield starts recharging
    this.minions = new Set();
    this.reserved = 0;                   // percent of mana reserved
  }
  resource(key) { return this.resources.get(key) || 0; }
  statusStacks(id) {
    let n = 0;
    for (const s of this.statuses) if (s.def.id === id) n += s.stacks;
    return n;
  }
  statusTagCount(tag) {
    const seen = new Set();
    for (const s of this.statuses) if (s.def.tags.includes(tag)) seen.add(s.def.id);
    return seen.size;
  }
  hasStatus(id) { return this.statuses.some(s => s.def.id === id); }
  poolPct(pool) { const m = this.max[pool]; return m > 0 ? (this[pool] / m) * 100 : 0; }
  get root() { let a = this; while (a.owner) a = a.owner; return a; }
}
