"""Slice authored grid boundaries and pack exact 3x3 sheets; never changes the artwork."""
import argparse
import json
import shutil
from pathlib import Path
from PIL import Image, ImageOps

parser = argparse.ArgumentParser()
parser.add_argument('catalog', type=Path)
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
data = json.loads(args.catalog.read_text(encoding='utf-8-sig'))
size = 256
for sheet in data['sheets']:
    source = args.source / sheet['source']
    if not source.exists():
        source = args.source / f"{sheet['id']}.png"
    original = args.output / 'source' / f"{sheet['id']}.png"
    original.parent.mkdir(parents=True, exist_ok=True)
    if source.resolve() != original.resolve():
        shutil.copy2(source, original)
    image = Image.open(source).convert('RGB')
    atlas = Image.new('RGB', (size * 3, size * 3), '#080b11')
    for index, (kind, item_id, name) in enumerate(sheet['entries']):
        row, col = divmod(index, 3)
        box = (sheet['x'][col], sheet['y'][row], sheet['x'][col + 1], sheet['y'][row + 1])
        icon = ImageOps.pad(image.crop(box), (size, size), method=Image.Resampling.LANCZOS, color='#080b11')
        output = args.output / kind / f'{item_id}.png'
        output.parent.mkdir(parents=True, exist_ok=True)
        icon.save(output, optimize=True)
        atlas.paste(icon, (col * size, row * size))
    target = args.output / 'sheets' / f"{sheet['id']}.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(target, optimize=True)
for icon in data['icons']:
    if icon.get('copyFrom'):
        target = args.output / icon['kind'] / f"{icon['id']}.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(args.output / icon['copyFrom'], target)
(args.output / 'manifest.json').write_text(json.dumps({
    'style': '魔兽风、低细节、粗轮廓、无文字',
    'grid': {'columns': 3, 'rows': 3, 'cellSize': size, 'sheetSize': size * 3},
    **data,
}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f"Packed {len(data['sheets'])} exact 3x3 sheets and {len(data['icons'])} independent 256px icons.")
