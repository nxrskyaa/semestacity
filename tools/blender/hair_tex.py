# Procedural, tileable hair-strand texture (grayscale-ish multiplier for the vertex-colour hair gradient).
# u runs across strands, v along them. Values ~0.55..1.0 (mean ~0.8).
#   exec(open(os.path.join(ROOT, 'tools', 'blender', 'hair_tex.py')).read()); img = paint_hair_strands()
import os
ROOT = globals().get('SEMESTA_ROOT') or os.getcwd()   # repo root (set SEMESTA_ROOT before exec in Blender)
import numpy as np
import bpy

STRAND_MEAN = 0.8


def paint_hair_strands(name='HairStrands', size=512, seed=7):
    rng = np.random.default_rng(seed)
    u = (np.arange(size) + 0.5) / size
    U, V = np.meshgrid(u, u)
    # strands wander a little along their length (tileable)
    Uw = U + 0.004 * np.sin(2 * np.pi * (2 * V + rng.uniform())) + 0.002 * np.sin(2 * np.pi * (5 * V + rng.uniform()))
    f = np.zeros_like(U)
    for n, a in ((7, 0.5), (13, 0.45), (23, 0.4), (41, 0.35), (67, 0.3), (97, 0.25), (151, 0.2), (233, 0.15)):
        f += a * np.sin(2 * np.pi * (n * Uw + rng.uniform()))
    f /= np.abs(f).max()
    g = np.zeros_like(U)
    for m, a in ((1, 0.5), (3, 0.3), (7, 0.2)):
        g += a * np.sin(2 * np.pi * (m * V + 3 * U + rng.uniform()))
    # strand clumps: bright clump centres, dark gaps between them, each clump a slightly different tone
    nc = 9
    jit = rng.uniform(-0.25, 0.25, nc)
    cpos = Uw * nc + np.interp(Uw * nc % nc, np.arange(nc + 1), np.append(jit, jit[0]))
    cu = cpos % 1.0
    cid = np.floor(cpos).astype(int) % nc
    profile = 1 - np.abs(2 * cu - 1) ** 6                        # 1 in the clump middle, 0 in a narrow gap
    tone = rng.uniform(-1, 1, nc)[cid]
    fine = np.sin(2 * np.pi * (347 * Uw + 0.3)) * np.sin(2 * np.pi * (151 * Uw + 0.7))
    val = np.clip(0.66 + 0.16 * profile + 0.05 * f + 0.03 * fine + 0.03 * tone + 0.02 * g, 0.45, 1.0)
    rgb = np.stack([val, val * 0.975, val * 0.955, np.ones_like(val)], axis=-1).astype(np.float32)
    old = bpy.data.images.get(name)
    if old:
        bpy.data.images.remove(old)
    img = bpy.data.images.new(name, size, size, alpha=False)
    img.pixels.foreach_set(rgb.ravel())
    img.update()
    img.pack()
    return img
