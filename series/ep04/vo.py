"""Закадровый текст четвёртой серии — по реплике на план.

Темп и строй сняты с первых двух серий: второе лицо, короткие
утвердительные фразы, термины называются прямо, но с оговорками
(«can», «may», «one explanation rather than a settled account»),
без шуток и без нажима. Плотность речи ~2.75 слова в секунду.
"""

TITLE = "Why You Avoid Looking at Your Own Money"
TITLE_RU = "Почему ты не хочешь смотреть на свои деньги"

LINES = [
    "The message arrives while you are doing something else. Your bank, a card, "
    "a subscription you had forgotten about. You see the first line of it, and "
    "your thumb moves before you have finished reading.",
    "Nothing about your money changed in that second. The balance is exactly "
    "what it was a moment earlier. The only thing that changed is how much of "
    "it you know, and that changed for one person.",
    "You tell yourself you will look at it properly later, when there is time "
    "and a clearer head. For a lot of people, later stops being a plan and "
    "quietly turns into a habit.",
    "Most advice treats this as laziness or weak discipline, and then offers a "
    "spreadsheet. It usually is not laziness. Avoiding your own numbers is "
    "often something your mind does actively, and it does it to protect you.",
    "Researchers have described one version of this as the ostrich effect. "
    "People check their accounts less often during the periods when they "
    "expect the news to be bad, and more often when they expect it to be good.",
    "It was noticed first in investors who stopped logging in while markets "
    "were falling. The same avoidance can attach to a banking app, an unopened "
    "envelope, or a statement that stays face down on the table.",
    "The logic underneath is quiet and almost reasonable. If looking cannot "
    "change the number, then looking only adds the feeling, and the feeling is "
    "the part that actually hurts.",
    "So the mind begins to treat the information as though it were the event "
    "itself. Not knowing can feel a great deal like not losing, at least for "
    "the length of an afternoon.",
    "People do not avoid every kind of information equally. The pattern tends "
    "to be strongest around information that feels like it will say something "
    "about you, rather than merely about a situation.",
    "The difficulty is that the number keeps moving whether or not anyone is "
    "watching it. Attention is the only part of this that you switched off.",
    "Avoidance also pays immediately. The relief is instant, it is small, and "
    "at the moment you choose it, it appears to be completely free.",
    "The cost arrives later and in pieces, each one small enough that none of "
    "them feels like the consequence of a decision you made.",
    "A subscription renews for another year. A fee lands on an account nobody "
    "was watching. A payment date passes on a quiet Tuesday.",
    "None of that happened because the money was missing. It happened because "
    "the information was available and no one collected it.",
    "And by the time those pieces are visible, they usually arrive together, "
    "inside a single statement that appears to prove the exact thing you were "
    "afraid of in the first place.",
    "There is a second cost that is harder to see. When you stop checking, you "
    "do not stop carrying a number in your head.",
    "You simply replace the real one with an estimate. And the estimate is "
    "built by the part of you that is worried, which means it is almost always "
    "worse than the truth.",
    "Anxiety is a poor accountant. It rounds in the wrong direction, it counts "
    "the same worry twice, and it never files anything away as finished.",
    "It helps to notice that very little of this is about arithmetic. A balance "
    "is a fact, but it rarely arrives feeling like one. It arrives feeling like "
    "a report card with your name on it.",
    "So the longer the gap between one look and the next, the further the "
    "imagined number drifts from the real one.",
    "And the further it drifts, the more the next look feels like something "
    "you would need to prepare for, set aside an evening for, be ready for.",
    "That is the loop. Avoidance protects the feeling, the feeling grows in "
    "the dark, and the grown feeling makes the following look more expensive "
    "than the one you already skipped.",
    "Money stress may also narrow attention in ways that make all of this "
    "harder. Research on scarcity suggests that financial worry can occupy "
    "mental bandwidth that other decisions were relying on.",
    "That is one explanation rather than a settled account of every case, and "
    "it is worth holding lightly. It is offered here as a description, not a "
    "diagnosis.",
    "But it does point at something useful. If avoidance is a response to "
    "cost, then the way out is probably not more discipline. It is making the "
    "act of looking cost less.",
    "Start by separating two things that almost always arrive together. "
    "Looking is not the same as fixing, even though they usually turn up in "
    "the same ten minutes.",
    "Most people avoid opening the app because opening it feels like agreeing, "
    "in advance, to solve everything they might find inside it.",
    "So give looking a job of its own. A short scheduled check, with no "
    "decisions attached to it, and nothing that has to be repaired while you "
    "are in there.",
    "Make the first one small enough to be unimpressive. One account. Two "
    "minutes. A timer, if a timer is what lets you leave.",
    "The opposite habit is not the answer either. Checking constantly can become "
    "its own kind of anxiety, where the number is watched all day and somehow "
    "still never trusted.",
    "Put it somewhere in the week that can survive a bad week. The same day, "
    "the same time, ideally attached to something ordinary you already do "
    "without deciding.",
    "Write down what you actually saw. On paper, a number stops behaving like "
    "a verdict and goes back to being what it always was, which is "
    "information.",
    "Some of what you find will genuinely need action. That is a separate "
    "appointment with a separate feeling, and it is far easier to keep when it "
    "starts from a real number instead of an imagined one.",
    "After a few weeks of small checks, something quiet happens. The distance "
    "between the number you imagine and the number that is actually there stops "
    "being wide enough to frighten anyone.",
    "You are not behind because you have not been looking. You have been "
    "carrying an estimate assembled by worry rather than by arithmetic, and "
    "carrying it is heavier than checking it.",
    "That distance was the thing you were avoiding. Not the balance itself, but "
    "the space between what you knew and what you feared, which only ever grows "
    "while nobody measures it.",
    "Look once, briefly, on purpose. The number is usually smaller than the "
    "dread that has been standing in front of it.",
]

# короткие ярлыки планов — идут в имена файлов и в раскадровку
SLUGS = [
    "the_message_arrives", "nothing_changed_but_knowing", "later_becomes_a_habit",
    "not_laziness", "the_ostrich_effect", "face_down_statement",
    "looking_adds_the_feeling", "not_knowing_feels_like_not_losing", "not_all_information_equally",
    "the_number_keeps_moving", "relief_is_instant", "the_cost_arrives_in_pieces",
    "a_quiet_tuesday", "nobody_collected_it", "they_arrive_together",
    "you_still_carry_a_number", "the_estimate_is_worse", "anxiety_is_a_poor_accountant",
    "a_balance_arrives_as_a_report_card", "the_drift", "preparing_to_look",
    "the_loop", "scarcity_narrows_attention", "held_lightly",
    "make_looking_cheaper", "looking_is_not_fixing", "opening_feels_like_agreeing",
    "a_check_with_no_decisions", "make_it_small", "checking_constantly_is_not_it",
    "survive_a_bad_week", "write_down_what_you_saw", "a_separate_appointment",
    "the_gap_narrows", "an_estimate_built_by_worry", "the_gap_was_the_thing",
    "look_once_on_purpose",
]

assert len(LINES) == len(SLUGS), (len(LINES), len(SLUGS))
