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


async def main() -> None:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    queue = Queue(settings.db_path)
    await queue.init()

    bot = build_bot(settings)
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
