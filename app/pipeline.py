from __future__ import annotations

import logging
import os

from aiogram import Bot
from aiogram.types import FSInputFile, InlineKeyboardButton, InlineKeyboardMarkup

from app.clipper import ClipError, cut, parse_span
from app.config import Settings
from app.db import Item, Queue, Status
from app.playbook import HOOK_WINDOW_SEC, validate
from app.providers.higgsfield import HiggsfieldClient, HiggsfieldError

log = logging.getLogger(__name__)


def approval_keyboard(item_id: int) -> InlineKeyboardMarkup:
    """«Сейчас» публикует немедленно и не требует, чтобы сервис жил до слота;
    «В слот» откладывает до ближайшего времени из PUBLISH_CRON."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="🚀 Сейчас", callback_data=f"now:{item_id}"),
                InlineKeyboardButton(text="⏰ В слот", callback_data=f"slot:{item_id}"),
                InlineKeyboardButton(text="🗑", callback_data=f"no:{item_id}"),
            ]
        ]
    )


class Pipeline:
    """Связывает очередь, генерацию видео и обе площадки публикации."""

    def __init__(self, settings: Settings, queue: Queue, bot: Bot) -> None:
        self.settings = settings
        self.queue = queue
        self.bot = bot

    def _client(self) -> HiggsfieldClient:
        return HiggsfieldClient(
            self.settings.higgsfield_api_key, self.settings.higgsfield_base_url
        )

    async def make_clip(self, item: Item) -> None:
        """Режет момент из фильма, проверяет по плейбуку и шлёт на аппрув."""
        await self.queue.update(item.id, status=Status.CUTTING, error=None)
        output = os.path.join(self.settings.clips_dir, f"{item.id}.mp4")
        try:
            span = parse_span(item.span)
            await cut(
                item.source_path,
                span,
                output,
                hook_text=item.hook_text,
                hook_seconds=HOOK_WINDOW_SEC,
            )
            media_url = None
            async with self._client() as client:
                media_url = await client.upload_media(output)
        except (ClipError, HiggsfieldError) as exc:
            log.exception("нарезка #%s не удалась", item.id)
            await self.queue.update(item.id, status=Status.FAILED, error=str(exc))
            await self._notify(f"❌ Нарезка #{item.id} не получилась: {exc}")
            return

        problems = validate(duration_sec=span.duration_sec, hook_text=item.hook_text)
        warning = ("\n⚠️ " + "; ".join(problems)) if problems else ""
        caption = item.caption or item.title
        message = await self.bot.send_video(
            chat_id=self.settings.tg_channel_id,
            video=FSInputFile(output),
            caption=f"#{item.id} · {caption}{warning}",
            reply_markup=None if self.settings.auto_approve else approval_keyboard(item.id),
        )
        await self.queue.update(
            item.id,
            status=Status.APPROVED if self.settings.auto_approve else Status.AWAITING_APPROVAL,
            video_url=media_url,
            local_path=output,
            tg_message_id=message.message_id,
        )
        log.info("нарезка #%s готова: %s", item.id, output)

    async def publish_now(self, item_id: int) -> None:
        """Публикует один ролик немедленно — по кнопке «Сейчас»."""
        item = await self.queue.claim_one(item_id)
        if item is None:
            log.info("ролик #%s уже не в approved, публиковать нечего", item_id)
            return
        if not await self._account_ready([item]):
            await self._notify("⚠️ TIKTOK_ACCOUNT_ID не задан — публикация отложена.")
            return
        async with self._client() as client:
            await self._publish_one(client, item)

    async def publish_due(self) -> None:
        """Тик планировщика: забирает одобренные ролики и публикует в TikTok."""
        items = await self.queue.claim_for_publishing(self.settings.publish_batch)
        if not items:
            log.debug("очередь на публикацию пуста")
            return
        if not await self._account_ready(items):
            await self._notify("⚠️ TIKTOK_ACCOUNT_ID не задан — публикация отложена.")
            return

        async with self._client() as client:
            for item in items:
                await self._publish_one(client, item)

    async def _account_ready(self, items: list[Item]) -> bool:
        """Без аккаунта возвращаем ролики в approved, иначе они навсегда
        зависнут в publishing и их не подберёт ни один следующий тик."""
        if self.settings.tiktok_account_id:
            return True
        for item in items:
            await self.queue.update(
                item.id, status=Status.APPROVED, error="TIKTOK_ACCOUNT_ID не задан"
            )
        return False

    async def _publish_one(self, client: HiggsfieldClient, item: Item) -> None:
        if not item.video_url:
            await self.queue.update(item.id, status=Status.FAILED, error="нет video_url")
            return
        try:
            publish_id = await client.tiktok_publish(
                account_id=self.settings.tiktok_account_id or "",
                video_url=item.video_url,
                caption=item.caption or item.title,
            )
        except HiggsfieldError as exc:
            log.exception("публикация #%s не удалась", item.id)
            # Возвращаем в approved: следующий тик или кнопка попробуют снова.
            await self.queue.update(item.id, status=Status.APPROVED, error=str(exc))
            await self._notify(f"❌ Не выложил #{item.id} в TikTok: {exc}")
            return
        await self.queue.update(
            item.id, status=Status.PUBLISHED, tiktok_job_id=publish_id, error=None
        )
        await self._notify(f"🚀 Ролик #{item.id} ушёл в TikTok (job {publish_id})")

    async def _notify(self, text: str) -> None:
        try:
            await self.bot.send_message(self.settings.tg_channel_id, text)
        except Exception:  # noqa: BLE001 — уведомление не должно ронять пайплайн
            log.exception("не смог отправить уведомление в канал")
