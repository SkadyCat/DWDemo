// Isolated component: the 10 Hz counter does not rerender the main HUD.
export const BattleDps = {
  props: { stats: { type: Object, required: true } },
  template: `<section class="b3-dps" aria-label="平均单体秒伤" title="最近1秒玩家及召唤物对敌造成的实际伤害总和 ÷ 实际受击敌人数。包含持续伤害，使用实际扣除的气血与护盾伤害。">
    <header><b>单体秒伤</b><small>伤害 / 秒</small></header>
    <output class="mono">{{ stats.amount }}</output>
    <footer>近 1 秒均值<span>受击 {{ stats.targets }} 个</span></footer>
  </section>`,
};
