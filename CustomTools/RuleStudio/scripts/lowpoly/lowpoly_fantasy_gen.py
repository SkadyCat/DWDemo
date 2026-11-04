# -*- coding: utf-8 -*-
"""
LowPoly Fantasy Character Generator for UE5  (Blender 4.2+ / 5.x)
[DWDemo 副本：来自 DWEngine/Tools/LowPoly，加了 weight（胖瘦）参数，见 compute_layout]
================================================================

Procedural stylized low-poly WESTERN-FANTASY characters, skinned to a skeleton
that uses the UE5 Mannequin (Manny/Quinn) bone names + hierarchy, so UE5
animations retarget directly (IK Retargeter / auto-retarget).

  Style   : "storybook" chunky low-poly - ~3.5 heads tall, big mitten gloves,
            chunky boots, bar eyes, faceted shapes, trimmed garments
  Races   : human, elf, dwarf, orc
  Classes : warrior, knight, ranger, mage, rogue, cleric, villager
  Mages   : wizard (hat, beard, capelet, book), pyromancer (hood, mask, fire
            staff), frost (hood, capelet, brooch), druid (witch hat, scarf,
            satchel, leafy staff), warlock (hood, mask, iron staff, book),
            alchemist (hat, apron, potions, wand)
  Gear    : breastplate / leather cuirass, faulds, pauldrons (plate, leather,
            spiked, fur), bracers, gloves/gauntlets, greaves, knee cops, boots,
            sabatons, tabard + heraldic emblem, belt + pouches, tunic skirt,
            robe + bell sleeves, mantle, cape (+fur collar), hood up/down,
            quiver, apron
  Helmets : nasal, kettle, horned, great helm, circlet, wizard hat
  Face    : iris eyes, brows, nose, mouth, beards (short/full/long/braided/
            goatee) + moustache, elf ears, orc tusks, war paint, scars,
            eye patch
  Weapons : sword, axe, mace, hammer, gnarled crystal staff, leafy staff,
            iron staff, wand, dagger(s), bow, round/heater shield, book, potion
            (separate mesh object, rigidly skinned to hand bones)
  Preview : "Display pose" (arms down, staff upright) for screenshots only;
            FBX export always uses the A-pose rest pose.

Everything is driven by an integer seed. Any spec field can be overridden:
    create_character(seed=7, race="dwarf", cls="warrior",
                     gear={"helmet": "horned", "weapon_r": "hammer"})

USE IN BLENDER: Scripting > Open > Run Script, then 3D View sidebar (N) >
"Fantasy Gen". Or headless:
    blender -b -P lowpoly_fantasy_gen.py -- --seed 7 --count 6 \
            --fbx /path/char.fbx --render /path/preview.png

UNREAL: import FBX as Skeletal Mesh (new skeleton). Faces -Y in Blender,
A-pose like UE5 Manny, meters -> centimeters. Body and weapons are separate
mesh nodes in the FBX (UE merges them into one skeletal mesh; untick
"Include weapons" in the panel to export the body alone and attach weapons
via sockets instead).
"""

bl_info = {
    "name": "LowPoly Fantasy Character Generator (UE5 skeleton)",
    "author": "Claude",
    "version": (2, 0, 0),
    "blender": (4, 2, 0),
    "location": "View3D > Sidebar > Fantasy Gen",
    "description": "Procedural stylized low-poly fantasy characters on a UE5-compatible skeleton",
    "category": "Add Mesh",
}

import math
import random
import colorsys
import os
import sys
import json
import contextlib

try:
    import bpy  # noqa
except ImportError:
    bpy = None

from mathutils import Vector
from mathutils.bvhtree import BVHTree

TAU = 2.0 * math.pi
UP = Vector((0.0, 0.0, 1.0))
FRONT = Vector((0.0, -1.0, 0.0))
BACK = Vector((0.0, 1.0, 0.0))
COLLECTION_NAME = "FantasyCharacters"

DETAIL = {
    "high": dict(torso=10, limb=8, head=10, hair=14, cape=13, shell=12),
    "low": dict(torso=8, limb=6, head=10, hair=12, cape=9, shell=10),
}


# =============================================================================
#  Colour helpers
# =============================================================================

def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def _s2l(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def to_linear(rgb):
    return tuple(_s2l(c) for c in rgb)


def lstar(rgb):
    r, g, b = to_linear(rgb)
    Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return 116.0 * Y ** (1.0 / 3.0) - 16.0 if Y > 0.008856 else 903.3 * Y


def hsv_adj(rgb, dh=0.0, s_mul=1.0, v_mul=1.0, s_add=0.0, v_add=0.0):
    h, s, v = colorsys.rgb_to_hsv(*rgb)
    h = (h + dh) % 1.0
    s = min(1.0, max(0.0, s * s_mul + s_add))
    v = min(1.0, max(0.0, v * v_mul + v_add))
    return colorsys.hsv_to_rgb(h, s, v)


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def jitter(r, rgb, dh=0.015, ds=0.08, dv=0.06):
    return hsv_adj(rgb, dh=r.uniform(-dh, dh), s_mul=1 + r.uniform(-ds, ds), v_mul=1 + r.uniform(-dv, dv))


# =============================================================================
#  Fantasy palettes
# =============================================================================

# (name, cloth1, cloth2, cloth3, trim)  -- heraldic / faction colour schemes
FACTIONS = [
    ("crimson",  "#8E1F1F", "#3B2C24", "#C9A64A", "#D2A93E"),
    ("royal",    "#23407A", "#2E2A27", "#C8CDD5", "#C9CED6"),
    ("forest",   "#2F5233", "#4A3B2A", "#9C7A3C", "#B07D3A"),
    ("arcane",   "#4B2A6B", "#2B2A36", "#C9A227", "#D4AF37"),
    ("shadow",   "#262427", "#3A1E22", "#6E1F25", "#A8A8AE"),
    ("teal",     "#1F5C5C", "#3B2F28", "#D9C9A3", "#B4713E"),
    ("ochre",    "#B5853B", "#5B4636", "#E6D6B0", "#A8743A"),
    ("temple",   "#E5DECF", "#34507E", "#B8963A", "#D4AF37"),
    ("ranger",   "#4E5B3A", "#5C4A36", "#7D6A45", "#8B6B3D"),
    ("frost",    "#6F8FA8", "#2F3A45", "#E8EEF2", "#C9D3DC"),
    ("ember",    "#A4401E", "#2E2624", "#E3A23B", "#C7883A"),
    ("wine",     "#5E1A33", "#2A2228", "#D8C7A0", "#C9A64A"),
    ("moss",     "#6B7B3A", "#3E3528", "#C4B07A", "#9A7A3C"),
    ("sky",      "#3E7CB1", "#E9E4D8", "#F2C14E", "#D4AF37"),
]
CLASS_FACTIONS = {
    "warrior": ["crimson", "royal", "ember", "frost", "teal", "wine", "moss"],
    "knight": ["crimson", "royal", "temple", "sky", "wine", "frost"],
    "ranger": ["forest", "ranger", "moss", "ochre", "teal"],
    "mage": ["arcane", "royal", "wine", "teal", "frost", "ember", "sky"],
    "rogue": ["shadow", "wine", "ranger", "forest"],
    "cleric": ["temple", "sky", "royal", "ochre"],
    "villager": ["ochre", "moss", "forest", "teal", "ember", "sky"],
}
LEATHERS = ["#6B4428", "#7A5232", "#5A3A22", "#8B5E34", "#4E3524"]
METALS = ["#A9B0B8", "#9AA2AA", "#B9BEC4", "#7F868D"]
DARK_METALS = ["#4F545A", "#5E6369", "#3A3D42"]
FURS = ["#7A6250", "#C9C1B4", "#4A3A2E", "#8C8C8C", "#A88A68"]
WOODS = ["#6E4B2E", "#8A6239", "#5B3D25"]
GEMS = ["#5FD3FF", "#B45CFF", "#FF5C5C", "#6CFF8A", "#FFD15C", "#FF7AD9"]
PAINTS = ["#2F5FB0", "#B02F2F", "#1E1E22", "#E8E4DA"]

SKINS = {
    "human": ["#FBE3D1", "#F3CFB3", "#E8B896", "#D49C74", "#B97E58", "#97613F", "#744A30", "#58361F"],
    "elf": ["#FBEADB", "#F4DCC6", "#EAD0B8", "#D9B593", "#C9A27E"],
    "dwarf": ["#F1C7A6", "#E6AF8C", "#D59874", "#C08060", "#9C6648"],
    "orc": ["#7A8F4E", "#6B7D45", "#8FA05A", "#5E7046", "#7F8A6A", "#6E7F5C"],
}
HAIRS = {
    "human": ["#1F1A17", "#2E221B", "#4A3426", "#6A4630", "#8C5A36", "#B07A45", "#D2A465", "#9A3B26", "#7A7F87"],
    "elf": ["#EDE6D3", "#D9C9A0", "#C8CDD6", "#1F1A17", "#8C3B22", "#E3C27A", "#6E8FB8"],
    "dwarf": ["#9A3B26", "#C1592C", "#6A4630", "#4A3426", "#D2A465", "#A7A9AC", "#E0DED8"],
    "orc": ["#1A1716", "#2E221B", "#3F3A33", "#5E5850", "#8C2E22"],
}
IRISES = {
    "human": ["#5B3A21", "#3E6B8A", "#4F7A3A", "#7A6A3A"],
    "elf": ["#3FA7D6", "#5FCF97", "#9C6CFF", "#D4AF37", "#5BC8C8"],
    "dwarf": ["#5B3A21", "#3E6B8A", "#6B5A3A"],
    "orc": ["#D94A2B", "#E0B02E", "#9AD12E"],
}

ROLE_ORDER = ["skin", "hair", "brow", "eye", "iris", "white", "mouth", "blush", "paint", "scar", "bone",
              "cloth1", "cloth2", "cloth3", "cape", "hood_in", "capelet", "leather", "leather_dark", "fur", "wood",
              "leaf", "pages", "metal", "metal_dark", "trim", "gem", "potion", "potion2", "potion3", "glass", "emblem"]
METAL_ROLES = {"metal", "metal_dark", "trim"}


# =============================================================================
#  Spec: race / class / gear  (all randomness lives here)
# =============================================================================

RACES = ["human", "elf", "dwarf", "orc"]
CLASSES = ["warrior", "knight", "ranger", "mage", "rogue", "cleric", "villager"]
RACE_W = [("human", 0.42), ("elf", 0.2), ("dwarf", 0.19), ("orc", 0.19)]
CLASS_W = {
    "human": [("warrior", .2), ("knight", .15), ("ranger", .14), ("mage", .15), ("rogue", .13), ("cleric", .11), ("villager", .12)],
    "elf": [("warrior", .08), ("knight", .05), ("ranger", .34), ("mage", .3), ("rogue", .15), ("cleric", .05), ("villager", .03)],
    "dwarf": [("warrior", .36), ("knight", .16), ("ranger", .03), ("mage", .06), ("rogue", .04), ("cleric", .2), ("villager", .15)],
    "orc": [("warrior", .46), ("knight", .03), ("ranger", .12), ("mage", .12), ("rogue", .17), ("cleric", .02), ("villager", .08)],
}
HAIR_STYLES = ["short", "long", "ponytail", "braid", "bun", "mohawk", "buzz", "bald", "spiky", "bob"]
HELMETS = ["none", "nasal", "kettle", "horned", "great", "circlet", "wizard", "witch"]
WEAPONS_R = ["none", "sword", "axe", "mace", "hammer", "staff", "staff_leaf", "staff_iron", "wand", "dagger"]
WEAPONS_L = ["none", "shield_round", "shield_heater", "bow", "dagger", "book", "potion"]
MAGE_KINDS = ["wizard", "pyromancer", "frost", "druid", "warlock", "alchemist"]
# per mage kind: cloth1 (coat), cloth2 (lining / under-robe), cloth3 (capelet/scarf), trim, gem
MAGE_COLORS = {
    "wizard":     ("#2F3A78", "#2A2830", "#E3D6B4", "#C9A04A", "#9B5CFF"),
    "pyromancer": ("#A3362B", "#3A2A26", "#C9772E", "#E39A2E", "#FF7A2E"),
    "frost":      ("#3E6F92", "#86AACB", "#E7E0CF", "#E2DCCB", "#5CC2FF"),
    "druid":      ("#5E7B3B", "#4B3A2A", "#C9A15A", "#B88A43", "#6CF0A0"),
    "warlock":    ("#5A3550", "#2C2330", "#8E6680", "#9C6B86", "#5CFFB0"),
    "alchemist":  ("#C9A040", "#2F5D5A", "#6B4A30", "#8B5E34", "#4FD1C5"),
}
EMBLEMS = ["cross", "diamond", "circle", "chevron", "star", "bars"]


def _wchoice(r, items):
    items = [(v, w) for v, w in items if w > 0]
    tot = sum(w for _, w in items)
    x = r.random() * tot
    for v, w in items:
        x -= w
        if x <= 0:
            return v
    return items[-1][0]


def default_gear():
    return dict(torso="tunic", tunic_skirt=False, sleeves="long", armor=None, faulds=False,
                tabard=False, emblem="cross", pauldrons=None, bracers=None, hands="skin",
                greaves=False, knee_cops=False, boots="boots", belt=True, pouches=0,
                cape=None, fur_collar=False, hood=None, mantle=False, helmet="none", mask=False,
                weapon_r="none", weapon_l="none", quiver=False, apron=False, robe=None,
                coat=None, capelet=False, brooch=False, strap=False, satchel=False, book_hip=False,
                potions=0, scarf=False, mage_kind=None, big_buckle=False)


def apply_mage_kind(g, kind):
    """Outfit presets matching the six storybook mage archetypes."""
    for k, v in default_gear().items():
        if k in ("emblem",):
            continue
        g[k] = v
    g.update(mage_kind=kind, coat="long", sleeves="bell", hands="glove", boots="boots", big_buckle=True,
             tunic_skirt=False, torso="tunic")
    if kind == "wizard":
        g.update(helmet="wizard", capelet=True, book_hip=True, weapon_r="staff")
    elif kind == "pyromancer":
        g.update(hood="up", mask=True, capelet=True, strap=True, coat="mid", weapon_r="staff")
    elif kind == "frost":
        g.update(hood="up", capelet=True, brooch=True, weapon_r="staff")
    elif kind == "druid":
        g.update(helmet="witch", scarf=True, strap=True, satchel=True, coat="mid", weapon_r="staff_leaf")
    elif kind == "warlock":
        g.update(hood="up", mask=True, capelet=True, weapon_r="staff_iron", weapon_l="book")
    elif kind == "alchemist":
        g.update(helmet="wizard", apron=True, potions=3, coat="mid", sleeves="long", weapon_r="wand", weapon_l="potion")
    return g


def pick_gear(r, race, cls, fem):
    g = default_gear()
    g["emblem"] = r.choice(EMBLEMS)
    g["tunic_skirt"] = r.random() < 0.55
    if cls == "warrior":
        g["armor"] = _wchoice(r, [("plate", .4), ("leather", .42), (None, .18)])
        g["sleeves"] = _wchoice(r, [("long", .5), ("short", .35), ("none", .15 + (.25 if race == "orc" else 0))])
        g["pauldrons"] = _wchoice(r, [("plate", .35), ("leather", .2), ("spiked", .12 + (.25 if race == "orc" else 0)),
                                      ("fur", .18), (None, .1)])
        g["bracers"] = r.choice(["leather", "metal"])
        g["hands"] = _wchoice(r, [("skin", .3), ("glove", .45), ("gauntlet", .25)])
        g["greaves"] = r.random() < 0.35
        g["knee_cops"] = r.random() < 0.5
        g["boots"] = r.choice(["boots", "tall"])
        g["pouches"] = r.randint(0, 2)
        g["cape"] = _wchoice(r, [(None, .55), ("short", .2), ("long", .25)])
        g["fur_collar"] = g["cape"] is not None and r.random() < 0.55
        g["helmet"] = _wchoice(r, [("none", .38), ("nasal", .24), ("kettle", .1),
                                   ("horned", .22 if race in ("dwarf", "orc") else .05), ("great", .06)])
        g["weapon_r"] = _wchoice(r, [("sword", .34), ("axe", .3), ("mace", .14), ("hammer", .32 if race == "dwarf" else .05)])
        g["weapon_l"] = _wchoice(r, [("none", .42), ("shield_round", .42), ("shield_heater", .16)])
    elif cls == "knight":
        g["armor"] = "plate"
        g["faulds"] = True
        g["pauldrons"] = "plate"
        g["bracers"] = "metal"
        g["hands"] = "gauntlet"
        g["greaves"] = True
        g["knee_cops"] = True
        g["boots"] = "sabaton"
        g["tabard"] = r.random() < 0.65
        g["tunic_skirt"] = r.random() < 0.4
        g["cape"] = _wchoice(r, [(None, .4), ("short", .2), ("long", .4)])
        g["fur_collar"] = g["cape"] is not None and r.random() < 0.3
        g["helmet"] = _wchoice(r, [("none", .35), ("great", .35), ("nasal", .3)])
        g["weapon_r"] = _wchoice(r, [("sword", .7), ("mace", .15), ("hammer", .15)])
        g["weapon_l"] = _wchoice(r, [("shield_heater", .7), ("shield_round", .1), ("none", .2)])
    elif cls == "ranger":
        g["armor"] = _wchoice(r, [("leather", .65), (None, .35)])
        g["bracers"] = "leather"
        g["hands"] = "glove"
        g["boots"] = "tall"
        g["pouches"] = r.randint(1, 2)
        g["cape"] = _wchoice(r, [(None, .25), ("short", .45), ("long", .3)])
        g["hood"] = _wchoice(r, [("up", .45), ("down", .35), (None, .2)])
        g["quiver"] = True
        g["weapon_l"] = "bow"
        g["weapon_r"] = _wchoice(r, [("none", .6), ("dagger", .4)])
        g["pauldrons"] = _wchoice(r, [(None, .7), ("leather", .3)])
    elif cls == "mage":
        apply_mage_kind(g, _wchoice(r, [(k, 1.0) for k in MAGE_KINDS]))
    elif cls == "rogue":
        g["armor"] = _wchoice(r, [("leather", .7), (None, .3)])
        g["bracers"] = "leather"
        g["hands"] = "glove"
        g["hood"] = _wchoice(r, [("up", .62), ("down", .18), (None, .2)])
        g["mask"] = r.random() < 0.5
        g["cape"] = _wchoice(r, [(None, .6), ("short", .4)])
        g["pouches"] = r.randint(1, 3)
        g["boots"] = "tall"
        g["weapon_r"] = "dagger"
        g["weapon_l"] = _wchoice(r, [("dagger", .7), ("none", .3)])
        g["tunic_skirt"] = r.random() < 0.3
    elif cls == "cleric":
        g["robe"] = "mid"
        g["armor"] = _wchoice(r, [(None, .65), ("plate", .35)])
        g["tabard"] = r.random() < 0.6
        g["mantle"] = r.random() < 0.5
        g["helmet"] = _wchoice(r, [("circlet", .3), ("none", .55), ("nasal", .15)])
        g["weapon_r"] = _wchoice(r, [("mace", .7), ("hammer", .3)])
        g["weapon_l"] = _wchoice(r, [("none", .55), ("shield_round", .45)])
        g["bracers"] = _wchoice(r, [(None, .5), ("metal", .5)])
        g["boots"] = "boots"
    elif cls == "villager":
        g["sleeves"] = r.choice(["long", "short"])
        g["apron"] = r.random() < 0.4
        if fem > 0.5 and r.random() < 0.6:
            g["robe"] = "mid"
            g["tunic_skirt"] = False
        g["boots"] = r.choice(["shoes", "boots"])
        g["hood"] = _wchoice(r, [(None, .85), ("down", .15)])
        g["weapon_r"] = _wchoice(r, [("none", .8), ("axe", .2)])
    if g["helmet"] in ("great",):
        g["hood"] = None
    if g["helmet"] != "none" and g["hood"] == "up":
        g["hood"] = "down"
    if g["robe"] or g["coat"]:
        g["tunic_skirt"] = False
        g["faulds"] = False
    return g


def make_colors(r, S):
    race, cls = S["race"], S["cls"]
    names = CLASS_FACTIONS[cls] if r.random() < 0.75 else [f[0] for f in FACTIONS]
    pick = r.choice(names)
    fac = next(f for f in FACTIONS if f[0] == pick)
    c1, c2, c3, trim = [jitter(r, hex_rgb(x)) for x in fac[1:]]
    mk = S["gear"].get("mage_kind")
    gem_col = hex_rgb(r.choice(GEMS))
    if mk:
        mc = MAGE_COLORS[mk]
        c1, c2, c3, trim = [jitter(r, hex_rgb(x), dh=0.01, ds=0.05, dv=0.05) for x in mc[:4]]
        gem_col = hex_rgb(mc[4])
    if abs(lstar(c1) - lstar(c2)) < 15 and not mk:
        c2 = hsv_adj(c2, v_mul=0.6)
    leather = jitter(r, hex_rgb(r.choice(LEATHERS)), dv=0.03)
    metal = hex_rgb(r.choice(METALS))
    skin = hex_rgb(r.choice(SKINS[race]))
    hair = jitter(r, hex_rgb(r.choice(HAIRS[race])))
    if mk == "wizard" and S["masc"] > 0.5:
        hair = hex_rgb(r.choice(["#E4E2DC", "#CFCBC2", "#B9B6B0"]))
    # cape / hood colour: must read clearly as cloth, not as hair
    def far(c):
        return abs(lstar(c) - lstar(hair)) > 16 or abs(colorsys.rgb_to_hsv(*c)[0] - colorsys.rgb_to_hsv(*hair)[0]) > 0.12
    cands = [c3, hsv_adj(c1, v_mul=0.62, s_mul=0.9), hsv_adj(c2, v_mul=1.2)]
    if cls == "rogue":
        cands = [hsv_adj(c2, v_mul=0.8), hsv_adj(c1, v_mul=0.55)]
    cands = [c for c in cands if lstar(c) < 78] or cands
    cape = next((c for c in cands if far(c) and abs(lstar(c) - lstar(c1)) > 10), None) or \
        next((c for c in cands if far(c)), cands[0])
    if mk:
        cape = c1
    return dict(
        cape=cape, hood_in=hsv_adj(cape, v_mul=0.45),
        skin=skin, hair=hair, brow=mix(hair, (0.05, 0.04, 0.04), 0.3),
        eye=(0.08, 0.06, 0.08), iris=hex_rgb(r.choice(IRISES[race])), white=(0.95, 0.94, 0.9),
        mouth=mix(skin, (0.35, 0.08, 0.1), 0.6), blush=mix(skin, (0.95, 0.5, 0.5), 0.4),
        paint=hex_rgb(r.choice(PAINTS)), scar=mix(skin, (0.75, 0.45, 0.45), 0.45),
        bone=(0.91, 0.87, 0.76),
        cloth1=c1, cloth2=c2, cloth3=c3,
        leather=leather, leather_dark=hsv_adj(leather, v_mul=0.62),
        fur=hex_rgb(r.choice(FURS)), wood=hex_rgb(r.choice(WOODS)),
        metal=metal, metal_dark=hex_rgb(r.choice(DARK_METALS)), trim=trim,
        gem=gem_col, emblem=trim if r.random() < 0.6 else c3,
        capelet=c3, leaf=(0.42, 0.68, 0.32), pages=(0.93, 0.89, 0.78),
        potion=hex_rgb("#4FD1C5"), potion2=hex_rgb("#D9473B"), potion3=hex_rgb("#6CC24A"),
        glass=(0.78, 0.86, 0.88),
    )


def make_spec(seed=0, **overrides):
    r = random.Random(int(seed) * 104729 + 3)
    race = _wchoice(r, RACE_W)
    S = dict(seed=int(seed))
    gear_ov = overrides.pop("gear", None) or {}
    col_ov = overrides.pop("colors", None)
    if overrides.get("race"):
        race = overrides["race"]
    S["race"] = race
    masc = _wchoice(r, [(r.uniform(0.0, 0.25), 0.42), (r.uniform(0.75, 1.0), 0.48), (r.uniform(0.3, 0.7), 0.10)])
    if race == "dwarf":
        masc = max(masc, r.uniform(0.6, 1.0)) if r.random() < 0.8 else masc
    if overrides.get("masc") is not None:
        masc = overrides["masc"]
    fem = 1.0 - masc
    S["masc"] = masc
    cls = overrides.get("cls") or _wchoice(r, CLASS_W[race])
    S["cls"] = cls
    # storybook proportions: big heads, short chunky bodies
    if race == "human":
        S["height"] = r.uniform(1.52, 1.62) * fem + r.uniform(1.58, 1.72) * masc
        S["heads"] = r.uniform(3.3, 3.6)
        S["leg_ratio"] = r.uniform(0.34, 0.37)
        S["bulk"] = r.uniform(1.2, 1.36)
        S["jaw"] = r.uniform(0.9, 1.0) * fem + r.uniform(1.0, 1.12) * masc
    elif race == "elf":
        S["height"] = r.uniform(1.62, 1.75)
        S["heads"] = r.uniform(3.6, 3.95)
        S["leg_ratio"] = r.uniform(0.37, 0.40)
        S["bulk"] = r.uniform(1.05, 1.15)
        S["jaw"] = r.uniform(0.86, 0.95)
    elif race == "dwarf":
        S["height"] = r.uniform(1.25, 1.36)
        S["heads"] = r.uniform(3.0, 3.3)
        S["leg_ratio"] = r.uniform(0.32, 0.35)
        S["bulk"] = r.uniform(1.35, 1.5)
        S["jaw"] = r.uniform(1.05, 1.2)
    else:  # orc
        S["height"] = r.uniform(1.72, 1.9)
        S["heads"] = r.uniform(3.35, 3.65)
        S["leg_ratio"] = r.uniform(0.34, 0.37)
        S["bulk"] = r.uniform(1.35, 1.5)
        S["jaw"] = r.uniform(1.2, 1.35)
    S["arm_angle"] = 45.0
    S["head_w"] = r.uniform(0.95, 1.05) * (1.06 if race == "orc" else 1.0)
    S["eye_scale"] = r.uniform(0.9, 1.15) * {"elf": 1.12, "orc": 0.8, "dwarf": 0.92}.get(race, 1.0)
    S["eye_spacing"] = r.uniform(0.40, 0.48)
    S["brow_angle"] = r.uniform(-14.0, 10.0) - (10.0 if race == "orc" else 0.0)
    S["brow_thick"] = 1.6 if race in ("orc", "dwarf") else r.uniform(0.9, 1.2)
    S["nose"] = _wchoice(r, [("none", .45), ("small", .4), ("big", .15 + (.35 if race in ("dwarf", "orc") else 0))])
    S["brows"] = r.random() < 0.55
    S["mouth"] = "none"
    S["blush"] = race == "elf" and r.random() < 0.3 or (fem > 0.5 and r.random() < 0.2)
    S["ears"] = {"elf": "elf", "orc": "orc"}.get(race, "round")
    S["tusks"] = race == "orc"
    # hair & beard
    hw = {
        "human": [("short", .28 * masc + .08), ("long", .3 * fem + .05), ("ponytail", .2 * fem + .05), ("braid", .1),
                  ("bun", .08), ("buzz", .1 * masc), ("bald", .06 * masc), ("spiky", .05 * masc), ("bob", .12 * fem)],
        "elf": [("long", .45), ("ponytail", .2), ("braid", .2), ("bun", .08), ("short", .07)],
        "dwarf": [("bald", .25), ("short", .2), ("long", .18), ("braid", .22), ("buzz", .15)],
        "orc": [("mohawk", .3), ("bald", .22), ("buzz", .14), ("ponytail", .17), ("braid", .17)],
    }[race]
    S["hair"] = _wchoice(r, hw)
    S["hair_volume"] = r.uniform(0.9, 1.15)
    S["fringe_side"] = r.choice([-1, 1])
    if race == "dwarf":
        S["beard"] = _wchoice(r, [("full", .3), ("long", .35), ("braided", .35)]) if masc > 0.5 else \
            _wchoice(r, [("none", .8), ("braided", .2)])
        S["beard_len"] = r.uniform(0.55, 0.95)
    elif race == "human" and masc > 0.5:
        S["beard"] = _wchoice(r, [("none", .45), ("short", .2), ("full", .15), ("goatee", .12), ("long", .08)])
        S["beard_len"] = r.uniform(0.2, 0.45)
    elif race == "orc" and masc > 0.5:
        S["beard"] = _wchoice(r, [("none", .7), ("short", .3)])
        S["beard_len"] = 0.2
    else:
        S["beard"] = "none"
        S["beard_len"] = 0.0
    S["moustache"] = S["beard"] in ("full", "long", "braided") or (S["beard"] != "none" and r.random() < 0.4)
    S["moustache_big"] = False
    S["warpaint"] = r.random() < (0.45 if race == "orc" else 0.12 if cls in ("warrior", "ranger") else 0.0)
    S["scar"] = r.random() < (0.3 if cls in ("warrior", "rogue") or race == "orc" else 0.05)
    S["eyepatch"] = r.random() < (0.07 if cls in ("warrior", "rogue") else 0.0)
    S["detail"] = "high"
    S["gear"] = pick_gear(r, race, cls, fem)
    if gear_ov.get("mage_kind"):
        S["cls"] = cls = "mage"
        apply_mage_kind(S["gear"], gear_ov["mage_kind"])
    mk = S["gear"]["mage_kind"]
    if mk == "wizard" and masc > 0.5:
        S["beard"], S["beard_len"], S["moustache"] = "wizard", r.uniform(0.8, 1.1), True
        S["hair"] = "long"
    elif mk == "alchemist" and masc > 0.5:
        S["beard"], S["moustache"], S["moustache_big"], S["nose"] = "none", True, True, "big"
        S["hair"] = "short"
    elif mk in ("pyromancer", "warlock", "frost"):
        S["beard"] = "none"
    if mk == "druid" and fem > 0.5:
        S["hair"] = "long"
    S["colors"] = make_colors(r, S)

    for k, v in overrides.items():
        if v is not None and k not in ("race", "cls", "masc"):
            S[k] = v
    S["gear"].update({k: v for k, v in gear_ov.items() if v is not None and k != "mage_kind"})
    if col_ov:
        S["colors"].update({k: (hex_rgb(v) if isinstance(v, str) else tuple(v)) for k, v in col_ov.items()})
    g = S["gear"]
    if g["helmet"] not in ("none", "circlet", "wizard") and S["hair"] in ("spiky", "bun", "mohawk"):
        S["hair"] = "short"
    if g["helmet"] == "great":
        S["eyepatch"] = False
    return S


# =============================================================================
#  Layout & skeleton (UE5 mannequin naming)
# =============================================================================

HEAD_KEYS = [  # f (0=chin .. 1=top), half-width, front depth, back depth, y offset
    (0.00, 0.60, 0.50, 0.45, -0.10),
    (0.12, 0.84, 0.80, 0.72, -0.05),
    (0.32, 0.96, 0.94, 0.90, -0.02),
    (0.55, 1.00, 0.95, 1.00, 0.00),
    (0.78, 0.97, 0.88, 1.00, 0.02),
    (0.93, 0.78, 0.68, 0.82, 0.03),
    (1.00, 0.45, 0.38, 0.48, 0.03),
]


def compute_layout(S):
    H = S["height"]
    h = H / S["heads"]
    b = S["masc"]
    k = S["bulk"]
    race = S["race"]
    wide = {"dwarf": 1.12, "orc": 1.1, "elf": 0.93}.get(race, 1.0)
    limb = {"dwarf": 1.18, "orc": 1.15, "elf": 0.9}.get(race, 1.0)
    L = dict(H=H, h=h)
    L["z_chin"] = H - h
    L["z_neck"] = L["z_chin"] - 0.10 * h
    L["z_sh"] = L["z_neck"] - 0.13 * h
    L["z_ankle"] = 0.05 * H
    L["z_hip"] = S["leg_ratio"] * H
    L["z_knee"] = L["z_ankle"] + (L["z_hip"] - L["z_ankle"]) * 0.49
    L["z_pelvis"] = L["z_hip"] + 0.035 * H
    L["T"] = L["z_neck"] - L["z_hip"]
    L["sh_half"] = H * (0.100 + 0.034 * b) * (0.92 + 0.08 * k) * wide
    L["chest_half"] = H * (0.080 + 0.026 * b) * k * wide
    L["waist_half"] = H * (0.068 + 0.010 * b) * k * wide
    L["hip_half"] = H * (0.084 + 0.014 * (1 - b)) * k * wide
    L["depth"] = H * (0.056 + 0.010 * b) * k * wide
    L["neck_r"] = h * (0.20 + 0.03 * b) * (1.15 if race == "orc" else 1.0)
    L["hw"] = h * 0.44 * S["head_w"]
    L["hd"] = h * 0.46
    L["head_cy"] = -0.05 * h
    L["thigh_r"] = min(H * (0.050 + 0.007 * b) * k * limb, L["hip_half"] * 0.56)
    L["x_hip"] = L["hip_half"] - L["thigh_r"] * 0.95
    L["upper_r"] = H * (0.034 + 0.008 * b) * k * limb
    # 胖瘦（DWDemo 加的）：weight 0.75 很瘦 · 1 正常 · 1.5 很胖。腰、肚子、大腿、胳膊跟着变，肩膀变得少。
    w = S.get("weight", 1.0)
    L["weight"] = w
    L["waist_half"] *= w ** 1.7
    L["hip_half"] *= w ** 1.0
    L["depth"] *= w ** 1.3
    L["chest_half"] *= w ** 0.8
    L["sh_half"] *= w ** 0.35
    L["thigh_r"] = min(L["thigh_r"] * w ** 1.1, L["hip_half"] * 0.6)
    L["x_hip"] = L["hip_half"] - L["thigh_r"] * 0.95
    L["upper_r"] *= w ** 1.0
    L["neck_r"] *= w ** 0.7
    L["upper_len"] = 0.15 * H
    L["fore_len"] = 0.13 * H
    L["hand_len"] = 0.15 * H * (1.08 if race == "dwarf" else 1.0)
    L["foot_len"] = 0.19 * H * (1.08 if race == "dwarf" else 1.0)
    a = math.radians(S["arm_angle"])
    sh = Vector((L["sh_half"] * 0.86, 0.0, L["z_sh"]))
    d1 = Vector((math.cos(a), 0.0, -math.sin(a)))
    elbow = sh + d1 * L["upper_len"]
    d2 = (d1 + Vector((0.0, -0.14, 0.0))).normalized()
    wrist = elbow + d2 * L["fore_len"]
    L.update(sh=sh, elbow=elbow, wrist=wrist, d_up=d1, d_fore=d2)
    hip = Vector((L["x_hip"], 0.0, L["z_hip"]))
    knee = Vector((L["x_hip"] * 1.12, -0.012 * H, L["z_knee"]))       # slightly wide, sturdy stance
    ankle = Vector((L["x_hip"] * 1.25, 0.0, L["z_ankle"]))
    F = L["foot_len"]
    L.update(hip=hip, knee=knee, ankle=ankle,
             ball=Vector((ankle.x, ankle.y - 0.60 * F, 0.022 * H)),
             toe=Vector((ankle.x, ankle.y - 0.86 * F, 0.018 * H)))
    g = S["gear"]
    grip = g["weapon_r"] != "none" or g["weapon_l"] in ("bow", "dagger")
    L["hand"] = compute_hand(L, grip)
    L["N"] = DETAIL[S.get("detail", "high")]
    return L


def compute_hand(L, grip=False):
    d = L["d_fore"]
    wr = L["wrist"]
    n0 = Vector((-1.0, 0.0, 0.0))
    n = (n0 - d * n0.dot(d)).normalized()
    w = n.cross(d).normalized()
    if w.y > 0:
        w = -w
    HL = L["hand_len"]
    pl, fl, pw, pt = 0.46 * HL, 0.42 * HL, 0.62 * HL, 0.26 * HL
    knuck = wr + d * pl
    c0, c1 = (40.0, 42.0) if grip else (14.0, 12.0)
    chains = {}
    for name, o, lf in (("index", 0.36, 0.95), ("middle", 0.12, 1.0), ("ring", -0.12, 0.93), ("pinky", -0.35, 0.78)):
        base = wr + d * (0.08 * pl) + w * (o * pw * 0.55)
        k0 = knuck + w * (o * pw)
        pts = [base, k0]
        cur = k0
        for j, frac in enumerate((0.45, 0.32, 0.23)):
            ang = math.radians(c0 + c1 * j)
            dirv = (d * math.cos(ang) + n * math.sin(ang) + w * (o * 0.15)).normalized()
            cur = cur + dirv * (fl * lf * frac)
            pts.append(cur)
        chains[name] = pts
    TL = 0.50 * HL
    t0 = wr + d * (0.18 * pl) + w * (0.36 * pw) + n * (0.20 * pt)
    tdir = (d * 0.75 + w * 0.55 + n * (0.45 if grip else 0.22)).normalized()
    t1 = t0 + tdir * (0.38 * TL)
    tdir2 = (tdir * 0.85 + d * 0.25 + n * (0.3 if grip else 0.12)).normalized()
    t2 = t1 + tdir2 * (0.33 * TL)
    tdir3 = (tdir2 * 0.85 + d * 0.2 + n * 0.15).normalized()
    t3 = t2 + tdir3 * (0.29 * TL)
    chains["thumb"] = [t0, t1, t2, t3]
    grip_pt = wr + d * (pl + 0.22 * fl) + n * (0.85 * pt)
    return dict(d=d, n=n, w=w, pl=pl, pw=pw, pt=pt, fl=fl, knuck=knuck, chains=chains, grip=grip_pt)


def mirror_name(n):
    if n.endswith("_l"):
        return n[:-2] + "_r"
    if n.endswith("_r"):
        return n[:-2] + "_l"
    return n


def mirror_v(v):
    return Vector((-v.x, v.y, v.z))


def compute_bones(S, L):
    H, h = L["H"], L["h"]
    bones = []

    def add(n, hd, tl, p):
        bones.append((n, Vector(hd), Vector(tl), p))

    add("root", (0, 0, 0), (0, 0, 0.12 * H), None)
    zp = L["z_pelvis"]
    add("pelvis", (0, 0, zp), (0, 0, zp + 0.03 * H), "root")
    z0, z5 = zp + 0.03 * H, L["z_neck"]
    prev = "pelvis"
    for i in range(5):
        ta, tb = i / 5.0, (i + 1) / 5.0
        ya, yb = 0.015 * h * math.sin(math.pi * ta), 0.015 * h * math.sin(math.pi * tb)
        nm = "spine_0%d" % (i + 1)
        add(nm, (0, ya, z0 + (z5 - z0) * ta), (0, yb, z0 + (z5 - z0) * tb), prev)
        prev = nm
    zh = L["z_chin"] + 0.18 * h
    zm = (z5 + zh) * 0.5
    add("neck_01", (0, 0, z5), (0, -0.005, zm), "spine_05")
    add("neck_02", (0, -0.005, zm), (0, -0.01, zh), "neck_01")
    add("head", (0, -0.01, zh), (0, L["head_cy"], H), "neck_02")
    left = []

    def addl(n, hd, tl, p):
        left.append((n, Vector(hd), Vector(tl), p))

    sh, el, wr = L["sh"], L["elbow"], L["wrist"]
    addl("clavicle_l", Vector((0.015 * H, -0.01 * H, L["z_sh"] + 0.06 * h)), sh, "spine_05")
    addl("upperarm_l", sh, el, "clavicle_l")
    addl("lowerarm_l", el, wr, "upperarm_l")
    hand_tail = wr + L["d_fore"] * (L["hand_len"] * 0.5)
    addl("hand_l", wr, hand_tail, "lowerarm_l")
    for nm, a, b, t0, t1 in (("upperarm_twist_01_l", sh, el, .5, .75), ("upperarm_twist_02_l", sh, el, .25, .5),
                             ("lowerarm_twist_01_l", el, wr, .5, .75), ("lowerarm_twist_02_l", el, wr, .25, .5)):
        addl(nm, a.lerp(b, t0), a.lerp(b, t1), nm.split("_twist")[0] + "_l")
    ch = L["hand"]["chains"]
    t = ch["thumb"]
    addl("thumb_01_l", t[0], t[1], "hand_l")
    addl("thumb_02_l", t[1], t[2], "thumb_01_l")
    addl("thumb_03_l", t[2], t[3], "thumb_02_l")
    for f in ("index", "middle", "ring", "pinky"):
        c = ch[f]
        addl("%s_metacarpal_l" % f, c[0], c[1], "hand_l")
        addl("%s_01_l" % f, c[1], c[2], "%s_metacarpal_l" % f)
        addl("%s_02_l" % f, c[2], c[3], "%s_01_l" % f)
        addl("%s_03_l" % f, c[3], c[4], "%s_02_l" % f)
    hp, kn, an, ba, to = L["hip"], L["knee"], L["ankle"], L["ball"], L["toe"]
    addl("thigh_l", hp, kn, "pelvis")
    addl("calf_l", kn, an, "thigh_l")
    addl("foot_l", an, ba, "calf_l")
    addl("ball_l", ba, to, "foot_l")
    for nm, a, b, t0, t1 in (("thigh_twist_01_l", hp, kn, .5, .75), ("thigh_twist_02_l", hp, kn, .25, .5),
                             ("calf_twist_01_l", kn, an, .5, .75), ("calf_twist_02_l", kn, an, .25, .5)):
        addl(nm, a.lerp(b, t0), a.lerp(b, t1), nm.split("_twist")[0] + "_l")
    bones.extend(left)
    for n, hd, tl, p in left:
        bones.append((mirror_name(n), mirror_v(hd), mirror_v(tl), mirror_name(p)))
    add("ik_foot_root", (0, 0, 0), (0, 0, 0.1 * H), "root")
    add("ik_foot_l", an, ba, "ik_foot_root")
    add("ik_foot_r", mirror_v(an), mirror_v(ba), "ik_foot_root")
    add("ik_hand_root", (0, 0, 0), (0, 0, 0.1 * H), "root")
    add("ik_hand_gun", mirror_v(wr), mirror_v(hand_tail), "ik_hand_root")
    add("ik_hand_l", wr, hand_tail, "ik_hand_gun")
    add("ik_hand_r", mirror_v(wr), mirror_v(hand_tail), "ik_hand_gun")
    return bones


# =============================================================================
#  Mesh building blocks
# =============================================================================

def flat_phase(n):
    """Ring phase that puts a flat face (not a vertex) at the front."""
    return ((n / 4.0) - 0.5) % 1.0


def ridge_phase(n):
    """Ring phase that puts a vertex (ridge) at the front."""
    return (flat_phase(n) + 0.5) % 1.0


class MeshBuilder:
    def __init__(self):
        self.verts, self.vw, self.faces, self.roles = [], [], [], []

    def v(self, p, w):
        self.verts.append(Vector(p))
        self.vw.append(w)
        return len(self.verts) - 1

    def f(self, idx, role):
        self.faces.append(tuple(idx))
        self.roles.append(role)

    def loft(self, rings, seg_roles, wfn, cap0=True, cap1=True):
        if isinstance(seg_roles, str):
            seg_roles = [seg_roles] * (len(rings) - 1)
        ids = [[self.v(p, wfn(p)) for p in r] for r in rings]
        n = len(rings[0])
        for i in range(len(rings) - 1):
            for j in range(n):
                jn = (j + 1) % n
                self.f((ids[i][j], ids[i][jn], ids[i + 1][jn], ids[i + 1][j]), seg_roles[i])
        if cap0:
            self.f(list(reversed(ids[0])), seg_roles[0])
        if cap1:
            self.f(ids[-1], seg_roles[-1])
        return ids

    def loop(self, secs, role, wfn):
        """Closed loop of cross-sections (wraps last -> first). secs: list of rings."""
        roles = [role] * len(secs) if isinstance(role, str) else role
        ids = [[self.v(p, wfn(p)) for p in s] for s in secs]
        m, k = len(secs), len(secs[0])
        for i in range(m):
            i2 = (i + 1) % m
            for j in range(k):
                j2 = (j + 1) % k
                self.f((ids[i][j], ids[i][j2], ids[i2][j2], ids[i2][j]), roles[i])
        return ids

    def poly(self, pts, role, wfn):
        ids = [self.v(p, wfn(p)) for p in pts]
        self.f(ids, role)
        return ids

    def fnormal(self, f):
        n = [0.0, 0.0, 0.0]
        pts = [self.verts[i] for i in f]
        m = len(pts)
        for i in range(m):
            a, b = pts[i], pts[(i + 1) % m]
            n[0] += (a.y - b.y) * (a.z + b.z)
            n[1] += (a.z - b.z) * (a.x + b.x)
            n[2] += (a.x - b.x) * (a.y + b.y)
        return Vector(n)

    def flip(self, f0):
        for fi in range(f0, len(self.faces)):
            self.faces[fi] = tuple(reversed(self.faces[fi]))

    def orient(self, f0, center=None, direction=None):
        rng = range(f0, len(self.faces))
        if not len(rng):
            return
        if direction is None and center is None:
            vs = set(i for fi in rng for i in self.faces[fi])
            center = sum((self.verts[i] for i in vs), Vector()) / len(vs)
        score = 0.0
        for fi in rng:
            f = self.faces[fi]
            nrm = self.fnormal(f)
            if direction is not None:
                score += nrm.dot(direction)
            else:
                c = sum((self.verts[i] for i in f), Vector()) / len(f)
                score += nrm.dot(c - center)
        if score < 0:
            self.flip(f0)

    def orient_radial(self, f0, a, b):
        """Open shells wrapped around the axis a-b (skirts, sleeves, capelets): normals point away from it."""
        ab = b - a
        L2 = max(1e-12, ab.length_squared)
        score = 0.0
        for fi in range(f0, len(self.faces)):
            f = self.faces[fi]
            c = sum((self.verts[i] for i in f), Vector()) / len(f)
            t = max(0.0, min(1.0, (c - a).dot(ab) / L2))
            score += self.fnormal(f).dot(c - (a + ab * t))
        if score < 0:
            self.flip(f0)

    def orient_closed(self, f0):
        """Signed-volume test: robust for closed shells of any shape."""
        vol = 0.0
        for fi in range(f0, len(self.faces)):
            f = self.faces[fi]
            a = self.verts[f[0]]
            for i in range(1, len(f) - 1):
                b, c = self.verts[f[i]], self.verts[f[i + 1]]
                vol += a.dot(b.cross(c))
        if vol < 0:
            self.flip(f0)

    def merge(self, other, mirror=False):
        off = len(self.verts)
        for p, w in zip(other.verts, other.vw):
            if mirror:
                p = mirror_v(p)
                w = {mirror_name(k): x for k, x in w.items()}
            self.verts.append(p.copy())
            self.vw.append(dict(w))
        for f, r in zip(other.faces, other.roles):
            f2 = tuple(i + off for i in f)
            if mirror:
                f2 = tuple(reversed(f2))
            self.faces.append(f2)
            self.roles.append(r)

    def bvh(self):
        return BVHTree.FromPolygons(self.verts, self.faces)


def frame(axis, ref):
    d = axis.normalized()
    v1 = ref - d * ref.dot(d)
    if v1.length < 1e-6:
        alt = Vector((1.0, 0.0, 0.0)) if abs(d.x) < 0.9 else Vector((0.0, 0.0, 1.0))
        v1 = alt - d * alt.dot(d)
    v1 = v1.normalized()
    v2 = d.cross(v1).normalized()
    return d, v1, v2


def ring_pts(center, axis, ref, rx, ryf, ryb=None, n=8, phase=0.0, ex=2.0):
    if ryb is None:
        ryb = ryf
    d, v1, v2 = frame(axis, ref)
    pts = []
    for i in range(n):
        t = TAU * (i + phase) / n
        c, s = math.cos(t), math.sin(t)
        cx = math.copysign(abs(c) ** (2.0 / ex), c)
        sy = math.copysign(abs(s) ** (2.0 / ex), s)
        ry = ryf if sy > 0 else ryb
        pts.append(center + v2 * (rx * cx) + v1 * (ry * sy))
    return pts


class Path:
    def __init__(self, pts):
        self.p = [Vector(x) for x in pts]
        self.cum = [0.0]
        for a, b in zip(self.p, self.p[1:]):
            self.cum.append(self.cum[-1] + (b - a).length)
        self.length = self.cum[-1]

    def at(self, s):
        P, C = self.p, self.cum
        if s <= 0:
            d = (P[1] - P[0]).normalized()
            return P[0] + d * s, d
        if s >= C[-1]:
            d = (P[-1] - P[-2]).normalized()
            return P[-1] + d * (s - C[-1]), d
        for i in range(len(P) - 1):
            if s <= C[i + 1]:
                seg = P[i + 1] - P[i]
                u = (s - C[i]) / max(1e-9, C[i + 1] - C[i])
                d = seg.normalized()
                if i + 1 < len(P) - 1 and C[i + 1] - s < 1e-6:
                    d = (d + (P[i + 2] - P[i + 1]).normalized()).normalized()
                return P[i] + seg * u, d
        return P[-1], (P[-1] - P[-2]).normalized()


def interp_station(st, s):
    def unpack(e):
        off = e[4] if len(e) > 4 else Vector((0, 0, 0))
        return e[1], e[2], e[3], Vector(off)
    if s <= st[0][0]:
        return unpack(st[0])
    if s >= st[-1][0]:
        return unpack(st[-1])
    for a, b in zip(st, st[1:]):
        if s <= b[0]:
            t = (s - a[0]) / max(1e-9, b[0] - a[0])
            A, B = unpack(a), unpack(b)
            return (A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t,
                    A[2] + (B[2] - A[2]) * t, A[3] + (B[3] - A[3]) * t)
    return unpack(st[-1])


def build_tube(B, path, stations, zones, n, phase, ref, wfn, cap0=True, cap1=True,
               flare=1.1, delta=0.012, ex=2.0):
    """Loft along `path` with clothing `zones` = [(s_end, role, scale, edge[, flare]), ...].
    edge: 'self' = cuff at end of this zone, 'next' = next zone overhangs this one, None = colour change."""
    s_list = [e[0] for e in stations]
    s0, s1 = s_list[0], s_list[-1]

    def zone_at(s):
        for z in zones:
            if s < z[0] - 1e-9:
                return z
        return zones[-1]

    bounds = [z[0] for z in zones[:-1] if s0 < z[0] < s1]
    entries = []
    for s in s_list:
        if s not in (s0, s1) and any(abs(s - sb) < delta * 1.6 for sb in bounds):
            continue
        z = zone_at(s)
        entries.append([s, z[2], z[1]])
    for zi, z in enumerate(zones[:-1]):
        sb = z[0]
        if not (s0 < sb < s1):
            continue
        nz = zones[zi + 1]
        fl = z[4] if len(z) > 4 else flare
        if z[3] == "self":
            entries.append([sb, z[2] * fl, z[1]])
            entries.append([sb + delta, nz[2], nz[1]])
        elif z[3] == "next":
            entries.append([sb - delta, z[2], nz[1]])
            entries.append([sb, nz[2] * fl, nz[1]])
        else:
            entries.append([sb, (z[2] + nz[2]) * 0.5, nz[1]])
    entries.sort(key=lambda e: e[0])
    rings, roles = [], []
    for s, sc, role in entries:
        c, ax = path.at(s)
        rx, ryf, ryb, off = interp_station(stations, s)
        rings.append(ring_pts(c + off, ax, ref, rx * sc, ryf * sc, ryb * sc, n, phase, ex))
        roles.append(role)
    f0 = len(B.faces)
    B.loft(rings, roles[:-1], wfn, cap0, cap1)
    if cap0 and cap1:
        B.orient_closed(f0)
    else:
        B.orient(f0)
    return rings


def sphere(B, center, rx, ry, rz, role, wfn, n=8, rings=(-62, -25, 15, 55)):
    pts = []
    for a in rings:
        ar = math.radians(a)
        c = center + Vector((0, 0, rz * math.sin(ar)))
        pts.append(ring_pts(c, UP, FRONT, rx * math.cos(ar), ry * math.cos(ar), None, n, flat_phase(n)))
    f0 = len(B.faces)
    B.loft(pts, role, wfn, True, True)
    B.orient_closed(f0)


def torus(B, center, axis, R, r, role, wfn, nmaj=10, nmin=5, squash=1.0, rx_scale=1.0, ry_scale=1.0):
    d, v1, v2 = frame(axis, FRONT if abs(axis.normalized().y) < 0.9 else UP)
    secs = []
    for i in range(nmaj):
        a = TAU * (i + 0.5) / nmaj
        rad = (v2 * (math.cos(a) * rx_scale) + v1 * (math.sin(a) * ry_scale))
        c = center + rad * R
        radn = rad.normalized()
        secs.append([c + radn * (r * math.cos(TAU * j / nmin)) + d * (r * squash * math.sin(TAU * j / nmin))
                     for j in range(nmin)])
    f0 = len(B.faces)
    B.loop(secs, role, wfn)
    B.orient_closed(f0)


def box_between(B, p0, p1, wa, wb, role, wfn, ref=UP, n=4):
    rings = [ring_pts(p0, p1 - p0, ref, wa, wb, None, n, 0.5),
             ring_pts(p1, p1 - p0, ref, wa, wb, None, n, 0.5)]
    f0 = len(B.faces)
    B.loft(rings, role, wfn, True, True)
    B.orient_closed(f0)


def pyramid(B, base_center, nrm, t1, r1, r2, length, role, wfn, tip_shift=None, sides=4, rot=0.0):
    nrm = nrm.normalized()
    t1 = (t1 - nrm * t1.dot(nrm))
    if t1.length < 1e-6:
        t1 = frame(nrm, UP)[1]
    t1 = t1.normalized()
    t2 = nrm.cross(t1).normalized()
    base = [base_center + t1 * (r1 * math.cos(TAU * (i + 0.5) / sides + rot)) +
            t2 * (r2 * math.sin(TAU * (i + 0.5) / sides + rot)) for i in range(sides)]
    tip = base_center + nrm * length + (tip_shift if tip_shift is not None else Vector())
    ids = [B.v(p, wfn(p)) for p in base]
    it = B.v(tip, wfn(tip))
    f0 = len(B.faces)
    for i in range(sides):
        B.f((ids[i], ids[(i + 1) % sides], it), role)
    B.f(list(reversed(ids)), role)
    B.orient_closed(f0)


def bipyramid(B, center, axis, r, l_up, l_dn, role, wfn, sides=4):
    d, v1, v2 = frame(axis, FRONT)
    ring = [center + v2 * (r * math.cos(TAU * i / sides)) + v1 * (r * math.sin(TAU * i / sides)) for i in range(sides)]
    ids = [B.v(p, wfn(p)) for p in ring]
    t = B.v(center + d * l_up, wfn(center))
    b = B.v(center - d * l_dn, wfn(center))
    f0 = len(B.faces)
    for i in range(sides):
        i2 = (i + 1) % sides
        B.f((ids[i], ids[i2], t), role)
        B.f((ids[i2], ids[i], b), role)
    B.orient_closed(f0)


def slab(B, pts2d, origin, ax_u, ax_v, ax_t, thick, role_face, role_side, wfn):
    """Extruded polygon (fan-triangulated faces, safe for concave star shapes)."""
    m = len(pts2d)
    cu = sum(p[0] for p in pts2d) / m
    cv = sum(p[1] for p in pts2d) / m
    f0 = len(B.faces)
    ids = {}
    for side, sgn in (("f", 1), ("b", -1)):
        ring = [B.v(origin + ax_u * u + ax_v * v + ax_t * (sgn * thick * 0.5), wfn(origin)) for u, v in pts2d]
        c = B.v(origin + ax_u * cu + ax_v * cv + ax_t * (sgn * thick * 0.5), wfn(origin))
        ids[side] = ring
        for i in range(m):
            tri = (c, ring[i], ring[(i + 1) % m])
            B.f(tri if sgn > 0 else tuple(reversed(tri)), role_face)
    for i in range(m):
        i2 = (i + 1) % m
        B.f((ids["f"][i2], ids["f"][i], ids["b"][i], ids["b"][i2]), role_side)
    B.orient_closed(f0)


def cap_shell(B, center, axis, R, phi0, phi1, steps, n, roles, wfn, ref=FRONT, thick=0.01, rx_scale=1.0):
    """Spherical cap (pauldron / knee cop / boss) with an inner lip for thickness."""
    d, _, _ = frame(axis, ref)
    rings = []
    for k in range(steps + 1):
        phi = math.radians(phi0 + (phi1 - phi0) * k / steps)
        c = center + d * (R * math.cos(phi))
        r = R * math.sin(phi)
        rings.append(ring_pts(c, d, ref, r * rx_scale, r, r, n, flat_phase(n)))
    phi = math.radians(phi1)
    c = center + d * (R * math.cos(phi) + thick)
    r = max(0.001, R * math.sin(phi) - thick)
    rings.append(ring_pts(c, d, ref, r * rx_scale, r, r, n, flat_phase(n)))
    if isinstance(roles, str):
        roles = [roles] * (len(rings) - 1)
    f0 = len(B.faces)
    B.loft(rings, roles, wfn, phi0 < 20, False)
    B.orient(f0, center=center)


def arc_loft(B, levels, roles, wfn):
    """levels: list of (outer_pts, inner_pts). Closed thin strip shell (capes, beards, masks)."""
    m = len(levels[0][0])
    rings = [list(o) + list(reversed(i)) for o, i in levels]
    if isinstance(roles, str):
        roles = [roles] * (len(rings) - 1)
    f0 = len(B.faces)
    ids = B.loft(rings, roles, wfn, False, False)
    for ri, role in ((0, roles[0]), (len(ids) - 1, roles[-1])):
        r = ids[ri]
        for i in range(m - 1):
            q = (r[i], r[i + 1], r[2 * m - 2 - i], r[2 * m - 1 - i])
            B.f(tuple(reversed(q)) if ri == 0 else q, role)
    B.orient_closed(f0)


def project(bvh, p, direction, back=0.25, off=0.003):
    direction = direction.normalized()
    hit = bvh.ray_cast(p - direction * back, direction)
    if hit[0] is None:
        return p.copy(), None
    nrm = Vector(hit[1])
    if nrm.dot(direction) > 0:
        nrm = -nrm
    return Vector(hit[0]) + nrm * off, nrm


def _tangents(nrm):
    t1 = UP.cross(nrm)
    if t1.length < 1e-6:
        t1 = Vector((1, 0, 0))
    t1 = t1.normalized()
    return t1, nrm.cross(t1).normalized()


def decal(B, bvh, center, nrm, pts2d, role, wfn, off=0.003):
    nrm = nrm.normalized()
    t1, t2 = _tangents(nrm)
    pts = []
    for (u, v) in pts2d:
        p = center + t1 * u + t2 * v
        q, _ = project(bvh, p + nrm * 0.05, -nrm, back=0.0, off=off)
        pts.append(q)
    f0 = len(B.faces)
    B.poly(pts, role, wfn)
    B.orient(f0, direction=nrm)


def decal_strip(B, bvh, center, nrm, length, width, angle, segs, role, wfn, off=0.003, taper=0.0):
    """Surface-conforming strip of quads (war paint, scars, slits)."""
    nrm = nrm.normalized()
    t1, t2 = _tangents(nrm)
    ca, sa = math.cos(angle), math.sin(angle)
    du, dv = t1 * ca + t2 * sa, -t1 * sa + t2 * ca
    rows = []
    for i in range(segs + 1):
        u = -length / 2 + length * i / segs
        wv = width * (1 - taper * abs(2 * i / segs - 1)) / 2
        row = []
        for v in (-wv, wv):
            q, _ = project(bvh, center + du * u + dv * v + nrm * 0.05, -nrm, back=0.0, off=off)
            row.append(B.v(q, wfn(q)))
        rows.append(row)
    f0 = len(B.faces)
    for i in range(segs):
        B.f((rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]), role)
    B.orient(f0, direction=nrm)


def ellipse2d(rx, ry, n=8, rot=0.0, cx=0.0, cy=0.0, phase=0.5):
    out = []
    for i in range(n):
        a = TAU * (i + phase) / n
        x, y = rx * math.cos(a), ry * math.sin(a)
        out.append((cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)))
    return out


# =============================================================================
#  Skin weights
# =============================================================================

def seg_dist(p, a, b):
    ab = b - a
    L2 = ab.length_squared
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, (p - a).dot(ab) / L2))
    return (p - (a + ab * t)).length


def wf_chain(BN, names, power=4.0, maxinf=3):
    segs = [(n, BN[n][0], BN[n][1]) for n in names]

    def f(p):
        ws = sorted(((1.0 / (seg_dist(p, a, b) + 1e-4) ** power, n) for n, a, b in segs), reverse=True)[:maxinf]
        tot = sum(w for w, _ in ws)
        out = {n: w / tot for w, n in ws if w / tot > 0.04}
        t2 = sum(out.values())
        return {n: w / t2 for n, w in out.items()}
    return f


def wf_rigid(name):
    return lambda p: {name: 1.0}


def wf_hair(L):
    zc, h = L["z_chin"], L["h"]

    def f(p):
        if p.z >= zc:
            return {"head": 1.0}
        t = min(1.0, (zc - p.z) / (0.75 * h))
        if t > 0.97:
            return {"spine_05": 1.0}
        if t < 0.5:
            return {"head": 1.0 - t, "neck_02": t}
        return {"neck_02": 1.0 - t, "spine_05": t}
    return f


# =============================================================================
#  Head, face, beard, hair, hood, helmets
# =============================================================================

def head_prof(L, S, f):
    K = HEAD_KEYS
    if f <= K[0][0]:
        e = K[0]
    elif f >= K[-1][0]:
        e = K[-1]
    else:
        e = None
        for a, b in zip(K, K[1:]):
            if f <= b[0]:
                t = (f - a[0]) / (b[0] - a[0])
                e = tuple(a[i] + (b[i] - a[i]) * t for i in range(5))
                break
    jw = 1.0 + (S["jaw"] - 1.0) * max(0.0, min(1.0, (0.42 - f) / 0.32))
    cheek = 1.0 + 0.05 * (1.0 - S["masc"]) * max(0.0, 1.0 - abs(f - 0.32) / 0.2)
    return (e[1] * L["hw"] * jw * cheek, e[2] * L["hd"], e[3] * L["hd"], e[4] * L["hd"])


def head_center(L):
    return Vector((0.0, L["head_cy"], L["z_chin"] + 0.5 * L["h"]))


def head_surf(L, S, f, th, add=0.0, straight=True):
    fe = max(f, 0.52) if straight else f
    hx, hyf, hyb, yo = head_prof(L, S, fe)
    c, s = math.cos(th), math.sin(th)
    ry = hyf if s > 0 else hyb
    P = Vector((hx * c, L["head_cy"] + yo - ry * s, L["z_chin"] + f * L["h"]))
    C = head_center(L)
    v = P - C
    return C + v.normalized() * (v.length + add)


def build_head(S, L):
    Bh = MeshBuilder()
    n = L["N"]["head"]
    fs = [0.0, 0.12, 0.3, 0.5, 0.7, 0.86, 0.96, 1.0]
    rings = []
    for f in fs:
        hx, hyf, hyb, yo = head_prof(L, S, f)
        c = Vector((0.0, L["head_cy"] + yo, L["z_chin"] + f * L["h"]))
        rings.append(ring_pts(c, UP, FRONT, hx, hyf, hyb, n, flat_phase(n), 2.5))
    Bh.loft(rings, "skin", wf_rigid("head"))
    Bh.orient_closed(0)
    return Bh


def face_hidden(S):
    g = S["gear"]
    return g["helmet"] == "great"


def build_face(B, bvh, S, L):
    h, hw = L["h"], L["hw"]
    W = wf_rigid("head")
    g = S["gear"]
    es = S["eye_scale"]
    ew, eh = 0.05 * h * es, 0.10 * h * es       # storybook: small vertical bar eyes
    ze = L["z_chin"] + 0.42 * h
    eye_info = {}
    for side in (1, -1):
        x = side * S["eye_spacing"] * hw * 0.88
        q, nrm = project(bvh, Vector((x, -1.0, ze)), BACK, back=0.0, off=0.0)
        if nrm is None:
            continue
        eye_info[side] = (q, nrm)
        patched = S["eyepatch"] and side == -1
        if patched:
            decal(B, bvh, q, nrm, ellipse2d(ew * 0.75, eh * 0.62, 8), "leather_dark", W, off=0.005)
        else:
            tilt = math.radians(-6.0 * side) if S["race"] in ("elf", "orc") else 0.0
            pts = [(-ew / 2, -eh / 2), (ew / 2, -eh / 2), (ew * 0.5, eh * 0.38), (ew * 0.3, eh / 2), (-ew * 0.3, eh / 2), (-ew * 0.5, eh * 0.38)]
            pts = [(u * math.cos(tilt) - v * math.sin(tilt), u * math.sin(tilt) + v * math.cos(tilt)) for u, v in pts]
            decal(B, bvh, q, nrm, pts, "eye", W, off=0.0035)
        # brow
        zb = ze + eh * 0.5 + 0.045 * h
        qb, nb = project(bvh, Vector((x * 1.05, -1.0, zb)), BACK, back=0.0, off=0.0)
        if nb is not None and (S["brows"] or S["race"] in ("orc", "dwarf")):
            ang = math.radians(S["brow_angle"]) * (-side)
            decal_strip(B, bvh, qb, nb, 0.10 * h, 0.022 * h * S["brow_thick"], ang, 2, "brow", W, off=0.0045, taper=0.25)
        if S["blush"]:
            qc, nc = project(bvh, Vector((side * hw * 0.62, -1.0, L["z_chin"] + 0.33 * h)), BACK, back=0.0, off=0.0)
            if nc is not None:
                decal(B, bvh, qc, nc, ellipse2d(0.06 * h, 0.03 * h, 6), "blush", W, off=0.0025)
        if S["warpaint"]:
            qp, np_ = project(bvh, Vector((side * hw * 0.5, -1.0, L["z_chin"] + 0.3 * h)), BACK, back=0.0, off=0.0)
            if np_ is not None:
                for k in range(2):
                    decal_strip(B, bvh, qp + Vector((side * 0.035 * h * k, 0, 0)), np_, 0.16 * h, 0.022 * h,
                                math.radians(95), 3, "paint", W, off=0.0028)
        # ears
        if g["hood"] != "up" and not face_hidden(S):
            ye = L["head_cy"] + 0.08 * L["hd"]
            qe, ne = project(bvh, Vector((side * 1.0, ye, L["z_chin"] + 0.43 * h)), Vector((-side, 0, 0)), back=0.0, off=-0.004)
            if ne is not None:
                if S["ears"] == "round":
                    rings = [ring_pts(qe, ne, UP, 0.05 * h, 0.085 * h, 0.075 * h, 6, 0.0),
                             ring_pts(qe + ne * 0.045 * h + BACK * 0.01 * h, ne, UP, 0.045 * h, 0.08 * h, 0.07 * h, 6, 0.0)]
                    f0 = len(B.faces)
                    B.loft(rings, "skin", W, True, True)
                    B.orient_closed(f0)
                else:
                    L_tip = 0.30 * h if S["ears"] == "elf" else 0.14 * h
                    up = 0.75 if S["ears"] == "elf" else 0.4
                    tipdir = (ne * 0.75 + BACK * 0.45 + UP * up).normalized()
                    rings = [ring_pts(qe, ne, UP, 0.045 * h, 0.08 * h, 0.07 * h, 6, 0.0),
                             ring_pts(qe + ne * 0.03 * h + tipdir * 0.35 * L_tip, tipdir, ne, 0.02 * h, 0.045 * h, 0.035 * h, 6, 0.0),
                             ring_pts(qe + ne * 0.04 * h + tipdir * L_tip, tipdir, ne, 0.004 * h, 0.006 * h, 0.006 * h, 6, 0.0)]
                    f0 = len(B.faces)
                    B.loft(rings, "skin", W, True, True)
                    B.orient_closed(f0)
    # scar across one eye
    if S["scar"] and 1 in eye_info:
        q, nrm = eye_info[1]
        decal_strip(B, bvh, q + Vector((0, 0, 0.02 * h)), nrm, 0.32 * h, 0.018 * h, math.radians(-70), 5, "scar", W,
                    off=0.0075, taper=0.6)
    # eyepatch strap
    if S["eyepatch"]:
        secs = []
        nsec = 16
        for i in range(nsec):
            th = TAU * i / nsec
            phi = math.degrees(th) - 115.0
            phi = (phi + 180.0) % 360.0 - 180.0
            if phi < 0:
                tt = min(1.0, -phi / 70.0)
            else:
                tt = max(0.0, min(1.0, (phi - 90.0) / 90.0))
            fc = 0.46 + 0.32 * (tt * tt * (3 - 2 * tt))
            secs.append([head_surf(L, S, fc - 0.02, th, add=0.004 * h, straight=False),
                         head_surf(L, S, fc + 0.02, th, add=0.004 * h, straight=False),
                         head_surf(L, S, fc + 0.02, th, add=0.012 * h, straight=False),
                         head_surf(L, S, fc - 0.02, th, add=0.012 * h, straight=False)])
        f0 = len(B.faces)
        B.loop(secs, "leather_dark", W)
        B.orient_closed(f0)
    # nose
    if not g["mask"] and S["nose"] != "none":
        qn, nn = project(bvh, Vector((0.0, -1.0, L["z_chin"] + 0.3 * h)), BACK, back=0.0, off=-0.006)
        if nn is not None:
            k = 1.0 if S["nose"] == "small" else 1.7
            pyramid(B, qn, nn, Vector((1, 0, 0)), 0.035 * h * k, 0.035 * h * k, 0.05 * h * k, "skin", W,
                    tip_shift=Vector((0, 0, -0.012 * h * k)), sides=4, rot=0.0)
    # mouth (hidden by full beards / masks)
    if S["mouth"] != "none" and not g["mask"] and S["beard"] not in ("full", "long", "braided"):
        qm, nm = project(bvh, Vector((0.0, -1.0, L["z_chin"] + 0.17 * h)), BACK, back=0.0, off=0.0)
        if nm is not None:
            if S["mouth"] == "smile":
                mw, mh = 0.07 * h, 0.04 * h
                pts = [(mw * math.cos(a), mh * math.sin(a)) for a in [math.pi * (1.0 + i / 6.0) for i in range(7)]]
                decal(B, bvh, qm, nm, pts, "mouth", W, off=0.003)
            else:
                decal_strip(B, bvh, qm, nm, 0.12 * h, 0.018 * h, 0.0, 3, "mouth", W, off=0.003)
    # tusks
    if S["tusks"]:
        for side in (1, -1):
            qt, nt = project(bvh, Vector((side * 0.3 * hw, -1.0, L["z_chin"] + 0.12 * h)), BACK, back=0.0, off=-0.004)
            if nt is not None:
                dirv = (UP * 0.85 + nt * 0.35 + Vector((side * 0.15, 0, 0))).normalized()
                pyramid(B, qt, dirv, Vector((1, 0, 0)), 0.025 * h, 0.02 * h, 0.12 * h, "bone", W, sides=5)


def hair_flow(ff, fs, fb):
    def fl(th):
        fw = math.sin(th)
        return fs + (ff - fs) * max(fw, 0.0) ** 1.3 + (fb - fs) * max(-fw, 0.0) ** 1.3
    return fl


def dome(B, S, L, flow, spec, roles, wfn, n=12, cap_top=True, jitter=0.0, seed=0, back_point=0.0, tip=None):
    ths = [TAU * (i + 0.5) / n for i in range(n)]
    jr = random.Random(seed)
    rings = []
    for ri, (u, add) in enumerate(spec):
        ring = []
        for th in ths:
            f0 = flow(th)
            f = f0 + (1.0 - f0) * u
            a = add * (1.0 + jitter * jr.uniform(-1.0, 1.0)) if (ri > 1 and jitter) else add
            a += back_point * max(0.0, -math.sin(th)) * u ** 2
            pt = head_surf(L, S, f, th, add=a)
            if tip is not None:
                kk = max(0.0, (u - 0.55) / 0.45) ** 2
                pt = pt + Vector((0.0, tip[0] * kk, tip[1] * kk))
            ring.append(pt)
        rings.append(ring)
    f0 = len(B.faces)
    B.loft(rings, roles, wfn, False, cap_top)
    B.orient(f0, center=head_center(L) + Vector((0, 0, -0.2 * L["h"])))
    return rings


def std_spec(thick, puff=0.0, flare=0.0, us=(0.0, 0.2, 0.45, 0.7, 0.88, 0.97)):
    sp = [(0.0, thick * 0.12)]
    for u in us:
        a = thick * (1.0 + puff * math.sin(math.pi * min(1.0, 0.15 + u))) + flare * (1.0 - u) ** 2
        sp.append((u, a))
    return sp


def build_braid(B, pts, h, role, wfn, r0=0.07, tie_role="leather_dark", bead_role=None):
    pth = Path(pts)
    Lp = pth.length
    segs = 7
    st = []
    for i in range(segs * 2 + 1):
        s = Lp * i / (segs * 2)
        rr = r0 * h * (1.0 - 0.55 * s / Lp) * (1.0 if i % 2 == 0 else 0.72)
        st.append((s, rr, rr, rr))
    zones = [(Lp * 0.86, role, 1.0, None), (Lp * 0.93, bead_role or tie_role, 1.15, None), (1e9, role, 0.9, None)]
    build_tube(B, pth, st, zones, 6, 0.0, Vector((1, 0, 0)), wfn, True, True)


def build_hair(B, S, L):
    style = S["hair"]
    g = S["gear"]
    if style == "bald" or g["hood"] == "up" or g["helmet"] == "great":
        return
    h = L["h"]
    vol = S["hair_volume"]
    W = wf_hair(L)
    Wh = wf_rigid("head")
    r = random.Random(S["seed"] * 31 + 5)
    th = 0.05 * h * vol
    n = L["N"]["hair"]
    js = S["seed"] * 13 + 1
    C = head_center(L)
    helmet = g["helmet"] not in ("none", "circlet")
    if style in ("short", "spiky"):
        dome(B, S, L, hair_flow(0.76, 0.50, 0.30), std_spec(th, 0.45), "hair", W, n=n, jitter=0.35, seed=js)
    elif style == "buzz":
        dome(B, S, L, hair_flow(0.79, 0.52, 0.40), std_spec(0.022 * h), "hair", W, n=n)
    elif style == "mohawk":
        dome(B, S, L, hair_flow(0.80, 0.55, 0.42), std_spec(0.012 * h), "hair", W, n=n)
    elif style == "bob":
        dome(B, S, L, hair_flow(0.75, 0.08, 0.06), std_spec(0.06 * h * vol, 0.45, 0.05 * h), "hair", W, n=n, jitter=0.2, seed=js)
    elif style == "long":
        fs, fb = (-0.30, -0.75) if S["race"] != "elf" else (-0.45, -1.0)
        dome(B, S, L, hair_flow(0.76, fs, fb), std_spec(0.06 * h * vol, 0.4, 0.045 * h,
                                                        us=(0.0, 0.15, 0.35, 0.55, 0.75, 0.9, 0.97)),
             "hair", W, n=n, jitter=0.2, seed=js)
    elif style in ("ponytail", "bun", "braid"):
        dome(B, S, L, hair_flow(0.76, 0.45, 0.33), std_spec(0.035 * h * vol, 0.15), "hair", W, n=n)
    # fringe
    if not helmet and (style in ("bob", "long") or (style == "short" and r.random() < 0.6)):
        ff = 0.75 if style != "short" else 0.76
        nlocks = 6 if style != "short" else 4
        drop = 0.11 if style != "short" else 0.08
        span = (55, 125) if style != "short" else (60, 120)
        side = S["fringe_side"]
        for i in range(nlocks):
            t = (i + 0.5) / nlocks
            ang = math.radians(span[0] + (span[1] - span[0]) * t)
            dth = math.radians((span[1] - span[0]) / nlocks * 0.62)
            sweep = math.radians(14.0 * side) if style == "short" else 0.0
            thick = th * (1.1 if style != "short" else 1.2)
            A = head_surf(L, S, ff + 0.08, ang - dth, add=thick)
            Bp = head_surf(L, S, ff + 0.08, ang + dth, add=thick)
            Cc = head_surf(L, S, ff + 0.13, ang, add=thick * 0.2)
            T = head_surf(L, S, max(0.63, ff - drop * (0.75 + 0.5 * r.random())), ang + sweep, add=thick * 0.85)
            ids = [B.v(p, Wh(p)) for p in (A, Bp, Cc, T)]
            f0 = len(B.faces)
            B.f((ids[0], ids[1], ids[3]), "hair")
            B.f((ids[1], ids[2], ids[3]), "hair")
            B.f((ids[2], ids[0], ids[3]), "hair")
            B.f((ids[0], ids[2], ids[1]), "hair")
            B.orient_closed(f0)
    if style == "spiky" and not helmet:
        for i in range(r.randint(9, 13)):
            f = r.uniform(0.72, 0.97)
            ang = r.uniform(0, TAU)
            if math.sin(ang) > 0.6 and f < 0.85:
                f = 0.88
            base = head_surf(L, S, f, ang, add=th * 0.6)
            radial = (base - C).normalized()
            pyramid(B, base, (radial + UP * 0.55 + BACK * 0.25).normalized(),
                    radial.cross(UP) if abs(radial.z) < 0.95 else Vector((1, 0, 0)),
                    0.075 * h, 0.06 * h, r.uniform(0.13, 0.24) * h, "hair", Wh, sides=4, rot=r.uniform(0, 1))
    elif style == "mohawk" and not helmet:
        path = [(0.83, math.pi / 2), (0.93, math.pi / 2), (1.0, math.pi / 2), (0.92, 3 * math.pi / 2),
                (0.80, 3 * math.pi / 2), (0.66, 3 * math.pi / 2), (0.52, 3 * math.pi / 2)]
        for i, (f, ang) in enumerate(path):
            base = head_surf(L, S, f, ang, add=0.01 * h)
            radial = (base - C).normalized()
            k = math.sin(math.pi * (i + 0.7) / (len(path) + 0.4))
            pyramid(B, base, (radial + BACK * 0.35).normalized(), Vector((1, 0, 0)),
                    0.03 * h, 0.085 * h, (0.12 + 0.13 * k) * h, "hair", Wh, sides=4)
    elif style == "ponytail":
        fstart = 0.62 if not helmet else 0.42
        P0 = head_surf(L, S, fstart, 3 * math.pi / 2, add=0.0)
        pts = [P0 + Vector((0, -0.02 * h, 0)), P0 + Vector((0, 0.12 * h, -0.04 * h)),
               P0 + Vector((0, 0.2 * h, -0.4 * h)), P0 + Vector((0, 0.16 * h, -0.85 * h))]
        pth = Path(pts)
        Lp = pth.length
        st = [(0.0, 0.10 * h, 0.10 * h, 0.10 * h), (0.12 * Lp, 0.12 * h, 0.12 * h, 0.12 * h),
              (0.35 * Lp, 0.13 * h, 0.12 * h, 0.13 * h), (0.75 * Lp, 0.085 * h, 0.08 * h, 0.08 * h),
              (Lp, 0.025 * h, 0.025 * h, 0.025 * h)]
        zones = [(0.10 * Lp, "hair", 1.0, None), (0.17 * Lp, "leather_dark", 1.2, None), (1e9, "hair", 1.0, None)]
        build_tube(B, pth, st, zones, 6, 0.0, Vector((1, 0, 0)), W, True, True)
    elif style == "braid":
        fstart = 0.6 if not helmet else 0.42
        P0 = head_surf(L, S, fstart, 3 * math.pi / 2, add=0.0)
        build_braid(B, [P0 + Vector((0, -0.03 * h, 0)), P0 + Vector((0, 0.1 * h, -0.15 * h)),
                        P0 + Vector((0, 0.16 * h, -0.6 * h)), P0 + Vector((0, 0.15 * h, -1.05 * h))],
                    h, "hair", W, r0=0.085, bead_role="trim" if S["race"] == "dwarf" else "leather_dark")
    elif style == "bun" and not helmet:
        P0 = head_surf(L, S, 0.86, 3 * math.pi / 2, add=0.0)
        c = P0 + (P0 - C).normalized() * (0.12 * h)
        sphere(B, c, 0.19 * h, 0.17 * h, 0.17 * h, "hair", Wh, n=8)
        torus(B, P0 + (P0 - C).normalized() * 0.02 * h, (P0 - C), 0.12 * h, 0.03 * h, "leather_dark", Wh, 8, 4)


def build_beard(B, S, L, kind, role="hair", top_front=0.17, top_side=0.38, add=0.035, hang=0.0,
                inner_add=-0.012, m=11):
    """Arc-shaped shell hugging the jaw, optionally hanging below the chin."""
    h = L["h"]
    W = wf_rigid("head")
    ths = [math.radians(-25 + 230 * i / (m - 1)) for i in range(m)]

    def ftop(t):
        fw = max(0.0, math.sin(t))
        return top_side + (top_front - top_side) * fw ** 1.5
    levels = []
    for u, k in ((0.0, 0.35), (0.35, 0.7), (0.7, 0.9), (1.0, 1.0)):
        outer, inner = [], []
        for t in ths:
            f = ftop(t) * (1 - u) + 0.015 * u
            outer.append(head_surf(L, S, f, t, add=add * h * k, straight=False))
            inner.append(head_surf(L, S, f, t, add=inner_add * h, straight=False))
        levels.append((outer, inner))
    if hang > 0:
        base_o = levels[-1][0]
        cy = head_center(L).y
        for fz, sc in ((-0.18, 0.88), (-0.45, 0.65), (-0.75, 0.38), (-1.0, 0.14)):
            fz = fz * hang
            outer, inner = [], []
            for P0 in base_o:
                x = P0.x * sc
                y = cy + (P0.y - cy) * sc - 0.04 * h * (1 - sc)
                z = L["z_chin"] + fz * h
                outer.append(Vector((x, y, z)))
                inner.append(Vector((x * 0.8, y + 0.12 * h * sc + 0.01 * h, z + 0.02 * h)))
            levels.append((outer, inner))
    arc_loft(B, levels, role, W)


def build_facial_hair(B, S, L):
    kind = S["beard"]
    g = S["gear"]
    h = L["h"]
    W = wf_rigid("head")
    if g["helmet"] == "great":
        return
    if g["mask"]:
        build_beard(B, S, L, "mask", role="cape", top_front=0.40, top_side=0.42, add=0.025, inner_add=-0.01)
    if g["mask"] or (kind == "none" and not S["moustache"]):
        return
    if kind == "short":
        build_beard(B, S, L, kind, add=0.022)
    elif kind == "goatee":
        build_beard(B, S, L, kind, top_front=0.13, top_side=0.12, add=0.03, hang=0.12, m=7)
    elif kind == "full":
        build_beard(B, S, L, kind, add=0.045, hang=0.35 * (0.6 + S["beard_len"]))
    elif kind == "long":
        build_beard(B, S, L, kind, add=0.05, hang=0.9 * (0.5 + S["beard_len"]))
    elif kind == "wizard":
        build_beard(B, S, L, kind, top_front=0.2, top_side=0.42, add=0.06, hang=1.25 * S["beard_len"])
    elif kind == "braided":
        build_beard(B, S, L, kind, add=0.05, hang=0.3)
        zc = L["z_chin"]
        for side in (1, -1):
            P0 = Vector((side * 0.13 * L["hw"], L["head_cy"] - 0.8 * L["hd"], zc - 0.08 * h))
            build_braid(B, [P0, P0 + Vector((side * 0.02 * h, -0.05 * h, -0.4 * h)),
                            P0 + Vector((side * 0.02 * h, -0.04 * h, -0.95 * S["beard_len"] * h))],
                        h, "hair", W, r0=0.075, bead_role="trim")
    if S["moustache"]:
        big = S.get("moustache_big")
        for side in (1, -1):
            base = head_surf(L, S, 0.22, math.pi / 2 - side * math.radians(10), add=0.03 * h, straight=False)
            if big:   # handlebar: out, then curling up
                mid = head_surf(L, S, 0.18, math.pi / 2 - side * math.radians(45), add=0.06 * h, straight=False)
                tip = mid + (mid - base).normalized() * 0.07 * h + UP * 0.06 * h
                box_between(B, base, mid, 0.05 * h, 0.035 * h, "hair", W, ref=UP)
                dv = tip - mid
                pyramid(B, mid, dv, UP, 0.04 * h, 0.03 * h, dv.length, "hair", W, sides=4)
            else:
                tip = head_surf(L, S, 0.13, math.pi / 2 - side * math.radians(55), add=0.06 * h, straight=False) - UP * 0.03 * h
                dv = tip - base
                pyramid(B, base, dv, UP, 0.05 * h, 0.032 * h, dv.length, "hair", W, sides=4)


def build_hood_up(B, S, L, BN):
    h = L["h"]
    W = wf_hair(L)
    n = L["N"]["hair"]
    spec = [(0.0, 0.03 * h), (0.0, 0.13 * h), (0.12, 0.15 * h), (0.35, 0.16 * h), (0.6, 0.16 * h),
            (0.82, 0.15 * h), (0.96, 0.13 * h)]
    roles = ["hood_in", "trim" if S["cls"] in ("mage", "cleric") else "cape"] + ["cape"] * 4
    dome(B, S, L, hair_flow(0.80, -0.3, -0.55), spec, roles, W, n=n, back_point=0.25 * h, tip=(0.22 * h, 0.30 * h))
    # cowl draping onto the shoulders
    torus(B, Vector((0, 0.01, L["z_neck"] + 0.04 * h)), UP, L["neck_r"] * 1.55, 0.1 * h, "cape",
          wf_chain(BN, ["spine_05", "neck_01"], 3.0), nmaj=12, nmin=5, squash=0.8, rx_scale=1.15)


def build_helmet(B, S, L):
    kind = S["gear"]["helmet"]
    if kind == "none":
        return
    h = L["h"]
    W = wf_rigid("head")
    n = L["N"]["hair"]
    C = head_center(L)
    if kind in ("nasal", "horned", "kettle"):
        flow = hair_flow(0.80, 0.58, 0.48)
        spec = [(0.0, 0.10 * h), (0.0, 0.122 * h), (0.10, 0.122 * h), (0.12, 0.105 * h),
                (0.45, 0.11 * h), (0.75, 0.10 * h), (0.93, 0.085 * h)]
        roles = ["trim", "trim", "trim", "metal", "metal", "metal"]
        dome(B, S, L, flow, spec, roles, W, n=n)
        for i in range(10):                                     # rivets on the band
            t = TAU * (i + 0.5) / 10
            p = head_surf(L, S, flow(t) + 0.05 * (1 - flow(t)), t, add=0.125 * h)
            pyramid(B, p, p - C, UP, 0.012 * h, 0.012 * h, 0.012 * h, "metal_dark", W, sides=4)
        crest = [(0.84, math.pi / 2), (0.95, math.pi / 2), (1.0, math.pi / 2), (0.95, 3 * math.pi / 2), (0.82, 3 * math.pi / 2)]
        pts = [head_surf(L, S, f, a, add=0.115 * h) for f, a in crest]
        for a, b in zip(pts, pts[1:]):
            box_between(B, a, b, 0.012 * h, 0.03 * h, "metal", W, ref=UP)
        if kind in ("nasal", "horned"):
            top = head_surf(L, S, 0.8, math.pi / 2, add=0.12 * h)
            bot = head_surf(L, S, 0.36, math.pi / 2, add=0.09 * h, straight=False)
            box_between(B, top, bot, 0.03 * h, 0.012 * h, "metal", W, ref=FRONT)
        if kind == "horned":
            for side in (1, -1):
                b0 = head_surf(L, S, 0.8, 0.0 if side > 0 else math.pi, add=0.08 * h)
                o = Vector((side, 0, 0))
                pts = [b0, b0 + o * 0.14 * h + UP * 0.05 * h, b0 + o * 0.26 * h + UP * 0.22 * h + FRONT * 0.04 * h,
                       b0 + o * 0.28 * h + UP * 0.42 * h + FRONT * 0.1 * h]
                pth = Path(pts)
                Lp = pth.length
                st = [(0.0, 0.08 * h, 0.08 * h, 0.08 * h), (0.4 * Lp, 0.06 * h, 0.06 * h, 0.06 * h), (Lp, 0.008 * h, 0.008 * h, 0.008 * h)]
                build_tube(B, pth, st, [(0.08 * Lp, "trim", 1.15, None), (1e9, "bone", 1.0, None)], 6, 0.0, FRONT, W)
        if kind == "kettle":
            secs = []
            for i in range(n):
                t = TAU * (i + 0.5) / n
                base = head_surf(L, S, flow(t) + 0.02, t, add=0.118 * h)
                out = Vector((math.cos(t), -math.sin(t), 0.0))
                tip = base + out * 0.24 * h - UP * 0.06 * h
                tk = 0.02 * h
                secs.append([base, tip, tip - UP * tk, base - UP * tk])
            f0 = len(B.faces)
            B.loop(secs, "metal", W)
            B.orient_closed(f0)
    elif kind == "great":
        Bg = MeshBuilder()
        hx = L["hw"] * 1.12 + 0.06 * h
        hyf, hyb = L["hd"] * 1.12 + 0.05 * h, L["hd"] * 1.12 + 0.05 * h
        cy = L["head_cy"]
        zs = [(-0.16, 0.93, "trim"), (-0.10, 0.98, "trim"), (-0.06, 1.0, "metal"), (0.45, 1.02, "metal"),
              (0.85, 1.0, "trim"), (0.92, 0.98, "metal"), (1.08, 0.88, "metal")]
        rings = [ring_pts(Vector((0, cy, L["z_chin"] + f * h)), UP, FRONT, hx * k, hyf * k, hyb * k, 12, flat_phase(12), 2.6)
                 for f, k, _ in zs]
        roles = [z[2] for z in zs[:-1]]
        Bg.loft(rings, roles, W, True, True)
        Bg.orient_closed(0)
        bvh = Bg.bvh()
        B.merge(Bg)
        qe, ne = project(bvh, Vector((0, -1.0, L["z_chin"] + 0.5 * h)), BACK, back=0.0, off=0.0)
        if ne is not None:
            decal_strip(B, bvh, qe, ne, 1.3 * L["hw"], 0.05 * h, 0.0, 6, "eye", W, off=0.003)
            decal_strip(B, bvh, qe + Vector((0, 0, -0.12 * h)), ne, 0.62 * h, 0.05 * h, math.radians(90), 4, "trim", W, off=0.004)
            for i in range(3):
                for j in range(2):
                    qh, nh = project(bvh, Vector((0.12 * L["hw"] + 0.06 * h * j, -1.0, L["z_chin"] + (0.18 + 0.07 * i) * h)), BACK, back=0.0, off=0.0)
                    if nh is not None:
                        decal(B, bvh, qh, nh, ellipse2d(0.014 * h, 0.014 * h, 4), "eye", W, off=0.003)
    elif kind == "circlet":
        secs = []
        for i in range(n):
            t = TAU * (i + 0.5) / n
            fc = 0.74 - 0.04 * math.sin(t)
            secs.append([head_surf(L, S, fc - 0.03, t, add=0.055 * h), head_surf(L, S, fc + 0.03, t, add=0.055 * h),
                         head_surf(L, S, fc + 0.03, t, add=0.075 * h), head_surf(L, S, fc - 0.03, t, add=0.075 * h)])
        f0 = len(B.faces)
        B.loop(secs, "trim", W)
        B.orient_closed(f0)
        p = head_surf(L, S, 0.78, math.pi / 2, add=0.08 * h)
        bipyramid(B, p, FRONT, 0.035 * h, 0.03 * h, 0.005 * h, "gem", W, sides=4)
    elif kind in ("wizard", "witch"):
        mk = S["gear"]["mage_kind"]
        witch = kind == "witch"
        brim = (0.62 if witch else 0.44) * h * (0.85 if mk == "alchemist" else 1.0)
        nb = 14
        secs = []
        for i in range(nb):
            t = TAU * (i + 0.5) / nb
            base = head_surf(L, S, 0.64, t, add=0.06 * h)
            out = Vector((math.cos(t), -math.sin(t), 0.0))
            wav = 0.03 * h * math.sin(3 * t + 0.5)
            tip = base + out * brim - UP * (0.05 * h + wav) + UP * (0.05 * h * max(0.0, -math.sin(t)))
            secs.append([base, tip, tip - UP * 0.025 * h, base - UP * 0.025 * h])
        f0 = len(B.faces)
        B.loop(secs, "cloth1", W)
        B.orient_closed(f0)
        b0 = Vector((0, L["head_cy"] + 0.01 * h, L["z_chin"] + 0.6 * h))
        if witch:
            pts = [b0, b0 + Vector((0, 0.03 * h, 0.4 * h)), b0 + Vector((0, 0.1 * h, 0.75 * h)),
                   b0 + Vector((0, 0.3 * h, 0.98 * h)), b0 + Vector((0, 0.5 * h, 0.95 * h))]
        elif mk == "alchemist":
            pts = [b0, b0 + Vector((0, 0.02 * h, 0.4 * h)), b0 + Vector((0, 0.08 * h, 0.75 * h)),
                   b0 + Vector((0, 0.26 * h, 0.95 * h))]
        else:
            pts = [b0, b0 + Vector((0, 0.02 * h, 0.45 * h)), b0 + Vector((0, 0.1 * h, 0.86 * h)),
                   b0 + Vector((0, 0.32 * h, 1.12 * h)), b0 + Vector((0, 0.6 * h, 1.06 * h))]
        pth = Path(pts)
        Lp = pth.length
        R0 = max(L["hw"], L["hd"]) * 1.02 + 0.07 * h
        st = [(0.0, R0, R0, R0), (0.22 * Lp, R0 * 0.74, R0 * 0.74, R0 * 0.74), (0.5 * Lp, R0 * 0.46, R0 * 0.46, R0 * 0.46),
              (0.78 * Lp, R0 * 0.24, R0 * 0.24, R0 * 0.24), (Lp, 0.025 * h, 0.025 * h, 0.025 * h)]
        band = "trim" if mk == "wizard" else "leather_dark"
        Bc = MeshBuilder()
        build_tube(Bc, pth, st, [(0.03 * Lp, "cloth1", 1.0, None), (0.15 * Lp, band, 1.04, None), (1e9, "cloth1", 1.0, None)],
                   8, 0.0, FRONT, W)
        bvc = Bc.bvh()
        B.merge(Bc)
        c0, _ = pth.at(0.09 * Lp)
        q, nrm = project(bvc, Vector((0, -1.0, c0.z)), BACK, back=0.0, off=0.0)
        if nrm is not None and mk != "wizard":
            t1, t2 = _tangents(nrm)
            bw, bh, th = 0.06 * h, 0.05 * h, 0.012 * h
            c = q + nrm * 0.01 * h
            corners = [c - t1 * bw - t2 * bh, c + t1 * bw - t2 * bh, c + t1 * bw + t2 * bh, c - t1 * bw + t2 * bh]
            for a, b in zip(corners, corners[1:] + corners[:1]):
                box_between(B, a, b, th, th * 0.8, "trim", W, ref=nrm)


# =============================================================================
#  Body
# =============================================================================

def torso_zones(S, L, z_bot):
    g = S["gear"]
    zh, T = L["z_hip"], L["T"]
    zones = []
    base = "cloth1" if (g["robe"] or g["torso"] == "tunic") else "cloth2"
    if g["belt"]:
        zl, zu = zh + 0.16 * T, zh + 0.24 * T
        belt_role = "cloth3" if g["robe"] else "leather_dark"
        zones.append((zl - z_bot, base, 1.0, "next"))
        zones.append((zu - z_bot, belt_role, 1.05, "next"))
    zones.append((1e9, "cloth1", 1.03, None))
    return zones


def build_torso(S, L, BN):
    H, h, T = L["H"], L["h"], L["T"]
    b = S["masc"]
    d = L["depth"]
    z_bot = L["z_hip"] - 0.045 * H
    z_top = L["z_neck"] + 0.025 * h
    zh = L["z_hip"]

    def s(z):
        return z - z_bot
    st = [
        (s(z_bot), L["hip_half"] * 0.6, d * 0.70, d * 0.75),
        (s(zh + 0.01 * H), L["hip_half"], d * 0.92, d * 1.08),
        (s(zh + 0.40 * T), L["waist_half"], d * (0.85 + 0.9 * max(0.0, L.get("weight", 1.0) - 1.0)), d * 0.88),   # 胖的人肚子往前顶
        (s(zh + 0.70 * T), L["chest_half"], d * (1.0 + 0.16 * (1 - b)), d * 0.95, Vector((0, -0.004, 0))),
        (s(L["z_sh"] + 0.005 * H), L["sh_half"] * 0.93, d * 0.86, d * 0.90),
        (s(L["z_neck"] - 0.005), L["sh_half"] * 0.50, d * 0.60, d * 0.64),
        (s(z_top), L["neck_r"] * 1.28, L["neck_r"] * 1.12, L["neck_r"] * 1.15),
    ]
    L["torso_st"], L["z_bot"] = st, z_bot
    path = Path([Vector((0, 0, z_bot)), Vector((0, 0, z_top))])
    n = L["N"]["torso"]
    W = wf_chain(BN, ["pelvis", "spine_01", "spine_02", "spine_03", "spine_04", "spine_05",
                      "clavicle_l", "clavicle_r", "thigh_l", "thigh_r"], power=4.0)
    Bt = MeshBuilder()
    build_tube(Bt, path, st, torso_zones(S, L, z_bot), n, flat_phase(n), FRONT, W, True, True, flare=1.06, ex=2.4)
    return Bt


def torso_ring(L, z, scale=1.0, add=0.0, n=10, phase=None, ex=2.4):
    rx, ryf, ryb, off = interp_station(L["torso_st"], z - L["z_bot"])
    return ring_pts(Vector((0, off.y, z)), UP, FRONT, rx * scale + add, ryf * scale + add, ryb * scale + add,
                    n, flat_phase(n) if phase is None else phase, ex)


def torso_dims(L, z):
    rx, ryf, ryb, off = interp_station(L["torso_st"], z - L["z_bot"])
    return rx, ryf, ryb


def build_neck(B, S, L, BN):
    h = L["h"]
    path = Path([Vector((0, 0.004, L["z_neck"] - 0.12 * h)), Vector((0, -0.006, L["z_chin"] + 0.3 * h))])
    r = L["neck_r"]
    st = [(0.0, r * 1.05, r * 1.0, r * 1.05), (path.length, r * 0.95, r * 0.9, r * 0.95)]
    W = wf_chain(BN, ["spine_05", "neck_01", "neck_02", "head"], power=4.0)
    build_tube(B, path, st, [(1e9, "skin", 1.0, None)], 8, 0.5, FRONT, W)


def skirt_shell(B, L, BN, z_top, z_bot, top_scale, bot_scale, roles, n=12, extra=0.0, lip=True, power=2.5,
                names=None):
    """Hanging shell around the hips/legs (tunic skirt, faulds, robes)."""
    zs = [z_top, z_top - 0.35 * (z_top - z_bot), z_bot]
    rings = []
    for z, sc in zip(zs, (top_scale, (top_scale + bot_scale) * 0.5, bot_scale)):
        rx, ryf, ryb = torso_dims(L, max(z, L["z_bot"] + 0.02))
        if z < L["z_hip"]:
            rx, ryf, ryb = L["hip_half"], L["depth"] * 1.0, L["depth"] * 1.08
        rings.append(ring_pts(Vector((0, 0, z)), UP, FRONT, rx * sc + extra, ryf * sc * 1.05 + extra,
                              ryb * sc * 1.05 + extra, n, flat_phase(n), 2.2))
    if lip:
        rings.append([Vector((p.x * 0.94, p.y * 0.94, p.z + 0.012)) for p in rings[-1]])
    if isinstance(roles, str):
        roles = [roles] * (len(rings) - 1)
    W = wf_chain(BN, names or ["pelvis", "spine_01", "thigh_l", "thigh_r"], power=power)
    f0 = len(B.faces)
    B.loft(rings, roles, W, False, False)
    B.orient(f0, center=Vector((0, 0, z_top)))


def build_robe(B, S, L, BN, kind=None, role="cloth1", shrink=1.0, trim=True):
    g = S["gear"]
    kind = kind or g["robe"]
    T, H = L["T"], L["H"]
    zt = L["z_hip"] + 0.2 * T
    if kind == "long":
        zb = L["z_ankle"] + 0.05 * H
        flare = 1.6
    else:
        zb = L["z_knee"] - 0.3 * (L["z_knee"] - L["z_ankle"])
        flare = 1.42
    n = L["N"]["shell"]
    zs = [zt, L["z_hip"] - 0.02 * H, L["z_knee"] + 0.1 * (L["z_hip"] - L["z_knee"]), zb + 0.035 * H, zb]
    rings = []
    for i, z in enumerate(zs):
        t = i / (len(zs) - 1)
        if i == 0:
            rx, ryf, ryb = torso_dims(L, z)
            sc = 1.07
        else:
            rx, ryf, ryb = L["hip_half"], L["depth"] * 1.05, L["depth"] * 1.12
            sc = (1.1 + (flare - 1.1) * t) * shrink
        rings.append(ring_pts(Vector((0, 0, z)), UP, FRONT, rx * sc, ryf * sc * (1.0 + 0.2 * t), ryb * sc * (1.0 + 0.2 * t),
                              n, flat_phase(n), 2.2))
    rings.append([Vector((p.x * 0.94, p.y * 0.94, p.z + 0.014)) for p in rings[-1]])
    hem = ("trim" if S["cls"] in ("mage", "cleric") else "cloth3") if trim else role
    W = wf_chain(BN, ["pelvis", "spine_01", "thigh_l", "thigh_r", "calf_l", "calf_r"], power=2.2)
    f0 = len(B.faces)
    B.loft(rings, [role, role, role, hem, role], W, False, False)
    B.orient_radial(f0, Vector((0, 0, zt)), Vector((0, 0, zb)))


def build_coat(B, S, L, BN):
    """Long coat skirt, open at the front, with trimmed front edges and hem and a lining."""
    g = S["gear"]
    H, T = L["H"], L["T"]
    zt = L["z_hip"] + 0.2 * T
    if g["coat"] == "long":
        zb, flare = L["z_ankle"] + 0.06 * H, 1.55
    else:
        zb, flare = L["z_knee"] - 0.28 * (L["z_knee"] - L["z_ankle"]), 1.42
    zs = [zt, L["z_hip"] - 0.01 * H, (L["z_hip"] + zb) * 0.5, zb + 0.04 * H, zb]
    m = 17
    thick = 0.014 * H
    W = wf_chain(BN, ["pelvis", "spine_01", "thigh_l", "thigh_r", "calf_l", "calf_r"], power=2.2)
    O, I = [], []
    for i, z in enumerate(zs):
        t = i / (len(zs) - 1)
        if i == 0:
            rx, ryf, ryb = torso_dims(L, z)
            sc, ky = 1.1, 1.0
        else:
            rx, ryf, ryb = L["hip_half"], L["depth"] * 1.05, L["depth"] * 1.12
            sc, ky = 1.14 + (flare - 1.14) * t, 1.0 + 0.25 * t
        gap = math.radians(3 + 22 * t)
        tw = math.radians(7)
        a0 = math.pi / 2 + gap + tw
        a1 = math.pi / 2 + TAU - gap - tw
        thetas = [math.pi / 2 + gap, a0] + [a0 + (a1 - a0) * (k + 1) / (m - 3) for k in range(m - 4)] + [a1, a1 + tw]
        ro, ri = [], []
        for th in thetas:
            c_, s_ = math.cos(th), math.sin(th)
            ry = (ryf if s_ > 0 else ryb) * sc * ky
            ro.append(Vector((rx * sc * c_, -ry * s_, z)))
            ri.append(Vector(((rx * sc - thick) * c_, -(ry - thick) * s_, z + (0.01 * H if i == len(zs) - 1 else 0.0))))
        O.append(ro)
        I.append(ri)
    oi = [[B.v(p, W(p)) for p in row] for row in O]
    ii = [[B.v(p, W(p)) for p in row] for row in I]
    K = len(zs)
    f0 = len(B.faces)
    for i in range(K - 1):
        hem = i == K - 2
        for j in range(m - 1):
            edge = j == 0 or j == m - 2
            B.f((oi[i][j], oi[i][j + 1], oi[i + 1][j + 1], oi[i + 1][j]), "trim" if (hem or edge) else "cloth1")
            B.f((ii[i][j + 1], ii[i][j], ii[i + 1][j], ii[i + 1][j + 1]), "trim" if (hem or edge) else "cloth2")
        B.f((oi[i][0], oi[i + 1][0], ii[i + 1][0], ii[i][0]), "trim")
        B.f((ii[i][m - 1], ii[i + 1][m - 1], oi[i + 1][m - 1], oi[i][m - 1]), "trim")
    for j in range(m - 1):
        B.f((oi[K - 1][j], oi[K - 1][j + 1], ii[K - 1][j + 1], ii[K - 1][j]), "trim")
        B.f((ii[0][j], ii[0][j + 1], oi[0][j + 1], oi[0][j]), "cloth1")
    B.orient_closed(f0)


def build_capelet(B, S, L, BN):
    """Shoulder capelet with a pointed (scalloped) hem, trim band and optional brooch."""
    H, h = L["H"], L["h"]
    g = S["gear"]
    n = 16
    zt = L["z_neck"] + 0.04 * h
    zs = L["z_sh"] + 0.02 * H
    zb = L["z_sh"] - 0.09 * h - 0.035 * H
    pts_hem = []
    rings = [ring_pts(Vector((0, 0, zt)), UP, FRONT, L["neck_r"] * 1.45, L["neck_r"] * 1.4, L["neck_r"] * 1.45, n, 0.0, 2.0),
             ring_pts(Vector((0, 0, zs)), UP, FRONT, L["sh_half"] * 0.98, L["depth"] * 1.32, L["depth"] * 1.4, n, 0.0, 2.2)]
    band_hi = ring_pts(Vector((0, 0, zb + 0.03 * H)), UP, FRONT, L["sh_half"] * 1.2, L["depth"] * 1.55, L["depth"] * 1.62, n, 0.0, 2.2)
    hem = ring_pts(Vector((0, 0, zb)), UP, FRONT, L["sh_half"] * 1.26, L["depth"] * 1.62, L["depth"] * 1.7, n, 0.0, 2.2)
    for k in range(n):
        drop = 0.055 * h if k % 2 == 0 else 0.0
        band_hi[k] = band_hi[k] - UP * drop
        hem[k] = hem[k] - UP * drop
    rings += [band_hi, hem, [Vector((p.x * 0.94, p.y * 0.94, p.z + 0.012)) for p in hem]]
    W = wf_chain(BN, ["spine_05", "spine_04", "clavicle_l", "clavicle_r", "neck_01"], power=3.0)
    f0 = len(B.faces)
    B.loft(rings, ["capelet", "capelet", "trim", "capelet"], W, False, False)
    B.orient_radial(f0, Vector((0, 0, zt + 0.1)), Vector((0, 0, zb)))
    if g["brooch"] or g["mage_kind"] in ("wizard", "frost", "warlock"):
        c = Vector((0, -(L["neck_r"] * 1.42 + 0.012 * H), zt - 0.035 * h))
        cap_shell(B, c - FRONT * 0.012 * H, FRONT, 0.03 * H, 8, 75, 2, 8, "trim", wf_rigid("spine_05"), ref=UP, thick=0.004 * H)
        bipyramid(B, c + FRONT * 0.01 * H, FRONT, 0.012 * H, 0.012 * H, 0.002 * H, "gem", wf_rigid("spine_05"), sides=6)


def build_mage_extras(B, S, L, BN, bvh_body, bvh_torso):
    g = S["gear"]
    H, T, h = L["H"], L["T"], L["h"]
    zbelt = L["z_hip"] + 0.2 * T
    Wsp = wf_chain(BN, ["spine_01", "spine_02", "spine_03", "spine_04", "spine_05", "pelvis"], power=3.0)
    Wp = wf_chain(BN, ["pelvis", "spine_01"], power=3.0)
    if g["coat"]:   # front closure trim on the upper body
        z0, z1 = zbelt + 0.05 * T, L["z_neck"] - 0.01
        q, nrm = project(bvh_torso, Vector((0, -1, (z0 + z1) * 0.5)), BACK, back=0.0, off=0.0)
        if nrm is not None:
            decal_strip(B, bvh_torso, q, Vector((0, -1, 0)), (z1 - z0), 0.05 * h, math.radians(90), 5, "trim", Wsp,
                        off=0.004)
    if g["strap"]:
        for front in (True, False):
            sy = -1.0 if front else 1.0
            a = Vector((-L["sh_half"] * 0.55, 0.0, L["z_sh"] + 0.03 * H))
            b = Vector((L["waist_half"] * 0.95, 0.0, zbelt - 0.01 * H))
            pts = []
            for k in range(7):
                p = a.lerp(b, k / 6.0)
                q, hitn = project(bvh_body, Vector((p.x, sy, p.z)), Vector((0, -sy, 0)), back=0.0, off=0.008 * H)
                if hitn is not None:
                    pts.append(q)
            for p0, p1 in zip(pts, pts[1:]):
                box_between(B, p0, p1, 0.016 * H, 0.004 * H, "leather_dark", Wsp, ref=Vector((0, sy, 0)))
    side_x = L["hip_half"] * 1.18 + 0.02 * H
    if g["satchel"]:
        p = Vector((side_x + 0.01 * H, -0.01 * H, L["z_hip"] + 0.0 * H))
        X = Vector((1, 0, 0))
        box_between(B, p + UP * 0.05 * H, p - UP * 0.05 * H, 0.06 * H, 0.025 * H, "leather", Wp, ref=X)
        box_between(B, p + UP * 0.055 * H + X * 0.003, p + X * 0.003 - UP * 0.005 * H, 0.063 * H, 0.028 * H, "leather_dark", Wp, ref=X)
        box_between(B, p + X * 0.032 * H + UP * 0.012 * H, p + X * 0.032 * H - UP * 0.008 * H, 0.01 * H, 0.004 * H, "trim", Wp, ref=X)
    if g["book_hip"]:
        p = Vector((-side_x, -0.01 * H, L["z_hip"] + 0.02 * H))
        X = Vector((1, 0, 0))
        box_between(B, p + UP * 0.05 * H, p - UP * 0.05 * H, 0.04 * H, 0.016 * H, "leather_dark", Wp, ref=X)
        box_between(B, p + UP * 0.046 * H + FRONT * 0.004 * H, p - UP * 0.046 * H + FRONT * 0.004 * H, 0.037 * H, 0.011 * H,
                    "pages", Wp, ref=X)
        box_between(B, p + UP * 0.012 * H, p - UP * 0.012 * H, 0.041 * H, 0.018 * H, "trim", Wp, ref=X)
    for k in range(g["potions"]):
        a = math.radians((60, 118, 90)[k % 3])
        rx, ryf, ryb = torso_dims(L, zbelt)
        p = Vector((rx * 1.25 * math.cos(a), -ryf * 1.3 * math.sin(a) - 0.02 * H, zbelt - 0.05 * H))
        role = ("potion", "potion2", "potion3")[k % 3]
        sphere(B, p, 0.024 * H, 0.024 * H, 0.026 * H, role, Wp, n=6, rings=(-55, -10, 30, 60))
        box_between(B, p + UP * 0.018 * H, p + UP * 0.04 * H, 0.008 * H, 0.008 * H, "glass", Wp, ref=FRONT)
        box_between(B, p + UP * 0.04 * H, p + UP * 0.052 * H, 0.01 * H, 0.01 * H, "wood", Wp, ref=FRONT)
    if g["scarf"]:
        Wn = wf_chain(BN, ["spine_05", "neck_01"], power=3.0)
        torus(B, Vector((0, -0.004, L["z_neck"] + 0.03 * h)), UP, L["neck_r"] * 1.35, 0.1 * h, "capelet", Wn,
              nmaj=12, nmin=5, squash=0.9, rx_scale=1.1)
        p0 = Vector((0.4 * L["neck_r"], -(L["neck_r"] * 1.35 + 0.08 * h), L["z_neck"] - 0.02 * h))
        p0, _ = project(bvh_body, p0 + Vector((0, -0.3, 0)), BACK, back=0.0, off=0.03 * H)
        box_between(B, p0, p0 + Vector((0.01, -0.01, -0.32 * h)), 0.07 * h, 0.03 * h, "capelet", Wsp, ref=FRONT)


def build_chest_armor(B, S, L, BN):
    g = S["gear"]
    kind = g["armor"]
    if not kind:
        return
    T, H = L["T"], L["H"]
    zh = L["z_hip"]
    plate = kind == "plate"
    body = "metal" if plate else "leather"
    edge = "trim" if plate else "leather_dark"
    n = L["N"]["shell"]
    ph = ridge_phase(n) if plate else flat_phase(n)
    zA = zh + 0.235 * T
    zs = [(zA, 1.04, 0.0), (zA, 1.13, 0.0), (zA + 0.03 * T, 1.12, 0.0), (zh + 0.42 * T, 1.12, 0.0),
          (zh + 0.7 * T, 1.14 if plate else 1.12, 0.0), (L["z_sh"] + 0.004 * H, 1.1, 0.0),
          (L["z_neck"] - 0.01, 1.12, 0.0), (L["z_neck"] - 0.002, 1.02, 0.0)]
    rings = []
    for i, (z, sc, _) in enumerate(zs):
        ring = torso_ring(L, z, scale=sc, add=0.004, n=n, phase=ph, ex=2.2)
        if plate and 2 <= i <= 5:     # centre ridge
            k = min(range(n), key=lambda j: ring[j].y)
            ring[k] = ring[k] + FRONT * (0.012 * H)
        rings.append(ring)
    rings[0] = [Vector((p.x, p.y, p.z + 0.012)) for p in rings[0]]
    rings[-1] = [Vector((p.x, p.y, p.z + 0.006)) for p in rings[-1]]
    roles = [edge, edge, body, body, body, body, edge]
    W = wf_chain(BN, ["spine_01", "spine_02", "spine_03", "spine_04", "spine_05", "clavicle_l", "clavicle_r"], power=4.0)
    f0 = len(B.faces)
    B.loft(rings, roles, W, False, False)
    B.orient(f0, center=Vector((0, 0, zh + 0.6 * T)))
    if not plate:   # diagonal strap across the chest
        side = 1 if S["seed"] % 2 else -1
        p0 = Vector((side * L["sh_half"] * 0.45, -torso_dims(L, L["z_sh"])[1] * 1.16, L["z_sh"] + 0.01))
        p1 = Vector((-side * L["waist_half"] * 0.55, -torso_dims(L, zh + 0.45 * T)[1] * 1.17, zh + 0.45 * T))
        box_between(B, p0, p1, 0.013 * H, 0.004 * H, "leather_dark", W, ref=FRONT)


def build_belt_items(B, S, L, BN, bvh):
    g = S["gear"]
    H, T = L["H"], L["T"]
    zc = L["z_hip"] + 0.2 * T
    W = wf_chain(BN, ["pelvis", "spine_01"], power=3.0)
    if g["belt"] and g["big_buckle"]:
        q, nrm = project(bvh, Vector((0, -1, zc)), BACK, back=0.0, off=0.0)
        if nrm is not None:
            t1, t2 = _tangents(nrm)
            bw, bh, th = 0.04 * H, 0.032 * H, 0.008 * H
            c = q + nrm * 0.008 * H
            corners = [c - t1 * bw - t2 * bh, c + t1 * bw - t2 * bh, c + t1 * bw + t2 * bh, c - t1 * bw + t2 * bh]
            for a, b in zip(corners, corners[1:] + corners[:1]):
                box_between(B, a, b, th, th * 0.8, "trim", W, ref=nrm)
            box_between(B, c - t2 * bh * 0.9, c + t2 * bh * 0.9, th * 0.5, th * 0.5, "trim", W, ref=nrm)
    elif g["belt"]:
        q, nrm = project(bvh, Vector((0, -1, zc)), BACK, back=0.0, off=0.0)
        if nrm is not None:
            bw, bh = 0.035 * H, 0.03 * T
            decal(B, bvh, q, nrm, [(-bw, -bh * 1.3), (bw, -bh * 1.3), (bw, bh * 1.3), (-bw, bh * 1.3)],
                  "trim", W, off=0.007)
    angles = [math.radians(a) for a in (205, 335, 160, 20)][:g["pouches"]]
    rx, ryf, ryb = torso_dims(L, zc)
    for a in angles:
        out = Vector((math.cos(a), -math.sin(a), 0.0)).normalized()
        ry = ryf if math.sin(a) > 0 else ryb
        p = Vector((rx * 1.08 * math.cos(a), -ry * 1.08 * math.sin(a), zc))
        p = p + out * 0.018 * H
        box_between(B, p + UP * 0.012 * H, p - UP * 0.05 * H, 0.022 * H, 0.012 * H, "leather", W, ref=out)
        box_between(B, p + UP * 0.014 * H + out * 0.003, p - UP * 0.012 * H + out * 0.003, 0.024 * H, 0.013 * H,
                    "leather_dark", W, ref=out)


def build_front_panel(B, S, L, BN, bvh, z_top, z_bot, w_top, w_bot, role, back=False, emblem=False, trim=None):
    """Tabard / apron panel hanging in front (or behind) of the body."""
    H = L["H"]
    dirv = BACK if back else FRONT
    zs = [z_top, L["z_hip"] + 0.2 * L["T"], z_bot]
    pts = []
    for z in zs:
        q, _ = project(bvh, Vector((0, 1.0 if back else -1.0, z)), -dirv, back=0.0, off=0.012 * H)
        pts.append(q)
    pts[2] = Vector((0, pts[1].y + dirv.y * 0.02 * H, z_bot))
    pth = Path(pts)
    Lp = pth.length
    st = [(0.0, w_top, 0.004 * H, 0.004 * H), (pth.cum[1], (w_top + w_bot) * 0.5, 0.004 * H, 0.004 * H),
          (Lp, w_bot, 0.004 * H, 0.004 * H)]
    zones = [(Lp - 0.03 * H, role, 1.0, None), (1e9, trim or role, 1.0, None)]
    W = wf_chain(BN, ["spine_04", "spine_03", "spine_02", "spine_01", "pelvis", "thigh_l", "thigh_r"], power=3.0)
    tmp = MeshBuilder()
    build_tube(tmp, pth, st, zones, 4, 0.5, dirv, W, True, True)
    bv = tmp.bvh()
    B.merge(tmp)
    if emblem:
        q, nrm = project(bv, Vector((0, -1.0, L["z_hip"] + 0.55 * L["T"])), BACK, back=0.0, off=0.0)
        if nrm is not None:
            s = w_top * 0.55
            shapes = {
                "diamond": [(0, s), (s * 0.7, 0), (0, -s), (-s * 0.7, 0)],
                "circle": ellipse2d(s * 0.7, s * 0.7, 10),
                "chevron": [(-s, s * 0.3), (0, -s * 0.4), (s, s * 0.3), (s, -0.1 * s), (0, -s * 0.9), (-s, -0.1 * s)],
                "star": [(s * (1.0 if i % 2 == 0 else 0.42) * math.cos(math.pi / 2 + i * math.pi / 5),
                          s * (1.0 if i % 2 == 0 else 0.42) * math.sin(math.pi / 2 + i * math.pi / 5)) for i in range(10)],
            }
            em = S["gear"]["emblem"]
            We = W
            if em == "cross":
                decal_strip(B, bv, q, nrm, 1.5 * s, 0.32 * s, math.radians(90), 3, "emblem", We, off=0.004)
                decal_strip(B, bv, q + UP * 0.2 * s, nrm, 1.0 * s, 0.32 * s, 0.0, 2, "emblem", We, off=0.005)
            elif em == "bars":
                for k in (-1, 0, 1):
                    decal_strip(B, bv, q + UP * (0.45 * s * k), nrm, 1.3 * s, 0.22 * s, 0.0, 2, "emblem", We, off=0.004)
            elif em == "star":
                pts2 = shapes["star"]
                # fan-triangulate concave star
                t1, t2 = _tangents(nrm)
                c = B.v(q + nrm * 0.004, We(q))
                ring = []
                for u, v in pts2:
                    pq, _ = project(bv, q + t1 * u + t2 * v + nrm * 0.05, -nrm, back=0.0, off=0.004)
                    ring.append(B.v(pq, We(pq)))
                f0 = len(B.faces)
                for i in range(len(ring)):
                    B.f((c, ring[i], ring[(i + 1) % len(ring)]), "emblem")
                B.orient(f0, direction=nrm)
            elif em == "chevron":
                for k in (0, 1):
                    decal_strip(B, bv, q + UP * (0.35 * s * k) + Vector((0.35 * s, 0, 0)), nrm, 0.95 * s, 0.25 * s,
                                math.radians(35), 2, "emblem", We, off=0.004)
                    decal_strip(B, bv, q + UP * (0.35 * s * k) - Vector((0.35 * s, 0, 0)), nrm, 0.95 * s, 0.25 * s,
                                math.radians(-35), 2, "emblem", We, off=0.004)
            else:
                decal(B, bv, q, nrm, shapes[em], "emblem", We, off=0.004)


def build_cape(B, S, L, BN, length="long"):
    H, h, T = L["H"], L["h"], L["T"]
    n = L["N"]["cape"]
    zn, zsh = L["z_neck"], L["z_sh"]
    sh, d = L["sh_half"], L["depth"]
    zb = (L["z_knee"] - 0.05 * H) if length == "long" else (L["z_hip"] - 0.02 * H)
    levels_def = [
        (zn + 0.02 * h, L["neck_r"] * 1.45, L["neck_r"] * 1.45, 230),
        (zsh + 0.03 * H, sh * 0.78, d * 1.15, 205),
        (zsh - 0.04 * H, sh * 0.98, d * 1.28, 150),
        (L["z_hip"] + 0.5 * T, sh * 0.96, d * 1.38, 140),
        (L["z_hip"], sh * 1.02, d * 1.5, 140),
        (zb, sh * 1.18, d * 1.75, 140),
    ]
    levels_def = [lv for lv in levels_def if lv[0] > zb + 0.04 * H]
    levels_def.append((zb + 0.03 * H, sh * 1.16, d * 1.72, 140))
    levels_def.append((zb, sh * 1.18, d * 1.75, 140))
    levels = []
    for z, rx, ry, span in levels_def:
        outer, inner = [], []
        for i in range(n):
            th = math.radians(270 - span / 2 + span * i / (n - 1))
            c, s = math.cos(th), math.sin(th)
            wave = 1.0 + 0.04 * math.sin(i * 1.7) * (1.0 if z < zsh - 0.05 else 0.0)
            outer.append(Vector((rx * c * wave, -ry * s * wave, z)))
            inner.append(Vector(((rx - 0.012 * H) * c * wave, -(ry - 0.012 * H) * s * wave, z)))
        levels.append((outer, inner))
    roles = ["cape"] * (len(levels) - 2) + ["trim" if S["cls"] in ("knight", "mage", "cleric") else "cape"]
    W = wf_chain(BN, ["spine_05", "spine_04", "spine_03", "spine_02", "spine_01", "pelvis", "clavicle_l", "clavicle_r"],
                 power=2.5)
    arc_loft(B, levels, roles, W)


def build_mantle(B, S, L, BN):
    H, h = L["H"], L["h"]
    n = L["N"]["cape"] + 1
    zt = L["z_neck"] + 0.02 * h
    zb = L["z_sh"] - 0.13 * h - 0.02 * H
    rings = []
    for z, kx, ky in ((zt, L["neck_r"] * 1.4, L["neck_r"] * 1.35), (L["z_sh"] + 0.02 * H, L["sh_half"] * 0.9, L["depth"] * 1.25),
                      (zb, L["sh_half"] * 1.22, L["depth"] * 1.48)):
        rings.append(ring_pts(Vector((0, 0, z)), UP, FRONT, kx, ky, ky, n, flat_phase(n), 2.0))
    rings.append([Vector((p.x * 0.95, p.y * 0.95, p.z + 0.012)) for p in rings[-1]])
    W = wf_chain(BN, ["spine_05", "clavicle_l", "clavicle_r", "neck_01"], power=3.0)
    f0 = len(B.faces)
    B.loft(rings, ["cape", "cape", "trim" if S["cls"] in ("mage", "cleric") else "cape"], W, False, False)
    B.orient(f0, center=Vector((0, 0, zt)))


def build_back_items(B, S, L, BN):
    g = S["gear"]
    H, h, T = L["H"], L["h"], L["T"]
    zn = L["z_neck"]
    Wn = wf_chain(BN, ["spine_05", "neck_01", "clavicle_l", "clavicle_r"], power=3.0)
    if g["fur_collar"] or g["pauldrons"] == "fur" and g["cape"]:
        torus(B, Vector((0, 0.01, zn + 0.01 * h)), UP, L["neck_r"] * 1.6, 0.075 * h, "fur", Wn, nmaj=12, nmin=5,
              squash=0.9, rx_scale=1.35, ry_scale=1.1)
    if g["hood"] == "down":
        sphere(B, Vector((0, L["neck_r"] * 1.3 + 0.03 * h, zn + 0.05 * h)), 0.62 * L["hw"], 0.42 * L["hd"], 0.3 * h,
               "cape", wf_chain(BN, ["spine_05"]), n=8)
    if g["quiver"]:
        d = L["depth"]
        p0 = Vector((-0.06 * H, d * 1.55, L["z_sh"] + 0.07 * H))
        p1 = Vector((0.07 * H, d * 1.45, L["z_hip"] + 0.25 * T))
        pth = Path([p1, p0])
        Lp = pth.length
        r = 0.028 * H
        st = [(0.0, r * 0.9, r * 0.9, r * 0.9), (Lp, r, r, r)]
        Wq = wf_chain(BN, ["spine_03", "spine_04"], power=3.0)
        build_tube(B, pth, st, [(Lp - 0.02 * H, "leather", 1.0, None), (1e9, "leather_dark", 1.08, None)], 8, 0.0, FRONT, Wq)
        ax = (p0 - p1).normalized()
        for k in range(5):
            off = Vector((math.cos(k * 1.3) * r * 0.5, math.sin(k * 1.3) * r * 0.4, 0))
            a = p0 + off - ax * 0.02 * H
            b = p0 + off + ax * (0.06 + 0.01 * k) * H
            box_between(B, a, b, 0.003 * H, 0.003 * H, "wood", Wq, ref=FRONT)
            pyramid(B, b - ax * 0.035 * H, ax, Vector((1, 0, 0)), 0.008 * H, 0.002 * H, 0.04 * H, "white", Wq, sides=3)


# --------------------------------------------------------------------- limbs

def arm_zones(S, L):
    g = S["gear"]
    U, Fo = L["upper_len"], L["fore_len"]
    sl = g["sleeves"]
    hand_role = {"glove": "leather_dark", "gauntlet": "metal"}.get(g["hands"], "skin")
    br = g["bracers"]
    br_role = "metal" if br == "metal" else "leather"
    b0, b1 = U + 0.28 * Fo, U + 0.9 * Fo
    sleeve_end = {"long": U + 0.88 * Fo, "bell": U + 0.88 * Fo, "short": 0.45 * U, "none": -1.0}[sl]
    zones = []
    if br:
        if sleeve_end > b0:
            zones.append((b0, "cloth1", 1.06, "next"))
        else:
            if sleeve_end > 0:
                zones.append((sleeve_end, "cloth1", 1.12, "self"))
            zones.append((b0, "skin", 1.0, "next"))
        zones.append((b1, br_role, 1.16, "self", 1.08))
        zones.append((1e9, hand_role, 1.0, None))
    else:
        if sleeve_end > 0:
            zones.append((sleeve_end, "cloth1", 1.08 if sl != "short" else 1.12, "self"))
        if hand_role != "skin":
            zones.append((U + 0.94 * Fo, "skin", 1.0, "next"))
            zones.append((1e9, hand_role, 1.12, None))
        else:
            zones.append((1e9, "skin", 1.0, None))
    return zones, hand_role


def build_arm_left(B, S, L, BN):
    U, Fo = L["upper_len"], L["fore_len"]
    ur = L["upper_r"]
    n = L["N"]["limb"]
    path = Path([L["sh"], L["elbow"], L["wrist"]])
    st = [(-0.05, ur, ur, ur), (0.0, ur * 1.22, ur * 1.18, ur * 1.22), (0.3 * U, ur * 1.06, ur * 1.06, ur * 1.06),
          (0.75 * U, ur * 0.94, ur * 0.94, ur * 0.94), (U, ur * 0.80, ur * 0.80, ur * 0.84),
          (U + 0.3 * Fo, ur * 0.90, ur * 0.92, ur * 0.9), (U + 0.85 * Fo, ur * 0.62, ur * 0.6, ur * 0.6),
          (U + Fo + 0.012, ur * 0.58, ur * 0.55, ur * 0.55)]
    zones, hand_role = arm_zones(S, L)
    W = wf_chain(BN, ["clavicle_l", "upperarm_l", "lowerarm_l", "hand_l"], power=4.0)
    build_tube(B, path, st, zones, n, flat_phase(n), FRONT, W, True, True, flare=1.1)
    if S["gear"]["sleeves"] == "bell":
        rings = []
        H = L["H"]
        for s, k in ((U + 0.15 * Fo, 1.08), (U + 0.55 * Fo, 1.45), (U + Fo - 0.035 * H, 1.85), (U + Fo + 0.005 * H, 1.95)):
            c, ax = path.at(s)
            rings.append(ring_pts(c, ax, FRONT, ur * k, ur * k, ur * k, n, flat_phase(n)))
        c, ax = path.at(U + Fo - 0.005 * H)
        rings.append(ring_pts(c, ax, FRONT, ur * 1.82, ur * 1.82, ur * 1.82, n, flat_phase(n)))
        Wb = wf_chain(BN, ["lowerarm_l", "hand_l"], power=3.0)
        f0 = len(B.faces)
        edge = "trim" if S["cls"] in ("mage", "cleric") else "cloth3"
        B.loft(rings, ["cloth1", "cloth1", edge, "cloth2"], Wb, True, False)
        ax0, ax1 = path.at(U)[0], path.at(U + Fo + 0.05)[0]
        B.orient_radial(f0, ax0, ax1)
        # lining so the open bell is solid when seen from the cuff side
        lin = []
        for rg in rings[:-1]:
            cc = sum(rg, Vector()) / len(rg)
            lin.append([cc + (p - cc) * 0.9 for p in rg])
        f1 = len(B.faces)
        B.loft(lin, "cloth2", Wb, False, False)
        B.orient_radial(f1, ax0, ax1)
        B.flip(f1)
    return hand_role


def build_hand_left(B, S, L, BN, hand_role):
    Hd = L["hand"]
    d, n_, w = Hd["d"], Hd["n"], Hd["w"]
    pl, pw, pt = Hd["pl"], Hd["pw"], Hd["pt"]
    wr = L["wrist"]
    k = 1.08 if hand_role == "metal" else 1.0
    rings = []
    for s, kw in ((-0.012, 0.62), (0.0, 0.72), (0.5 * pl, 0.96), (pl, 1.0), (pl + 0.01, 0.94)):
        rings.append(ring_pts(wr + d * s, d, n_, pw * 0.5 * kw * k, pt * 0.5 * k, pt * 0.55 * k, 8, 0.5, 3.2))
    W = wf_chain(BN, ["lowerarm_l", "hand_l"], power=4.0)
    f0 = len(B.faces)
    B.loft(rings, hand_role, W, True, True)
    B.orient_closed(f0)
    ch = Hd["chains"]
    # mitten: the four fingers as one chunky block that still follows the finger bones
    fingers = ("index", "middle", "ring", "pinky")
    avg = [sum((ch[f][i] for f in fingers), Vector()) / 4.0 for i in range(1, 5)]
    pth = Path([avg[0] - d * 0.015] + avg)
    Lf = pth.length
    st = [(0.0, pw * 0.5 * k, pt * 0.5 * k, pt * 0.55 * k), (Lf * 0.45, pw * 0.5 * k, pt * 0.52 * k, pt * 0.55 * k),
          (Lf * 0.85, pw * 0.44 * k, pt * 0.48 * k, pt * 0.5 * k), (Lf, pw * 0.3 * k, pt * 0.32 * k, pt * 0.35 * k)]
    names = ["hand_l"] + ["%s_0%d_l" % (f, j) for f in fingers for j in (1, 2, 3)]
    Wf = wf_chain(BN, names, power=4.0, maxinf=4)
    build_tube(B, pth, st, [(1e9, hand_role, 1.0, None)], 8, 0.5, n_, Wf, ex=3.0)
    pth = Path(ch["thumb"])
    Lt = pth.length
    tr = pw * 0.17 * k
    st = [(0.0, tr * 1.1, tr * 1.1, tr * 1.1), (Lt * 0.6, tr, tr, tr), (Lt, tr * 0.8, tr * 0.8, tr * 0.8)]
    Wt = wf_chain(BN, ["hand_l", "thumb_01_l", "thumb_02_l", "thumb_03_l"], power=5.0)
    build_tube(B, pth, st, [(1e9, hand_role, 1.0, None)], 6, 0.0, n_, Wt)


def leg_zones(S, L, TLn, CL):
    g = S["gear"]
    boots = g["boots"]
    top = {"tall": TLn + 0.35 * CL, "boots": TLn + 0.52 * CL, "sabaton": TLn + 0.82 * CL, "shoes": TLn + 0.84 * CL}[boots]
    boot_role = "metal" if boots == "sabaton" else "leather"
    zones = []
    if g["greaves"]:
        zones.append((TLn + 0.12 * CL, "cloth2", 1.05, "next"))
        zones.append((top if boots == "sabaton" else min(top, TLn + 0.55 * CL), "metal", 1.15, "self" if boots != "sabaton" else "next", 1.06))
        if boots != "sabaton":
            zones.append((max(top, TLn + 0.6 * CL), "cloth2", 1.05, "next"))
        zones.append((1e9, boot_role, 1.2, None))
    elif boots == "shoes":
        zones.append((top, "cloth2", 1.07, "self"))
        zones.append((1e9, "leather", 1.0, None))
    else:
        fl = 1.18
        zones.append((top, "cloth2", 1.05, "next", fl))
        zones.append((1e9, boot_role, 1.28, None))
    return zones


def build_leg_left(B, S, L, BN):
    hip, knee, ankle = L["hip"], L["knee"], L["ankle"]
    TLn, CL = (knee - hip).length, (ankle - knee).length
    tr = L["thigh_r"]
    n = L["N"]["limb"]
    path = Path([hip, knee, ankle])
    st = [(-0.05, tr * 0.80, tr * 0.80, tr * 0.85), (0.0, tr * 0.97, tr * 0.97, tr * 1.03),
          (0.45 * TLn, tr * 0.86, tr * 0.88, tr * 0.90), (0.94 * TLn, tr * 0.62, tr * 0.66, tr * 0.60),
          (TLn + 0.25 * CL, tr * 0.66, tr * 0.60, tr * 0.80), (TLn + 0.75 * CL, tr * 0.45, tr * 0.44, tr * 0.46),
          (TLn + CL + 0.01, tr * 0.40, tr * 0.40, tr * 0.40)]
    W = wf_chain(BN, ["pelvis", "thigh_l", "calf_l", "foot_l"], power=4.0)
    build_tube(B, path, st, leg_zones(S, L, TLn, CL), n, flat_phase(n), FRONT, W, True, True, flare=1.1)
    if S["gear"]["knee_cops"]:
        Wk = wf_chain(BN, ["thigh_l", "calf_l"], power=3.0)
        c = knee + FRONT * (tr * 0.15) + UP * (tr * 0.1)
        cap_shell(B, c, (FRONT + UP * 0.2).normalized(), tr * 0.88, 8, 72, 3, 8, ["metal", "metal", "metal", "trim"],
                  Wk, ref=UP, thick=0.008)


def build_shoe_left(B, S, L, BN):
    H = L["H"]
    g = S["gear"]
    an = L["ankle"]
    F = L["foot_len"]
    sw = 0.043 * H * (1.1 if S["race"] in ("dwarf", "orc") else 1.0)
    zs = 0.016 * H
    x0 = an.x
    secs = [(an.y + 0.22 * F, 0.8, 0.10 * H), (an.y + 0.1 * F, 0.95, 0.11 * H), (an.y - 0.18 * F, 1.0, 0.085 * H),
            (an.y - 0.5 * F, 1.05, 0.06 * H), (an.y - 0.72 * F, 1.0, 0.052 * H), (an.y - 0.82 * F, 0.72, 0.038 * H)]
    if g["boots"] == "sabaton":
        secs[-1] = (an.y - 0.95 * F, 0.45, 0.022 * H)

    def sec(y, k, zt, zb):
        hw = sw * k
        zm = zb + (zt - zb) * 0.62
        return [Vector((x0 - hw, y, zb)), Vector((x0 + hw, y, zb)), Vector((x0 + hw, y, zm)),
                Vector((x0 + hw * 0.55, y, zt)), Vector((x0 - hw * 0.55, y, zt)), Vector((x0 - hw, y, zm))]
    rings = [sec(y, k, zt, zs * 0.6) for y, k, zt in secs]
    W = wf_chain(BN, ["calf_l", "foot_l", "ball_l"], power=5.0)
    main = "metal" if g["boots"] == "sabaton" else "leather"
    toe = "trim" if g["boots"] == "sabaton" else "leather_dark"
    f0 = len(B.faces)
    B.loft(rings, [main, main, main, toe, toe], W, True, True)
    B.orient_closed(f0)
    srings = []
    for y, k in [(secs[0][0] + 0.01, 0.84), (secs[1][0], 1.0), (secs[3][0], 1.12), (secs[4][0], 1.04), (secs[5][0] - 0.008, 0.66)]:
        hw = sw * k * 1.04
        srings.append([Vector((x0 - hw, y, 0.0)), Vector((x0 + hw, y, 0.0)), Vector((x0 + hw, y, zs)), Vector((x0 - hw, y, zs))])
    f0 = len(B.faces)
    B.loft(srings, "leather_dark", W, True, True)
    B.orient_closed(f0)


def build_pauldron_left(B, S, L, BN):
    kind = S["gear"]["pauldrons"]
    if not kind:
        return
    ur = L["upper_r"]
    H = L["H"]
    sh = L["sh"]
    axis = Vector((0.62, 0.0, 1.0)).normalized()
    W = wf_chain(BN, ["clavicle_l", "upperarm_l", "spine_05"], power=3.0)
    if kind == "fur":
        for k, (dx, dz, rr) in enumerate(((0.0, 0.25, 1.35), (0.55, -0.15, 1.15), (-0.45, 0.05, 1.05))):
            c = sh + Vector((dx * ur, 0.0, (0.55 + dz) * ur))
            sphere(B, c, rr * ur, rr * ur * 0.95, rr * ur * 0.8, "fur", W, n=7, rings=(-50, -10, 30, 65))
        return
    body = "leather" if kind == "leather" else "metal"
    edge = "leather_dark" if kind == "leather" else "trim"
    R = ur * (2.15 if kind != "spiked" else 2.3)
    c0 = sh + Vector((0.05 * ur, 0.0, 0.25 * ur)) - axis * (R * 0.42)
    n = 10
    cap_shell(B, c0, axis, R, 6, 72, 4, n, [body, body, body, body, edge], W, ref=FRONT, thick=0.008 * H)
    cap_shell(B, c0 + L["d_up"] * (R * 0.32) - axis * (R * 0.08), axis, R * 1.02, 58, 82, 2, n, [body, body, edge], W,
              ref=FRONT, thick=0.008 * H)
    if kind == "spiked":
        for k in range(3):
            dv = (axis + Vector(((k - 1) * 0.35, (k - 1) * -0.2, 0.0))).normalized()
            pyramid(B, c0 + dv * (R * 0.95), dv, UP, 0.12 * R, 0.12 * R, 0.55 * R, "metal_dark", W, sides=4)


# =============================================================================
#  Weapons (separate mesh, rigid to hand bones)
# =============================================================================

def build_weapon_left(Bw, S, L, kind, side_bone="hand_l"):
    """Builds a weapon in LEFT-hand space; caller mirrors it for the right hand."""
    if kind in (None, "none"):
        return
    H = L["H"]
    Hd = L["hand"]
    G = Hd["grip"]
    A = Hd["w"]                       # through the fist (forward)
    nrm = Hd["n"]
    Wd = A.cross(nrm).normalized()    # blade width direction
    W = wf_rigid(side_bone)
    if kind in ("sword", "dagger"):
        blade = 0.37 * H if kind == "sword" else 0.14 * H
        bw = 0.017 * H if kind == "sword" else 0.012 * H
        box_between(Bw, G - A * 0.045 * H, G + A * 0.04 * H, 0.009 * H, 0.009 * H, "leather_dark", W, ref=Wd, n=6)
        sphere_c = G - A * 0.055 * H
        bipyramid(Bw, sphere_c, A, 0.016 * H, 0.012 * H, 0.016 * H, "trim", W, sides=6)
        gc = G + A * 0.05 * H
        gw = 0.085 * H if kind == "sword" else 0.04 * H
        box_between(Bw, gc - Wd * gw, gc + Wd * gw, 0.011 * H, 0.009 * H, "trim", W, ref=A)
        pth = Path([gc + A * 0.005 * H, gc + A * blade])
        Lb = pth.length
        st = [(0.0, 0.0045 * H, bw, bw), (0.82 * Lb, 0.004 * H, bw * 0.9, bw * 0.9),
              (0.96 * Lb, 0.0025 * H, bw * 0.45, bw * 0.45), (Lb, 0.0005 * H, 0.001 * H, 0.001 * H)]
        build_tube(Bw, pth, st, [(1e9, "metal", 1.0, None)], 4, 0.0, Wd, W)
    elif kind == "axe":
        box_between(Bw, G - A * 0.12 * H, G + A * 0.31 * H, 0.011 * H, 0.011 * H, "wood", W, ref=Wd, n=6)
        pts = [(0.20, 0.0), (0.29, 0.0), (0.31, 0.04), (0.355, 0.13), (0.255, 0.115), (0.22, 0.04)]
        slab(Bw, [(u * H, v * H) for u, v in pts], G, A, Wd, nrm, 0.012 * H, "metal", "metal_dark", W)
        box_between(Bw, G + A * 0.19 * H, G + A * 0.30 * H, 0.016 * H, 0.016 * H, "metal_dark", W, ref=Wd, n=6)
        pyramid(Bw, G + A * 0.245 * H - Wd * 0.012 * H, -Wd, A, 0.025 * H, 0.008 * H, 0.06 * H, "metal_dark", W, sides=4)
    elif kind == "mace":
        box_between(Bw, G - A * 0.08 * H, G + A * 0.28 * H, 0.01 * H, 0.01 * H, "metal_dark", W, ref=Wd, n=6)
        c = G + A * 0.31 * H
        sphere(Bw, c, 0.035 * H, 0.035 * H, 0.035 * H, "metal", W, n=8)
        for k in range(6):
            a = TAU * k / 6
            dv = (Wd * math.cos(a) + nrm * math.sin(a)).normalized()
            pyramid(Bw, c + dv * 0.02 * H, dv, A, 0.02 * H, 0.006 * H, 0.04 * H, "metal", W, sides=4)
        bipyramid(Bw, c + A * 0.035 * H, A, 0.012 * H, 0.03 * H, 0.005 * H, "metal", W, sides=4)
    elif kind == "hammer":
        box_between(Bw, G - A * 0.1 * H, G + A * 0.36 * H, 0.012 * H, 0.012 * H, "wood", W, ref=Wd, n=6)
        c = G + A * 0.36 * H
        box_between(Bw, c - Wd * 0.075 * H, c + Wd * 0.075 * H, 0.04 * H, 0.04 * H, "metal", W, ref=A)
        for sgn in (-1, 1):
            box_between(Bw, c + Wd * (sgn * 0.06 * H), c + Wd * (sgn * 0.078 * H), 0.045 * H, 0.045 * H, "trim", W, ref=A)
        box_between(Bw, G - A * 0.1 * H, G - A * 0.06 * H, 0.016 * H, 0.016 * H, "trim", W, ref=Wd, n=6)
    elif kind in ("staff", "staff_leaf"):
        rr = random.Random(S["seed"] * 7 + 11)
        base, top = G - A * 0.47 * H, G + A * 0.40 * H
        pts = []
        for k in range(8):
            t = k / 7.0
            p = base.lerp(top, t)
            if 0 < k < 7 and abs(t - 0.5) > 0.1:
                p = p + (Wd * rr.uniform(-1, 1) + nrm * rr.uniform(-1, 1)) * (0.014 * H)
            pts.append(p)
        pth = Path(pts)
        Lp = pth.length
        st = [(0.0, 0.011 * H, 0.011 * H, 0.011 * H), (0.5 * Lp, 0.013 * H, 0.013 * H, 0.013 * H),
              (Lp, 0.016 * H, 0.016 * H, 0.016 * H)]
        build_tube(Bw, pth, st, [(1e9, "wood", 1.0, None)], 6, 0.0, Wd, W)
        P = pts[-1]
        for k in range(3):
            a = TAU * k / 3 + 0.4
            dv = (Wd * math.cos(a) + nrm * math.sin(a))
            pp = [P - A * 0.01 * H, P + dv * 0.035 * H + A * 0.05 * H, P + dv * 0.045 * H + A * 0.11 * H,
                  P + dv * 0.018 * H + A * 0.17 * H]
            pq = Path(pp)
            Lq = pq.length
            build_tube(Bw, pq, [(0.0, 0.01 * H, 0.01 * H, 0.01 * H), (Lq, 0.003 * H, 0.003 * H, 0.003 * H)],
                       [(1e9, "wood", 1.0, None)], 5, 0.0, A, W)
        bipyramid(Bw, P + A * 0.105 * H, A, 0.032 * H, 0.085 * H, 0.05 * H, "gem", W, sides=5)
        if kind == "staff_leaf":
            for k, t in enumerate((0.62, 0.74, 0.86)):
                c, ax = pth.at(Lp * t)
                a = 1.3 + k * 2.1
                out = (Wd * math.cos(a) + nrm * math.sin(a)).normalized()
                tip = c + out * 0.06 * H + A * 0.03 * H
                box_between(Bw, c, c + out * 0.025 * H + A * 0.01 * H, 0.003 * H, 0.003 * H, "wood", W, ref=A)
                lf = [(0.0, 0.0), (0.03 * H, 0.012 * H), (0.06 * H, 0.0), (0.03 * H, -0.012 * H)]
                u = (tip - c).normalized()
                v = u.cross(A).normalized()
                slab(Bw, lf, c + out * 0.02 * H, u, A, v, 0.004 * H, "leaf", "leaf", W)
    elif kind == "staff_iron":
        build_tube(Bw, Path([G - A * 0.48 * H, G + A * 0.48 * H]),
                   [(0.0, 0.009 * H, 0.009 * H, 0.009 * H), (0.96 * H, 0.011 * H, 0.011 * H, 0.011 * H)],
                   [(0.45 * H, "metal_dark", 1.0, None), (0.55 * H, "leather_dark", 1.25, None), (1e9, "metal_dark", 1.0, None)],
                   6, 0.0, Wd, W)
        pyramid(Bw, G - A * 0.48 * H, -A, Wd, 0.012 * H, 0.012 * H, 0.06 * H, "metal_dark", W, sides=4)
        P = G + A * 0.48 * H
        box_between(Bw, P - A * 0.01 * H, P + A * 0.015 * H, 0.02 * H, 0.02 * H, "trim", W, ref=Wd, n=6)
        for k in range(4):
            a = TAU * k / 4 + math.pi / 4
            dv = Wd * math.cos(a) + nrm * math.sin(a)
            mid = P + A * 0.08 * H + dv * 0.04 * H
            box_between(Bw, P + A * 0.01 * H + dv * 0.012 * H, mid, 0.005 * H, 0.005 * H, "metal_dark", W, ref=A)
            box_between(Bw, mid, P + A * 0.16 * H + dv * 0.005 * H, 0.005 * H, 0.005 * H, "metal_dark", W, ref=A)
        bipyramid(Bw, P + A * 0.085 * H, A, 0.026 * H, 0.05 * H, 0.04 * H, "gem", W, sides=5)
    elif kind == "wand":
        build_tube(Bw, Path([G - A * 0.05 * H, G + A * 0.2 * H]),
                   [(0.0, 0.008 * H, 0.008 * H, 0.008 * H), (0.25 * H, 0.004 * H, 0.004 * H, 0.004 * H)],
                   [(0.08 * H, "leather_dark", 1.15, None), (1e9, "wood", 1.0, None)], 6, 0.0, Wd, W)
        bipyramid(Bw, G + A * 0.205 * H, A, 0.007 * H, 0.012 * H, 0.004 * H, "trim", W, sides=4)
    elif kind == "book":
        C = G + nrm * 0.02 * H
        box_between(Bw, C - A * 0.055 * H, C + A * 0.055 * H, 0.045 * H, 0.018 * H, "leather_dark", W, ref=nrm)
        box_between(Bw, C - A * 0.051 * H + Wd * 0.004 * H, C + A * 0.051 * H + Wd * 0.004 * H, 0.043 * H, 0.013 * H,
                    "pages", W, ref=nrm)
        box_between(Bw, C - A * 0.01 * H, C + A * 0.01 * H, 0.047 * H, 0.02 * H, "trim", W, ref=nrm)
    elif kind == "potion":
        c = G + A * 0.055 * H
        sphere_axis = A
        bipyramid(Bw, c, A, 0.034 * H, 0.03 * H, 0.03 * H, "potion", W, sides=6)
        box_between(Bw, c + A * 0.02 * H, c + A * 0.06 * H, 0.011 * H, 0.011 * H, "glass", W, ref=Wd, n=6)
        box_between(Bw, c + A * 0.06 * H, c + A * 0.075 * H, 0.013 * H, 0.013 * H, "wood", W, ref=Wd, n=6)
    elif kind == "bow":
        d = Hd["d"]
        span = 0.36 * H
        pts = [G - A * span - d * 0.06 * H, G - A * (span * 0.55) - d * 0.012 * H, G,
               G + A * (span * 0.55) - d * 0.012 * H, G + A * span - d * 0.06 * H]
        pth = Path(pts)
        Lp = pth.length
        st = [(0.0, 0.005 * H, 0.004 * H, 0.004 * H), (0.42 * Lp, 0.01 * H, 0.009 * H, 0.009 * H),
              (0.58 * Lp, 0.01 * H, 0.009 * H, 0.009 * H), (Lp, 0.005 * H, 0.004 * H, 0.004 * H)]
        build_tube(Bw, pth, st, [(0.44 * Lp, "wood", 1.0, None), (0.56 * Lp, "leather_dark", 1.2, None), (1e9, "wood", 1.0, None)],
                   6, 0.0, d, W)
        box_between(Bw, pts[0] - d * 0.002 * H, pts[-1] - d * 0.002 * H, 0.0015 * H, 0.0015 * H, "white", W, ref=d)
    elif kind in ("shield_round", "shield_heater"):
        ur = L["upper_r"]
        Fo = L["fore_len"]
        Wl = wf_rigid("lowerarm_l")
        nr = -nrm
        C = L["elbow"] + L["d_fore"] * (0.5 * Fo) + nr * (ur * 0.95 + 0.018 * H)
        Bs = MeshBuilder()
        if kind == "shield_round":
            R = 0.12 * H
            nseg = 14
            rings = []
            for off, k in ((-0.01, 0.9), (-0.004, 1.0), (0.006, 1.0), (0.012, 0.92), (0.02, 0.55)):
                rings.append(ring_pts(C + nr * (off * H), nr, L["d_fore"], R * k, R * k, R * k, nseg, 0.0))
            Bs.loft(rings, ["metal_dark", "metal", "metal", "cloth1"], Wl, True, True)
            Bs.orient_closed(0)
            sphere_c = C + nr * 0.02 * H
            bvs = Bs.bvh()
            q, nn = project(bvs, C + nr * 0.2, -nr, back=0.0, off=0.0)
            Bw.merge(Bs)
            cap_shell(Bw, sphere_c - nr * 0.012 * H, nr, 0.035 * H, 8, 70, 2, 8, "metal", Wl, ref=L["d_fore"], thick=0.004 * H)
            if nn is not None:
                for k in range(4):
                    a = TAU * k / 4 + math.pi / 4
                    p = q + (L["d_fore"] * math.cos(a) + nr.cross(L["d_fore"]).normalized() * math.sin(a)) * (R * 0.72)
                    qq, n2 = project(bvs, p + nr * 0.1, -nr, back=0.0, off=0.0)
                    if n2 is not None:
                        pyramid(Bw, qq, n2, UP, 0.008 * H, 0.008 * H, 0.008 * H, "metal", Wl, sides=4)
        else:
            v = (-UP) - nr * (-UP).dot(nr)
            v = v.normalized()
            u = v.cross(nr).normalized()
            sw, shh = 0.1 * H, 0.13 * H
            shape = [(-1, 1), (1, 1), (1, 0.15), (0.75, -0.45), (0, -1.0), (-0.75, -0.45), (-1, 0.15)]
            pts = [(x * sw, y * shh) for x, y in shape]
            slab(Bs, pts, C, u, -v, nr, 0.016 * H, "cloth1", "trim", Wl)
            bvs = Bs.bvh()
            Bw.merge(Bs)
            q, nn = project(bvs, C + nr * 0.2 + v * (-0.15 * shh), -nr, back=0.0, off=0.0)
            if nn is not None:
                em = S["gear"]["emblem"]
                s = sw * 0.5
                if em in ("cross", "bars"):
                    decal_strip(Bw, bvs, q, nn, 1.6 * s, 0.32 * s, math.radians(90), 3, "emblem", Wl, off=0.004)
                    decal_strip(Bw, bvs, q + UP * 0.25 * s, nn, 1.1 * s, 0.32 * s, 0.0, 2, "emblem", Wl, off=0.005)
                else:
                    decal(Bw, bvs, q, nn, [(0, s), (s * 0.7, 0), (0, -s), (-s * 0.7, 0)], "emblem", Wl, off=0.004)


# =============================================================================
#  Assembly
# =============================================================================

def build_geometry(S, L, bones):
    BN = {n: (hd, tl) for n, hd, tl, p in bones}
    g = S["gear"]
    H, T = L["H"], L["T"]
    B = MeshBuilder()
    Bt = build_torso(S, L, BN)
    bvh_t = Bt.bvh()
    B.merge(Bt)
    build_neck(B, S, L, BN)
    # lower garments
    if g["coat"]:
        build_robe(B, S, L, BN, kind=g["coat"], role="cloth2", shrink=0.88, trim=False)
        build_coat(B, S, L, BN)
    elif g["robe"]:
        build_robe(B, S, L, BN)
    if g["tunic_skirt"]:
        skirt_shell(B, L, BN, L["z_hip"] + 0.17 * T, L["z_hip"] - 0.13 * H, 1.06, 1.25, ["cloth1", "cloth1", "cloth3"],
                    n=L["N"]["shell"])
    if g["faulds"]:
        z0 = L["z_hip"] + 0.2 * T
        skirt_shell(B, L, BN, z0, L["z_hip"] - 0.03 * H, 1.14, 1.3, ["metal", "metal", "trim"], n=L["N"]["shell"], extra=0.01)
        skirt_shell(B, L, BN, L["z_hip"] - 0.01 * H, L["z_hip"] - 0.085 * H, 1.32, 1.42, ["metal", "metal", "trim"],
                    n=L["N"]["shell"], extra=0.012)
    build_chest_armor(B, S, L, BN)
    bvh_body = B.bvh()
    build_belt_items(B, S, L, BN, bvh_body)
    build_mage_extras(B, S, L, BN, bvh_body, bvh_t)
    if g["apron"]:
        build_front_panel(B, S, L, BN, bvh_body, L["z_hip"] + 0.62 * T, L["z_knee"] + 0.0 * H,
                          L["chest_half"] * 0.62, L["hip_half"] * 0.8, "leather", trim="leather_dark")
    if g["tabard"]:
        zt = L["z_sh"] - 0.01 * H
        zb = L["z_knee"] + 0.15 * (L["z_hip"] - L["z_knee"])
        build_front_panel(B, S, L, BN, bvh_body, zt, zb, L["chest_half"] * 0.6, L["hip_half"] * 0.72, "cloth1",
                          emblem=True, trim="trim")
        build_front_panel(B, S, L, BN, bvh_body, zt, zb, L["chest_half"] * 0.6, L["hip_half"] * 0.72, "cloth1",
                          back=True, trim="trim")
    if g["cape"]:
        build_cape(B, S, L, BN, g["cape"])
    if g["mantle"]:
        build_mantle(B, S, L, BN)
    if g["capelet"]:
        build_capelet(B, S, L, BN)
    build_back_items(B, S, L, BN)
    # head
    Bh = build_head(S, L)
    bvh_h = Bh.bvh()
    B.merge(Bh)
    if not face_hidden(S):
        build_face(B, bvh_h, S, L)
    build_facial_hair(B, S, L)
    build_hair(B, S, L)
    if g["hood"] == "up":
        build_hood_up(B, S, L, BN)
    build_helmet(B, S, L)
    # limbs (left, mirrored)
    Bl = MeshBuilder()
    hand_role = build_arm_left(Bl, S, L, BN)
    build_hand_left(Bl, S, L, BN, hand_role)
    build_leg_left(Bl, S, L, BN)
    build_shoe_left(Bl, S, L, BN)
    build_pauldron_left(Bl, S, L, BN)
    B.merge(Bl)
    B.merge(Bl, mirror=True)
    # weapons
    Bw = MeshBuilder()
    if g["weapon_r"] != "none":
        Br = MeshBuilder()
        build_weapon_left(Br, S, L, g["weapon_r"])
        Bw.merge(Br, mirror=True)
    if g["weapon_l"] != "none":
        build_weapon_left(Bw, S, L, g["weapon_l"])
    return B, Bw


def generate_data(seed=0, **overrides):
    S = make_spec(seed, **overrides)
    L = compute_layout(S)
    bones = compute_bones(S, L)
    B, Bw = build_geometry(S, L, bones)
    return S, L, bones, B, Bw


def export_glb(S, bones, B, Bw=None, filepath="character.glb", name=None, include_weapons=True):
    """Pure-python skinned glTF 2.0 (.glb) writer - no Blender needed.
    Flat-shaded (split vertices per face), one primitive per material role, vertex colours,
    PBR factors (metal roles metallic), joints = UE5-mannequin-named bones.
    Coordinates: generator space (Z-up, character faces -Y, metres) -> glTF (Y-up, faces +Z)."""
    import struct as _st
    name = name or "LowPoly_%s_%s_%d" % (S["race"], S["cls"], S["seed"])

    def cv(p):
        return (float(p[0]), float(p[2]), float(-p[1]))

    parts = [B] + ([Bw] if (include_weapons and Bw is not None and Bw.faces) else [])
    bone_names = [b[0] for b in bones]
    bidx = {n: i for i, n in enumerate(bone_names)}
    heads = {n: hd for n, hd, tl, p in bones}
    # ---- geometry, grouped by role
    groups = {}
    for M in parts:
        for f, role in zip(M.faces, M.roles):
            g = groups.setdefault(role, {"pos": [], "nrm": [], "j": [], "w": []})
            nrm = M.fnormal(f)
            nrm = nrm.normalized() if nrm.length > 0 else Vector((0, 0, 1))
            n_g = cv(nrm)
            for k in range(1, len(f) - 1):
                for vi in (f[0], f[k], f[k + 1]):
                    g["pos"].append(cv(M.verts[vi]))
                    g["nrm"].append(n_g)
                    wd = sorted(M.vw[vi].items(), key=lambda kv: -kv[1])[:4]
                    tot = sum(w for _, w in wd) or 1.0
                    js = [bidx[n] for n, _ in wd] + [0] * (4 - len(wd))
                    ws = [w / tot for _, w in wd] + [0.0] * (4 - len(wd))
                    g["j"].append(js)
                    g["w"].append(ws)
    blob = bytearray()
    views, accessors = [], []

    def add_view(data, target=None):
        while len(blob) % 4:
            blob.append(0)
        off = len(blob)
        blob.extend(data)
        v = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target:
            v["target"] = target
        views.append(v)
        return len(views) - 1

    def add_acc(data, comp, count, typ, target=None, minmax=None, normalized=False):
        a = {"bufferView": add_view(data, target), "componentType": comp, "count": count, "type": typ}
        if minmax:
            a["min"], a["max"] = minmax
        if normalized:
            a["normalized"] = True
        accessors.append(a)
        return len(accessors) - 1

    materials, prims = [], []
    used = sorted(groups.keys(), key=ROLE_ORDER.index)
    for role in used:
        g = groups[role]
        lin = to_linear(S["colors"][role])
        metal = role in METAL_ROLES
        mat = {"name": "%s_M_%s" % (name, role),
               "pbrMetallicRoughness": {"baseColorFactor": [lin[0], lin[1], lin[2], 1.0],
                                        "metallicFactor": 1.0 if metal else 0.0,
                                        "roughnessFactor": 0.38 if metal else 0.85}}
        if role == "gem":
            mat["emissiveFactor"] = [lin[0], lin[1], lin[2]]
        materials.append(mat)
        n = len(g["pos"])
        xs = [p[0] for p in g["pos"]]; ys = [p[1] for p in g["pos"]]; zs = [p[2] for p in g["pos"]]
        a_pos = add_acc(b"".join(_st.pack("<3f", *p) for p in g["pos"]), 5126, n, "VEC3", 34962,
                        ([min(xs), min(ys), min(zs)], [max(xs), max(ys), max(zs)]))
        a_nrm = add_acc(b"".join(_st.pack("<3f", *p) for p in g["nrm"]), 5126, n, "VEC3", 34962)
        col = _st.pack("<4f", lin[0], lin[1], lin[2], 1.0)
        a_col = add_acc(col * n, 5126, n, "VEC4", 34962)
        a_j = add_acc(b"".join(_st.pack("<4H", *j) for j in g["j"]), 5123, n, "VEC4", 34962)
        a_w = add_acc(b"".join(_st.pack("<4f", *w) for w in g["w"]), 5126, n, "VEC4", 34962)
        a_i = add_acc(b"".join(_st.pack("<I", i) for i in range(n)), 5125, n, "SCALAR", 34963)
        prims.append({"attributes": {"POSITION": a_pos, "NORMAL": a_nrm, "COLOR_0": a_col,
                                     "JOINTS_0": a_j, "WEIGHTS_0": a_w},
                      "indices": a_i, "material": len(materials) - 1})
    # ---- skeleton nodes (identity rotations, translations only)
    nodes = []
    for n_, hd, tl, par in bones:
        local = Vector(hd) - (Vector(heads[par]) if par else Vector((0, 0, 0)))
        nodes.append({"name": n_, "translation": list(cv(local))})
    for i, (n_, hd, tl, par) in enumerate(bones):
        if par:
            nodes[bidx[par]].setdefault("children", []).append(i)
    ibm = b""
    for n_, hd, tl, par in bones:
        x, y, z = cv(hd)
        ibm += _st.pack("<16f", 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1)
    a_ibm = add_acc(ibm, 5126, len(bones), "MAT4")
    mesh_node = len(nodes)
    nodes.append({"name": name, "mesh": 0, "skin": 0})
    roots = [i for i, b in enumerate(bones) if b[3] is None]
    gltf = {
        "asset": {"version": "2.0", "generator": "lowpoly_fantasy_gen export_glb"},
        "scene": 0,
        "scenes": [{"name": name, "nodes": roots + [mesh_node]}],
        "nodes": nodes,
        "meshes": [{"name": name, "primitives": prims}],
        "materials": materials,
        "skins": [{"name": name + "_Skeleton", "joints": list(range(len(bones))), "inverseBindMatrices": a_ibm,
                   "skeleton": roots[0]}],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(blob)}],
        "extras": {"lpg_spec": spec_summary(S)},
    }
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(js) % 4:
        js += b" "
    while len(blob) % 4:
        blob.append(0)
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(filepath, "wb") as fh:
        fh.write(_st.pack("<III", 0x46546C67, 2, total))
        fh.write(_st.pack("<II", len(js), 0x4E4F534A) + js)
        fh.write(_st.pack("<II", len(blob), 0x004E4942) + bytes(blob))
    return filepath


def spec_summary(S):
    g = S["gear"]
    out = {k: (round(S[k], 2) if isinstance(S[k], float) else S[k])
           for k in ("seed", "race", "cls", "height", "hair", "beard")}
    for k in ("armor", "pauldrons", "helmet", "hood", "cape", "robe", "weapon_r", "weapon_l"):
        if g[k] not in (None, "none", False):
            out[k] = g[k]
    return out


# =============================================================================
#  Blender side
# =============================================================================

def _ctx():
    if bpy.context.window is None:
        wm = bpy.context.window_manager
        if wm and wm.windows:
            win = wm.windows[0]
            scr = win.screen
            area = next((a for a in scr.areas if a.type == "VIEW_3D"), scr.areas[0])
            region = next((r for r in area.regions if r.type == "WINDOW"), None)
            return bpy.context.temp_override(window=win, screen=scr, area=area, region=region)
    return contextlib.nullcontext()


def get_collection(name=COLLECTION_NAME):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    elif name not in bpy.context.scene.collection.children:
        try:
            bpy.context.scene.collection.children.link(coll)
        except RuntimeError:
            pass
    return coll


def make_material(name, role, rgb):
    lin = to_linear(rgb)
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    metal = role in METAL_ROLES
    rough = 0.38 if metal else (0.55 if role in ("gem", "eye", "iris") else 0.85)
    m.diffuse_color = (lin[0], lin[1], lin[2], 1.0)
    try:
        m.roughness = rough
        m.metallic = 1.0 if metal else 0.0
    except Exception:
        pass
    try:
        if m.node_tree is None:
            m.use_nodes = True
    except Exception:
        pass
    nt = getattr(m, "node_tree", None)
    if nt is not None:
        bsdf = next((nd for nd in nt.nodes if nd.type == "BSDF_PRINCIPLED"), None)
        if bsdf is not None:
            bsdf.inputs["Base Color"].default_value = (lin[0], lin[1], lin[2], 1.0)
            for key, val in (("Roughness", rough), ("Metallic", 1.0 if metal else 0.0)):
                if key in bsdf.inputs:
                    bsdf.inputs[key].default_value = val
            if role == "gem":
                for key in ("Emission Color", "Emission"):
                    if key in bsdf.inputs:
                        bsdf.inputs[key].default_value = (lin[0], lin[1], lin[2], 1.0)
                        break
                if "Emission Strength" in bsdf.inputs:
                    bsdf.inputs["Emission Strength"].default_value = 2.0
    m["lpg"] = 1
    return m


def clear_generated():
    coll = bpy.data.collections.get(COLLECTION_NAME)
    if coll is None:
        return
    for o in list(coll.objects):
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if data is not None and data.users == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Armature):
                bpy.data.armatures.remove(data)
    for m in list(bpy.data.materials):
        if m.users == 0 and m.get("lpg"):
            bpy.data.materials.remove(m)


def _mesh_object(name, B, S, bones, coll, arm_obj, char_name):
    me = bpy.data.meshes.new(name + "_Mesh")
    me.from_pydata([tuple(v) for v in B.verts], [], [list(f) for f in B.faces])
    me.update(calc_edges=True)
    used = sorted(set(B.roles), key=ROLE_ORDER.index)
    ridx = {r: i for i, r in enumerate(used)}
    for r in used:
        me.materials.append(make_material("%s_M_%s" % (char_name, r), r, S["colors"][r]))
    me.polygons.foreach_set("material_index", [ridx[r] for r in B.roles])
    me.polygons.foreach_set("use_smooth", [False] * len(B.faces))
    try:
        ca = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
        cols = []
        for poly in me.polygons:
            lin = to_linear(S["colors"][used[poly.material_index]])
            for _ in range(poly.loop_total):
                cols.extend((lin[0], lin[1], lin[2], 1.0))
        ca.data.foreach_set("color", cols)
        me.color_attributes.active_color = ca
    except Exception as ex:  # noqa
        print("LPG: colour attribute skipped:", ex)
    me.update()
    obj = bpy.data.objects.new(name, me)
    coll.objects.link(obj)
    obj.parent = arm_obj
    groups = {}
    for vi, wd in enumerate(B.vw):
        for bn, w in wd.items():
            groups.setdefault(bn, []).append((vi, w))
    for bn in [b[0] for b in bones]:
        vg = obj.vertex_groups.new(name=bn)
        for vi, w in groups.get(bn, ()):
            vg.add([vi], w, "REPLACE")
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm_obj
    return obj


def to_blender(S, bones, B, Bw, name=None, collection=None):
    name = name or "Fantasy_%s_%s_%d" % (S["race"], S["cls"], S["seed"])
    coll = collection or get_collection()
    vl = bpy.context.view_layer
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        with _ctx():
            bpy.ops.object.mode_set(mode="OBJECT")
    arm_data = bpy.data.armatures.new(name + "_Skeleton")
    arm_obj = bpy.data.objects.new(name + "_Rig", arm_data)
    coll.objects.link(arm_obj)
    arm_data.display_type = "STICK"
    for o in vl.objects:
        o.select_set(False)
    vl.objects.active = arm_obj
    arm_obj.select_set(True)
    with _ctx():
        bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones
    for nm, hd, tl, par in bones:
        e = eb.new(nm)
        e.head = tuple(hd)
        e.tail = tuple(tl)
        if par:
            e.parent = eb[par]
        e.use_connect = False
    for e in eb:
        ax = (e.tail - e.head).normalized()
        e.align_roll((0.0, 0.0, 1.0) if abs(ax.y) > 0.8 else (0.0, -1.0, 0.0))
        if e.name == "root" or e.name.startswith("ik_"):
            e.use_deform = False
    with _ctx():
        bpy.ops.object.mode_set(mode="OBJECT")
    body = _mesh_object(name, B, S, bones, coll, arm_obj, name)
    weapons = _mesh_object(name + "_Weapons", Bw, S, bones, coll, arm_obj, name) if Bw.faces else None
    if weapons is not None:
        weapons["lpg_weapons"] = 1
    arm_obj["lpg_seed"] = S["seed"]
    arm_obj["lpg_spec"] = json.dumps(spec_summary(S))
    arm_obj["lpg_hold"] = json.dumps({"r": S["gear"]["weapon_r"] != "none", "l": S["gear"]["weapon_l"] != "none"})
    return arm_obj, body, weapons


def create_character(seed=0, name=None, collection=None, location=(0, 0, 0), **overrides):
    S, L, bones, B, Bw = generate_data(seed, **overrides)
    arm, body, weapons = to_blender(S, bones, B, Bw, name, collection)
    arm.location = location
    return arm, body, weapons


def create_lineup(seeds, spacing=1.6, row_len=6, row_gap=2.6, **overrides):
    out = []
    for i, sd in enumerate(seeds):
        row, col = divmod(i, row_len)
        n_in_row = min(row_len, len(seeds) - row * row_len)
        x = (col - (n_in_row - 1) / 2.0) * spacing
        out.append(create_character(sd, location=(x, 0.0, -row * row_gap), **dict(overrides)))
    return out


def export_fbx(arm_obj, meshes, filepath):
    vl = bpy.context.view_layer
    for o in vl.objects:
        o.select_set(False)
    arm_obj.select_set(True)
    for m in meshes:
        if m is not None:
            m.select_set(True)
    vl.objects.active = arm_obj
    old_name, old_loc = arm_obj.name, arm_obj.location.copy()
    other = bpy.data.objects.get("Armature")
    if other is not None and other != arm_obj:
        other.name = "Armature__tmp"
    arm_obj.name = "Armature"
    arm_obj.location = (0.0, 0.0, 0.0)
    old_pose = arm_obj.data.pose_position
    arm_obj.data.pose_position = "REST"        # export the A-pose bind pose, not the display pose
    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    try:
        with _ctx():
            bpy.ops.export_scene.fbx(
                filepath=filepath, use_selection=True, object_types={"ARMATURE", "MESH"},
                apply_unit_scale=True, apply_scale_options="FBX_SCALE_ALL", global_scale=1.0,
                axis_forward="-Z", axis_up="Y", add_leaf_bones=False,
                primary_bone_axis="Y", secondary_bone_axis="X",
                use_armature_deform_only=False, mesh_smooth_type="FACE",
                use_mesh_modifiers=False, bake_anim=False, use_tspace=False, colors_type="SRGB")
    finally:
        arm_obj.name = old_name
        arm_obj.location = old_loc
        arm_obj.data.pose_position = old_pose
        if other is not None and other != arm_obj:
            other.name = "Armature"
    return filepath


def pose_bone_world(arm_obj, bname, axis, deg):
    from mathutils import Quaternion
    b = arm_obj.data.bones[bname]
    R = b.matrix_local.to_quaternion()
    pb = arm_obj.pose.bones[bname]
    pb.rotation_mode = "QUATERNION"
    pb.rotation_quaternion = R.inverted() @ Quaternion(axis, math.radians(deg)) @ R


def apply_display_pose(arm_obj):
    """Relaxed showcase pose: arms down, weapon hand forward so staves/swords stand upright.
    Only for previews/screenshots - the exported rest pose stays the UE-style A-pose."""
    from mathutils import Matrix

    def frame_m(d, w):
        d = d.normalized()
        w = (w - d * w.dot(d)).normalized()
        return Matrix((d, w, d.cross(w))).transposed()

    hold = json.loads(arm_obj.get("lpg_hold", "{}"))
    bones, pbs = arm_obj.data.bones, arm_obj.pose.bones
    for pb in pbs:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    for side, sg in (("l", 1), ("r", -1)):
        ua, la = bones["upperarm_" + side], bones["lowerarm_" + side]
        hd, th = bones["hand_" + side], bones["thumb_01_" + side]
        D1 = (ua.tail_local - ua.head_local).normalized()
        D2 = (la.tail_local - la.head_local).normalized()
        Wv = th.head_local - hd.head_local
        Ru = D1.rotation_difference(Vector((sg * 0.55, -0.1, -1.0)).normalized()).to_matrix()
        if hold.get(side):
            ft, wt = Vector((sg * 0.75, -1.0, -0.25)).normalized(), Vector((0.0, 0.0, 1.0))
        else:
            ft, wt = Vector((sg * 0.12, -0.35, -1.0)).normalized(), Vector((0.0, -1.0, 0.1))
        Rl = frame_m(ft, wt) @ frame_m(Ru @ D2, Ru @ Wv).transposed()
        pbs["upperarm_" + side].matrix = Matrix.Translation(ua.head_local) @ (Ru @ ua.matrix_local.to_3x3()).to_4x4()
        bpy.context.view_layer.update()
        elbow = ua.head_local + Ru @ (la.head_local - ua.head_local)
        pbs["lowerarm_" + side].matrix = Matrix.Translation(elbow) @ ((Rl @ Ru) @ la.matrix_local.to_3x3()).to_4x4()
        bpy.context.view_layer.update()


def clear_pose(arm_obj):
    from mathutils import Matrix
    for pb in arm_obj.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)


def apply_test_pose(arm_obj):
    for bn, ax, dg in (("upperarm_l", (0, 1, 0), -55), ("lowerarm_l", (0, 0, 1), -70),
                       ("upperarm_r", (0, 1, 0), 20), ("lowerarm_r", (0, 0, 1), 40),
                       ("thigh_l", (1, 0, 0), -55), ("calf_l", (1, 0, 0), 80),
                       ("spine_03", (0, 0, 1), 15), ("head", (0, 0, 1), 25)):
        if bn in arm_obj.data.bones:
            pose_bone_world(arm_obj, bn, ax, dg)


def setup_preview_scene(res=(1800, 900)):
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_WORKBENCH"
    except Exception:
        pass
    shd = sc.display.shading
    shd.light = "STUDIO"
    shd.color_type = "MATERIAL"
    for attr, val in (("show_cavity", True), ("cavity_type", "WORLD"), ("show_object_outline", True),
                      ("object_outline_color", (0.08, 0.08, 0.1))):
        try:
            setattr(shd, attr, val)
        except Exception:
            pass
    if sc.world is None:
        sc.world = bpy.data.worlds.new("LPG_World")
    sc.world.color = (0.80, 0.82, 0.85)
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    cam = bpy.data.objects.get("LPG_Cam")
    if cam is None:
        cam = bpy.data.objects.new("LPG_Cam", bpy.data.cameras.new("LPG_Cam"))
        sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    sc.camera = cam
    return cam


def render_view(filepath, center, ortho_scale, yaw_deg=0.0, pitch_deg=0.0, res=(1800, 900)):
    from mathutils import Euler
    cam = setup_preview_scene(res)
    cam.data.ortho_scale = ortho_scale
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    dirv = Vector((-math.sin(yaw) * math.cos(pitch), math.cos(yaw) * math.cos(pitch), -math.sin(pitch)))
    cam.location = Vector(center) - dirv * 20.0
    cam.rotation_euler = Euler((math.radians(90) - pitch, 0.0, yaw), "XYZ")
    cam.data.clip_end = 100.0
    bpy.context.scene.render.filepath = filepath
    with _ctx():
        bpy.ops.render.render(write_still=True)
    return filepath


# ----------------------------------------------------------------------------- UI

if bpy is not None:
    from bpy.props import IntProperty, EnumProperty, StringProperty, BoolProperty

    def _enum(vals):
        return [("AUTO", "Auto (seed)", "")] + [(v, v.replace("_", " ").title(), "") for v in vals]

    class FLPG_Props(bpy.types.PropertyGroup):
        seed: IntProperty(name="Seed", default=1, min=0)
        count: IntProperty(name="Count", default=1, min=1, max=60)
        replace: BoolProperty(name="Replace previous", default=True)
        race: EnumProperty(name="Race", items=_enum(RACES))
        cls: EnumProperty(name="Class", items=_enum(CLASSES))
        hair: EnumProperty(name="Hair", items=_enum(HAIR_STYLES))
        helmet: EnumProperty(name="Helmet", items=_enum(HELMETS))
        weapon_r: EnumProperty(name="Right hand", items=_enum(WEAPONS_R))
        weapon_l: EnumProperty(name="Left hand", items=_enum(WEAPONS_L))
        mage_kind: EnumProperty(name="Mage type", items=_enum(MAGE_KINDS))
        display_pose: BoolProperty(name="Display pose (preview only)", default=True)
        detail: EnumProperty(name="Detail", items=[("high", "High", ""), ("low", "Low", "")])
        include_weapons: BoolProperty(name="Include weapons in FBX", default=True)
        export_dir: StringProperty(name="Export dir", subtype="DIR_PATH", default="//fantasy_export/")

    def _overrides(p):
        ov, gear = {"detail": p.detail}, {}
        for k in ("race", "cls", "hair"):
            v = getattr(p, k)
            if v != "AUTO":
                ov[k] = v
        if p.mage_kind != "AUTO":
            gear["mage_kind"] = p.mage_kind
        for k in ("helmet", "weapon_r", "weapon_l"):
            v = getattr(p, k)
            if v != "AUTO":
                gear[k] = v
        if gear:
            ov["gear"] = gear
        return ov

    class FLPG_OT_generate(bpy.types.Operator):
        bl_idname = "flpg.generate"
        bl_label = "Generate"
        bl_options = {"REGISTER", "UNDO"}

        def execute(self, context):
            p = context.scene.flpg
            if p.replace:
                clear_generated()
            res = []
            for i in range(p.count):
                row, col = divmod(i, 6)
                n_in_row = min(6, p.count - row * 6)
                res.append(create_character(p.seed + i, location=((col - (n_in_row - 1) / 2.0) * 1.6, 0, -row * 2.6),
                                            **_overrides(p)))
            if p.display_pose:
                for arm, _, _ in res:
                    apply_display_pose(arm)
            if res:
                for o in context.view_layer.objects:
                    o.select_set(False)
                res[-1][0].select_set(True)
                context.view_layer.objects.active = res[-1][0]
            self.report({"INFO"}, "Generated %d character(s)" % len(res))
            return {"FINISHED"}

    class FLPG_OT_random(bpy.types.Operator):
        bl_idname = "flpg.random"
        bl_label = "Random Seed"
        bl_options = {"REGISTER", "UNDO"}

        def execute(self, context):
            context.scene.flpg.seed = random.randint(0, 99999)
            return bpy.ops.flpg.generate()

    class FLPG_OT_export(bpy.types.Operator):
        bl_idname = "flpg.export"
        bl_label = "Export FBX (selected)"

        def execute(self, context):
            p = context.scene.flpg
            out_dir = bpy.path.abspath(p.export_dir)
            n = 0
            arms = {o if o.type == "ARMATURE" else o.parent for o in context.selected_objects}
            for arm in arms:
                if arm is None or "lpg_seed" not in arm:
                    continue
                meshes = [c for c in arm.children if c.type == "MESH" and (p.include_weapons or "lpg_weapons" not in c)]
                spec = json.loads(arm["lpg_spec"])
                fname = "SK_%s_%s_%d.fbx" % (spec["race"].title(), spec["cls"].title(), arm["lpg_seed"])
                export_fbx(arm, meshes, os.path.join(out_dir, fname))
                n += 1
            self.report({"INFO"}, "Exported %d FBX to %s" % (n, out_dir))
            return {"FINISHED"}

    class FLPG_PT_panel(bpy.types.Panel):
        bl_label = "Fantasy Character"
        bl_idname = "FLPG_PT_panel"
        bl_space_type = "VIEW_3D"
        bl_region_type = "UI"
        bl_category = "Fantasy Gen"

        def draw(self, context):
            p = context.scene.flpg
            col = self.layout.column(align=True)
            for k in ("seed", "count", "replace"):
                col.prop(p, k)
            col.separator()
            for k in ("race", "cls", "mage_kind", "hair", "helmet", "weapon_r", "weapon_l", "detail", "display_pose"):
                col.prop(p, k)
            col.separator()
            row = col.row(align=True)
            row.operator("flpg.generate", icon="OUTLINER_OB_ARMATURE")
            row.operator("flpg.random", icon="FILE_REFRESH")
            col.separator()
            col.prop(p, "export_dir")
            col.prop(p, "include_weapons")
            col.operator("flpg.export", icon="EXPORT")
            arm = context.active_object
            if arm is not None and "lpg_seed" not in arm and arm.parent is not None:
                arm = arm.parent
            if arm is not None and "lpg_spec" in arm:
                box = self.layout.box()
                for k, v in json.loads(arm["lpg_spec"]).items():
                    box.label(text="%s: %s" % (k, v))

    _CLASSES = (FLPG_Props, FLPG_OT_generate, FLPG_OT_random, FLPG_OT_export, FLPG_PT_panel)


def register():
    for c in _CLASSES:
        try:
            bpy.utils.register_class(c)
        except ValueError:
            bpy.utils.unregister_class(c)
            bpy.utils.register_class(c)
    bpy.types.Scene.flpg = bpy.props.PointerProperty(type=FLPG_Props)


def unregister():
    del bpy.types.Scene.flpg
    for c in reversed(_CLASSES):
        bpy.utils.unregister_class(c)


def _cli():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    import argparse
    ap = argparse.ArgumentParser(prog="lowpoly_fantasy_gen")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--count", type=int, default=1)
    ap.add_argument("--race", default=None)
    ap.add_argument("--cls", default=None)
    ap.add_argument("--fbx", default="")
    ap.add_argument("--no-weapons", action="store_true")
    ap.add_argument("--render", default="")
    ap.add_argument("--mage", default=None, help="wizard|pyromancer|frost|druid|warlock|alchemist")
    ap.add_argument("--display-pose", action="store_true")
    a = ap.parse_args(argv)
    clear_generated()
    ov = dict(race=a.race, cls=a.cls)
    if a.mage:
        ov["gear"] = {"mage_kind": a.mage}
    res = create_lineup([a.seed + i for i in range(a.count)], **ov)
    if a.display_pose:
        for arm, _, _ in res:
            apply_display_pose(arm)
    if a.fbx:
        for arm, body, weapons in res:
            path = a.fbx if a.count == 1 else a.fbx.replace(".fbx", "_%d.fbx" % arm["lpg_seed"])
            export_fbx(arm, [body] + ([] if a.no_weapons else [weapons]), path)
    if a.render:
        n = min(a.count, 6)
        render_view(a.render, (0, 0, 0.9), max(2.6, n * 1.6 + 0.8), res=(1800, 900))


if __name__ == "__main__" and bpy is not None:
    if bpy.app.background and "--" in sys.argv:
        _cli()
    else:
        register()
        print("Fantasy Gen ready: 3D View > Sidebar (N) > Fantasy Gen")
