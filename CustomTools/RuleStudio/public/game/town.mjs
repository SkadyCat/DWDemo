// 夜阙城：王都底下的地下城（设定集「夜阙城」一节）。一张 45 × 45 格（每格 2 m）的城镇：
// 中央灯井广场，北面金殿（地图仪），西边半盏灯酒馆，东边铁匠巷，东北库房（仓库），西北观星阁，
// 南边集市街，西南棚户区，东南暗河码头。房子占的格子走不过去，画成房屋（prefabs/hub-props.mjs）。
//
// 镇民（Town）：不进战斗世界，只是在城里按自己的日子走动——去集市、排队打水、坐在广场、去酒馆、
// 晚上回棚户区。路过时偶尔冒一句闲话，点他们会停下来回你一句。模型由 scripts/gen-townsfolk.py 生成。
import { TILE } from './dungeon.mjs';
import { FOLK } from './townsfolk.mjs';

// Districts (rooms, in tiles; +y is north / up on screen). Room 0 is where you arrive.
export const TOWN_LAYOUT = {
  rooms: [
    { x: 16, y: 16, w: 13, h: 11, kind: 'plaza' },      // 0 灯井广场
    { x: 15, y: 33, w: 15, h: 8, kind: 'sanctum' },     // 1 金殿
    { x: 30, y: 17, w: 11, h: 9, kind: 'forge' },       // 2 铁匠巷
    { x: 4, y: 17, w: 12, h: 9, kind: 'tavern' },       // 3 半盏灯酒馆
    { x: 19, y: 3, w: 7, h: 13, kind: 'market' },       // 4 集市街
    { x: 3, y: 3, w: 15, h: 13, kind: 'shanty' },       // 5 棚户区
    { x: 27, y: 3, w: 15, h: 13, kind: 'dock' },        // 6 暗河码头
    { x: 3, y: 27, w: 12, h: 14, kind: 'astral' },      // 7 观星阁
    { x: 30, y: 27, w: 12, h: 14, kind: 'vault' },      // 8 库房
    { x: 19, y: 27, w: 7, h: 6, kind: 'avenue' },       // 9 金殿大道
  ],
  links: [],
  // everything inside the cavern walls is walkable ground …
  open: [{ x: 2, y: 2, w: 41, h: 40 }],
  // … except the buildings (and the well, the river)
  blocks: [
    { kind: 'well', x: 21, y: 20, w: 3, h: 3, name: '灯井' },
    { kind: 'hall', x: 16, y: 37, w: 13, h: 4, name: '金殿' },
    { kind: 'tavern', x: 4, y: 21, w: 7, h: 5, door: 's', name: '半盏灯' },
    { kind: 'forge', x: 33, y: 21, w: 6, h: 4, door: 's', name: '赛琳的铺子' },
    { kind: 'workshop', x: 39, y: 18, w: 3, h: 3, door: 'w' },
    { kind: 'tower', x: 5, y: 33, w: 5, h: 5, name: '观星阁' },
    { kind: 'vault', x: 34, y: 34, w: 6, h: 6, door: 's', name: '库房' },
    { kind: 'house', x: 12, y: 34, w: 3, h: 3, door: 's' },
    { kind: 'house', x: 31, y: 37, w: 3, h: 3, door: 's' },
    { kind: 'house', x: 15, y: 28, w: 3, h: 3, door: 'e' },
    { kind: 'house', x: 27, y: 28, w: 3, h: 3, door: 'w' },
    { kind: 'house', x: 11, y: 28, w: 3, h: 2, door: 's' },
    { kind: 'house', x: 30, y: 28, w: 3, h: 2, door: 's' },
    { kind: 'house', x: 15, y: 10, w: 3, h: 3, door: 'e' },
    { kind: 'house', x: 15, y: 5, w: 3, h: 3, door: 'e' },
    { kind: 'house', x: 27, y: 11, w: 3, h: 3, door: 'w' },
    { kind: 'house', x: 31, y: 11, w: 3, h: 3, door: 's' },
    { kind: 'house', x: 36, y: 11, w: 4, h: 3, door: 's' },
    { kind: 'shack', x: 4, y: 4, w: 2, h: 2 }, { kind: 'shack', x: 8, y: 4, w: 2, h: 2 }, { kind: 'shack', x: 12, y: 3, w: 2, h: 2 },
    { kind: 'shack', x: 4, y: 9, w: 2, h: 2 }, { kind: 'shack', x: 9, y: 10, w: 2, h: 2 }, { kind: 'shack', x: 4, y: 13, w: 2, h: 2 },
    { kind: 'shack', x: 12, y: 13, w: 2, h: 2 },
    { kind: 'water', x: 27, y: 2, w: 16, h: 3, name: '暗河' },
    { kind: 'water', x: 39, y: 5, w: 4, h: 4 },
  ],
  wallHeight: 3.2,
  entry: { x: 22, y: 17 },   // you arrive south of the well
};

/** Places people go (tiles + an offset so a crowd spreads out). tags: who goes there. face: which way they look while there. */
export const POIS = [
  { id: 'well_n', x: 22.5, y: 24.2, r: 1.2, tags: ['water', 'plaza'], face: [0, -1] },
  { id: 'well_s', x: 22.5, y: 18.8, r: 1.2, tags: ['water', 'plaza'], face: [0, 1] },
  { id: 'well_w', x: 19.8, y: 21.5, r: 1, tags: ['water', 'plaza'], face: [1, 0] },
  { id: 'bench_w', x: 17.5, y: 19, r: 1.4, tags: ['sit', 'plaza'] },
  { id: 'bench_e', x: 27.5, y: 23, r: 1.4, tags: ['sit', 'plaza'] },
  { id: 'board', x: 26.5, y: 17.5, r: 1.2, tags: ['plaza', 'news'], face: [0, -1] },
  { id: 'shrine', x: 22.5, y: 27.6, r: 1.4, tags: ['shrine'], face: [0, 1] },
  { id: 'hall_steps', x: 22.5, y: 35.6, r: 3, tags: ['hall', 'keeper'] },
  { id: 'stall_bread', x: 20.6, y: 13.5, r: 0.8, tags: ['market', 'shop'], face: [-1, 0] },
  { id: 'stall_pickle', x: 24.4, y: 12, r: 0.8, tags: ['market', 'shop'], face: [1, 0] },
  { id: 'stall_cloth', x: 20.6, y: 10, r: 0.8, tags: ['market', 'shop'], face: [-1, 0] },
  { id: 'stall_herb', x: 24.4, y: 8.5, r: 0.8, tags: ['market', 'shop'], face: [1, 0] },
  { id: 'stall_shoe', x: 20.6, y: 6.5, r: 0.8, tags: ['market', 'shop'], face: [-1, 0] },
  { id: 'stall_junk', x: 24.4, y: 5, r: 0.8, tags: ['market', 'shop'], face: [1, 0] },
  { id: 'market_mid', x: 22.5, y: 9, r: 2.2, tags: ['market'] },
  { id: 'tavern_door', x: 8, y: 19.6, r: 1.6, tags: ['tavern', 'night'] },
  { id: 'tavern_yard', x: 12.5, y: 23.5, r: 1.6, tags: ['tavern', 'night'] },
  { id: 'forge_front', x: 36, y: 19.5, r: 1.8, tags: ['forge'] },
  { id: 'trough', x: 31.5, y: 23.5, r: 1, tags: ['forge', 'water'] },
  { id: 'stove', x: 8, y: 7.5, r: 1.8, tags: ['shanty', 'home', 'night'] },
  { id: 'lines', x: 11.5, y: 7.5, r: 1.8, tags: ['shanty', 'home'] },
  { id: 'shanty_s', x: 7, y: 12.5, r: 1.8, tags: ['shanty', 'home', 'night'] },
  { id: 'dock_edge', x: 32, y: 5.8, r: 2.5, tags: ['dock'], face: [0, -1] },
  { id: 'dock_e', x: 37.5, y: 7, r: 1.4, tags: ['dock'] },
  { id: 'dock_houses', x: 33, y: 9.5, r: 1.6, tags: ['dock', 'home'] },
  { id: 'astral_foot', x: 12, y: 31, r: 1.6, tags: ['astral'] },
  { id: 'vault_door', x: 37, y: 32.6, r: 1.2, tags: ['vault'] },
  { id: 'avenue', x: 22.5, y: 30, r: 2, tags: ['plaza', 'hall'] },
  { id: 'gate_e', x: 40.5, y: 26, r: 1, tags: ['patrol'] },
  { id: 'gate_w', x: 3.5, y: 27, r: 1, tags: ['patrol'] },
  { id: 'gate_s', x: 22.5, y: 2.8, r: 1, tags: ['patrol', 'market'] },
  { id: 'plaza_ne', x: 27, y: 25.5, r: 1.6, tags: ['plaza', 'patrol'] },
  { id: 'plaza_sw', x: 17.5, y: 17, r: 1.6, tags: ['plaza', 'patrol'] },
];

/** Where each kind of townsperson likes to go, by day and at night (weights over POI tags). */
const HABITS = {
  villager: { day: { market: 4, water: 3, plaza: 2, shop: 2, sit: 1.5, shrine: 1, home: 1.5, dock: 0.6, tavern: 0.6 }, night: { home: 4, tavern: 2, shrine: 1, sit: 0.5 } },
  warrior: { day: { patrol: 5, plaza: 1, tavern: 0.5, hall: 1 }, night: { patrol: 4, tavern: 1.5 } },
  knight: { day: { hall: 3, patrol: 2, plaza: 1 }, night: { hall: 2, tavern: 2 } },
  ranger: { day: { tavern: 3, hall: 2, market: 1, forge: 1 }, night: { tavern: 4, home: 1 } },
  cleric: { day: { water: 4, hall: 3, shrine: 2 }, night: { hall: 3, water: 2 } },
  rogue: { day: { market: 3, plaza: 2, dock: 2, tavern: 1 }, night: { tavern: 3, dock: 1 } },
  mage: { day: { astral: 3, hall: 2, plaza: 1 }, night: { astral: 2, tavern: 1 } },
  kid: { day: { plaza: 4, market: 2, sit: 1, shrine: 1, dock: 1, water: 1 }, night: { home: 4, plaza: 1 } },
};

/** The named people from the 设定集: where they stay and what they say. */
export const CAST = {
  mati: { at: 'tavern_door', stay: 2.2, lines: ['喝酒先付钱，赊账去找卡罗。', '今天的汤里有肉，别问是什么肉。', '留言墙上又多了两张纸条。', '格雷，脚从桌上拿下去。'] },
  grey: { at: 'tavern_yard', stay: 2, roam: ['hall_steps', 'tavern_yard'], lines: ['营地之门往东别去，那边的石头会走。', '这两根手指是在城门那儿丢的，你小心点。', '上面的东西你要是拿不动，喊一声。'] },
  owen: { at: 'stall_shoe', stay: 1, roam: ['stall_shoe', 'shrine'], lines: ['鞋放这儿，明天来拿。', '我在上面看见她了，她冲我招手。', '你上去要是看见一个穿黄裙子的小姑娘，别打她。'] },
  xiaodou: { at: 'well_s', stay: 9, kid: true, follow: true, lines: ['寻径者！你见过会走的蘑菇吗？', '带我上去一次，就一次。', '我跑得比布鲁快。', '你打过空铠甲？它里面真的是灰吗？'] },
  rosa: { at: 'stall_bread', stay: 0.8, lines: ['今天的面包是绿的，明天也是。', '多拿一块，路上饿。', '苔藓粉掺多了，将就吃。'] },
  torg: { at: 'vault_door', stay: 0.6, lines: ['封门不开。问谁都不开。', '仓库在那边，封门在这边，别弄混了。', '维克又往里塞东西了。'] },
  bru: { at: 'well_w', stay: 6, roam: ['well_w', 'bench_w', 'board', 'avenue', 'plaza_ne'], slow: true, lines: ['我站过王座边上的岗。他那天心情很好。', '扫地也是站岗，只是不用站着。', '鞋底的灰，在门口跺干净。'] },
  helen: { at: 'stove', stay: 1.2, lines: ['锅里还有，自己盛。', '你要是在上面看见一个爱偷栗子的小子，算了。', '栗子？哪来的栗子。'] },
  xu: { at: 'dock_edge', stay: 1, lines: ['水道封了。水还在流。', '上船？去哪儿？', '昨天水里漂下来一只鞋，左脚的。'] },
  lia: { at: 'astral_foot', stay: 2, lines: ['它认得路，它就是不肯飞出去。', '老九今天吃了三条虫。'] },
  lina: { at: 'astral_foot', stay: 2, lines: ['我是莉娜，她是莉亚。别弄反了。', '老九是寒鸦，不是乌鸦。'] },
};

/** What the rest of the town says in passing (by role; kids and the night have their own). */
const SAY = {
  villager: ['绿面包吃多了，嘴里一股苔藓味。', '灯井今天又暗了一下，你看见没有？', '我家原来在渡鸦湾，门口有棵歪脖子树。', '打水的队排到集市口了。',
    '别踩那块砖，它松了七年了。', '我昨天梦见下雨了，真的雨。', '守灯会又少发了半块饼。', '这双鞋是欧文补的，补了三回了。', '穹顶那条缝是不是比上个月宽了？',
    '你是寻径者？那你上去帮我看看我家房子还在不在。算了，别看。', '罗莎今天的面包是咸的，难得。', '谁家的鸡跑了？哦，我们没有鸡。'],
  warrior: ['金殿那边别乱跑。', '换岗的又迟到了。', '上面安静得很，安静得不对劲。', '站直了。说你呢，不是说你。'],
  knight: ['我年轻时候在星冠城站过岗。', '这身铁皮，穿着比不穿暖和。'],
  ranger: ['今天捡回一口锅，没底。', '格雷说明天再上去一趟。', '城门那边的灰，比上个月厚。', '你出去的话，帮我留意一下铁钉，什么样的都行。'],
  cleric: ['排好队，一人一勺。', '路石的账诺娅记着呢。', '灯井要添路石了。', '袖子上的金线是守灯会的，别学。'],
  rogue: ['借过借过。', '有信要送吗？送不出去的那种也行。', '我什么都没拿。'],
  mage: ['伊芙说今天星图上亮了一颗。', '我在背书，别跟我说话，一说就忘。'],
  kid: ['寻径者！上面有会飞的鱼吗？', '我们在玩守灯的游戏，你当潮水。', '我能摸一下你的法杖吗？', '小豆说你打过空铠甲。', '你跑不过我！'],
  night: ['该回去睡了，灯都调暗了。', '酒馆还开着吧？', '明天的饼不知道发不发。'],
};

/** Next point to head for along a flow field (8 neighbours, no corner cutting); the target itself once on its tile. */
export function steerOnFlow(d, f, x, y, tx, ty) {
  const S = d.size, here = d.tileOf(x, y), cur = f[here.y * S + here.x];
  if (cur <= 1) return { x: tx, y: ty };
  let best = null, bd = cur < 0 ? Infinity : cur;
  for (let dy = -1; dy <= 1; ++dy) for (let dx = -1; dx <= 1; ++dx) {
    if (!dx && !dy) continue;
    const nx = here.x + dx, ny = here.y + dy;
    if (!d.walkable(nx, ny) || (dx && dy && (!d.walkable(here.x + dx, here.y) || !d.walkable(here.x, here.y + dy)))) continue;
    const v = f[ny * S + nx] + (dx && dy ? 0.4 : 0);
    if (f[ny * S + nx] >= 0 && v < bd) { bd = v; best = [nx, ny]; }
  }
  return best ? d.tileCenter(best[0], best[1]) : { x: tx, y: ty };
}

const DAY = 300, NIGHT_FROM = 215;                   // one town day: 5 minutes, the last 85 s with the lamp turned down
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; ++i) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const rand = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

export class Town {
  /** dungeon: the hub's generated dungeon (TOWN_LAYOUT). */
  constructor(dungeon, seed = 1) {
    this.d = dungeon; this.rng = rand(seed ^ 0x70f0); this.time = 40; this.flows = new Map(); this.agents = []; this.barks = 0;
    const half = dungeon.half, at = (x, y) => ({ x: x * TILE - half, y: y * TILE - half });
    this.pois = POIS.map(p => ({ ...p, ...at(p.x, p.y), r: p.r * TILE * 0.5 }));
    this.poi = Object.fromEntries(this.pois.map(p => [p.id, p]));
    for (const f of FOLK) {
      const cast = CAST[f.id], role = f.kid ? 'kid' : f.cls;
      const home = this.pick(['home'], f.id) ?? this.pois[0];
      const start = cast ? this.poi[cast.at] : this.pick(Object.keys(HABITS[role]?.day ?? HABITS.villager.day), f.id + 's');
      const p = this.spot(start);
      this.agents.push({ id: f.id, model: f.id, name: f.name ?? null, role, kid: !!f.kid, cast: cast ?? null, home, x: p.x, y: p.y, facing: { x: 0, y: -1 },
        speed: 0, radius: 22, mode: 'idle', poi: start, until: this.rng() * 8, goal: null, say: null, lastSay: -99, lineIx: 0,
        pace: (f.kid ? 1.9 : cast?.slow ? 0.75 : 1.05 + this.rng() * 0.35) * TILE * 0.5 });
    }
  }
  get night() { const t = this.time % DAY; return t > NIGHT_FROM ? Math.min(1, (t - NIGHT_FROM) / 12, (DAY - t) / 12) : 0; }

  /** A random POI with one of these tags (weighted); a stable choice per key when key is given. */
  pick(tags, key) {
    const list = this.pois.filter(p => p.tags.some(t => tags.includes(t)));
    if (!list.length) return null;
    return list[key ? hash(key) % list.length : Math.floor(this.rng() * list.length)];
  }
  pickByHabit(a) {
    const h = HABITS[a.role] ?? HABITS.villager, w = this.night > 0.5 ? h.night : h.day;
    let total = 0; const opts = [];
    for (const p of this.pois) { const v = p.tags.reduce((m, t) => Math.max(m, w[t] ?? 0), 0); if (v > 0 && p !== a.poi) { opts.push([p, v]); total += v; } }
    let x = this.rng() * total;
    for (const [p, v] of opts) { x -= v; if (x <= 0) return p; }
    return opts[0]?.[0] ?? a.home;
  }
  /** A point inside a POI's circle that is walkable. */
  spot(p) {
    for (let k = 0; k < 8; ++k) {
      const a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * p.r, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r, t = this.d.tileOf(x, y);
      if (this.d.walkable(t.x, t.y)) return { x, y };
    }
    return { x: p.x, y: p.y };
  }
  flow(p) { let f = this.flows.get(p.id); if (!f) { f = this.d.flow(p.x, p.y); this.flows.set(p.id, f); } return f; }

  /** One step: walk, stand around, chat; barks when the hero passes. */
  update(dt, hero) {
    this.time += dt;
    const d = this.d;
    for (const a of this.agents) {
      if (a.say && this.time > a.say.until) a.say = null;
      if (a.mode === 'talk') {
        a.speed = 0; const dx = hero.x - a.x, dy = hero.y - a.y, l = Math.hypot(dx, dy) || 1; a.facing = { x: dx / l, y: dy / l };
        if (this.time > a.until) { a.mode = 'idle'; a.until = this.time + 2; }
        continue;
      }
      // 小豆 trails after you when you are close and walking
      if (a.cast?.follow && Math.hypot(hero.x - a.x, hero.y - a.y) < 700 && (hero.vx || hero.vy || hero.moving)) {
        a.goal = { x: hero.x - 90, y: hero.y - 60, follow: true }; a.mode = 'walk';
      }
      if (a.mode === 'idle') {
        a.speed = 0;
        if (a.poi?.face) a.facing = { x: a.poi.face[0], y: a.poi.face[1] };
        if (this.time > a.until) {
          const next = a.cast ? (a.cast.roam ? this.poi[a.cast.roam[Math.floor(this.rng() * a.cast.roam.length)]] : this.poi[a.cast.at]) : this.pickByHabit(a);
          a.poi = next; a.goal = this.spot(next); a.mode = 'walk';
        }
        continue;
      }
      // walking: follow the POI's flow field tile by tile, then go straight to the spot
      const g = a.goal; if (!g) { a.mode = 'idle'; continue; }
      const step = !g.follow && a.poi ? steerOnFlow(d, this.flow(a.poi), a.x, a.y, g.x, g.y) : g, tx = step.x, ty = step.y;
      let vx = tx - a.x, vy = ty - a.y; const dist = Math.hypot(vx, vy);
      const arrive = Math.hypot(g.x - a.x, g.y - a.y) < (g.follow ? 120 : 14);
      if (arrive) {
        a.goal = null; a.speed = 0;
        if (g.follow) { a.mode = 'idle'; a.until = this.time + 0.6; continue; }
        a.mode = 'idle'; a.until = this.time + (a.cast ? a.cast.stay * (4 + this.rng() * 6) : 5 + this.rng() * 18);
        continue;
      }
      vx /= dist || 1; vy /= dist || 1;
      // keep a little apart from each other and from you
      for (const b of this.agents) {
        if (b === a) continue; const ox = a.x - b.x, oy = a.y - b.y, o = Math.hypot(ox, oy);
        if (o < 70 && o > 0.1) { vx += ox / o * (70 - o) / 70 * 0.8; vy += oy / o * (70 - o) / 70 * 0.8; }
      }
      { const ox = a.x - hero.x, oy = a.y - hero.y, o = Math.hypot(ox, oy); if (o < 90 && o > 0.1) { vx += ox / o * 1.2; vy += oy / o * 1.2; } }
      const vl = Math.hypot(vx, vy) || 1, pace = a.pace * (g.follow ? 1.6 : 1) * (this.night > 0.5 && !a.kid ? 0.9 : 1);
      vx /= vl; vy /= vl;
      const nx = a.x + vx * pace * dt, ny = a.y + vy * pace * dt;
      d.move(a, nx, ny);
      a.speed = pace; a.facing = { x: vx, y: vy };
    }
    // someone near you says something now and then (at most two speaking at once)
    const speaking = this.agents.filter(a => a.say).length;
    if (speaking < 2 && this.rng() < dt * 0.35) {
      const near = this.agents.filter(a => !a.say && this.time - a.lastSay > 25 && Math.hypot(a.x - hero.x, a.y - hero.y) < 650);
      if (near.length) this.say(near[Math.floor(this.rng() * near.length)]);
    }
  }

  line(a) {
    if (a.cast) return a.cast.lines[a.lineIx++ % a.cast.lines.length];
    const pool = this.night > 0.5 && this.rng() < 0.5 ? SAY.night : SAY[a.role] ?? SAY.villager;
    return pool[Math.floor(this.rng() * pool.length)];
  }
  say(a, text = this.line(a), secs = 4) { a.say = { text, until: this.time + secs }; a.lastSay = this.time; return text; }
  /** Clicked: stop, turn to you, answer. */
  talk(a) { a.mode = 'talk'; a.goal = null; a.until = this.time + 6; return this.say(a, this.line(a), 5); }
  /** The person under a ground point (the click lands behind someone's feet: test the stretch their body covers on screen). */
  at(x, y) {
    let best = null, bd = 60;
    for (const a of this.agents) {
      const h = (a.kid ? 1.1 : 1.65) * 100 * 0.68, ty = Math.max(0, Math.min(h, y - a.y)), dd = Math.hypot(x - a.x, y - (a.y + ty));
      if (dd < bd) { bd = dd; best = a; }
    }
    return best;
  }
}
