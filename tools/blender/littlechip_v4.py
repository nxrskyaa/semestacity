# Littlechip v4 (procedural prototype): chibi R15-hybrid doll,
# head ~32% of height, crimson velvet sweetheart corset with gold piping + lace, high-waist black pleated skirt with
# studded belt and silver hip chain, oversized blocky ribbed leg warmers, platform shoes, milk-tea twin tails.
#   exec(open(os.path.join(ROOT, 'tools', 'blender', 'littlechip_v4.py')).read()); build_littlechip_v4()
import os
ROOT = globals().get('SEMESTA_ROOT') or os.getcwd()   # repo root (set SEMESTA_ROOT before exec in Blender)
import math
import bpy
import bmesh
from mathutils import Vector

exec(open(os.path.join(ROOT, 'tools', 'blender', 'littlechip.py')).read(), globals())
exec(open(os.path.join(ROOT, 'tools', 'blender', 'chibi.py')).read(), globals())
exec(open(os.path.join(ROOT, 'tools', 'blender', 'face_tex.py')).read(), globals())
exec(open(os.path.join(ROOT, 'tools', 'blender', 'side_curtains.py')).read(), globals())
exec(open(os.path.join(ROOT, 'tools', 'blender', 'littlechip_outfit.py')).read(), globals())   # _vcol, _scale helpers

VELVET = '#6a0a10'
GOLD = '#e6c365'
LACE = '#f5e6c8'
SKIRT = '#1b191a'
KNIT = '#1f1c1b'
SHOE = '#1c1917'
SILVER = '#c9cdd4'
SKIN = '#f2bea7'
HAIR_STOPS = ('#bf9c88', '#b48f7a', '#8f6c5a')     # crown -> mid -> tips (spec gradient #D7B8A6 / #B99683 / #8A6958)

LITTLECHIP_FACE_V4 = dict(
    # eyes: smaller, softly arched lid, fine lash line with a thin wing,
    # pointed inner corner, thin lower lash line, round deep red-brown iris with a dark limbal ring
    iris_top='#1a0705', iris_bot='#7e3322', iris_ring='#140504', iris_glint='#d99a78', pupil='#100403',
    sclera='#fbf2ee', lash='#1e110d', lash_tip='#4a1c14', brow='#6e4f41', crease='#d99c88',
    eye_k=1.06, eye_cx=0.066, eye_cz=1.391, lid_p=2.0, lid_slope=0.006, wing=0.7, lash_w=0.62,
    open_top=0.033, open_bot=0.031, open_w=0.036, iris_rx=0.029, iris_rz=0.032,
    lash_flicks=2, lower_liner=0.85, lower_full=1, under_eye=0.12, eyeshadow=0.32, bang_shadow=0.3, bang_z=1.448,
    crease_a=0.0, hl_scale=0.6, iris_detail=0.6,
    blush='#ec7a78', blush_a=0.6, blush_x=0.08, blush_z=1.347, blush_rx=0.034, blush_rz=0.014,
    mouth_z=1.331, mouth_w=0.005, mouth_curve=0.0004, nose_z=1.347, mouth='#a8604c', nose='#c98a76')


def hair_shade(co, root_z=1.64, tip_z=0.86):
    """Old head space: crown light, mid milk-tea, tips a little deeper (overrides littlechip.py)."""
    t = max(0.0, min(1.0, (root_z - co.z) / (root_z - tip_z)))
    a, b, c = (srgb(h) for h in HAIR_STOPS)
    return mix3(a, b, t / 0.35) if t < 0.35 else mix3(b, c, (t - 0.35) / 0.65)


def tail_groups(ob):
    """Twin-tail weights in old head space: head near the tie, tail1 then tail2 going down."""
    g = {n: ob.vertex_groups.new(name=n) for n in ('head', 'tail1_L', 'tail2_L', 'tail1_R', 'tail2_R')}
    for v in ob.data.vertices:
        side = 'L' if v.co.x > 0 else 'R'
        z = v.co.z
        w_head = _sm01((z - 1.50) / 0.07)
        w_t2 = _sm01((1.30 - z) / 0.14)
        w_t1 = max(0.0, 1 - w_head - w_t2)
        for n, w in (('head', w_head), ('tail1_' + side, w_t1), ('tail2_' + side, w_t2)):
            if w > 1e-3:
                g[n].add([v.index], w, 'REPLACE')


# ------------------------------------------------------------------ outfit (final space)
def neckline4(a):
    """Off-shoulder sweetheart: two rounded cups with a centre dip in front, straight across the back."""
    sa, ca = math.sin(a), math.cos(a)
    back = 0.978
    if ca <= 0:
        return back
    hump = 0.016 * math.exp(-((abs(sa) - 0.27) / 0.15) ** 2)
    dip = -0.014 * math.exp(-(sa / 0.06) ** 2)
    front = 0.963 + hump + dip
    return front + (back - front) * _sm01((abs(sa) - 0.5) / 0.45)


def build_corset(body):
    hem = lambda a: 0.735
    off = lambda a, z: 0.006 + 0.002 * _sm01((z - 0.85) / 0.06)
    maxr = lambda a, z: 0.142 if abs(math.sin(a)) > 0.65 else 0.2
    ob, ring = torso_garment('Top', body, hem, neckline4, off, na=56, nz=8, maxr=maxr)
    _solid(ob, 0.005)
    return ob, ring


def build_piping(ring, name='Piping', r=0.0034):
    _replace(name)
    bm = bmesh.new()
    pts = []
    n = len(ring)
    for i in range(n + 1):
        p = ring[i % n]
        out = Vector((p.x, p.y - 0.006, 0)).normalized()
        pts.append((p + out * 0.004 + Vector((0, 0, -0.001)), r, r))
    loft(bm, pts, ref=(0, 0, 1), seg=1, ring=6)
    return _finish(name, bm)


def build_lace_up(ring, name='Lace', h=0.009, scallops=30):
    """Cream lace ruffle peeking above the corset edge."""
    _replace(name)
    n = len(ring)
    bm = bmesh.new()
    lo, up = [], []
    for i, p in enumerate(ring):
        out = Vector((p.x, p.y - 0.006, 0)).normalized()
        sc = abs(math.sin(math.pi * scallops * i / n))
        lo.append(bm.verts.new(p + out * 0.001 - Vector((0, 0, 0.004))))
        up.append(bm.verts.new(p + out * (0.004 + 0.002 * sc) + Vector((0, 0, h * (0.55 + 0.45 * sc)))))
    for i in range(n):
        bm.faces.new((lo[i], lo[(i + 1) % n], up[(i + 1) % n], up[i]))
    ob = _finish(name, bm)
    _solid(ob, 0.0015)
    return ob


def build_gold_bow(ring):
    _replace('TopBow')
    bm = bmesh.new()
    p = ring[0]
    bow(bm, (0, p.y - 0.008, p.z - 0.016), 0.011)
    return _finish('TopBow', bm)


def build_sleeves4():
    _replace('Sleeves')
    bm = bmesh.new()
    for s in (1, -1):
        sh = Vector((s * SHOULDER.x, SHOULDER.y, SHOULDER.z))
        el = Vector((s * ELBOW.x, ELBOW.y, ELBOW.z))
        P = lambda t: sh + (el - sh) * t
        loft(bm, [(P(-0.04), .045, .045), (P(0.04), .07, .068), (P(0.17), .078, .074), (P(0.3), .07, .066),
                  (P(0.38), .055, .052), (P(0.41), .05, .048)], ref=(0, 1, 0), seg=3, ring=18)
    return _finish('Sleeves', bm)


def build_choker4():
    _replace('Choker')
    bm = bmesh.new()
    loft(bm, [((0, 0.012, 1.066), .0525, .0525), ((0, 0.012, 1.078), .0522, .0522)], ref=(1, 0, 0), seg=1, ring=24)
    bow(bm, (0, -0.042, 1.07), 0.03)
    return _finish('Choker', bm)


def build_skirt4(body, pleats=18):
    _replace('Skirt')
    bvh = _bvh(body)
    na, nz = pleats * 4, 9
    ztop, zhem = 0.768, 0.561
    bm = bmesh.new()
    rows = []
    for j in range(nz + 1):
        t = j / nz
        z = ztop + (zhem - ztop) * t
        row = []
        for i in range(na):
            a = 2 * math.pi * i / na
            r = body_radius(bvh, z if t < 0.25 else max(z, 0.70), a)
            r += 0.008 + 0.1 * t ** 1.1
            r += (0.0, 1.0, 0.0, -1.0)[i % 4] * 0.014 * t ** 0.8            # box pleats, flat under the belt
            zz = z - 0.01 * t * max(0.0, -math.cos(a))
            row.append(bm.verts.new((math.sin(a) * r, 0.006 - math.cos(a) * r, zz)))
        rows.append(row)
    for j in range(nz):
        for i in range(na):
            bm.faces.new((rows[j][i], rows[j][(i + 1) % na], rows[j + 1][(i + 1) % na], rows[j + 1][i]))
    ob = _finish('Skirt', bm)
    _solid(ob, 0.004)
    return ob


def build_belt4(body):
    for n in ('Belt', 'Studs', 'Chain'):
        _replace(n)
    bvh = _bvh(body)
    bm = bmesh.new()
    na = 56
    rings = []
    for z in (0.748, 0.778):
        ring = []
        for i in range(na):
            a = 2 * math.pi * i / na
            r = body_radius(bvh, z, a) + 0.0125
            ring.append(bm.verts.new((math.sin(a) * r, 0.006 - math.cos(a) * r, z)))
        rings.append(ring)
    for i in range(na):
        bm.faces.new((rings[0][i], rings[0][(i + 1) % na], rings[1][(i + 1) % na], rings[1][i]))
    belt = _finish('Belt', bm)
    _solid(belt, 0.003)
    # brass studs: a pair on each front side (ref belt tabs)
    bm = bmesh.new()
    for a in (-0.55, 0.55):
        for dz in (-0.0, ):
            for da in (-0.07, 0.07):
                aa = a + da
                r = body_radius(bvh, 0.763, aa) + 0.0165
                c = Vector((math.sin(aa) * r, 0.006 - math.cos(aa) * r, 0.763))
                out = Vector((math.sin(aa), -math.cos(aa), 0))
                loft(bm, [(c - out * 0.002, .0045, .0045), (c + out * 0.0015, .0045, .0045), (c + out * 0.003, .002, .002)],
                     ref=(0, 0, 1), seg=1, ring=8)
    studs = _finish('Studs', bm)
    # silver chain sagging over the skirt on the character's right hip (-X)
    path = []
    a0, a1, nl = -0.4, -1.9, 22
    for k in range(nl + 1):
        u = k / nl
        a = a0 + (a1 - a0) * u
        z = 0.76 - 0.13 * math.sin(math.pi * u)
        ts = max(0.0, (0.768 - z) / 0.207)
        r = body_radius(bvh, z if ts < 0.25 else max(z, 0.70), a) + 0.008 + 0.1 * ts ** 1.1 + 0.014 * ts ** 0.8 + 0.016
        path.append(Vector((math.sin(a) * r, 0.006 - math.cos(a) * r, z)))
    bm = bmesh.new()
    chain_links(bm, path, link_r=0.0095)
    chain = _finish('Chain', bm)
    w = chain.modifiers.new('Wire', 'WIREFRAME')
    w.thickness = 0.003
    w.use_boundary = True
    apply_modifiers(chain)
    for p in chain.data.polygons:
        p.use_smooth = True
    return belt, studs, chain


def _superellipse(t, hx, hy, n=3.4):
    c, s = math.cos(t), math.sin(t)
    return (math.copysign(abs(c) ** (2 / n), c) * hx, math.copysign(abs(s) ** (2 / n), s) * hy)


def build_warmers4(top=0.462, bottom=0.074, nz=18, na=32):
    """Oversized blocky ribbed knit warmers (rounded-box section), slouch bulge near the shoe, ribbed top cuff."""
    _replace('LegWarmers')
    bm = bmesh.new()
    for s in (1, -1):
        rows = []
        for j in range(nz + 1):
            t = j / nz
            z = top + (bottom - top) * t
            cx, cy = s * 0.087, 0.006
            bulge = 0.008 * _sm01((t - 0.55) / 0.3) * (1 - 0.6 * _sm01((t - 0.92) / 0.08))
            fold = 0.0035 * _sm01((t - 0.45) / 0.3) * math.sin(z * 85)
            hx, hy = 0.079 + bulge + fold, 0.076 + bulge + fold
            if t < 0.09:
                hx += 0.003
                hy += 0.003
            row = []
            for i in range(na):
                th = 2 * math.pi * i / na
                x, y = _superellipse(th, hx, hy)
                rib = 1 + 0.03 * math.cos(th * 16)
                row.append(bm.verts.new((cx + x * rib, cy + y * rib, z)))
            rows.append(row)
        for j in range(nz):
            for i in range(na):
                bm.faces.new((rows[j][(i + 1) % na], rows[j][i], rows[j + 1][i], rows[j + 1][(i + 1) % na]))
        cc = bm.verts.new((s * 0.087, 0.006, top - 0.012))
        for i in range(na):
            bm.faces.new((rows[0][i], rows[0][(i + 1) % na], cc))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return _finish('LegWarmers', bm)


def build_platform_shoes():
    _replace('Shoes')
    bm = bmesh.new()
    for s in (1, -1):
        vs = _box(bm, (s * 0.087, -0.03, 0.04), (0.168, 0.2, 0.08))
        # round the toe a little narrower
        for v in vs:
            if v.co.y < -0.08:
                v.co.x = s * 0.087 + (v.co.x - s * 0.087) * 0.9
    ob = _finish('Shoes', bm)
    bv = ob.modifiers.new('Bevel', 'BEVEL')
    bv.width = 0.022
    bv.segments = 4
    bv.limit_method = 'NONE'
    apply_modifiers(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def fabric_colours4(P):
    def velvet(co, n):
        a = math.atan2(co.x, -co.y)
        facing = max(0.0, -n.y) ** 2
        rim = 1 - abs(n.y)
        seam = sum(math.exp(-((a - q) / 0.035) ** 2) for q in (-1.3, -0.62, 0.0, 0.62, 1.3, 2.4, -2.4))  # boning
        crushed = 0.5 + 0.5 * math.sin(a * 17 + co.z * 55) * math.sin(a * 6 - co.z * 31)
        k = 0.82 + 0.45 * facing - 0.25 * rim + 0.14 * crushed - 0.35 * min(1.0, seam)
        return _scale(VELVET, k)
    _vcol(P['Top'], velvet)
    _vcol(P['Sleeves'], lambda co, n: _scale(VELVET, 0.85 + 0.4 * max(0.0, -n.y) ** 2 - 0.2 * (1 - abs(n.y))))

    def pleats(co, n):
        a = math.atan2(co.x, -co.y) % (2 * math.pi)
        ph = (a * 72 / (2 * math.pi)) % 4
        fold = 0.5 + 0.5 * math.cos(ph * math.pi / 2)
        return _scale(SKIRT, 0.65 + 0.75 * fold)
    _vcol(P['Skirt'], pleats)

    def knit(co, n):
        a = math.atan2(co.x - math.copysign(0.087, co.x), -(co.y - 0.006))
        rib = 0.5 + 0.5 * math.cos(a * 16)
        cuff = _sm01((co.z - 0.43) / 0.02)
        return _scale(KNIT, 0.7 + 0.5 * rib + 0.15 * cuff)
    _vcol(P['LegWarmers'], knit)


def build_outfit4(body):
    top, ring = build_corset(body)
    P = {'Top': top, 'Piping': build_piping(ring), 'Lace': build_lace_up(ring), 'TopBow': build_gold_bow(ring),
         'Sleeves': build_sleeves4(), 'Choker': build_choker4(), 'Skirt': build_skirt4(body),
         'LegWarmers': build_warmers4(), 'Shoes': build_platform_shoes()}
    P['Belt'], P['Studs'], P['Chain'] = build_belt4(body)
    M = {'Top': plain_material('Velvet', VELVET, 0.75, vcol=True), 'Sleeves': plain_material('Velvet', VELVET, 0.75, vcol=True),
         'Piping': plain_material('Gold', GOLD, 0.3, metal=0.9), 'TopBow': plain_material('Gold', GOLD, 0.3, metal=0.9),
         'Studs': plain_material('Gold', GOLD, 0.3, metal=0.9), 'Lace': plain_material('Lace', LACE, 0.8),
         'Choker': plain_material('Ribbon', '#111014', 0.45), 'Skirt': plain_material('SkirtBlack', SKIRT, 0.8, vcol=True),
         'Belt': plain_material('Leather', '#141214', 0.4), 'Chain': plain_material('Silver', SILVER, 0.3, metal=0.7),
         'LegWarmers': plain_material('Knit', KNIT, 0.95, vcol=True), 'Shoes': plain_material('ShoeBlack', SHOE, 0.35)}
    for k, o in P.items():
        o.data.materials.clear()
        o.data.materials.append(M[k])
    fabric_colours4(P)
    return P


def bind_skirt4(ob, rig):
    ob.parent = rig
    ob.vertex_groups.clear()
    g = {n: ob.vertex_groups.new(name=n) for n in ('hips', 'upperLeg_L', 'upperLeg_R')}
    for v in ob.data.vertices:
        t = _sm01((0.768 - v.co.z) / 0.207)
        legw = 0.45 * t
        side = _sm01((v.co.x + 0.06) / 0.12)
        g['hips'].add([v.index], 1 - legw, 'REPLACE')
        if legw * side > 1e-3:
            g['upperLeg_L'].add([v.index], legw * side, 'REPLACE')
        if legw * (1 - side) > 1e-3:
            g['upperLeg_R'].add([v.index], legw * (1 - side), 'REPLACE')
    ob.modifiers.new('Armature', 'ARMATURE').object = rig


# ------------------------------------------------------------------ master
def build_littlechip_v4():
    global BODY_KIND, BANG_Z
    BANG_Z = 1.448                       # bangs reach almost to the eyes (ref)
    clear_character()
    BODY_KIND = 'female'
    # head, face, hair in the old head space
    head = build_head()
    face = build_face(head)
    old = bpy.data.images.get('Face_littlechip')
    if old:
        bpy.data.images.remove(old)
    img = paint_face('Face_littlechip', LITTLECHIP_FACE_V4)
    face.data.materials.append(face_material(img))
    exec(open(os.path.join(ROOT, 'tools', 'blender', 'hair_tex.py')).read(), globals())
    paint_hair_strands()
    hm = hair_material()
    cap, bangs, tails, locks = build_hair_cap(head), build_bangs(head), build_twin_tails(head), build_side_curtains(head)
    for ob in (cap, bangs, tails, locks):
        ob.data.materials.append(hm)
        hair_colours(ob)
    tail_groups(tails)
    trim_head_under_cap(head, cap)
    trim_face_decal(face, img)
    for ob, r in ((tails, 0.21), (cap, 0.6), (bangs, 0.7)):
        decimate(ob, r)
    bvh = _bvh(head)
    tail_pts = {}
    for s, sd in ((1, 'L'), (-1, 'R')):
        anchor = shell_point(bvh, s * TAIL_A, TAIL_E, 0.016)
        tail_pts[sd] = (anchor + Vector((s * .05, .025, .01)), Vector((s * .232, .082, 1.30)), Vector((s * .205, .055, .86)))
    hobjs = (head, face, cap, bangs, tails, locks)
    old_chin = min(v.co.z for v in head.data.vertices)
    old_top = max(v.co.z for o in hobjs for v in o.data.vertices)
    T, k = head_transform(old_chin, old_top)
    place_head(hobjs, T)
    # body + rig in final space
    body = build_chibi_body(target_quads=3600)
    skin = material('Skin', SKIN, 0.45)
    for o in (body, head):
        o.data.materials.clear()
        o.data.materials.append(skin)
    table = chibi_bone_table(T)
    for sd in ('L', 'R'):
        a, b, c = (tuple(T(p)) for p in tail_pts[sd])
        table['tail1_' + sd] = (a, b, 'head')
        table['tail2_' + sd] = (b, c, 'tail1_' + sd)
    rig = build_armature_from(table)
    skin_to(rig, body, rigid=(head, face))
    for ob in (cap, bangs, locks):
        bind_rigid(ob, rig, 'head')
    tails.parent = rig
    tails.modifiers.new('Armature', 'ARMATURE').object = rig
    # outfit
    P = build_outfit4(body)
    bind_skirt4(P['Skirt'], rig)
    for n, ob in P.items():
        if n != 'Skirt':
            bind_transfer(ob, rig, body)
    # hidden-body trims + light decimation
    delete_faces(body, lambda f: all(v.co.z < 0.45 for v in f.verts)
                 or all(0.76 < v.co.z < 0.94 and abs(v.co.x) < 0.1 for v in f.verts)
                 or all(0.70 < v.co.z < 0.745 and abs(v.co.x) < 0.12 for v in f.verts))
    for n, r in (('Skirt', 0.75), ('Chain', 0.45), ('TopBow', 0.6), ('Choker', 0.7)):
        decimate(P[n], r)
    return rig
