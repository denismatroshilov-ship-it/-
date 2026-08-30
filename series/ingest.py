"""Заводит серию из готовых материалов: своих кадров и своего текста.

    python3 series/ingest.py --episode 4 --frames ~/mm/ep04 --vo ~/mm/ep04/vo.txt

Кадры берутся в естественном порядке имён и раскладываются по планам; если
их меньше, чем реплик, недостающие планы остаются слейтами и дорисовываются
позже — сборка от этого не ломается. Реплики задают число планов и их
длительность, поэтому файл озвучки главнее папки с картинками.
"""

import argparse
import json
import re
import shutil
import unicodedata
from pathlib import Path

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
WORDS_PER_SECOND = 2.15

CANON = {
    "series": "Mind & Money",
    "format": "stickman explainer, psychology of money",
    "width": 1920, "height": 1080, "fps": 24,
    "background": "#FBF7F1", "ink": "#272724",
    "loudness_lufs": -14,
    "shot_padding_seconds": 0.45,
    "voice": {
        "voice_id": "7O2znNqD2IdXSYSrr6sb",
        "name": "альберт",
        "model_id": "eleven_multilingual_v2",
        "note": "голос серии из воркспейса ElevenLabs",
    },
    "palette": {"bg": "#FBF7F1", "ink": "#272724", "teal": "#51867E",
                "ochre": "#D9A84C", "grey": "#424242"},
}


def natural_key(path):
    """frame2 должен идти перед frame10, а не после."""
    return [int(t) if t.isdigit() else t.lower()
            for t in re.split(r"(\d+)", path.name)]


def slugify(text, fallback, limit=5):
    normalized = unicodedata.normalize("NFKD", text)
    words = re.findall(r"[a-zA-Z0-9]+", normalized)
    return "_".join(w.lower() for w in words[:limit]) or fallback


def read_lines(path):
    if not path:
        return []
    return [line.strip() for line in Path(path).read_text().splitlines() if line.strip()]


def main():
    parser = argparse.ArgumentParser(description="Собрать манифест серии из готовых материалов")
    parser.add_argument("--episode", type=int, required=True)
    parser.add_argument("--frames", type=Path, help="папка с уже сделанными кадрами")
    parser.add_argument("--vo", type=Path, help="файл с репликами, по одной на план")
    parser.add_argument("--title", default="")
    parser.add_argument("--title-ru", default="")
    parser.add_argument("--language", default="en")
    parser.add_argument("--root", type=Path, default=Path(__file__).parent)
    args = parser.parse_args()

    ep_dir = args.root / f"ep{args.episode:02d}"
    frames_out = ep_dir / "build" / "frames"
    frames_out.mkdir(parents=True, exist_ok=True)
    (ep_dir / "build" / "audio").mkdir(parents=True, exist_ok=True)

    lines = read_lines(args.vo)
    images = sorted(
        (p for p in (args.frames.iterdir() if args.frames and args.frames.is_dir() else [])
         if p.suffix.lower() in IMAGE_SUFFIXES),
        key=natural_key,
    )
    if not lines and not images:
        parser.error("нужны либо реплики (--vo), либо кадры (--frames)")

    count = len(lines) or len(images)
    shots, copied = [], 0
    prefix = f"mm_ep{args.episode:02d}"

    for i in range(count):
        vo = lines[i] if i < len(lines) else ""
        source = images[i] if i < len(images) else None
        slug = slugify(vo, fallback=slugify(source.stem, "shot") if source else f"shot{i + 1:02d}")
        name = f"{prefix}_{i + 1:02d}_{slug}"

        if source:
            shutil.copy2(source, frames_out / f"{name}{source.suffix.lower()}")
            copied += 1

        words = len(vo.split())
        shots.append({
            "n": i + 1,
            "name": name,
            "duration": round(words / WORDS_PER_SECOND + 1.0, 1) if words else 4.0,
            "vo": vo,
            "source_frame": source.name if source else None,
        })

    manifest = dict(CANON)
    manifest.update({
        "episode": args.episode,
        "title": args.title or f"Episode {args.episode}",
        "title_ru": args.title_ru,
        "language": args.language,
        "shots": shots,
    })
    path = ep_dir / "manifest.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))

    missing = count - copied
    print(f"Серия {args.episode}: {count} планов, кадров подложено {copied}"
          + (f", без кадра пока {missing}" if missing else ""))
    print(f"Манифест: {path}")
    print(f"\nДальше:\n  python3 series/assemble.py {path}")


if __name__ == "__main__":
    main()
