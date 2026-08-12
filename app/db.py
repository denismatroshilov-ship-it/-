from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import StrEnum

import aiosqlite

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    video_url TEXT,
    tg_message_id INTEGER,
    tiktok_job_id TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
"""


class Status(StrEnum):
    NEW = "new"                # добавлено, видео ещё не сгенерировано
    GENERATING = "generating"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"      # ждёт своего слота в расписании
    PUBLISHING = "publishing"
    PUBLISHED = "published"
    REJECTED = "rejected"
    FAILED = "failed"


@dataclass(slots=True)
class Item:
    id: int
    prompt: str
    caption: str
    status: Status
    video_url: str | None
    tg_message_id: int | None
    tiktok_job_id: str | None
    error: str | None

    @classmethod
    def from_row(cls, row: aiosqlite.Row) -> "Item":
        return cls(
            id=row["id"],
            prompt=row["prompt"],
            caption=row["caption"],
            status=Status(row["status"]),
            video_url=row["video_url"],
            tg_message_id=row["tg_message_id"],
            tiktok_job_id=row["tiktok_job_id"],
            error=row["error"],
        )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Queue:
    """Очередь роликов. Одна запись = один ролик, который проходит путь
    new → generating → awaiting_approval → approved → publishing → published."""

    def __init__(self, path: str) -> None:
        self._path = path

    async def init(self) -> None:
        directory = os.path.dirname(os.path.abspath(self._path))
        os.makedirs(directory, exist_ok=True)
        async with self._connect() as db:
            await db.executescript(SCHEMA)
            await db.commit()

    @asynccontextmanager
    async def _connect(self) -> AsyncIterator[aiosqlite.Connection]:
        async with aiosqlite.connect(self._path) as conn:
            conn.row_factory = aiosqlite.Row
            yield conn

    async def add(self, prompt: str, caption: str = "") -> int:
        async with self._connect() as db:
            cursor = await db.execute(
                "INSERT INTO items (prompt, caption, status, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?)",
                (prompt, caption, Status.NEW, _now(), _now()),
            )
            await db.commit()
            return int(cursor.lastrowid)

    async def get(self, item_id: int) -> Item | None:
        async with self._connect() as db:
            async with db.execute("SELECT * FROM items WHERE id = ?", (item_id,)) as cur:
                row = await cur.fetchone()
        return Item.from_row(row) if row else None

    async def list_by_status(self, status: Status, limit: int = 50) -> list[Item]:
        async with self._connect() as db:
            async with db.execute(
                "SELECT * FROM items WHERE status = ? ORDER BY id LIMIT ?",
                (status, limit),
            ) as cur:
                rows = await cur.fetchall()
        return [Item.from_row(row) for row in rows]

    async def counts(self) -> dict[str, int]:
        async with self._connect() as db:
            async with db.execute(
                "SELECT status, COUNT(*) AS n FROM items GROUP BY status"
            ) as cur:
                rows = await cur.fetchall()
        return {row["status"]: row["n"] for row in rows}

    async def update(self, item_id: int, **fields: object) -> None:
        if not fields:
            return
        allowed = {
            "prompt",
            "caption",
            "status",
            "video_url",
            "tg_message_id",
            "tiktok_job_id",
            "error",
        }
        unknown = set(fields) - allowed
        if unknown:
            raise ValueError(f"unknown columns: {sorted(unknown)}")
        assignments = ", ".join(f"{name} = ?" for name in fields)
        values = [*fields.values(), _now(), item_id]
        async with self._connect() as db:
            await db.execute(
                f"UPDATE items SET {assignments}, updated_at = ? WHERE id = ?", values
            )
            await db.commit()

    async def claim_for_publishing(self, limit: int) -> list[Item]:
        """Атомарно забирает до `limit` одобренных роликов, помечая их publishing,
        чтобы параллельный тик планировщика не взял их повторно."""
        async with self._connect() as db:
            await db.execute("BEGIN IMMEDIATE")
            async with db.execute(
                "SELECT * FROM items WHERE status = ? ORDER BY id LIMIT ?",
                (Status.APPROVED, limit),
            ) as cur:
                rows = await cur.fetchall()
            items = [Item.from_row(row) for row in rows]
            if items:
                await db.executemany(
                    "UPDATE items SET status = ?, updated_at = ? WHERE id = ?",
                    [(Status.PUBLISHING, _now(), item.id) for item in items],
                )
            await db.commit()
        return items
