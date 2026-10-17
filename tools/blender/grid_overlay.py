# Overlay a metric grid on the ortho front/side renders (g_front.png, g_side.png: 900 px, ortho 1.8 m, centre z 0.825)
# so joint positions can be read off for gen_postprocess.rig().  python tools/blender/grid_overlay.py [out_name]
import os
ROOT = globals().get('SEMESTA_ROOT') or os.getcwd()   # repo root (set SEMESTA_ROOT before exec in Blender)
import sys
from PIL import Image, ImageDraw

R = os.path.join(ROOT, 'tools', 'blender', 'renders')
ims = []
for n in ('front', 'side'):
    im = Image.open(os.path.join(R, f'g_{n}.png')).convert('RGB')
    d = ImageDraw.Draw(im)
    for z20 in range(0, 34):
        z = z20 * 0.05
        py = int(450 - (z - 0.825) / 0.002)
        major = z20 % 2 == 0
        d.line([(0, py), (900, py)], fill=((255, 0, 0) if z20 % 10 == 0 else (0, 255, 255)) if major else (0, 120, 120))
        if major:
            d.text((2, py - 11), f'{z:.1f}', fill=(255, 255, 0))
    for x10 in range(-4, 5):
        px = int(450 + x10 * 0.1 / 0.002)
        d.line([(px, 0), (px, 900)], fill=(0, 255, 255) if x10 else (255, 0, 0))
        d.text((px + 2, 2), f'{x10 / 10:.1f}', fill=(255, 255, 0))
    ims.append(im)
S = Image.new('RGB', (1800, 900))
S.paste(ims[0], (0, 0))
S.paste(ims[1], (900, 0))
S.save(os.path.join(R, f'{sys.argv[1] if len(sys.argv) > 1 else "g_grid"}.png'))
