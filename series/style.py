"""Фирменный стиль Mind & Money: палитра и примитивы рисования.

Цвета сняты пипеткой с кадра предыдущей серии, лежащего в воркспейсе
ElevenLabs, — не подобраны на глаз. Всё рисование идёт через эти примитивы,
иначе десять кадров разъедутся по толщине контура и пропорциям.
"""

W, H = 1920, 1080
GROUND_Y = 950

BG = "#FBF7F1"
INK = "#272724"
TEAL = "#51867E"
OCHRE = "#D9A84C"
GREY = "#424242"
WHITE = "#FFFFFF"

STROKE = 9
HEAD_R = 150


def svg(*body):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
        f'viewBox="0 0 {W} {H}">'
        f'<rect width="{W}" height="{H}" fill="{BG}"/>'
        + "".join(body)
        + "</svg>"
    )


def ground(y=GROUND_Y, x0=90, x1=W - 90):
    return (f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" '
            f'stroke="{INK}" stroke-width="{STROKE}" stroke-linecap="round"/>')


def tube(d, width, fill=WHITE, ink=INK):
    """Рука или нога: белая трубка в контуре. Рисуется в два прохода —
    широкий контурный штрих, поверх узкий заливочный."""
    return (
        f'<path d="{d}" fill="none" stroke="{ink}" stroke-width="{width + 2 * STROKE}" '
        f'stroke-linecap="round" stroke-linejoin="round"/>'
        f'<path d="{d}" fill="none" stroke="{fill}" stroke-width="{width}" '
        f'stroke-linecap="round" stroke-linejoin="round"/>'
    )


def shape(d, fill=WHITE, ink=INK, dash=None, sw=STROKE):
    dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
    return (f'<path d="{d}" fill="{fill}" stroke="{ink}" stroke-width="{sw}" '
            f'stroke-linejoin="round" stroke-linecap="round"{dash_attr}/>')


def circle(cx, cy, r, fill=WHITE, ink=INK, sw=STROKE, dash=None):
    dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
    ink_attr = f' stroke="{ink}" stroke-width="{sw}"' if ink else ""
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"{ink_attr}{dash_attr}/>'


def face(cx, hy, r=HEAD_R, mood="calm"):
    """Глаза-точки и маленькая дуга рта — как на референсе."""
    ex, ey = r * 0.30, r * 0.12
    eyes = (circle(cx - ex, hy - ey, r * 0.075, INK, ink=None)
            + circle(cx + ex, hy - ey, r * 0.075, INK, ink=None))
    my = hy + r * 0.30
    mw = r * 0.24
    if mood == "flat":
        mouth = (f'<line x1="{cx - mw}" y1="{my}" x2="{cx + mw}" y2="{my}" '
                 f'stroke="{INK}" stroke-width="{STROKE - 1}" stroke-linecap="round"/>')
    else:
        dip = r * 0.26 if mood == "calm" else r * 0.38
        mouth = (f'<path d="M {cx - mw} {my} Q {cx} {my + dip} {cx + mw} {my}" '
                 f'fill="none" stroke="{INK}" stroke-width="{STROKE - 1}" stroke-linecap="round"/>')
    return eyes + mouth


def person(cx, scale=1.0, ground_y=GROUND_Y, mood="calm", arms=(), flip=False):
    """Фигура в халате до земли — так нарисован персонаж в предыдущей серии.

    arms — список путей от плеча; каждый рисуется трубкой поверх корпуса,
    голова кладётся последней, чтобы контуры рук не резали лицо.
    """
    r = HEAD_R * scale
    hy = ground_y - r * 3.60
    shoulder_y = hy + r * 1.08
    top_hw, bot_hw = r * 0.80, r * 0.72
    corner = r * 0.30

    body = shape(
        f"M {cx - bot_hw} {ground_y} "
        f"L {cx - top_hw} {shoulder_y + corner} "
        f"Q {cx - top_hw} {shoulder_y} {cx - top_hw + corner} {shoulder_y} "
        f"L {cx + top_hw - corner} {shoulder_y} "
        f"Q {cx + top_hw} {shoulder_y} {cx + top_hw} {shoulder_y + corner} "
        f"L {cx + bot_hw} {ground_y} Z"
    )
    limbs = "".join(tube(d, r * 0.26) for d in arms)
    head = circle(cx, hy, r) + face(cx, hy, r, mood)
    return body + limbs + head


def arm_anchor(cx, scale=1.0, ground_y=GROUND_Y, side="right"):
    """Точка плеча, от которой должна начинаться рука."""
    r = HEAD_R * scale
    shoulder_y = ground_y - r * 3.60 + r * 1.38
    dx = r * 0.70
    return (cx + dx if side == "right" else cx - dx), shoulder_y


def coin(cx, cy, r=34, fill=OCHRE):
    return circle(cx, cy, r, fill) + circle(cx, cy, r * 0.52, "none", ink=INK, sw=STROKE - 4)


def car(x, y, w=560, fill=OCHRE, dash=None):
    """Машина сбоку: колёса стоят на линии y."""
    wr = w * 0.115
    body_bot = y - wr * 0.70
    body_h = w * 0.30
    body_top = body_bot - body_h
    cabin_h = body_h * 0.72
    rr = w * 0.10

    body = shape(
        f"M {x + rr} {body_bot} L {x + w - rr} {body_bot} "
        f"Q {x + w} {body_bot} {x + w} {body_bot - rr} "
        f"L {x + w} {body_top + rr} Q {x + w} {body_top} {x + w - rr} {body_top} "
        f"L {x + rr} {body_top} Q {x} {body_top} {x} {body_top + rr} "
        f"L {x} {body_bot - rr} Q {x} {body_bot} {x + rr} {body_bot} Z",
        fill=fill, dash=dash,
    )
    cabin = shape(
        f"M {x + w * 0.26} {body_top} L {x + w * 0.36} {body_top - cabin_h} "
        f"L {x + w * 0.66} {body_top - cabin_h} L {x + w * 0.74} {body_top} Z",
        fill=fill, dash=dash,
    )
    wheels = "".join(
        circle(x + w * f, y - wr, wr, INK, ink=None) + circle(x + w * f, y - wr, wr * 0.38, BG, ink=None)
        for f in (0.24, 0.76)
    )
    return body + cabin + wheels


def bubble(cx, cy, rx, ry, tail_to, dash=None):
    """Облако мысли: овал плюс два уменьшающихся кружка к говорящему."""
    tx, ty = tail_to
    dx, dy = tx - cx, ty - cy
    dots = "".join(
        circle(cx + dx * f, cy + dy * f, r, WHITE, dash=dash)
        for f, r in ((0.62, 26), (0.82, 16))
    )
    return (f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{WHITE}" '
            f'stroke="{INK}" stroke-width="{STROKE}"'
            + (f' stroke-dasharray="{dash}"' if dash else "") + "/>") + dots


def phone(cx, cy, h=430, dark=GREY):
    """Телефон как на референсе: тёмная скруглённая рамка, светлый экран."""
    w = h * 0.50
    x, y = cx - w / 2, cy - h / 2
    rr = w * 0.17
    frame = (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rr}" '
             f'fill="{WHITE}" stroke="{dark}" stroke-width="{STROKE * 2.2}"/>')
    notch = (f'<rect x="{cx - w * 0.13}" y="{y + h * 0.035}" width="{w * 0.26}" '
             f'height="{h * 0.018}" rx="{h * 0.009}" fill="{dark}"/>')
    return frame, notch, (x + w * 0.09, y + h * 0.09, w * 0.82, h * 0.82)


def bag(cx, y, w=110, fill=TEAL):
    """Пакет из магазина."""
    h = w * 1.15
    body = shape(f"M {cx - w / 2} {y - h} L {cx + w / 2} {y - h} "
                 f"L {cx + w / 2 * 0.88} {y} L {cx - w / 2 * 0.88} {y} Z", fill=fill)
    handle = (f'<path d="M {cx - w * 0.22} {y - h} Q {cx} {y - h - w * 0.45} '
              f'{cx + w * 0.22} {y - h}" fill="none" stroke="{INK}" '
              f'stroke-width="{STROKE}" stroke-linecap="round"/>')
    return body + handle


# --- предметы четвёртой серии --------------------------------------------

def envelope(cx, cy, w=240, flap=True, fill=WHITE, dash=None):
    h = w * 0.66
    x, y = cx - w / 2, cy - h / 2
    body = shape(f"M {x} {y} L {x + w} {y} L {x + w} {y + h} L {x} {y + h} Z", fill=fill, dash=dash)
    if flap:  # закрытое письмо — клапан углом вниз
        seal = shape(f"M {x} {y} L {cx} {y + h * 0.58} L {x + w} {y} Z", fill=fill, dash=dash)
    else:     # вскрытое — клапан откинут вверх
        seal = shape(f"M {x} {y} L {cx} {y - h * 0.52} L {x + w} {y} Z", fill=fill, dash=dash)
    return body + seal


def paper(cx, cy, w=230, h=300, rows=4, fill=WHITE, dash=None, marks=True):
    x, y = cx - w / 2, cy - h / 2
    sheet = shape(f"M {x} {y} L {x + w} {y} L {x + w} {y + h} L {x} {y + h} Z", fill=fill, dash=dash)
    if not marks:
        return sheet
    lines = ""
    step = h * 0.58 / max(1, rows)
    for i in range(rows):
        ly = y + h * 0.22 + step * (i + 0.5)
        lw = w * (0.66 if i % 2 else 0.52)
        lines += (f'<line x1="{x + w * 0.16}" y1="{ly}" x2="{x + w * 0.16 + lw}" y2="{ly}" '
                  f'stroke="{INK}" stroke-width="{STROKE - 3}" stroke-linecap="round"/>')
    return sheet + lines


def plate(cx, cy, w=420, h=170, blocks=4, fill=WHITE, dash=None, block_fill=INK, sw=None):
    """Табло с суммой. Цифры даны блоками: в стиле сериала текста в кадре нет."""
    x, y = cx - w / 2, cy - h / 2
    rr = h * 0.22
    box = shape(
        f"M {x + rr} {y} L {x + w - rr} {y} Q {x + w} {y} {x + w} {y + rr} "
        f"L {x + w} {y + h - rr} Q {x + w} {y + h} {x + w - rr} {y + h} "
        f"L {x + rr} {y + h} Q {x} {y + h} {x} {y + h - rr} "
        f"L {x} {y + rr} Q {x} {y} {x + rr} {y} Z",
        fill=fill, dash=dash, sw=sw or STROKE)
    bw = w / (blocks * 2 + 1)
    digits = "".join(
        f'<rect x="{x + bw * (1 + 2 * i)}" y="{cy - h * 0.20}" width="{bw}" '
        f'height="{h * 0.40}" rx="{bw * 0.22}" fill="{block_fill}"/>'
        for i in range(blocks))
    return box + digits


def cloud(cx, cy, rx, ry, fill=WHITE, dash=None, ink=INK):
    """Облако тревоги — тот же язык, что у облака мысли, но крупнее и рыхлее."""
    lobes = ((-0.55, 0.10, 0.52), (-0.18, -0.30, 0.62), (0.25, -0.22, 0.58), (0.58, 0.14, 0.46))
    body = "".join(
        f'<ellipse cx="{cx + rx * dx}" cy="{cy + ry * dy}" rx="{rx * r}" ry="{ry * r * 1.25}" '
        f'fill="{fill}" stroke="{ink}" stroke-width="{STROKE}"'
        + (f' stroke-dasharray="{dash}"' if dash else "") + "/>"
        for dx, dy, r in lobes)
    return body


def clock(cx, cy, r=95, hour=0.0, minute=0.0):
    import math
    face = circle(cx, cy, r)
    hands = ""
    for angle, length, width in ((hour * 30 - 90, r * 0.52, STROKE + 2),
                                 (minute * 6 - 90, r * 0.78, STROKE - 1)):
        a = math.radians(angle)
        hands += (f'<line x1="{cx}" y1="{cy}" x2="{cx + length * math.cos(a):.1f}" '
                  f'y2="{cy + length * math.sin(a):.1f}" stroke="{INK}" '
                  f'stroke-width="{width}" stroke-linecap="round"/>')
    return face + hands


def calendar(cx, cy, w=520, cols=5, rows=3, marks=(), mark_fill=OCHRE):
    h = w * 0.62
    x, y = cx - w / 2, cy - h / 2
    head = h * 0.20
    frame = shape(f"M {x} {y} L {x + w} {y} L {x + w} {y + h} L {x} {y + h} Z")
    bar = (f'<line x1="{x}" y1="{y + head}" x2="{x + w}" y2="{y + head}" '
           f'stroke="{INK}" stroke-width="{STROKE}"/>')
    cw, ch = w / cols, (h - head) / rows
    cells = ""
    for r in range(rows):
        for c in range(cols):
            i = r * cols + c
            ccx, ccy = x + cw * (c + 0.5), y + head + ch * (r + 0.5)
            fill = mark_fill if i in marks else "none"
            cells += circle(ccx, ccy, min(cw, ch) * 0.26, fill,
                            ink=INK if i in marks else "#B9B4A8", sw=STROKE - 4)
    return frame + bar + cells


def arrow(x0, y0, x1, y1, bend=0.0, color=INK, width=None):
    import math
    width = width or STROKE
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    dx, dy = x1 - x0, y1 - y0
    cx, cy = mx - dy * bend, my + dx * bend
    a = math.atan2(y1 - cy, x1 - cx)
    head = width * 3.4
    tip = (f'<path d="M {x1} {y1} L {x1 - head * math.cos(a - 0.42):.1f} '
           f'{y1 - head * math.sin(a - 0.42):.1f} M {x1} {y1} '
           f'L {x1 - head * math.cos(a + 0.42):.1f} {y1 - head * math.sin(a + 0.42):.1f}" '
           f'fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>')
    return (f'<path d="M {x0} {y0} Q {cx:.1f} {cy:.1f} {x1} {y1}" fill="none" '
            f'stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>' + tip)


def door(cx, ground_y, w=320, h=560, fill=WHITE, dash=None):
    x, y = cx - w / 2, ground_y - h
    rr = w * 0.30
    panel = shape(
        f"M {x} {ground_y} L {x} {y + rr} Q {x} {y} {x + rr} {y} "
        f"L {x + w - rr} {y} Q {x + w} {y} {x + w} {y + rr} "
        f"L {x + w} {ground_y} Z", fill=fill, dash=dash)
    knob = circle(x + w * 0.82, ground_y - h * 0.44, w * 0.055, INK, ink=None)
    return panel + knob


def eye(cx, cy, w=170, open_k=1.0):
    """Открытый или прикрытый глаз — «смотреть» и «не смотреть» в одном знаке."""
    h = w * 0.52 * max(0.04, open_k)
    lid = (f'<path d="M {cx - w / 2} {cy} Q {cx} {cy - h} {cx + w / 2} {cy} '
           f'Q {cx} {cy + h} {cx - w / 2} {cy} Z" fill="{WHITE}" stroke="{INK}" '
           f'stroke-width="{STROKE}" stroke-linejoin="round"/>')
    pupil = circle(cx, cy, w * 0.13, INK, ink=None) if open_k > 0.35 else ""
    return lid + pupil


def pile(cx, ground_y, n=4, w=260, step=None):
    """Стопка нераспечатанного — растёт вверх со сдвигом, как настоящая.

    Нижний конверт ложится на линию земли целиком: смещение считается от его
    половины высоты, иначе стопка проваливается под пол.
    """
    h = w * 0.66
    step = step or h * 0.42
    return "".join(
        envelope(cx + (i % 2 - 0.5) * step * 0.7, ground_y - h / 2 - step * i, w)
        for i in range(n))
