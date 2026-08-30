"""Серия 4 Mind & Money: сценарий и промпты кадров.

Формат снят с третьей серии, а не придуман: третье лицо, сквозные Alex и
Brian, реплики внутри повествования, исследователи называются по фамилиям,
дисклеймер проговаривается вслух, финал — не команда, а вопрос, который
Alex задаёт себе сам. Плотность речи ~2.6 слова в секунду.

Прямая связка с третьей серией: там Alex положил в корзину куртку со
скидкой. Здесь приходит выписка, и в ней эта куртка.
"""

TITLE = "Why Alex Won't Open the Statement"
TITLE_RU = "Почему Alex не открывает выписку"

# Каждая сцена: slug, закадровый текст, промпт кадра.
# Промпты написаны под реальный стиль канала: мягкая рисованная линия,
# кремовый фон, приглушённый тил и охра, фигуры с руками и ногами,
# обжитая среда, тёплое свечение вокруг важного предмета.
STYLE = (
    "hand-drawn 2D illustration, soft irregular ink outline, warm off-white "
    "cream background #FBF7F1, muted palette of sage teal #51867E and warm "
    "ochre #D9A84C with white and soft grey, simple rounded characters with "
    "small oval heads, dot eyes, thin arms and legs, plain clothing, gentle "
    "flat shading, soft glow around the important object, calm explainer "
    "illustration, no text, no lettering, no logos, 16:9"
)

CAST = (
    "Alex is a slim young adult with a small round head, dot eyes, a soft "
    "smile, short hair, wearing a plain light sweater and trousers. Brian is "
    "the same drawing style, slightly taller, wearing a muted teal jumper. "
    "Both are consistent in every shot."
)

SCENES = [
    ("statement_arrives",
     "The statement arrives on a Tuesday morning, which is the least dramatic "
     "day it could have picked. Alex sees the first line of it, the total, and "
     "the app closes before he has decided to close it.",
     "Alex at a kitchen table in morning light, holding a phone, thumb already "
     "moving away from the screen, a faint ochre glow on the phone; a mug and "
     "an unopened envelope on the table beside him"),

    ("the_jacket_is_on_it",
     "He already knows one line that is in there. The jacket, the one that was "
     "on sale, the one that felt like a small private victory in the aisle. It "
     "has stopped being a story and become a number.",
     "close-up of the jacket from the previous episode hanging on a hook, the "
     "warm ochre glow that surrounded it now faded to grey, a small price tag "
     "hanging quietly from the sleeve"),

    ("brian_asks",
     "Brian, who is not a financial adviser and has never pretended to be, "
     "asks the obvious thing. You already bought it. The money has already "
     "gone. What is the danger in looking?",
     "Brian standing in a doorway with his hands in his pockets, looking at "
     "Alex who sits with the phone face down on the table between them"),

    ("alex_has_no_answer",
     "Alex does not have a good answer, and that is the interesting part. He is "
     "not avoiding a decision. There is no decision left. He is avoiding a "
     "fact that has already happened.",
     "Alex shrugging with both palms up, a soft dashed circle drawn around the "
     "face-down phone on the table, teal accent"),

    ("the_ostrich_effect",
     "Researchers have a name for one version of this. Karlsson, Loewenstein "
     "and Seppi called it the ostrich effect, after noticing that people check "
     "their accounts less often in the periods when they expect the news to be "
     "bad, and more often when they expect it to be good.",
     "a small character peering at a rising teal line chart on a wall, and "
     "beside it the same character turned away from a falling chart, hands "
     "behind the back"),

    ("not_only_portfolios",
     "It was first noticed in investors watching a falling market. But the same "
     "behaviour attaches easily to a banking app, an unopened envelope on a "
     "counter, or a statement left face down for three days.",
     "a kitchen counter in the same house, one envelope propped against a jar, "
     "a second envelope behind it, a phone lying screen-down, everything "
     "quietly waiting"),

    ("looking_only_adds_feeling",
     "The logic underneath is almost reasonable, which is why it works so well. "
     "If looking cannot change the number, then looking only adds the feeling, "
     "and the feeling is the part that actually costs something.",
     "Alex reaching toward the phone while a soft grey cloud forms above his "
     "head, the cloud drawn with a light dashed outline"),

    ("information_as_the_event",
     "So the mind begins to treat the information as though it were the event. "
     "Golman, Hagmann and Loewenstein grouped behaviours like this under "
     "information avoidance: not knowing can feel a great deal like not losing.",
     "a soft grey blanket draped over a glowing object, only the glow leaking "
     "out at the edges, the shape underneath unreadable"),

    ("it_keeps_moving",
     "The difficulty is that the number keeps moving whether or not anyone is "
     "watching it. Attention was the only thing Alex switched off.",
     "the same covered object, but now small ochre particles drift out from "
     "under the blanket and settle on the floor around it"),

    ("relief_is_free",
     "And avoidance pays immediately. The relief arrives the moment he puts the "
     "phone down, it is small, and at the moment he chooses it, it appears to "
     "cost nothing at all.",
     "Alex leaning back with his shoulders dropping, a small teal glow around "
     "him, the phone face down and pushed slightly away"),

    ("the_cost_in_pieces",
     "The cost arrives later and in pieces, each one small enough that none of "
     "them feels like the result of a decision. A subscription renews for "
     "another year. A fee lands on an account nobody was watching.",
     "small ochre coins falling one by one through a gap in a floorboard, each "
     "too small to notice, a calendar page on the wall behind"),

    ("nobody_collected_it",
     "None of that happened because the money was missing. It happened because "
     "the information was sitting there and nobody collected it.",
     "an envelope lying alone on a wide empty floor, a long soft shadow, no "
     "character in the frame"),

    ("brian_asks_the_number",
     "Brian tries something else. He does not ask Alex to open the app. He asks "
     "what number Alex is carrying right now, without looking. Alex thinks, and "
     "gives a figure.",
     "Brian sitting across the table, one hand open in a question; above Alex a "
     "thought bubble containing a blurry, wobbling shape instead of a clear "
     "number, drawn with a shaky dashed outline"),

    ("the_estimate_is_worse",
     "Then he opens it. The real figure is not good news, exactly. But it is "
     "smaller than the one he had been carrying, and he had been carrying it "
     "for eleven days.",
     "two shapes side by side: a large wobbly dashed shape in grey and a "
     "smaller solid teal shape, the smaller one clearly less than half the "
     "size of the larger"),

    ("anxiety_is_a_poor_accountant",
     "This is not unusual. Anxiety is a poor accountant. It rounds in the wrong "
     "direction, it counts the same worry twice, and it never files anything "
     "away as finished.",
     "a small character at a desk covered in loose papers, the same mark "
     "written many times over on different sheets, papers spilling onto the "
     "floor"),

    ("the_drift",
     "So the longer the gap between one look and the next, the further the "
     "imagined number drifts from the real one. And the further it drifts, the "
     "more the next look feels like something you would need to prepare for.",
     "two shapes drawn far apart with a long dashed measuring line between "
     "them, one solid teal and small, one grey and large"),

    ("the_loop",
     "That is the loop. Avoidance protects the feeling, the feeling grows in "
     "the dark, and the grown feeling makes the following look more expensive "
     "than the one that was already skipped.",
     "a circular dashed arrow connecting three small vignettes: a face-down "
     "phone, a growing grey cloud, and a hand hesitating over a door handle"),

    ("scarcity_note",
     "There is one more thing worth naming carefully. Mani, Mullainathan, "
     "Shafir and Zhao found that money worry can occupy mental bandwidth that "
     "other decisions were relying on.",
     "a character walking down a corridor that narrows toward him, the walls "
     "soft teal, everything outside the corridor drawn faintly"),

    ("held_lightly",
     "That is one explanation, not a verdict on any particular person, and this "
     "episode is not psychological advice. It is offered as a description, and "
     "it is worth holding lightly.",
     "an open palm holding a small soft teal sphere lightly, not gripping it, "
     "gentle glow around the sphere"),

    ("make_looking_cheaper",
     "But it does point somewhere useful. If avoidance is a response to cost, "
     "then the way out is probably not more discipline. It is making the act of "
     "looking cost less.",
     "a very large heavy door shown beside a small ordinary window in the same "
     "wall, a character stepping easily toward the window"),

    ("looking_is_not_fixing",
     "Brian puts it plainly. Looking is not the same as fixing. They usually "
     "arrive in the same ten minutes, which is why the whole thing feels heavy.",
     "two separate framed panels side by side with a clear gap between them: "
     "in one an eye, in the other a small toolbox, the gap emphasised"),

    ("opening_feels_like_agreeing",
     "Most people avoid opening the app because opening it feels like agreeing, "
     "in advance, to solve everything they might find inside it.",
     "a character standing in front of a door that is slightly ajar, behind it "
     "a tall stack of envelopes leaning outward, warm light spilling through"),

    ("a_check_with_no_decisions",
     "So Alex gives looking a job of its own. A short scheduled check, with no "
     "decisions attached to it, and nothing that has to be repaired while he is "
     "in there.",
     "Alex sitting calmly with the phone, a small teal timer beside him, "
     "nothing else on the table, plenty of empty space"),

    ("make_it_small",
     "Small enough to be unimpressive. One account. Two minutes. A timer, if a "
     "timer is what lets him leave.",
     "close-up of a small round timer showing a short interval, a single "
     "account card beside it, soft ochre glow"),

    ("survive_a_bad_week",
     "And placed somewhere in the week that can survive a bad week. The same "
     "day, the same time, attached to something ordinary he already does "
     "without deciding.",
     "a wall calendar with one repeating small ochre mark in the same column "
     "each row, a coffee mug on the shelf beneath it"),

    ("write_it_down",
     "He writes down what he actually saw. On paper, a number stops behaving "
     "like a verdict and goes back to being what it always was, which is "
     "information.",
     "a hand writing a short line in a small notebook, the wobbly grey shape "
     "from earlier dissolving into neat calm marks on the page"),

    ("not_the_opposite",
     "The opposite habit is not the answer either. Checking constantly can "
     "become its own kind of anxiety, where the number is watched all day and "
     "somehow still never trusted.",
     "a character surrounded by many small clock faces at different angles, "
     "looking tired, the clocks drawn lightly in grey"),

    ("a_separate_appointment",
     "Some of what he finds will genuinely need action. That is a separate "
     "appointment with a separate feeling, and it is far easier to keep when it "
     "starts from a real number instead of an imagined one.",
     "the same calendar, now with a second mark in a different colour, teal "
     "beside ochre, a small arrow between them"),

    ("the_gap_narrows",
     "After a few weeks, something quiet happens. The distance between the "
     "number Alex imagines and the number that is there stops being wide enough "
     "to frighten anyone.",
     "the two shapes from earlier now close together and almost the same size, "
     "both drawn with calm solid outlines"),

    ("the_gap_was_the_thing",
     "That distance was the thing he was avoiding. Not the balance. The space "
     "between what he knew and what he feared, which only ever grows while "
     "nobody measures it.",
     "the short remaining gap between the two shapes highlighted with a small "
     "soft ochre band, everything else quiet"),

    ("the_jacket_again",
     "The jacket is still in the wardrobe. It is still a jacket. The difference "
     "is that Alex now knows what it cost, and knowing turned out to be lighter "
     "than not knowing.",
     "the jacket hanging in an open wardrobe, drawn plainly with no glow at "
     "all, Alex passing by without stopping"),

    ("brian_does_not_tell_him",
     "Brian does not tell him whether the jacket was worth it. That is not the "
     "point, and it never was. The useful part is not a rule. It is the pause "
     "before the thumb moves.",
     "Brian and Alex walking side by side, neither looking at a phone, a wide "
     "calm background with a soft teal horizon"),

    ("look_once_on_purpose",
     "Look once, briefly, on purpose. Not to fix anything, and not to be good "
     "at money. Just to close the distance between what is true and what you "
     "have been carrying instead.",
     "Alex alone, looking calmly at a phone held in both hands, a small warm "
     "glow on the screen, the grey cloud from earlier now small and fading "
     "behind him"),

    ("closing",
     "The number is usually smaller than the dread that has been standing in "
     "front of it. And the dread is the only part of it you were paying for "
     "twice.",
     "wide final shot: a quiet room, the phone face up on the table, the "
     "envelope open beside it, morning light, no character in frame"),
]

assert all(len(s) == 3 for s in SCENES)
