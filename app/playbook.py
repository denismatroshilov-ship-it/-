"""Правила формата «нарезка сильного момента» — то, что решает, залетит ролик или нет.

Держим это кодом, а не заметкой в README: генератор сценария и валидатор
дёргают одни и те же цифры, поэтому правило нельзя случайно нарушить.

Источник цифр — разбор механики TikTok-хуков (август 2026), см. docs/trends.md.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

# Окно, за которое алгоритм решает судьбу ролика.
HOOK_WINDOW_SEC = 2.0
# В первые 5 секунд склейка/смена плана должна происходить не реже.
MAX_CUT_INTERVAL_SEC = 1.5
# Ниже этого удержание не набирается, выше — начинает сыпаться досмотр.
CLIP_MIN_SEC = 12
CLIP_MAX_SEC = 34
# Текст хука должен читаться за один взгляд.
HOOK_MAX_CHARS = 62


@dataclass(frozen=True, slots=True)
class Hook:
    """Архетип хука: шаблон текста на экране + почему он работает."""

    key: str
    name: str
    why: str
    templates: tuple[str, ...]
    # Что должно быть в кадре в момент хука, иначе текст не сработает.
    frame_requirement: str

    def render(self, subject: str) -> str:
        return random.choice(self.templates).format(subject=subject)


HOOKS: tuple[Hook, ...] = (
    Hook(
        key="open_loop",
        name="Незакрытая петля",
        why=(
            "Зритель не может свайпнуть, пока не узнает, чем кончится. "
            "Обещание развязки внутри ролика — самый устойчивый удержатель."
        ),
        templates=(
            "Он ещё не знает, что будет через 20 секунд",
            "Досмотри до момента, когда она обернётся",
            "Эта сцена ломается на 15-й секунде",
        ),
        frame_requirement="кадр до развязки, лицо героя крупно",
    ),
    Hook(
        key="debate",
        name="Спор",
        why=(
            "Несогласие — самый дешёвый комментарий. Комментарии тянут ролик "
            "в рекомендации сильнее лайков."
        ),
        templates=(
            "Лучшая сцена в кино. Переубеди меня",
            "{subject} — переоценённая сцена, и вот почему",
            "Такое сегодня уже не снимают",
        ),
        frame_requirement="самый узнаваемый кадр сцены, без спойлера концовки",
    ),
    Hook(
        key="detail",
        name="Деталь, которую не заметили",
        why=(
            "Даёт причину пересмотреть ролик — второй просмотр засчитывается "
            "алгоритмом и вытягивает средний watch time выше длины ролика."
        ),
        templates=(
            "Смотри на его руки",
            "97% не замечают, что происходит на фоне",
            "Здесь спрятан спойлер ко всему фильму",
        ),
        frame_requirement="в кадре должна быть видна сама деталь, крупный план",
    ),
    Hook(
        key="stakes",
        name="Ставка/контекст съёмок",
        why=(
            "Факт о производстве превращает пассивный просмотр в «ого» — "
            "это то, что репостят в личку."
        ),
        templates=(
            "Эту сцену снимали без каскадёров",
            "Эту реплику актёр придумал прямо на площадке",
            "Один дубль. Камера не выключалась",
        ),
        frame_requirement="самый физически впечатляющий момент сцены",
    ),
    Hook(
        key="question",
        name="Вопрос в лоб",
        why=(
            "Прямой вопрос собирает ответы в комментариях и удерживает до "
            "момента, когда герой делает выбор."
        ),
        templates=(
            "А ты бы смог так?",
            "Он прав или нет?",
            "Что бы ты выбрал на его месте?",
        ),
        frame_requirement="момент морального выбора героя",
    ),
)

HOOKS_BY_KEY = {hook.key: hook for hook in HOOKS}

# Подпись под роликом: воронка в Telegram. Ссылку — только в шапке профиля,
# в комментариях ссылки собирают ограничения охвата.
CTA_TEMPLATES: tuple[str, ...] = (
    "Разбор целиком — в тг, ссылка в шапке",
    "Название и вторая часть сцены — в тг (шапка профиля)",
    "Ещё 200 таких моментов — в тг, ссылка в профиле",
)

CAPTION_TEMPLATE = "{hook}\n\n{cta}\n{hashtags}"

BASE_HASHTAGS = ("#фильмы", "#кино", "#сцена", "#нарезкифильмов")


@dataclass(slots=True)
class Brief:
    """Сценарий одного ролика: что резать, что писать на экране, что в подписи."""

    title: str
    hook: Hook
    hook_text: str
    caption: str
    beats: list[str] = field(default_factory=list)

    def as_text(self) -> str:
        beats = "\n".join(f"  {i}. {beat}" for i, beat in enumerate(self.beats, 1))
        return (
            f"🎬 {self.title}\n"
            f"Хук: {self.hook.name} — {self.hook.why}\n"
            f"Текст на экране (0–2 c): «{self.hook_text}»\n"
            f"Кадр под хук: {self.hook.frame_requirement}\n"
            f"Раскадровка:\n{beats}\n\n"
            f"Подпись:\n{self.caption}"
        )


def build_brief(
    subject: str,
    *,
    hook_key: str | None = None,
    extra_hashtags: tuple[str, ...] = (),
) -> Brief:
    """Собирает сценарий под конкретную сцену. subject — фильм или сцена."""
    hook = HOOKS_BY_KEY[hook_key] if hook_key else random.choice(HOOKS)
    hook_text = hook.render(subject)
    if len(hook_text) > HOOK_MAX_CHARS:
        hook_text = hook_text[: HOOK_MAX_CHARS - 1].rstrip() + "…"
    hashtags = " ".join((*BASE_HASHTAGS, *extra_hashtags))
    caption = CAPTION_TEMPLATE.format(
        hook=hook_text, cta=random.choice(CTA_TEMPLATES), hashtags=hashtags
    )
    return Brief(
        title=subject,
        hook=hook,
        hook_text=hook_text,
        caption=caption,
        beats=[
            f"0.0–{HOOK_WINDOW_SEC:.1f} c — сразу самый сильный кадр сцены + текст хука. "
            "Никаких логотипов, титров и разгона.",
            f"{HOOK_WINDOW_SEC:.1f}–5.0 c — смена плана не реже "
            f"{MAX_CUT_INTERVAL_SEC} c: крупный план, реакция, деталь.",
            "5 c — развязка: то, что обещал хук. Не тянуть.",
            "Финал — кадр, который склеивается с началом: ролик уходит на второй круг.",
        ],
    )


def suggest_hooks(subject: str) -> list[Brief]:
    """По одному варианту каждого архетипа — чтобы было из чего выбрать."""
    return [build_brief(subject, hook_key=hook.key) for hook in HOOKS]


def validate(*, duration_sec: float, hook_text: str) -> list[str]:
    """Проверки перед публикацией. Пустой список — можно выкладывать."""
    problems: list[str] = []
    if duration_sec < CLIP_MIN_SEC:
        problems.append(
            f"ролик {duration_sec:.0f} c — короче {CLIP_MIN_SEC} c, "
            "удержание не успевает набраться"
        )
    if duration_sec > CLIP_MAX_SEC:
        problems.append(
            f"ролик {duration_sec:.0f} c — длиннее {CLIP_MAX_SEC} c, досмотр просядет"
        )
    if not hook_text.strip():
        problems.append("нет текста хука на первых секундах")
    elif len(hook_text) > HOOK_MAX_CHARS:
        problems.append(
            f"хук {len(hook_text)} символов — не читается за взгляд, "
            f"максимум {HOOK_MAX_CHARS}"
        )
    return problems
