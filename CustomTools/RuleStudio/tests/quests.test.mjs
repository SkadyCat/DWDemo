// 主线任务：八章，每章目标可任意顺序完成；事件只算当前章；状态目标（阶、天赋…）直接读存档；领奖后进下一章。
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, newQuestState, questView, questEvent, questTick, claimChapter } from '../public/game/quests.mjs';
import { CURRENCIES } from '../core/content/items.mjs';
import { NODE_KINDS, FAMILY_ORDER } from '../public/game/atlas.mjs';

const fresh = () => ({ unlocked: 1, inventory: [], equipped: {}, skills: ['fireball', null, null, null], talents: { allocated: [] }, currencies: {}, waystones: [], quests: newQuestState() });

test('八章，每章有目标和奖励，引用的通货、地区、节点类型都存在', () => {
  assert.equal(CHAPTERS.length, 8);
  for (const c of CHAPTERS) {
    assert.ok(c.intro.length && c.outro.length && c.steps.length >= 3, c.id);
    for (const id of Object.keys(c.reward.currencies)) assert.ok(CURRENCIES[id], id);
    for (const s of c.steps) {
      if (s.goal.family) assert.ok(FAMILY_ORDER.includes(s.goal.family), s.goal.family);
      if (s.goal.kind) assert.ok(NODE_KINDS[s.goal.kind], s.goal.kind);
    }
  }
});

test('第一章：事件推进、状态目标、领奖进入第二章', () => {
  const save = fresh();
  assert.equal(questView(save).index, 0);
  questEvent(save, { type: 'clear', tier: 1, family: 'ruin', kind: 'normal' });
  let v = questView(save);
  assert.equal(v.steps[0].done, true); assert.equal(v.steps[3].have, 1);
  for (let i = 0; i < 3; ++i) questEvent(save, { type: 'clear', tier: 1, family: 'ember', kind: 'normal' });
  questEvent(save, { type: 'pickup', item: { traits: [], lines: [], baseLines: 1 } });
  questEvent(save, { type: 'equip' });
  assert.equal(questView(save).complete, false);
  save.unlocked = 3;
  const notes = questTick(save);
  assert.ok(notes.some(n => n.type === 'chapter' && n.index === 0));
  let seed = 7; const got = claimChapter(save, () => (seed = (seed * 16807) % 2147483647) / 2147483647);
  assert.ok(got.currencies.augment > 0 && got.waystones.length === 2);
  assert.equal(save.currencies.augment, CHAPTERS[0].reward.currencies.augment);
  assert.equal(questView(save).index, 1);
  assert.equal(claimChapter(save), null, '没完成不能领');
});

test('筛选条件：地区、节点类型、最低阶都要满足', () => {
  const save = fresh(); save.quests.chapter = 2;  // 余烬熔炉
  questEvent(save, { type: 'clear', tier: 3, family: 'ember', kind: 'normal' });   // 阶不够
  questEvent(save, { type: 'clear', tier: 5, family: 'frost', kind: 'normal' });   // 地区不对
  assert.equal(questView(save).steps[0].have, 0);
  questEvent(save, { type: 'clear', tier: 5, family: 'ember', kind: 'boss' });
  const v = questView(save);
  assert.equal(v.steps[0].have, 1); assert.equal(v.steps[4].done, true);
  questEvent(save, { type: 'kills', n: 900 }); questEvent(save, { type: 'kills', n: 900 });
  assert.equal(questView(save).steps[1].done, true);
  questEvent(save, { type: 'pickup', item: { traits: [], lines: [], baseLines: 2 } });
  assert.equal(questView(save).steps[2].done, false);
  questEvent(save, { type: 'pickup', item: { traits: [], lines: [], baseLines: 3 } });
  assert.equal(questView(save).steps[2].done, true);
});

test('全部通关后没有当前章', () => {
  const save = fresh(); save.quests.chapter = 8;
  assert.equal(questView(save), null);
  assert.deepEqual(questEvent(save, { type: 'equip' }), []);
});
