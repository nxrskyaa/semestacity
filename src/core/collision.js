// 2D (XZ-plane) collision world: axis-aligned boxes + circles, with optional
// vertical extent so low things (curbs) can be ignored by jumping later.
// Characters are circles of radius r; resolve() pushes them out.

export class Collision {
  constructor() {
    this.boxes = [];   // {minX,minZ,maxX,maxZ,minY,maxY,tag}
    this.circles = []; // {x,z,r,minY,maxY,tag}
  }

  /** axis-aligned box in world XZ. y range defaults to 0..10 */
  addBox(minX, minZ, maxX, maxZ, { minY = 0, maxY = 10, tag = '' } = {}) {
    const b = {
      minX: Math.min(minX, maxX), maxX: Math.max(minX, maxX),
      minZ: Math.min(minZ, maxZ), maxZ: Math.max(minZ, maxZ), minY, maxY, tag,
    };
    this.boxes.push(b);
    return b;
  }

  /** box from center + size (+ optional rotation in 90° steps handled by swapping w/d) */
  addRect(cx, cz, w, d, opts) {
    return this.addBox(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, opts);
  }

  addCircle(x, z, r, { minY = 0, maxY = 10, tag = '' } = {}) {
    const c = { x, z, r, minY, maxY, tag };
    this.circles.push(c);
    return c;
  }

  remove(shape) {
    let i = this.boxes.indexOf(shape);
    if (i >= 0) this.boxes.splice(i, 1);
    i = this.circles.indexOf(shape);
    if (i >= 0) this.circles.splice(i, 1);
  }

  /** push a circle (pos.x,pos.z,radius) out of all shapes. pos is a Vector3 (mutated). */
  resolve(pos, radius, y = pos.y) {
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.boxes) {
        if (y > b.maxY || y + 1.6 < b.minY) continue;
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius;
          pos.z = cz + (dz / d) * radius;
        } else {
          // center inside box: push out along the shallowest axis
          const l = pos.x - b.minX, r = b.maxX - pos.x, t = pos.z - b.minZ, bt = b.maxZ - pos.z;
          const m = Math.min(l, r, t, bt);
          if (m === l) pos.x = b.minX - radius;
          else if (m === r) pos.x = b.maxX + radius;
          else if (m === t) pos.z = b.minZ - radius;
          else pos.z = b.maxZ + radius;
        }
      }
      for (const c of this.circles) {
        if (y > c.maxY || y + 1.6 < c.minY) continue;
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const rr = radius + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        pos.x = c.x + (dx / d) * rr;
        pos.z = c.z + (dz / d) * rr;
      }
    }
    return pos;
  }

  /** true if the 3D segment a->b passes through any box (slab test; used to hide name tags behind walls) */
  segmentBlocked(a, b, boxes = this.boxes) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    for (const bx of boxes) {
      let t0 = 0, t1 = 1;
      const slab = (o, d, mn, mx) => {
        if (Math.abs(d) < 1e-9) return o > mn && o < mx;
        let ta = (mn - o) / d, tb = (mx - o) / d;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        return t0 < t1;
      };
      if (slab(a.x, dx, bx.minX, bx.maxX) && slab(a.z, dz, bx.minZ, bx.maxZ) && slab(a.y, dy, bx.minY, bx.maxY)) return true;
    }
    return false;
  }

  /** true if a point is inside any box (used for camera collision / spawn checks) */
  pointBlocked(x, z, y = 1) {
    for (const b of this.boxes) {
      if (y > b.maxY || y < b.minY) continue;
      if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
    }
    return false;
  }
}
