"""Собирает серию в готовый mp4 из того, что реально сделано.

    python3 series/assemble.py series/ep04/manifest.json

Источник для каждого плана выбирается по убыванию качества: готовый клип
плана, затем кадр (с медленным наездом), затем слейт с номером. Длительность
плана берётся из его озвучки, если она сгенерирована, иначе из манифеста.
Пока озвучки нет, реплики вжигаются субтитрами — без них немой ролик
нечитаем.
"""

import argparse
import json
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path

FRAME_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp")
CLIP_SUFFIXES = (".mp4", ".mov", ".webm")
AUDIO_SUFFIXES = (".mp3", ".wav", ".m4a", ".aac", ".flac")
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def run(cmd):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.exit(f"ffmpeg упал на {' '.join(cmd[:6])}...\n{proc.stderr[-2000:]}")


def probe_duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True,
    ).stdout.strip()
    return float(out) if out else 0.0


def find(directory, stem, suffixes):
    for suffix in suffixes:
        candidate = directory / f"{stem}{suffix}"
        if candidate.exists():
            return candidate
    return None


def encode_common(spec):
    """Одинаковые параметры у всех кусков — иначе concat склеит их со сбоями."""
    return ["-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-pix_fmt", "yuv420p", "-r", str(spec["fps"]), "-an"]


def caption_chain(text, work, spec, index):
    """Отодвигает кадр вверх и подписывает реплику в освободившейся полосе.

    Текст идёт через файл, а не через параметр: в репликах есть апострофы и
    двоеточия, которые drawtext иначе понимает как свой синтаксис.
    """
    if not text:
        return ""
    # полоса под текст считается от самой длинной реплики серии, а не на глаз:
    # при переносе по 80 символов реплики укладываются в три строки
    inner_h = int(spec["height"] * 0.82)
    inner_w = int(inner_h * spec["width"] / spec["height"])
    pad_x = (spec["width"] - inner_w) // 2
    path = work / f"cap{index:02d}.txt"
    path.write_text("\n".join(textwrap.wrap(text, width=80)))
    size = int(spec["height"] * 0.030)
    return (
        f",scale={inner_w}:{inner_h},"
        f"pad={spec['width']}:{spec['height']}:{pad_x}:0:color={spec['bg']},"
        f"drawtext=fontfile={FONT}:textfile='{path.resolve()}':"
        f"fontcolor={spec['ink']}:fontsize={size}:line_spacing={int(size * 0.35)}:"
        f"x=(w-text_w)/2:y={inner_h}+((h-{inner_h})-text_h)/2"
    )


def segment_from_clip(clip, out, spec, caption=""):
    run(["ffmpeg", "-y", "-i", str(clip),
         "-vf", (f"scale={spec['width']}:{spec['height']}:force_original_aspect_ratio=decrease,"
                 f"pad={spec['width']}:{spec['height']}:-1:-1:color={spec['bg']},setsar=1" + caption),
         *encode_common(spec), str(out)])


def segment_from_frame(frame, out, spec, duration, zoom_in=True, caption=""):
    """Кадр: медленный наезд, чтобы статика не читалась как стоп-кадр.

    Зум считается от номера выходного кадра, а не накоплением от предыдущего:
    рекурсивная форма `min(zoom+шаг,предел)` при d=1 не накапливается и даёт
    неподвижную картинку. Направление чередуется по планам, иначе десять
    одинаковых наездов подряд читаются как приём, а не как монтаж.
    """
    frames = max(1, round(duration * spec["fps"]))
    span = max(1, frames - 1)
    progress = f"on/{span}" if zoom_in else f"(1-on/{span})"
    run(["ffmpeg", "-y", "-loop", "1", "-framerate", str(spec["fps"]),
         "-t", f"{duration}", "-i", str(frame),
         "-vf", (  # увеличиваем до наезда — иначе zoompan дрожит на пиксельной сетке
             f"scale={spec['width'] * 2}:{spec['height'] * 2}:force_original_aspect_ratio=increase,"
             f"crop={spec['width'] * 2}:{spec['height'] * 2},"
             f"zoompan=z='1+0.06*{progress}':d=1:"
             f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
             f"s={spec['width']}x{spec['height']}:fps={spec['fps']},"
             f"trim=end_frame={frames},setsar=1" + caption),
         *encode_common(spec), str(out)])


def segment_slate(shot, out, spec, duration, caption=""):
    """Ничего нет — рисуем слейт, чтобы хронометраж всё равно сходился."""
    label = f"SHOT {shot['n']:02d} — {shot['name']}"
    run(["ffmpeg", "-y", "-f", "lavfi",
         "-i", f"color=c={spec['bg']}:s={spec['width']}x{spec['height']}:r={spec['fps']}:d={duration}",
         "-vf", (f"drawtext=fontfile={FONT}:text='{label}':fontcolor={spec['ink']}:"
                 f"fontsize={spec['height'] // 26}:x=(w-text_w)/2:y=(h-text_h)/2" + caption),
         *encode_common(spec), str(out)])


def resolve_shots(manifest, base):
    """Собирает по каждому плану его источник, озвучку и итоговую длительность."""
    clips, frames, audio_dir = (base / "build" / d for d in ("clips", "frames", "audio"))
    resolved = []
    for shot in manifest["shots"]:
        audio = find(audio_dir, shot["name"], AUDIO_SUFFIXES)
        pad = float(manifest.get("shot_padding_seconds", 0.45))
        duration = probe_duration(audio) + pad if audio else float(shot["duration"])
        resolved.append({
            "shot": shot,
            "clip": find(clips, shot["name"], CLIP_SUFFIXES),
            "frame": find(frames, shot["name"], FRAME_SUFFIXES),
            "audio": audio,
            "duration": round(duration, 3),
        })
    return resolved


def build_segments(resolved, work, spec, captions):
    segments, report = [], []
    for item in resolved:
        shot = item["shot"]
        out = work / f"seg{shot['n']:02d}.mp4"
        caption = caption_chain(shot.get("vo", ""), work, spec, shot["n"]) if captions else ""

        if item["clip"]:
            segment_from_clip(item["clip"], out, spec, caption)
            source = f"клип {item['clip'].name}"
        elif item["frame"]:
            segment_from_frame(item["frame"], out, spec, item["duration"],
                               zoom_in=shot["n"] % 2 == 1, caption=caption)
            source = f"кадр {item['frame'].name}"
        else:
            segment_slate(shot, out, spec, item["duration"], caption)
            source = "слейт (нет материала)"

        segments.append(out)
        report.append(f"  {shot['n']:>2}. {shot['name']:<34} {item['duration']:>5.1f} с  {source}"
                      + (f" + {item['audio'].name}" if item["audio"] else ""))
    return segments, report


def concat(segments, work, out):
    listing = work / "concat.txt"
    listing.write_text("".join(f"file '{s.resolve()}'\n" for s in segments))
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", str(out)])


def build_voice_track(resolved, work, spec):
    """Склеивает пореплично озвучку, добивая каждую реплику паузой до длины плана."""
    if not any(item["audio"] for item in resolved):
        return None
    parts = []
    for item in resolved:
        part = work / f"vo{item['shot']['n']:02d}.wav"
        if item["audio"]:
            run(["ffmpeg", "-y", "-i", str(item["audio"]),
                 "-af", f"apad=whole_dur={item['duration']}",
                 "-ar", "48000", "-ac", "2", str(part)])
        else:
            run(["ffmpeg", "-y", "-f", "lavfi",
                 "-i", f"anullsrc=channel_layout=stereo:sample_rate=48000:d={item['duration']}",
                 str(part)])
        parts.append(part)
    listing = work / "vo.txt"
    listing.write_text("".join(f"file '{p.resolve()}'\n" for p in parts))
    track = work / "voice.wav"
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", str(track)])
    return track


def mux_audio(video, audio, out, spec):
    """Звук к −14 LUFS — норма платформ, иначе они пережмут его по-своему."""
    if audio:
        run(["ffmpeg", "-y", "-i", str(video), "-i", str(audio),
             "-filter:a", f"loudnorm=I={spec['lufs']}:TP=-1.5:LRA=11",
             "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ac", "2",
             "-map", "0:v:0", "-map", "1:a:0", "-shortest", str(out)])
    else:
        run(["ffmpeg", "-y", "-i", str(video),
             "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
             "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
             "-map", "0:v:0", "-map", "1:a:0", "-shortest", str(out)])


def main():
    parser = argparse.ArgumentParser(description="Сборка серии в готовый mp4")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--out", type=Path, help="куда положить финал")
    parser.add_argument("--captions", dest="captions", action="store_true", default=None,
                        help="вжечь реплики субтитрами")
    parser.add_argument("--no-captions", dest="captions", action="store_false")
    args = parser.parse_args()

    if not shutil.which("ffmpeg"):
        sys.exit("Нужен ffmpeg в PATH: apt install ffmpeg")

    manifest = json.loads(args.manifest.read_text())
    base = args.manifest.parent
    spec = {
        "width": manifest["width"], "height": manifest["height"], "fps": manifest["fps"],
        "lufs": manifest.get("loudness_lufs", -14),
        "bg": manifest.get("background", "#FBF7F1"),
        "ink": manifest.get("ink", "#272724"),
    }

    work = base / "build" / ".work"
    work.mkdir(parents=True, exist_ok=True)
    out = args.out or base / "build" / f"ep{manifest['episode']:02d}_final.mp4"

    resolved = resolve_shots(manifest, base)
    # без озвучки немой ролик нечитаем, поэтому там субтитры включаются сами
    captions = args.captions if args.captions is not None \
        else not any(item["audio"] for item in resolved)

    segments, report = build_segments(resolved, work, spec, captions)
    silent = work / "silent.mp4"
    concat(segments, work, silent)
    voice = build_voice_track(resolved, work, spec)
    mux_audio(silent, voice, out, spec)

    print(f"\nСерия {manifest['episode']} — «{manifest['title']}»")
    print("\n".join(report))
    print(f"  субтитры: {'вжжены' if captions else 'нет'}")
    print(f"  звук: {'озвучка по планам' if voice else 'тишина (озвучки нет)'}")
    print(f"\nГотово: {out}  ({probe_duration(out):.2f} с, "
          f"{spec['width']}x{spec['height']}, {spec['fps']} fps)")


if __name__ == "__main__":
    main()
