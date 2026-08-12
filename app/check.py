"""Диагностика окружения: `python -m app.check`.

Проверяет всё, что нужно для первой публикации, и по каждому пункту говорит
«ок» или что именно сломано. Отдельно подбирает рабочий базовый URL
Higgsfield: в документации он встречается в нескольких вариантах, а угадывать
вслепую в бою дорого.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import sys

import aiohttp

from app.config import get_settings
from app.providers.higgsfield import EP_TIKTOK_ACCOUNTS

# Кандидаты в порядке правдоподобности; первый ответивший осмысленно побеждает.
BASE_URL_CANDIDATES = (
    "https://api.higgsfield.ai",
    "https://cloud.higgsfield.ai/api",
    "https://platform.higgsfield.ai/api",
    "https://higgsfield.ai/api",
)

OK = "✓"
FAIL = "✗"


def line(status: str, text: str) -> None:
    print(f"{status} {text}")


async def check_ffmpeg() -> bool:
    missing = [name for name in ("ffmpeg", "ffprobe") if shutil.which(name) is None]
    if missing:
        line(FAIL, f"нет в PATH: {', '.join(missing)} — поставь ffmpeg")
        return False
    line(OK, "ffmpeg и ffprobe на месте")
    return True


async def check_font() -> bool:
    from app.clipper import ClipError, pick_font

    try:
        line(OK, f"шрифт для хука: {pick_font()}")
        return True
    except ClipError as exc:
        line(FAIL, str(exc))
        return False


async def check_dirs() -> bool:
    settings = get_settings()
    ok = True
    if not os.path.isdir(settings.sources_dir):
        line(FAIL, f"нет папки с исходниками {settings.sources_dir}")
        ok = False
    else:
        films = [
            name
            for name in os.listdir(settings.sources_dir)
            if name.lower().endswith((".mp4", ".mkv", ".avi", ".mov", ".webm"))
        ]
        if films:
            line(OK, f"исходников в {settings.sources_dir}: {len(films)}")
        else:
            line(FAIL, f"{settings.sources_dir} пуста — резать нечего")
            ok = False
    os.makedirs(settings.clips_dir, exist_ok=True)
    return ok


async def check_telegram() -> bool:
    from aiogram import Bot
    from aiogram.exceptions import TelegramAPIError

    settings = get_settings()
    bot = Bot(token=settings.tg_bot_token)
    try:
        me = await bot.get_me()
        line(OK, f"бот @{me.username}")
        try:
            chat = await bot.get_chat(settings.review_chat)
        except TelegramAPIError as exc:
            line(FAIL, f"чат превью {settings.review_chat} недоступен: {exc}")
            line(FAIL, f"если это личка — открой @{me.username} и нажми /start")
            return False
        where = chat.title or chat.username or "личка"
        line(OK, f"превью пойдут в {where} ({chat.id})")
        if not settings.admin_ids:
            line(FAIL, "TG_ADMIN_IDS пуст — команды никого не послушают")
            return False
        line(OK, f"админы: {sorted(settings.admin_ids)}")
        return True
    except TelegramAPIError as exc:
        line(FAIL, f"Telegram: {exc}")
        return False
    finally:
        await bot.session.close()


async def probe_base_url(session: aiohttp.ClientSession, base: str, key: str) -> bool:
    """Проверяет, отвечает ли база осмысленно на запрос списка аккаунтов."""
    url = f"{base}{EP_TIKTOK_ACCOUNTS}"
    try:
        async with session.get(
            url, headers={"Authorization": f"Bearer {key}"}
        ) as response:
            body = (await response.text())[:200]
    except aiohttp.ClientError as exc:
        line(FAIL, f"{base} — не отвечает ({type(exc).__name__})")
        return False
    if response.status == 200:
        line(OK, f"{base} — работает: {body}")
        return True
    if response.status in (401, 403):
        # Тело важно: такой же 403 отдаёт корпоративный прокси, не пропускающий
        # домен, и без текста ответа это не отличить от отказа по ключу.
        line(FAIL, f"{base} — {response.status}, ключ отвергнут или закрыт доступ: {body}")
        return False
    line(FAIL, f"{base} — {response.status}: {body}")
    return False


async def check_higgsfield() -> bool:
    settings = get_settings()
    if not settings.higgsfield_api_key:
        line(FAIL, "HIGGSFIELD_API_KEY пуст")
        return False
    candidates = [settings.higgsfield_base_url, *BASE_URL_CANDIDATES]
    seen: list[str] = []
    for base in candidates:
        base = base.rstrip("/")
        if base in seen:
            continue
        seen.append(base)
    timeout = aiohttp.ClientTimeout(total=20)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        for base in seen:
            if await probe_base_url(session, base, settings.higgsfield_api_key):
                if base != settings.higgsfield_base_url.rstrip("/"):
                    line(OK, f"пропиши в .env: HIGGSFIELD_BASE_URL={base}")
                if not settings.tiktok_account_id:
                    line(FAIL, "TIKTOK_ACCOUNT_ID пуст — возьми connector_id из ответа")
                    return False
                return True
    line(FAIL, "ни один базовый URL не подошёл — сверься с docs.higgsfield.ai")
    return False


async def main() -> int:
    checks = (
        ("ffmpeg", check_ffmpeg),
        ("шрифт", check_font),
        ("папки", check_dirs),
        ("telegram", check_telegram),
        ("higgsfield", check_higgsfield),
    )
    failed: list[str] = []
    for name, check in checks:
        try:
            if not await check():
                failed.append(name)
        except Exception as exc:  # noqa: BLE001 — диагностика не должна падать сама
            line(FAIL, f"{name}: {type(exc).__name__}: {exc}")
            failed.append(name)
    print()
    if failed:
        print(f"Не готово: {', '.join(failed)}")
        return 1
    print("Всё готово — можно запускать python -m app.main")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
