import test from 'node:test';
import assert from 'node:assert/strict';
import { readRuleFiles } from '../scripts/rule-files.mjs';
import { checkRuleSet, readTraitText, EEndReason } from '../engine/index.mjs';
import { Battle } from '../public/sim/battle.mjs';

const dt = 1 / 60;
const near = (a, b) => assert.ok(Math.abs(a - b) < .003, `${a} != ${b}`);
function fixture({ flags = [], enemies = [[500, 200]], mixed = false } = {}) {
  const files = readRuleFiles().map(file => {
    if (file.path !== 'Equipment/frostthorn_staff.json') return file;
    const doc = JSON.parse(file.text); doc.traits.push(...flags);
    return { ...file, text: JSON.stringify(doc) };
  });
  const check = checkRuleSet(files); assert.ok(check.ok, check.error);
  const b = new Battle(files, { collections: check.collections, maxMonsters: 0, spawnRate: 0, seed: 18 });
  b.setLoadout({ skills: ['frost_lance'], equipment: { weapon: 'frostthorn_staff' } });
  b.spawnMonsters(enemies.length);
  b.monsters.forEach((m, i) => Object.assign(m, { x: enemies[i][0], y: enemies[i][1], health: 1e8, maxHealth: 1e8,
    speed: 0, cooldown: 9999, shield: 0, maxShield: 0, attackRange: 0 }));
  b.setAim(1000, -400); b.step(dt);
  const actions = [{ op: 'emit', kind: 'generic_trigger_lob', element: 'fire', trajectory: 'parabolic',
    speed: 24, lifetime: 1.1, arc_height: 2.5, radius: .05, damage: 0 }];
  if (mixed) actions.push({ op: 'emit', kind: 'generic_straight_bolt', element: 'frost', speed: 24, lifetime: 1.1, radius: .05, damage: 0 });
  const { trait, error } = readTraitText(JSON.stringify({ id: 'generic_trigger_probe', rules: [{ id: 'cast', event: 'cast', actions }] }));
  assert.equal(error, '');
  const starts = [], ends = [], samples = [], world = b.host.world;
  const trace = world.trace, endHook = world.endHook;
  world.trace = (type, data) => {
    trace?.(type, data);
    if (type === 'spawn') {
      const c = world.carriers, root = world.roots[c.root[data.index]];
      starts.push({ kind: data.plan.kindNames.names[data.kind], x: c.px[data.index], y: c.py[data.index],
        vx: c.vx[data.index], vy: c.vy[data.index], life: c.life[data.index], target: root.targetPoint });
    }
  };
  world.endHook = (index, reason) => {
    const c = world.carriers, plan = world.plans[world.roots[c.root[index]].plan];
    ends.push({ kind: plan.kindNames.names[c.kind[index]], x: c.px[index], y: c.py[index], z: c.pz[index], reason });
    return endHook?.(index, reason);
  };
  const cast = (ctx = {}) => b.combat.triggers.cast({ sources: [trait], ctx, trigger: null, layers: 0 });
  const tick = frames => {
    for (let frame = 0; frame < frames; frame++) {
      b.step(dt);
      for (const shot of b.projectiles()) samples.push(shot);
    }
  };
  return { b, cast, tick, starts, ends, samples };
}

test('触发抛物线：向选中的敌人落地，不再按24×1.1飞出26.4米；目标移动不会拖走已发射弹体', () => {
  const f = fixture(); f.cast(); f.tick(1);
  assert.deepEqual(f.starts[0].target, { x: 5, y: 2, z: 0 });
  f.b.monsters[0].x = -1200; f.b.monsters[0].y = 1500;
  f.b.setAim(-2200, -2200); f.tick(90);
  const end = f.ends.find(row => row.kind === 'generic_trigger_lob');
  assert.ok(end); near(end.x, 5); near(end.y, 2); near(end.z, .05);
  assert.equal(end.reason, EEndReason.Expired);
});

test('触发抛物线：在事件位置释放且目标同点时原地起落，不向任意方向远抛', () => {
  const f = fixture({ flags: ['trigger_at_event'] }); f.cast({ x: 5, y: 2, id: f.b.monsters[0].id }); f.tick(90);
  near(f.starts[0].x, 5); near(f.starts[0].y, 2);
  near(f.starts[0].vx, 0); near(f.starts[0].vy, 0);
  near(f.ends[0].x, 5); near(f.ends[0].y, 2);
  assert.ok(f.samples.every(shot => Math.hypot(shot.x - 500, shot.y - 200) < .3));
});

test('触发抛物线：来源目标优先于较近敌人；无活目标时保留事件坐标或当前瞄准落点', () => {
  const source = fixture({ flags: ['trigger_at_source'], enemies: [[300, 0], [800, 100]] });
  source.cast({ id: source.b.monsters[1].id }); source.tick(1);
  assert.deepEqual(source.starts[0].target, { x: 8, y: 1, z: 0 });
  const event = fixture({ flags: ['trigger_at_event'], enemies: [] });
  event.cast({ x: 4, y: -3, id: 1234 }); event.tick(90);
  near(event.ends[0].x, 4); near(event.ends[0].y, -3);
  const aim = fixture({ enemies: [] }); aim.cast(); aim.tick(1);
  aim.b.setAim(-3000, 4000); aim.tick(90);
  near(aim.ends[0].x, 10); near(aim.ends[0].y, -4);
});

test('触发抛物线：速度词条只改变飞行时间；同次施放的直线弹体仍保持直线射程', () => {
  const fast = fixture({ flags: ['proj_speed'], mixed: true }); fast.cast(); fast.tick(1);
  assert.ok(fast.starts[0].life < 1.1);
  fast.b.monsters.forEach(m => { m.x = -2000; m.y = 2000; }); fast.tick(120);
  const lob = fast.ends.find(row => row.kind === 'generic_trigger_lob'); near(lob.x, 5); near(lob.y, 2);
  const straight = fast.ends.find(row => row.kind === 'generic_straight_bolt');
  assert.ok(Math.hypot(straight.x, straight.y) > 32 && Math.hypot(straight.x, straight.y) < 34,
    'ordinary straight expiry keeps its original speed × lifetime range, with one fixed-step tolerance');
  assert.ok(fast.samples.filter(s => s.kind === 'generic_straight_bolt').every(s => Math.abs(s.z - 60) < .01));
});
