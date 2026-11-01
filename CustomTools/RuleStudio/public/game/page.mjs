// 游戏页：营地（选图、本图要求、角色、背包、洗炼、流派）+ 地图战斗（3D）。全部跑在新规则引擎上。
import { createApp, reactive, computed, ref, onMounted, onBeforeUnmount, markRaw, nextTick } from '../vendor/vue.esm-browser.prod.js';
import { SLOTS, LAYERS, family } from '../../core/content/families.mjs';
import { CURRENCIES, SLOT_NAMES, rarityOf, itemName, lineText } from '../../core/content/items.mjs';
import { ARCHETYPES } from '../../core/content/archetypes.mjs';
import { STAGES } from '../../core/content/builds.mjs';
import { mapProfile, mapRequirements, MAP_FAMILIES, MAP_TIERS } from '../../core/content/maps.mjs';
import { gameContent } from '../../core/content/game.mjs';
import { defenceReport, roleReport } from '../../core/analysis.mjs';
import { loadSave, writeSave, buildOf, equip, unequip, salvage, craft, applyArchetype, PLAYABLE_SKILLS, SKILL_BAR } from './save.mjs';
import { MapRun } from './run.mjs';
import { Scene3D, Overlay } from './scene.mjs';
import { dungeonRandom } from './dungeon.mjs';
import { runSelfUpdate } from '../self-update.mjs';

const TEMPLATE = /* html */ `
<div class="g">
  <div class="g-stage" ref="stage" tabindex="0" @contextmenu.prevent>
    <div class="g-overlay" ref="overlay"></div>
  </div>

  <header class="g-top" v-if="run">
    <div class="g-map"><b>{{ run.profile.name }}</b><span>{{ hud.time }}</span><span>击杀 {{ hud.kills }}/{{ hud.total }}</span><span v-if="hud.boss">首领 {{ hud.boss }}</span></div>
    <button class="g-btn" @click="leaveRun">{{ run.phase === 'running' ? '放弃地图' : '返回营地' }}</button>
  </header>

  <footer class="g-hud" v-if="run">
    <div class="g-pools">
      <div class="g-pool es" v-if="hud.esMax > 0"><i :style="{ width: pct(hud.es, hud.esMax) }"></i><span>护盾 {{ hud.es }}/{{ hud.esMax }}</span></div>
      <div class="g-pool life"><i :style="{ width: pct(hud.life, hud.lifeMax) }"></i><span>生命 {{ hud.life }}/{{ hud.lifeMax }}</span></div>
      <div class="g-pool mana"><i :style="{ width: pct(hud.mana, hud.manaMax) }"></i><span>魔力 {{ hud.mana }}/{{ hud.manaMax }}</span></div>
    </div>
    <div class="g-skills">
      <button v-for="(s, i) in hud.skills" :key="i" class="g-skill" :class="{ on: i === hud.selected, cd: s.cd > 0 }" @click="selectSkill(i)">
        <kbd>{{ i + 1 }}</kbd><span>{{ s.name }}</span><em v-if="s.cd > 0">{{ s.cd.toFixed(1) }}</em>
      </button>
    </div>
    <div class="g-res">
      <span v-for="r in hud.resources" :key="r.id">{{ r.name }} {{ r.value }}</span>
      <span v-for="s in hud.buffs" :key="s.id" :style="{ color: s.color }">{{ s.name }}{{ s.stacks > 1 ? '×' + s.stacks : '' }}</span>
    </div>
  </footer>

  <div class="g-result" v-if="run && run.phase !== 'running'">
    <h2>{{ run.phase === 'cleared' ? '地图完成' : '阵亡' }}</h2>
    <p>{{ run.profile.name }} · 用时 {{ hud.time }} · 击杀 {{ hud.kills }}</p>
    <p v-if="run.phase === 'cleared'">拾取 {{ resultLoot.items }} 件装备、{{ resultLoot.currencies }} 个通货<span v-if="resultLoot.unlocked">，解锁 T{{ resultLoot.unlocked }}</span></p>
    <button class="g-btn primary" @click="leaveRun">返回营地</button>
  </div>

  <!-- Camp -->
  <div class="g-camp" v-if="!run">
    <nav class="g-tabs">
      <button v-for="t in tabs" :key="t.id" :class="{ on: tab === t.id }" @click="tab = t.id">{{ t.name }}</button>
      <span class="g-sp"></span>
      <button class="g-btn" @click="update" :title="updateText">{{ updateText || '更新到最新' }}</button>
    </nav>

    <section v-if="tab === 'map'" class="g-panel g-maps">
      <div class="g-col">
        <h3>选择地图</h3>
        <div class="g-tiers">
          <button v-for="t in tierList" :key="t" :disabled="t > save.unlocked + 1" :class="{ on: t === mapTier }" @click="mapTier = t">T{{ t }}</button>
        </div>
        <div class="g-fams">
          <button v-for="(f, id) in families" :key="id" :class="{ on: id === mapFamily }" @click="mapFamily = id">{{ f.name }}</button>
        </div>
        <p class="g-dim">{{ familyMix }}</p>
        <button class="g-btn primary big" @click="startRun">进入 {{ profile.name }}</button>
        <p class="g-dim">已解锁到 T{{ save.unlocked }}。通关一张图解锁下一阶。</p>
      </div>
      <div class="g-col">
        <h3>本图要求</h3>
        <table class="g-req">
          <tr v-for="r in requirements" :key="r.name" :class="r.ok ? 'ok' : 'bad'"><td>{{ r.name }}</td><td>{{ r.need }}</td><td>{{ r.have }}</td><td>{{ r.ok ? '达标' : '不足' }}</td></tr>
        </table>
        <div class="g-eval">
          <button class="g-btn" @click="evaluate" :disabled="evaluating">{{ evaluating ? '评估中…' : '评估输出（攻坚 / 速刷）' }}</button>
          <div v-if="roles" class="g-roles">
            <div><b>攻坚</b> {{ roles.bossing.toFixed(2) }}<small>首领约 {{ roles.ttk === Infinity ? '打不动' : roles.ttk.toFixed(0) + ' 秒' }}（狂暴 60 秒）</small></div>
            <div><b>速刷</b> {{ roles.clearing.toFixed(2) }}<small>每秒击杀 {{ roles.kps.toFixed(2) }}（奖励线 {{ profile.clearTarget.toFixed(2) }}）</small></div>
            <div><b>倾向</b> {{ roles.lean }}</div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="tab === 'char'" class="g-panel g-char">
      <div class="g-col">
        <h3>装备</h3>
        <div class="g-slots">
          <div v-for="s in slots" :key="s" class="g-slot" :class="slotClass(s)" @click="pick(save.equipped[s])">
            <small>{{ slotNames[s] }}</small>
            <template v-if="save.equipped[s]"><b :style="{ color: rarity(save.equipped[s]).color }">{{ name(save.equipped[s]) }}</b><em>{{ save.equipped[s].lines.length + save.equipped[s].implicit.length }} 条</em>
              <button class="g-x" title="卸下" @click.stop="doUnequip(s)">×</button></template>
            <span v-else class="g-dim">空</span>
          </div>
        </div>
        <h3>技能栏</h3>
        <div class="g-skillpick">
          <label v-for="i in skillBar" :key="i">{{ i }}
            <select v-model="save.skills[i - 1]" @change="persist">
              <option :value="null">（空）</option>
              <option v-for="id in playable" :key="id" :value="id">{{ skillName(id) }}</option>
            </select></label>
        </div>
      </div>
      <div class="g-col">
        <h3>属性（按 T{{ mapTier }} 地图惩罚）</h3>
        <table class="g-stats"><tr v-for="r in statRows" :key="r[0]"><td>{{ r[0] }}</td><td>{{ r[1] }}</td></tr></table>
        <item-card v-if="picked" :item="picked" :selected-line="pickedLine" @line="i => pickedLine = i"></item-card>
      </div>
    </section>

    <section v-if="tab === 'bag'" class="g-panel g-bag">
      <div class="g-col">
        <h3>背包 <small>{{ save.inventory.length }} 件</small></h3>
        <div class="g-list">
          <div v-for="it in save.inventory" :key="it.uid" class="g-row" :class="{ on: picked === it }" @click="pick(it)">
            <b :style="{ color: rarity(it).color }">{{ name(it) }}</b><small>{{ slotNames[it.slot] }} · {{ it.lines.length }} 条随机</small>
            <span class="g-sp"></span>
            <button class="g-btn sm" @click.stop="doEquip(it.uid)">装备</button>
            <button class="g-btn sm" @click.stop="doSalvage(it.uid)">分解</button>
          </div>
          <p v-if="!save.inventory.length" class="g-dim">背包是空的。去地图里打装备吧。</p>
        </div>
      </div>
      <div class="g-col"><item-card v-if="picked" :item="picked" :compare="equippedFor(picked)" :selected-line="pickedLine" @line="i => pickedLine = i"></item-card></div>
    </section>

    <section v-if="tab === 'craft'" class="g-panel g-craft">
      <div class="g-col">
        <h3>洗炼 <small v-if="picked">{{ name(picked) }}</small></h3>
        <p class="g-dim" v-if="!picked">先在「角色」或「背包」里点选一件装备。</p>
        <div class="g-cur">
          <button v-for="(c, id) in currencies" :key="id" class="g-btn" :disabled="!picked || !(save.currencies[id] > 0)" @click="doCraft(id)" :title="c.desc">
            {{ c.name }} <b>{{ save.currencies[id] || 0 }}</b></button>
        </div>
        <p class="g-msg" v-if="craftMsg">{{ craftMsg }}</p>
        <ul class="g-dim small"><li v-for="(c, id) in currencies" :key="id"><b>{{ c.name }}</b>：{{ c.desc }}</li></ul>
      </div>
      <div class="g-col"><item-card v-if="picked" :item="picked" :selected-line="pickedLine" @line="i => pickedLine = i"></item-card></div>
    </section>

    <section v-if="tab === 'bd'" class="g-panel g-bd">
      <p class="g-dim">一键换上某个流派在某个阶段「应该」拿到的整套装备（当前装备放回背包）。每个流派只用一个朴素技能，形态全部来自词条。</p>
      <div class="g-bds">
        <div v-for="a in archetypes" :key="a.id" class="g-bdcard" :class="{ on: save.archetype === a.id }">
          <h4>{{ a.name }} <small>{{ a.style }} · {{ skillName(a.skills[0]) }}</small></h4>
          <p>{{ a.summary }}</p>
          <div class="g-stages"><button v-for="(s, i) in stages" :key="s.id" class="g-btn sm" @click="applyBd(a.id, i)" :title="'地图 T' + s.maps.join('–')">{{ s.name }}</button></div>
        </div>
      </div>
    </section>
  </div>
</div>`;

const ItemCard = {
  props: ['item', 'compare', 'selectedLine'],
  emits: ['line'],
  setup(props) {
    const layerName = id => LAYERS[family(id).layer].name;
    return { props, rarityOf, itemName, lineText, layerName, SLOT_NAMES, family };
  },
  template: /* html */ `
  <div class="g-card">
    <h4 :style="{ color: rarityOf(item).color }">{{ itemName(item) }} <small>{{ rarityOf(item).name }} · {{ SLOT_NAMES[item.slot] }}</small></h4>
    <p v-if="item.preset" class="g-dim">流派配装：{{ item.preset }}</p>
    <div class="g-lines">
      <div v-for="(l, i) in item.implicit" :key="'i' + i" class="g-line base">{{ lineText(l) }}<small>基础 T{{ l.tier }}</small></div>
      <div v-for="(l, i) in item.lines" :key="i" class="g-line" :class="['layer-' + family(l.id).layer, { on: i === selectedLine, sealed: l.sealed }]" @click="$emit('line', i)">
        {{ lineText(l) }}<small>{{ layerName(l.id) }} T{{ l.tier }}{{ l.sealed ? ' · 封印' : '' }}</small></div>
    </div>
    <template v-if="compare && compare !== item"><h5 class="g-dim">当前装备：{{ itemName(compare) }}</h5>
      <div class="g-lines dim"><div v-for="(l, i) in [...compare.implicit, ...compare.lines]" :key="i" class="g-line">{{ lineText(l) }}</div></div></template>
  </div>`,
};

export function mountGame(el) {
  const app = createApp({
    components: { ItemCard },
    template: TEMPLATE,
    setup() {
      const save = reactive(loadSave());
      const persist = () => writeSave(save);
      const stage = ref(null), overlay = ref(null);
      const tab = ref('map'), mapTier = ref(Math.min(save.unlocked, MAP_TIERS)), mapFamily = ref('ruin');
      const picked = ref(null), pickedLine = ref(-1), craftMsg = ref(''), roles = ref(null), evaluating = ref(false), updateText = ref('');
      const run = ref(null), resultLoot = reactive({ items: 0, currencies: 0, unlocked: 0 });
      const hud = reactive({ time: '0:00', kills: 0, total: 0, boss: '', life: 0, lifeMax: 1, es: 0, esMax: 0, mana: 0, manaMax: 1, skills: [], selected: 0, resources: [], buffs: [] });
      const content = gameContent();
      const rng = dungeonRandom(Date.now() >>> 0);
      let scene = null, ov = null, raf = 0, last = 0, acc = 0;
      const keys = new Set(), mouse = { x: 0, y: 0, down: false };

      const profile = computed(() => mapProfile(mapTier.value, mapFamily.value));
      const familyMix = computed(() => Object.entries(profile.value.mix).map(([k, v]) => `${{ physical: '物理', fire: '火焰', cold: '冰霜', lightning: '闪电', chaos: '混沌' }[k]} ${Math.round(v * 100)}%`).join(' · '));
      const build = () => buildOf(save);
      const report = computed(() => { void JSON.stringify(save.equipped); return defenceReport(content, build(), mapTier.value, mapFamily.value); });
      const requirements = computed(() => {
        const d = report.value, req = mapRequirements(profile.value);
        const res = e => Math.round(d.resists[e]);
        return [
          { name: '火焰抗性', need: '75%', have: `${res('fire')}%`, ok: d.resists.fire >= 75 },
          { name: '冰霜抗性', need: '75%', have: `${res('cold')}%`, ok: d.resists.cold >= 75 },
          { name: '闪电抗性', need: '75%', have: `${res('lightning')}%`, ok: d.resists.lightning >= 75 },
          { name: '混沌抗性', need: '≥ 0%', have: `${res('chaos')}%`, ok: d.resists.chaos >= 0 },
          { name: '首领重击', need: `扛住 ${d.bigHit}`, have: `生命+护盾 ${Math.round(d.pool)}`, ok: d.bigHitOk },
          { name: '冰冻防护', need: req.freezeImmune ? '异常免疫 ≥ 40%' : '不要求', have: `${Math.round(d.avoidAilment)}%`, ok: d.freezeOk },
          { name: '全抗惩罚', need: `−${profile.value.resistPenalty}%`, have: '已计入上面的抗性', ok: true },
        ];
      });
      const statRows = computed(() => {
        const d = report.value;
        return [['生命 + 护盾', Math.round(d.pool)], ['护甲', Math.round(d.armour)], ['闪避', Math.round(d.evasion)], ['格挡', `${Math.round(d.block)}%`],
          ['抗性 火/冰/电/混', `${Math.round(d.resists.fire)} / ${Math.round(d.resists.cold)} / ${Math.round(d.resists.lightning)} / ${Math.round(d.resists.chaos)}`],
          ['生命回复 / 偷取', `${Math.round(d.regen)}/秒 · ${d.leech.toFixed(1)}%`], ['异常免疫', `${Math.round(d.avoidAilment)}%`], ['承受首领重击', `${d.bigHit}（${Math.round(d.bigHitRatio * 100)}% 生命池）`]];
      });

      function pick(it) { picked.value = it ?? null; pickedLine.value = -1; craftMsg.value = ''; }
      function equippedFor(it) { const s = it.slot === 'ring2' ? 'ring1' : it.slot; return save.equipped[s] ?? (it.slot.startsWith('ring') ? save.equipped.ring2 : null); }
      function doEquip(uid) { equip(save, uid); picked.value = null; roles.value = null; persist(); }
      function doUnequip(s) { unequip(save, s); roles.value = null; persist(); }
      function doSalvage(uid) { const g = salvage(save, uid, rng); if (picked.value?.uid === uid) picked.value = null; craftMsg.value = g ? `分解获得 ${CURRENCIES[g].name}` : '分解'; persist(); }
      function doCraft(id) { const r = craft(save, picked.value, id, rng, pickedLine.value); craftMsg.value = r.message; roles.value = null; persist(); }
      function applyBd(id, i) { applyArchetype(save, id, i); mapTier.value = STAGES[i].maps[0]; roles.value = null; picked.value = null; tab.value = 'map'; persist(); }
      async function evaluate() {
        evaluating.value = true; await nextTick(); await new Promise(r => setTimeout(r, 30));
        try { roles.value = roleReport(content, build(), mapTier.value); } finally { evaluating.value = false; }
      }
      async function update() { await runSelfUpdate((t) => { updateText.value = t; }); }

      // ---- run lifecycle ----------------------------------------------------------------------
      function startRun() {
        if (!save.skills.some(Boolean)) { tab.value = 'char'; return; }
        const r = new MapRun(build(), { tier: mapTier.value, family: mapFamily.value, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
        run.value = markRaw(r);
        if (!scene) { scene = new Scene3D(stage.value); ov = new Overlay(overlay.value); }
        stage.value.focus();
        last = performance.now(); acc = 0;
        cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
      }
      function leaveRun() {
        const r = run.value; if (!r) return;
        if (r.phase === 'cleared' || r.phase === 'running' || r.phase === 'failed') {
          const loot = r.phase === 'failed' ? r.pickedUp : r.collectAll();
          for (const d of loot) { if (d.type === 'item') save.inventory.push(d.item); else save.currencies[d.id] = (save.currencies[d.id] || 0) + d.count; }
          if (r.phase === 'cleared') { save.unlocked = Math.min(MAP_TIERS, Math.max(save.unlocked, r.tier + 1)); save.stats.maps++; }
          save.stats.kills += r.kills;
          persist();
        }
        cancelAnimationFrame(raf);
        run.value = null; roles.value = null;
        mapTier.value = Math.min(save.unlocked, Math.max(mapTier.value, 1));
      }
      function frame(now) {
        const r = run.value; if (!r) return;
        const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
        // Input → hero
        const mx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0), my = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
        r.setMove(mx, my);
        const at = scene.pick(mouse.x, mouse.y); if (at) r.setAim(at.x, at.y);
        r.setCasting(mouse.down && r.phase === 'running');
        while (acc >= 1 / 60) { r.step(1 / 60); acc -= 1 / 60; }
        if (r.phase !== 'running' && !resultLoot.done) {
          resultLoot.done = true;
          const loot = r.phase === 'cleared' ? [...r.pickedUp, ...r.loot.map(l => l.drop)] : r.pickedUp;
          resultLoot.items = loot.filter(d => d.type === 'item').length; resultLoot.currencies = loot.filter(d => d.type === 'currency').length;
          resultLoot.unlocked = r.phase === 'cleared' && r.tier + 1 > save.unlocked && r.tier < MAP_TIERS ? r.tier + 1 : 0;
        }
        scene.update(r, now / 1000); ov.update(scene, r);
        syncHud(r);
        raf = requestAnimationFrame(frame);
      }
      function syncHud(r) {
        const h = r.hero, s = Math.floor(r.endedAt ?? r.clearedAt ?? r.elapsed);
        Object.assign(hud, { time: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, kills: r.kills, total: r.total,
          boss: r.boss?.alive ? `${Math.round(100 * r.boss.life / r.boss.max.life)}%` : '已击杀',
          life: Math.max(0, Math.round(h.life)), lifeMax: Math.round(h.max.life), es: Math.round(h.es), esMax: Math.round(h.max.es), mana: Math.round(h.mana), manaMax: Math.round(h.max.mana),
          selected: r.selected, skills: r.skills.map(sk => ({ name: sk.def.name, cd: Math.max(0, sk.readyAt - r.world.time) })),
          resources: [['power', '能量球'], ['frenzy', '狂怒球'], ['endurance', '耐力球'], ['burst', '迸发'], ['instruction', '指令']].map(([id, name]) => ({ id, name, value: h.resource(id) })).filter(x => x.value > 0),
          buffs: r.statuses(h).filter(x => !['ignited', 'poisoned', 'bleeding', 'shocked', 'chilled', 'frozen'].includes(x.id)) });
        if (!r.phase || r.phase === 'running') resultLoot.done = false;
      }
      function selectSkill(i) { run.value?.select(i); }

      const onKey = (e, down) => {
        const k = e.key.toLowerCase();
        if (['w', 'a', 's', 'd'].includes(k)) { if (down) keys.add(k); else keys.delete(k); e.preventDefault(); }
        if (down && /^[1-4]$/.test(k)) selectSkill(+k - 1);
        if (down && k === 'escape' && run.value && run.value.phase !== 'running') leaveRun();
      };
      const kd = e => onKey(e, true), ku = e => onKey(e, false);
      const mm = e => { const rect = stage.value?.getBoundingClientRect(); if (rect) { mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top; } };
      const md = e => { if (e.button === 0 && run.value && e.target.closest('.g-stage')) mouse.down = true; };
      const mu = e => { if (e.button === 0) mouse.down = false; };
      const rs = () => scene?.resize();
      onMounted(() => { addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('mousemove', mm); addEventListener('mousedown', md); addEventListener('mouseup', mu); addEventListener('resize', rs); });
      onBeforeUnmount(() => { cancelAnimationFrame(raf); removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('mousemove', mm); removeEventListener('mousedown', md); removeEventListener('mouseup', mu); removeEventListener('resize', rs); scene?.dispose(); });

      return {
        save, persist, stage, overlay, tab, mapTier, mapFamily, picked, pickedLine, craftMsg, roles, evaluating, updateText, run, resultLoot, hud,
        profile, familyMix, requirements, statRows, pick, equippedFor, doEquip, doUnequip, doSalvage, doCraft, applyBd, evaluate, update, startRun, leaveRun, selectSkill,
        tabs: [{ id: 'map', name: '地图' }, { id: 'char', name: '角色' }, { id: 'bag', name: '背包' }, { id: 'craft', name: '洗炼' }, { id: 'bd', name: '流派' }],
        tierList: Array.from({ length: MAP_TIERS }, (_, i) => i + 1), families: MAP_FAMILIES, slots: SLOTS, slotNames: SLOT_NAMES, currencies: CURRENCIES,
        archetypes: ARCHETYPES, stages: STAGES, playable: PLAYABLE_SKILLS, skillBar: SKILL_BAR,
        rarity: rarityOf, name: itemName, skillName: id => content.skills.get(id)?.name ?? id,
        slotClass: s => save.equipped[s] ? 'filled' : 'empty',
        pct: (a, b) => `${Math.max(0, Math.min(100, 100 * a / Math.max(1, b)))}%`,
      };
    },
  });
  const vm = app.mount(el);
  // Debug/automation hook (tests drive the run through it).
  globalThis.__dw = { get run() { return vm.run; }, get save() { return vm.save; } };
  return app;
}
