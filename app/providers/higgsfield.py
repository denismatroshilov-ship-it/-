"""Транспорт публикации: заливка готового файла и постинг в TikTok.

Генерации видео здесь нет и быть не должно — ролики режутся из фильмов
(`app/clipper.py`), сервис нужен только чтобы доставить готовый файл в TikTok.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import aiohttp

log = logging.getLogger(__name__)

# Пути REST API вынесены сюда, чтобы их можно было поправить одним местом,
# если в аккаунте включена другая версия API.
EP_MEDIA_UPLOAD = "/v1/media/upload"
EP_TIKTOK_ACCOUNTS = "/v1/tiktok/accounts"
EP_TIKTOK_PUBLISH = "/v1/tiktok/publish"
EP_TIKTOK_PUBLISH_STATUS = "/v1/tiktok/publish/{job_id}"


class HiggsfieldError(RuntimeError):
    pass


class HiggsfieldClient:
    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.higgsfield.ai",
        *,
        timeout_sec: int = 60,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        self._timeout = aiohttp.ClientTimeout(total=timeout_sec)
        self._session: aiohttp.ClientSession | None = None

    async def __aenter__(self) -> "HiggsfieldClient":
        self._session = aiohttp.ClientSession(
            headers=self._headers, timeout=self._timeout
        )
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        if self._session is not None:
            await self._session.close()
            self._session = None

    async def _request(
        self, method: str, path: str, payload: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        if self._session is None:
            raise HiggsfieldError("client used outside of `async with` block")
        url = f"{self._base_url}{path}"
        async with self._session.request(method, url, json=payload) as response:
            body = await response.text()
            if response.status >= 400:
                raise HiggsfieldError(f"{method} {path} → {response.status}: {body}")
            return await response.json()

    # --- загрузка готового файла ------------------------------------------

    async def upload_media(self, path: str) -> str:
        """Заливает локальный ролик и возвращает URL, пригодный для публикации."""
        if self._session is None:
            raise HiggsfieldError("client used outside of `async with` block")
        url = f"{self._base_url}{EP_MEDIA_UPLOAD}"
        with open(path, "rb") as handle:
            form = aiohttp.FormData()
            form.add_field(
                "file", handle, filename=os.path.basename(path), content_type="video/mp4"
            )
            # Content-Type задаёт aiohttp под multipart, дефолтный json тут мешает.
            headers = {"Authorization": self._headers["Authorization"]}
            async with self._session.post(url, data=form, headers=headers) as response:
                body = await response.text()
                if response.status >= 400:
                    raise HiggsfieldError(f"upload → {response.status}: {body}")
                data = await response.json()
        media_url = _extract_url(data) or data.get("media_url")
        if not media_url:
            raise HiggsfieldError(f"нет ссылки на загруженный файл: {data}")
        return str(media_url)

    # --- TikTok ----------------------------------------------------------

    async def tiktok_accounts(self) -> list[dict[str, Any]]:
        data = await self._request("GET", EP_TIKTOK_ACCOUNTS)
        accounts = data.get("accounts", data)
        return accounts if isinstance(accounts, list) else []

    async def tiktok_publish(
        self,
        *,
        account_id: str,
        video_url: str,
        caption: str,
        privacy: str = "PUBLIC_TO_EVERYONE",
    ) -> str:
        data = await self._request(
            "POST",
            EP_TIKTOK_PUBLISH,
            {
                # Аккаунт в ответах API называется connector_id.
                "connector_id": account_id,
                "video_url": video_url,
                "caption": caption,
                "privacy_level": privacy,
            },
        )
        job_id = data.get("publish_id") or data.get("job_id") or data.get("id")
        if not job_id:
            raise HiggsfieldError(f"нет publish_id в ответе: {data}")
        return str(job_id)

    async def tiktok_publish_status(self, job_id: str) -> dict[str, Any]:
        return await self._request("GET", EP_TIKTOK_PUBLISH_STATUS.format(job_id=job_id))


def _extract_url(data: dict[str, Any]) -> str | None:
    """Ссылка на готовый файл приходит в одном из нескольких мест
    в зависимости от модели — проверяем их по порядку."""
    for key in ("video_url", "url", "output_url"):
        value = data.get(key)
        if isinstance(value, str) and value:
            return value
    results = data.get("results") or data.get("outputs") or []
    if isinstance(results, list):
        for entry in results:
            if isinstance(entry, str) and entry:
                return entry
            if isinstance(entry, dict):
                nested = _extract_url(entry)
                if nested:
                    return nested
    return None
