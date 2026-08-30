"""Собирает серию в готовый mp4 из того, что реально сгенерировано.

    python3 series/assemble.py series/ep04/manifest.json

Источник для каждого плана выбирается по убыванию качества: готовый клип
плана, затем кадр (аниматик с медленным наездом), затем слейт с номером.
Если рядом лежит целиковый клип серии из `generation.video_output`, он и
идёт в дело, а планы нужны только как раскадровка.
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

FRAME_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp")
AUDIO_SUFFIXES = (".wav", ".mp3", ".m4a", ".aac", ".flac")


def run(cmd):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.exit(f"ffmpeg упал на {' '.join(cmd[:6])}...\n{proc.stderr[-2000:]}")


def find(directory, stem, suffixes):
    for suffix in suffixes:
        candidate = directory / f"{stem}{suffix}"
        if candidate.exists():
            return candidate
    return None


def encode_common(spec):
    """Одинаковые параметры кодирования у всех кусков — иначе concat склеит их со сбоями."""
    return [
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-pix_fmt", "yuv420p", "-r", str(spec["fps"]), "-an",
    ]


def segment_from_clip(clip, out, spec):
    """Клип плана: приводим к общей сетке, длительность не трогаем."""
    run([
        "ffmpeg", "-y", "-i", str(clip),
        "-vf", (
            f"scale={spec['width']}:{spec['height']}:force_original_aspect_ratio=decrease,"
            f"pad={spec['width']}:{spec['height']}:-1:-1:color=black,setsar=1"
        ),
        *encode_common(spec), str(out),
    ])


def segment_from_frame(frame, out, spec, duration, zoom_in=True):
    """Кадр: медленный наезд, чтобы статика не читалась как стоп-кадр.

    Зум считается от номера выходного кадра, а не накоплением от предыдущего:
    рекурсивная форма `min(zoom+шаг,предел)` при d=1 не накапливается и даёт
    неподвижную картинку. Направление чередуется по планам, иначе шесть
    одинаковых наездов подряд читаются как приём, а не как монтаж.
    """
    frames = max(1, round(duration * spec["fps"]))
    span = max(1, frames - 1)
    progress = f"on/{span}" if zoom_in else f"(1-on/{span})"
    run([
        "ffmpeg", "-y", "-loop", "1", "-framerate", str(spec["fps"]),
        "-t", f"{duration}", "-i", str(frame),
        "-vf", (
            # увеличиваем до наезда — иначе zoompan дрожит на пиксельной сетке
            f"scale={spec['width'] * 2}:{spec['height'] * 2}:force_original_aspect_ratio=increase,"
            f"crop={spec['width'] * 2}:{spec['height'] * 2},"
            f"zoompan=z='1+0.10*{progress}':d=1:"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
            f"s={spec['width']}x{spec['height']}:fps={spec['fps']},"
            f"trim=end_frame={frames},setsar=1"
        ),
        *encode_common(spec), str(out),
    ])


def segment_slate(shot, out, spec, duration):
    """Ничего нет — рисуем слейт, чтобы хронометраж серии всё равно сходился."""
    label = f"SHOT {shot['n']:02d} — {shot['name']}"
    beat = shot.get("beat", "").replace(":", "\\:").replace("'", "")
    run([
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", f"color=c=0x101418:s={spec['width']}x{spec['height']}:r={spec['fps']}:d={duration}",
        "-vf", (
            f"drawtext=fontfile={spec['font']}:text='{label}':"
            f"fontcolor=0xE8E4DC:fontsize={spec['height'] // 22}:x=(w-text_w)/2:y=h/2-text_h,"
            f"drawtext=fontfile={spec['font']}:text='{beat}':"
            f"fontcolor=0x8A8F98:fontsize={spec['height'] // 34}:x=(w-text_w)/2:y=h/2+text_h"
        ),
        *encode_common(spec), str(out),
    ])


def build_segments(manifest, base, work, spec):
    clips_dir = base / "build" / "clips"
    frames_dir = base / "build" / "frames"
    segments, report = [], []

    for shot in manifest["shots"]:
        out = work / f"seg{shot['n']:02d}.mp4"
        duration = float(shot["duration"])
        clip = find(clips_dir, shot["name"], (".mp4", ".mov", ".webm"))
        frame = find(frames_dir, shot["name"], FRAME_SUFFIXES)

        if clip:
            segment_from_clip(clip, out, spec)
            source = f"клип {clip.name}"
        elif frame:
            segment_from_frame(frame, out, spec, duration, zoom_in=shot["n"] % 2 == 1)
            source = f"кадр {frame.name}"
        else:
            segment_slate(shot, out, spec, duration)
            source = "слейт (нет материала)"

        segments.append(out)
        report.append(f"  {shot['n']}. {shot['name']:<28} {source}")

    return segments, report


def concat(segments, work, out, spec):
    listing = work / "concat.txt"
    listing.write_text("".join(f"file '{s.resolve()}'\n" for s in segments))
    run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
        "-c", "copy", str(out),
    ])


def mux_audio(video, audio, out, spec):
    """Звук приводим к −14 LUFS: та же норма, что у нарезки, чтобы платформа не пережимала."""
    if audio:
        run([
            "ffmpeg", "-y", "-i", str(video), "-i", str(audio),
            "-filter:a", f"loudnorm=I={spec['lufs']}:TP=-1.5:LRA=11",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ac", "2",
            "-map", "0:v:0", "-map", "1:a:0", "-shortest", str(out),
        ])
    else:
        run([
            "ffmpeg", "-y", "-i", str(video),
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
            "-map", "0:v:0", "-map", "1:a:0", "-shortest", str(out),
        ])


def main():
    parser = argparse.ArgumentParser(description="Сборка серии в готовый mp4")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--out", type=Path, help="куда положить финал")
    args = parser.parse_args()

    if not shutil.which("ffmpeg"):
        sys.exit("Нужен ffmpeg в PATH: apt install ffmpeg")

    manifest = json.loads(args.manifest.read_text())
    base = args.manifest.parent
    spec = {
        "width": manifest["width"],
        "height": manifest["height"],
        "fps": manifest["fps"],
        "lufs": manifest.get("loudness_lufs", -14),
        "font": "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    }

    work = base / "build" / ".work"
    work.mkdir(parents=True, exist_ok=True)
    out = args.out or base / "build" / f"ep{manifest['episode']:02d}_final.mp4"
    silent = work / "silent.mp4"

    full = base / manifest.get("generation", {}).get("video_output", "")
    if full.is_file():
        print(f"Целиковый клип серии: {full.name}")
        segment_from_clip(full, silent, spec)
        report = [f"  весь эпизод одним клипом: {full.name}"]
    else:
        segments, report = build_segments(manifest, base, work, spec)
        concat(segments, work, silent, spec)

    audio = None
    for suffix in AUDIO_SUFFIXES:
        candidate = base / "build" / "audio" / f"ep{manifest['episode']:02d}_mix{suffix}"
        if candidate.exists():
            audio = candidate
            break

    mux_audio(silent, audio, out, spec)

    duration = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(out)],
        capture_output=True, text=True,
    ).stdout.strip()

    print(f"\nСерия {manifest['episode']} — «{manifest['title']}»")
    print("\n".join(report))
    print(f"  звук: {audio.name if audio else 'тишина (микса нет)'}")
    print(f"\nГотово: {out}  ({float(duration):.2f} с, "
          f"{spec['width']}x{spec['height']}, {spec['fps']} fps)")


if __name__ == "__main__":
    main()
