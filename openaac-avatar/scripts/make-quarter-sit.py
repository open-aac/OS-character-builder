"""
Stand-in seated legs for the ¾ view, traced from a reference drawing of the
broad body sitting (art/stand-ins/quarter-sit-reference.png, 2016 × 2096 px).

    python3 scripts/make-quarter-sit.py

Writes art/source/three-quarter/addons/stand-in-sit.{low,high}.svg with, for
each leg: `leg_X_lower@sit` (hidden under the thigh; it only replaces the
standing shin), `leg_X_upper@sit` (the whole seated leg), `leg_X_foot@sit`
and `pants_leg_X_upper@sit` (the seated shorts). Trousers and loose shorts
are made from these when compiling, as for the front view.

The broad (high) extreme is the reference traced; the slim (low) extreme is
the same outline mapped onto slimmer, closer-together legs, point for point,
so the two blend. Delete the add-on once the designer draws seated ¾ legs.
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as nd
from skimage import measure, morphology  # disk() footprints and contours

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / 'art/stand-ins/quarter-sit-reference.png'
OUT = ROOT / 'art/source/three-quarter/addons'

# Reference pixels → ¾ art units for the broad body (matched on the head and the shirt).
S, TX, TY = 0.43, -4.0, -63.0
LINE = 10.2  # outline width in art units
PX = LINE / S  # outline width in reference pixels

# Seed points (reference pixels) inside each region, and the leg's centre line (art units, broad body).
LEGS = {
    # Far leg (the figure's right), on the viewer's left.
    'R': {'trousers': [(746, 1552), (653, 1292)], 'foot': (720, 1949),
          'hip': (361.5, 487.0), 'knee': (275.5, 560.0), 'ankle': (318.5, 741.0)},
    # Near leg (the figure's left), on the viewer's right; the hand resting on it is part of the thigh.
    'L': {'trousers': [(1300, 1500), (1203, 1339)], 'foot': (1046, 1987),
          'hip': (619.5, 517.5), 'knee': (447.5, 573.0), 'ankle': (464.7, 750.0)},
}
# Slim body: hips under the slim torso, knees closer together, longer shins (as in the standing art).
SLIM = {
    'R': {'hip': (462.0, 440.0), 'knee': (335.0, 495.0), 'ankle': (390.0, 735.0)},
    'L': {'hip': (548.0, 452.0), 'knee': (405.0, 510.0), 'ankle': (430.0, 745.0)},
}
# Slim width ÷ broad width along the leg: at the hip, knee and ankle (from the standing art).
WIDTH = (0.34, 0.32, 0.38)
# Behind the hip (the seat), how far the outline reaches back compared with the broad body: the slim
# seat must end under the back of the slim shirt.
SEAT = 0.3
FOOT_SCALE = 0.92
SMOOTH = 9  # px of edge smoothing in the reference
BLEND = 18.0  # art units: how far from a bone its placement still counts (see to_slim)
SKIN, CLOTH, INK = '#d59965', '#acacac', '#000000'


def masks():
    im = np.asarray(Image.open(REF).convert('RGB')).astype(int)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    blue = (b > 150) & (r < 120)
    skin = (r > 150) & (g > 110) & (g < 170) & (b < 130) & (r - b > 50)
    low = np.arange(im.shape[0])[:, None] > 1250
    lab, _ = nd.label(blue | (skin & low))
    return lab


def region(lab, seeds, grow_px):
    m = np.zeros(lab.shape, bool)
    for x, y in seeds:
        m |= lab == lab[y, x]
    # Bridge the outline and fold lines inside the region, fill holes (the hand), out to the outline's middle.
    m = nd.binary_closing(m, morphology.disk(int(PX * 0.7)), border_value=0)
    m = nd.binary_fill_holes(m)
    m = smooth(m)
    if grow_px > 0:
        m = nd.binary_dilation(m, morphology.disk(int(grow_px)))
    elif grow_px < 0:
        m = nd.binary_erosion(m, morphology.disk(int(-grow_px)))
    return m


def smooth(m, sigma=SMOOTH):
    """Soften the traced edge: the reference's hand-drawn wobble and pixel steps would show as a ragged outline."""
    return nd.gaussian_filter(m.astype(float), sigma) > 0.5


def extend_up(m, by_px, rows_px):
    """Carry the top of a leg up under the shirt, so no gap shows at the hem."""
    ys = np.nonzero(m.any(axis=1))[0]
    top = ys.min()
    band = m.copy()
    band[top + rows_px:] = False
    shifted = np.zeros_like(m)
    shifted[:-by_px] = band[by_px:]
    return m | shifted


def outline(m, n):
    """The mask's outer boundary, in art units: n points evenly spaced, clockwise, starting at the top."""
    c = max(measure.find_contours(m.astype(float), 0.5), key=len)
    pts = np.array([[S * x + TX, S * y + TY] for y, x in c])
    if signed_area(pts) < 0:
        pts = pts[::-1]
    start = int(np.argmin(pts[:, 1]))
    pts = np.roll(pts, -start, axis=0)
    seg = np.r_[0, np.cumsum(np.hypot(*np.diff(np.vstack([pts, pts[:1]]), axis=0).T))]
    t = np.linspace(0, seg[-1], n, endpoint=False)
    closed = np.vstack([pts, pts[:1]])
    return np.c_[np.interp(t, seg, closed[:, 0]), np.interp(t, seg, closed[:, 1])]


def signed_area(p):
    x, y = p[:, 0], p[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)


def to_slim(pts, side, foot=False):
    """Map broad-body points onto the slim legs (same count, same order).

    Each point is placed relative to the thigh and to the shin (along the bone, and across it with the
    width narrowed), and the two placements are blended by how near the point is to each bone, so the
    outline bends smoothly round the knee instead of stepping where one bone takes over from the other.
    """
    hi, lo = LEGS[side], SLIM[side]
    if foot:
        a, a2 = np.array(hi['ankle']), np.array(lo['ankle'])
        return relax(a2 + (pts - a) * FOOT_SCALE)
    segs = [(hi['hip'], hi['knee'], lo['hip'], lo['knee'], WIDTH[0], WIDTH[1], 0),
            (hi['knee'], hi['ankle'], lo['knee'], lo['ankle'], WIDTH[1], WIDTH[2], 1)]
    out = []
    for p in pts:
        placed, weights = [], []
        for a, b, a2, b2, w0, w1, k in segs:
            a, b, a2, b2 = map(np.array, (a, b, a2, b2))
            d = b - a
            L = np.hypot(*d)
            u = d / L
            t = np.dot(p - a, u) / L
            off = u[0] * (p - a)[1] - u[1] * (p - a)[0]
            tc = min(1.0, max(0.0, t))
            dist = np.hypot(*(p - (a + d * tc)))
            d2 = b2 - a2
            u2 = d2 / np.hypot(*d2)
            n2 = np.array([-u2[1], u2[0]])
            w = w0 + (w1 - w0) * tc
            # Behind the hip (the seat) the outline comes in as well as narrowing.
            along = t * SEAT if (t < 0 and k == 0) else t
            placed.append(a2 + d2 * along + n2 * off * w)
            weights.append(np.exp(-((dist / BLEND) ** 2)))
        wt = np.array(weights) + 1e-12
        out.append((placed[0] * wt[0] + placed[1] * wt[1]) / wt.sum())
    return relax(np.array(out))


def relax(p, rounds=2):
    """Light smoothing of a closed outline (each point pulled a little towards its neighbours)."""
    for _ in range(rounds):
        p = 0.5 * p + 0.25 * (np.roll(p, 1, axis=0) + np.roll(p, -1, axis=0))
    return p


def path_d(p, gap=None):
    """Catmull-Rom curve through the points, as cubic Béziers: closed, or left open over
    `gap` = (first, last) point indices, which are not drawn (the edge tucked into the foot)."""
    n = len(p)
    at = lambda i: p[i % n]
    if gap is None:
        start, count = 0, n
    else:
        start, count = gap[1], (gap[0] - gap[1]) % n
    d = [f'M{at(start)[0]:.2f} {at(start)[1]:.2f}']
    for k in range(count):
        i = start + k
        p0, p1, p2, p3 = at(i - 1), at(i), at(i + 1), at(i + 2)
        c1, c2 = p1 + (p2 - p0) / 6, p2 - (p3 - p1) / 6
        d.append(f'C{c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f} {p2[0]:.2f} {p2[1]:.2f}')
    return ' '.join(d) + ('Z' if gap is None else '')


def tucked(pts, mask):
    """The longest run of outline points lying inside `mask` (art units), as (first, last) indices."""
    h, w = mask.shape
    inside = []
    for x, y in pts:
        c, r = int(round((x - TX) / S)), int(round((y - TY) / S))
        inside.append(0 <= r < h and 0 <= c < w and bool(mask[r, c]))
    n = len(pts)
    if not any(inside) or all(inside):
        return None
    best, run = None, None
    for k in range(2 * n):
        i = k % n
        if inside[i]:
            run = (run[0], i) if run else (i, i)
            if best is None or (run[1] - run[0]) % n > (best[1] - best[0]) % n:
                best = run
        else:
            run = None
    return best


def main():
    lab = masks()
    parts = {'low': [], 'high': []}
    for side, leg in LEGS.items():
        trousers = extend_up(region(lab, leg['trousers'], PX / 2), int(60 / S), int(50 / S))
        skin_leg = nd.binary_erosion(trousers, morphology.disk(int(3 / S)))
        foot = smooth(region(lab, [leg['foot']], PX / 2), 16)  # toes simplified, as in the designer's feet
        # The bare leg runs on into the foot (drawn over it), so no line crosses the ankle.
        skin_leg = smooth(skin_leg | (foot & nd.binary_dilation(skin_leg, morphology.disk(int(12 / S)))))
        hidden_in_foot = nd.binary_erosion(foot, morphology.disk(int(2 / S)))
        # Hidden shin: a small shape well inside the lower leg, under the thigh-and-shin shape.
        knee_y = int((leg['knee'][1] - TY) / S)
        shin = nd.binary_erosion(trousers, morphology.disk(int(25 / S)))
        shin[: knee_y + int(30 / S)] = False
        # Seated shorts: the thigh from the hip to just over halfway to the knee.
        hip, knee = np.array(leg['hip']), np.array(leg['knee'])
        yy, xx = np.mgrid[: lab.shape[0], : lab.shape[1]]
        X, Y = S * xx + TX, S * yy + TY
        cut = hip + (knee - hip) * 0.55
        ahead = (X - cut[0]) * (knee - hip)[0] + (Y - cut[1]) * (knee - hip)[1] < 0
        shorts = nd.binary_dilation(trousers & ahead, morphology.disk(int(2 / S)))
        # Drawing order: the foot under the leg, the shorts on top.
        shapes = [
            (f'leg_{side}_lower@sit', shin, 40, SKIN, None),
            (f'leg_{side}_foot@sit', foot, 40, SKIN, None),
            (f'leg_{side}_upper@sit', skin_leg, 80, SKIN, hidden_in_foot),
            (f'pants_leg_{side}_upper@sit', smooth(shorts), 64, CLOTH, None),
        ]
        for name, m, n, fill, tuck in shapes:
            hi = outline(m, n)
            lo = to_slim(hi, side, foot='foot' in name)
            gap = tucked(hi, tuck) if tuck is not None else None
            style = f'fill:{fill};stroke:{INK};stroke-width:{LINE};stroke-linecap:round;stroke-linejoin:round'
            for ex, p in (('high', hi), ('low', lo)):
                parts[ex].append(f'    <path inkscape:label="{name}" style="{style}" d="{path_d(p, gap)}"/>')
    OUT.mkdir(parents=True, exist_ok=True)
    for ex, ps in parts.items():
        groups = '\n'.join(ps)
        (OUT / f'stand-in-sit.{ex}.svg').write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<!-- Generated by scripts/make-quarter-sit.py. Do not edit; delete when the designer draws seated ¾ legs. -->\n'
            '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" '
            'width="1000" height="1000" viewBox="0 0 1000 1000">\n'
            f'  <g inkscape:label="sit">\n{groups}\n  </g>\n</svg>\n')
        print(f'wrote {OUT.relative_to(ROOT)}/stand-in-sit.{ex}.svg')


if __name__ == '__main__':
    main()
