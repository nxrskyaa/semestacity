# Littlechip (Semesta Mart keeper) on the female base body.
#   exec(open(os.path.join(ROOT, 'tools', 'blender', 'littlechip.py')).read()); build_littlechip()
# Needs base_body.py (loft, material, apply_modifiers, HEAD_C, HEAD_R ...).
import os
ROOT = globals().get('SEMESTA_ROOT') or os.getcwd()   # repo root (set SEMESTA_ROOT before exec in Blender)
import math
import random
import bpy
import bmesh
from mathutils import Vector

exec(open(os.path.join(ROOT, 'tools', 'blender', 'base_body.py')).read(), globals())
exec(open(os.path.join(ROOT, 'tools', 'blender', 'clothes.py')).read(), globals())

HAIR = '#a8938b'
HAIR_ROOT = '#6e5b56'
HAIR_TIP = '#cdbcb2'


def _hexlin(h):
    return srgb(h)


def vcol_gradient(ob, fn, name='Col'):
    """Per-corner colour attribute, fn(world_co) -> (r,g,b) linear."""
    me = ob.data
    attr = me.color_attributes.get(name) or me.color_attributes.new(name, 'FLOAT_COLOR', 'CORNER')
    for li, l in enumerate(me.loops):
        c = fn(me.vertices[l.vertex_index].co)
        attr.data[li].color = (*c, 1.0)
    me.color_attributes.active_color = attr
    return attr


def mix3(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def hair_shade(co, root_z=1.64, tip_z=0.95):
    t = (root_z - co.z) / (root_z - tip_z)
    base = _hexlin(HAIR)
    c = mix3(_hexlin(HAIR_ROOT), base, min(1, t * 6 + 0.25))
    return mix3(c, _hexlin(HAIR_TIP), (t - 0.45) * 1.4)


# ------------------------------------------------------------------ hair cap
def _bvh(ob):
    from mathutils.bvhtree import BVHTree
    return BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())


def shell_point(bvh, a, e, off):
    """Point on the head surface in direction (azimuth a: 0=front(-Y), elevation e), pushed out by off."""
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    hit, nrm, _, _ = bvh.ray_cast(HEAD_C + d * 0.6, -d)
    if hit is None:
        return HEAD_C + d * (HEAD_R + off)
    return hit + nrm * off


def hairline_e(a):
    """Lowest elevation (rad) the cap reaches at azimuth a (0 front, pi back)."""
    a = abs((a + math.pi) % (2 * math.pi) - math.pi)
    pts = [(0.0, 0.36), (0.55, 0.30), (1.1, 0.02), (1.6, -0.20), (2.3, -0.45), (math.pi, -0.62)]
    for (a0, e0), (a1, e1) in zip(pts, pts[1:]):
        if a <= a1:
            t = (a - a0) / (a1 - a0)
            t = t * t * (3 - 2 * t)
            return e0 + (e1 - e0) * t
    return pts[-1][1]


TAIL_A, TAIL_E = 1.82, 0.74          # twin-tail anchor direction on the head (azimuth, elevation)


def _dir(a, e):
    return Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))


def _flow_ridge(a, e, k=22, amp=0.0009):
    """Ridges along great circles through the nearest tail anchor: strands combed from the part to the tie."""
    d = _dir(a, e)
    A = _dir(TAIL_A if d.x >= 0 else -TAIL_A, TAIL_E)
    p = d - A * d.dot(A)
    if p.length < 1e-4:
        return 0.0
    ref = Vector((0, 0, 1)) - A * A.z
    ang = math.atan2(A.cross(ref.normalized()).dot(p), ref.normalized().dot(p))
    near = _sm01((1 - d.dot(A)) / 0.25)            # fade out where strands bunch into the tie
    side = _sm01(abs(d.x) / 0.08)                  # fade at the centre part
    return amp * math.sin(ang * k) * near * side


def _flow_coords(a, e, side):
    """(angle around the tie axis, angular distance from the tie) for a head direction."""
    d = _dir(a, e)
    A = _dir(TAIL_A * side, TAIL_E)
    p = d - A * d.dot(A)
    ref = (Vector((0, 0, 1)) - A * A.z).normalized()
    ang = math.atan2(A.cross(ref).dot(p), ref.dot(p)) if p.length > 1e-5 else 0.0
    return ang, math.acos(max(-1.0, min(1.0, d.dot(A))))


def _flow_uvs(bm, faces, ae, u_rep=11, v_rep=1.6):
    """Cap UVs: u across strands (around the tie axis), v along them; each face uses the tie on its own side."""
    uvl = bm.loops.layers.uv.get('UVMap') or bm.loops.layers.uv.new('UVMap')
    for f in faces:
        side = 1 if f.calc_center_median().x >= 0 else -1
        uv = []
        for l in f.loops:
            ang, dist = _flow_coords(*ae[l.vert], side)
            uv.append([ang / (2 * math.pi) * u_rep, dist / (math.pi / 2) * v_rep])
        us = [q[0] for q in uv]
        if max(us) - min(us) > u_rep / 2:              # wrap seam
            for q in uv:
                if q[0] < 0:
                    q[0] += u_rep
        for l, q in zip(f.loops, uv):
            l[uvl].uv = q


def build_hair_cap(head, na=72, ne=16, thick=0.009):
    _replace('HairCap')
    bvh = _bvh(head)
    bm = bmesh.new()
    ae = {}
    rows = []
    for j in range(ne + 1):
        row = []
        for i in range(na):
            a = 2 * math.pi * i / na
            e0 = hairline_e(a)
            t = j / ne
            e = e0 + (math.pi / 2 - 0.02 - e0) * t
            top = max(0.0, math.sin(e))
            off = 0.011 + 0.010 * top + _flow_ridge(a, e)           # crown volume + strands combed to the ties
            p = shell_point(bvh, a, e, off)
            # centre part groove on the front-top
            part = math.exp(-((math.sin(a) * math.cos(e)) / 0.07) ** 2) * (top if math.cos(a) > 0 else 1.0)
            p -= (p - HEAD_C).normalized() * 0.006 * part
            vv = bm.verts.new(p)
            ae[vv] = (a, e)
            row.append(vv)
        rows.append(row)
    faces = []
    for j in range(ne):
        for i in range(na):
            faces.append(bm.faces.new((rows[j][i], rows[j][(i + 1) % na], rows[j + 1][(i + 1) % na], rows[j + 1][i])))
    pole = bm.verts.new(shell_point(bvh, 0, math.pi / 2, 0.021))
    ae[pole] = (0.0, math.pi / 2)
    for i in range(na):
        faces.append(bm.faces.new((rows[-1][i], rows[-1][(i + 1) % na], pole)))
    _flow_uvs(bm, faces, ae)
    me = bpy.data.meshes.new('HairCap')
    bm.to_mesh(me)
    bm.free()
    ob = _link('HairCap', me)
    so = ob.modifiers.new('Solid', 'SOLIDIFY')
    so.thickness = thick
    so.offset = -1
    so.use_rim = True
    apply_modifiers(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


# ------------------------------------------------------------------ bangs
BANG_Z = 1.466


def build_bangs(head, cols=72, rows=7):
    """Blunt fringe that grows out from under the cap: root inside the cap, tips lifted off the forehead."""
    _replace('Bangs')
    X0, X1 = -0.136, 0.136
    ztop = 1.60

    def cut(x):
        u = x / X1
        z = BANG_Z + 0.012 * u ** 4
        for nx, depth in ((-0.118, .012), (-0.098, .006), (-0.079, .004), (-0.058, .007), (-0.036, .004), (-0.017, .006),
                          (0.004, .003), (0.022, .006), (0.041, .004), (0.061, .007), (0.08, .004), (0.1, .006), (0.119, .012)):
            q = max(0.0, 1 - abs(x - nx) / 0.0035)
            z += depth * q * q
        return z
    bvh = _bvh(head)
    bm = bmesh.new()
    grid = []
    for j in range(rows + 1):
        row = []
        for i in range(cols + 1):
            x = X0 + (X1 - X0) * i / cols
            zb = cut(x)
            t = j / rows
            z = zb + (ztop - zb) * t ** 1.4
            hit, nrm, _, _ = bvh.ray_cast(Vector((x, -0.6, z)), Vector((0, 1, 0)))
            if hit is None:
                row.append(None)
                continue
            tip = 1 - t                                   # 1 at the cut edge
            off = 0.004 + 0.020 * tip ** 0.7 + 0.0016 * abs(math.sin(x * 260)) * tip
            p = hit + nrm * off
            p.z -= 0.004 * tip                            # tips hang a touch
            row.append(bm.verts.new(p))
        grid.append(row)
    uvl = bm.loops.layers.uv.new('UVMap')
    for j in range(rows):
        for i in range(cols):
            q = (grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])
            if all(q):
                f = bm.faces.new(q)
                for l, (di, dj) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                    l[uvl].uv = ((i + di) / cols * 15.0, (j + dj) / rows * 0.6)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    me = bpy.data.meshes.new('Bangs')
    bm.to_mesh(me)
    bm.free()
    ob = _link('Bangs', me)
    so = ob.modifiers.new('Solid', 'SOLIDIFY')
    so.thickness = 0.008
    so.offset = -1
    apply_modifiers(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


# ------------------------------------------------------------------ strands (side locks, twin tails)
def strand(bm, path, w0, w1, thick=0.45, ref=(0, 1, 0), seg=3, ring=8, taper=1.6):
    """Flat tapered strand along path (list of points). w0/w1 = root/tip half-width; thick = depth/width ratio."""
    n = len(path)
    pts = []
    for i, p in enumerate(path):
        t = i / (n - 1)
        w = w1 + (w0 - w1) * (1 - t) ** (1 / taper)
        if i == n - 1:
            w = 0.002
        pts.append((p, w, w * thick))
    length = sum((b - a).length for a, b in zip(path, path[1:]))
    loft(bm, pts, ref=ref, seg=seg, ring=ring, uv=(1.0, length / 0.18))


def _sample(ctrl, n):
    out = []
    m = len(ctrl)
    g = lambda j: ctrl[max(0, min(m - 1, j))]
    for k in range(n):
        u = k / (n - 1) * (m - 1)
        i = min(int(u), m - 2)
        out.append(_cr(g(i - 1), g(i), g(i + 1), g(i + 2), u - i))
    return out


def _tail_paths(side, anchor, n_clumps=8, per=2, seed=3, samples=17):
    """Strands grouped into big wavy locks: each clump shares its curl phase so it reads as one ringlet."""
    rnd = random.Random(seed + (0 if side > 0 else 17))
    s = side
    ctrl = [anchor, anchor + Vector((s * .05, .025, .01)), Vector((s * .195, .075, 1.53)), Vector((s * .222, .085, 1.42)),
            Vector((s * .232, .082, 1.29)), Vector((s * .232, .075, 1.16)), Vector((s * .225, .065, 1.04)), Vector((s * .215, .06, .93)),
            Vector((s * .205, .055, .86))]
    centre = _sample(ctrl, samples)
    paths = []
    for c in range(n_clumps):
        ang = 2 * math.pi * c / n_clumps + rnd.uniform(-.2, .2)
        ph = rnd.uniform(0, 2 * math.pi)
        om = rnd.uniform(13.0, 15.5)
        spread = rnd.uniform(0.75, 1.1)
        clen = rnd.uniform(0.82, 1.0)
        for k in range(per):
            dj = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0)) * 0.009
            length = clen - 0.06 * k
            path = []
            for i, cpt in enumerate(centre):
                tt = i / (samples - 1)
                if tt > length + 1e-6 and i > 3:
                    break
                r = (0.004 + 0.05 * _sm01((tt - 0.04) / 0.45) * (1 - 0.25 * _sm01((tt - 0.7) / 0.3))) * spread
                amp = 0.003 + 0.034 * _sm01((tt - 0.08) / 0.5)
                w = om * tt + ph
                off = Vector((math.cos(ang) * r + amp * math.cos(w), math.sin(ang) * r * 0.8 + amp * math.sin(w) * 0.8, 0))
                path.append(cpt + off + dj * _sm01(tt * 3))
            paths.append((path, k))
    return paths


def build_twin_tails(head):
    _replace('TwinTails')
    bvh = _bvh(head)
    bm = bmesh.new()
    for s in (1, -1):
        anchor = shell_point(bvh, s * TAIL_A, TAIL_E, 0.016)
        for path, k in _tail_paths(s, anchor):
            w = (0.034, 0.024)[k]                               # broad lock + a thinner companion
            strand(bm, [anchor - (anchor - HEAD_C).normalized() * 0.01] + path, w, w * 0.75, thick=0.5, ref=(1, 0, 0),
                   seg=2, ring=8, taper=3.0)
    me = bpy.data.meshes.new('TwinTails')
    bm.to_mesh(me)
    bm.free()
    ob = _link('TwinTails', me)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def build_side_locks(head):
    _replace('SideLocks')
    bvh = _bvh(head)
    bm = bmesh.new()
    for s in (1, -1):
        for k, (a, dz, ln, w) in enumerate(((0.88, 0.0, 1.1, 0.026), (1.02, -0.02, 0.95, 0.018), (1.18, -0.06, 0.75, 0.013))):
            root = shell_point(bvh, s * a, 0.28 + dz, 0.012)
            p1 = shell_point(bvh, s * (a + 0.08), -0.15, 0.012)
            p2 = shell_point(bvh, s * (a + 0.12), -0.55, 0.014)
            zend = 1.38 - 0.16 * ln
            p3 = Vector((p2.x + s * 0.005, p2.y - 0.004, (p2.z * 2 + zend) / 3))
            p4 = Vector((p2.x + s * 0.001, p2.y - 0.005, (p2.z + zend * 2) / 3))
            p5 = Vector((p2.x + s * 0.004, p2.y - 0.006, zend))
            p6 = Vector((p2.x + s * 0.001, p2.y - 0.01, zend - 0.02))
            strand(bm, [root, p1, p2, p3, p4, p5, p6], w * 1.3, w * 0.9, thick=0.28, ref=(0, 1, 0), seg=2, ring=6, taper=2.5)
    me = bpy.data.meshes.new('SideLocks')
    bm.to_mesh(me)
    bm.free()
    ob = _link('SideLocks', me)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def hair_material():
    m = bpy.data.materials.get('Hair') or bpy.data.materials.new('Hair')
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (1, 1, 1, 1)
    b.inputs['Roughness'].default_value = 0.42
    ca = next((n for n in nt.nodes if n.type == 'VERTEX_COLOR'), None) or nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'Col'
    img = bpy.data.images.get('HairStrands')
    if img is None:
        nt.links.new(ca.outputs['Color'], b.inputs['Base Color'])
        return m
    tex = next((n for n in nt.nodes if n.type == 'TEX_IMAGE'), None) or nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    mix = next((n for n in nt.nodes if n.type == 'MIX'), None) or nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = 1.0
    nt.links.new(tex.outputs['Color'], mix.inputs[6])
    nt.links.new(ca.outputs['Color'], mix.inputs[7])
    nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    return m


def hair_colours(ob, seed=0):
    """Root-to-tip gradient plus soft strand streaks."""
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 6.28) for _ in range(3)]

    def f(co):
        c = hair_shade(co)
        a = math.atan2(co.x, -co.y)
        streak = 0.5 + 0.5 * math.sin(a * 23 + ph[0] + co.z * 14) * math.sin(a * 7 + ph[1] - co.z * 9)
        k = 1.12 + 0.14 * streak                   # strand texture (mean ~0.8) darkens it back down
        # anime "angel ring" sheen across the crown and the top of the bangs
        k += 0.2 * math.exp(-((co.z - 1.556) / 0.022) ** 2) * (1.0 if co.z > 1.45 else 0.0)
        return tuple(min(1.0, x * k) for x in c)
    vcol_gradient(ob, f)


LITTLECHIP_FACE = dict(iris_bot='#3c2a2c', iris_top='#0a0708', iris_ring='#070505', iris_glint='#8a6e70',
                       brow='#a08a7e', lash_tip='#8a2a30', lash='#160e10',
                       eye_k=1.26, eye_cx=0.055, eye_cz=1.414,
                       open_top=0.037, open_bot=0.031, open_w=0.035, iris_rx=0.028, iris_rz=0.034,
                       lash_flicks=3, lower_liner=1.0, under_eye=0.22,
                       blush='#ff8a92', blush_a=0.5, blush_x=0.084, blush_z=1.366, blush_rx=0.028, blush_rz=0.012)


# ------------------------------------------------------------------ rigging
def add_tail_bones(rig, head):
    """Two-bone chain per twin tail (tail1/tail2_L/R) parented to head, for procedural sway in game."""
    bvh = _bvh(head)
    _activate(rig)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = rig.data.edit_bones
    for s, side in ((1, 'L'), (-1, 'R')):
        for n in ('tail1_' + side, 'tail2_' + side):
            if n in eb:
                eb.remove(eb[n])
        anchor = shell_point(bvh, s * TAIL_A, TAIL_E, 0.016)
        a = eb.new('tail1_' + side)
        a.head = anchor + Vector((s * .05, .025, .01))
        a.tail = Vector((s * .215, .082, 1.30))
        a.parent = eb['head']
        b = eb.new('tail2_' + side)
        b.head = a.tail
        b.tail = Vector((s * .205, .055, .86))
        b.parent = a
        b.use_connect = True
    bpy.ops.object.mode_set(mode='OBJECT')


def bind_rigid(ob, rig, bone='head'):
    ob.parent = rig
    ob.vertex_groups.clear()
    vg = ob.vertex_groups.new(name=bone)
    vg.add(range(len(ob.data.vertices)), 1.0, 'REPLACE')
    for m in [m for m in ob.modifiers if m.type == 'ARMATURE']:
        ob.modifiers.remove(m)
    ob.modifiers.new('Armature', 'ARMATURE').object = rig


def bind_tails(ob, rig):
    """Twin tails: head near the anchor, blending into tail1 then tail2 going down."""
    ob.parent = rig
    ob.vertex_groups.clear()
    g = {n: ob.vertex_groups.new(name=n) for n in ('head', 'tail1_L', 'tail2_L', 'tail1_R', 'tail2_R')}
    for v in ob.data.vertices:
        side = 'L' if v.co.x > 0 else 'R'
        z = v.co.z
        w_head = _sm01((z - 1.47) / 0.08)
        w_t2 = _sm01((1.33 - z) / 0.12)
        w_t1 = max(0.0, 1 - w_head - w_t2)
        for n, w in (('head', w_head), ('tail1_' + side, w_t1), ('tail2_' + side, w_t2)):
            if w > 1e-3:
                g[n].add([v.index], w, 'REPLACE')
    for m in [m for m in ob.modifiers if m.type == 'ARMATURE']:
        ob.modifiers.remove(m)
    ob.modifiers.new('Armature', 'ARMATURE').object = rig


def bind_transfer(ob, rig, body):
    """Copy skin weights from the body (nearest face, interpolated)."""
    ob.parent = rig
    ob.vertex_groups.clear()
    for vg in body.vertex_groups:
        ob.vertex_groups.new(name=vg.name)
    dt = ob.modifiers.new('DT', 'DATA_TRANSFER')
    dt.object = body
    dt.use_vert_data = True
    dt.data_types_verts = {'VGROUP_WEIGHTS'}
    dt.vert_mapping = 'POLYINTERP_NEAREST'
    dt.layers_vgroup_select_src = 'ALL'
    dt.layers_vgroup_select_dst = 'NAME'
    _activate(ob)
    bpy.ops.object.datalayout_transfer(modifier=dt.name)
    bpy.ops.object.modifier_apply(modifier=dt.name)
    for m in [m for m in ob.modifiers if m.type == 'ARMATURE']:
        ob.modifiers.remove(m)
    ob.modifiers.new('Armature', 'ARMATURE').object = rig


def bind_skirt(ob, rig):
    """Skirt: mostly hips so it doesn't tear; hem follows the thighs a little."""
    ob.parent = rig
    ob.vertex_groups.clear()
    g = {n: ob.vertex_groups.new(name=n) for n in ('hips', 'upperLeg_L', 'upperLeg_R')}
    for v in ob.data.vertices:
        t = _sm01((0.93 - v.co.z) / 0.2)
        legw = 0.45 * t
        side = _sm01((v.co.x + 0.06) / 0.12)                 # 0 = right (-X), 1 = left (+X)
        g['hips'].add([v.index], 1 - legw, 'REPLACE')
        if legw * side > 1e-3:
            g['upperLeg_L'].add([v.index], legw * side, 'REPLACE')
        if legw * (1 - side) > 1e-3:
            g['upperLeg_R'].add([v.index], legw * (1 - side), 'REPLACE')
    for m in [m for m in ob.modifiers if m.type == 'ARMATURE']:
        ob.modifiers.remove(m)
    ob.modifiers.new('Armature', 'ARMATURE').object = rig


def trim_hidden_body(body, zmax=0.58):
    """Remove body faces fully hidden inside the leg warmers / shoes."""
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(v.co.z < zmax for v in f.verts)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(body.data)
    bm.free()


def rig_littlechip():
    rig = bpy.data.objects['Rig']
    head = bpy.data.objects['Head']
    body = bpy.data.objects['Body']
    add_tail_bones(rig, head)
    for n in ('HairCap', 'Bangs', 'SideLocks', 'Face', 'Head'):
        bind_rigid(bpy.data.objects[n], rig, 'head')
    bind_tails(bpy.data.objects['TwinTails'], rig)
    bind_skirt(bpy.data.objects['Skirt'], rig)
    for n in ('Top', 'Lace', 'TopBow', 'Sleeves', 'Cuffs', 'Choker', 'Belt', 'Buckle', 'Chain', 'LegWarmers', 'Shoes'):
        bind_transfer(bpy.data.objects[n], rig, body)


# ------------------------------------------------------------------ budget
def decimate(ob, ratio):
    m = ob.modifiers.new('Dec', 'DECIMATE')
    m.ratio = ratio
    m.use_collapse_triangulate = False
    _activate(ob)
    bpy.ops.object.modifier_move_to_index(modifier=m.name, index=0)
    bpy.ops.object.modifier_apply(modifier=m.name)


def delete_faces(ob, pred):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if pred(f)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(ob.data)
    bm.free()


def trim_head_under_cap(head, cap):
    bvh = _bvh(cap)
    covered = {}
    for v in head.data.vertices:
        hit = bvh.ray_cast(v.co + v.normal * 0.001, v.normal, 0.05)[0]
        covered[v.index] = hit is not None and v.co.z > 1.47 or (hit is not None and (v.co - HEAD_C).y > 0.02)
    delete_faces(head, lambda f: all(covered[v.index] for v in f.verts))


def trim_face_decal(face, img):
    import numpy as np
    n = img.size[0]
    a = np.array(img.pixels[:], dtype=np.float32).reshape(n, n, 4)[..., 3]
    uv = face.data.uv_layers.active.data
    keep = set()
    for p in face.data.polygons:
        us = [uv[li].uv for li in p.loop_indices]
        u0, u1 = min(q.x for q in us), max(q.x for q in us)
        v0, v1 = min(q.y for q in us), max(q.y for q in us)
        x0, x1 = int(u0 * n), min(n - 1, int(u1 * n) + 1)
        y0, y1 = int(v0 * n), min(n - 1, int(v1 * n) + 1)
        if a[y0:y1 + 1, x0:x1 + 1].max() > 0.004:
            keep.add(p.index)
    delete_faces(face, lambda f: f.index not in keep)


def trim_torso_under_top(body):
    delete_faces(body, lambda f: all(1.035 < v.co.z < 1.15 and abs(v.co.x) < 0.1 for v in f.verts)
                 or all(0.86 < v.co.z < 0.92 and abs(v.co.x) < 0.14 for v in f.verts))


def optimise_littlechip():
    O = bpy.data.objects
    trim_head_under_cap(O['Head'], O['HairCap'])
    img = next(n for n in bpy.data.materials['FaceDecal'].node_tree.nodes if n.type == 'TEX_IMAGE').image
    trim_face_decal(O['Face'], img)
    trim_torso_under_top(O['Body'])
    for n, r in (('TwinTails', 0.33), ('HairCap', 0.7), ('Bangs', 0.75), ('LegWarmers', 0.62), ('Shoes', 0.4), ('Skirt', 0.7),
                 ('TopBow', 0.6), ('Choker', 0.7), ('Chain', 0.5)):
        decimate(O[n], r)


# ------------------------------------------------------------------ chibi proportions
NECK_PIVOT = Vector((0, 0.012, 1.33))      # head bone head
HEAD_CHAIN = ('head', 'tail1_L', 'tail2_L', 'tail1_R', 'tail2_R')


def chibify(rig, head_k=1.38, top=1.65, hair_top=None):
    """Roblox-anime proportions: scale the head (+ hair) up about the neck, shrink the body uniformly so the
    overall height stays `top`. Mesh and rest bones move together, blended by head-chain skin weight."""
    if hair_top is None:
        hair_top = max(v.co.z for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig for v in o.data.vertices)
    body_k = (top - (hair_top - NECK_PIVOT.z) * head_k) / NECK_PIVOT.z
    N, N2 = NECK_PIVOT, NECK_PIVOT * body_k
    tb = lambda p: p * body_k
    th = lambda p: N2 + (p - N) * head_k
    for ob in [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig]:
        idx = {g.index for g in ob.vertex_groups if g.name in HEAD_CHAIN}
        for v in ob.data.vertices:
            w = min(1.0, sum(g.weight for g in v.groups if g.group in idx))
            v.co = tb(v.co).lerp(th(v.co), w)
        ob.data.update()
    _activate(rig)
    bpy.ops.object.mode_set(mode='EDIT')
    for eb in rig.data.edit_bones:
        f = th if eb.name in HEAD_CHAIN else tb
        h, t = f(eb.head.copy()), f(eb.tail.copy())
        eb.head, eb.tail = h, t
    bpy.ops.object.mode_set(mode='OBJECT')
    return body_k


# ------------------------------------------------------------------ master build
def clear_character():
    for o in list(bpy.data.objects):
        if o.type in ('MESH', 'ARMATURE'):
            bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures):
        for b in list(coll):
            if b.users == 0:
                coll.remove(b)


def build_littlechip(chibi=True):
    clear_character()
    rig, body, head, face = build_base('female', LITTLECHIP_FACE)
    img = next(n for n in bpy.data.materials['FaceDecal'].node_tree.nodes if n.type == 'TEX_IMAGE').image
    img.name = 'Face_littlechip'
    hm = hair_material()
    for ob in (build_hair_cap(head), build_bangs(head), build_twin_tails(head), build_side_locks(head)):
        ob.data.materials.append(hm)
        hair_colours(ob)
    exec(open(os.path.join(ROOT, 'tools', 'blender', 'littlechip_outfit.py')).read(), globals())
    build_outfit(body)
    rig_littlechip()
    trim_hidden_body(body)
    optimise_littlechip()
    if chibi:
        chibify(rig)
    return rig
