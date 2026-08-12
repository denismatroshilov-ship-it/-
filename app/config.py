from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    tg_bot_token: str
    tg_channel_id: int
    # Строкой, а не list[int]: pydantic-settings иначе пытается разобрать
    # переменную окружения как JSON.
    tg_admin_ids: str = ""

    higgsfield_api_key: str
    higgsfield_base_url: str = "https://api.higgsfield.ai"
    tiktok_account_id: str | None = None

    video_model: str = "higgsfield-video-1"
    video_aspect_ratio: str = "9:16"
    video_duration_sec: int = 10

    publish_cron: str = "0 9,15,20 * * *"
    publish_batch: int = 1
    auto_approve: bool = False

    db_path: str = "./data/queue.db"
    log_level: str = "INFO"

    @property
    def admin_ids(self) -> set[int]:
        return {
            int(part)
            for part in self.tg_admin_ids.replace(" ", "").split(",")
            if part
        }

    @property
    def cron_fields(self) -> dict[str, str]:
        minute, hour, day, month, day_of_week = self.publish_cron.split()
        return {
            "minute": minute,
            "hour": hour,
            "day": day,
            "month": month,
            "day_of_week": day_of_week,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
