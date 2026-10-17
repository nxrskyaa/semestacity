# Hime-style side curtains: wide flat hair panels from the temples down past the chin, framing the face
# (replaces the thin side locks). Built in the old head space (HEAD_C/HEAD_R) like the rest of the hair.
#   exec after littlechip.py; build_side_curtains(head) -> object named 'SideLocks' (same binding as before)
import math
import bpy
import bmesh
from mathutils import Vector


def build_side_curtains(head, cols=10, rows=16, z_top=1.53, z_bot=1.19):
    _replace('SideLocks')
    bvh = _bvh(head)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    for s in (1, -1):
        grid = []
        last = [None] * (cols + 1)
        for j in range(rows + 1):
            t = j / rows
            row = []
            for i in range(cols + 1):
                u = i / cols
                tip = 0.022 * abs(math.sin(i * 1.9 + 0.7)) + 0.012 * u      # uneven strand tips, outer edge longer
                z = z_top + (z_bot - tip - z_top) * t
                a_in = 0.93 - 0.08 * t                                       # inner edge just outside the eye corner
                a = s * (a_in + (1.5 - a_in) * u)
                d = Vector((math.sin(a), -math.cos(a), 0))
                hit = bvh.ray_cast(Vector((0, HEAD_C.y, z)) + d * 0.5, -d, 0.5)[0]
                off = 0.011 + 0.008 * t + 0.004 * (1 - u)                    # inner edge lifts off the cheek a little
                if hit is not None:
                    p = hit + d * off
                    last[i] = p.copy()
                else:                                                         # below the jaw: hang straight down
                    p = last[i].copy() if last[i] else Vector((0, HEAD_C.y, z)) + d * (HEAD_R * 0.7)
                    p.z = z
                    p -= d * 0.004 * (1 - u)
                row.append(bm.verts.new(p))
            grid.append(row)
        for j in range(rows):
            for i in range(cols):
                q = (grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])
                f = bm.faces.new(q if s > 0 else q[::-1])
                for l, (di, dj) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1)) if s > 0 else ((0, 1), (1, 1), (1, 0), (0, 0))):
                    l[uvl].uv = ((i + di) / cols * 2.5, (j + dj) / rows * 1.4)
    me = bpy.data.meshes.new('SideLocks')
    bm.to_mesh(me)
    bm.free()
    ob = _link('SideLocks', me)
    so = ob.modifiers.new('Solid', 'SOLIDIFY')
    so.thickness = 0.007
    so.offset = 0
    apply_modifiers(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob
