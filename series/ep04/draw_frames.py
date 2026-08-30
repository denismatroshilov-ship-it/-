"""Рисует кадры четвёртой серии Mind & Money и рендерит их в PNG.

    python3 series/ep04/draw_frames.py

Кадры не генерируются моделью, а собираются из примитивов `series/style.py`,
поэтому стиль между планами и между сериями не плывёт и пересобирается
одинаково в любой момент.
"""

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import style as s  # noqa: E402

OUT_SVG = Path(__file__).parent / "build" / "frames_svg"
OUT_PNG = Path(__file__).parent / "build" / "frames"
DASH = "26 20"


def clip(name, x, y, w, h, *body):
    return (f'<clipPath id="{name}"><rect x="{x}" y="{y}" width="{w}" height="{h}"/></clipPath>'
            f'<g clip-path="url(#{name})">' + "".join(body) + "</g>")


def coin_arc(x0, y0, x1, y1, n=5, r=30):
    """Монеты дугой — деньги в движении."""
    out = []
    for i in range(n):
        t = i / (n - 1)
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t - 190 * (t - t * t) * 4 * 0.25
        out.append(s.coin(x, y, r))
    return "".join(out)


def coin_stack(cx, base_y, rows=3, per=3, r=32):
    out = []
    for row in range(rows):
        width = per - (row % 2)
        for i in range(width):
            x = cx + (i - (width - 1) / 2) * (r * 1.9)
            out.append(s.coin(x, base_y - row * r * 1.15, r))
    return "".join(out)


# --- планы ---------------------------------------------------------------

def frame01():
    """Мимо едет машина, и внутри щёлкает: этот человек богат."""
    ax, ay = s.arm_anchor(400, side="right")
    return (s.ground()
            + s.car(1180, s.GROUND_Y)
            + s.person(400, arms=[f"M {ax} {ay} Q {ax + 140} {ay + 20} {ax + 175} {ay - 80}"])
            + s.bubble(760, 250, 210, 150, (470, 470))
            + coin_stack(760, 300, rows=2, per=3, r=30))


def frame02():
    """Но ты увидел не деньги. Ты увидел машину."""
    return (s.ground()
            + s.car(1180, s.GROUND_Y)
            + s.person(400, mood="flat")
            + s.bubble(760, 250, 230, 160, (470, 470))
            + s.car(620, 320, w=280))


def frame03():
    """Потраченное на машину — то, что ушло. Машина и есть доказательство."""
    ax, ay = s.arm_anchor(360, side="right")
    return (s.ground()
            + s.car(1180, s.GROUND_Y)
            + s.person(360, mood="flat",
                       arms=[f"M {ax} {ay} Q {ax + 130} {ay - 30} {ax + 170} {ay - 90}"])
            + coin_arc(660, 520, 1240, 640, n=5))


def frame04():
    """Богатство — другое. Несделанная покупка. Пропущенный апгрейд."""
    ax, ay = s.arm_anchor(400, side="right")
    return (s.ground()
            + s.car(1180, s.GROUND_Y, fill="none", dash=DASH)
            + s.person(400, arms=[f"M {ax} {ay} Q {ax + 110} {ay + 60} {ax + 140} {ay + 20}"])
            + coin_stack(700, 830, rows=3, per=3))


def frame05():
    """Невидимо по определению: доход, который мог уйти, и не ушёл."""
    jar_x, jar_w = 1120, 480
    jar_top, jar_bot = 480, s.GROUND_Y
    jar = s.shape(
        f"M {jar_x} {jar_top + 60} Q {jar_x} {jar_top} {jar_x + 60} {jar_top} "
        f"L {jar_x + jar_w - 60} {jar_top} Q {jar_x + jar_w} {jar_top} {jar_x + jar_w} {jar_top + 60} "
        f"L {jar_x + jar_w} {jar_bot - 60} Q {jar_x + jar_w} {jar_bot} {jar_x + jar_w - 60} {jar_bot} "
        f"L {jar_x + 60} {jar_bot} Q {jar_x} {jar_bot} {jar_x} {jar_bot - 60} Z",
        fill="none", dash=DASH)
    return (s.ground()
            + jar
            + coin_stack(jar_x + jar_w / 2, jar_bot - 70, rows=3, per=4, r=34)
            + s.person(500, mood="calm"))


def frame06():
    """Поэтому этому так трудно научиться: мы копируем то, что видно."""
    ax1, ay1 = s.arm_anchor(1130, side="right")
    ax2, ay2 = s.arm_anchor(470, side="right")
    gesture = "Q {0} {1} {2} {3}"
    return (s.ground()
            + s.car(1450, s.GROUND_Y, w=360)
            + s.person(1130, scale=0.86,
                       arms=[f"M {ax1} {ay1} " + gesture.format(ax1 + 100, ay1 - 40, ax1 + 130, ay1 - 110)])
            + s.person(470, scale=0.86, mood="calm",
                       arms=[f"M {ax2} {ay2} " + gesture.format(ax2 + 100, ay2 - 40, ax2 + 130, ay2 - 110)]))


def frame07():
    """А видно — только траты."""
    frame, notch, (sx, sy, sw, sh) = s.phone(1290, 520, h=560)
    screen = clip("scr7", sx, sy, sw, sh,
                  s.car(sx + sw * 0.06, sy + sh * 0.52, w=sw * 0.88),
                  s.bag(sx + sw * 0.30, sy + sh * 0.92, w=sw * 0.30),
                  s.bag(sx + sw * 0.70, sy + sh * 0.92, w=sw * 0.30, fill=s.OCHRE))
    ax, ay = s.arm_anchor(470, side="right")
    return (s.ground()
            + s.person(470, arms=[f"M {ax} {ay} Q {ax + 120} {ay - 20} {ax + 150} {ay - 100}"])
            + frame + screen + notch)


def frame08():
    """Тихий счёт, скучный фонд, выбор, который никто не выкладывает."""
    horizon = 780
    box_x, box_w = 980, 620
    box_y, box_h = horizon + 60, 220
    buried = s.shape(
        f"M {box_x} {box_y} L {box_x + box_w} {box_y} "
        f"L {box_x + box_w} {box_y + box_h} L {box_x} {box_y + box_h} Z",
        fill="none", dash=DASH)
    return (s.ground(horizon)
            + s.person(560, mood="flat", ground_y=horizon)
            + buried
            + coin_stack(box_x + box_w / 2, box_y + box_h - 40, rows=2, per=4, r=30))


def frame09():
    """И мы равняемся ровно на то, чем богатство не является."""
    mx, my, mw, mh = 1150, 380, 520, 570
    mirror = s.shape(
        f"M {mx + 70} {my} L {mx + mw - 70} {my} "
        f"Q {mx + mw} {my} {mx + mw} {my + 70} L {mx + mw} {my + mh} "
        f"L {mx} {my + mh} L {mx} {my + 70} Q {mx} {my} {mx + 70} {my} Z",
        fill=s.WHITE, sw=s.STROKE * 1.6)
    reflection = clip("scr9", mx, my, mw, mh, s.car(mx + 40, my + mh - 90, w=mw - 80))
    ax, ay = s.arm_anchor(560, side="right")
    return (s.ground()
            + mirror + reflection
            + s.person(560, mood="flat",
                       arms=[f"M {ax} {ay} Q {ax + 120} {ay + 10} {ax + 160} {ay - 40}"]))


def frame10():
    """Богатство — это то, чего не видно. В том числе твоё."""
    halo = s.shape(
        f"M 430 {s.GROUND_Y} Q 430 560 960 560 Q 1490 560 1490 {s.GROUND_Y} Z",
        fill=s.TEAL, dash=DASH)
    return (halo
            + s.ground()
            + s.person(960, mood="calm"))


FRAMES = [
    ("mm_ep04_01_a_car_goes_past", frame01,
     "A car goes past, and something in you says: that person is rich.",
     "Мимо проезжает машина, и что-то внутри говорит: вот этот человек богат."),
    ("mm_ep04_02_you_saw_a_car", frame02,
     "But you didn't see money. You saw a car.",
     "Но ты увидел не деньги. Ты увидел машину."),
    ("mm_ep04_03_money_that_left", frame03,
     "Money spent on a car is money that left. The car is proof of what's gone.",
     "Деньги, потраченные на машину, — это деньги, которые ушли. Машина и есть доказательство того, чего больше нет."),
    ("mm_ep04_04_the_purchase_not_made", frame04,
     "Wealth is the other thing. The purchase not made. The upgrade skipped.",
     "Богатство — это другое. Несделанная покупка. Пропущенный апгрейд."),
    ("mm_ep04_05_invisible_by_definition", frame05,
     "It's invisible by definition — income you could have spent, and didn't.",
     "Оно невидимо по определению: доход, который мог уйти, и не ушёл."),
    ("mm_ep04_06_we_copy_what_we_see", frame06,
     "Which is why it's so hard to learn. We copy what we can see.",
     "Поэтому этому так трудно научиться. Мы копируем то, что видно."),
    ("mm_ep04_07_what_we_see_is_spending", frame07,
     "And what we can see is spending.",
     "А видно — только траты."),
    ("mm_ep04_08_none_of_it_shows", frame08,
     "The quiet account, the boring fund, the choice nobody posts — none of it shows.",
     "Тихий счёт, скучный фонд, выбор, который никто не выкладывает, — ничего из этого не видно."),
    ("mm_ep04_09_the_wrong_model", frame09,
     "So we model ourselves on the one thing wealth isn't.",
     "И мы равняемся ровно на то, чем богатство не является."),
    ("mm_ep04_10_including_your_own", frame10,
     "Wealth is what you don't see. Including your own.",
     "Богатство — это то, чего не видно. В том числе твоё."),
]


def main():
    OUT_SVG.mkdir(parents=True, exist_ok=True)
    OUT_PNG.mkdir(parents=True, exist_ok=True)
    for name, fn, _, _ in FRAMES:
        svg_path = OUT_SVG / f"{name}.svg"
        png_path = OUT_PNG / f"{name}.png"
        svg_path.write_text(s.svg(fn()))
        subprocess.run(["rsvg-convert", "-w", str(s.W), "-h", str(s.H),
                        str(svg_path), "-o", str(png_path)], check=True)
        print(f"  {name}")
    print(f"\n{len(FRAMES)} кадров в {OUT_PNG}")


if __name__ == "__main__":
    main()
