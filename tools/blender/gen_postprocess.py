# Post-process for generated character meshes (same steps for every cast member):
#   merge UV-seam duplicates -> scale/ground -> chibi proportions (head ~34% of 1.65 m) -> rig -> weights -> export.
#   exec(open(os.path.join(ROOT, 'tools', 'blender', 'gen_postprocess.py')).read())
#   prep(name, raw_height)            # seams + scale to raw_height, grounded, transforms applied
#   profile(name)                     # prints slice widths to find the neck height
#   retarget(name, neck_z, ...)       # head x head_k about the neck, body stretched so the total is 1.65 m
#   rig(name, rig_name, joints)       # 21-bone chibi armature fitted from a few measured joints + auto weights
#   hem_to_hips(name, rig, z0, z1)    # garment hems/skirts follow the hips instead of tearing with the legs
#   export(name, rig, glb)            # selection export to public/models
import os
ROOT = globals().get('SEMESTA_ROOT') or os.getcwd()   # repo root (set SEMESTA_ROOT before exec in Blender)
import math
import bpy
import bmesh
from mathutils import Vector

exec(open(os.path.join(ROOT, 'tools', 'blender', 'base_body.py')).read(), globals())
exec(open(os.path.join(ROOT, 'tools', 'blender', 'chibi.py')).read(), globals())

TARGET_H = 1.65


def _sm(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def prep(name, raw_height=1.7):
    o = bpy.data.objects[name]
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0005)
    bm.to_mesh(o.data)
    bm.free()
    zs = [v.co.z for v in o.data.vertices]
    s = raw_height / (max(zs) - min(zs))
    o.scale = (s, s, s)
    bpy.context.view_layer.update()
    o.location.z -= min((o.matrix_world @ v.co).z for v in o.data.vertices)
    _activate(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def profile(name, step=0.03):
    V = [v.co for v in bpy.data.objects[name].data.vertices]
    top = max(v.z for v in V)
    z = 0.0
    while z < top:
        sl = [v for v in V if z <= v.z < z + step]
        if sl:
            core = [v for v in sl if abs(v.x) < 0.2]
            cx = (min(v.x for v in core), max(v.x for v in core)) if core else (0, 0)
            print(round(z, 2), 'all x', round(min(v.x for v in sl), 3), round(max(v.x for v in sl), 3),
                  'core x', round(cx[0], 3), round(cx[1], 3), 'y', round(min(v.y for v in sl), 3), round(max(v.y for v in sl), 3))
        z += step


def retarget(name, neck_z, neck_y=0.0, head_frac=0.34, foot_z=0.08, xy_k=1.07):
    """Head (above neck_z) scaled about the neck so it is head_frac of TARGET_H; body above foot_z stretched to fit."""
    o = bpy.data.objects[name]
    top = max(v.co.z for v in o.data.vertices)
    head_h = top - neck_z
    kh = head_frac * TARGET_H / head_h
    new_neck = TARGET_H - head_h * kh
    kz = (new_neck - foot_z) / (neck_z - foot_z)
    for v in o.data.vertices:
        p = v.co.copy()
        b = p.copy()
        if p.z > foot_z:
            b.z = foot_z + (p.z - foot_z) * kz
        w = _sm((p.z - foot_z + 0.02) / 0.06)
        b.x = p.x * (1 + (xy_k - 1) * w)
        b.y = p.y * (1 + (xy_k - 1) * w)
        h = Vector((0, neck_y, new_neck)) + (p - Vector((0, neck_y, neck_z))) * kh
        t = _sm((p.z - (neck_z - 0.02)) / 0.04)
        v.co = b.lerp(h, t)
    o.data.update()
    return new_neck, kh, kz


def rig(name, rig_name, neck=1.08, shoulder=(0.19, 1.0), elbow=(0.28, 0.80), wrist=(0.35, 0.62), hand_end=(0.38, 0.48),
        hip=(0.11, 0.55), knee=0.31, ankle=0.08, toe_y=-0.2, y=0.0, head_top=1.55):
    sx, sz = shoulder
    T = {'hips': ((0, y, hip[1]), (0, y, hip[1] + 0.14), None),
         'spine': ((0, y, hip[1] + 0.14), (0, y, (hip[1] + neck) / 2 + 0.05), 'hips'),
         'chest': ((0, y, (hip[1] + neck) / 2 + 0.05), (0, y, neck - 0.04), 'spine'),
         'neck': ((0, y, neck - 0.04), (0, y, neck + 0.02), 'chest'),
         'head': ((0, y, neck + 0.02), (0, y + 0.03, head_top), 'neck')}
    for sd, s in (('L', 1), ('R', -1)):
        T['shoulder_' + sd] = ((s * 0.05, y, sz), (s * sx, y, sz), 'chest')
        T['upperArm_' + sd] = ((s * sx, y, sz), (s * elbow[0], y, elbow[1]), 'shoulder_' + sd)
        T['lowerArm_' + sd] = ((s * elbow[0], y, elbow[1]), (s * wrist[0], y, wrist[1]), 'upperArm_' + sd)
        T['hand_' + sd] = ((s * wrist[0], y, wrist[1]), (s * hand_end[0], y, hand_end[1]), 'lowerArm_' + sd)
        T['upperLeg_' + sd] = ((s * hip[0], y, hip[1]), (s * hip[0], y, knee), 'hips')
        T['lowerLeg_' + sd] = ((s * hip[0], y, knee), (s * hip[0], y, ankle), 'upperLeg_' + sd)
        T['foot_' + sd] = ((s * hip[0], y, ankle), (s * hip[0], y + toe_y * 0.6, 0.03), 'lowerLeg_' + sd)
        T['toes_' + sd] = ((s * hip[0], y + toe_y * 0.6, 0.03), (s * hip[0], y + toe_y, 0.03), 'foot_' + sd)
    r = build_armature_from(T, name=rig_name)
    o = bpy.data.objects[name]
    o.vertex_groups.clear()
    for m in [m for m in o.modifiers if m.type == 'ARMATURE']:
        o.modifiers.remove(m)
    _activate(r, [o])
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    print('unweighted', sum(1 for v in o.data.vertices if not v.groups))
    return r


def hem_to_hips(name, z0, z1, leg_x=0.11, leg_r=0.1, max_leg=0.3, max_x=0.26):
    """Verts between z0..z1 that are not on a leg core follow mostly the hips (skirts, jacket hems, onesie belly)."""
    o = bpy.data.objects[name]
    G = {g.name: g for g in o.vertex_groups}
    n = 0
    for v in o.data.vertices:
        x, y, z = v.co
        if not (z0 < z < z1) or abs(x) > max_x:      # max_x keeps the hands (same height) out
            continue
        if min(math.hypot(x - s * leg_x, y) for s in (1, -1)) < leg_r:
            continue
        t = _sm((z1 - z) / (z1 - z0))
        legw = max_leg * t
        side = _sm((x + 0.06) / 0.12)
        for g in G.values():
            g.remove([v.index])
        G['hips'].add([v.index], 1 - legw, 'REPLACE')
        if legw * side > 1e-3:
            G['upperLeg_L'].add([v.index], legw * side, 'REPLACE')
        if legw * (1 - side) > 1e-3:
            G['upperLeg_R'].add([v.index], legw * (1 - side), 'REPLACE')
        n += 1
    return n


def test_pose(rig_name, on=True):
    pb = bpy.data.objects[rig_name].pose.bones
    for b in pb:
        b.rotation_mode = 'XYZ'
        b.rotation_euler = (0, 0, 0)
    if on:
        pb['upperArm_L'].rotation_euler = (math.radians(-50), 0, 0)
        pb['upperArm_R'].rotation_euler = (math.radians(35), 0, 0)
        pb['upperLeg_L'].rotation_euler = (math.radians(-30), 0, 0)
        pb['lowerLeg_L'].rotation_euler = (math.radians(45), 0, 0)
        pb['head'].rotation_euler = (0, 0, math.radians(25))
    bpy.context.view_layer.update()


def finalize(mesh, rig_name, slug):
    """Pack images, save art/<slug>.blend, export public/models/<slug>.glb, hide the character."""
    import os
    test_pose(rig_name, False)
    for im in bpy.data.images:
        if im.has_data and not im.packed_file and im.users:
            try:
                im.pack()
            except Exception:
                pass
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'art', f'{slug}.blend'), compress=True)
    export([mesh], rig_name, os.path.join(ROOT, 'public', 'models', f'{slug}.glb'))
    for n in (mesh, rig_name):
        o = bpy.data.objects[n]
        o.hide_set(True)
        o.hide_render = True
    return os.path.getsize(os.path.join(ROOT, 'public', 'models', f'{slug}.glb'))


def ortho_pair(prefix='g'):
    """Front + side ortho renders (1.8 m, 900 px, centre z 0.825) for tools/blender/grid_overlay.py."""
    import os
    sc = bpy.context.scene
    co = bpy.data.objects['PrevCam']
    co.data.type = 'ORTHO'
    co.data.ortho_scale = 1.8
    sc.render.resolution_x = sc.render.resolution_y = 900
    for n, d in (('front', (0, -1, 0)), ('side', (1, 0, 0))):
        dv = Vector(d)
        co.location = Vector((0, 0, 0.825)) + dv * 4
        co.rotation_euler = (-dv).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(os.path.join(ROOT, 'tools', 'blender', 'renders'), f'{prefix}_{n}.png')
        bpy.ops.render.render(write_still=True)


def export(objs, rig_name, glb):
    test_pose(rig_name, False)
    r = bpy.data.objects[rig_name]
    for x in bpy.context.view_layer.objects:
        x.select_set(False)
    for x in [r] + [bpy.data.objects[n] for n in objs]:
        x.hide_set(False)
        x.select_set(True)
    bpy.context.view_layer.objects.active = r
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=False, export_skins=True, export_animations=False)
