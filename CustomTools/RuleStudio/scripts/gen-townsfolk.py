#!/usr/bin/env python3
"""镇民生成器：用 scripts/lowpoly/lowpoly_fantasy_gen.py（DWEngine 低多边形捏人生成器的副本，加了胖瘦）批量生成夜阙城的人。

每个人随机：种族（人类居多，精灵 / 矮人 / 兽人各一点）、职业（村民为主，混卫兵、拾荒者、学徒）、男女、
身高（同种族内上下浮动）、胖瘦（weight 0.72–1.6）、发型胡子配色。另外有一批小孩（矮、头大），
和设定集里有名有姓的配角（玛蒂、格雷、欧文……），他们的体型是定死的。

输出 public/assets/characters/townsfolk/<id>.glb、manifest.json，和 public/game/townsfolk.mjs（城镇模拟用的名单）。

  python3 scripts/gen-townsfolk.py                 # 默认：配角 + 28 个大人 + 8 个小孩
  python3 scripts/gen-townsfolk.py --adults 60 --kids 12 --seed 7
"""
import argparse, json, os, random, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, 'lowpoly', 'shim'), os.path.join(HERE, 'lowpoly')]
import lowpoly_fantasy_gen as G  # noqa: E402

ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'public', 'assets', 'characters', 'townsfolk')

# 设定集里的配角：体型和打扮定死，种子定死，每次生成都一样。
CAST = [
    dict(id='mati', name='玛蒂', role='半盏灯老板娘', seed=31001, race='human', cls='villager', masc=0.1, height=1.6, weight=1.4, gear=dict(apron=True)),
    dict(id='grey', name='格雷', role='拾荒队长', seed=31002, race='human', cls='ranger', masc=0.95, height=1.8, weight=0.88, weapons=True),
    dict(id='owen', name='欧文', role='修鞋匠 · 回声会', seed=31003, race='human', cls='villager', masc=0.9, height=1.72, weight=0.76, gear=dict(apron=True, weapon_r='none')),
    dict(id='xiaodou', name='小豆', role='孩子头', seed=31004, race='human', cls='villager', masc=0.85, height=1.08, heads=2.7, weight=0.95, kid=True, gear=dict(weapon_r='none')),
    dict(id='rosa', name='罗莎', role='面包师', seed=31005, race='human', cls='villager', masc=0.05, height=1.52, weight=1.55, gear=dict(apron=True, weapon_r='none')),
    dict(id='torg', name='托格', role='库房封门的看守', seed=31006, race='dwarf', cls='warrior', masc=1.0, height=1.32, weight=1.3, weapons=True, gear=dict(weapon_r='hammer', weapon_l='none')),
    dict(id='bru', name='布鲁', role='老禁卫 · 扫地', seed=31007, race='human', cls='knight', masc=1.0, height=1.76, weight=1.15, beard='full', gear=dict(helmet='none', weapon_r='none', weapon_l='none', cape=None)),
    dict(id='helen', name='海伦', role='公共灶台', seed=31008, race='human', cls='villager', masc=0.0, height=1.58, weight=1.12, gear=dict(apron=True, weapon_r='none')),
    dict(id='xu', name='老许', role='暗河船夫', seed=31009, race='human', cls='villager', masc=1.0, height=1.66, weight=0.82, beard='long', gear=dict(hood='down', weapon_r='none')),
    dict(id='lia', name='莉亚', role='寒鸦哨的双胞胎', seed=31010, race='human', cls='villager', masc=0.0, height=1.32, heads=3.0, weight=0.9, kid=True, gear=dict(weapon_r='none', scarf=True)),
    dict(id='lina', name='莉娜', role='寒鸦哨的双胞胎', seed=31010, race='human', cls='villager', masc=0.0, height=1.32, heads=3.0, weight=0.9, kid=True, gear=dict(weapon_r='none', scarf=False, satchel=True)),
]

RACES = [('human', .7), ('dwarf', .12), ('elf', .1), ('orc', .08)]
CLASSES = [('villager', .6), ('warrior', .1), ('ranger', .08), ('cleric', .08), ('rogue', .07), ('knight', .03), ('mage', .04)]
ARMED = {'warrior', 'knight', 'cleric', 'ranger', 'mage'}          # 卫兵、拾荒者、祭司、学徒带家伙；村民空手
ROLE = {'villager': '镇民', 'warrior': '守卫', 'ranger': '拾荒者', 'cleric': '守灯会', 'rogue': '跑腿的', 'knight': '老兵', 'mage': '学徒'}


def pick(r, items):
    x = r.random() * sum(w for _, w in items)
    for v, w in items:
        x -= w
        if x <= 0:
            return v
    return items[-1][0]


def body(r, race):
    """身高（米）和胖瘦：同种族内上下浮动，胖瘦分四档，瘦和胖都不少见。"""
    base = {'human': 1.63, 'elf': 1.7, 'dwarf': 1.3, 'orc': 1.82}[race]
    height = base * min(1.16, max(0.86, r.gauss(1.0, 0.055)))
    band = pick(r, [((0.72, 0.9), .25), ((0.9, 1.1), .42), ((1.1, 1.35), .22), ((1.35, 1.6), .11)])
    return round(height, 3), round(r.uniform(*band), 3)


def slim(path):
    """把生成器写的 glb 改成网页用的精简版（大约一半大小）：去掉顶点色（游戏用材质底色）和顺序索引，
    关节号和权重改成 8 位。位置、法线保持 float。"""
    d = open(path, 'rb').read()
    jl = struct.unpack('<I', d[12:16])[0]
    j = json.loads(d[20:20 + jl])
    bin_ = d[20 + jl + 8:]
    C = {5126: ('f', 4), 5125: ('I', 4), 5123: ('H', 2), 5121: ('B', 1)}
    N = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

    def read(i):
        a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
        f, sz = C[a['componentType']]; n = N[a['type']] * a['count']
        off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        return list(struct.unpack_from('<%d%s' % (n, f), bin_, off)), a

    out, views, accs = bytearray(), [], []

    def put(data, fmt, comp, typ, count, target=None, **extra):
        while len(out) % 4: out.append(0)
        off = len(out); out.extend(struct.pack('<%d%s' % (len(data), fmt), *data))
        views.append(dict(buffer=0, byteOffset=off, byteLength=len(out) - off, **({'target': target} if target else {})))
        accs.append(dict(bufferView=len(views) - 1, componentType=comp, type=typ, count=count, **extra))
        return len(accs) - 1

    for mesh in j['meshes']:
        for p in mesh['primitives']:
            at = p['attributes']
            pos, pa = read(at['POSITION']); nor, _ = read(at['NORMAL'])
            jn, _ = read(at['JOINTS_0']); wt, _ = read(at['WEIGHTS_0'])
            if 'indices' in p:   # split vertices: expand so the primitive needs no index buffer
                idx, _ = read(p['indices'])
                if idx != list(range(len(idx))):
                    pos = [pos[i * 3 + c] for i in idx for c in range(3)]; nor = [nor[i * 3 + c] for i in idx for c in range(3)]
                    jn = [jn[i * 4 + c] for i in idx for c in range(4)]; wt = [wt[i * 4 + c] for i in idx for c in range(4)]
                del p['indices']
            n = len(pos) // 3
            w8 = []
            for k in range(n):   # 8-bit weights that still sum to 255
                q = [round(x * 255) for x in wt[k * 4:k * 4 + 4]]; q[q.index(max(q))] += 255 - sum(q); w8 += q
            p['attributes'] = dict(
                POSITION=put(pos, 'f', 5126, 'VEC3', n, 34962, min=pa.get('min'), max=pa.get('max')) if pa.get('min') else put(pos, 'f', 5126, 'VEC3', n, 34962),
                NORMAL=put(nor, 'f', 5126, 'VEC3', n, 34962),
                JOINTS_0=put([int(x) for x in jn], 'B', 5121, 'VEC4', n, 34962),
                WEIGHTS_0=put(w8, 'B', 5121, 'VEC4', n, 34962, normalized=True))
    # everything else (skin inverse binds, ...) keeps its data
    for sk in j.get('skins', []):
        if 'inverseBindMatrices' in sk:
            ibm, _ = read(sk['inverseBindMatrices']); sk['inverseBindMatrices'] = put(ibm, 'f', 5126, 'MAT4', len(ibm) // 16)
    j['accessors'], j['bufferViews'] = accs, views
    while len(out) % 4: out.append(0)
    j['buffers'] = [dict(byteLength=len(out))]
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out)
    open(path, 'wb').write(glb)


def build(spec, out_dir):
    ov = {k: spec[k] for k in ('race', 'cls', 'masc', 'height', 'heads', 'weight', 'beard') if spec.get(k) is not None}
    gear = dict(spec.get('gear') or {})
    if not spec.get('weapons'):
        gear.setdefault('weapon_r', 'none')
    ov['gear'] = gear
    ov['detail'] = 'low'
    S, L, bones, B, Bw = G.generate_data(spec['seed'], **ov)
    path = os.path.join(out_dir, spec['id'] + '.glb')
    G.export_glb(S, bones, B, Bw, path, name='TF_' + spec['id'], include_weapons=bool(spec.get('weapons')))
    slim(path)
    return dict(id=spec['id'], name=spec.get('name'), role=spec.get('role') or ROLE[S['cls']], race=S['race'], cls=S['cls'],
                female=S['masc'] < 0.5, kid=bool(spec.get('kid')), height=round(S['height'], 3), weight=round(S.get('weight', 1.0), 3),
                bytes=os.path.getsize(path))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--adults', type=int, default=28)
    ap.add_argument('--kids', type=int, default=8)
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--out', default=OUT)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    r = random.Random(a.seed)
    specs = list(CAST)
    for i in range(a.adults):
        race = pick(r, RACES)
        cls = pick(r, CLASSES)
        height, weight = body(r, race)
        specs.append(dict(id=f'folk{i:02d}', seed=40000 + a.seed * 1000 + i, race=race, cls=cls, height=height, weight=weight, weapons=cls in ARMED))
    for i in range(a.kids):
        specs.append(dict(id=f'kid{i:02d}', seed=50000 + a.seed * 1000 + i, race='human', cls='villager', kid=True, role='小孩',
                          height=round(r.uniform(0.98, 1.25), 3), heads=round(r.uniform(2.6, 2.9), 2), weight=round(r.uniform(0.85, 1.2), 3)))
    folk = [build(s, a.out) for s in specs]
    with open(os.path.join(a.out, 'manifest.json'), 'w') as f:
        json.dump(dict(generator='scripts/gen-townsfolk.py', seed=a.seed, folk=folk), f, ensure_ascii=False, indent=1)
    # the town simulation (public/game/town.mjs) needs the list without loading the models
    js = os.path.join(ROOT, 'public', 'game', 'townsfolk.mjs')
    rows = [{k: f[k] for k in ('id', 'name', 'role', 'race', 'cls', 'female', 'kid', 'height', 'weight') if f.get(k) is not None} for f in folk]
    with open(js, 'w') as f:
        f.write('// 由 scripts/gen-townsfolk.py 生成：夜阙城的镇民（模型在 assets/characters/townsfolk/<id>.glb）\nexport const FOLK = ' + json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(len(folk), 'townsfolk ->', a.out, '·', sum(x['bytes'] for x in folk) // 1024, 'KB')


if __name__ == '__main__':
    main()
