# Littlechip outfit: velvet crop top with puff sleeves + cream lace, ribbon choker, pleated mini skirt with
# belt and silver chain, chunky knit leg warmers, chunky black shoes.
#   exec(open(os.path.join(ROOT, 'tools', 'blender', 'littlechip_outfit.py')).read()); build_outfit(bpy.data.objects['Body'])
import os
ROOT = globals().get('SEMESTA_ROOT') or os.getcwd()   # repo root (set SEMESTA_ROOT before exec in Blender)
import math
import bpy
import bmesh
from mathutils import Vector

exec(open(os.path.join(ROOT, 'tools', 'blender', 'clothes.py')).read(), globals())

TOP = '#6a1420'
LACE = '#efe2c6'
BLACK = '#1b1a1f'
SILVER = '#c9cdd4'


def neckline(a):
    """Crop-top top edge: low square neckline in front, higher at the back."""
    c = math.cos(a)
    s = abs(math.sin(a))
    front = 1.165 + 0.01 * _sm01((s - 0.25) / 0.2)
    side, back = 1.205, 1.215
    if c > 0:
        return front + (side - front) * _sm01((s - 0.45) / 0.35)
    return back + (side - back) * _sm01((s - 0.6) / 0.4)


def build_top(body):
    hem = lambda a: 1.005 - 0.006 * math.cos(a)
    # slight blouse over the hem, a bit of room over the bust
    off = lambda a, z: 0.007 + 0.006 * _sm01((1.06 - z) / 0.06) + 0.004 * _sm01((z - 1.10) / 0.05) * max(0, math.cos(a))
    maxr = lambda a, z: 0.125 if abs(math.sin(a)) > 0.7 else 0.2      # don't run up the arms at the armholes
    ob, ring = torso_garment('Top', body, hem, neckline, off, na=56, nz=9, maxr=maxr)
    _solid(ob, 0.005)
    return ob, ring


def build_puff_sleeves():
    _replace('Sleeves')
    bm = bmesh.new()
    for s in (1, -1):
        a0 = Vector((s * .095, .008, 1.232))
        a1 = Vector((s * .27, .02, 1.055))
        P = lambda t: a0 + (a1 - a0) * t
        k = 0.75 + 0.25 * ARM_K[BODY_KIND]               # puffs grow a little with the thicker arm
        loft(bm, [(P(-0.02), .03 * k, .03 * k), (P(0.06), .056 * k, .056 * k), (P(0.2), .064 * k, .062 * k), (P(0.34), .056 * k, .054 * k),
                  (P(0.42), .04 * k, .039 * k), (P(0.45), .038 * k, .037 * k)], ref=(0, 1, 0), seg=3, ring=16)
    return _finish('Sleeves', bm)


def build_sleeve_cuffs():
    _replace('Cuffs')
    bm = bmesh.new()
    for s in (1, -1):
        a0 = Vector((s * .095, .008, 1.232))
        a1 = Vector((s * .27, .02, 1.055))
        P = lambda t: a0 + (a1 - a0) * t
        k = ARM_K[BODY_KIND]
        loft(bm, [(P(0.405), .042 * k, .041 * k), (P(0.44), .043 * k, .042 * k), (P(0.465), .041 * k, .040 * k)], ref=(0, 1, 0), seg=1, ring=16)
    return _finish('Cuffs', bm)


def build_choker():
    _replace('Choker')
    bm = bmesh.new()
    loft(bm, [((0, 0.012, 1.262), .0372, .0372), ((0, 0.012, 1.276), .0368, .0368)], ref=(1, 0, 0), seg=1, ring=24)
    bow(bm, (0, -0.029, 1.262), 0.026)
    return _finish('Choker', bm)


def build_top_bow(ring):
    _replace('TopBow')
    bm = bmesh.new()
    p = ring[0]                                   # azimuth 0 = centre front of the neckline
    bow(bm, (0, p.y - 0.01, p.z - 0.012), 0.013)
    return _finish('TopBow', bm)


def build_skirt(body, pleats=22):
    _replace('Skirt')
    bvh = _bvh(body)
    na, nz = pleats * 4, 9
    ztop, zhem = 0.935, 0.735
    bm = bmesh.new()
    rows = []
    for j in range(nz + 1):
        t = j / nz
        z = ztop + (zhem - ztop) * t
        row = []
        for i in range(na):
            a = 2 * math.pi * i / na
            r = body_radius(bvh, z if t < 0.3 else max(z, 0.86), a)     # below the hips flare from the hip line
            r += 0.008 + 0.075 * t ** 1.15
            r += (0.0, 1.0, 0.0, -1.0)[i % 4] * 0.012 * t ** 0.8           # knife pleats, flat under the belt
            zz = z - 0.012 * t * max(0.0, -math.cos(a))                   # back hem a touch lower
            row.append(bm.verts.new((math.sin(a) * r, 0.006 - math.cos(a) * r, zz)))
        rows.append(row)
    for j in range(nz):
        for i in range(na):
            bm.faces.new((rows[j][i], rows[j][(i + 1) % na], rows[j + 1][(i + 1) % na], rows[j + 1][i]))
    ob = _finish('Skirt', bm)
    _solid(ob, 0.004)
    return ob


def build_belt_chain(body):
    _replace('Belt')
    _replace('Chain')
    bvh = _bvh(body)
    bm = bmesh.new()
    na = 48
    rings = []
    for z in (0.925, 0.947):
        ring = []
        for i in range(na):
            a = 2 * math.pi * i / na
            r = body_radius(bvh, z, a) + 0.0135
            ring.append(bm.verts.new((math.sin(a) * r, 0.006 - math.cos(a) * r, z)))
        rings.append(ring)
    for i in range(na):
        bm.faces.new((rings[0][i], rings[0][(i + 1) % na], rings[1][(i + 1) % na], rings[1][i]))
    belt = _finish('Belt', bm)
    _solid(belt, 0.003)
    # silver buckle: rectangular frame + prong at centre front
    _replace('Buckle')
    r0 = body_radius(bvh, 0.936, 0.0) + 0.017
    bm = bmesh.new()
    c = Vector((0, 0.006 - r0, 0.936))
    loft(bm, [(c + Vector((-.016, 0, .011)), .0022, .0022), (c + Vector((.016, 0, .011)), .0022, .0022),
              (c + Vector((.016, 0, -.011)), .0022, .0022), (c + Vector((-.016, 0, -.011)), .0022, .0022),
              (c + Vector((-.016, 0, .011)), .0022, .0022)], ref=(0, 1, 0), seg=1, ring=6)
    loft(bm, [(c + Vector((-.002, -.001, 0)), .0016, .0016), (c + Vector((.014, -.002, 0)), .0016, .0016)], ref=(0, 0, 1), seg=1, ring=6)
    _finish('Buckle', bm)
    # silver chain sagging over the skirt on the character's right hip (-X)
    pt = lambda a: Vector((math.sin(a) * (body_radius(bvh, 0.93, a) + 0.02), 0.006 - math.cos(a) * (body_radius(bvh, 0.93, a) + 0.02), 0.928))
    a0, a1 = -0.45, -1.95
    path = []
    nl = 20
    for k in range(nl + 1):
        u = k / nl
        a = a0 + (a1 - a0) * u
        z = 0.928 - 0.15 * math.sin(math.pi * u)
        ts = max(0.0, (0.935 - z) / 0.2)                                  # skirt parameter at this height
        r = body_radius(bvh, z if ts < 0.3 else max(z, 0.86), a) + 0.008 + 0.075 * ts ** 1.15 + 0.012 * ts ** 0.8 + 0.016
        path.append(Vector((math.sin(a) * r, 0.006 - math.cos(a) * r, z)))
    bm = bmesh.new()
    chain_links(bm, path)
    chain = _finish('Chain', bm)
    w = chain.modifiers.new('Wire', 'WIREFRAME')
    w.thickness = 0.0026
    w.use_boundary = True
    apply_modifiers(chain)
    for p in chain.data.polygons:
        p.use_smooth = True
    return belt, chain


def build_leg_warmers(top=0.62, bottom=0.07, nz=30, na=32):
    """Chunky slouchy knit warmers: bunched folds toward the ankle, vertical ribs, thicker top band."""
    _replace('LegWarmers')
    bm = bmesh.new()
    for s in (1, -1):
        rows = []
        for j in range(nz + 1):
            t = j / nz
            z = top + (bottom - top) * t
            c, r = leg_at(z)
            c = Vector((s * c.x, c.y, z))
            slouch = 0.5 + 0.5 * _sm01((t - 0.3) / 0.4)
            fold = 0.013 * slouch * (0.5 + 0.5 * math.sin(z * 70 + 0.6 * math.sin(z * 23)))
            rr = max(r, 0.043) + 0.018 + fold + 0.016 * _sm01((t - 0.4) / 0.6)
            if t < 0.07:
                rr += 0.003
            row = []
            for i in range(na):
                a = 2 * math.pi * i / na
                q = rr + 0.0026 * math.cos(a * 16)
                row.append(bm.verts.new(c + Vector((math.sin(a) * q, -math.cos(a) * q, 0))))
            rows.append(row)
        for j in range(nz):
            for i in range(na):
                bm.faces.new((rows[j][i], rows[j][(i + 1) % na], rows[j + 1][(i + 1) % na], rows[j + 1][i]))
        cc = bm.verts.new(sum((v.co for v in rows[0]), Vector()) / na - Vector((0, 0, 0.012)))
        for i in range(na):
            bm.faces.new((rows[0][(i + 1) % na], rows[0][i], cc))
    return _finish('LegWarmers', bm)


def build_shoes():
    _replace('Shoes')
    bm = bmesh.new()
    for s in (1, -1):
        F = [((.091, .05, .035), .018, .02), ((.091, .042, .047), .042, .036), ((.091, .01, .052), .047, .042),
             ((.092, -.045, .044), .047, .035), ((.093, -.095, .035), .041, .027), ((.094, -.122, .031), .027, .019),
             ((.094, -.131, .031), .006, .005)]
        loft(bm, [((s * p[0], p[1], p[2]), rx, ry) for p, rx, ry in F], ref=(1, 0, 0), seg=3, ring=16)
        S = [((.091, .057, .012), .03, .012), ((.091, .03, .012), .047, .013), ((.092, -.05, .012), .049, .013),
             ((.094, -.12, .012), .033, .012), ((.094, -.137, .012), .01, .008)]
        loft(bm, [((s * p[0], p[1], p[2]), rx, ry) for p, rx, ry in S], ref=(1, 0, 0), seg=2, ring=12)
    return _finish('Shoes', bm)


def build_outfit(body):
    top, ring = build_top(body)
    parts = {
        'Top': top,
        'Lace': lace_strip('Lace', ring),
        'TopBow': build_top_bow(ring),
        'Sleeves': build_puff_sleeves(),
        'Cuffs': build_sleeve_cuffs(),
        'Choker': build_choker(),
        'Skirt': build_skirt(body),
        'LegWarmers': build_leg_warmers(),
        'Shoes': build_shoes(),
    }
    belt, chain = build_belt_chain(body)
    parts['Belt'], parts['Chain'], parts['Buckle'] = belt, chain, bpy.data.objects['Buckle']
    mats = {
        'Top': plain_material('Velvet', TOP, 0.75, vcol=True), 'Sleeves': plain_material('Velvet', TOP, 0.75, vcol=True),
        'Lace': plain_material('Lace', LACE, 0.8), 'Cuffs': plain_material('Lace', LACE, 0.8),
        'TopBow': plain_material('Lace', LACE, 0.8),
        'Choker': plain_material('Ribbon', '#111014', 0.45),
        'Skirt': plain_material('SkirtBlack', BLACK, 0.7, vcol=True), 'Belt': plain_material('Leather', '#121115', 0.4),
        'Chain': plain_material('Silver', SILVER, 0.3, metal=0.7), 'Buckle': plain_material('Silver', SILVER, 0.3, metal=0.7),
        'LegWarmers': plain_material('Knit', '#202024', 0.95, vcol=True), 'Shoes': plain_material('ShoeBlack', '#141317', 0.35),
    }
    for k, o in parts.items():
        o.data.materials.clear()
        o.data.materials.append(mats[k])
    fabric_colours(parts)
    return parts


def _vcol(ob, fn):
    me = ob.data
    attr = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    for li, l in enumerate(me.loops):
        v = me.vertices[l.vertex_index]
        attr.data[li].color = (*fn(v.co, v.normal), 1.0)
    me.color_attributes.active_color = attr


def _scale(hexcol, k):
    return tuple(min(1.0, c * k) for c in srgb(hexcol))


def fabric_colours(parts):
    def velvet(co, n):
        a = math.atan2(co.x, -co.y)
        facing = max(0.0, -n.y) ** 2                         # velvet sheen where the cloth faces the viewer
        rim = 1 - abs(n.y)                                   # and darker where it turns away
        crushed = 0.5 + 0.5 * math.sin(a * 17 + co.z * 55) * math.sin(a * 6 - co.z * 31)
        k = 0.78 + 0.42 * facing - 0.22 * rim + 0.16 * crushed
        return _scale(TOP, k)
    _vcol(parts['Top'], velvet)
    _vcol(parts['Sleeves'], velvet)

    def pleats(co, n):
        a = math.atan2(co.x, -co.y) % (2 * math.pi)
        ph = (a * 88 / (2 * math.pi)) % 4                    # 22 pleats x 4 verts (see build_skirt)
        fold = 0.5 + 0.5 * math.cos(ph * math.pi / 2)        # 1 on the outer crease, 0 in the valley
        hem = _sm01((0.76 - co.z) / 0.03)
        k = 0.65 + 0.7 * fold + 0.35 * hem
        return _scale(BLACK, k)
    _vcol(parts['Skirt'], pleats)

    def knit(co, n):
        a = math.atan2(co.x - math.copysign(0.09, co.x), -co.y)
        rib = 0.5 + 0.5 * math.cos(a * 16)
        fold = 0.5 + 0.5 * math.sin(co.z * 70 + 0.6 * math.sin(co.z * 23))
        k = 0.7 + 0.35 * rib + 0.35 * fold
        return _scale('#202024', k)
    _vcol(parts['LegWarmers'], knit)
