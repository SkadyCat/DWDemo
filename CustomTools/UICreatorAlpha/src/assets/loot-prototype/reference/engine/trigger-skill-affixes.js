// Equipment authoring recipes, not combat rules. Each recipe stitches complete
// skill collections into an existing trigger wrapper and rolls normal T1–T10 params.
export const TRIGGER_SKILL_AFFIXES = Object.freeze([
  { id: 'consume_lightning_nova', name: '消耗目标异常状态时，有n%概率触发雷霆新星',
    trigger: 'trig_ailment_consumed', skills: ['lightning_nova'] },
  { id: 'consume_poison_flask', name: '消耗目标异常状态时，有n%概率触发毒瓶',
    trigger: 'trig_ailment_consumed', skills: ['poison_flask'] },
  { id: 'sacrifice_thunder_guard', name: '主动牺牲召唤物时，触发雷霆新星与召唤铁刃守卫',
    trigger: 'trig_sacrifice', skills: ['lightning_nova', 'iron_guard'] },
]);
