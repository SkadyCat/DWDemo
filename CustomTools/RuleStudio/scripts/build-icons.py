#!/usr/bin/env python3
"""把 design/icons 里生成的原图（512×512）转成游戏用的小图，放进 public/assets/icons/<分类>/<id>.*：
painted（技能、装备、通货、传奇、杂项）→ 160 px webp，原样贴图；
emblem（功能栏、装备位、地图类型、节点、特性层、增益、状态）→ 128 px png，白色剪影、亮度当透明度，游戏里当遮罩再上色。
用法：python3 scripts/build-icons.py（需要 Pillow）"""
import json, pathlib
from PIL import Image, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'design/icons', ROOT / 'public/assets/icons'
manifest = json.loads((SRC / 'icon-prompts.json').read_text())
index = {}
for row in manifest['icons']:
    cat, id_, style = row['cat'], row['id'], row['style']
    src = SRC / cat / f'{id_}.png'
    if not src.exists(): continue
    (OUT / cat).mkdir(parents=True, exist_ok=True)
    im = Image.open(src).convert('RGB')
    if style == 'painted':
        im.resize((160, 160), Image.LANCZOS).save(OUT / cat / f'{id_}.webp', 'WEBP', quality=84, method=6)
        index.setdefault(cat, {})[id_] = 'webp'
    else:
        a = ImageOps.autocontrast(im.convert('L').resize((128, 128), Image.LANCZOS), cutoff=1)
        out = Image.new('RGBA', a.size, (255, 255, 255, 0)); out.putalpha(a)
        out.save(OUT / cat / f'{id_}.png', optimize=True)
        index.setdefault(cat, {})[id_] = 'png'
(OUT / 'index.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')))
print(sum(len(v) for v in index.values()), 'icons →', OUT)
