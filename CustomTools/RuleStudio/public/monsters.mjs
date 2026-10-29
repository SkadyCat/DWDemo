import { createApp, ref, computed, watch } from '/vendor/vue.esm-browser.prod.js';
import { store, reloadStore, notify } from '/editors.mjs';
import { emptyMonster, emptyMonsterSkill, parseMonster, validateMonster, serializeMonster, MONSTER_FIXED_SLOTS, PLAYER_FIXED_EQUIPMENT } from '/engine/index.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const TEMPLATE = /* html */ `
<div class="monster-editor" v-if="store.library">
  <aside class="card monster-list">
    <div class="monster-list-head"><h2>怪物 <span class="count">{{ entries.length }}</span></h2><button class="btn sm primary" @click="createNew">新建怪物</button></div>
    <p class="sub">配置战斗中的怪物与靠近后的技能。</p>
    <input class="monster-search" v-model="query" aria-label="搜索怪物" placeholder="搜索名称或 id…">
    <div class="monster-list-items">
      <button v-for="entry in filtered" :key="entry.doc.id" class="monster-entry" :class="{on: selected === entry.doc.id && !isNew}" @click="choose(entry.doc.id)">
        <span class="monster-swatch" :style="{background: entry.doc.color}">{{ entry.doc.name.charAt(0) }}</span>
        <span class="monster-entry-main"><b>{{ entry.doc.name }}</b><small>{{ entry.doc.id }}</small><small>{{ entry.doc.skills.filter(s => s.enabled).length }} 个技能 · {{ entry.doc.health }} 生命</small><small>第 {{ entry.doc.minFloor }} 层起</small></span>
        <em :class="{enabled: entry.doc.enabled && entry.doc.weight > 0}">{{ entry.doc.enabled && entry.doc.weight > 0 ? '刷新中' : '已停用' }}</em>
      </button>
      <p class="dim" v-if="!filtered.length">没有匹配的怪物</p>
    </div>
    <p class="monster-list-note">保存后战场会使用新配置。关闭“加入刷新”或将权重设为 0，可停用该怪物。</p>
  </aside>
  <section class="card monster-form" v-if="draft">
    <header class="monster-form-head">
      <div><h2>{{ draft.name || '新怪物' }}</h2><p class="sub">{{ isNew ? '新建配置' : 'Monsters/' + draft.id + '.json' }} <span v-if="dirty" class="monster-unsaved">· 未保存</span></p></div>
      <div class="row gap"><button class="btn sm" :disabled="!dirty || saving" @click="restore">还原</button><button class="btn sm primary" :disabled="!dirty || !!validation || saving" @click="save">{{ saving ? '保存中…' : '保存怪物' }}</button><button class="btn sm" :disabled="dirty || isNew || saving || !draft.enabled || draft.weight <= 0" @click="testMonster">试战此怪物</button></div>
    </header>
    <div class="monster-form-body">
      <h3>基础属性</h3>
      <div class="monster-fields">
        <label><span>怪物名称</span><input v-model="draft.name" aria-label="怪物名称"></label>
        <label><span>id</span><input v-model="draft.id" :readonly="!isNew" aria-label="怪物 id"></label>
        <label><span>生命</span><input type="number" min="1" max="1000000" v-model.number="draft.health" aria-label="怪物生命"></label>
        <label><span>移动速度（cm/s）</span><input type="number" min="0" max="3000" v-model.number="draft.speed" aria-label="怪物移动速度"></label>
        <label><span>停步距离（cm）</span><input type="number" min="0" max="5000" v-model.number="draft.stopDistance" aria-label="停步距离"></label>
        <label><span>体型倍率</span><input type="number" min="0.05" max="10" step="0.05" v-model.number="draft.scale" aria-label="体型倍率"></label>
        <label><span>后方跟随距离（cm，0关闭）</span><input type="number" min="0" max="5000" v-model.number="draft.followDistance" aria-label="后方跟随距离"></label>
        <label><span>刷新权重</span><input type="number" min="0" max="10000" v-model.number="draft.weight" aria-label="刷新权重"></label>
        <label><span>开始出现层数</span><input type="number" min="1" step="1" v-model.number="draft.minFloor" aria-label="开始出现层数"></label>
        <label class="monster-color"><span>外观颜色</span><input type="color" v-model="draft.color" aria-label="怪物颜色"></label>
        <label class="monster-enabled"><input type="checkbox" v-model="draft.enabled"> 加入刷新</label>
      </div>
      <label class="monster-description"><span>描述</span><textarea rows="2" v-model="draft.description" aria-label="怪物描述"></textarea></label>
      <h3>固定装备槽 <small>3 槽</small></h3>
      <div class="monster-fixed-equipment">
        <label v-for="slot in MONSTER_FIXED_SLOTS" :key="slot.id"><span>{{ slot.name }}</span>
          <select v-model="draft.equipment[slot.id]" :aria-label="'怪物' + slot.name"><option :value="null">{{ slot.id === 'rarity' ? '沿用现有刷新（普通 / 稀有）' : '空槽' }}</option><option v-for="item in equipmentFor(slot.id)" :key="item.id" :value="item.id">{{ item.name }}</option></select>
        </label>
      </div>
      <p class="monster-help">三个槽的装备特性共同聚合。稀有度支持普通、魔法、稀有、Boss；塔层印记只读取塔地图属性槽。固定槽装备可在“装备”页编辑。</p>
      <div class="block-head monster-skills-head"><h3>靠近后使用的技能 <small>{{ draft.skills.length }} / 8</small></h3><button class="btn sm" @click="addSkill" :disabled="draft.skills.length >= 8 || !unusedSkills.length">添加技能</button></div>
      <p class="monster-help">进入释放距离后，优先使用列表中靠前且冷却就绪的技能。技能可以在“技能”页继续编辑。</p>
      <div class="monster-skill-table">
        <table v-if="draft.skills.length"><thead><tr><th>技能</th><th>距离（cm）</th><th>冷却（s）</th><th>威力</th><th>启用</th><th>顺序</th></tr></thead><tbody>
          <tr v-for="(skill, i) in draft.skills" :key="i">
            <td><select v-model="skill.id" :aria-label="'怪物技能 ' + (i + 1)"><option v-for="s in builds" :key="s.id" :value="s.id" :disabled="draft.skills.some((other, j) => j !== i && other.id === s.id)">{{ s.name }}</option></select></td>
            <td><input type="number" min="1" max="5000" v-model.number="skill.range" :aria-label="'技能 ' + (i + 1) + ' 释放距离'"></td>
            <td><input type="number" min="0.1" max="120" step="0.1" v-model.number="skill.cooldown" :aria-label="'技能 ' + (i + 1) + ' 冷却'"></td>
            <td><input type="number" min="0" max="100000" v-model.number="skill.power" :aria-label="'技能 ' + (i + 1) + ' 威力'"></td>
            <td><input type="checkbox" v-model="skill.enabled" :aria-label="'启用技能 ' + (i + 1)"></td>
            <td class="monster-skill-actions"><button class="btn sm" :disabled="i === 0" @click="moveSkill(i, -1)" :aria-label="'上移技能 ' + (i + 1)">↑</button><button class="btn sm" :disabled="i === draft.skills.length - 1" @click="moveSkill(i, 1)" :aria-label="'下移技能 ' + (i + 1)">↓</button><button class="btn sm danger" @click="draft.skills.splice(i, 1)" :aria-label="'移除技能 ' + (i + 1)">×</button></td>
          </tr>
        </tbody></table>
        <p class="empty" v-else>尚未配置技能；此怪物只会接近目标。</p>
      </div>
      <div class="error" v-if="validation || error">{{ validation || error }}</div>
      <div class="monster-behavior"><h3>当前行为</h3>
        <p>正常爬塔从第 <b>{{ draft.minFloor }}</b> 层开始参与刷新，三波怪物和首领使用相同限制；“试战此怪物”可提前预览。</p>
        <p v-if="draft.followDistance > 0">跟随玩家后方 <b>{{ draft.followDistance }} cm</b> 的位置，误差 ≤ {{ draft.stopDistance }} cm 时停步；技能持续瞄准玩家。</p>
        <p v-else>距离目标超过 <b>{{ draft.stopDistance }} cm</b> 时接近；进入技能范围后朝目标施法。</p>
        <p v-for="(skill, i) in draft.skills" :key="i" :class="{dim: !skill.enabled}">{{ i + 1 }}. {{ skillName(skill.id) }}：{{ skill.enabled ? '距离 ≤ ' + skill.range + ' cm · 冷却 ' + skill.cooldown + ' s · 威力 ' + skill.power : '已停用' }}</p>
        <p class="dim">冻结时暂停移动与施法，冰缓会减慢冷却。多技能之间至少间隔 0.35 秒。威力会传入技能；固定伤害由该技能的特性参数控制。</p>
        <p class="monster-warning" v-if="rangeWarning">停步距离大于所有已启用技能的释放距离，怪物可能停在射程之外。</p>
      </div>
      <details class="monster-json"><summary>配置文件预览</summary><pre>{{ text }}</pre></details>
    </div>
  </section>
  <div class="card panel" v-else><p>选择或新建一个怪物。</p></div>
</div>
<div class="ed-loading" v-else>{{ store.error || '加载怪物配置…' }}</div>`;

export function mountMonsters(el, { onTest } = {}) {
  createApp({
    template: TEMPLATE,
    setup() {
      const selected = ref(''), draft = ref(null), baseline = ref(''), isNew = ref(false), query = ref(''), saving = ref(false), error = ref('');
      const entries = computed(() => [...store.monsters.values()].filter(e => e.doc && !e.error));
      const filtered = computed(() => entries.value.filter(e => `${e.doc.name} ${e.doc.id}`.toLowerCase().includes(query.value.trim().toLowerCase())));
      const builds = computed(() => { store.version; return [...(store.library?.builds.values() || [])].map(b => ({ id: b.id, name: b.displayName || b.id })).sort((a, b) => Number(b.id.startsWith('monster_')) - Number(a.id.startsWith('monster_'))); });
      const unusedSkills = computed(() => builds.value.filter(s => !draft.value?.skills.some(row => row.id === s.id)));
      const equipmentFor = slot => [...(store.collections?.equipment.values() || [])].filter(entry => entry.doc?.slot === slot && !entry.error && !Object.values(PLAYER_FIXED_EQUIPMENT).includes(entry.doc.id)).map(entry => entry.doc);
      const text = computed(() => draft.value ? serializeMonster(draft.value) : '');
      const dirty = computed(() => text.value !== baseline.value);
      const validation = computed(() => {
        if (!draft.value || !store.library) return '';
        const parsed = parseMonster(text.value);
        if (parsed.error) return parsed.error;
        if (isNew.value && store.monsters.has(parsed.doc.id)) return '该怪物 id 已存在';
        return validateMonster(parsed.doc, store.library, store.collections);
      });
      const rangeWarning = computed(() => {
        const skills = draft.value?.skills.filter(s => s.enabled) || [];
        return !draft.value?.followDistance && skills.length && draft.value.stopDistance > Math.max(...skills.map(s => s.range));
      });
      const skillName = id => store.library?.buildDisplayName(id) || id;
      function load(id) {
        const doc = store.monsters.get(id)?.doc;
        if (!doc) { draft.value = null; selected.value = ''; baseline.value = ''; return; }
        selected.value = id; isNew.value = false; draft.value = clone(doc); baseline.value = text.value; error.value = '';
      }
      function canLeave() { if (dirty.value) { notify('请先保存或还原当前怪物的修改', true); return false; } return true; }
      function choose(id) { if (canLeave()) load(id); }
      function createNew() {
        if (!canLeave()) return;
        let n = 1; while (store.monsters.has(`new_monster_${n}`)) n++;
        isNew.value = true; selected.value = ''; baseline.value = ''; error.value = '';
        draft.value = { ...emptyMonster(`new_monster_${n}`), name: '新怪物', skills: [emptyMonsterSkill()] };
      }
      function restore() { load(isNew.value ? entries.value[0]?.doc.id : selected.value); }
      function addSkill() {
        const skill = unusedSkills.value[0];
        if (skill && draft.value.skills.length < 8) draft.value.skills.push(emptyMonsterSkill(skill.id));
      }
      function moveSkill(index, delta) { const list = draft.value.skills; const [row] = list.splice(index, 1); list.splice(index + delta, 0, row); }
      async function save() {
        if (saving.value || validation.value || !draft.value) return;
        const id = draft.value.id;
        saving.value = true; error.value = '';
        try {
          const response = await fetch(`/api/rules/Monsters/${id}.json`, { method: 'PUT', body: text.value });
          const result = await response.json();
          if (!response.ok) { error.value = result.error; return; }
          await reloadStore();
          load(id);
          window.dispatchEvent(new Event('rulestudio:changed'));
          notify('怪物配置已保存，战场已使用新配置');
        } catch (e) { error.value = `保存失败：${e.message}`; }
        finally { saving.value = false; }
      }
      function testMonster() { if (!dirty.value && draft.value) onTest?.(draft.value.id); }
      watch(() => store.version, () => { if (!dirty.value) load(store.monsters.has(selected.value) ? selected.value : entries.value[0]?.doc.id); }, { immediate: true });
      return { store, entries, filtered, builds, unusedSkills, equipmentFor, MONSTER_FIXED_SLOTS, selected, draft, isNew, query, saving, error, text, dirty, validation, rangeWarning, skillName, choose, createNew, restore, addSkill, moveSkill, save, testMonster };
    },
  }).mount(el);
}
