from __future__ import annotations

import asyncio
import logging
import os

from aiogram import Bot, Dispatcher, F, Router
from aiogram.filters import Command, CommandObject
from aiogram.types import CallbackQuery, Message

from app.clipper import ClipError, parse_span
from app.config import Settings
from app.db import Kind, Queue, Status
from app.pipeline import Pipeline
from app.playbook import Brief, build_brief, suggest_hooks, validate
from app.providers.higgsfield import HiggsfieldClient, HiggsfieldError

log = logging.getLogger(__name__)
router = Router()

HELP = (
    "Команды:\n"
    "/hooks <сцена> — 5 вариантов сценария под сцену\n"
    "/clip <файл> <12:30-12:58> <хук> — нарезать момент из фильма\n"
    "/new <промпт> — сгенерировать ролик и прислать на аппрув\n"
    "/caption <id> <текст> — заменить подпись перед публикацией\n"
    "/queue — состояние очереди\n"
    "/publish — выложить ближайшую партию прямо сейчас\n"
    "/accounts — подключённые TikTok-аккаунты"
)


def is_admin(user_id: int | None, settings: Settings) -> bool:
    return user_id is not None and user_id in settings.admin_ids


@router.message(Command("start", "help"))
async def cmd_help(message: Message) -> None:
    await message.answer(HELP)


@router.message(Command("new"))
async def cmd_new(
    message: Message, command: CommandObject, queue: Queue, pipeline: Pipeline,
    settings: Settings,
) -> None:
    if not is_admin(message.from_user.id if message.from_user else None, settings):
        return
    prompt = (command.args or "").strip()
    if not prompt:
        await message.answer("Нужен промпт: /new кот-бариста варит эспрессо, неон")
        return
    item_id = await queue.add(prompt)
    await message.answer(f"Принял, #{item_id}. Генерю — это пара минут.")
    item = await queue.get(item_id)
    assert item is not None
    asyncio.create_task(pipeline.generate(item))


@router.message(Command("hooks"))
async def cmd_hooks(
    message: Message, command: CommandObject, settings: Settings
) -> None:
    """Пять вариантов сценария под сцену — по одному на каждый архетип хука."""
    if not is_admin(message.from_user.id if message.from_user else None, settings):
        return
    subject = (command.args or "").strip()
    if not subject:
        await message.answer("Про что сцена? /hooks Гладиатор, финальный бой")
        return
    for brief in suggest_hooks(subject):
        await message.answer(brief.as_text())


@router.message(Command("clip"))
async def cmd_clip(
    message: Message, command: CommandObject, queue: Queue, pipeline: Pipeline,
    settings: Settings,
) -> None:
    """/clip <файл> <12:30-12:58> <текст хука>"""
    if not is_admin(message.from_user.id if message.from_user else None, settings):
        return
    parts = (command.args or "").split(maxsplit=2)
    if len(parts) < 2:
        await message.answer(
            "Формат: /clip gladiator.mp4 12:30-12:58 Смотри на его руки\n"
            "Файл ищется в SOURCES_DIR. Тайминг можно как 12:30-+25."
        )
        return
    filename, span_text = parts[0], parts[1]
    hook_text = parts[2] if len(parts) > 2 else ""
    try:
        span = parse_span(span_text)
    except ClipError as exc:
        await message.answer(str(exc))
        return

    source = os.path.join(settings.sources_dir, filename)
    if not os.path.exists(source):
        await message.answer(f"Не нашёл исходник {source}")
        return

    problems = validate(duration_sec=span.duration_sec, hook_text=hook_text)
    brief = build_brief(os.path.splitext(filename)[0])
    item_id = await queue.add(
        prompt=f"{filename} {span_text}",
        caption=brief.caption if not hook_text else _caption_for(hook_text, brief),
        kind=Kind.CLIP,
        source_path=source,
        span=span_text,
        hook_text=hook_text,
    )
    warning = ("\n⚠️ " + "; ".join(problems)) if problems else ""
    await message.answer(f"Принял, #{item_id}. Режу {span.duration_sec:.0f} c.{warning}")
    item = await queue.get(item_id)
    assert item is not None
    asyncio.create_task(pipeline.make_clip(item))


def _caption_for(hook_text: str, brief: Brief) -> str:
    """Подпись собираем из своего хука, но с CTA и хэштегами из плейбука."""
    _, _, tail = brief.caption.partition("\n\n")
    return f"{hook_text}\n\n{tail}"


@router.message(Command("caption"))
async def cmd_caption(
    message: Message, command: CommandObject, queue: Queue, settings: Settings
) -> None:
    if not is_admin(message.from_user.id if message.from_user else None, settings):
        return
    parts = (command.args or "").split(maxsplit=1)
    if len(parts) != 2 or not parts[0].isdigit():
        await message.answer("Формат: /caption 12 новая подпись #хэштеги")
        return
    item_id, caption = int(parts[0]), parts[1]
    if await queue.get(item_id) is None:
        await message.answer(f"Ролика #{item_id} нет.")
        return
    await queue.update(item_id, caption=caption)
    await message.answer(f"Подпись для #{item_id} обновлена.")


@router.message(Command("queue"))
async def cmd_queue(message: Message, queue: Queue, settings: Settings) -> None:
    if not is_admin(message.from_user.id if message.from_user else None, settings):
        return
    counts = await queue.counts()
    if not counts:
        await message.answer("Очередь пуста.")
        return
    lines = [f"{status}: {count}" for status, count in sorted(counts.items())]
    await message.answer("\n".join(lines))


@router.message(Command("publish"))
async def cmd_publish(message: Message, pipeline: Pipeline, settings: Settings) -> None:
    if not is_admin(message.from_user.id if message.from_user else None, settings):
        return
    await message.answer("Публикую ближайшую партию…")
    await pipeline.publish_due()


@router.message(Command("accounts"))
async def cmd_accounts(message: Message, settings: Settings) -> None:
    if not is_admin(message.from_user.id if message.from_user else None, settings):
        return
    try:
        async with HiggsfieldClient(
            settings.higgsfield_api_key, settings.higgsfield_base_url
        ) as client:
            accounts = await client.tiktok_accounts()
    except HiggsfieldError as exc:
        await message.answer(f"Ошибка: {exc}")
        return
    if not accounts:
        await message.answer("Нет подключённых TikTok-аккаунтов.")
        return
    lines = [
        f"{acc.get('id')} — @{acc.get('username', '?')}" for acc in accounts
    ]
    await message.answer("\n".join(lines))


@router.callback_query(F.data.startswith(("ok:", "no:")))
async def on_decision(
    callback: CallbackQuery, queue: Queue, settings: Settings
) -> None:
    if not is_admin(callback.from_user.id, settings):
        await callback.answer("Не для тебя кнопка.", show_alert=True)
        return
    action, raw_id = callback.data.split(":", 1)  # type: ignore[union-attr]
    item_id = int(raw_id)
    item = await queue.get(item_id)
    if item is None:
        await callback.answer("Ролик не найден.", show_alert=True)
        return
    if item.status is not Status.AWAITING_APPROVAL:
        await callback.answer(f"Уже в статусе {item.status}.", show_alert=True)
        return

    approved = action == "ok"
    await queue.update(item_id, status=Status.APPROVED if approved else Status.REJECTED)
    if callback.message is not None:
        await callback.message.edit_reply_markup(reply_markup=None)
    await callback.answer("В очереди на публикацию" if approved else "Отклонено")


def build_dispatcher(settings: Settings, queue: Queue, pipeline: Pipeline) -> Dispatcher:
    dispatcher = Dispatcher()
    dispatcher.include_router(router)
    # aiogram прокидывает это в хендлеры по именам аргументов.
    dispatcher["settings"] = settings
    dispatcher["queue"] = queue
    dispatcher["pipeline"] = pipeline
    return dispatcher


def build_bot(settings: Settings) -> Bot:
    return Bot(token=settings.tg_bot_token)
