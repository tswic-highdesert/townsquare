#!/usr/bin/env python3
"""Build the Town Square coalition diagrams as SVG.

Five diagrams, one shared style. Run:  python3 build.py
Outputs <name>.svg next to this script.

Brand tokens match design/hifi-v2 (the app palette, tuned off the base brand).
"""

from pathlib import Path
from html import escape

OUT = Path(__file__).parent

# ---------------------------------------------------------------- brand
NAVY = "#26405B"
TERRA = "#C4714E"
SAGE = "#7D9B76"
GOLD = "#D4A853"
CREAM = "#EDE9E0"
INK = "#1D1B16"
PAPER = "#FAF8F5"
MUTED = "#6E6A61"
LINE = "#CFC7B8"

SERIF = "Newsreader, 'Libre Baskerville', Georgia, serif"
SANS = "'DM Sans', -apple-system, 'Helvetica Neue', Arial, sans-serif"
# Label face. This was DM Mono; the typewriter look was rejected. Labels now
# carry their weight through case, tracking, size and colour, not a mono face.
MONO = SANS

W, H = 1600, 900


# ---------------------------------------------------------------- helpers
def esc(t):
    return escape(str(t), quote=False)


def text(x, y, s, size=22, fill=INK, family=SANS, weight=400, anchor="start",
         spacing=None, style=""):
    extra = f' letter-spacing="{spacing}"' if spacing else ""
    if style:
        extra += f' font-style="{style}"'
    return (f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" '
            f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}"{extra}>'
            f'{esc(s)}</text>')


def wrap(x, y, lines, size=20, fill=INK, family=SANS, weight=400,
         anchor="start", lh=1.45):
    out = []
    for i, ln in enumerate(lines):
        out.append(text(x, y + i * size * lh, ln, size, fill, family, weight,
                        anchor))
    return "\n".join(out)


def rect(x, y, w, h, fill="none", stroke="none", rx=14, sw=2, dash=None,
         opacity=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    o = f' opacity="{opacity}"' if opacity is not None else ""
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}{o}/>')


def circle(cx, cy, r, fill="none", stroke="none", sw=2, opacity=None):
    o = f' opacity="{opacity}"' if opacity is not None else ""
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="{sw}"{o}/>')


def path(d, fill="none", stroke=INK, sw=2, dash=None, marker=True, cap="round"):
    ds = f' stroke-dasharray="{dash}"' if dash else ""
    m = ' marker-end="url(#arrow)"' if marker else ""
    return (f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" '
            f'stroke-linecap="{cap}" stroke-linejoin="round"{ds}{m}/>')


def title(s, sub=None):
    out = [text(80, 96, s, 46, NAVY, SERIF, 600)]
    if sub:
        out.append(text(80, 138, sub, 21, MUTED, SANS, 400))
    return "\n".join(out)


def svg(body, w=W, h=H):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" font-kerning="normal">
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7"
          markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 1 L 9 5 L 0 9 z" fill="{INK}"/>
  </marker>
  <marker id="arrow-sage" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7"
          markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 1 L 9 5 L 0 9 z" fill="{SAGE}"/>
  </marker>
  <marker id="arrow-terra" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7"
          markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 1 L 9 5 L 0 9 z" fill="{TERRA}"/>
  </marker>
  <marker id="arrow-muted" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7"
          markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 1 L 9 5 L 0 9 z" fill="{MUTED}"/>
  </marker>
  <marker id="arrow-gold" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7"
          markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 1 L 9 5 L 0 9 z" fill="{GOLD}"/>
  </marker>
  <marker id="arrow-navy" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7"
          markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 1 L 9 5 L 0 9 z" fill="{NAVY}"/>
  </marker>
</defs>
<rect width="{w}" height="{h}" fill="{PAPER}"/>
{body}
</svg>
'''


def write(name, body, w=W, h=H):
    p = OUT / f"{name}.svg"
    p.write_text(svg(body, w, h))
    print(f"  {p.name}")


# ================================================================ 1. layers
def d1_three_layers():
    b = [title("Three layers, and each asks more of the town",
               "Useful before anyone participates. Useful and busy before anyone builds.")]

    rows = [
        (GOLD, "3", "Let anyone build on it",
         ["Anyone with an idea can build something and plug it in. Tamale",
          "rankings, plain-English council summaries, a marketplace, a",
          "tracker for whatever is bearing down on this town next."],
         "each one leaves something behind"),
        (SAGE, "2", "Let the town add what only people can add",
         ["Residents add what no scraper will ever find. What is actually",
          "going on, what is worth going to, what a place is really like."],
         "no ads, so nothing is hidden"),
        (TERRA, "1", "Bring in what already exists",
         ["Business listings, news, event calendars, notices, podcasts.",
          "Already out there, already worth having, gathered in one place."],
         "nobody changes what they do"),
    ]

    y = 200
    for color, num, name, lines, tag in rows:
        h = 185
        b.append(rect(80, y, 1330, h, PAPER, LINE, rx=18, sw=2))
        b.append(rect(80, y, 12, h, color, rx=0))
        b.append(f'<rect x="80" y="{y}" width="12" height="{h}" fill="{color}"/>')
        # numeral
        b.append(circle(150, y + 52, 26, color))
        b.append(text(150, y + 61, num, 26, PAPER, SANS, 700, "middle"))
        b.append(text(196, y + 62, name, 32, NAVY, SERIF, 600))
        b.append(wrap(196, y + 104, lines, 20, INK, SANS))
        # right tag
        b.append(text(1380, y + 62, tag, 17, color, MONO, 500, "end"))
        y += h + 22

    b.append(text(80, 862, "Discovery is not one of the layers. Finding what you "
                           "did not know to look for is what all three are for.",
                  22, NAVY, SERIF, 500, style="italic"))
    return "\n".join(b)


# ================================================================ 2. before/after
def d2_flow():
    b = [title("Where information goes today, and where it could go",
               "Same organizations. Same residents. Different plumbing.")]

    mid = 800
    b.append(f'<line x1="{mid}" y1="185" x2="{mid}" y2="820" stroke="{LINE}" '
             f'stroke-width="2" stroke-dasharray="6 8"/>')

    b.append(text(80, 208, "TODAY", 18, TERRA, MONO, 600, spacing="3"))
    b.append(text(848, 208, "WITH TOWN SQUARE", 18, SAGE, MONO, 600, spacing="3"))

    # ---- LEFT: fragmented
    orgs = ["Nonprofit", "City", "Business", "School", "Church"]
    oy = 268
    for i, o in enumerate(orgs):
        y = oy + i * 84
        b.append(rect(96, y, 150, 54, PAPER, TERRA, rx=10, sw=2))
        b.append(text(171, y + 34, o, 19, NAVY, SANS, 500, "middle"))
        # each broadcasts to its own tiny pocket
        b.append(path(f"M 252 {y+27} L 372 {y+27}", stroke=TERRA, sw=1.6,
                      marker=False))
        b.append(f'<path d="M 252 {y+27} L 372 {y+27}" fill="none" '
                 f'stroke="{TERRA}" stroke-width="1.6" marker-end="url(#arrow-terra)"/>')
        b.append(circle(410, y + 27, 22, "none", TERRA, 2))
        b.append(text(410, y + 33, str(3 + i % 3), 15, TERRA, MONO, 500, "middle"))

    b.append(rect(470, 250, 236, 436, PAPER, LINE, rx=16, sw=2, dash="7 7"))
    b.append(text(588, 286, "Residents", 20, MUTED, SANS, 600, "middle"))
    # dots: mostly unreached
    import math
    reached = {2, 7, 11, 18, 23, 27, 31}
    for i in range(40):
        r, c = divmod(i, 5)
        cx = 508 + c * 42
        cy = 320 + r * 44
        if i in reached:
            b.append(circle(cx, cy, 9, TERRA))
        else:
            b.append(circle(cx, cy, 9, "none", LINE, 2))
    b.append(text(588, 712, "most are reached by none of it", 17, MUTED, SANS,
                  400, "middle", style="italic"))

    # ---- RIGHT: one shared place
    for i, o in enumerate(orgs):
        y = oy + i * 84
        b.append(rect(866, y, 150, 54, PAPER, SAGE, rx=10, sw=2))
        b.append(text(941, y + 34, o, 19, NAVY, SANS, 500, "middle"))
        b.append(f'<path d="M 1022 {y+27} C 1070 {y+27}, 1080 476, 1120 476" '
                 f'fill="none" stroke="{SAGE}" stroke-width="1.6" opacity="0.75" '
                 f'marker-end="url(#arrow-sage)"/>')

    b.append(rect(1128, 396, 168, 160, NAVY, "none", rx=18))
    b.append(text(1212, 462, "Town", 25, PAPER, SERIF, 600, "middle"))
    b.append(text(1212, 492, "Square", 25, PAPER, SERIF, 600, "middle"))
    b.append(text(1212, 526, "one shared place", 15, GOLD, MONO, 500, "middle"))

    b.append(rect(1300, 250, 236, 436, PAPER, LINE, rx=16, sw=2, dash="7 7"))
    b.append(text(1418, 286, "Residents", 20, MUTED, SANS, 600, "middle"))
    for i in range(40):
        r, c = divmod(i, 5)
        cx = 1338 + c * 42
        cy = 320 + r * 44
        b.append(circle(cx, cy, 9, SAGE))
    b.append(f'<path d="M 1274 476 L 1292 476" fill="none" stroke="{SAGE}" '
             f'stroke-width="2" marker-end="url(#arrow-sage)"/>')
    b.append(text(1418, 712, "everyone can find all of it", 17, SAGE, SANS,
                  400, "middle", style="italic"))

    b.append(text(80, 800, "Every organization pays to rebuild", 20, MUTED, SANS))
    b.append(text(80, 832, "its own audience, over and over.", 20, MUTED, SANS))
    b.append(text(848, 800, "Organizations publish once, into shared "
                            "infrastructure.", 20, NAVY, SANS))
    b.append(text(848, 832, "Residents discover across all of it.", 20, NAVY, SANS))
    return "\n".join(b)


# ================================================================ 3. compounding
def d3_compounding():
    b = [title("Why it compounds",
               "Each creation leaves structured data behind, so the next builder "
               "starts further along.")]

    import math
    cx, cy, r, nr = 640, 512, 232, 100

    nodes = [
        (-90, GOLD, "A resident builds", "a creation"),
        (0, TERRA, "It publishes typed", "records back"),
        (90, SAGE, "Those records become", "the next builder's input"),
        (180, NAVY, "More is discoverable,", "so more people build"),
    ]

    b.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{LINE}" '
             f'stroke-width="2.5" stroke-dasharray="4 10"/>')

    # gap, in degrees, needed to clear a node circle plus breathing room
    gap = math.degrees(2 * math.asin(min(1.0, (nr + 16) / (2 * r))))
    mk = {TERRA: "arrow-terra", SAGE: "arrow-sage", NAVY: "arrow-navy",
          GOLD: "arrow-gold"}

    def pt(deg):
        a = math.radians(deg)
        return cx + r * math.cos(a), cy + r * math.sin(a)

    for i, (deg, col, _, _) in enumerate(nodes):
        nxt = nodes[(i + 1) % len(nodes)][0]
        # walk clockwise from this node to the next
        span = (nxt - deg) % 360
        x1, y1 = pt(deg + gap)
        x2, y2 = pt(deg + span - gap)
        b.append(f'<path d="M {x1:.1f} {y1:.1f} A {r} {r} 0 0 1 {x2:.1f} '
                 f'{y2:.1f}" fill="none" stroke="{col}" stroke-width="3" '
                 f'marker-end="url(#{mk[col]})"/>')

    for deg, col, l1, l2 in nodes:
        nx, ny = pt(deg)
        b.append(circle(nx, ny, nr, PAPER, col, 3))
        b.append(circle(nx, ny, nr - 12, col, "none", opacity=0.10))
        b.append(text(nx, ny - 2, l1, 17, NAVY, SANS, 600, "middle"))
        b.append(text(nx, ny + 21, l2, 17, NAVY, SANS, 600, "middle"))

    b.append(text(cx, cy - 10, "the loop", 24, MUTED, SERIF, 500, "middle",
                  style="italic"))
    b.append(text(cx, cy + 22, "runs on its own", 24, MUTED, SERIF, 500,
                  "middle", style="italic"))

    # right column contrast
    b.append(rect(1050, 232, 470, 246, PAPER, LINE, rx=18, sw=2))
    b.append(text(1082, 278, "A normal community app", 24, TERRA, SERIF, 600))
    b.append(wrap(1082, 320, [
        "Gets more valuable the more people read it.",
        "Needs one organization to feed it forever.",
        "Dies when that organization gets tired.",
    ], 19, MUTED, SANS))
    b.append(text(1082, 442, "linear, and fragile", 18, TERRA, MONO, 500))

    b.append(rect(1050, 508, 470, 268, NAVY, "none", rx=18))
    b.append(text(1082, 556, "Town Square", 24, GOLD, SERIF, 600))
    b.append(wrap(1082, 598, [
        "Gets more valuable the more people build.",
        "Ten builders make it useful.",
        "Fifty make it hard to replace.",
    ], 19, CREAM, SANS))
    b.append(text(1082, 722, "compounding, and durable", 18, GOLD, MONO, 500))
    return "\n".join(b)


# ================================================================ 4. org chart
def d4_org():
    b = [title("Who does what",
               "A coalition map, not a company chart. Remove any lane and the "
               "platform still stands.")]

    # committee
    b.append(rect(560, 190, 480, 96, NAVY, "none", rx=16))
    b.append(text(800, 228, "Town Square Committee", 26, PAPER, SERIF, 600,
                  "middle"))
    b.append(text(800, 258, "governance, moderation, the revert button",
                  17, GOLD, SANS, 400, "middle"))
    b.append(text(800, 278, "Tal at launch, designed for three to five",
                  15, CREAM, MONO, 400, "middle"))

    b.append(f'<path d="M 800 286 L 800 336" fill="none" stroke="{NAVY}" '
             f'stroke-width="2.5" marker-end="url(#arrow)"/>')

    # core
    b.append(rect(560, 340, 480, 92, PAPER, NAVY, rx=16, sw=3))
    b.append(text(800, 376, "Core platform", 24, NAVY, SERIF, 600, "middle"))
    b.append(text(800, 404, "the platform, SDK, review queue  ·  Tal + AI",
                  18, MUTED, SANS, 400, "middle"))

    # spine
    b.append(f'<line x1="800" y1="432" x2="800" y2="500" stroke="{LINE}" '
             f'stroke-width="2.5"/>')
    b.append(f'<line x1="215" y1="500" x2="1385" y2="500" stroke="{LINE}" '
             f'stroke-width="2.5"/>')

    lanes = [
        (215, GOLD, "ATU capstone teams",
         ["Build creations on the", "platform, Sept to April.", "Ship through review."]),
        (605, SAGE, "ATU sociology",
         ["Dr. Mikles-Schluterman.", "Adoption research and", "resident needs."]),
        (995, TERRA, "Founding orgs",
         ["Content, distribution,", "and the first residents", "who actually show up."]),
        (1385, NAVY, "Resident builders",
         ["Anyone in town, via the", "builder tooling. Open", "by default."]),
    ]
    for x, col, name, lines in lanes:
        b.append(f'<line x1="{x}" y1="500" x2="{x}" y2="548" stroke="{col}" '
                 f'stroke-width="2.5"/>')
        b.append(rect(x - 175, 548, 350, 170, PAPER, col, rx=16, sw=2.5))
        b.append(f'<rect x="{x-175}" y="548" width="350" height="7" fill="{col}" '
                 f'rx="3"/>')
        b.append(text(x, 596, name, 22, NAVY, SERIF, 600, "middle"))
        b.append(wrap(x, 628, lines, 17, MUTED, SANS, anchor="middle"))

    b.append(text(800, 762, "contributor lanes run parallel to core, never beneath it",
                  18, MUTED, MONO, 400, "middle"))

    # connectors footer
    b.append(rect(430, 794, 740, 62, CREAM, LINE, rx=14, sw=2))
    b.append(text(800, 822, "Connectors", 18, TERRA, SANS, 700, "middle"))
    b.append(text(800, 844, "Debra Fithen and the ATU Center for Community "
                            "Engagement & Academic Outreach",
                  16, MUTED, SANS, 400, "middle"))
    return "\n".join(b)


# ================================================================ 5. pipeline
def d5_pipeline():
    b = [title("How a student team ships without ever blocking the platform",
               "The academic deadline and the platform's gate are the same event.")]

    # core lane (top), untouched
    b.append(rect(80, 208, 1440, 118, CREAM, LINE, rx=16, sw=2))
    b.append(text(112, 246, "CORE PLATFORM", 16, MUTED, MONO, 600, spacing="2.5"))
    b.append(text(112, 288, "Ships on its own schedule. Never waits on a student "
                            "team, because creations are sandboxed.",
                  20, NAVY, SANS))
    b.append(f'<path d="M 1180 268 L 1470 268" fill="none" stroke="{MUTED}" '
             f'stroke-width="2" stroke-dasharray="5 7" '
             f'marker-end="url(#arrow-muted)"/>')

    b.append(text(80, 382, "STUDENT TEAM", 16, GOLD, MONO, 600, spacing="2.5"))

    steps = [
        (GOLD, "Brief", ["Sept", "Scope agreed", "with faculty"]),
        (GOLD, "Build", ["Fall", "Against a frozen", "SDK, own AI tools"]),
        (TERRA, "Prototype", ["Dec", "Partner reviews", "proof of concept"]),
        (TERRA, "Develop", ["Spring", "Testing and", "refinement"]),
        (SAGE, "Review queue", ["April", "One exact version,", "permissions diffed"]),
        (NAVY, "Live", ["April", "Public showcase.", "Real residents."]),
    ]
    x = 80
    bw, gap = 218, 26
    for i, (col, name, lines) in enumerate(steps):
        b.append(rect(x, 412, bw, 178, PAPER, col, rx=16, sw=2.5))
        b.append(f'<rect x="{x}" y="412" width="{bw}" height="7" fill="{col}" rx="3"/>')
        b.append(text(x + bw / 2, 458, name, 22, NAVY, SERIF, 600, "middle"))
        b.append(text(x + bw / 2, 486, lines[0], 15, col, MONO, 600, "middle"))
        b.append(wrap(x + bw / 2, 522, lines[1:], 16, MUTED, SANS,
                      anchor="middle"))
        if i < len(steps) - 1:
            ax = x + bw + 4
            b.append(f'<path d="M {ax} 501 L {ax + gap - 8} 501" fill="none" '
                     f'stroke="{LINE}" stroke-width="2.5" '
                     f'marker-end="url(#arrow-muted)"/>')
        x += bw + gap

    # the gate callout
    gx = 80 + 4 * (bw + gap)
    b.append(f'<path d="M {gx + bw/2} 590 L {gx + bw/2} 646" fill="none" '
             f'stroke="{SAGE}" stroke-width="2.5" marker-end="url(#arrow-sage)"/>')
    b.append(rect(866, 650, 654, 132, PAPER, SAGE, rx=16, sw=2.5))
    b.append(text(898, 690, "The gate is the grade", 22, SAGE, SERIF, 600))
    b.append(wrap(898, 722, [
        "Did the team deliver? Did their exact version pass review.",
        "Binary, dated, and the same artifact faculty grade.",
    ], 18, MUTED, SANS))

    b.append(rect(80, 650, 750, 132, CREAM, LINE, rx=16, sw=2))
    b.append(text(112, 690, "If a team stalls", 22, TERRA, SERIF, 600))
    b.append(wrap(112, 722, [
        "Nothing happens to the platform. A creation that never ships",
        "is a creation that never shipped. That is an architectural property.",
    ], 18, MUTED, SANS))

    b.append(text(80, 838, "Students and faculty own nothing after April. Every "
                           "project here runs on infrastructure that is already "
                           "maintained, so nothing is orphaned.",
                  19, NAVY, SANS, 400, style="italic"))
    return "\n".join(b)


# ---------------------------------------------------------------- main
if __name__ == "__main__":
    print("Building coalition diagrams:")
    write("1-three-layers", d1_three_layers())
    write("2-information-flow", d2_flow())
    write("3-compounding-loop", d3_compounding())
    write("4-org-chart", d4_org())
    write("5-student-pipeline", d5_pipeline())
    print("done")
