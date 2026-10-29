import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_SETTINGS_KEY, createBattleAudio } from '../public/audio/battle-audio.mjs';

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
class FakeNode {
  constructor() { this.links = []; this.disconnected = false; }
  connect(node) { this.links.push(node); return node; }
  disconnect() { this.links = []; this.disconnected = true; }
}
class FakeContext {
  constructor() { this.state = 'suspended'; this.destination = new FakeNode(); this.currentTime = 0; this.sources = []; this.gains = []; this.resumeCalls = 0; this.decodeCalls = 0; this.closeCalls = 0; }
  createGain() { const node = new FakeNode(); node.gain = { value: 1, setValueAtTime(value) { this.value = value; } }; this.gains.push(node); return node; }
  createStereoPanner() { const node = new FakeNode(); node.pan = { value: 0 }; return node; }
  createBufferSource() {
    const node = new FakeNode(); node.playbackRate = { value: 1 }; node.started = false; node.stopped = false;
    node.start = () => { node.started = true; };
    node.stop = () => { node.stopped = true; node.onended?.(); };
    node.finish = () => node.onended?.();
    this.sources.push(node); return node;
  }
  async resume() { this.resumeCalls++; this.state = 'running'; }
  async decodeAudioData(bytes) { this.decodeCalls++; return this.decodeHook ? this.decodeHook(bytes) : { duration: .2, bytes }; }
  async close() { this.closeCalls++; this.state = 'closed'; }
}
function fixture(extra = {}) {
  const context = extra.fakeContext ?? new FakeContext(), requests = [], saved = new Map(), errors = [];
  let clock = 0, constructions = 0;
  const catalog = Object.fromEntries(['ui_click', 'ui_open', 'ui_close', 'ui_confirm', 'ui_error', 'cast_frost', 'cast_fire', 'cast_summon', 'hit_frost', 'hit_fire', 'hit_physical', 'explosion_poison', 'explosion_fire', 'player_hurt', 'victory', 'defeat', 'pickup', 'equip_pickup', 'dodge', 'consume'].map(key => [key, { src: `/test/${key}.ogg`, volume: .5 }]));
  const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  const audio = createBattleAudio({ catalog, contextFactory: () => { constructions++; return context; },
    fetch: async src => { requests.push(src); return { ok: true, arrayBuffer: async () => new ArrayBuffer(16) }; },
    now: () => clock, random: () => .5, storage, onError: error => errors.push(error), ...extra });
  return { audio, context, requests, saved, storage, errors, catalog, tick: (dt = 1) => { clock += dt; }, get constructions() { return constructions; } };
}
function battle(previous = null) {
  const world = { trace: previous, damageLog: [] };
  return { host: { world }, hero: { casts: 0, skill: 'frost_lance', x: 0, y: 0, dead: false }, heroTargetId: 42, phase: 'waves' };
}

test('音效：首次手势前不建上下文或加载素材，解锁复用上下文并按音量配置', async () => {
  const f = fixture();
  assert.equal(await f.audio.play('ui_click'), false);
  assert.equal(f.constructions, 0); assert.deepEqual(f.requests, []);
  assert.equal(await f.audio.unlock(), true); assert.equal(await f.audio.unlock(), true);
  assert.equal(f.constructions, 1); assert.equal(f.context.resumeCalls, 1);
  assert.equal(f.context.gains[0].gain.value, .4);
  assert.equal(await f.audio.play('ui_click'), true);
  assert.equal(f.context.sources.length, 1); assert.equal(f.context.sources[0].started, true);
  assert.equal(f.context.sources[0].playbackRate.value, 1);
  assert.equal(f.context.gains[1].gain.value, .5);
  const settings = f.audio.configure({ volume: .25 });
  settings.volume = 1;
  assert.equal(f.audio.settings.volume, .25);
  assert.equal(f.context.gains[0].gain.value, .25);
  assert.deepEqual(JSON.parse(f.saved.get(AUDIO_SETTINGS_KEY)), { muted: false, volume: .25 });
  f.audio.dispose(); assert.equal(f.context.closeCalls, 1);
});

test('音效：静音和零音量即时停止，设置安全保存和恢复，不支持音频时静默降级', async () => {
  const f = fixture(); await f.audio.unlock(); await f.audio.play('ui_click');
  f.audio.configure({ muted: true });
  assert.equal(f.audio.voiceCount, 0); assert.equal(f.context.sources[0].stopped, true);
  assert.equal(await f.audio.play('ui_open'), false);
  f.audio.configure({ muted: false, volume: 0 });
  assert.equal(await f.audio.play('ui_open'), false);
  f.audio.configure({ volume: 2 }); assert.equal(f.audio.settings.volume, 1);
  f.audio.configure({ volume: -.2 }); assert.equal(f.audio.settings.volume, 0);
  const restored = createBattleAudio({ storage: f.storage });
  assert.deepEqual(restored.settings, { muted: false, volume: 0 }); restored.dispose();
  const missing = createBattleAudio({ contextFactory: () => null, storage: null });
  assert.equal(await missing.unlock(), false); assert.equal(await missing.play('ui_click'), false); missing.dispose();
  const denied = fixture({ contextFactory: () => { throw new Error('denied'); } });
  assert.equal(await denied.audio.unlock(), false); assert.equal(denied.errors.length, 1); denied.audio.dispose(); f.audio.dispose();
});

test('音效：同类限流跨元素生效，缓存共享素材和在途加载，声音结束归还全局声部', async () => {
  const f = fixture({ maxVoices: 2 });
  f.catalog.hit_fire.src = f.catalog.hit_frost.src;
  await f.audio.unlock();
  const first = f.audio.play('hit_frost');
  assert.equal(await f.audio.play('hit_frost'), false);
  assert.equal(await f.audio.play('hit_fire'), false);
  assert.equal(await first, true);
  assert.equal(await f.audio.play('ui_click'), true);
  assert.equal(f.audio.voiceCount, 2);
  f.tick(); assert.equal(await f.audio.play('ui_open'), false, 'global voice cap applies across all event types');
  f.context.sources[0].finish(); assert.equal(f.audio.voiceCount, 1);
  assert.equal(await f.audio.play('hit_fire'), true);
  assert.equal(f.context.decodeCalls, 2, 'the shared impact buffer is decoded only once');
  assert.equal(f.requests.filter(src => src.includes('hit_frost')).length, 1);
  assert.equal(f.context.sources[0].disconnected, true);
  f.audio.dispose(); assert.equal(f.audio.voiceCount, 0);
});

test('音效：真实 trace 调用链、返回值和this保持，卸载后旧包装不再播放且不拆VFX', async () => {
  const calls = [];
  const b = battle(function(kind, payload) { assert.equal(this, b.host.world); calls.push([kind, payload]); return 73; });
  const f = fixture(); await f.audio.unlock(); await f.audio.preload(); f.audio.bind(b);
  const payload = Object.freeze({ element: 1, x: 1, y: 2, targetId: 10, surface: 'unit' });
  assert.equal(b.host.world.trace('projectile_hit', payload), 73);
  await settle(); assert.equal(f.audio.voiceCount, 1);
  assert.equal(calls[0][1], payload);
  const audioWrapper = b.host.world.trace;
  let vfxCalls = 0;
  const vfxWrapper = function(...args) { vfxCalls++; return audioWrapper.apply(this, args); };
  b.host.world.trace = vfxWrapper;
  f.audio.dispose();
  assert.equal(b.host.world.trace, vfxWrapper);
  assert.equal(b.host.world.trace('projectile_hit', payload), 73);
  assert.equal(vfxCalls, 1); assert.equal(calls.length, 2); assert.equal(f.context.sources.length, 1);
});

test('音效：只响应实际碰撞、非持续伤害、范围，暂停战斗音但保留界面音', async () => {
  const f = fixture(), b = battle(); await f.audio.unlock(); await f.audio.preload(); f.audio.bind(b);
  b.host.world.trace('damage', { Amount: 4, Element: 0, dot: 'ignite', TargetExternalId: 10 });
  b.host.world.trace('damage', { Amount: 0, Element: 0, TargetExternalId: 10 });
  await settle(); assert.equal(f.audio.voiceCount, 0);
  b.host.world.trace('projectile_hit', { element: 1, surface: 'wall', x: 2, y: 1 });
  await settle(); assert.equal(f.audio.voiceCount, 1, 'wall and shield contacts are audible independent of damage');
  f.tick(); b.host.world.trace('damage', { Amount: 3, Element: 0, TargetExternalId: 10 });
  await settle(); assert.equal(f.audio.voiceCount, 2);
  b.host.world.trace('area', { effect: 'poison_flask_burst', element: 4, x: 2, y: 2 });
  await settle(); assert.equal(f.audio.voiceCount, 3);
  f.audio.suspend(); assert.equal(f.audio.voiceCount, 0);
  assert.equal(await f.audio.play('ui_open'), true);
  b.host.world.trace('area', { element: 0, x: 2, y: 2 });
  assert.equal(await f.audio.play('cast_frost'), false);
  await settle(); assert.equal(f.audio.voiceCount, 1);
  b.hero.casts = 10; f.audio.update(b, { paused: true }); f.audio.update(b, { paused: false });
  await settle(); assert.equal(f.audio.voiceCount, 1, 'resuming never replays cast counters from a pause');
  f.audio.dispose();
});

test('音效：成功施法、胜败按真实状态变化触发一次，换battle不补播历史', async () => {
  const f = fixture(), b = battle(); await f.audio.unlock(); await f.audio.preload(); f.audio.bind(b);
  f.audio.update(b); await settle(); assert.equal(f.audio.voiceCount, 0);
  b.hero.casts = 1; f.audio.update(b); await settle(); assert.equal(f.audio.voiceCount, 1);
  f.audio.update(b); await settle(); assert.equal(f.audio.voiceCount, 1);
  b.phase = 'cleared'; f.audio.update(b); await settle(); assert.equal(f.audio.voiceCount, 2);
  f.audio.update(b); await settle(); assert.equal(f.audio.voiceCount, 2);
  const next = battle(); next.hero.casts = 15; f.audio.bind(next); f.audio.update(next);
  await settle(); assert.equal(f.audio.voiceCount, 0);
  next.hero.dead = true; next.phase = 'failed'; f.audio.update(next); await settle(); assert.equal(f.audio.voiceCount, 1);
  f.audio.update(next); await settle(); assert.equal(f.audio.voiceCount, 1);
  f.audio.dispose();
});

test('音效：异步加载不积压，静音/重置/延迟解码后不补放', async () => {
  for (const change of ['mute', 'zero', 'reset', 'late', 'dispose']) {
    const d = deferred(), context = new FakeContext(); context.decodeHook = () => d.promise;
    const f = fixture({ fakeContext: context }); await f.audio.unlock();
    const work = f.audio.play('ui_click'); await settle();
    assert.equal(context.decodeCalls, 1);
    if (change === 'mute') { f.audio.configure({ muted: true }); f.audio.configure({ muted: false }); }
    if (change === 'zero') { f.audio.configure({ volume: 0 }); f.audio.configure({ volume: .4 }); }
    if (change === 'reset') f.audio.reset();
    if (change === 'late') f.tick(1);
    if (change === 'dispose') f.audio.dispose();
    d.resolve({ duration: .1 });
    assert.equal(await work, false, change);
    assert.equal(context.sources.length, 0, change);
    f.audio.dispose();
  }
});

test('音效：切换battle使旧异步事件失效，新事件复用同一解码；旧trace仍只透传', async () => {
  const d = deferred(), context = new FakeContext(); context.decodeHook = () => d.promise;
  const f = fixture({ fakeContext: context }), old = battle(), next = battle(); await f.audio.unlock(); f.audio.bind(old);
  const previousWork = f.audio.play('hit_frost'); await settle();
  let vfx = 0; const oldWrapper = old.host.world.trace;
  old.host.world.trace = function(...args) { vfx++; return oldWrapper.apply(this, args); };
  f.audio.bind(next);
  const nextWork = f.audio.play('hit_frost'); await settle();
  assert.equal(context.decodeCalls, 1, 'the new world can reuse an in-flight asset, not its stale playback request');
  d.resolve({ duration: .1 });
  assert.equal(await previousWork, false); assert.equal(await nextWork, true);
  f.tick(); old.host.world.trace('area', { element: 0 }); await settle();
  assert.equal(vfx, 1); assert.equal(context.sources.length, 1);
  f.audio.dispose();
});

test('音效：请求失败不影响战斗、短暂退避后可重试，关闭后的解码不创建声部', async () => {
  let count = 0;
  const f = fixture({ fetch: () => { count++; if (count === 1) throw new Error('network'); return Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }); } });
  await f.audio.unlock();
  assert.equal(await f.audio.play('ui_click'), false); assert.equal(count, 1);
  f.tick(.1); assert.equal(await f.audio.play('ui_click'), false); assert.equal(count, 1);
  f.tick(4); assert.equal(await f.audio.play('ui_click'), true); assert.equal(count, 2); assert.equal(f.errors.length, 1);
  f.audio.dispose();
  const d = deferred(), context = new FakeContext(); context.decodeHook = () => d.promise;
  const closing = fixture({ fakeContext: context }); await closing.audio.unlock(); const work = closing.audio.play('ui_click'); await settle();
  closing.audio.dispose(); d.resolve({ duration: .1 }); assert.equal(await work, false); assert.equal(context.sources.length, 0);
});

test('音效：满声部时胜败提示替换普通战斗音，缓存提示在当前帧立即调度且总声部不增加', async () => {
  for (const outcome of ['victory', 'defeat']) {
    const f = fixture({ maxVoices: 2 }), b = battle(); await f.audio.unlock(); await f.audio.preload(); f.audio.bind(b);
    await f.audio.play('hit_frost'); await f.audio.play('cast_fire');
    assert.equal(f.audio.voiceCount, 2);
    b.phase = outcome === 'victory' ? 'cleared' : 'failed';
    f.audio.update(b);
    assert.equal(f.context.sources.length, 3, 'cached settlement schedules before returning to a potentially slow renderer');
    assert.equal(f.context.sources[2].started, true);
    assert.equal(f.context.sources[0].stopped, true);
    assert.equal(f.audio.voiceCount, 2);
    f.audio.update(b); await settle(); assert.equal(f.context.sources.length, 3, 'the same outcome does not retrigger');
    f.audio.dispose();
  }
});

test('音效：同一战斗仍在结算时允许短暂长帧，结束态失效、暂停或切换后不补播结算', async () => {
  for (const outcome of ['victory', 'defeat']) {
    for (const change of ['none', 'phase', 'mute', 'zero', 'reset', 'suspend', 'bind', 'dispose', 'expired']) {
      const d = deferred(), context = new FakeContext(); context.decodeHook = () => d.promise;
      const f = fixture({ fakeContext: context }), b = battle(); await f.audio.unlock(); f.audio.bind(b);
      b.phase = outcome === 'victory' ? 'cleared' : 'failed';
      const work = f.audio.play(outcome); await settle(); f.tick(.6);
      if (change === 'phase') b.phase = 'waves';
      if (change === 'mute') { f.audio.configure({ muted: true }); f.audio.configure({ muted: false }); }
      if (change === 'zero') { f.audio.configure({ volume: 0 }); f.audio.configure({ volume: .4 }); }
      if (change === 'reset') f.audio.reset();
      if (change === 'suspend') { f.audio.suspend(); f.audio.update(b, { paused: false }); }
      if (change === 'bind') f.audio.bind(battle());
      if (change === 'dispose') f.audio.dispose();
      if (change === 'expired') f.tick(2);
      d.resolve({ duration: .1 });
      assert.equal(await work, change === 'none', `${outcome}: ${change}`);
      assert.equal(context.sources.length, change === 'none' ? 1 : 0, `${outcome}: ${change}`);
      f.audio.dispose();
    }
  }
});
