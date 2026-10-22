#!/usr/bin/env python3
"""Makes the test sprite sheets used by tests/image-decode-browser.js: sheet1024 and sheet2048, each as .png, .webp and .avif.

Run: python3 modules/image-decode/test/make-sheets.py OUTPUT_FOLDER     (needs Pillow with WebP and AVIF support)
Then: IMG_DIR=OUTPUT_FOLDER CHROMIUM=/path/to/chrome node tests/image-decode-browser.js
The artwork is a 16 x 16 grid of overlapping colored discs, blurred a little, with a little noise, so it compresses like a real sprite sheet.
Copyright (c) 2026 LFC Foundry. MIT License.
"""
import os, random, sys
from PIL import Image, ImageDraw, ImageFilter

def sheet(n):
    random.seed(5)
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    cell = n // 16
    for cy in range(16):
        for cx in range(16):
            base = (random.randint(40, 255), random.randint(40, 255), random.randint(40, 255))
            x0, y0 = cx * cell, cy * cell
            for _ in range(6):
                r = random.randint(cell // 8, cell // 2 - 2)
                ox, oy = random.randint(-cell // 6, cell // 6), random.randint(-cell // 6, cell // 6)
                c = tuple(max(0, min(255, v + random.randint(-60, 60))) for v in base) + (255,)
                d.ellipse([x0 + cell // 2 + ox - r, y0 + cell // 2 + oy - r, x0 + cell // 2 + ox + r, y0 + cell // 2 + oy + r], fill=c)
    im = im.filter(ImageFilter.GaussianBlur(1.2))
    px = im.load()
    for _ in range(n * n // 12):
        x, y = random.randrange(n), random.randrange(n); r, g, b, a = px[x, y]
        if a:
            px[x, y] = tuple(min(255, max(0, v + random.randint(-14, 14))) for v in (r, g, b)) + (a,)
    return im

out = sys.argv[1] if len(sys.argv) > 1 else '.'
os.makedirs(out, exist_ok=True)
for n in (1024, 2048):
    im = sheet(n)
    im.save(os.path.join(out, 'sheet%d.png' % n), optimize=True)
    im.save(os.path.join(out, 'sheet%d.webp' % n), quality=82, method=4)
    im.save(os.path.join(out, 'sheet%d.avif' % n), quality=60, speed=8)
print('wrote sheets to', out)
