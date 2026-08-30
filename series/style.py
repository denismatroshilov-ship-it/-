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
