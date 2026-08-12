from __future__ import annotations

import logging

from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.config import Settings
from app.db import Item, Queue, Status
from app.providers.higgsfield import HiggsfieldClient, HiggsfieldError

log = logging.getLogger(__name__)


def approval_keyboard(item_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="✅ В TikTok", callback_data=f"ok:{item_id}"),
                InlineKeyboardButton(text="🗑 Отклонить", callback_data=f"no:{item_id}"),
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

    async def generate(self, item: Item) -> None:
        """Генерит ролик и кладёт превью в TG-канал на аппрув."""
        await self.queue.update(item.id, status=Status.GENERATING, error=None)
        try:
            async with self._client() as client:
                job_id = await client.generate_video(
                    item.prompt,
                    model=self.settings.video_model,
                    aspect_ratio=self.settings.video_aspect_ratio,
                    duration_sec=self.settings.video_duration_sec,
                )
                result = await client.wait_for_video(job_id)
        except HiggsfieldError as exc:
            log.exception("генерация #%s не удалась", item.id)
            await self.queue.update(item.id, status=Status.FAILED, error=str(exc))
            await self._notify(f"❌ Ролик #{item.id} не сгенерировался: {exc}")
            return

        auto = self.settings.auto_approve
        caption = item.caption or item.prompt
        message = await self.bot.send_video(
            chat_id=self.settings.tg_channel_id,
            video=result.url,
            caption=f"#{item.id} · {caption}",
            reply_markup=None if auto else approval_keyboard(item.id),
        )
        await self.queue.update(
            item.id,
            status=Status.APPROVED if auto else Status.AWAITING_APPROVAL,
            video_url=result.url,
            tg_message_id=message.message_id,
        )
        log.info("ролик #%s готов: %s", item.id, result.url)

    async def publish_due(self) -> None:
        """Тик планировщика: забирает одобренные ролики и публикует в TikTok."""
        items = await self.queue.claim_for_publishing(self.settings.publish_batch)
        if not items:
            log.debug("очередь на публикацию пуста")
            return
        if not self.settings.tiktok_account_id:
            for item in items:
                await self.queue.update(
                    item.id, status=Status.APPROVED, error="TIKTOK_ACCOUNT_ID не задан"
                )
            await self._notify("⚠️ TIKTOK_ACCOUNT_ID не задан — публикация отложена.")
            return

        async with self._client() as client:
            for item in items:
                if not item.video_url:
                    await self.queue.update(
                        item.id, status=Status.FAILED, error="нет video_url"
                    )
                    continue
                try:
                    publish_id = await client.tiktok_publish(
                        account_id=self.settings.tiktok_account_id,
                        video_url=item.video_url,
                        caption=item.caption or item.prompt,
                    )
                except HiggsfieldError as exc:
                    log.exception("публикация #%s не удалась", item.id)
                    # Возвращаем в approved: следующий тик попробует снова.
                    await self.queue.update(
                        item.id, status=Status.APPROVED, error=str(exc)
                    )
                    await self._notify(f"❌ Не выложил #{item.id} в TikTok: {exc}")
                    continue
                await self.queue.update(
                    item.id,
                    status=Status.PUBLISHED,
                    tiktok_job_id=publish_id,
                    error=None,
                )
                await self._notify(f"🚀 Ролик #{item.id} ушёл в TikTok (job {publish_id})")

    async def _notify(self, text: str) -> None:
        try:
            await self.bot.send_message(self.settings.tg_channel_id, text)
        except Exception:  # noqa: BLE001 — уведомление не должно ронять пайплайн
            log.exception("не смог отправить уведомление в канал")
