/* Предметы, рецепты и дерево технологий.

   Вынесено отдельно от логики: это таблица баланса, её правят чаще всего.
   Цифры взяты из Rust и сжаты по времени — сутки здесь 8 минут, а не час,
   поэтому плавка и крафт быстрее, а соотношения цен сохранены. */
const Items = (() => {
  "use strict";

  // ── Всё, что лежит в рюкзаке ────────────────────────────────────────────
  const RES = {
    wood: { name: "дерево", icon: "🪵" },
    stone: { name: "камень", icon: "🪨" },
    metalOre: { name: "мет. руда", icon: "⛰️" },
    metal: { name: "металл", icon: "🔩" },
    sulfurOre: { name: "серная руда", icon: "🟡" },
    sulfur: { name: "сера", icon: "🟨" },
    hqmOre: { name: "руда ВКМ", icon: "🔷" },
    hqm: { name: "ВКМ", icon: "🔹" },
    coal: { name: "уголь", icon: "⚫" },
    gunpowder: { name: "порох", icon: "🧨" },
    scrap: { name: "лом", icon: "⚙️" },
    cloth: { name: "ткань", icon: "🧵" },
    leather: { name: "кожа", icon: "🟫" },
    meat: { name: "сырое мясо", icon: "🥩" },
    cooked: { name: "жареное мясо", icon: "🍖" },
    berries: { name: "ягоды", icon: "🫐" },
    arrows: { name: "стрелы", icon: "🏹" },
    // Компоненты — их не крафтят, их находят и перерабатывают.
    gears: { name: "шестерни", icon: "⚙️", comp: true, scrap: 10 },
    pipes: { name: "трубы", icon: "🧯", comp: true, scrap: 12 },
    springs: { name: "пружины", icon: "🌀", comp: true, scrap: 15 },
    sheetMetal: { name: "листовой металл", icon: "🛡️", comp: true, scrap: 20 },
    rope: { name: "верёвка", icon: "🪢", comp: true, scrap: 8 },
  };

  // Что даёт переработчик за компонент (лом + материалы).
  const RECYCLE = {
    gears: { scrap: 10, metal: 25 },
    pipes: { scrap: 12, metal: 15 },
    springs: { scrap: 15, metal: 35 },
    sheetMetal: { scrap: 20, metal: 60 },
    rope: { scrap: 8, cloth: 20 },
  };

  // ── Плавка: что во что и за сколько секунд ──────────────────────────────
  const SMELT = {
    metalOre: { out: "metal", amount: 1, time: 0.35 },
    sulfurOre: { out: "sulfur", amount: 1, time: 0.35 },
    hqmOre: { out: "hqm", amount: 1, time: 1.2 },
    wood: { out: "coal", amount: 1, time: 0.25, ratio: 3 },   // 3 дерева → 1 уголь
  };

  /* Рецепты.
     wb — нужный уровень верстака (0 = руками)
     bp — нужен ли чертёж (изучить в дереве технологий или на столе)
     kind — tool: попадает в руки, deploy: ставится в мир, give: в рюкзак */
  const RECIPES = [
    // ── Руками ──
    { id: "axe", tab: "tools", wb: 0, icon: "🪓", name: "Каменный топор", note: "Дерево втрое быстрее", cost: { wood: 80, stone: 40 }, kind: "tool", tool: "axe" },
    { id: "pick", tab: "tools", wb: 0, icon: "⛏️", name: "Каменная кирка", note: "Камень, руда, сера", cost: { wood: 80, stone: 50 }, kind: "tool", tool: "pick" },
    { id: "spear", tab: "tools", wb: 0, icon: "🔱", name: "Копьё", note: "Оружие первой ночи", cost: { wood: 60, stone: 20 }, kind: "tool", tool: "spear" },
    { id: "torch", tab: "tools", wb: 0, icon: "🔥", name: "Факел", note: "Свет и немного тепла", cost: { wood: 15, cloth: 5 }, kind: "tool", tool: "torch" },
    { id: "plan", tab: "tools", wb: 0, icon: "📐", name: "План стройки", note: "Открывает режим стройки", cost: { wood: 50 }, kind: "tool", tool: "plan" },
    { id: "hammer", tab: "tools", wb: 0, icon: "🔨", name: "Молоток", note: "Улучшает и чинит постройки", cost: { wood: 100, stone: 40 }, kind: "tool", tool: "hammer" },
    { id: "bow", tab: "tools", wb: 0, icon: "🏹", name: "Охотничий лук", note: "Бьёт на расстоянии", cost: { wood: 100, cloth: 20 }, kind: "tool", tool: "bow" },
    { id: "arrows", tab: "supply", wb: 0, icon: "🏹", name: "Стрелы ×10", note: "Боеприпас для лука", cost: { wood: 20, stone: 10 }, kind: "give", give: { arrows: 10 } },
    { id: "bandage", tab: "supply", wb: 0, icon: "🩹", name: "Бинт", note: "+30 здоровья, снимает кровь", cost: { cloth: 15 }, kind: "give", give: { bandage: 1 } },
    { id: "bag", tab: "build", wb: 0, icon: "🛏️", name: "Спальник", note: "Точка возрождения", cost: { cloth: 30 }, kind: "deploy", deploy: "bag" },
    { id: "campfire", tab: "build", wb: 0, icon: "🔥", name: "Костёр", note: "Жарит мясо, греет", cost: { wood: 100, stone: 30 }, kind: "deploy", deploy: "campfire" },

    // ── Верстак 1 ──
    { id: "furnace", tab: "build", wb: 0, icon: "🏭", name: "Печь", note: "Плавит руду и жжёт уголь", cost: { stone: 200, wood: 100 }, kind: "deploy", deploy: "furnace" },
    { id: "box", tab: "build", wb: 0, icon: "📦", name: "Деревянный ящик", note: "Хранилище на базе", cost: { wood: 120 }, kind: "deploy", deploy: "box" },
    { id: "wb1", tab: "build", wb: 0, icon: "🧰", name: "Верстак 1", note: "Открывает половину рецептов", cost: { wood: 500, scrap: 50, metal: 100 }, kind: "deploy", deploy: "wb1" },
    { id: "research", tab: "build", wb: 1, icon: "🔬", name: "Исследовательский стол", note: "Изучает найденное за лом", cost: { wood: 200, scrap: 75, metal: 75 }, kind: "deploy", deploy: "research" },
    { id: "tc", tab: "build", wb: 1, icon: "🗄️", name: "Шкаф инструментов", note: "Держит базу от распада", cost: { wood: 1000 }, kind: "deploy", deploy: "tc" },
    { id: "axeMetal", tab: "tools", wb: 1, bp: true, icon: "🪓", name: "Топор из металла", note: "Вдвое быстрее каменного", cost: { wood: 60, metal: 40, scrap: 20 }, kind: "tool", tool: "axeMetal" },
    { id: "pickMetal", tab: "tools", wb: 1, bp: true, icon: "⛏️", name: "Кирка из металла", note: "Вдвое быстрее каменной", cost: { wood: 60, metal: 50, scrap: 20 }, kind: "tool", tool: "pickMetal" },
    { id: "crossbow", tab: "tools", wb: 1, bp: true, icon: "🎯", name: "Арбалет", note: "Бьёт сильнее лука", cost: { wood: 200, metal: 75, rope: 1 }, kind: "tool", tool: "crossbow" },
    { id: "gunpowder", tab: "supply", wb: 1, bp: true, icon: "🧨", name: "Порох ×10", note: "Сера плюс уголь", cost: { sulfur: 20, coal: 30 }, kind: "give", give: { gunpowder: 10 } },
    { id: "largeBox", tab: "build", wb: 1, bp: true, icon: "🗃️", name: "Большой ящик", note: "Втрое вместительнее", cost: { wood: 250, metal: 50 }, kind: "deploy", deploy: "largeBox" },

    // ── Верстак 2 ──
    { id: "wb2", tab: "build", wb: 1, bp: true, icon: "🧰", name: "Верстак 2", note: "Оружие и броня", cost: { wood: 750, scrap: 500, metal: 250, hqm: 20 }, kind: "deploy", deploy: "wb2" },
    { id: "revolver", tab: "tools", wb: 2, bp: true, icon: "🔫", name: "Револьвер", note: "Первый настоящий ствол", cost: { metal: 125, scrap: 50, pipes: 1 }, kind: "tool", tool: "revolver" },
    { id: "pistolAmmo", tab: "supply", wb: 1, bp: true, icon: "🔸", name: "Патроны ×12", note: "Для револьвера", cost: { metal: 10, gunpowder: 10 }, kind: "give", give: { pistolAmmo: 12 } },
    { id: "furnaceLarge", tab: "build", wb: 2, bp: true, icon: "🏭", name: "Большая печь", note: "Плавит вчетверо быстрее", cost: { stone: 500, metal: 300, hqm: 25 }, kind: "deploy", deploy: "furnaceLarge" },
    { id: "armorHide", tab: "supply", wb: 1, bp: true, icon: "🧥", name: "Кожаная броня", note: "Немного держит удар и холод", cost: { leather: 30, cloth: 20 }, kind: "give", give: { armorHide: 1 } },

    // ── Верстак 3 ──
    { id: "wb3", tab: "build", wb: 2, bp: true, icon: "🧰", name: "Верстак 3", note: "Верхний тир", cost: { wood: 1250, scrap: 1000, metal: 500, hqm: 100 }, kind: "deploy", deploy: "wb3" },
    { id: "rifle", tab: "tools", wb: 3, bp: true, icon: "🔫", name: "Штурмовая винтовка", note: "Тот самый АК", cost: { metal: 200, hqm: 50, springs: 4, scrap: 200 }, kind: "tool", tool: "rifle" },
    { id: "rifleAmmo", tab: "supply", wb: 2, bp: true, icon: "🔹", name: "Винт. патроны ×15", note: "Для винтовки", cost: { metal: 15, gunpowder: 20 }, kind: "give", give: { rifleAmmo: 15 } },
    { id: "armorMetal", tab: "supply", wb: 2, bp: true, icon: "🛡️", name: "Металлическая броня", note: "Держит пулю и укус", cost: { metal: 100, sheetMetal: 2, leather: 20 }, kind: "give", give: { armorMetal: 1 } },
  ];

  const BY_ID = {};
  for (const r of RECIPES) BY_ID[r.id] = r;

  /* Дерево технологий: что за чем открывается и почём.
     Как в Rust — ветка растёт от верстака, цена в ломе. */
  const TECH = [
    { wb: 1, nodes: [
      { id: "axeMetal", scrap: 50 },
      { id: "pickMetal", scrap: 50, need: "axeMetal" },
      { id: "largeBox", scrap: 75 },
      { id: "armorHide", scrap: 75 },
      { id: "crossbow", scrap: 125, need: "axeMetal" },
      { id: "gunpowder", scrap: 125 },
      { id: "pistolAmmo", scrap: 125, need: "gunpowder" },
      { id: "wb2", scrap: 250, need: "pistolAmmo" },
    ] },
    { wb: 2, nodes: [
      { id: "furnaceLarge", scrap: 250 },
      { id: "revolver", scrap: 250, need: "pistolAmmo" },
      { id: "armorMetal", scrap: 500, need: "revolver" },
      { id: "rifleAmmo", scrap: 500, need: "revolver" },
      { id: "wb3", scrap: 500, need: "rifleAmmo" },
    ] },
    { wb: 3, nodes: [
      { id: "rifle", scrap: 1000, need: "rifleAmmo" },
    ] },
  ];

  // Что можно найти в ящиках монумента: чем опаснее зона, тем лучше лут.
  const LOOT = {
    barrel: [
      { k: "scrap", min: 3, max: 9 }, { k: "cloth", min: 2, max: 6 },
      { k: "metal", min: 10, max: 30, p: 0.5 }, { k: "pipes", min: 1, max: 1, p: 0.18 },
      { k: "gears", min: 1, max: 1, p: 0.15 }, { k: "rope", min: 1, max: 1, p: 0.2 },
    ],
    crate: [
      { k: "scrap", min: 8, max: 20 }, { k: "metal", min: 20, max: 60 },
      { k: "gears", min: 1, max: 2, p: 0.4 }, { k: "springs", min: 1, max: 1, p: 0.25 },
      { k: "sheetMetal", min: 1, max: 1, p: 0.2 }, { k: "gunpowder", min: 5, max: 15, p: 0.3 },
    ],
    military: [
      { k: "scrap", min: 25, max: 60 }, { k: "hqm", min: 2, max: 8, p: 0.5 },
      { k: "springs", min: 1, max: 3, p: 0.6 }, { k: "sheetMetal", min: 1, max: 2, p: 0.5 },
      { k: "gunpowder", min: 20, max: 50, p: 0.5 }, { k: "pistolAmmo", min: 10, max: 30, p: 0.4 },
    ],
  };

  function roll(table) {
    const out = {};
    for (const e of table) {
      if (e.p !== undefined && Math.random() > e.p) continue;
      out[e.k] = (out[e.k] || 0) + e.min + Math.floor(Math.random() * (e.max - e.min + 1));
    }
    return out;
  }

  return { RES, RECIPES, BY_ID, TECH, SMELT, RECYCLE, LOOT, roll };
})();
