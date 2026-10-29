import * as T from '/vendor/three.module.js';
import { modules, presets } from './catalog.mjs';
import { createGlowRenderer } from './glow-renderer.mjs';
const $ = id => document.getElementById(id), stage = $('stage');
const renderer = new T.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
stage.prepend(renderer.domElement);
const scene = new T.Scene(), camera = new T.PerspectiveCamera(45, 1, .1, 100), effects = new T.Group(); scene.add(effects);
scene.add(new T.HemisphereLight(0xc3ddff, 0x1b2339, 2)); const light = new T.DirectionalLight(0xd4e9ff, 3); light.position.set(3, 8, 4); scene.add(light);
const floor = new T.Mesh(new T.CircleGeometry(12, 96), new T.MeshStandardMaterial({ color: 0x111b2a, metalness: .4, roughness: .5 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -.025; scene.add(floor);
const grid = new T.GridHelper(24, 24, 0x34465c, 0x1a2a3e); grid.material.transparent = true; grid.material.opacity = .3; grid.position.y = -.02; scene.add(grid);
const dummy = new T.Mesh(new T.CapsuleGeometry(.32, .75, 5, 12), new T.MeshStandardMaterial({ color: 0x43556b, metalness: .6, roughness: .45 })); dummy.position.y = .7; scene.add(dummy);
const glow = createGlowRenderer(T, renderer);
let selected, effect, time = 0, paused = false, speed = 1, radius = 2, yaw = .35, pitch = .85, distance = 9, frame = 0, last = performance.now(), statsAt = last, frames = 0;
const descriptions = {
  'projectile-treasury-ea': '天地乖离剑：头顶6米展开巨型赤金法阵，乖离剑从阵面穿出轰向目标；此处仅预览表现。实战由规则消耗全部宝库层数，本次伤害额外提高层数×50%，包含装备点伤。',
  'projectile-treasury-weapon': '剑、弓、斧在不等的随机间隔从头顶半球的随机位置穿出，独立法阵朝向各自射击目标。此处以四分之一速度演示满层基础期望11枚/秒；实战时刻、位置与碰撞全部来自规则，实例化批量显示。',
  'royal-treasury-gate': '每次真实出射才在头顶半球面的独立发射点出现：小光点在0.035秒内撑开成法阵，剑对应冰蓝星芒、弓对应翠绿弦阵、斧对应赤橙刃轮。使用Imagegen透明纹理，颜色用于区分宝物外观。兵器从阵心穿出后，法阵在0.32秒内收束消散；阵面朝向实际目标，三种共用单批实例化绘制。',
  'element-explosion': '亮核、冲击波、元素碎片与余烬。六种元素使用不同的扩散与消散形态。',
  'element-hit': '短促的元素闪光与飞散碎片。', 'death-lightning': '索敌后的真实落点：垂直雷柱、分叉电弧、地面电流。',
  'projectile-hit': '与投射物本体衔接的短促撞击：冰片和霜雾、火舌与余烬、短电弧、尘屑、毒液飞溅和暗影回卷。读取真实碰撞位置和方向；实战与预览共用预制体。',
  'lightning-chain': '连接实际命中目标的高亮电弧。', 'projectile-ice-lance': '旋转冰晶、透亮尖端与定向尾迹。',
  'ground-poison': '毒液泼洒后摊开：不规则液斑、零散液珠、随机角度与速度的飞溅，随后缓慢流动。',
  'ground-burning': '不规则燃烧残液与散落火点，泼洒朝向、飞溅速度和地表流动各不相同。',
  'ground-chill': '不规则冰霜液斑与溅落碎滴，边缘自然散开，沿随机方向缓慢流动。',
  'ground-shock': '不规则感电液斑与飞溅电滴，随机朝向、速度与起伏节奏。',
  'ground-mirror': '带流动反光的镜面液斑。实战按投射物每次进入复制，驻留不重触发，原体和复制体均可退出后再进入。',
  'projectile-void-bolt': '脉冲光核、几何外壳与流动尾迹。', 'summon-spirit': '悬浮灵核、流光丝带与环绕光轨。',
  'loot-burst': '从死亡点喷出并落地。装备保留品质色；下品通货为香槟金，中品碧青，上品玫瑰金，其他通货琥珀金，预兆月光紫。品级越高光柱越高，与实战共用预制体。',
};
function select(p) {
  selected = p; if (effect) { effects.remove(effect.group); effect.dispose(); }
  effect = modules[p.prefab].createEffect(T, { element: p.element }); effects.add(effect.group); time = 0;
  $('name').textContent = p.name; $('category').textContent = `${p.category} / ${p.prefab}`;
  $('description').textContent = descriptions[p.prefab] || (p.continuous ? '持续状态按实际存续时间播放。' : '独立特效预制体，位置、朝向和范围由调用方传入。');
  $('timeline').max = p.continuous ? 3 : p.duration; $('timeline').value = 0;
  $('radius').disabled = !['爆炸', '范围与近战', '持续地面', '落雷'].includes(p.category);
  $('radius-value').textContent = `${(p.prefab === 'projectile-hit' ? .2 : radius).toFixed(1)} m`;
  for (const button of $('catalog').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.id === p.id));
  const hash = `#${p.id}`; history.replaceState(null, '', hash);
}
function list() {
  const search = $('search').value.trim().toLowerCase(); $('catalog').replaceChildren(); let category;
  for (const p of presets.filter(p => `${p.name} ${p.prefab}`.toLowerCase().includes(search))) {
    if (p.category !== category) { category = p.category; const title = document.createElement('div'); title.className = 'category'; title.textContent = category; $('catalog').append(title); }
    const button = document.createElement('button'); button.className = 'prefab'; button.dataset.id = p.id; button.setAttribute('aria-pressed', String(p.id === selected?.id)); button.style.setProperty('--color', p.color || '#8fcfff');
    const dot = document.createElement('i'); button.append(dot, document.createTextNode(p.name)); button.onclick = () => select(p); $('catalog').append(button);
  }
}
$('total').textContent = `${Object.keys(modules).length} 预制体 · ${presets.length} 预设`;
$('search').oninput = list; $('restart').onclick = () => { time = 0; }; $('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? '继续' : '暂停'; };
$('speed').onchange = () => { speed = +$('speed').value; };
$('radius').oninput = () => { radius = +$('radius').value; $('radius-value').textContent = `${radius.toFixed(1)} m`; };
$('timeline').oninput = () => { time = +$('timeline').value; paused = true; $('pause').textContent = '继续'; };
let dragging = false, px, py;
renderer.domElement.onpointerdown = e => { dragging = true; px = e.clientX; py = e.clientY; renderer.domElement.setPointerCapture(e.pointerId); };
renderer.domElement.onpointermove = e => { if (!dragging) return; yaw -= (e.clientX - px) * .006; pitch = Math.max(.25, Math.min(1.4, pitch + (e.clientY - py) * .006)); px = e.clientX; py = e.clientY; };
renderer.domElement.onpointerup = () => { dragging = false; }; renderer.domElement.onpointercancel = () => { dragging = false; };
renderer.domElement.onwheel = e => { e.preventDefault(); distance = Math.max(4, Math.min(22, distance * Math.exp(e.deltaY * .001))); };
function resize() { renderer.setSize(stage.clientWidth, stage.clientHeight, false); camera.aspect = stage.clientWidth / stage.clientHeight; camera.updateProjectionMatrix(); }
const observer = new ResizeObserver(resize); observer.observe(stage); resize(); list(); select(presets.find(p => p.id === location.hash.slice(1)) || presets.find(p => p.prefab === 'death-lightning'));
function draw(now) {
  frame = requestAnimationFrame(draw);
  try {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!paused) time += dt * speed;
    const duration = selected.continuous ? 3 : selected.duration;
    if (time > duration + .65) time = 0;
    const focusHeight = selected.previewHeight ?? .65;
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * distance, Math.sin(pitch) * distance + focusHeight - .65, Math.cos(yaw) * Math.cos(pitch) * distance); camera.lookAt(0, focusHeight, 0);
    const scaled = ['element-explosion', 'poison-flask-burst', 'death-lightning'].includes(selected.prefab); effect.group.scale.set(scaled ? radius : 1, 1, scaled ? radius : 1);
    // Show a projectile contact on the dummy's near surface, rather than inside it.
    const impact = selected.prefab === 'projectile-hit' ? { x: 0, y: .8, z: .5, dx: 0, dy: 0, dz: -1, radius: .2 } : {};
    effect.update(time, { element: selected.element, radius, inner: radius * .5, length: radius * 3, width: .8, angle: Math.PI / 2, ...impact });
    dummy.visible = $('target').checked;
    if ($('glow').checked) glow.render(scene, camera, effects); else renderer.render(scene, camera);
    if (!paused) $('timeline').value = Math.min(duration, time);
    frames++;
    if (now - statsAt > 500) { $('stats').textContent = `${Math.round(frames * 1000 / (now - statsAt))} FPS · ${renderer.info.memory.geometries} geometries · ${renderer.info.memory.textures} textures`; frames = 0; statsAt = now; }
  } catch (error) { cancelAnimationFrame(frame); $('error').hidden = false; $('error').textContent = error.message; console.error(error); }
}
frame = requestAnimationFrame(draw);
addEventListener('pagehide', () => { cancelAnimationFrame(frame); observer.disconnect(); effect?.dispose(); glow.dispose(); floor.geometry.dispose(); floor.material.dispose(); dummy.geometry.dispose(); dummy.material.dispose(); grid.geometry.dispose(); grid.material.dispose(); renderer.dispose(); }, { once: true });
