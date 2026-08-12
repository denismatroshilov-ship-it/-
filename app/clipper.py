"""Нарезка момента из фильма в вертикальный ролик под TikTok."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import textwrap
from dataclasses import dataclass

from app.playbook import HOOK_WINDOW_SEC

log = logging.getLogger(__name__)

FONT_CANDIDATES = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
)
# Столько символов помещается в 1080px при кегле 64 с запасом на поля.
LINE_MAX_CHARS = 22
TIMESPAN_RE = re.compile(
    r"^(?:(?P<h1>\d+):)?(?P<m1>\d{1,2}):(?P<s1>\d{2})"
    r"\s*-\s*"
    r"(?:(?:(?P<h2>\d+):)?(?P<m2>\d{1,2}):(?P<s2>\d{2})|\+(?P<dur>\d+))$"
)


class ClipError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class Span:
    start_sec: float
    duration_sec: float


def parse_span(text: str) -> Span:
    """`01:12:30-01:12:58`, `12:30-12:58` или `12:30-+25` (длительность в секундах)."""
    match = TIMESPAN_RE.match(text.strip())
    if not match:
        raise ClipError(f"не понял тайминг {text!r}, нужно 12:30-12:58 или 12:30-+25")
    groups = match.groupdict()
    start = _to_sec(groups["h1"], groups["m1"], groups["s1"])
    if groups["dur"] is not None:
        duration = float(groups["dur"])
    else:
        duration = _to_sec(groups["h2"], groups["m2"], groups["s2"]) - start
    if duration <= 0:
        raise ClipError("конец отрезка раньше начала")
    return Span(start_sec=start, duration_sec=duration)


def _to_sec(hours: str | None, minutes: str, seconds: str) -> float:
    return int(hours or 0) * 3600 + int(minutes) * 60 + int(seconds)


def pick_font() -> str:
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return path
    raise ClipError("не нашёл шрифт для текста хука; поставь fonts-dejavu")


def escape_path(path: str) -> str:
    """В значении опции фильтра ':' и '\\' — разметка, даже внутри кавычек."""
    return path.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")


def wrap_hook(text: str, width: int = LINE_MAX_CHARS) -> str:
    """Хук должен читаться за взгляд, а строка в 60 символов не влезает
    в 1080px при кегле 64 — переносим по словам."""
    return "\n".join(textwrap.wrap(text.strip(), width=width)) or text.strip()


def build_filter(hook_file: str | None, *, font: str, hook_seconds: float) -> str:
    """9:16 через размытый фон + исходник по центру, сверху текст хука.

    Кроп резал бы лица и субтитры, поэтому фон, а не crop.
    Текст берём из файла с expansion=none: иначе '%' и ':' в хуке drawtext
    трактует как разметку и тихо не рисует строку.
    """
    layout = (
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,boxblur=40:2[bg];"
        "[0:v]scale=1080:-2:force_original_aspect_ratio=decrease[fg];"
        "[bg][fg]overlay=(W-w)/2:(H-h)/2[base]"
    )
    if hook_file is None:
        return f"{layout};[base]null[v]"
    drawtext = (
        f"[base]drawtext=fontfile='{escape_path(font)}':"
        f"textfile='{escape_path(hook_file)}':expansion=none:"
        "fontcolor=white:fontsize=64:line_spacing=14:borderw=6:bordercolor=black@0.9:"
        "x=(w-text_w)/2:y=h*0.12:text_align=C:"
        f"enable='lt(t,{hook_seconds})'[v]"
    )
    return f"{layout};{drawtext}"


async def _run(args: list[str]) -> tuple[int, str]:
    process = await asyncio.create_subprocess_exec(
        *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
    )
    output, _ = await process.communicate()
    return process.returncode or 0, output.decode(errors="replace")


async def probe_duration(path: str) -> float:
    if shutil.which("ffprobe") is None:
        raise ClipError("ffprobe не установлен")
    code, output = await _run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "json", path,
        ]
    )
    if code != 0:
        raise ClipError(f"ffprobe упал: {output[-400:]}")
    return float(json.loads(output)["format"]["duration"])


async def cut(
    source: str,
    span: Span,
    output: str,
    *,
    hook_text: str = "",
    hook_seconds: float = HOOK_WINDOW_SEC,
) -> str:
    """Режет отрезок, приводит к 1080x1920 и вжигает хук. Возвращает путь."""
    if shutil.which("ffmpeg") is None:
        raise ClipError("ffmpeg не установлен")
    if not os.path.exists(source):
        raise ClipError(f"нет исходника: {source}")
    os.makedirs(os.path.dirname(os.path.abspath(output)), exist_ok=True)

    hook_file: str | None = None
    if hook_text.strip():
        hook_file = f"{output}.hook.txt"
        with open(hook_file, "w", encoding="utf-8") as handle:
            handle.write(wrap_hook(hook_text))

    args = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        # -ss до -i — быстрый поиск по ключевым кадрам, точность добираем -accurate_seek.
        "-accurate_seek", "-ss", f"{span.start_sec:.3f}",
        "-t", f"{span.duration_sec:.3f}", "-i", source,
        "-filter_complex",
        build_filter(hook_file, font=pick_font(), hook_seconds=hook_seconds),
        "-map", "[v]", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-r", "30",
        # TikTok перекодирует со своей громкостью — нормализуем заранее.
        "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
        "-movflags", "+faststart",
        output,
    ]
    try:
        code, log_output = await _run(args)
    finally:
        if hook_file:
            os.unlink(hook_file)
    if code != 0 or not os.path.exists(output):
        raise ClipError(f"ffmpeg упал: {log_output[-600:]}")
    log.info("нарезал %s (%.1f c) → %s", source, span.duration_sec, output)
    return output
