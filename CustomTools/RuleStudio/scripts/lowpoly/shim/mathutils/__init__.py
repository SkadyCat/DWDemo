"""Minimal stand-in for Blender's mathutils, for offline testing only."""
import math


class Vector:
    __slots__ = ("x", "y", "z")

    def __init__(self, v=(0.0, 0.0, 0.0)):
        v = tuple(v)
        self.x, self.y, self.z = float(v[0]), float(v[1]), float(v[2])

    def __iter__(self):
        yield self.x; yield self.y; yield self.z

    def __getitem__(self, i):
        return (self.x, self.y, self.z)[i]

    def __len__(self):
        return 3

    def __add__(self, o):
        return Vector((self.x + o[0], self.y + o[1], self.z + o[2]))
    __radd__ = __add__

    def __sub__(self, o):
        return Vector((self.x - o[0], self.y - o[1], self.z - o[2]))

    def __rsub__(self, o):
        return Vector((o[0] - self.x, o[1] - self.y, o[2] - self.z))

    def __mul__(self, s):
        return Vector((self.x * s, self.y * s, self.z * s))
    __rmul__ = __mul__

    def __truediv__(self, s):
        return Vector((self.x / s, self.y / s, self.z / s))

    def __neg__(self):
        return Vector((-self.x, -self.y, -self.z))

    def __repr__(self):
        return "Vector((%.4f, %.4f, %.4f))" % (self.x, self.y, self.z)

    def __eq__(self, o):
        return isinstance(o, Vector) and self.x == o.x and self.y == o.y and self.z == o.z

    def __hash__(self):
        return hash((self.x, self.y, self.z))

    def dot(self, o):
        return self.x * o[0] + self.y * o[1] + self.z * o[2]

    def cross(self, o):
        return Vector((self.y * o[2] - self.z * o[1],
                       self.z * o[0] - self.x * o[2],
                       self.x * o[1] - self.y * o[0]))

    @property
    def length(self):
        return math.sqrt(self.x * self.x + self.y * self.y + self.z * self.z)

    @property
    def length_squared(self):
        return self.x * self.x + self.y * self.y + self.z * self.z

    def normalized(self):
        L = self.length
        return Vector((0, 0, 0)) if L == 0 else self / L

    def copy(self):
        return Vector(self)

    def lerp(self, o, t):
        return self + (Vector(o) - self) * t

    def to_tuple(self, p=None):
        return (self.x, self.y, self.z)


class Matrix:
    pass


class Quaternion:
    pass
