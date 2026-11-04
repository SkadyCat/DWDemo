// 主线六章（星烬纪）：每章目标可任意顺序完成；事件只算当前章；状态目标（阶、天赋…）直接读存档；领奖后进下一章。
// 支线：跟着章节解锁，先找给任务的人说话才算接下，做完自动发奖励；旧的八章存档换算到新章节。
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, SIDE_QUESTS, newQuestState, questView, sideView, questGivers, questEvent, questTick, claimChapter, migrateQuests } from '../public/game/quests.mjs';
import { CURRENCIES } from '../core/content/items.mjs';
import { NODE_KINDS, FAMILY_ORDER } from '../public/game/atlas.mjs';
import { NPCS, STATIONS } from '../public/game/hub.mjs';
import { FOLK } from '../public/game/townsfolk.mjs';
import { SCARAB_IDS } from '../public/game/scarabs.mjs';

const fresh = () => ({ unlocked: 1, inventory: [], equipped: {}, skills: ['fireball', null, null, null], talents: { allocated: [] }, currencies: {}, waystones: [], scarabs: {}, quests: newQuestState() });
const people = new Set([...NPCS.map(n => n.id), ...STATIONS.map(n => n.id), ...FOLK.map(f => f.id)]);

test('六章，每章有目标和奖励；引用的通货、地区、节点类型、要找的人都存在', () => {
  assert.equal(CHAPTERS.length, 6);
  for (const c of [...CHAPTERS, ...SIDE_QUESTS]) {
    if (c.intro) assert.ok(c.intro.length && c.outro.length, c.id);
    assert.ok(c.steps.length >= 2, c.id);
    for (const id of Object.keys(c.reward.currencies ?? {})) assert.ok(CURRENCIES[id], id);
    for (const id of Object.keys(c.reward.scarabs ?? {})) assert.ok(SCARAB_IDS.includes(id), id);
    for (const s of c.steps) {
      if (s.goal.family) assert.ok(FAMILY_ORDER.includes(s.goal.family), s.goal.family);
      if (s.goal.kind) assert.ok(NODE_KINDS[s.goal.kind], s.goal.kind);
      if (s.goal.who) assert.ok(people.has(s.goal.who), s.goal.who);
    }
  }
  for (const x of SIDE_QUESTS) assert.equal(x.steps[0].goal.who, x.giver, `${x.id} 的第一步是找给任务的人`);
});

test('第一章：找诺娅、事件推进、状态目标、领奖进入第二章', () => {
  const save = fresh();
  assert.equal(questView(save).index, 0);
  assert.ok(questGivers(save).has('chronicler'), '诺娅头上有「！」');
  questEvent(save, { type: 'talk', who: 'chronicler' });
  questEvent(save, { type: 'clear', tier: 1, family: 'ruin', kind: 'normal' });
  let v = questView(save);
  assert.equal(v.steps[0].done, true); assert.equal(v.steps[1].done, true); assert.equal(v.steps[3].have, 1);
  for (let i = 0; i < 3; ++i) questEvent(save, { type: 'clear', tier: 1, family: 'ember', kind: 'normal' });
  questEvent(save, { type: 'equip' });
  assert.equal(questView(save).complete, false);
  save.unlocked = 3;
  const notes = questTick(save);
  assert.ok(notes.some(n => n.type === 'chapter' && n.index === 0));
  let seed = 7; const got = claimChapter(save, () => (seed = (seed * 16807) % 2147483647) / 2147483647);
  assert.ok(got.currencies.augment > 0 && got.waystones.length === 2);
  assert.equal(questView(save).index, 1);
  assert.equal(claimChapter(save), null, '没完成不能领');
});

test('筛选条件：地区、节点类型、最低阶都要满足', () => {
  const save = fresh(); save.quests.chapter = 1;  // 炉心
  questEvent(save, { type: 'clear', tier: 5, family: 'frost', kind: 'normal' });   // 地区不对
  assert.equal(questView(save).steps[2].have, 0);
  questEvent(save, { type: 'clear', tier: 5, family: 'ember', kind: 'boss' });
  const v = questView(save);
  assert.equal(v.steps[2].have, 1); assert.equal(v.steps[5].done, true);
  questEvent(save, { type: 'pickup', item: { traits: [], lines: [], baseLines: 2 } });
  assert.equal(questView(save).steps[4].done, false);
  questEvent(save, { type: 'pickup', item: { traits: [], lines: [], baseLines: 3 } });
  assert.equal(questView(save).steps[4].done, true);
});

test('支线：先找人接下才开始算，做完自动发奖励；跟着章节解锁', () => {
  const save = fresh();
  const ids = () => sideView(save).map(x => x.quest.id);
  assert.ok(ids().includes('t_bread') && !ids().includes('t_chestnut'), '海伦的栗子要第二章才有');
  assert.ok(questGivers(save).has('rosa'));
  questEvent(save, { type: 'kills', n: 500 });
  assert.equal(sideView(save).find(x => x.quest.id === 't_bread').steps[1].have, 0, '没找罗莎之前杀怪不算');
  const took = questEvent(save, { type: 'talk', who: 'rosa' });
  assert.ok(took.some(n => n.type === 'take' && n.quest.id === 't_bread'));
  assert.ok(!questGivers(save).has('rosa'), '接下以后「！」没了');
  const before = save.currencies.augment ?? 0;
  const notes = questEvent(save, { type: 'kills', n: 320 });
  assert.ok(notes.some(n => n.type === 'side' && n.quest.id === 't_bread'));
  assert.equal(save.currencies.augment, before + 4);
  assert.equal(sideView(save).find(x => x.quest.id === 't_bread').state, 'done');
  assert.ok(!questEvent(save, { type: 'kills', n: 500 }).some(n => n.type === 'side'), '只发一次');
  // a guide quest with a reward in 星契
  save.quests.chapter = 2;
  questEvent(save, { type: 'talk', who: 'collector' });
  questEvent(save, { type: 'sigil' });
  assert.equal(save.scarabs.bounty_1, 2);
});

test('旧的八章存档换到对应的新章节；全部通关后没有当前章', () => {
  const old = fresh(); old.quests = { chapter: 6, progress: { '6.0': 2 }, done: { '6.0': true }, introSeen: 6, claimed: [0, 1, 2, 3, 4, 5] };
  migrateQuests(old);
  assert.equal(old.quests.chapter, 5); assert.equal(old.quests.v, 2); assert.deepEqual(old.quests.claimed, [0, 1, 2, 3, 4]);
  assert.equal(old.quests.introSeen, 4, '新的第六章开场要放给他看');
  const save = fresh(); save.quests.chapter = 6;
  assert.equal(questView(save), null);
  assert.ok(!questEvent(save, { type: 'equip' }).some(n => n.type === 'step' || n.type === 'chapter'));
});

test('追踪：默认跟主线当前一步；选了支线就跟支线；步骤指向要找的人或地方', async () => {
  const { trackHint } = await import('../public/game/quests.mjs');
  const save = fresh();
  assert.equal(trackHint(save).who, 'chronicler', '先去找诺娅');
  questEvent(save, { type: 'talk', who: 'chronicler' });
  assert.equal(trackHint(save).who, 'device', '然后出城：地图仪');
  questEvent(save, { type: 'talk', who: 'torg' });
  assert.equal(trackHint(save, 'g_stash').who, 'stash', '存仓库：库房的宝箱');
  assert.equal(trackHint(save, 'nope').id, null, '没有这条支线就回到主线');
});
