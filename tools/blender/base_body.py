# Base anime body for Semesta City characters (Blender 5.2, run through the Blender MCP).
#   exec(open(os.path.join(ROOT, 'tools', 'blender', 'base_body.py')).read()); build_base('female')
# Blender space: Z up, metres, character faces -Y (glTF export turns this into Y up / faces +Z).
# Height ~1.62 m without hair; head ~1/5 of height (anime, round face, soft small chin).
import os
ROOT = globals().get('SEMESTA_ROOT') or os.getcwd()   # repo root (set SEMESTA_ROOT before exec in Blender)
import math
import bpy
import bmesh
from mathutils import Vector


# ---------------------------------------------------------------- helpers
def _cr(p0, p1, p2, p3, t):
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)


def loft(bm, pts, ref=(1, 0, 0), seg=4, ring=24, uv=None):
    """Closed tube through pts = [((x,y,z), rx, ry)], Catmull-Rom smoothed. rx lies along ref.
    uv=(u_repeat, v_scale): UVs with u around the tube and v along it (for strand textures)."""
    P = [(Vector(p), rx, ry) for p, rx, ry in pts]
    n = len(P)
    g = lambda j: P[max(0, min(n - 1, j))]
    S = []
    for i in range(n - 1):
        for k in range(seg):
            t = k / seg
            a, b, c, d = g(i - 1), g(i), g(i + 1), g(i + 2)
            r = _cr(*(Vector((q[1], q[2], 0)) for q in (a, b, c, d)), t)
            S.append((_cr(a[0], b[0], c[0], d[0], t), max(r.x, 0.001), max(r.y, 0.001)))
    S.append(P[-1])
    refv = Vector(ref).normalized()
    rings = []
    for i, (pos, rx, ry) in enumerate(S):
        tn = (S[min(i + 1, len(S) - 1)][0] - S[max(i - 1, 0)][0]).normalized()
        A = (refv - tn * refv.dot(tn)).normalized()
        B = tn.cross(A)
        rings.append([bm.verts.new(pos + A * math.cos(2 * math.pi * j / ring) * rx + B * math.sin(2 * math.pi * j / ring) * ry)
                      for j in range(ring)])
    uvl = (bm.loops.layers.uv.get('UVMap') or bm.loops.layers.uv.new('UVMap')) if uv else None
    nr = len(rings)
    for ri, (r0, r1) in enumerate(zip(rings, rings[1:])):
        for j in range(ring):
            f = bm.faces.new((r0[j], r0[(j + 1) % ring], r1[(j + 1) % ring], r1[j]))
            if uvl:
                for l, (du, dv) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                    l[uvl].uv = ((j + du) / ring * uv[0], (ri + dv) / (nr - 1) * uv[1])
    for rg, rev in ((rings[0], True), (rings[-1], False)):
        c = bm.verts.new(sum((v.co for v in rg), Vector()) / len(rg))
        for j in range(ring):
            a, b = rg[j], rg[(j + 1) % ring]
            bm.faces.new((b, a, c) if rev else (a, b, c))


def _sm(a, b, x):
    t = min(1, max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def material(name, hexcol, rough=0.6):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*srgb(hexcol), 1)
    b.inputs['Roughness'].default_value = rough
    return m


def apply_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)


def _replace(name):
    o = bpy.data.objects.get(name)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)


def _activate(ob, others=()):
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in (*others, ob):
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = ob


def _link(name, me):
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ---------------------------------------------------------------- body
# torso sections: (z, y_centre, half_width, half_depth)
TORSO = {
    'female': [(0.775, .012, .03, .025), (0.79, .012, .075, .058), (0.82, .014, .118, .082), (0.865, .015, .133, .089),
               (0.92, .012, .12, .082), (0.97, .006, .1, .071), (1.02, .003, .086, .065), (1.08, -.003, .094, .07),
               (1.14, -.008, .102, .079), (1.19, -.002, .106, .072), (1.225, .006, .098, .058), (1.248, .01, .06, .045),
               (1.27, .012, .036, .036), (1.33, .012, .033, .033), (1.37, .012, .032, .032)],
    'male':   [(0.775, .012, .03, .025), (0.79, .012, .075, .058), (0.82, .012, .112, .078), (0.865, .012, .118, .08),
               (0.92, .01, .112, .076), (0.97, .006, .106, .072), (1.02, .003, .108, .072), (1.08, -.002, .118, .078),
               (1.14, -.004, .128, .082), (1.19, -.001, .132, .076), (1.225, .006, .12, .062), (1.248, .01, .07, .05),
               (1.27, .012, .042, .042), (1.33, .012, .039, .039), (1.37, .012, .038, .038)],
}
SHOULDER_X = {'female': 0.12, 'male': 0.145}
ARM_K = {'female': 1.25, 'male': 1.4}      # sturdier doll limbs to balance the big chibi head
LEG_K = {'female': 1.15, 'male': 1.2}
BODY_KIND = 'female'


def build_body(kind='female', target_quads=4200):
    _replace('Body')
    bm = bmesh.new()
    loft(bm, [((0, y, z), rx, ry) for z, y, rx, ry in TORSO[kind]], seg=4, ring=32)
    sx0 = SHOULDER_X[kind]
    ak, lk = ARM_K[kind], LEG_K[kind]
    for s in (1, -1):
        L = [((.045, .012, .95), .02, .02), ((.068, .012, .90), .05, .05), ((.08, .01, .835), .064, .064),
             ((.083, .006, .74), .063, .063), ((.085, .003, .64), .056, .056), ((.087, 0, .55), .048, .048),
             ((.088, 0, .48), .041, .043), ((.089, .006, .41), .043, .046), ((.09, .01, .33), .043, .045),
             ((.09, .012, .24), .034, .035), ((.091, .012, .15), .027, .028), ((.091, .012, .09), .024, .025),
             ((.091, .012, .05), .024, .025)]
        loft(bm, [((s * p[0], p[1], p[2]), rx * lk, ry * lk) for p, rx, ry in L], ring=28)
        Fo = [((.091, .035, .03), .012, .012), ((.091, .028, .032), .026, .026), ((.091, .005, .034), .032, .03),
              ((.092, -.04, .03), .034, .026), ((.093, -.085, .024), .029, .018), ((.094, -.108, .022), .016, .01),
              ((.094, -.114, .022), .004, .003)]
        loft(bm, [((s * p[0], p[1], p[2]), rx * lk, ry * lk) for p, rx, ry in Fo])
        dx = sx0 - 0.12
        A = [((.04, .008, 1.235), .03, .03), ((.12 + dx, .01, 1.222), .04, .04), ((.165 + dx, .013, 1.175), .035, .035),
             ((.215 + dx, .016, 1.115), .031, .031), ((.27 + dx, .02, 1.055), .026, .026), ((.32 + dx, .014, .98), .026, .025),
             ((.355 + dx, .006, .93), .022, .021), ((.376 + dx, 0, .897), .018, .016)]
        loft(bm, [((s * p[0], p[1], p[2]), rx * ak, ry * ak) for p, rx, ry in A], ref=(0, 1, 0))
        H = [((.37, 0, .905), .017, .012), ((.382, -.002, .88), .024, .012), ((.395, -.004, .855), .028, .013),
             ((.412, -.005, .825), .028, .012), ((.428, -.006, .795), .022, .01), ((.436, -.006, .778), .013, .007),
             ((.439, -.006, .772), .003, .002)]
        loft(bm, [((s * (p[0] + dx), p[1], p[2]), rx * ak, ry * ak) for p, rx, ry in H], ref=(0, 1, 0))
        Th = [((.378, -.008, .885), .009, .009), ((.384, -.022, .868), .009, .009), ((.392, -.03, .848), .008, .008),
              ((.395, -.032, .842), .002, .002)]
        loft(bm, [((s * (p[0] + dx), p[1], p[2]), rx * ak, ry * ak) for p, rx, ry in Th], ref=(0, 1, 0), seg=3)
    me = bpy.data.meshes.new('Body')
    bm.to_mesh(me)
    bm.free()
    ob = _link('Body', me)
    r = ob.modifiers.new('Remesh', 'REMESH')
    r.mode = 'VOXEL'
    r.voxel_size = 0.005
    sm = ob.modifiers.new('Smooth', 'LAPLACIANSMOOTH')
    sm.iterations = 6
    sm.lambda_factor = 0.5
    s2 = ob.modifiers.new('Smooth2', 'SMOOTH')
    s2.factor = 0.5
    s2.iterations = 6
    apply_modifiers(ob)
    # clean quad topology
    _activate(ob)
    if True:
        bpy.ops.object.quadriflow_remesh(target_faces=target_quads, use_mesh_symmetry=True, use_preserve_sharp=False,
                                         use_preserve_boundary=False, smooth_normals=False, seed=1)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


# ---------------------------------------------------------------- head
HEAD_C = Vector((0, 0, 1.437))
HEAD_R = 0.185
NOSE_Z = 1.347


def build_head(cuts=11):
    _replace('Head')
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co.normalized()
        # doll head: wide and round, slightly squat cranium (Roblox-anime look)
        X, Y, Z = x * 0.88, y * 0.97, z * (0.97 if z > 0 else 1.0)
        low = _sm(0.0, -1.0, z)
        back = _sm(-0.2, 0.8, y)
        front = _sm(0.0, -0.8, y)
        X *= 1 - 0.11 * low ** 2.4                       # soft jaw taper -> plump cheeks, small round chin
        cheek = math.exp(-((z + 0.38) / 0.24) ** 2) * _sm(0.15, -0.6, y)
        X *= 1 + 0.09 * cheek                            # cheek puff
        Y -= 0.02 * cheek * front
        if z < 0:
            Y = Y * (1 - 0.30 * low * back)              # back of the jaw tucks toward the neck
            Z = Z * (1 - 0.32 * low) + 0.05 * low * back     # short, wide lower face (chubby doll)
            Y -= 0.025 * low * front                     # chin sits under the face plane
        if z > -0.2 and y > 0:
            Y *= 1 + 0.06 * _sm(-0.2, 0.6, z)            # fuller cranium
        if y < 0:
            Y *= 1 - 0.10 * front * (1 - low)            # flatter anime face plane
        p = Vector((X, Y, Z)) * HEAD_R + HEAD_C
        if p.y < HEAD_C.y:                               # tiny doll nose bump
            p.y -= 0.0045 * math.exp(-(p.x / 0.011) ** 2 - ((p.z - NOSE_Z) / 0.012) ** 2)
        v.co = p
    me = bpy.data.meshes.new('Head')
    bm.to_mesh(me)
    bm.free()
    ob = _link('Head', me)
    s = ob.modifiers.new('Sub', 'SUBSURF')
    s.levels = 1
    apply_modifiers(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


# ---------------------------------------------------------------- face decal
FACE_BOUNDS = (-0.13, 0.13, 1.30, 1.56)


def build_face(head, n=48):
    _replace('Face')
    X0, X1, Z0, Z1 = FACE_BOUNDS
    bm = bmesh.new()
    vs = [[bm.verts.new((X0 + (X1 - X0) * i / n, -0.4, Z0 + (Z1 - Z0) * j / n)) for i in range(n + 1)] for j in range(n + 1)]
    uvl = bm.loops.layers.uv.new('UVMap')
    for j in range(n):
        for i in range(n):
            f = bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
            for l in f.loops:
                l[uvl].uv = ((l.vert.co.x - X0) / (X1 - X0), (l.vert.co.z - Z0) / (Z1 - Z0))
    me = bpy.data.meshes.new('Face')
    bm.to_mesh(me)
    bm.free()
    ob = _link('Face', me)
    sw = ob.modifiers.new('SW', 'SHRINKWRAP')
    sw.wrap_method = 'PROJECT'
    sw.use_project_y = True
    sw.use_positive_direction = True
    sw.use_negative_direction = False
    sw.target = head
    sw.offset = 0.0012
    apply_modifiers(ob)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -0.3], context='VERTS')
    bm.to_mesh(ob.data)
    bm.free()
    d = ob.modifiers.new('Dec', 'DECIMATE')
    d.decimate_type = 'DISSOLVE'
    d.angle_limit = 0.035
    apply_modifiers(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def face_material(img, name='FaceDecal'):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Roughness'].default_value = 0.35
    tex = next((n for n in nt.nodes if n.type == 'TEX_IMAGE'), None) or nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(tex.outputs['Alpha'], b.inputs['Alpha'])
    try:
        m.surface_render_method = 'BLENDED'
    except Exception:
        pass
    m.use_backface_culling = True
    return m


# ---------------------------------------------------------------- armature
# Bone names avoid '.' because three.js strips it from node names.
def bone_table(kind='female'):
    dx = SHOULDER_X[kind] - 0.12
    T = {
        'hips': ((0, .012, .86), (0, .008, .97), None),
        'spine': ((0, .008, .97), (0, .0, 1.08), 'hips'),
        'chest': ((0, .0, 1.08), (0, .008, 1.235), 'spine'),
        'neck': ((0, .012, 1.25), (0, .012, 1.33), 'chest'),
        'head': ((0, .012, 1.33), (0, .012, 1.60), 'neck'),
    }
    for s, sf in (('L', 1), ('R', -1)):
        T['shoulder_' + s] = ((sf * .02, .008, 1.215), (sf * (.115 + dx), .01, 1.222), 'chest')
        T['upperArm_' + s] = ((sf * (.115 + dx), .01, 1.222), (sf * (.27 + dx), .02, 1.055), 'shoulder_' + s)
        T['lowerArm_' + s] = ((sf * (.27 + dx), .02, 1.055), (sf * (.376 + dx), 0, .897), 'upperArm_' + s)
        T['hand_' + s] = ((sf * (.376 + dx), 0, .897), (sf * (.436 + dx), -.006, .778), 'lowerArm_' + s)
        T['upperLeg_' + s] = ((sf * .082, .01, .84), (sf * .088, .0, .48), 'hips')
        T['lowerLeg_' + s] = ((sf * .088, .0, .48), (sf * .091, .012, .075), 'upperLeg_' + s)
        T['foot_' + s] = ((sf * .091, .012, .075), (sf * .093, -.06, .026), 'lowerLeg_' + s)
        T['toes_' + s] = ((sf * .093, -.06, .026), (sf * .094, -.112, .022), 'foot_' + s)
    return T


def build_armature(kind='female', name='Rig'):
    _replace(name)
    arm = bpy.data.armatures.new(name)
    ob = _link(name, arm)
    arm.display_type = 'STICK'
    ob.show_in_front = True
    _activate(ob)
    if True:
        bpy.ops.object.mode_set(mode='EDIT')
        T = bone_table(kind)
        for bname, (h, t, parent) in T.items():
            eb = arm.edit_bones.new(bname)
            eb.head, eb.tail = Vector(h), Vector(t)
            eb.roll = 0
        for bname, (h, t, parent) in T.items():
            if parent:
                eb = arm.edit_bones[bname]
                eb.parent = arm.edit_bones[parent]
                eb.use_connect = (Vector(arm.edit_bones[parent].tail) - eb.head).length < 1e-4
        bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def skin_to(rig, body, rigid=()):
    """Automatic weights for body; objects in rigid are bound 100% to the 'head' bone."""
    _activate(rig, [body])
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    for ob in rigid:
        ob.parent = rig
        ob.vertex_groups.clear()
        vg = ob.vertex_groups.new(name='head')
        vg.add(range(len(ob.data.vertices)), 1.0, 'REPLACE')
        m = ob.modifiers.new('Armature', 'ARMATURE')
        m.object = rig


def build_base(kind='female', face_params=None):
    exec(open(os.path.join(ROOT, 'tools', 'blender', 'face_tex.py')).read(), globals())
    global BODY_KIND
    BODY_KIND = kind
    body = build_body(kind)
    head = build_head()
    face = build_face(head)
    skin = material('Skin', '#f9d8c6', 0.55)
    for o in (body, head):
        o.data.materials.clear()
        o.data.materials.append(skin)
    old = bpy.data.images.get('Face_base')
    if old:
        bpy.data.images.remove(old)
    face.data.materials.clear()
    face.data.materials.append(face_material(paint_face('Face_base', face_params)))
    rig = build_armature(kind)
    skin_to(rig, body, rigid=(head, face))
    return rig, body, head, face
