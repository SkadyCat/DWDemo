// Equipment affix compositions. Payloads come from the existing skill collections;
// acquisition saves ordinary trig_hit + with entries, using the existing combat rules.
export const SUMMON_HIT_AFFIXES = Object.freeze([
  { id: 'hit_summon_iron_guard', name: '命中敌人时，有n%概率触发召唤铁刃守卫', skill: 'iron_guard' },
  { id: 'hit_summon_ember_hound', name: '命中敌人时，有n%概率触发召唤赤焰战犬', skill: 'ember_hound' },
  { id: 'hit_summon_fire_turret', name: '命中敌人时，有n%概率触发召唤火球炮台', skill: 'fire_turret' },
  { id: 'hit_summon_storm_totem', name: '命中敌人时，有n%概率触发召唤引雷图腾', skill: 'storm_totem' },
]);
