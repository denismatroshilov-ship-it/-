from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    tg_bot_token: str
    # Либо числовой id (-100…), либо @username публичного канала.
    tg_channel_id: str
    # Строкой, а не list[int]: pydantic-settings иначе пытается разобрать
    # переменную окружения как JSON.
    tg_admin_ids: str = ""

    higgsfield_api_key: str
    higgsfield_base_url: str = "https://api.higgsfield.ai"
    tiktok_account_id: str | None = None

    publish_cron: str = "0 9,15,20 * * *"
    publish_batch: int = 1
    auto_approve: bool = False

    # Где лежат исходники фильмов и куда складывать нарезки.
    sources_dir: str = "./sources"
    clips_dir: str = "./data/clips"

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
