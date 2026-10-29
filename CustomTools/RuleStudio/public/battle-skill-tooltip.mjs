// Presentation only; skill-details owns the read-only runtime projection.
export const BattleSkillTooltip = {
  props: { detail: Object, position: Object, icon: String }, emits: ['hold', 'leave'],
  template: /* html */ `<Teleport to="body"><section v-if="detail" id="battle-skill-tooltip" role="tooltip" class="b3-skill-tooltip" :style="position" @pointerenter="$emit('hold')" @pointerleave="$emit('leave')" @pointerdown.stop @pointermove.stop @wheel.stop>
    <header><img class="game-icon" :src="icon" alt="" draggable="false"><div><h3>{{ detail.name }}</h3><small>当前配装 · 实时更新</small></div></header>
    <div class="b3-skill-tooltip-body">
      <p v-if="detail.error" class="b3-skill-tooltip-note">{{ detail.error }}</p>
      <template v-else-if="detail.kind === 'aura'">
        <p class="b3-aura-tooltip-state" :class="{enabled: detail.enabled}">{{ detail.enabled ? '光环已开启 · 持续生效' : '光环未开启' }}</p>
        <p v-if="detail.description" class="b3-aura-tooltip-description">{{ detail.description }}</p>
        <dl class="b3-skill-tooltip-stats"><div v-for="stat in detail.stats" :key="stat.name"><dt>{{ stat.name }}</dt><dd>{{ stat.value }}</dd></div></dl>
        <h4>光环词条</h4>
        <ul><li v-for="(trait, i) in detail.traits" :key="trait.id + ':' + i">{{ trait.name }}</li></ul>
        <p class="b3-skill-tooltip-note">按对应快捷键开启或关闭；点击槽位配置光环或药剂。</p>
      </template>
      <template v-else>
        <h4>当前伤害</h4>
        <div v-for="hit in detail.hits" :key="hit.key" class="b3-skill-hit"><div><span>{{ hit.label }}</span><b>{{ hit.amount === null ? '动态' : hit.amount }}</b></div><small><template v-for="(part, i) in hit.elements" :key="part.element"><span v-if="i"> + </span>{{ part.name }} {{ part.amount }}</template></small></div>
        <p v-if="!detail.hits.length" class="b3-skill-tooltip-note">{{ detail.summon ? '召唤物独立结算伤害' : '无直接命中伤害' }}</p>
        <p v-if="detail.hits.length" class="b3-skill-tooltip-note">单次命中 · 未暴击 · 未计敌方减免</p>
        <dl class="b3-skill-tooltip-stats"><div v-for="stat in detail.stats" :key="stat.name"><dt>{{ stat.name }}</dt><dd>{{ stat.value }}</dd></div></dl>
        <template v-if="detail.conditional.length"><h4>条件伤害</h4><div v-for="row in detail.conditional" :key="row.key" class="b3-skill-conditional"><div>{{ row.source }}<b>{{ row.current === null ? '动态' : row.current }}</b></div><small>{{ row.detail }}</small></div></template>
        <h4>生效词条 <small>{{ detail.traits.length }}</small></h4>
        <p v-if="!detail.traits.length" class="b3-skill-tooltip-note">暂无影响此技能的词条</p>
        <ul><li v-for="(trait, i) in detail.traits" :key="trait.id + ':' + i"><div>{{ trait.name }}</div><small>{{ trait.from }}<span v-if="trait.remaining !== null"> · {{ trait.remaining.toFixed(1) }}s</span></small><p v-if="trait.stitched">附带：{{ trait.stitched }}</p></li></ul>
        <p class="b3-skill-tooltip-note">目标状态、飞行距离、弹跳等条件效果在命中时结算。</p>
      </template>
    </div>
  </section></Teleport>`,
};
