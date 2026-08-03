#!/usr/bin/env python3
"""Build River Valley Town Square logo assets as clean vector SVG.

Icon: two overlapping rounded people (navy + sage/gold) plus a terracotta
speech bubble with gold activity dots. Wordmark: Libre Baskerville.
Location line ("River Valley") is a swappable template field.
"""
import base64
import os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

NAVY = "#2C3E50"
TERRA = "#C4775A"
SAGE = "#7D9B76"
GOLD = "#D4A853"
CREAM = "#FAF8F5"
SURFACE = "#FFFDFB"

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, "_fonts", "LibreBaskerville-var.ttf")
MARK = os.path.join(HERE, "mark.png")  # approved AI mark, transparent (raster)


# icon geometry, shared by color + mono builders (120x120 local box).
# Matches the approved AI mark: navy figure front-left, sage figure back-right,
# gold panel far-right, translucent terracotta speech bubble in front.
_GOLD_BODY = '<rect x="72" y="52" width="28" height="40" rx="14"{a}/>'
_SAGE_BODY = '<rect x="52" y="45" width="40" height="45" rx="19"{a}/>'
_SAGE_HEAD = '<circle cx="72" cy="30" r="15"{a}/>'
_NAVY_BODY = '<rect x="21" y="53" width="39" height="41" rx="17"{a}/>'
_NAVY_HEAD = '<circle cx="40" cy="39" r="13"{a}/>'
_BUBBLE = '<rect x="43" y="55" width="44" height="33" rx="14"{a}/>'
_TAIL = '<path d="M53 84 q-3 10 -11 15 q11 0 18 -11 z"{a}/>'

BUBBLE_OP = 0.82  # terracotta alpha -> soft blends over the figures


def icon_group(tx=0, ty=0, s=1.0, mono=None):
    """Icon centered in a 120x120 box.
    mono=None -> full color (translucent bubble). mono=(fg,bg) -> knockout tile."""
    open_ = f'<g transform="translate({tx},{ty}) scale({s})">'
    if mono is None:
        bub = f' fill="{TERRA}" fill-opacity="{BUBBLE_OP}"'
        body = (
            _GOLD_BODY.format(a=f' fill="{GOLD}"')
            + _SAGE_BODY.format(a=f' fill="{SAGE}"')
            + _SAGE_HEAD.format(a=f' fill="{SAGE}"')
            + _NAVY_BODY.format(a=f' fill="{NAVY}"')
            + _NAVY_HEAD.format(a=f' fill="{NAVY}"')
            + _BUBBLE.format(a=bub)
            + _TAIL.format(a=bub))
        return f"{open_}\n{body}\n</g>"
    fg, bg = mono
    GAP = 3.2
    halo = f' fill="{bg}" stroke="{bg}" stroke-width="{2*GAP}" stroke-linejoin="round"'
    f = f' fill="{fg}"'
    body = (
        # back silhouette: gold panel + sage figure (one fg mass)
        _GOLD_BODY.format(a=f) + _SAGE_BODY.format(a=f) + _SAGE_HEAD.format(a=f)
        # front navy figure: bg halo carves a separating gap, then fg fill
        + _NAVY_BODY.format(a=halo) + _NAVY_HEAD.format(a=halo)
        + _NAVY_BODY.format(a=f) + _NAVY_HEAD.format(a=f)
        # bubble: bg halo then fg fill
        + _BUBBLE.format(a=halo) + _TAIL.format(a=halo)
        + _BUBBLE.format(a=f) + _TAIL.format(a=f))
    return f"{open_}\n{body}\n</g>"


def svg_doc(body, vbw=120, vbh=120, px=None, bg=None, style=""):
    px = px or vbw
    pxh = round(px * vbh / vbw)
    rect = f'<rect width="100%" height="100%" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{px}" height="{pxh}" '
            f'viewBox="0 0 {vbw} {vbh}">\n{style}{rect}\n{body}\n</svg>\n')


from fontTools.pens.svgPathPen import SVGPathPen

_FONT_CACHE = {}


def _font(wght):
    key = round(wght)
    if key not in _FONT_CACHE:
        f = TTFont(FONT)
        instantiateVariableFont(f, {"wght": key}, inplace=True)
        _FONT_CACHE[key] = (f, f["head"].unitsPerEm, f.getBestCmap(),
                            f["hmtx"], f.getGlyphSet())
    return _FONT_CACHE[key]


def measure(text, size, wght=400, tracking=0.0):
    """Approx rendered width (px) of text at size/weight with letter-spacing."""
    _, upm, cmap, hmtx, _ = _font(wght)
    total = 0.0
    for ch in text:
        gn = cmap.get(ord(ch))
        adv = hmtx[gn][0] if gn else upm * 0.5
        total += adv * size / upm
    if len(text) > 1:
        total += tracking * (len(text) - 1)
    return total


def text_paths(text, size, wght, x, y, fill, tracking=0.0, opacity=None):
    """Render text as outlined SVG <path>s (no font dependency)."""
    f, upm, cmap, hmtx, gs = _font(wght)
    sc = size / upm
    track_units = tracking / sc if sc else 0
    pen_u = 0.0  # pen position in font units
    paths = []
    for ch in text:
        gn = cmap.get(ord(ch))
        if gn:
            pen = SVGPathPen(gs)
            gs[gn].draw(pen)
            d = pen.getCommands()
            if d:
                paths.append(f'<path transform="translate({pen_u:.1f},0)" d="{d}"/>')
            pen_u += hmtx[gn][0] + track_units
        else:
            pen_u += upm * 0.5 + track_units
    op = f' fill-opacity="{opacity}"' if opacity is not None else ""
    # glyph coords are y-up; flip with negative y scale
    return (f'<g transform="translate({x:.1f},{y:.1f}) scale({sc:.5f},{-sc:.5f})" '
            f'fill="{fill}"{op}>{"".join(paths)}</g>')


def font_style():
    with open(FONT, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return (f'<style>\n@font-face{{font-family:"LB";'
            f'src:url(data:font/ttf;base64,{b64}) format("truetype");'
            f'font-weight:400 700;font-style:normal;}}\n</style>\n')


def _mark_data():
    from PIL import Image
    with open(MARK, "rb") as fh:
        b64 = base64.b64encode(fh.read()).decode()
    w, h = Image.open(MARK).size
    return w, h, b64


def icon_image(x, y, h):
    """Embed the approved raster mark as an <image>, scaled to height h.
    Returns (svg, width)."""
    mw, mh, b64 = _mark_data()
    w = h * mw / mh
    svg = (f'<image x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" '
           f'preserveAspectRatio="xMidYMid meet" '
           f'href="data:image/png;base64,{b64}"/>')
    return svg, w


def lockup(location="River Valley", brand="Town Square", outline=False, ink=NAVY):
    """Master horizontal lockup: approved raster mark + serif wordmark.
    Returns (style, body, vbw, vbh). Canvas auto-sized to the text.
    outline=True -> wordmark as paths (no font). ink overrides text color."""
    WORD_SIZE, WORD_W = 60, 600
    EYE_SIZE, EYE_TRACK = 19, 6.5
    PAD_R, GAP = 36, 14
    vbh = 150

    icon, mw = icon_image(2, (vbh - 116) / 2, 116)
    text_x = 2 + mw + GAP

    eyebrow = location.upper()
    eye_w = measure(eyebrow, EYE_SIZE, 400, EYE_TRACK)
    word_w = measure(brand, WORD_SIZE, WORD_W)
    vbw = round(text_x + max(eye_w, word_w) + PAD_R)

    word_y = vbh * 0.69
    eye_y = word_y - WORD_SIZE * 0.86

    if outline:
        txt = (text_paths(eyebrow, EYE_SIZE, 400, text_x, eye_y, ink,
                          EYE_TRACK, opacity=0.82)
               + text_paths(brand, WORD_SIZE, WORD_W, text_x, word_y, ink))
        return "", icon + txt, vbw, vbh

    style = font_style()
    txt = f'''<g font-family="LB">
    <text x="{text_x:.1f}" y="{eye_y:.1f}" font-size="{EYE_SIZE}" font-weight="400"
          letter-spacing="{EYE_TRACK}" fill="{ink}" fill-opacity="0.82"
          data-field="location">{eyebrow}</text>
    <text x="{text_x:.1f}" y="{word_y:.1f}" font-size="{WORD_SIZE}" font-weight="{WORD_W}"
          fill="{ink}">{brand}</text>
  </g>'''
    return style, icon + txt, vbw, vbh


def write(name, content):
    path = os.path.join(HERE, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    print("wrote", name)


def slugify(s):
    return "".join(c.lower() if c.isalnum() else "-" for c in s).strip("-")


def main_custom(location):
    """Emit a lockup for an arbitrary location (editable-text + outlined)."""
    slug = slugify(location)
    st, body, vbw, vbh = lockup(location=location)
    write(f"logo-lockup-{slug}.svg",
          svg_doc(body, vbw=vbw, vbh=vbh, px=vbw * 2, style=st))
    _, ob, ovw, ovh = lockup(location=location, outline=True)
    write(f"logo-lockup-{slug}-outlined.svg",
          svg_doc(ob, vbw=ovw, vbh=ovh, px=ovw * 2))
    print(f'lockup for "{location}" written ({vbw}x{vbh})')


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 2 and sys.argv[1] == "--location":
        main_custom(sys.argv[2])
        sys.exit(0)

    # lockup — embedded approved mark + wordmark (editable-text + outlined)
    st, body, vbw, vbh = lockup()
    write("logo-lockup.svg", svg_doc(body, vbw=vbw, vbh=vbh, px=vbw * 2, style=st))
    write("_preview/_p-lockup.svg",
          svg_doc(body, vbw=vbw, vbh=vbh, px=vbw, bg=CREAM, style=st))

    _, obody, ovw, ovh = lockup(outline=True)
    write("logo-lockup-outlined.svg",
          svg_doc(obody, vbw=ovw, vbh=ovh, px=ovw * 2))

    # swap demo: prove the location line is swappable per town
    _, sbody, svw, svh = lockup(location="Ozark Highlands", outline=True)
    write("_preview/_p-swap.svg", svg_doc(sbody, vbw=svw, vbh=svh, px=svw, bg=CREAM))
    print("lockup canvas", vbw, "x", vbh, "| swap demo", svw, "x", svh)
