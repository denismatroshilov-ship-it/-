# Серия 4 — «Wealth Is What You Don't See»

«Богатство — это то, чего не видно» — четвёртая серия Mind & Money. Хронометраж 64.5 с,
десять планов, 1920x1080, 24 fps.

## О чём

Одна мысль, доведённая до конца: мы принимаем траты за богатство. Машина,
которую видно, — это доказательство того, что деньги ушли; богатство же —
ровно то, чего не видно, потому что оно и есть непотраченное. Отсюда
ловушка: научиться этому трудно, ведь копировать можно только видимое, а
видимое — всегда траты. Финал разворачивает мысль на зрителя: своё
богатство он тоже не видит.

Серия читается самостоятельно и не требует знания первых трёх.

## Планы

| # | Длит. | Кадр | Реплика |
| --- | --- | --- | --- |
| 1 | 7.0 с | 01 a car goes past | A car goes past, and something in you says: that person is rich. |
| 2 | 5.2 с | 02 you saw a car | But you didn't see money. You saw a car. |
| 3 | 8.4 с | 03 money that left | Money spent on a car is money that left. The car is proof of what's gone. |
| 4 | 6.6 с | 04 the purchase not made | Wealth is the other thing. The purchase not made. The upgrade skipped. |
| 5 | 6.6 с | 05 invisible by definition | It's invisible by definition — income you could have spent, and didn't. |
| 6 | 7.5 с | 06 we copy what we see | Which is why it's so hard to learn. We copy what we can see. |
| 7 | 4.3 с | 07 what we see is spending | And what we can see is spending. |
| 8 | 8.0 с | 08 none of it shows | The quiet account, the boring fund, the choice nobody posts — none of it shows. |
| 9 | 5.7 с | 09 the wrong model | So we model ourselves on the one thing wealth isn't. |
| 10 | 5.2 с | 10 including your own | Wealth is what you don't see. Including your own. |

Длительности пока рассчитаны от темпа чтения (≈2.15 слова в секунду плюс
пауза 0.45 с). Когда появится озвучка, `assemble.py`
пересчитает их по реальной длине реплик.

## Закадровый текст

### Английский (рабочий — под голос серии)

1. A car goes past, and something in you says: that person is rich.
2. But you didn't see money. You saw a car.
3. Money spent on a car is money that left. The car is proof of what's gone.
4. Wealth is the other thing. The purchase not made. The upgrade skipped.
5. It's invisible by definition — income you could have spent, and didn't.
6. Which is why it's so hard to learn. We copy what we can see.
7. And what we can see is spending.
8. The quiet account, the boring fund, the choice nobody posts — none of it shows.
9. So we model ourselves on the one thing wealth isn't.
10. Wealth is what you don't see. Including your own.

### Русский

1. Мимо проезжает машина, и что-то внутри говорит: вот этот человек богат.
2. Но ты увидел не деньги. Ты увидел машину.
3. Деньги, потраченные на машину, — это деньги, которые ушли. Машина и есть доказательство того, чего больше нет.
4. Богатство — это другое. Несделанная покупка. Пропущенный апгрейд.
5. Оно невидимо по определению: доход, который мог уйти, и не ушёл.
6. Поэтому этому так трудно научиться. Мы копируем то, что видно.
7. А видно — только траты.
8. Тихий счёт, скучный фонд, выбор, который никто не выкладывает, — ничего из этого не видно.
9. И мы равняемся ровно на то, чем богатство не является.
10. Богатство — это то, чего не видно. В том числе твоё.

## Голос

`альберт` (`7O2znNqD2IdXSYSrr6sb`), модель
`eleven_multilingual_v2`. Это голос сериала из воркспейса ElevenLabs, а не
подобранный заново, — иначе четвёртая серия зазвучит чужой.

## Кадры

Рисуются `draw_frames.py` из примитивов `series/style.py`. Каждый план —
одна метафора, композиция всегда одна и та же: фигура и предмет по разные
стороны кадра, линия земли снизу. Восьмой план — единственный, где линия
земли поднята: то, что закопано, иначе не влезает в кадр.

Пунктирный контур в кадрах 4, 5 и 8 означает одно и то же — то, чего нет
или чего не видно. Это единственный служебный приём серии, и он держится
последовательно.

## Движение

Каждый план — функция времени, а не картинка с наездом:

| # | Что движется |
| --- | --- |
| 1 | Машина въезжает справа и останавливается, следом всплывает мысль с монетами |
| 2 | В том же облаке вместо монет появляется машина — подмена, о которой реплика |
| 3 | Монеты по одной улетают из руки в машину и гаснут в ней |
| 4 | Кучка непотраченного растёт монета за монетой рядом с несделанной покупкой |
| 5 | Монеты падают в пунктирную ёмкость сверху |
| 6 | Левая фигура подтягивает руку к позе правой — копирование происходит на глазах |
| 7 | Лента в телефоне доезжает снизу: сначала машина, потом пакеты |
| 8 | Закопанное медленно проявляется — оно есть, но его не видно |
| 9 | Отражение машины въезжает в зеркало вместо фигуры |
| 10 | Тил-масса вырастает из линии земли за спиной |

Поверх всего — наезд на 2.5%, чередующийся по планам, чтобы монтаж дышал.
