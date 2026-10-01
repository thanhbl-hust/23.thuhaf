"""Make web-sized copies of the photos in pictures/ and point places.js at them.

    python tools/optimize_photos.py

    pictures/<name>.<ext>        original photos (stay on your machine, not published)
    photos/<name>.jpg            max 1600px, shown in the full-size photo viewer
    photos/thumbs/<name>.jpg     max 480px, shown in the calendar and the popup grid

The photo is turned upright first, then all EXIF data (including the GPS location) is dropped.
Afterwards every "pictures/..." path in places.js is replaced by its "photos/..." copy,
so you can keep writing "pictures/new-photo.png" in places.js and just run this script.
Needs Pillow:  pip install pillow
"""
import re
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'pictures'
OUT = ROOT / 'photos'
THUMBS = OUT / 'thumbs'
PLACES = ROOT / 'places.js'
SIZES = [(OUT, 1600, 82), (THUMBS, 480, 72)]  # (folder, longest side in px, JPEG quality)
IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.webp'}
JPEG_EXTS = {'.jpg', '.jpeg'}


def web_names(files):
    """pictures/vit.png -> vit.jpg, unless another photo has the same name (then vit-png.jpg)."""
    by_stem = {}
    for f in files:
        by_stem.setdefault(f.stem.lower(), []).append(f)
    names = {}
    for group in by_stem.values():
        for f in group:
            clash = len(group) > 1 and f.suffix.lower() not in JPEG_EXTS
            names[f] = f'{f.stem}-{f.suffix[1:].lower()}.jpg' if clash else f'{f.stem}.jpg'
    return names


def save_resized(src, dest, max_side, quality):
    with Image.open(src) as original:
        im = ImageOps.exif_transpose(original)
        if im.mode in ('RGBA', 'LA', 'P'):
            im = im.convert('RGBA')
            flat = Image.new('RGB', im.size, 'white')
            flat.paste(im, mask=im.getchannel('A'))
            im = flat
        else:
            im = im.convert('RGB')
        im.thumbnail((max_side, max_side), Image.LANCZOS)
        dest.parent.mkdir(parents=True, exist_ok=True)
        # No exif= argument, so no metadata is written
        im.save(dest, 'JPEG', quality=quality, optimize=True, progressive=True)


def update_places(names):
    mapping = {f'pictures/{f.name}': f'photos/{name}' for f, name in names.items()}
    missing = []

    def replace(match):
        new = mapping.get(match.group(1))
        if new is None:
            missing.append(match.group(1))
            return match.group(0)
        return f'"{new}"'

    text = PLACES.read_text(encoding='utf-8')
    text, count = re.subn(r'"(pictures/[^"]+)"', replace, text)
    PLACES.write_text(text, encoding='utf-8')
    broken = [p for p in re.findall(r'"(photos/[^"]+)"', text) if not (ROOT / p).exists()]
    return count - len(missing), missing, broken


def main():
    files = sorted(p for p in SRC.iterdir() if p.suffix.lower() in IMAGE_EXTS)
    names = web_names(files)
    made = before = after = 0
    for f in files:
        for folder, side, quality in SIZES:
            dest = folder / names[f]
            if not dest.exists() or dest.stat().st_mtime < f.stat().st_mtime:
                save_resized(f, dest, side, quality)
                made += 1
        before += f.stat().st_size
        after += (OUT / names[f]).stat().st_size + (THUMBS / names[f]).stat().st_size

    print(f'{len(files)} photos, {made} files written')
    print(f'originals {before / 1e6:.1f} MB  ->  web copies + thumbnails {after / 1e6:.1f} MB')
    replaced, missing, broken = update_places(names)
    print(f'places.js: {replaced} paths switched to photos/')
    for path in missing:
        print(f'  WARNING: places.js uses {path}, but that file is not in pictures/')
    for path in broken:
        print(f'  WARNING: places.js uses {path}, but that file does not exist')


if __name__ == '__main__':
    main()
