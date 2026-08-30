"""Рисует кадры четвёртой серии Mind & Money и рендерит их в PNG.

    python3 series/ep04/draw_frames.py

Кадры не генерируются моделью, а собираются из примитивов `series/style.py`,
поэтому стиль между планами и между сериями не плывёт и пересобирается
одинаково в любой момент.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import style as s  # noqa: E402

OUT_SVG = Path(__file__).parent / "build" / "frames_svg"
OUT_PNG = Path(__file__).parent / "build" / "frames"
OUT_CLIPS = Path(__file__).parent / "build" / "clips"
DASH = "26 20"



# --- время ---------------------------------------------------------------

def clamp01(x):
    return max(0.0, min(1.0, x))


def stage(t, a, b):
    """Доля прохождения отрезка [a, b] внутри плана."""
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
    """Появление с ростом от центра — иначе объект возникает рывком."""
    return group(body, opacity=clamp01(k * 1.6),
                 transform=f"translate({cx} {cy}) scale({round(k, 4)}) translate({-cx} {-cy})")


def clip(name, x, y, w, h, *body):
    return (f'<clipPath id="{name}"><rect x="{x}" y="{y}" width="{w}" height="{h}"/></clipPath>'
            f'<g clip-path="url(#{name})">' + "".join(body) + "</g>")


def coin_positions(cx, base_y, rows=3, per=3, r=32):
    """Раскладка монет в кучку; нижний ряд первым, чтобы она росла снизу."""
    out = []
    for row in range(rows):
        width = per - (row % 2)
        for i in range(width):
            out.append((cx + (i - (width - 1) / 2) * (r * 1.9), base_y - row * r * 1.15))
    return out


def coins_growing(cx, base_y, t, rows=3, per=3, r=32, a=0.15, b=0.85):
    """Кучка растёт монета за монетой."""
    spots = coin_positions(cx, base_y, rows, per, r)
    out = []
    for i, (x, y) in enumerate(spots):
        k = stage(t, a + (b - a) * i / len(spots), a + (b - a) * (i + 1) / len(spots))
        if k > 0:
            out.append(pop(s.coin(x, y, r), x, y, ease_out(k)))
    return "".join(out)


def coins_falling(cx, base_y, t, rows=3, per=3, r=32, drop=420, a=0.1, b=0.8):
    """Монеты падают в ёмкость по одной."""
    spots = coin_positions(cx, base_y, rows, per, r)
    out = []
    for i, (x, y) in enumerate(spots):
        k = stage(t, a + (b - a) * i / len(spots), a + (b - a) * (i + 1) / len(spots))
        if k <= 0:
            continue
        # ускоряется к земле, как настоящее падение
        out.append(group(s.coin(x, y, r), opacity=clamp01(k * 3),
                         transform=f"translate(0 {round(-drop * (1 - k * k), 1)})"))
    return "".join(out)


def coin_flight(x0, y0, x1, y1, t, n=6, r=30, span=0.55):
    """Монеты летят по дуге от руки к машине и исчезают в ней."""
    out = []
    for i in range(n):
        launch = i * (1 - span) / max(1, n - 1)
        k = stage(t, launch, launch + span)
        if k <= 0 or k >= 1:
            continue
        x = lerp(x0, x1, k)
        y = lerp(y0, y1, k) - 230 * 4 * (k - k * k) * 0.25
        out.append(group(s.coin(x, y, r), opacity=clamp01((1 - k) * 4)))
    return "".join(out)


# --- планы ---------------------------------------------------------------

def frame01(t=1.0):
    """Мимо едет машина, и внутри щёлкает: этот человек богат."""
    ax, ay = s.arm_anchor(400, side="right")
    car_x = lerp(2000, 1180, ease_out(stage(t, 0.0, 0.55)))
    bub = stage(t, 0.5, 0.8)
    bubble = ""
    if bub > 0:
        bubble = pop(s.bubble(760, 250, 210, 150, (470, 470))
                     + coins_growing(760, 300, stage(t, 0.55, 0.95), rows=2, per=3, r=30,
                                     a=0.0, b=1.0),
                     760, 250, ease_out(bub))
    return (s.ground()
            + s.car(car_x, s.GROUND_Y)
            + s.person(400, arms=[f"M {ax} {ay} Q {ax + 140} {ay + 20} {ax + 175} {ay - 80}"])
            + bubble)


def frame02(t=1.0):
    """Но ты увидел не деньги. Ты увидел машину."""
    k = ease_out(stage(t, 0.1, 0.5))
    inner = pop(s.car(620, 320, w=280), 760, 250, k) if k > 0 else ""
    return (s.ground()
            + s.car(1180, s.GROUND_Y)
            + s.person(400, mood="flat")
            + s.bubble(760, 250, 230, 160, (470, 470))
            + inner)


def frame03(t=1.0):
    """Потраченное на машину — то, что ушло. Машина и есть доказательство."""
    ax, ay = s.arm_anchor(360, side="right")
    return (s.ground()
            + s.car(1180, s.GROUND_Y)
            + s.person(360, mood="flat",
                       arms=[f"M {ax} {ay} Q {ax + 130} {ay - 30} {ax + 170} {ay - 90}"])
            + coin_flight(660, 520, 1300, 660, t))


def frame04(t=1.0):
    """Богатство — другое. Несделанная покупка. Пропущенный апгрейд."""
    ax, ay = s.arm_anchor(400, side="right")
    return (s.ground()
            + s.car(1180, s.GROUND_Y, fill="none", dash=DASH)
            + s.person(400, arms=[f"M {ax} {ay} Q {ax + 110} {ay + 60} {ax + 140} {ay + 20}"])
            + coins_growing(700, 830, t, rows=3, per=3))


def frame05(t=1.0):
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
            + coins_falling(jar_x + jar_w / 2, jar_bot - 70, t, rows=3, per=4, r=34)
            + s.person(500, mood="calm"))


def frame06(t=1.0):
    """Поэтому этому так трудно научиться: мы копируем то, что видно."""
    ax1, ay1 = s.arm_anchor(1130, side="right")
    ax2, ay2 = s.arm_anchor(470, side="right")
    raised = f"M {ax1} {ay1} Q {ax1 + 100} {ay1 - 40} {ax1 + 130} {ay1 - 110}"
    # левая фигура подтягивает руку к позе правой — это и есть копирование
    k = ease_in_out(stage(t, 0.25, 0.85))
    end_x = lerp(ax2 + 90, ax2 + 130, k)
    end_y = lerp(ay2 + 70, ay2 - 110, k)
    ctrl_y = lerp(ay2 + 60, ay2 - 40, k)
    copying = f"M {ax2} {ay2} Q {ax2 + 100} {ctrl_y} {end_x} {end_y}"
    return (s.ground()
            + s.car(1450, s.GROUND_Y, w=360)
            + s.person(1130, scale=0.86, arms=[raised])
            + s.person(470, scale=0.86, mood="calm", arms=[copying]))


def frame07(t=1.0):
    """А видно — только траты."""
    frame, notch, (sx, sy, sw, sh) = s.phone(1290, 520, h=560)
    shift = lerp(sh * 0.30, 0, ease_out(stage(t, 0.1, 0.75)))
    feed = group(
        s.car(sx + sw * 0.06, sy + sh * 0.52, w=sw * 0.88)
        + s.bag(sx + sw * 0.30, sy + sh * 0.92, w=sw * 0.30)
        + s.bag(sx + sw * 0.70, sy + sh * 0.92, w=sw * 0.30, fill=s.OCHRE),
        transform=f"translate(0 {round(shift, 1)})")
    screen = clip("scr7", sx, sy, sw, sh, feed)
    ax, ay = s.arm_anchor(470, side="right")
    return (s.ground()
            + s.person(470, arms=[f"M {ax} {ay} Q {ax + 120} {ay - 20} {ax + 150} {ay - 100}"])
            + frame + screen + notch)


def frame08(t=1.0):
    """Тихий счёт, скучный фонд, выбор, который никто не выкладывает."""
    horizon = 780
    box_x, box_w = 980, 620
    box_y, box_h = horizon + 60, 220
    buried = s.shape(
        f"M {box_x} {box_y} L {box_x + box_w} {box_y} "
        f"L {box_x + box_w} {box_y + box_h} L {box_x} {box_y + box_h} Z",
        fill="none", dash=DASH)
    # проявляется медленно: это есть, но этого не видно
    k = ease_in_out(stage(t, 0.2, 0.9))
    return (s.ground(horizon)
            + s.person(560, mood="flat", ground_y=horizon)
            + group(buried + coins_growing(box_x + box_w / 2, box_y + box_h - 40, t,
                                           rows=2, per=4, r=30, a=0.3, b=0.95),
                    opacity=k))


def frame09(t=1.0):
    """И мы равняемся ровно на то, чем богатство не является."""
    mx, my, mw, mh = 1150, 380, 520, 570
    mirror = s.shape(
        f"M {mx + 70} {my} L {mx + mw - 70} {my} "
        f"Q {mx + mw} {my} {mx + mw} {my + 70} L {mx + mw} {my + mh} "
        f"L {mx} {my + mh} L {mx} {my + 70} Q {mx} {my} {mx + 70} {my} Z",
        fill=s.WHITE, sw=s.STROKE * 1.6)
    k = ease_out(stage(t, 0.15, 0.8))
    car_in = group(s.car(mx + 40, my + mh - 90, w=mw - 80),
                   transform=f"translate({round(lerp(-90, 0, k), 1)} 0)",
                   opacity=clamp01(k * 2))
    reflection = clip("scr9", mx, my, mw, mh, car_in)
    ax, ay = s.arm_anchor(560, side="right")
    return (s.ground()
            + mirror + reflection
            + s.person(560, mood="flat",
                       arms=[f"M {ax} {ay} Q {ax + 120} {ay + 10} {ax + 160} {ay - 40}"]))


def frame10(t=1.0):
    """Богатство — это то, чего не видно. В том числе твоё."""
    top = lerp(s.GROUND_Y, 560, ease_out(stage(t, 0.05, 0.75)))
    halo = s.shape(
        f"M 430 {s.GROUND_Y} Q 430 {round(top, 1)} 960 {round(top, 1)} "
        f"Q 1490 {round(top, 1)} 1490 {s.GROUND_Y} Z",
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


DRIFT = 0.025  # еле заметный наезд, чтобы план не выглядел мёртвым


def render_still(name, fn, t=0.8):
    svg_path = OUT_SVG / f"{name}.svg"
    svg_path.write_text(s.svg(fn(t)))
    subprocess.run(["rsvg-convert", "-w", str(s.W), "-h", str(s.H),
                    str(svg_path), "-o", str(OUT_PNG / f"{name}.png")], check=True)


def render_clip(name, fn, duration, fps, zoom_in):
    """Гонит кадры анимации прямо в ffmpeg, не раскладывая тысячу PNG по диску."""
    out = OUT_CLIPS / f"{name}.mp4"
    total = max(1, round(duration * fps))
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-v", "error", "-f", "image2pipe", "-framerate", str(fps), "-i", "-",
         "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
         "-r", str(fps), str(out)],
        stdin=subprocess.PIPE)
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
    return out


def main():
    parser = argparse.ArgumentParser(description="Отрисовка кадров и анимации серии")
    parser.add_argument("--stills-only", action="store_true",
                        help="только раскадровка, без анимации")
    parser.add_argument("--only", type=int, help="собрать один план по номеру")
    args = parser.parse_args()

    manifest = json.loads((Path(__file__).parent / "manifest.json").read_text())
    fps = manifest["fps"]
    durations = {shot["name"]: shot["duration"] for shot in manifest["shots"]}

    for d in (OUT_SVG, OUT_PNG, OUT_CLIPS):
        d.mkdir(parents=True, exist_ok=True)

    for i, (name, fn, _, _) in enumerate(FRAMES, start=1):
        if args.only and args.only != i:
            continue
        render_still(name, fn)
        if args.stills_only:
            print(f"  {i:>2}. {name}")
            continue
        duration = durations.get(name, 4.0)
        render_clip(name, fn, duration, fps, zoom_in=i % 2 == 1)
        print(f"  {i:>2}. {name}  {duration} с")

    print(f"\nРаскадровка: {OUT_PNG}")
    if not args.stills_only:
        print(f"Анимация:    {OUT_CLIPS}")


if __name__ == "__main__":
    main()
