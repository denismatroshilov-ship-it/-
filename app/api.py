"""HTTP-API для мобильного клиента (iOS-приложение «Hermes»).

Тонкий слой поверх той же очереди и пайплайна, что и у Telegram-бота: телефон
дёргает те же операции (аппрув, публикация сейчас, подпись, сценарии), а
логика остаётся одна на всех. Доступ — по bearer-токену `HERMES_API_TOKEN`,
без него API просто не поднимается: открытый наружу конец без ключа выкладывать
в TikTok от твоего имени кому угодно нельзя.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Awaitable, Callable

from aiohttp import web

from app.config import Settings
from app.db import Item, Queue, Status
from app.pipeline import Pipeline
from app.playbook import suggest_hooks, validate
from app.providers.higgsfield import HiggsfieldClient, HiggsfieldError

log = logging.getLogger(__name__)

Handler = Callable[[web.Request], Awaitable[web.StreamResponse]]


def _item_json(item: Item) -> dict[str, object]:
    return {
        "id": item.id,
        "title": item.title,
        "caption": item.caption,
        "status": str(item.status),
        "hook_text": item.hook_text,
        "video_url": item.video_url,
        "error": item.error,
    }


@web.middleware
async def _auth(request: web.Request, handler: Handler) -> web.StreamResponse:
    """Bearer-токен на всё, кроме /health — чтобы health-check не требовал ключа."""
    if request.path == "/health":
        return await handler(request)
    token: str = request.app["settings"].hermes_api_token
    header = request.headers.get("Authorization", "")
    if header != f"Bearer {token}":
        return web.json_response({"error": "unauthorized"}, status=401)
    return await handler(request)


async def _health(request: web.Request) -> web.Response:
    return web.json_response({"ok": True})


async def _counts(request: web.Request) -> web.Response:
    queue: Queue = request.app["queue"]
    return web.json_response(await queue.counts())


async def _list(request: web.Request) -> web.Response:
    queue: Queue = request.app["queue"]
    raw = request.query.get("status", Status.AWAITING_APPROVAL)
    try:
        status = Status(raw)
    except ValueError:
        return web.json_response({"error": f"unknown status {raw}"}, status=400)
    items = await queue.list_by_status(status)
    return web.json_response({"items": [_item_json(item) for item in items]})


async def _get_item(request: web.Request) -> web.Response:
    queue: Queue = request.app["queue"]
    item = await queue.get(int(request.match_info["id"]))
    if item is None:
        return web.json_response({"error": "not found"}, status=404)
    return web.json_response(_item_json(item))


async def _approve(request: web.Request) -> web.Response:
    """Аппрув «в слот»: ролик уходит в approved и ждёт расписания."""
    queue: Queue = request.app["queue"]
    item_id = int(request.match_info["id"])
    item = await queue.get(item_id)
    if item is None:
        return web.json_response({"error": "not found"}, status=404)
    if item.status is not Status.AWAITING_APPROVAL:
        return web.json_response({"error": f"уже {item.status}"}, status=409)
    await queue.update(item_id, status=Status.APPROVED)
    return web.json_response({"ok": True, "status": str(Status.APPROVED)})


async def _reject(request: web.Request) -> web.Response:
    queue: Queue = request.app["queue"]
    item_id = int(request.match_info["id"])
    item = await queue.get(item_id)
    if item is None:
        return web.json_response({"error": "not found"}, status=404)
    if item.status is not Status.AWAITING_APPROVAL:
        return web.json_response({"error": f"уже {item.status}"}, status=409)
    await queue.update(item_id, status=Status.REJECTED)
    return web.json_response({"ok": True, "status": str(Status.REJECTED)})


async def _publish(request: web.Request) -> web.Response:
    """Кнопка «Сейчас»: аппрувим (если ещё ждёт) и публикуем немедленно."""
    queue: Queue = request.app["queue"]
    pipeline: Pipeline = request.app["pipeline"]
    item_id = int(request.match_info["id"])
    item = await queue.get(item_id)
    if item is None:
        return web.json_response({"error": "not found"}, status=404)
    if item.status is Status.AWAITING_APPROVAL:
        await queue.update(item_id, status=Status.APPROVED)
    elif item.status is not Status.APPROVED:
        return web.json_response({"error": f"нельзя публиковать из {item.status}"}, status=409)
    await pipeline.publish_now(item_id)
    published = await queue.get(item_id)
    return web.json_response(_item_json(published) if published else {"ok": True})


async def _caption(request: web.Request) -> web.Response:
    queue: Queue = request.app["queue"]
    item_id = int(request.match_info["id"])
    body = await request.json()
    caption = str(body.get("caption", "")).strip()
    if not caption:
        return web.json_response({"error": "пустая подпись"}, status=400)
    if await queue.get(item_id) is None:
        return web.json_response({"error": "not found"}, status=404)
    await queue.update(item_id, caption=caption)
    return web.json_response({"ok": True})


async def _hooks(request: web.Request) -> web.Response:
    body = await request.json()
    subject = str(body.get("subject", "")).strip()
    if not subject:
        return web.json_response({"error": "нужна сцена"}, status=400)
    briefs = suggest_hooks(subject)
    return web.json_response(
        {
            "briefs": [
                {
                    "hook": brief.hook.name,
                    "why": brief.hook.why,
                    "hook_text": brief.hook_text,
                    "frame": brief.hook.frame_requirement,
                    "beats": brief.beats,
                    "caption": brief.caption,
                }
                for brief in briefs
            ]
        }
    )


async def _clip(request: web.Request) -> web.Response:
    """Ставит нарезку в очередь. Само видео режется в фоне пайплайном."""
    from app.clipper import ClipError, parse_span
    from app.playbook import build_brief

    settings: Settings = request.app["settings"]
    queue: Queue = request.app["queue"]
    pipeline: Pipeline = request.app["pipeline"]
    body = await request.json()
    filename = str(body.get("filename", "")).strip()
    span_text = str(body.get("span", "")).strip()
    hook_text = str(body.get("hook", "")).strip()
    if not filename or not span_text:
        return web.json_response({"error": "нужны filename и span"}, status=400)
    try:
        span = parse_span(span_text)
    except ClipError as exc:
        return web.json_response({"error": str(exc)}, status=400)
    source = os.path.join(settings.sources_dir, filename)
    if not os.path.exists(source):
        return web.json_response({"error": f"нет исходника {filename}"}, status=404)

    brief = build_brief(os.path.splitext(filename)[0])
    caption = brief.caption
    if hook_text:
        _, _, tail = brief.caption.partition("\n\n")
        caption = f"{hook_text}\n\n{tail}"
    item_id = await queue.add(
        title=f"{filename} {span_text}",
        caption=caption,
        source_path=source,
        span=span_text,
        hook_text=hook_text,
    )
    item = await queue.get(item_id)
    assert item is not None
    import asyncio

    asyncio.create_task(pipeline.make_clip(item))
    problems = validate(duration_sec=span.duration_sec, hook_text=hook_text)
    return web.json_response({"id": item_id, "warnings": problems})


async def _accounts(request: web.Request) -> web.Response:
    settings: Settings = request.app["settings"]
    try:
        async with HiggsfieldClient(
            settings.higgsfield_api_key, settings.higgsfield_base_url
        ) as client:
            accounts = await client.tiktok_accounts()
    except HiggsfieldError as exc:
        return web.json_response({"error": str(exc)}, status=502)
    return web.json_response({"accounts": accounts})


def build_app(settings: Settings, queue: Queue, pipeline: Pipeline) -> web.Application:
    app = web.Application(middlewares=[_auth])
    app["settings"] = settings
    app["queue"] = queue
    app["pipeline"] = pipeline
    app.add_routes(
        [
            web.get("/health", _health),
            web.get("/queue/counts", _counts),
            web.get("/queue", _list),
            web.get("/items/{id}", _get_item),
            web.post("/items/{id}/approve", _approve),
            web.post("/items/{id}/reject", _reject),
            web.post("/items/{id}/publish", _publish),
            web.post("/items/{id}/caption", _caption),
            web.post("/hooks", _hooks),
            web.post("/clip", _clip),
            web.get("/accounts", _accounts),
        ]
    )
    return app


async def start_api(
    settings: Settings, queue: Queue, pipeline: Pipeline
) -> web.AppRunner | None:
    """Поднимает API рядом с ботом. Без токена молча не стартует — это
    осознанный выбор: телефон подключать нечем, а дырку наружу не открываем."""
    if not settings.hermes_api_token:
        log.info("HERMES_API_TOKEN не задан — HTTP-API для айфона выключен")
        return None
    app = build_app(settings, queue, pipeline)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, settings.hermes_api_host, settings.hermes_api_port)
    await site.start()
    log.info(
        "API для айфона слушает %s:%s",
        settings.hermes_api_host,
        settings.hermes_api_port,
    )
    return runner
