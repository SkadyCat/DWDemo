"""Brute-force BVHTree stand-in (ray_cast only)."""
from . import Vector


class BVHTree:
    def __init__(self, verts, tris):
        self.v = [Vector(p) for p in verts]
        self.t = tris

    @classmethod
    def FromPolygons(cls, verts, polys, all_triangles=False, epsilon=0.0):
        tris = []
        for p in polys:
            for i in range(1, len(p) - 1):
                tris.append((p[0], p[i], p[i + 1]))
        return cls(verts, tris)

    def ray_cast(self, origin, direction, distance=1e9):
        o = Vector(origin); d = Vector(direction).normalized()
        best = None
        for idx, (a, b, c) in enumerate(self.t):
            A, B, C = self.v[a], self.v[b], self.v[c]
            e1 = B - A; e2 = C - A
            p = d.cross(e2); det = e1.dot(p)
            if abs(det) < 1e-12:
                continue
            inv = 1.0 / det
            s = o - A
            u = s.dot(p) * inv
            if u < 0 or u > 1:
                continue
            q = s.cross(e1)
            v = d.dot(q) * inv
            if v < 0 or u + v > 1:
                continue
            t = e2.dot(q) * inv
            if t > 1e-9 and t < distance and (best is None or t < best[0]):
                n = e1.cross(e2).normalized()
                best = (t, n, idx)
        if best is None:
            return (None, None, None, None)
        t, n, idx = best
        return (o + d * t, n, idx, t)
