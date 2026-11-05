#!/usr/bin/env python3
"""把 design/icons 里生成的原图（512×512）转成游戏用的小图，放进 public/assets/icons/<分类>/<id>.*：
painted（技能、装备、通货、传奇、杂项、路石、星契）→ 160 px webp：抠掉连着四边的深色底（羽化边缘），按主体裁切放大，带透明通道；
emblem（功能栏、装备位、地图类型、节点、特性层、增益、状态）→ 128 px png，白色剪影、亮度当透明度，游戏里当遮罩再上色。
也读 design/icons/task-*.json（追加的图标任务）。
用法：python3 scripts/build-icons.py（需要 Pillow）"""
import json, pathlib
import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'design/icons', ROOT / 'public/assets/icons'


def cutout(im, lo=28, hi=62, pad=0.06, size=160):
    """Painted icon on a dark navy-to-black backdrop: the dark region touching the border becomes transparent
    (faded by brightness for a soft edge, dark parts inside the subject stay), then crop to the subject so it fills the cell."""
    a = np.asarray(im.convert('RGB')).astype(np.float32); v = a.max(2)
    lab, _ = ndimage.label(v < hi)
    edge = np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]]); edge = edge[edge > 0]
    t = np.clip((v - lo) / (hi - lo), 0, 1); t = t * t * (3 - 2 * t)
    alpha = ndimage.gaussian_filter(np.where(np.isin(lab, edge), t, 1.0), 0.8)
    ys, xs = np.where(alpha > 0.15)
    box = [0, 0, a.shape[1], a.shape[0]]
    if len(xs):
        cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
        side = max(160, max(xs.max() - xs.min(), ys.max() - ys.min()) * (1 + pad * 2))
        box = [round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2)]
    return Image.fromarray(np.dstack([a, alpha * 255]).astype(np.uint8), 'RGBA').crop(box).resize((size, size), Image.LANCZOS)

rows = json.loads((SRC / 'icon-prompts.json').read_text())['icons']
for task in sorted(SRC.glob('task-*.json')): rows += json.loads(task.read_text())['icons']   # 追加的图标任务
index = {}
for row in rows:
    cat, id_, style = row['cat'], row['id'], row['style']
    src = SRC / cat / f'{id_}.png'
    if not src.exists(): continue
    (OUT / cat).mkdir(parents=True, exist_ok=True)
    im = Image.open(src).convert('RGB')
    if style == 'painted':
        cutout(im).save(OUT / cat / f'{id_}.webp', 'WEBP', quality=86, method=6, exact=False)
        index.setdefault(cat, {})[id_] = 'webp'
    else:
        a = ImageOps.autocontrast(im.convert('L').resize((128, 128), Image.LANCZOS), cutoff=1)
        out = Image.new('RGBA', a.size, (255, 255, 255, 0)); out.putalpha(a)
        out.save(OUT / cat / f'{id_}.png', optimize=True)
        index.setdefault(cat, {})[id_] = 'png'
(OUT / 'index.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')))
# 游戏里据此判断某张图有没有（没有就用旧图标）
(ROOT / 'public/game/icon-index.mjs').write_text('// 由 scripts/build-icons.py 生成：已经有的自制图标\nexport const ICON_INDEX = ' + json.dumps(index, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(sum(len(v) for v in index.values()), 'icons →', OUT)
