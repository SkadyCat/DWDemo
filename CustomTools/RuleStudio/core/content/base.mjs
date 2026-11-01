// 基础规则包：异常、充能以外的通用资源、所有单位共有的底层修正。这里是「游戏规则」，不是流派内容。
const ailment = (id, status, kind, from, extra) => ({ id, status, kind, from, ...extra });

export const BASE = Object.freeze({
  resources: [
    { id: 'rage', maxStat: 'rage.max', decay: 2, decayDelay: 2, decayAfter: 'hit' },
  ],
  stats: [
    { key: 'rage.max', base: 30, min: 0 },
  ],
  statuses: [
    { id: 'ignited', name: '点燃', tags: ['ailment', 'elemental', 'fire', 'dot', 'ignite'], stacking: 'strongest', max: 8, duration: 4, dot: { type: 'fire' } },
    { id: 'poisoned', name: '中毒', tags: ['ailment', 'chaos', 'dot', 'poison'], stacking: 'instances', max: 999, duration: 2, dot: { type: 'chaos' } },
    { id: 'bleeding', name: '流血', tags: ['ailment', 'physical', 'dot', 'bleed'], stacking: 'strongest', max: 8, duration: 5, dot: { type: 'physical' } },
    { id: 'shocked', name: '感电', tags: ['ailment', 'elemental', 'lightning', 'shock'], duration: 4, debuff: true,
      mods: [{ stat: 'damageTaken', op: 'inc', value: 100 }] },
    { id: 'chilled', name: '冰缓', tags: ['ailment', 'elemental', 'cold', 'chill'], duration: 2, debuff: true,
      mods: [{ stat: 'speed', op: 'more', value: -100 }, { stat: 'moveSpeed', op: 'more', value: -100 }] },
    { id: 'frozen', name: '冰冻', tags: ['ailment', 'elemental', 'cold', 'freeze'], duration: 1.2, debuff: true,
      mods: [{ stat: 'cannotAct', op: 'flag' }, { stat: 'cannotMove', op: 'flag' }] },
    { id: 'electrocuted', name: '电击', tags: ['ailment', 'elemental', 'lightning', 'electrocute'], duration: 1, debuff: true,
      mods: [{ stat: 'cannotAct', op: 'flag' }] },
    { id: 'brittle', name: '易碎', tags: ['ailment', 'elemental', 'cold', 'brittle'], duration: 4, debuff: true,
      mods: [{ stat: 'crit.taken', op: 'base', value: 100 }] },
    { id: 'sapped', name: '精疲力尽', tags: ['ailment', 'elemental', 'lightning', 'sap'], duration: 4, debuff: true,
      mods: [{ stat: 'damage', op: 'more', value: -100 }] },
    { id: 'scorched', name: '烧灼', tags: ['ailment', 'elemental', 'fire', 'scorch'], duration: 4, debuff: true,
      mods: [{ stat: 'res.fire', op: 'base', value: -100 }, { stat: 'res.cold', op: 'base', value: -100 }, { stat: 'res.lightning', op: 'base', value: -100 }] },
  ],
  ailments: [
    ailment('ignite', 'ignited', 'dot', ['fire'], { pct: 20, duration: 4 }),
    ailment('poison', 'poisoned', 'dot', ['physical', 'chaos'], { pct: 20, duration: 2 }),
    ailment('bleed', 'bleeding', 'dot', ['physical'], { pct: 15, duration: 5 }),
    ailment('shock', 'shocked', 'soft', ['lightning'], { scale: 0.5, cap: 0.5, min: 0.05, duration: 4 }),
    ailment('chill', 'chilled', 'soft', ['cold'], { scale: 0.5, cap: 0.3, min: 0.05, duration: 2 }),
    ailment('freeze', 'frozen', 'soft', ['cold'], { scale: 1, cap: 1, min: 0.3, duration: 1.2, fixed: true }),
    ailment('electrocute', 'electrocuted', 'soft', ['lightning'], { scale: 1, cap: 1, min: 0.3, duration: 1, fixed: true }),
    ailment('brittle', 'brittle', 'soft', ['cold'], { scale: 0.3, cap: 0.15, min: 0.01, duration: 4 }),
    ailment('sap', 'sapped', 'soft', ['lightning'], { scale: 0.3, cap: 0.2, min: 0.01, duration: 4 }),
    ailment('scorch', 'scorched', 'soft', ['fire'], { scale: 0.5, cap: 0.3, min: 0.01, duration: 4 }),
  ],
  baseMods: [
    // Cold hits always chill (PoE); everything else needs chance from gear.
    { stat: 'chance.chill', op: 'base', value: 100 },
    { stat: 'accuracy', op: 'base', value: 1000 },
  ],
});
