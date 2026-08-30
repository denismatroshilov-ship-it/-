"""Рисует планы четвёртой серии Mind & Money и рендерит анимацию.

    python3 series/ep04/draw_frames.py               # раскадровка + анимация
    python3 series/ep04/draw_frames.py --stills-only # только раскадровка

Каждый план — функция времени, а не картинка: смысл серии держится на том,
что происходит в кадре, а не на наезде по статике. Сквозные знаки: табло —
реальное число, пунктирное табло — воображаемое, пунктирное облако — страх,
конверт и лист — выписки, глаз — «смотреть».
"""

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import style as s  # noqa: E402
import vo  # noqa: E402

OUT_SVG = Path(__file__).parent / "build" / "frames_svg"
OUT_PNG = Path(__file__).parent / "build" / "frames"
OUT_CLIPS = Path(__file__).parent / "build" / "clips"
DASH = "26 20"
DRIFT = 0.022


# --- время ---------------------------------------------------------------

def clamp01(x):
    return max(0.0, min(1.0, x))


def stage(t, a, b):
    return clamp01((t - a) / (b - a)) if b > a else 0.0


def ease_out(t):
    return 1 - (1 - t) ** 3


def ease_in_out(t):
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def group(body, opacity=None, transform=None):
    attrs = ""
    if opacity is not None:
        attrs += f' opacity="{round(opacity, 3)}"'
    if transform:
        attrs += f' transform="{transform}"'
    return f"<g{attrs}>{body}</g>"


def pop(body, cx, cy, k):
    return group(body, opacity=clamp01(k * 1.6),
                 transform=f"translate({cx} {cy}) scale({round(k, 4)}) translate({-cx} {-cy})")


def shift(body, dx=0, dy=0, opacity=None):
    return group(body, opacity=opacity, transform=f"translate({round(dx, 1)} {round(dy, 1)})")


def clip(name, x, y, w, h, *body):
    return (f'<clipPath id="{name}"><rect x="{x}" y="{y}" width="{w}" height="{h}"/></clipPath>'
            f'<g clip-path="url(#{name})">' + "".join(body) + "</g>")


def over(cx, dx=340, y=300):
    """Точка для знака над персонажем. Макушка на y=260, поэтому знак уводится
    вбок — поставленный прямо над головой, он читается как шляпа."""
    return cx + dx, y


def arm(cx, scale=1.0, dx=140, dy=-70, ground_y=None):
    ax, ay = s.arm_anchor(cx, scale, ground_y or s.GROUND_Y, "right")
    return f"M {ax} {ay} Q {ax + dx * 0.7} {ay + dy * 0.2} {ax + dx} {ay + dy}"


def cup(cx, base_y, w=90):
    """Обычная вещь, к которой цепляется привычка."""
    h = w * 1.05
    body = s.shape(f"M {cx - w / 2} {base_y - h} L {cx + w / 2} {base_y - h} "
                   f"L {cx + w * 0.40} {base_y} L {cx - w * 0.40} {base_y} Z", fill=s.OCHRE)
    handle = (f'<path d="M {cx + w * 0.48} {base_y - h * 0.74} Q {cx + w * 0.95} '
              f'{base_y - h * 0.52} {cx + w * 0.44} {base_y - h * 0.30}" fill="none" '
              f'stroke="{s.INK}" stroke-width="{s.STROKE}" stroke-linecap="round"/>')
    return body + handle


def chart(x, y, w, h, k=1.0, down=True):
    """Ломаная вниз — рынок или счёт, на который не хочется смотреть."""
    pts = [(0, .18), (.18, .05), (.34, .34), (.5, .22), (.68, .58), (.84, .48), (1, .86)]
    if not down:
        pts = [(px, 1 - py) for px, py in pts]
    n = max(2, int(round(len(pts) * k)))
    d = " ".join(("M" if i == 0 else "L") + f" {x + w * px:.1f} {y + h * py:.1f}"
                 for i, (px, py) in enumerate(pts[:n]))
    axes = (f'<path d="M {x} {y} L {x} {y + h} L {x + w} {y + h}" fill="none" '
            f'stroke="{s.INK}" stroke-width="{s.STROKE - 3}" stroke-linecap="round"/>')
    return axes + (f'<path d="{d}" fill="none" stroke="{s.TEAL}" stroke-width="{s.STROKE + 1}" '
                   f'stroke-linecap="round" stroke-linejoin="round"/>' if n >= 2 else "")


def box(cx, cy, w, h, dash=None, fill="none"):
    x, y = cx - w / 2, cy - h / 2
    rr = min(w, h) * 0.14
    return s.shape(f"M {x + rr} {y} L {x + w - rr} {y} Q {x + w} {y} {x + w} {y + rr} "
                   f"L {x + w} {y + h - rr} Q {x + w} {y + h} {x + w - rr} {y + h} "
                   f"L {x + rr} {y + h} Q {x} {y + h} {x} {y + h - rr} "
                   f"L {x} {y + rr} Q {x} {y} {x + rr} {y} Z", fill=fill, dash=dash)


# --- планы ---------------------------------------------------------------

def s01(t=1.0):
    """Сообщение приходит, палец смахивает раньше, чем ты дочитал."""
    frame, notch, (sx, sy, sw, sh) = s.phone(1300, 520, h=580)
    drop = lerp(-sh * 0.30, sh * 0.06, ease_out(stage(t, 0.12, 0.42)))
    away = lerp(0, sw * 1.6, ease_in_out(stage(t, 0.62, 0.88)))
    banner = shift(box(sx + sw / 2, sy + sh * 0.12, sw * 0.86, sh * 0.20, fill=s.WHITE)
                   + f'<rect x="{sx + sw * 0.16}" y="{sy + sh * 0.09}" width="{sw * 0.44}" '
                     f'height="{s.STROKE}" rx="{s.STROKE / 2}" fill="{s.INK}"/>'
                     f'<rect x="{sx + sw * 0.16}" y="{sy + sh * 0.145}" width="{sw * 0.60}" '
                     f'height="{s.STROKE}" rx="{s.STROKE / 2}" fill="#B9B4A8"/>',
                   dx=away, dy=drop, opacity=clamp01(1 - stage(t, 0.72, 0.9)))
    return (s.ground() + s.person(470, arms=[arm(470, dx=150, dy=-100)])
            + frame + clip("s01", sx, sy, sw, sh, banner) + notch)


def s02(t=1.0):
    """Деньги те же. Изменилось только то, сколько ты о них знаешь."""
    k = ease_in_out(stage(t, 0.3, 0.8))
    return (s.ground() + s.plate(1330, 600)
            + s.person(500, mood="flat")
            + s.eye(*over(500), w=210, open_k=lerp(1.0, 0.06, k)))


def s03(t=1.0):
    """«Посмотрю позже» перестаёт быть планом и становится привычкой."""
    marks = tuple(i for i in range(15) if i / 15 < stage(t, 0.1, 0.9))
    n = 1 + int(stage(t, 0.2, 0.95) * 4)
    return (s.ground() + s.calendar(880, 560, w=620, marks=marks)
            + s.pile(1560, s.GROUND_Y, n=n, w=230))


def s04(t=1.0):
    """Это не лень. Ум ставит это между тобой и числом, чтобы защитить."""
    k = ease_out(stage(t, 0.25, 0.85))
    return (s.ground() + s.plate(1340, 620)
            + shift(s.cloud(1340, 620, 300, 190, dash=DASH), dx=lerp(-420, 0, k),
                    opacity=clamp01(k * 1.5))
            + s.person(470, mood="flat", arms=[arm(470, dx=130, dy=10)]))


def s05(t=1.0):
    """Эффект страуса: чем хуже ожидания, тем реже мы заглядываем."""
    k = stage(t, 0.15, 0.85)
    return (s.ground() + chart(1080, 380, 640, 440, k=k)
            + s.person(490, mood="flat")
            + s.eye(*over(490), w=200, open_k=lerp(1.0, 0.05, ease_in_out(stage(t, 0.45, 0.9)))))


def s06(t=1.0):
    """Выписка лежит лицом вниз, телефон — экраном в стол."""
    k = ease_in_out(stage(t, 0.2, 0.6))
    # лист переворачивается: строки уходят, остаётся пустая изнанка
    sheet = (group(s.paper(1180, 640, w=400, h=500), opacity=1 - k)
             + group(s.paper(1180, 640, w=400, h=500, marks=False), opacity=k))
    phone = group(box(1640, 700, 240, 430, fill=s.WHITE), opacity=1 - k) + \
        group(box(1640, 700, 240, 430, fill=s.GREY), opacity=k)
    return (s.ground() + sheet + phone + s.person(470, mood="flat"))


def s07(t=1.0):
    """Смотреть не меняет число — смотреть только добавляет чувство."""
    k = ease_out(stage(t, 0.2, 0.85))
    return (s.ground() + s.plate(1350, 760)
            + s.person(470, mood="flat")
            + s.arrow(1180, 720, 760, 400, bend=0.18)
            + pop(s.cloud(*over(470, dx=390, y=250), 250, 150, dash=DASH), 860, 250, k))


def s08(t=1.0):
    """Не знать ощущается почти как не терять."""
    k = ease_in_out(stage(t, 0.15, 0.8))
    return (s.ground() + s.plate(1330, 620)
            + shift(s.cloud(1430, 620, 300, 190), dx=lerp(620, 0, k))
            + s.person(470, mood="calm"))


def s09(t=1.0):
    """Избегают не всякой информации, а той, что скажет что-то о тебе."""
    reach = ease_in_out(stage(t, 0.25, 0.55))
    recoil = ease_out(stage(t, 0.62, 0.9))
    plain = s.envelope(1080, 640, w=280)
    personal = s.envelope(1560, 640, w=280) + s.circle(1560, 640, 52) + s.face(1560, 640, 52, "flat")
    hand_x = lerp(lerp(820, 1420, reach), 880, recoil)
    ay_hand = 520
    return (s.ground() + plain + personal
            + s.person(430, mood="flat")
            + s.tube(f"M {s.arm_anchor(430)[0]} {s.arm_anchor(430)[1]} "
                     f"Q {(s.arm_anchor(430)[0] + hand_x) / 2} {ay_hand - 70} {hand_x} {ay_hand}", 50))


def s10(t=1.0):
    """Число двигается независимо от того, смотрит ли кто-нибудь."""
    jitter = "".join(
        f'<rect x="{1140 + i * 96}" y="{600 - 34 - 18 * math.sin(t * 6.5 + i)}" width="66" '
        f'height="{68 + 36 * abs(math.sin(t * 6.5 + i))}" rx="14" fill="{s.INK}"/>'
        for i in range(4))
    return (s.ground() + s.plate(1330, 600, blocks=0) + jitter
            + s.person(470, mood="flat") + s.eye(*over(470), w=200, open_k=0.05))


def s11(t=1.0):
    """Облегчение мгновенно, и в момент выбора кажется бесплатным."""
    k = ease_out(stage(t, 0.2, 0.75))
    return (s.ground()
            + shift(s.envelope(1180, 640, w=300), dx=lerp(0, 520, k), opacity=clamp01(1 - k * 0.7))
            + s.person(520, mood="calm", arms=[arm(520, dx=150, dy=30)])
            + pop(s.cloud(*over(520, dx=360, y=250), 190, 110, fill=s.TEAL), 880, 250,
                  ease_out(stage(t, 0.45, 0.9))))


def s12(t=1.0):
    """Цена приходит позже и по кускам, слишком мелким для решения."""
    coins = ""
    for i in range(6):
        p = stage(t, i * 0.12, i * 0.12 + 0.5)
        if p <= 0:
            continue
        coins += group(s.coin(1060 + i * 92, lerp(660, 1010, p * p), 30),
                       opacity=clamp01((1 - p) * 3))
    return s.ground() + s.plate(1290, 520) + coins + s.person(470, mood="flat")


def s13(t=1.0):
    """Дата платежа проходит в обычный вторник."""
    p = stage(t, 0.35, 0.85)
    coin = group(s.coin(1120, 640 + 420 * p * p, 34), opacity=clamp01((1 - p) * 3)) if p > 0 else ""
    return (s.ground() + s.calendar(1180, 560, w=600, marks=(7,))
            + coin + s.person(470, mood="flat"))


def s14(t=1.0):
    """Деньги были на месте. Информацию просто никто не забрал."""
    return (s.ground()
            + s.paper(1380, s.GROUND_Y - 200, w=340, h=400, rows=3)
            + s.person(400, mood="flat")
            + group(s.arrow(640, s.GROUND_Y - 260, 1180, s.GROUND_Y - 250, bend=-0.10),
                    opacity=clamp01(stage(t, 0.3, 0.8)) * 0.35))


def s15(t=1.0):
    """К тому моменту куски приходят вместе, одной выпиской."""
    k = ease_in_out(stage(t, 0.15, 0.7))
    coins = "".join(
        group(s.coin(lerp(1040 + i * 110, 1320, k), lerp(420 + (i % 2) * 260, 620, k), 30),
              opacity=clamp01(1 - k * 1.4))
        for i in range(6))
    return (s.ground() + coins
            + pop(s.paper(1320, 620, w=380, h=420, rows=5), 1320, 620, ease_out(stage(t, 0.5, 0.95)))
            + s.person(430, mood="flat"))


def s16(t=1.0):
    """Перестав смотреть, ты не перестаёшь носить число в голове."""
    bob = 14 * math.sin(t * 3.4)
    return (s.ground() + s.person(700, mood="flat")
            + shift(s.plate(1330, 330, w=420, h=170, dash=DASH), dy=bob)
            + s.tube(f"M {s.arm_anchor(700)[0]} {s.arm_anchor(700)[1]} "
                     f"Q 1000 {380 + bob} 1110 {350 + bob}", 46))


def s17(t=1.0):
    """Настоящее число заменяется оценкой, и оценка почти всегда хуже."""
    k = ease_out(stage(t, 0.25, 0.9))
    return (s.ground() + s.plate(720, 620, w=300, h=130, blocks=3)
            + group(s.plate(1420, 620, w=lerp(320, 700, k), h=lerp(140, 300, k),
                            blocks=5, dash=DASH))
            + s.person(300, scale=0.8, mood="flat"))


def s18(t=1.0):
    """Тревога — плохой бухгалтер: округляет не туда и считает дважды."""
    rows = 2 + int(stage(t, 0.15, 0.9) * 5)
    return (s.ground() + s.paper(1300, 580, w=420, h=520, rows=rows)
            + s.person(470, mood="flat", arms=[arm(470, dx=150, dy=-40)]))


def s19(t=1.0):
    """Баланс — факт, но приходит он как табель с твоей фамилией."""
    k = ease_in_out(stage(t, 0.25, 0.75))
    return (s.ground()
            + group(s.plate(1330, 600), opacity=1 - k)
            + group(s.paper(1330, 600, w=380, h=460, rows=4)
                    + s.coin(1330, 760, 60, fill=s.OCHRE), opacity=k)
            + s.person(470, mood="flat"))


def s20(t=1.0):
    """Чем длиннее пауза, тем дальше оценка уезжает от настоящего числа."""
    k = ease_in_out(stage(t, 0.1, 0.9))
    ax, bx = lerp(900, 700, k), lerp(1100, 1660, k)
    return (s.ground() + s.plate(ax, 560, w=280, h=125, blocks=3)
            + s.plate(bx, 560, w=280, h=125, blocks=3, dash=DASH)
            + s.arrow(ax + 160, 780, bx - 160, 780, bend=0.0)
            + s.person(330, scale=0.78, mood="flat"))


def s21(t=1.0):
    """И тем больше следующий взгляд похож на то, к чему надо готовиться."""
    k = ease_out(stage(t, 0.2, 0.85))
    return (s.ground() + s.door(1420, s.GROUND_Y, w=lerp(340, 520, k), h=lerp(580, 860, k))
            + s.person(560, scale=0.72, mood="flat"))


def s22(t=1.0):
    """Петля: избегание бережёт чувство, чувство растёт, взгляд дорожает."""
    cx, cy, r = 1150, 540, 270

    def at(deg, dist=r):
        a = math.radians(deg)
        return cx + dist * math.cos(a), cy + dist * math.sin(a)

    ring = (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{s.INK}" '
            f'stroke-width="{s.STROKE}" stroke-dasharray="{DASH}"/>')
    heads = "".join(s.arrow(*at(d), *at(d + 7)) for d in (-30, 90, 210))
    ex, ey = at(-90)
    clx, cly = at(30)
    kx, ky = at(150)
    # узлы садятся на кольцо, поэтому под каждым — заглушка фоном
    nodes = (s.circle(ex, ey, 100, s.BG, ink=None) + s.eye(ex, ey, w=185, open_k=0.30)
             + s.circle(clx, cly, 120, s.BG, ink=None) + s.cloud(clx, cly, 105, 62, dash=DASH)
             + s.circle(kx, ky, 78, s.BG, ink=None) + s.coin(kx, ky, 56))
    # маркер бежит по кольцу: движение и есть петля
    mx, my = at(-90 + t * 360)
    return (s.ground() + ring + heads + nodes + s.circle(mx, my, 26, s.TEAL)
            + s.person(400, scale=0.74, mood="flat"))


def s23(t=1.0):
    """Денежная тревога может занимать внимание, нужное другим решениям."""
    k = ease_in_out(stage(t, 0.2, 0.85))
    w = lerp(0, 560, k)
    bars = (f'<rect x="0" y="0" width="{w}" height="{s.H}" fill="{s.INK}" opacity="0.9"/>'
            f'<rect x="{s.W - w}" y="0" width="{w}" height="{s.H}" fill="{s.INK}" opacity="0.9"/>')
    return s.ground() + s.person(960, mood="flat") + bars


def s24(t=1.0):
    """Это описание, а не диагноз, и держать его стоит легко."""
    float_y = 18 * math.sin(t * 2.6)
    return (s.ground() + s.person(620, arms=[arm(620, dx=170, dy=-120)])
            + shift(s.bubble(1180, 330, 240, 165, (900, 560))
                    + s.circle(1180, 330, 60, s.TEAL), dy=float_y))


def s25(t=1.0):
    """Выход не в дисциплине, а в том, чтобы смотреть стало дешевле."""
    k = ease_in_out(stage(t, 0.2, 0.85))
    return (s.ground() + s.door(1400, s.GROUND_Y, w=lerp(520, 200, k), h=lerp(860, 260, k))
            + s.person(560, mood="calm"))


def s26(t=1.0):
    """Посмотреть — не то же самое, что починить."""
    gap = ease_out(stage(t, 0.25, 0.85))
    return (s.ground()
            + shift(box(1120, 560, 380, 300) + s.eye(1120, 560, w=200), dx=lerp(0, -170, gap))
            + shift(box(1560, 560, 380, 300) + s.arrow(1450, 610, 1660, 500, bend=0.2),
                    dx=lerp(0, 170, gap))
            + s.person(430, scale=0.82, mood="flat"))


def s27(t=1.0):
    """Открыть приложение — как заранее согласиться всё это решить."""
    n = 1 + int(ease_out(stage(t, 0.15, 0.9)) * 5)
    return (s.ground() + s.door(1180, s.GROUND_Y, w=420, h=740)
            + s.pile(1560, s.GROUND_Y, n=n, w=250)
            + s.person(470, mood="flat"))


def s28(t=1.0):
    """Дай «посмотреть» отдельную задачу: без решений и без ремонта."""
    k = ease_out(stage(t, 0.25, 0.8))
    return (s.ground() + s.person(560, mood="calm")
            + pop(box(1340, 560, 460, 330) + s.eye(1340, 560, w=240), 1340, 560, k))


def s29(t=1.0):
    """Сделай первый раз маленьким: один счёт, две минуты."""
    return (s.ground() + s.plate(1180, 560, w=300, h=130, blocks=3)
            + s.clock(1620, 560, r=110, hour=12, minute=t * 24)
            + s.person(470, mood="calm"))


def s30(t=1.0):
    """Смотреть постоянно — тоже тревога: число видят весь день и не верят."""
    clocks = "".join(
        pop(s.clock(1080 + (i % 3) * 300, 380 + (i // 3) * 320, r=95, hour=i * 2, minute=i * 9),
            1080 + (i % 3) * 300, 380 + (i // 3) * 320,
            ease_out(stage(t, i * 0.11, i * 0.11 + 0.3)))
        for i in range(6))
    return s.ground() + clocks + s.person(430, mood="flat", arms=[arm(430, dx=140, dy=-90)])


def s31(t=1.0):
    """Поставь это туда, где оно переживёт плохую неделю."""
    marks = tuple(i for i in (2, 7, 12) if (i / 14) < stage(t, 0.2, 0.9))
    return (s.ground() + s.calendar(1120, 540, w=600, marks=marks)
            + cup(1600, s.GROUND_Y, w=130)
            + s.person(470, mood="calm"))


def s32(t=1.0):
    """Запиши, что увидел: на бумаге число снова становится информацией."""
    k = ease_in_out(stage(t, 0.2, 0.8))
    rows = int(1 + k * 3)
    return (s.ground()
            + group(s.plate(1160, 380, w=300, h=130, blocks=3), opacity=1 - k * 0.85)
            + s.arrow(1160, 470, 1380, 600, bend=0.12)
            + s.paper(1520, 700, w=320, h=380, rows=rows)
            + s.person(470, mood="calm", arms=[arm(470, dx=160, dy=-30)]))


def s33(t=1.0):
    """Что-то потребует действий — это отдельная встреча и отдельное чувство."""
    k = stage(t, 0.35, 0.85)
    look = s.calendar(1120, 540, w=600, marks=(2,))
    fix = pop(s.circle(1120 - 300 + 600 / 5 * 3.5, 540 + 60, 40, s.TEAL), 1200, 600, ease_out(k))
    return s.ground() + look + fix + s.person(470, mood="calm")


def s34(t=1.0):
    """Через несколько недель разрыв перестаёт быть страшным."""
    k = ease_in_out(stage(t, 0.15, 0.9))
    ax, bx = lerp(700, 900, k), lerp(1660, 1180, k)
    return (s.ground() + s.plate(ax, 560, w=280, h=125, blocks=3)
            + s.plate(bx, 560, w=lerp(280, 300, k), h=125, blocks=3, dash=DASH)
            + s.person(330, scale=0.78, mood="calm"))


def s35(t=1.0):
    """Ты нёс оценку, собранную тревогой, а не арифметикой."""
    lean = 7 * math.sin(t * 2.2)
    ax, ay = s.arm_anchor(620)
    return (s.ground() + s.person(620, mood="flat")
            + shift(s.plate(1230, 270, w=520, h=230, blocks=5, dash=DASH), dy=lean)
            + s.tube(f"M {ax} {ay} Q 880 {400 + lean} 990 {330 + lean}", 48)
            + s.plate(1600, 860, w=250, h=110, blocks=3))


def s36(t=1.0):
    """Ты избегал не баланса, а расстояния между знанием и страхом."""
    k = ease_out(stage(t, 0.25, 0.85))
    bar = group(s.arrow(880, 800, 1440, 800, bend=0.0)
                + s.arrow(1440, 800, 880, 800, bend=0.0), opacity=k)
    return (s.ground() + s.plate(760, 560, w=260, h=120, blocks=3)
            + s.plate(1560, 560, w=280, h=130, blocks=3, dash=DASH)
            + bar + s.person(330, scale=0.76, mood="flat"))


def s37(t=1.0):
    """Посмотри один раз, коротко, нарочно."""
    k = ease_in_out(stage(t, 0.2, 0.8))
    return (s.ground()
            + group(s.cloud(1360, 420, lerp(320, 150, k), lerp(200, 95, k), dash=DASH),
                    opacity=lerp(1.0, 0.45, k))
            + s.plate(1360, 700, w=340, h=150)
            + s.person(560, mood="calm", arms=[arm(560, dx=170, dy=-60)])
            + s.eye(*over(560), w=210, open_k=lerp(0.06, 1.0, k)))


SCENES = [s01, s02, s03, s04, s05, s06, s07, s08, s09, s10, s11, s12, s13,
          s14, s15, s16, s17, s18, s19, s20, s21, s22, s23, s24, s25, s26,
          s27, s28, s29, s30, s31, s32, s33, s34, s35, s36, s37]

FRAMES = [(f"mm_ep04_{i + 1:02d}_{slug}", fn, line)
          for i, (slug, fn, line) in enumerate(zip(vo.SLUGS, SCENES, vo.LINES))]

assert len(SCENES) == len(vo.LINES), (len(SCENES), len(vo.LINES))


def render_still(name, fn, t=0.55):
    path = OUT_SVG / f"{name}.svg"
    path.write_text(s.svg(fn(t)))
    subprocess.run(["rsvg-convert", "-w", str(s.W), "-h", str(s.H),
                    str(path), "-o", str(OUT_PNG / f"{name}.png")], check=True)


def render_clip(name, fn, duration, fps, zoom_in):
    """Гонит кадры анимации прямо в ffmpeg, не раскладывая тысячи PNG по диску."""
    total = max(1, round(duration * fps))
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-v", "error", "-f", "image2pipe", "-framerate", str(fps), "-i", "-",
         "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
         "-r", str(fps), str(OUT_CLIPS / f"{name}.mp4")], stdin=subprocess.PIPE)
    for i in range(total):
        t = i / max(1, total - 1)
        k = 1 + DRIFT * (t if zoom_in else 1 - t)
        scene = (f'<g transform="translate({s.W / 2} {s.H / 2}) scale({k:.5f}) '
                 f'translate({-s.W / 2} {-s.H / 2})">{fn(t)}</g>')
        png = subprocess.run(["rsvg-convert", "-w", str(s.W), "-h", str(s.H)],
                             input=s.svg(scene).encode(), capture_output=True, check=True).stdout
        proc.stdin.write(png)
    proc.stdin.close()
    if proc.wait() != 0:
        raise SystemExit(f"ffmpeg не собрал план {name}")


def main():
    parser = argparse.ArgumentParser(description="Отрисовка планов серии")
    parser.add_argument("--stills-only", action="store_true")
    parser.add_argument("--only", type=int)
    args = parser.parse_args()

    manifest = json.loads((Path(__file__).parent / "manifest.json").read_text())
    fps = manifest["fps"]
    durations = {shot["name"]: shot["duration"] for shot in manifest["shots"]}

    for d in (OUT_SVG, OUT_PNG, OUT_CLIPS):
        d.mkdir(parents=True, exist_ok=True)

    for i, (name, fn, _) in enumerate(FRAMES, start=1):
        if args.only and args.only != i:
            continue
        render_still(name, fn)
        if not args.stills_only:
            render_clip(name, fn, durations.get(name, 10.0), fps, zoom_in=i % 2 == 1)
        print(f"  {i:>2}. {name}")


if __name__ == "__main__":
    main()
