# Paints an anime face decal texture (eyes, lashes, brows, mouth, blush) with numpy.
# Run inside Blender: exec(open(os.path.join(ROOT, 'tools', 'blender', 'face_tex.py')).read()); paint_face('Face_littlechip', {...})
# Texture space maps the 'Face' decal grid: u -> x in [X0, X1], v -> z in [Z0, Z1] (metres, Blender Z-up, face looks -Y).
import os
ROOT = globals().get('SEMESTA_ROOT') or os.getcwd()   # repo root (set SEMESTA_ROOT before exec in Blender)
import numpy as np
import bpy

FACE_BOUNDS = (-0.13, 0.13, 1.30, 1.56)

DEFAULT = dict(
    eye_cx=0.053, eye_cz=1.418, eye_k=1.22,
    iris_top='#121016', iris_bot='#55505e', iris_ring='#0b0a0e', pupil='#050407', iris_glint='#a49cad',
    sclera='#fbf7f5', lash='#1a1216', lash_tip='#8a2f36', brow='#8a7466', mouth='#9a4a50',
    blush='#ff8f8f', blush_a=0.42, nose='#d99a8c', crease='#c79a8e',
    heterochromia=None,   # e.g. ('#2bb3a8', '#3fae5a') -> (viewer-left eye, viewer-right eye) iris_bot colours
    lid_slope=0.004, wing=1.0, eyeshadow=0.0, eyeshadow_col='#d98f6e', lash_w=1.0, lower_full=0,
    open_top=0.034, open_bot=0.027, open_w=0.036, iris_rx=0.025, iris_rz=0.031,
    mouth_z=1.341, nose_z=1.3725, mouth_w=0.009, mouth_curve=0.0016, crease_a=0.55, hl_scale=1.0, iris_detail=0.0, lid_p=2.0, bang_shadow=0.0, bang_z=1.468, lash_flicks=0, lower_liner=0.8, under_eye=0.0, blush_x=0.082, blush_z=1.374, blush_rx=0.024, blush_rz=0.011,
)


def _rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


class Canvas:
    def __init__(self, size=1024):
        self.n = size
        x0, x1, z0, z1 = FACE_BOUNDS
        u = (np.arange(size) + 0.5) / size
        self.X, self.Z = np.meshgrid(x0 + (x1 - x0) * u, z0 + (z1 - z0) * u)
        self.px = (x1 - x0) / size
        self.rgb = np.zeros((size, size, 3), np.float32)
        self.a = np.zeros((size, size), np.float32)

    def over(self, color, cov):
        cov = np.clip(cov, 0, 1)
        c = color if isinstance(color, np.ndarray) and color.ndim == 3 else np.broadcast_to(color, self.rgb.shape)
        na = cov + self.a * (1 - cov)
        w = np.where(na > 1e-6, cov / np.maximum(na, 1e-6), 0)[..., None]
        self.rgb = self.rgb * (1 - w) + c * w
        self.a = na

    def aa(self, sd):
        # signed distance (negative inside) -> antialiased coverage
        return np.clip(0.5 - sd / (self.px * 1.2), 0, 1)

    def stroke(self, pts, widths):
        """Coverage of a polyline with per-point widths (metres)."""
        best = np.full(self.X.shape, 1e9, np.float32)
        for (ax, az), (bx, bz), wa, wb in zip(pts, pts[1:], widths, widths[1:]):
            dx, dz = bx - ax, bz - az
            L2 = dx * dx + dz * dz + 1e-12
            t = np.clip(((self.X - ax) * dx + (self.Z - az) * dz) / L2, 0, 1)
            d = np.hypot(self.X - (ax + t * dx), self.Z - (az + t * dz)) - (wa + (wb - wa) * t) / 2
            best = np.minimum(best, d)
        return self.aa(best)


def paint_face(name, params=None, size=1024):
    p = dict(DEFAULT, **(params or {}))
    cv = Canvas(size)
    X, Z = cv.X, cv.Z
    # soft shadow the bangs cast on the forehead
    if p['bang_shadow']:
        side = np.clip((0.118 - np.abs(X)) / 0.03, 0, 1)            # fade out before the decal edge
        cv.over(_rgb(p['crease']), p['bang_shadow'] * side * np.clip((Z - (p['bang_z'] - 0.03)) / 0.03, 0, 1))
    # blush first (under everything)
    for s in (1, -1):
        d = ((X - s * p['blush_x']) / p['blush_rx']) ** 2 + ((Z - p['blush_z']) / p['blush_rz']) ** 2
        cv.over(_rgb(p['blush']), p['blush_a'] * np.exp(-d * 1.6))
    for s in (1, -1):
        cx, cz, k = s * p['eye_cx'], p['eye_cz'], p['eye_k']
        ex = (X - cx) * s / k      # + = outward, in unscaled eye units
        ez = (Z - cz) / k
        E = lambda e, z: (cx + s * e * k, cz + z * k)   # eye units -> texture metres
        OT, OB, OW = p['open_top'], p['open_bot'], p['open_w']
        SL = p['lid_slope']                                  # >0.004 droops the outer corner
        top = OT * np.clip(1 - np.abs(ex / OW) ** p['lid_p'], 0, 1) ** (1 / p['lid_p']) - SL * (ex / OW)
        bot = -OB * np.sqrt(np.clip(1 - (ex / (OW - 0.002)) ** 2, 0, 1)) - (SL - 0.004) * 0.6 * (ex / OW)
        sd_open = np.maximum(np.maximum(ez - top, bot - ez), np.abs(ex) - OW)
        if p['under_eye']:
            ue = np.exp(-(((ex - 0.004) / 0.03) ** 2 + ((ez + OB + 0.004) / 0.008) ** 2))
            cv.over(_rgb(p['lash_tip']), p['under_eye'] * ue)
        if p['eyeshadow']:
            band = np.clip((top + 0.014 - ez) / 0.014, 0, 1) * np.clip((ez - top + 0.003) / 0.003, 0, 1)
            band *= np.clip((OW + 0.008 - np.abs(ex - 0.003)) / 0.012, 0, 1)
            cv.over(_rgb(p['eyeshadow_col']), p['eyeshadow'] * band)
        inside = cv.aa(sd_open * k)
        # sclera with top shadow
        scl = _rgb(p['sclera'])[None, None, :] * (1 - 0.18 * np.clip((ez - top + 0.012) / 0.012, 0, 1))[..., None]
        cv.over(scl, inside)
        # iris
        ib = p['iris_bot']
        if p['heterochromia']:
            ib = p['heterochromia'][0 if s < 0 else 1]
        t = np.clip((ez + 0.03) / 0.062, 0, 1)[..., None]
        icol = _rgb(ib)[None, None] * (1 - t) + _rgb(p['iris_top'])[None, None] * t
        r_ir = np.hypot(ex / p['iris_rx'], (ez + 0.001) / p['iris_rz'])
        icol = icol * (1 - 0.6 * np.clip((r_ir - 0.82) / 0.18, 0, 1))[..., None] + \
            _rgb(p['iris_ring'])[None, None] * 0.6 * np.clip((r_ir - 0.82) / 0.18, 0, 1)[..., None]
        iris = np.minimum(inside, cv.aa((r_ir - 1) * p['iris_rx'] * k))
        if p['iris_detail']:
            # glossy doll iris: lighter mid ring + fine radial streaks
            ang = np.arctan2(ez + 0.001, ex)
            ring = np.exp(-((r_ir - 0.55) / 0.18) ** 2)
            streak = 0.5 + 0.5 * np.sin(ang * 26) * np.sin(ang * 9 + 1.3)
            icol = icol * (1 + p['iris_detail'] * (0.55 * ring + 0.25 * streak * (r_ir < 0.95)))[..., None]
            icol = np.clip(icol, 0, 1)
        cv.over(icol, iris)
        # lower glint crescent
        g = np.minimum(iris, np.clip(1 - np.hypot(ex / 0.017, (ez + 0.016) / 0.009), 0, 1))
        cv.over(_rgb(p['iris_glint']), g * 0.55)
        # pupil
        cv.over(_rgb(p['pupil']), np.minimum(inside, cv.aa((np.hypot(ex / 0.011, (ez - 0.002) / 0.015) - 1) * 0.011 * k)))
        # upper-lid shadow over the iris
        cv.over(np.array([0.05, 0.03, 0.05], np.float32), inside * 0.45 * np.clip((ez - top + 0.009) / 0.009, 0, 1))
        # highlights (same light direction on both eyes: from viewer's upper-left = -x)
        for hx, hz, rx, rz, a in ((-0.009, 0.012, 0.0075, 0.009, 1.0), (0.009, -0.014, 0.0035, 0.0035, 0.9),
                                  (0.004, 0.017, 0.0022, 0.0022, 0.8)):
            rx, rz = rx * p['hl_scale'], rz * p['hl_scale']
            hl = np.hypot((X - (cx + hx * k)) / (rx * k), (Z - (cz + hz * k)) / (rz * k))
            cv.over(np.ones(3, np.float32), np.minimum(inside, cv.aa((hl - 1) * min(rx, rz) * k)) * a)
        # upper lash line (thick, with outer wing)
        exs = np.linspace(-OW - 0.001, OW, 14)
        pts = [E(e, OT * max(0, 1 - abs(e / (OW + 0.0005)) ** p['lid_p']) ** (1 / p['lid_p']) - SL * e / OW + 0.0022) for e in exs]
        W = p['wing']
        pts += [E(OW + 0.007 * W, -SL - 0.003 * W), E(OW + 0.011 * W, -SL - 0.009 * W)]
        LW = p['lash_w']
        wid = [k * LW * (0.0045 + 0.006 * max(0, (e + 0.02) / 0.056)) for e in exs] + [k * LW * 0.0055 * (0.5 + 0.5 * W), k * 0.0012]
        lash = cv.stroke(pts, wid)
        # tint the outer end towards lash_tip (red eyeliner corner)
        tip = np.clip((ex - 0.02) / 0.025, 0, 1)[..., None]
        lc = _rgb(p['lash'])[None, None] * (1 - tip * 0.55) + _rgb(p['lash_tip'])[None, None] * tip * 0.55
        cv.over(lc, lash)
        # lower lash hint (outer third)
        e_lo = -OW * 0.75 if p['lower_full'] else -0.004
        lpts = [E(e, -OB * np.sqrt(max(0, 1 - (e / (OW - 0.0015)) ** 2)) - (SL - 0.004) * 0.6 * e / OW - 0.001) for e in np.linspace(e_lo, OW - 0.002, 8)]
        cv.over(_rgb(p['lash_tip']), cv.stroke(lpts, [k * w for w in (0.0005, 0.0009, 0.0013, 0.0017, 0.002, 0.0022, 0.002, 0.0012)]) * p['lower_liner'])
        # outer lash flicks
        for f in range(p['lash_flicks']):
            e0 = OW - 0.004 - 0.007 * f
            z0 = OT * max(0, 1 - abs(e0 / (OW + 0.0005)) ** p['lid_p']) ** (1 / p['lid_p']) - SL * e0 / OW + 0.004
            cv.over(_rgb(p['lash']), cv.stroke([E(e0, z0), E(e0 + 0.006, z0 + 0.0045 - 0.001 * f), E(e0 + 0.009, z0 + 0.005 - 0.0015 * f)],
                                               [k * 0.0022, k * 0.0012, k * 0.0004]))
        # lid crease
        cpts = [E(e, 0.046 * np.sqrt(max(0, 1 - (e / 0.04) ** 2)) - 0.002 * e / 0.04) for e in np.linspace(-0.02, 0.03, 8)]
        cv.over(_rgb(p['crease']), cv.stroke(cpts, [0.0008, 0.0012, 0.0014, 0.0014, 0.0014, 0.0013, 0.0011, 0.0006]) * p['crease_a'])
        # brow
        bpts = [E(e, 0.062 + 0.006 * np.sqrt(max(0, 1 - ((e - 0.004) / 0.03) ** 2))) for e in np.linspace(-0.022, 0.03, 8)]
        cv.over(_rgb(p['brow']), cv.stroke(bpts, [0.0042, 0.0042, 0.0038, 0.0034, 0.003, 0.0026, 0.002, 0.0012]) * 0.9)
    # nose & mouth
    cv.over(_rgb(p['nose']), cv.stroke([(-0.0025, p['nose_z'] + 0.0015), (0.0015, p['nose_z'] - 0.0015)], [0.0016, 0.0012]) * 0.6)
    mw = p['mouth_w']
    mpts = [(e, p['mouth_z'] - p['mouth_curve'] * (1 - (e / mw) ** 2)) for e in np.linspace(-mw, mw, 9)]
    cv.over(_rgb(p['mouth']), cv.stroke(mpts, [0.0008, 0.0014, 0.0018, 0.002, 0.002, 0.002, 0.0018, 0.0014, 0.0008]))

    img = bpy.data.images.get(name) or bpy.data.images.new(name, size, size, alpha=True)
    if tuple(img.size) != (size, size):
        img.scale(size, size)
    px = np.concatenate([cv.rgb, cv.a[..., None]], axis=2).astype(np.float32)
    img.pixels.foreach_set(px.ravel())
    img.alpha_mode = 'STRAIGHT'
    img.update()
    img.pack()
    return img
