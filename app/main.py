from __future__ import annotations

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.bot import build_bot, build_dispatcher
from app.config import get_settings
from app.db import Queue
from app.pipeline import Pipeline

log = logging.getLogger(__name__)


async def preflight(bot: Bot, settings: Settings) -> None:
    """Проверяет токен и доступ к каналу до старта, а не в момент первой
    публикации: иначе ролик молча уходит в failed через полчаса после запуска."""
    me = await bot.get_me()
    log.info("бот @%s на связи", me.username)
    chat = await bot.get_chat(settings.tg_channel_id)
    member = await bot.get_chat_member(chat.id, me.id)
    if member.status not in {"administrator", "creator"}:
        raise RuntimeError(
            f"бот не админ в {settings.tg_channel_id} (статус {member.status}) — "
            "без этого он не сможет постить превью"
        )
    log.info("канал %s (%s) доступен, бот админ", chat.title, chat.id)


async def main() -> None:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    queue = Queue(settings.db_path)
    await queue.init()

    bot = build_bot(settings)
    await preflight(bot, settings)
    pipeline = Pipeline(settings, queue, bot)
    dispatcher = build_dispatcher(settings, queue, pipeline)

    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        pipeline.publish_due,
        CronTrigger(**settings.cron_fields, timezone="UTC"),
        id="publish_due",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    log.info("расписание публикаций: %s (UTC)", settings.publish_cron)

    try:
        await dispatcher.start_polling(bot)
    finally:
        scheduler.shutdown(wait=False)
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
