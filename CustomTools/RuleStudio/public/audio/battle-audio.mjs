import { SOUND_CATALOG } from './catalog.mjs';
import { ELEMENT_NAMES, EOp } from '../../engine/types.mjs';

export const AUDIO_SETTINGS_KEY = 'dw-battle-audio-v1';
const DEFAULT_SETTINGS = Object.freeze({ muted: false, volume: .4 });
const COMBAT_SOUND = /^(?:cast_|hit_|explosion_|player_hurt$|dodge$|consume$|victory$|defeat$)/;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const seconds = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000;
const terminal = battle => battle?.hero?.dead || battle?.phase === 'failed' ? 'defeat' : battle?.phase === 'cleared' ? 'victory' : null;
const settlementSound = key => key === 'victory' || key === 'defeat';

function defaultStorage() { try { return globalThis.localStorage; } catch { return null; } }
function settingsFrom(raw) {
  return { muted: raw?.muted === true, volume: Number.isFinite(raw?.volume) ? clamp(raw.volume, 0, 1) : DEFAULT_SETTINGS.volume };
}
function elementName(value) {
  if (typeof value === 'number') return ELEMENT_NAMES[value] ?? 'physical';
  const name = String(value ?? '').toLowerCase();
  return name === 'cold' || name === 'ice' ? 'frost' : ELEMENT_NAMES.includes(name) ? name : 'physical';
}
function castSound(battle) {
  const hero = battle.hero, plan = battle.host?.plan?.(hero.plan);
  // Read authored cast actions rather than inventing element damage or changing a plan.
  const first = plan?.eventRuleFirst?.[0] ?? 0, count = plan?.eventRuleCount?.[0] ?? 0;
  for (const rule of plan?.rules?.slice(first, first + count) ?? []) {
    for (const action of plan.actions.slice(rule.actionFirst, rule.actionFirst + rule.actionCount)) {
      if (action.op === EOp.Summon || action.op === EOp.Storm) return 'cast_summon';
      if ([EOp.Emit, EOp.DamageArea, EOp.DamageTarget].includes(action.op)) return `cast_${elementName(action.element)}`;
    }
  }
  const skill = String(hero.skill ?? '').toLowerCase();
  if (/summon|turret|totem|minion/.test(skill)) return 'cast_summon';
  if (/frost|ice|cold|chill/.test(skill)) return 'cast_frost';
  if (/fire|flame|ember|burn/.test(skill)) return 'cast_fire';
  if (/lightning|storm|shock|thunder|spark|arc/.test(skill)) return 'cast_lightning';
  if (/poison|toxic|venom/.test(skill)) return 'cast_poison';
  if (/void|dark|chaos/.test(skill)) return 'cast_void';
  return 'cast_physical';
}
function cooldownFor(key, entry) {
  const group = /^(cast|hit|explosion)_/.exec(key)?.[1] ?? key;
  const defaults = { cast: .08, hit: .08, explosion: .12, player_hurt: .22, pickup: .08, equip_pickup: .08, dodge: .1, consume: .12 };
  return { group, duration: Math.max(defaults[group] ?? .04, Number.isFinite(entry.cooldown) ? Math.max(0, entry.cooldown) : 0) };
}

/** Optional sound presentation. Never writes gameplay state, consumes battle RNG, or unlocks itself. */
export function createBattleAudio(options = {}) {
  const catalog = options.catalog ?? SOUND_CATALOG, storage = options.storage === undefined ? defaultStorage() : options.storage;
  const fetchAudio = options.fetch ?? globalThis.fetch?.bind(globalThis), now = options.now ?? seconds, random = options.random ?? Math.random;
  const maxVoices = clamp(Math.floor(Number.isFinite(options.maxVoices) ? options.maxVoices : 14), 1, 32);
  const maxLatency = Math.max(0, Number.isFinite(options.maxLatency) ? options.maxLatency : .18);
  const report = error => { try { options.onError?.(error); } catch { /* Audio diagnostics cannot interrupt combat. */ } };
  let settings = { ...DEFAULT_SETTINGS };
  try { const raw = storage?.getItem?.(AUDIO_SETTINGS_KEY); if (raw) settings = settingsFrom(JSON.parse(raw)); } catch { /* Optional persistence. */ }
  let context = null, master = null, compressor = null, unlocked = false, disposed = false, paused = false, epoch = 0;
  let battle = null, detach = null, observed = null, unlockPromise = null;
  const voices = new Set(), buffers = new Map(), inflight = new Map(), failures = new Map(), cooldowns = new Map(), pending = new Map();

  function setMaster() {
    if (!master) return;
    const volume = settings.muted ? 0 : settings.volume;
    if (master.gain.setValueAtTime) master.gain.setValueAtTime(volume, context.currentTime);
    else master.gain.value = volume;
  }
  function finish(voice) {
    if (!voices.delete(voice)) return;
    voice.source.onended = null;
    try { voice.source.disconnect(); } catch {}
    try { voice.gain.disconnect(); } catch {}
    try { voice.panner?.disconnect(); } catch {}
  }
  function stopVoices(combatOnly = false) {
    for (const voice of [...voices]) {
      if (combatOnly && !voice.combat) continue;
      stopVoice(voice);
    }
  }
  function stopVoice(voice) { try { voice.source.stop(); } catch {} finish(voice); }
  function snapshot() { return battle ? { casts: battle.hero?.casts ?? 0, terminal: terminal(battle) } : null; }
  function allowed(key) {
    return !disposed && unlocked && context && context.state !== 'closed' && context.state !== 'suspended' && context.state !== 'interrupted' &&
      !settings.muted && settings.volume > 0 && (!COMBAT_SOUND.test(key) || !paused);
  }
  function configure(next = {}) {
    const previous = settings;
    settings = settingsFrom({ ...settings, ...next });
    if ((settings.muted && !previous.muted) || (settings.volume === 0 && previous.volume > 0)) { ++epoch; stopVoices(); }
    setMaster();
    try { storage?.setItem?.(AUDIO_SETTINGS_KEY, JSON.stringify(settings)); } catch {}
    return { ...settings };
  }
  async function unlock() {
    if (disposed) return false;
    if (unlockPromise) return unlockPromise;
    unlockPromise = (async () => {
      try {
        if (!context) {
          const factory = options.contextFactory ?? (() => {
            const Constructor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
            return Constructor ? new Constructor() : null;
          });
          context = options.fakeContext ?? factory();
          if (!context || disposed) return false;
        }
        if (!master) {
          master = context.createGain(); compressor = context.createDynamicsCompressor?.();
          if (compressor) {
            for (const [key, value] of Object.entries({ threshold: -12, knee: 18, ratio: 4, attack: .003, release: .18 })) if (compressor[key]) compressor[key].value = value;
            master.connect(compressor); compressor.connect(context.destination);
          } else master.connect(context.destination);
          setMaster();
        }
        if (context.state === 'closed') return false;
        if (context.state === 'suspended' || context.state === 'interrupted') await context.resume();
        if (disposed) return false;
        unlocked = context.state === 'running' || context.state == null;
        return unlocked;
      } catch (error) { report(error); return false; }
    })();
    try { return await unlockPromise; } finally { unlockPromise = null; }
  }
  async function loadBuffer(src) {
    if (buffers.has(src)) return buffers.get(src);
    if (inflight.has(src)) return inflight.get(src);
    if (!context || !fetchAudio || now() - (failures.get(src) ?? -Infinity) < 3) return null;
    const work = Promise.resolve().then(async () => {
      try {
        const response = await fetchAudio(src);
        if (!response || response.ok === false) throw new Error(`音频资源无法读取：${src}`);
        const bytes = await response.arrayBuffer();
        if (disposed) return null;
        const buffer = await context.decodeAudioData(bytes);
        if (!buffer || disposed) return null;
        buffers.set(src, buffer); failures.delete(src);
        return buffer;
      } catch (error) { failures.set(src, now()); report(error); return null; }
      finally { inflight.delete(src); }
    });
    inflight.set(src, work);
    return work;
  }
  function variants(entry) {
    return (Array.isArray(entry?.variants) ? entry.variants : entry?.src ? [entry.src] : []).filter(src => typeof src === 'string' && src.length > 0);
  }
  async function preload(keys = Object.keys(catalog)) {
    if (!unlocked || disposed) return false;
    const sources = [...new Set(keys.flatMap(key => variants(catalog[key])))];
    await Promise.all(sources.map(loadBuffer));
    return !disposed;
  }
  async function play(key, location = {}) {
    const entry = catalog[key], sources = variants(entry);
    const currentBattle = battle, settlement = settlementSound(key);
    if (!sources.length || !allowed(key) || pending.get(key)?.epoch === epoch || (voices.size >= maxVoices && !settlement) ||
      (settlement && (!currentBattle || terminal(currentBattle) !== key))) return false;
    const { group, duration } = cooldownFor(key, entry), started = now();
    if (started - (cooldowns.get(group) ?? -Infinity) < duration) return false;
    cooldowns.set(group, started);
    const requestEpoch = epoch, combat = COMBAT_SOUND.test(key);
    const src = sources[Math.min(sources.length - 1, Math.floor(clamp(random(), 0, .999999) * sources.length))];
    const request = { epoch: requestEpoch }; pending.set(key, request);
    let voice = null;
    try {
      // Cached effects schedule immediately, without a microtask behind a heavy render frame.
      const buffer = buffers.has(src) ? buffers.get(src) : await loadBuffer(src);
      const deadline = settlement ? Math.max(maxLatency, 1.25) : maxLatency;
      if (!buffer || requestEpoch !== epoch || !allowed(key) || now() - started > deadline || (combat && battle !== currentBattle) ||
        (settlement && terminal(currentBattle) !== key)) return false;
      if (voices.size >= maxVoices) {
        const replace = settlement ? [...voices].find(voice => voice.combat && !settlementSound(voice.key)) : null;
        if (!replace) return false;
        stopVoice(replace);
      }
      const source = context.createBufferSource(), gain = context.createGain();
      const panner = context.createStereoPanner?.();
      const hero = battle?.hero, positioned = hero && Number.isFinite(location.x) && Number.isFinite(location.y);
      const distance = positioned ? Math.hypot(location.x - hero.x * .01, location.y - hero.y * .01) : 0;
      const attenuation = 1 / (1 + distance / 18);
      const level = (Number.isFinite(entry.volume) ? clamp(entry.volume, 0, 1) : 1) * (Number.isFinite(location.volume) ? clamp(location.volume, 0, 1) : 1) * attenuation;
      gain.gain.value = level;
      source.buffer = buffer;
      source.playbackRate.value = Number.isFinite(location.rate) ? clamp(location.rate, .85, 1.15) : .96 + clamp(random(), 0, 1) * .08;
      source.connect(gain);
      if (panner) { panner.pan.value = positioned ? clamp((location.x - hero.x * .01) / 18, -.8, .8) : 0; gain.connect(panner); panner.connect(master); }
      else gain.connect(master);
      voice = { source, gain, panner, combat, key };
      voices.add(voice); source.onended = () => finish(voice); source.start();
      return true;
    } catch (error) { if (voice) finish(voice); report(error); return false; }
    finally { if (pending.get(key) === request) pending.delete(key); }
  }
  function receive(kind, payload, targetBattle) {
    if (paused) return;
    const p = payload ?? {}, position = { x: p.x, y: p.y };
    if (kind === 'projectile_hit') {
      void play(p.targetId === targetBattle.heroTargetId && p.surface === 'unit' ? 'player_hurt' : `hit_${elementName(p.element)}`, position);
    } else if (kind === 'damage' && !p.dot && p.Amount > 0) {
      if (p.TargetExternalId === targetBattle.heroTargetId) void play('player_hurt');
      else {
        const info = targetBattle.host.world.damageLog?.at(-1)?.Info;
        if (info?.kind !== 'projectile') void play(`hit_${elementName(p.Element)}`);
      }
    } else if (kind === 'area') {
      if (['player_slash', 'monster_claw', 'monster_strike'].includes(p.effect)) return;
      void play(`explosion_${p.effect === 'death_lightning' ? 'lightning' : p.effect === 'poison_flask_burst' ? 'poison' : elementName(p.element)}`, position);
    }
  }
  function bind(next) {
    if (disposed || next === battle) return;
    detach?.(); detach = null; ++epoch; stopVoices(true); cooldowns.clear();
    battle = next ?? null; observed = snapshot();
    if (!battle?.host?.world) return;
    const captured = battle, world = captured.host.world, previous = world.trace;
    let active = true;
    const wrapper = function(kind, payload) {
      if (active && battle === captured && !disposed) { try { receive(kind, payload, captured); } catch (error) { report(error); } }
      return previous?.call(this, kind, payload);
    };
    world.trace = wrapper;
    detach = () => { active = false; if (world.trace === wrapper) world.trace = previous; };
  }
  function suspend() { if (disposed) return; paused = true; ++epoch; stopVoices(true); observed = snapshot(); }
  function reset() { if (disposed) return; ++epoch; stopVoices(); cooldowns.clear(); observed = snapshot(); }
  function update(next, { paused: nextPaused = false } = {}) {
    if (disposed) return;
    if (next !== battle) bind(next);
    const wasPaused = paused;
    if (nextPaused && !paused) suspend();
    paused = !!nextPaused;
    const latest = snapshot();
    if (battle && latest && observed && !paused && !wasPaused) {
      if (latest.casts > observed.casts) void play(castSound(battle));
      if (latest.terminal && latest.terminal !== observed.terminal) void play(latest.terminal);
    }
    observed = latest;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; unlocked = false; ++epoch; detach?.(); detach = null; stopVoices();
    buffers.clear(); inflight.clear(); failures.clear(); cooldowns.clear(); pending.clear();
    try { master?.disconnect(); } catch {}
    try { compressor?.disconnect(); } catch {}
    if (context && !options.fakeContext) { try { Promise.resolve(context.close?.()).catch(report); } catch (error) { report(error); } }
    battle = null; observed = null;
  }
  return { unlock, configure, play, preload, bind, update, suspend, reset, dispose,
    get settings() { return { ...settings }; }, get voiceCount() { return voices.size; } };
}
