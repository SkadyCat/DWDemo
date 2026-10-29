// Host layer: mirror of UDWRuleWorldSubsystem (rule library, plan cache, owners, casts,
// target export, damage commit). Host-facing units are UE units (cm) like the subsystem;
// the world itself runs in meters.
import { f, InvalidId, INDEX_NONE, mix64, statusKey, EOp, EOrigin, WEB_ONLY_OPS } from './types.js';
import { readTraitText, readBuildText, newBuild } from './reader.js';
import { readStatusText } from './statuses.js';
import { compileBuild } from './compiler.js';
import { findStat } from './stats.js';
import { RuleWorld } from './world.js';
import { validateSheet, hasSheet, sheetStitchRole } from './character.js';

const CM_TO_M = f(0.01);
export const STATIC_TARGET_BIT = 0x80000000;
export const ACTOR_TARGET_BIT = 0x40000000;
const MAX_PENDING_DAMAGE_ROWS = 65536;
// Web-only trait folders: UE does not load them (grant_traits / character sheet entries live here).
export const WEB_ONLY_TRAIT_DIRS = Object.freeze(['Timed', 'Affixes', 'WebTraits']);
const WEB_ONLY_DIR = /^(timed|affixes|webtraits)[\\/]/i;

const lower = text => String(text).toLowerCase();
const cleanFilename = path => String(path).split(/[\\/]/).pop();
const pathLess = (a, b) => (lower(a) < lower(b) ? -1 : lower(a) > lower(b) ? 1 : 0);

function* actionsOf(trait) {
  const walk = function* (list) { for (const action of list) { yield action; yield* walk(action.then || []); } };
  for (const rule of trait.rules) yield* walk(rule.actions);
}
const usesWebOnlyOp = trait => [...actionsOf(trait)].some(action => WEB_ONLY_OPS.has(action.op));
/** Fixed trait ids listed by grant_traits actions of a trait source. */
const grantIds = trait => [...actionsOf(trait)].flatMap(action => (action.op === EOp.GrantTraits && action.grant && !action.grant.stitched ? action.grant.entries.map(e => e.id) : []));
/** True when the trait carries other traits where it is used ("附带持续时间" wrappers, sheet triggers). */
export const isStitchable = trait => !!sheetStitchRole(trait) || [...actionsOf(trait)].some(action => action.op === EOp.GrantTraits && action.grant?.stitched);
/** 'self' / 'target': stitched traits are granted to the caster / event target; 'cast': they are cast as a skill. */
export const stitchTarget = trait => {
  const role = sheetStitchRole(trait);
  if (role) return role === 'cast' ? 'cast' : 'self';
  return [...actionsOf(trait)].find(action => action.op === EOp.GrantTraits && action.grant?.stitched)?.origin === EOrigin.Owner ? 'self' : 'target';
};

/** Compiled grant entries ({source} stitched | {id, params} fixed) -> trait sources. Unknown ids are skipped. */
export function resolveGrantSources(entries, library) {
  const out = [];
  for (const entry of entries) {
    if (entry.source) { out.push(entry.source); continue; }
    const trait = library?.trait(entry.id);
    if (!trait) continue;
    const params = Object.entries(entry.params || {});
    out.push(params.length ? { ...trait.source, params: new Map([...trait.source.params, ...params]) } : trait.source);
  }
  return out;
}

/** Plan traits + held traits: a held copy with the same id replaces the plan's copy, others are appended. */
export function withHeld(traits, held) {
  const out = [...traits];
  for (const extra of held) {
    const index = out.findIndex(t => lower(t.id) === lower(extra.id));
    if (index < 0) out.push(extra); else if (extra !== out[index]) out[index] = extra;
  }
  return out;
}

/** Cache key of a list of trait sources (ids, params and stitched contents). */
export function sourcesKey(sources) {
  const one = s => `${s.id}${[...s.params].map(([k, v]) => `:${k}=${v}`).join('')}${s.stitched?.length ? `(${s.stitched.map(one).join(',')})` : ''}`;
  return sources.map(one).join(',').toLowerCase();
}

/** Param overrides with the trait's own key spelling (params are matched case-insensitively). */
export function resolveParamKeys(source, params) {
  const out = {};
  for (const [key, value] of Object.entries(params || {})) {
    const name = [...source.params.keys()].find(k => lower(k) === lower(key)) ?? key;
    out[name] = value;
  }
  return out;
}

/**
 * Trait source for a collection entry {id, params, with}: params override the defaults and "with"
 * entries are stitched into the trait (recursively). Returns the shared library source when nothing
 * changes, a clone otherwise (optionally renamed to `id`), or null for an unknown trait.
 */
export function sourceFromEntry(library, entry, id = '') {
  const trait = library.trait(entry.id);
  if (!trait) return null;
  const overrides = Object.entries(resolveParamKeys(trait.source, entry.params));
  const stitched = (entry.with || []).map(child => sourceFromEntry(library, typeof child === 'string' ? { id: child } : child)).filter(Boolean);
  if (!overrides.length && !stitched.length && (!id || id === trait.source.id)) return trait.source;
  const out = { ...trait.source, id: id || trait.source.id, params: new Map([...trait.source.params, ...overrides]) };
  if (stitched.length) out.stitched = stitched;
  return out;
}

/** Rule library = Content/Rules/Traits/*.json + Builds/*.json + Statuses/*.json (UE), plus the web-only
 *  trait folders Timed/ ("附带持续时间" wrappers using grant_traits) and Affixes/ (character sheet affixes). */
export class RuleLibrary {
  constructor() {
    this.traits = new Map();
    this.builds = new Map();
    this.statuses = new Map();
  }

  /** files: [{path:'Traits/chill.json', text}] relative to the Rules directory. Same checks as LoadRuleLibrary. */
  load(files) {
    const traitFiles = files.filter(file => /^(traits|timed|affixes|webtraits)[\\/]/i.test(file.path) && /\.json$/i.test(file.path)).sort((a, b) => pathLess(a.path, b.path));
    const buildFiles = files.filter(file => /^(builds|webbuilds)[\\/]/i.test(file.path) && /\.json$/i.test(file.path)).sort((a, b) => pathLess(a.path, b.path));
    const statusFiles = files.filter(file => /^statuses[\\/]/i.test(file.path) && /\.json$/i.test(file.path)).sort((a, b) => pathLess(a.path, b.path));
    const traits = new Map();
    const builds = new Map();
    const statuses = new Map();
    for (const file of statusFiles) {
      const result = readStatusText(file.text);
      if (!result.def) return { ok: false, error: `${cleanFilename(file.path)}: ${result.error}` };
      const key = lower(result.def.id);
      if (statuses.has(key)) return { ok: false, error: `${cleanFilename(file.path)}: duplicate status id ${result.def.id}` };
      statuses.set(key, { def: result.def, displayName: result.displayName, description: result.description, category: result.category, path: file.path, text: file.text });
    }
    for (const file of traitFiles) {
      const result = readTraitText(file.text);
      if (!result.trait) return { ok: false, error: `${cleanFilename(file.path)}: ${result.error}` };
      const key = lower(result.trait.id);
      if (traits.has(key)) return { ok: false, error: `${cleanFilename(file.path)}: duplicate trait id ${result.trait.id}` };
      const webOnly = WEB_ONLY_DIR.test(file.path);
      if (!webOnly && usesWebOnlyOp(result.trait)) return { ok: false, error: `${cleanFilename(file.path)}: grant_traits / sacrifice 是网页动作，请放在 Timed/ 或 WebTraits/（UE 原生运行时还不支持）` };
      if (!webOnly && hasSheet(result.trait)) return { ok: false, error: `${cleanFilename(file.path)}: sheet（角色词条）只能用在 Affixes/ 下的特性（UE 原生运行时还不支持）` };
      const sheetError = validateSheet(result.trait);
      if (sheetError) return { ok: false, error: `${cleanFilename(file.path)}: ${sheetError}` };
      traits.set(key, { source: result.trait, displayName: result.displayName, description: result.description, path: file.path, text: file.text, webOnly });
    }
    for (const entry of traits.values()) {
      for (const id of grantIds(entry.source)) {
        if (!traits.has(lower(id))) return { ok: false, error: `${cleanFilename(entry.path)}: grant_traits unknown trait ${id}` };
      }
    }
    for (const file of buildFiles) {
      const result = readBuildText(file.text);
      if (!result.build) return { ok: false, error: `${cleanFilename(file.path)}: ${result.error || 'cannot read'}` };
      for (const id of result.build.traits) {
        if (!traits.has(lower(id))) return { ok: false, error: `${cleanFilename(file.path)}: unknown trait ${id}` };
        if (!/^webbuilds[\\/]/i.test(file.path) && traits.get(lower(id)).webOnly) return { ok: false, error: `${cleanFilename(file.path)}: 技能不能引用 Timed/、Affixes/ 下的特性 ${id}（UE 不加载这些目录）` };
      }
      if (builds.has(lower(result.build.id))) return { ok: false, error: `${cleanFilename(file.path)}: duplicate skill id ${result.build.id}` };
      builds.set(lower(result.build.id), { ...result.build, path: file.path, text: file.text, webOnly: /^webbuilds[\\/]/i.test(file.path) });
    }
    if (traits.size === 0) return { ok: false, error: 'no traits under Rules' };
    for (const status of statuses.values()) {
      for (const id of status.def.traits) {
        if (!traits.has(lower(id))) return { ok: false, error: `${cleanFilename(status.path)}: unknown trait ${id}` };
        if (traits.get(lower(id)).webOnly) return { ok: false, error: `${cleanFilename(status.path)}: 状态不能引用 Timed/、Affixes/ 下的特性 ${id}（UE 不加载这些目录）` };
      }
    }
    for (const entry of traits.values()) for (const row of entry.source.sheet || []) {
      if (row.grant_skill && (!builds.has(row.grant_skill) || /^monster_/.test(row.grant_skill)))
        return { ok: false, error: `${cleanFilename(entry.path)}: grant_skill unknown player skill ${row.grant_skill}` };
    }
    this.traits = traits;
    this.builds = builds;
    this.statuses = statuses;
    return { ok: true, error: '', traits: traits.size, builds: builds.size, statuses: statuses.size };
  }

  status(id) { return this.statuses.get(lower(id)); }
  statusDisplayName(id) { const s = this.status(id); return s && s.displayName ? s.displayName : String(id); }
  statusDefs() { return [...this.statuses.values()].map(s => s.def); }

  trait(id) { return this.traits.get(lower(id)); }
  build(id) { return this.builds.get(lower(id)); }
  traitDisplayName(id) { const t = this.trait(id); return t && t.displayName ? t.displayName : String(id); }
  buildDisplayName(id) { const b = this.build(id); return b && b.displayName ? b.displayName : String(id); }

  /** CompileTraits source: first id is active unless activeId is set; duplicates dropped. */
  buildSource(activeId, traitIds) {
    const source = newBuild(!activeId && traitIds.length > 0 ? traitIds[0] : activeId, []);
    const seen = new Set();
    for (const id of traitIds) {
      if (seen.has(lower(id))) continue;
      seen.add(lower(id));
      const trait = this.trait(id);
      if (!trait) return { source: null, error: `unknown trait ${id}` };
      source.traits.push(trait.source);
    }
    return { source, error: '' };
  }

  namedBuildSource(buildId, extraTraits = []) {
    const build = this.build(buildId);
    if (!build) return { source: null, error: `unknown build ${buildId}` };
    return this.buildSource(build.activeId, [...build.traits, ...extraTraits]);
  }
}

export class RuleHost {
  constructor(config = {}) {
    this.world = new RuleWorld(config);
    this.library = new RuleLibrary();
    this.planByHash = new Map();
    this.planSources = new Map();
    this.grantedPlans = new Map();
    this.baseDefense = new Map();
    this.appliedDefense = new Map();
    this.grants = [];
    this.nextGrant = 1;
    this.castCounter = 0n;
    this.staticTargets = [];
    this.pendingDamage = [];
    this.lastError = '';
    this.world.onGrantTraits = request => this.grantFromRule(request);
  }

  loadRuleLibrary(files) {
    const result = this.library.load(files);
    this.lastError = result.error;
    if (result.ok) {
      this.world.setStatusDefs(this.library.statusDefs());
      this.grantedPlans.clear();
    }
    return result;
  }

  /** Returns plan index or INDEX_NONE (error in this.lastError / returned object). */
  compileSource(source) {
    const { plan, error } = compileBuild(source);
    if (!plan) { this.lastError = error; return { plan: INDEX_NONE, error }; }
    const key = plan.hash.toString();
    if (this.planByHash.has(key)) return { plan: this.planByHash.get(key), error: '' };
    const index = this.world.addPlan(plan);
    this.planByHash.set(key, index);
    this.planSources.set(index, source);
    return { plan: index, error: '' };
  }

  // ---------------------------------------------------------------- timed traits
  // Duration is generic: any trait can be held for N seconds, either directly (grantTraits: item use,
  // scripted effects, timed equipment entries) or through a status whose definition lists traits.
  // While held, the holder's casts and its defense include the traits; on expiry they drop out.

  /** Grant traits to an id for `duration` seconds (world clock). entries: ids or {id, params, with}. Returns grant id. */
  grantTraits(targetId, entries, duration, label = '') {
    targetId >>>= 0;
    if (!(duration > 0)) return -1;
    const sources = [];
    const id = this.nextGrant++;
    for (const entry of entries) {
      const source = sourceFromEntry(this.library, typeof entry === 'string' ? { id: entry } : entry);
      if (!source) { this.lastError = `unknown trait ${typeof entry === 'string' ? entry : entry.id}`; return -1; }
      // Wrappers with stitched traits are separate effects: keep them apart from same-id wrappers of other grants.
      sources.push(source.stitched ? { ...source, id: `${source.id}~g${id}` } : source);
    }
    const grant = { id, targetId, sources, expire: f(this.world.getClock() + f(duration)), label, key: '' };
    this.grants.push(grant);
    return grant.id;
  }

  // World hook for the grant_traits action. Same wrapper + contents on the same holder refreshes
  // the remaining time (longest wins) instead of adding another copy.
  grantFromRule(request) {
    const sources = resolveGrantSources(request.entries, this.library);
    if (!sources.length) return -1;
    const clock = this.world.getClock();
    const expire = f(clock + request.duration);
    const live = this.grants.find(g => g.key === request.key && g.targetId === request.targetId && g.expire > clock);
    if (live) { live.expire = Math.max(live.expire, expire); return live.id; }
    const label = this.library.traitDisplayName(request.key.split('(')[0]);
    const grant = { id: this.nextGrant++, targetId: request.targetId, sources, expire, label, key: request.key };
    this.grants.push(grant);
    return grant.id;
  }

  revokeGrant(grantId) { this.grants = this.grants.filter(g => g.id !== grantId); }

  /** Grant ready trait sources (e.g. stitched payloads of character triggers) for `duration` seconds. */
  grantSources(targetId, sources, duration, label = '') {
    if (!(duration > 0) || !sources.length) return -1;
    const id = this.nextGrant++;
    const own = sources.map(s => (s.stitched ? { ...s, id: `${s.id}~g${id}` } : s));
    this.grants.push({ id, targetId: targetId >>> 0, sources: own, expire: f(this.world.getClock() + f(duration)), label, key: '' });
    return id;
  }

  /** Live grants on an id: [{id, label, traits, remaining}]. */
  activeGrants(targetId) {
    const clock = this.world.getClock();
    return this.grants.filter(g => g.targetId === (targetId >>> 0) && g.expire > clock)
      .map(g => ({ id: g.id, label: g.label, traits: g.sources.map(s => s.id.split('~')[0]), remaining: g.expire - clock }));
  }

  // Trait sources held by an id right now: status-granted (definition order), then direct grants (grant order).
  heldSources(targetId) {
    const out = [];
    const add = source => { if (!out.some(s => lower(s.id) === lower(source.id))) out.push(source); };
    for (const id of this.world.grantedTraits(targetId)) { const t = this.library.trait(id); if (t) add(t.source); }
    const clock = this.world.getClock();
    for (const grant of this.grants) if (grant.targetId === targetId && grant.expire > clock) grant.sources.forEach(add);
    return out;
  }

  holders() {
    const ids = this.world.idsWithGrantedTraits();
    const clock = this.world.getClock();
    this.grants = this.grants.filter(g => g.expire > clock);
    for (const grant of this.grants) ids.add(grant.targetId);
    return ids;
  }

  sourceKey(sources) { return sourcesKey(sources); }

  // Base plan + held trait sources (cached). Falls back to the base plan if the combination is rejected.
  planWithSources(planIndex, held) {
    if (!held.length) return planIndex;
    const key = `${planIndex}|${this.sourceKey(held)}`;
    if (this.grantedPlans.has(key)) return this.grantedPlans.get(key);
    const source = this.planSources.get(planIndex);
    let result = planIndex;
    if (source) {
      // A held copy with its own params replaces the plan's copy (e.g. a timed stronger chill).
      const compiled = this.compileSource(newBuild(source.activeId, withHeld(source.traits, held)));
      if (compiled.plan !== INDEX_NONE) result = compiled.plan;
    }
    this.grantedPlans.set(key, result);
    return result;
  }

  /** Timed status on any target id. Statuses with traits grant them while live. */
  applyStatus(targetId, name, value, duration) {
    return this.world.applyStatusKey(targetId >>> 0, statusKey(name), value, duration);
  }

  /** Permanent defense traits of a target (resistances); held timed traits are added on top each frame. */
  setTargetDefenseTraits(targetId, traitIds) {
    targetId >>>= 0;
    const sources = traitIds.map(id => this.library.trait(id)?.source).filter(Boolean);
    if (sources.length) this.baseDefense.set(targetId, sources); else this.baseDefense.delete(targetId);
    this.appliedDefense.delete(targetId);
    return this.bindDefense(targetId, sources);
  }

  bindDefense(targetId, sources) {
    if (!sources.length) { this.world.setTargetDefensePlan(targetId, INDEX_NONE); return true; }
    const { plan, error } = this.compileSource(newBuild(sources[0].id, sources));
    if (plan === INDEX_NONE) { this.lastError = error; return false; }
    this.world.setTargetDefensePlan(targetId, plan);
    return true;
  }

  // Before each step: holders of timed traits get base + held defense traits; expired ones fall back.
  refreshGrantedDefense() {
    const holders = this.holders();
    for (const id of [...this.appliedDefense.keys()]) {
      if (holders.has(id)) continue;
      this.appliedDefense.delete(id);
      this.bindDefense(id, this.baseDefense.get(id) || []);
    }
    for (const id of holders) {
      const sources = [...(this.baseDefense.get(id) || [])];
      for (const held of this.heldSources(id)) if (!sources.some(s => lower(s.id) === lower(held.id))) sources.push(held);
      const key = this.sourceKey(sources);
      if (this.appliedDefense.get(id) === key) continue;
      this.appliedDefense.set(id, key);
      this.bindDefense(id, sources);
    }
  }

  compileTraits(activeId, traitIds) {
    const { source, error } = this.library.buildSource(activeId, traitIds);
    return source ? this.compileSource(source) : { plan: INDEX_NONE, error };
  }

  compileNamedBuild(buildId, extraTraits = []) {
    const { source, error } = this.library.namedBuildSource(buildId, extraTraits);
    return source ? this.compileSource(source) : { plan: INDEX_NONE, error };
  }

  plan(index) { return index >= 0 ? this.world.getPlan(index) : null; }

  getPlanStat(planIndex, path) {
    const stat = findStat(path);
    return planIndex < 0 || stat < 0 ? 0 : this.world.getPlan(planIndex).stats.get(stat);
  }

  getStatus(targetId, name) { return this.world.getStatus(targetId >>> 0, statusKey(name)); }
  getStatusRemaining(targetId, name) { return this.world.getStatusRemaining(targetId >>> 0, statusKey(name)); }
  forgetTarget(targetId) {
    this.world.clearTargetStatuses(targetId >>> 0);
    this.baseDefense.delete(targetId >>> 0);
    this.appliedDefense.delete(targetId >>> 0);
    this.grants = this.grants.filter(g => g.targetId !== (targetId >>> 0));
    this.world.setTargetDefensePlan(targetId >>> 0, INDEX_NONE);
  }

  registerOwner(externalId, team) { return this.world.addOwner(externalId >>> 0, Math.max(0, Math.min(255, team))); }
  setOwnerStatusId(owner, statusId) { this.world.setOwnerStatusId(owner, statusId); }
  /** {value, remaining} of a status effect (EStatusEffect) summed over a target's live statuses. */
  getStatusEffect(targetId, effect) { return this.world.getStatusEffect(targetId >>> 0, effect); }

  updateOwner(owner, location, aim) {
    this.world.updateOwner(owner, f(location.x * CM_TO_M), f(location.y * CM_TO_M), f(location.z * CM_TO_M), aim.x, aim.y, aim.z);
  }

  /** extraFor(plan) (optional): per-cast extra trait sources computed from the plan with held traits (character offense). */
  castBuild(planIndex, owner, origin, direction, power = 0, extraFor = null, targetPoint = null) {
    this.castCounter = (this.castCounter + 1n) & ((1n << 64n) - 1n);
    const seed = mix64(this.castCounter ^ (BigInt(planIndex >>> 0) << 32n) ^ BigInt(owner >>> 0));
    const o = this.world.owners[owner];
    const held = o ? this.heldSources(o.statusId) : [];
    let plan = this.planWithSources(planIndex, held);
    const extra = extraFor && plan !== INDEX_NONE ? (extraFor(this.world.getPlan(plan)) || []) : [];
    if (extra.length) plan = this.planWithSources(planIndex, [...held, ...extra]);
    const target = targetPoint ? { x: f(targetPoint.x * CM_TO_M), y: f(targetPoint.y * CM_TO_M), z: f((targetPoint.z ?? 0) * CM_TO_M) } : null;
    return this.world.cast(plan, owner, f(origin.x * CM_TO_M), f(origin.y * CM_TO_M), f(origin.z * CM_TO_M), direction.x, direction.y, direction.z, seed, power, target);
  }

  addStaticTarget(location, radiusCm, health, team) {
    this.staticTargets.push({ x: f(location.x * CM_TO_M), y: f(location.y * CM_TO_M), z: f(location.z * CM_TO_M), radius: f(Math.max(1, radiusCm) * CM_TO_M), health, team });
    return (STATIC_TARGET_BIT | (this.staticTargets.length - 1)) >>> 0;
  }

  /** Mass processor side: reset the per-frame export. */
  beginTargets() { this.world.targets.reset(); }

  /** One live target (location/radius in cm). */
  addTarget(location, radiusCm, health, team, externalId, resistance = null) {
    this.world.targets.add(f(location.x * CM_TO_M), f(location.y * CM_TO_M), f(location.z * CM_TO_M), f(radiusCm * CM_TO_M), health, team, externalId, resistance);
  }

  /** Steps the world and returns the committed damage rows of this frame. */
  stepFrame(deltaSeconds) {
    const targets = this.world.targets;
    this.staticTargets.forEach((target, index) => targets.add(target.x, target.y, target.z, target.radius, target.health, target.team, (STATIC_TARGET_BIT | index) >>> 0));
    this.refreshGrantedDefense();
    this.world.step(deltaSeconds);
    const rows = this.world.damageLog;
    for (const record of rows) {
      if (record.TargetExternalId & STATIC_TARGET_BIT) {
        const target = this.staticTargets[(record.TargetExternalId & ~STATIC_TARGET_BIT) >>> 0];
        if (target) target.health -= record.Amount;
      }
      if (this.pendingDamage.length < MAX_PENDING_DAMAGE_ROWS) {
        this.pendingDamage.push({ TargetId: record.TargetExternalId, OwnerId: record.OwnerExternalId, Amount: record.Amount, Element: record.Element, bCritical: record.bCritical, bKilled: record.bKilled });
      }
    }
    this.world.damageLog = [];
    return rows;
  }

  drainDamage() {
    const rows = this.pendingDamage;
    this.pendingDamage = [];
    return rows;
  }

  getFrameReport() {
    const s = this.world.getStats();
    return { ...s, SimulationMs: s.TotalMs, ActiveRoots: this.world.activeRoots() };
  }
}

export { InvalidId, INDEX_NONE };
