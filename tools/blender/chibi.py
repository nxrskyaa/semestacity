# Chibi "Roblox R15 hybrid" doll body, designed directly in final game space (1.65 m with hair).
# Proportion spec (fractions of height H): chin 0.68, sweetheart neckline 0.58, waist/belt 0.45,
# skirt hem 0.34, leg-warmer top 0.28, ground 0. Head (chin->crown) ~0.30 H, hair adds the rest.
# The head, face decal and hair are still authored in the old head space of base_body.py
# (HEAD_C=1.437, HEAD_R=0.185) and then moved onto this body with place_head().
#   exec(open(os.path.join(ROOT, 'tools', 'blender', 'chibi.py')).read())
import os
ROOT = globals().get('SEMESTA_ROOT') or os.getcwd()   # repo root (set SEMESTA_ROOT before exec in Blender)
import math
import bpy
import bmesh
from mathutils import Vector, Matrix

H = 1.65
CHIN_Z = 0.664 * H                    # 1.096: short doll neck, choker right under the chin
NECK_PIVOT_OLD = Vector((0, 0.012, 1.33))

# torso sections (z, y_centre, half_width, half_depth) — final space
CHIBI_TORSO = [(0.632, .01, .03, .025), (0.645, .01, .075, .058), (0.672, .012, .118, .08), (0.70, .012, .128, .086),
               (0.745, .008, .11, .077), (0.80, .003, .107, .074), (0.86, -.006, .117, .085), (0.93, -.004, .124, .08),
               (0.992, .004, .13, .068), (1.022, .008, .1, .058), (1.045, .01, .062, .052), (1.07, .012, .05, .05),
               (1.12, .012, .049, .049), (1.2, .012, .046, .046)]
CHIBI_LEG = [((.05, .012, .72), .03), ((.068, .012, .69), .06), ((.076, .01, .64), .072), ((.08, .006, .56), .07),
             ((.083, .004, .47), .062), ((.085, .004, .40), .056), ((.086, .008, .32), .056), ((.087, .01, .22), .05),
             ((.088, .012, .13), .044), ((.088, .012, .08), .04), ((.088, .012, .06), .04)]
SHOULDER = Vector((.128, .01, 1.003))
ELBOW = Vector((.19, .018, .842))
WRIST = Vector((.245, .004, .672))


def _box(bm, centre, size, rot=Matrix.Identity(3)):
    res = bmesh.ops.create_cube(bm, size=1.0)
    vs = res['verts']
    for v in vs:
        v.co = rot @ Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])) + Vector(centre)
    return vs


def _arm_frame(s):
    """Rotation whose local Z runs down the forearm (wrist direction) for side s."""
    sh, el, wr = [Vector((s * p.x, p.y, p.z)) for p in (SHOULDER, ELBOW, WRIST)]
    d = (wr - el).normalized()
    return Vector((0, 0, -1)).rotation_difference(d).to_matrix(), wr, d


def build_chibi_body(target_quads=4400):
    _replace('Body')
    bm = bmesh.new()
    loft(bm, [((0, y, z), rx, ry) for z, y, rx, ry in CHIBI_TORSO], seg=4, ring=32)
    for s in (1, -1):
        loft(bm, [((s * p[0], p[1], p[2]), r, r) for p, r in CHIBI_LEG], ring=28)
        F = [((.088, .03, .03), .02, .02), ((.088, .02, .04), .04, .036), ((.088, -.02, .04), .045, .036),
             ((.089, -.07, .032), .038, .026), ((.089, -.09, .03), .02, .015), ((.089, -.096, .03), .004, .003)]
        loft(bm, [((s * p[0], p[1], p[2]), rx, ry) for p, rx, ry in F])
        sh, el, wr = [Vector((s * p.x, p.y, p.z)) for p in (SHOULDER, ELBOW, WRIST)]
        loft(bm, [(Vector((s * .05, .008, 1.013)), .035, .035), (sh, .05, .05), (sh.lerp(el, .5), .044, .044),
                  (el, .038, .038), (el.lerp(wr, .5), .035, .034), (wr, .03, .029), (wr + (wr - el).normalized() * .01, .029, .028)],
             ref=(0, 1, 0))
        # Roblox C-grip hand: palm block, curled-finger block (leaves the C gap facing forward), thumb block
        R, w, d = _arm_frame(s)
        side = Vector((s, 0, 0))
        _box(bm, w + d * 0.045, (0.040, 0.060, 0.065), R)                                  # palm
        _box(bm, w + d * 0.088 + Vector((0, -0.012, 0)), (0.036, 0.040, 0.026), R)         # fingertips curl under
        _box(bm, w + d * 0.04 + Vector((-s * 0.012, -0.032, 0)), (0.024, 0.022, 0.034), R)  # thumb toward the front
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
    s2.iterations = 4
    apply_modifiers(ob)
    _activate(ob)
    bpy.ops.object.quadriflow_remesh(target_faces=target_quads, use_mesh_symmetry=True, use_preserve_sharp=False,
                                     use_preserve_boundary=False, smooth_normals=False, seed=1)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def chibi_bone_table(head_T):
    """head_T maps old-head-space points to final space (for the head + tail bones)."""
    T = {
        'hips': ((0, .012, .66), (0, .008, .745), None),
        'spine': ((0, .008, .745), (0, .0, .86), 'hips'),
        'chest': ((0, .0, .86), (0, .008, 1.02), 'spine'),
        'neck': ((0, .012, 1.04), tuple(head_T(NECK_PIVOT_OLD)), 'chest'),
        'head': (tuple(head_T(NECK_PIVOT_OLD)), tuple(head_T(Vector((0, .012, 1.60)))), 'neck'),
    }
    for sd, s in (('L', 1), ('R', -1)):
        sh, el, wr = [(s * p.x, p.y, p.z) for p in (SHOULDER, ELBOW, WRIST)]
        _, w, d = _arm_frame(s)
        T['shoulder_' + sd] = ((s * .02, .008, 1.008), sh, 'chest')
        T['upperArm_' + sd] = (sh, el, 'shoulder_' + sd)
        T['lowerArm_' + sd] = (el, wr, 'upperArm_' + sd)
        T['hand_' + sd] = (wr, tuple(w + d * 0.1), 'lowerArm_' + sd)
        T['upperLeg_' + sd] = ((s * .076, .01, .66), (s * .085, .004, .40), 'hips')
        T['lowerLeg_' + sd] = ((s * .085, .004, .40), (s * .088, .012, .07), 'upperLeg_' + sd)
        T['foot_' + sd] = ((s * .088, .012, .07), (s * .089, -.05, .025), 'lowerLeg_' + sd)
        T['toes_' + sd] = ((s * .089, -.05, .025), (s * .089, -.095, .022), 'foot_' + sd)
    return T


def build_armature_from(T, name='Rig'):
    _replace(name)
    arm = bpy.data.armatures.new(name)
    ob = _link(name, arm)
    arm.display_type = 'STICK'
    ob.show_in_front = True
    _activate(ob)
    bpy.ops.object.mode_set(mode='EDIT')
    for bname, (h, t, parent) in T.items():
        eb = arm.edit_bones.new(bname)
        eb.head, eb.tail = Vector(h), Vector(t)
    for bname, (h, t, parent) in T.items():
        if parent:
            eb = arm.edit_bones[bname]
            eb.parent = arm.edit_bones[parent]
            eb.use_connect = (Vector(arm.edit_bones[parent].tail) - eb.head).length < 1e-4
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def head_transform(old_chin, old_top, new_chin=CHIN_Z, new_top=H):
    """Uniform scale of the old head space so its chin lands on new_chin and the hair top on new_top."""
    k = (new_top - new_chin) / (old_top - old_chin)
    yc = NECK_PIVOT_OLD.y

    def T(p):
        return Vector((p.x * k, yc + (p.y - yc) * k, new_chin + (p.z - old_chin) * k))
    return T, k


def place_head(objs, T):
    for ob in objs:
        for v in ob.data.vertices:
            v.co = T(v.co)
        ob.data.update()
