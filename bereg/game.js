/* «Голый берег» — выживание на острове: собрать, скрафтить, построить, дожить
   до утра. Всё считается на телефоне, сеть не нужна нигде и никогда.

   Баланс собран сверху одним блоком: цены крафта, урон инструментов, скорость
   голода и жажды. Менять игру нужно там, а не по коду. */
const Game = (() => {
  "use strict";

  // ── Баланс ──────────────────────────────────────────────────────────────
  const DAY_LEN = 480;              // секунд на полные сутки
  const NIGHT_FROM = 0.70;          // доля суток, с которой начинается ночь
  const DRAIN = { hunger: 100 / 720, thirst: 100 / 540 };
  const REGEN = 0.35;               // хп/с, если сыт и не хочет пить
  const STARVE = 0.45, DEHYDRATE = 0.8, COLD = 0.22;
  const REACH = 4.2;                // метров до цели при ударе
  const PLAYER_R = 0.45;

  const TOOLS = {
    rock: { name: "Камень", icon: "🪨", dmg: { tree: 8, stone: 10, ore: 6, soft: 12, flesh: 10 }, rate: 0.55 },
    axe: { name: "Каменный топор", icon: "🪓", dmg: { tree: 26, stone: 8, ore: 5, soft: 18, flesh: 22 }, rate: 0.5 },
    axeMetal: { name: "Топор из металла", icon: "🪓", dmg: { tree: 48, stone: 12, ore: 8, soft: 26, flesh: 32 }, rate: 0.45 },
    pick: { name: "Каменная кирка", icon: "⛏️", dmg: { tree: 8, stone: 26, ore: 24, soft: 16, flesh: 20 }, rate: 0.5 },
    pickMetal: { name: "Кирка из металла", icon: "⛏️", dmg: { tree: 12, stone: 48, ore: 46, soft: 22, flesh: 28 }, rate: 0.45 },
    spear: { name: "Копьё", icon: "🔱", dmg: { tree: 9, stone: 6, ore: 4, soft: 20, flesh: 38 }, rate: 0.7 },
    bow: { name: "Лук", icon: "🏹", dmg: { flesh: 42 }, rate: 0.9, ranged: true },
    torch: { name: "Факел", icon: "🔥", dmg: { tree: 5, stone: 4, ore: 3, soft: 8, flesh: 12 }, rate: 0.6, light: true },
    plan: { name: "План стройки", icon: "📐", dmg: {}, rate: 0.5, build: true },
  };

  const RES = {
    wood: "дерево", stone: "камень", ore: "руда", metal: "металл", scrap: "лом",
    cloth: "ткань", berries: "ягоды", meat: "сырое мясо", cooked: "жареное мясо", arrows: "стрелы",
  };

  const RECIPES = [
    { id: "axe", tab: "tools", icon: "🪓", name: "Каменный топор", note: "Дерево валится втрое быстрее", cost: { wood: 80, stone: 40 }, tool: "axe" },
    { id: "pick", tab: "tools", icon: "⛏️", name: "Каменная кирка", note: "Камень и руда", cost: { wood: 80, stone: 50 }, tool: "pick" },
    { id: "spear", tab: "tools", icon: "🔱", name: "Копьё", note: "Главное оружие первой ночи", cost: { wood: 60, stone: 20 }, tool: "spear" },
    { id: "bow", tab: "tools", icon: "🏹", name: "Лук", note: "Бьёт на расстоянии, нужны стрелы", cost: { wood: 100, cloth: 20 }, tool: "bow" },
    { id: "torch", tab: "tools", icon: "🔥", name: "Факел", note: "Свет ночью и немного тепла", cost: { wood: 15, cloth: 5 }, tool: "torch" },
    { id: "plan", tab: "tools", icon: "📐", name: "План стройки", note: "Открывает режим стройки", cost: { wood: 50 }, tool: "plan" },
    { id: "axeMetal", tab: "tools", icon: "🪓", name: "Топор из металла", note: "Вдвое быстрее каменного", cost: { wood: 60, metal: 40, scrap: 20 }, tool: "axeMetal" },
    { id: "pickMetal", tab: "tools", icon: "⛏️", name: "Кирка из металла", note: "Вдвое быстрее каменной", cost: { wood: 60, metal: 50, scrap: 20 }, tool: "pickMetal" },
    { id: "arrows", tab: "supply", icon: "🏹", name: "Стрелы ×10", note: "Боеприпас для лука", cost: { wood: 20, stone: 10 }, give: { arrows: 10 } },
    { id: "bandage", tab: "supply", icon: "🩹", name: "Бинт", note: "Сразу +30 здоровья", cost: { cloth: 15 }, give: { bandage: 1 } },
    { id: "cook", tab: "supply", icon: "🍖", name: "Пожарить мясо", note: "Только у горящего костра", cost: { meat: 1 }, give: { cooked: 1 }, needFire: true },
    { id: "smelt", tab: "supply", icon: "🔩", name: "Переплавить руду ×3", note: "Только у горящего костра", cost: { ore: 3 }, give: { metal: 2 }, needFire: true },
  ];

  const BUILD = [
    { id: "foundation", short: "ФУНД", name: "Фундамент", cost: { wood: 100 } },
    { id: "wall", short: "СТЕНА", name: "Стена", cost: { wood: 80 } },
    { id: "doorway", short: "ПРОЁМ", name: "Дверной проём", cost: { wood: 100 } },
    { id: "door", short: "ДВЕРЬ", name: "Дверь", cost: { wood: 60 } },
    { id: "ceiling", short: "ПОТОЛ", name: "Потолок", cost: { wood: 80 } },
    { id: "campfire", short: "КОСТЁР", name: "Костёр", cost: { wood: 100, stone: 30 } },
    { id: "bag", short: "СПАЛЬН", name: "Спальник", cost: { cloth: 30 } },
    { id: "upgrade", short: "УЛУЧШ", name: "Улучшить до камня", cost: { stone: 150 } },
  ];

  const SAVE_KEY = "bereg.save.v1";

  // ── Состояние ───────────────────────────────────────────────────────────
  const P = {
    x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0,
    hp: 100, hunger: 100, thirst: 100,
    onGround: true, inWater: false,
    slot: 0, swing: 0, alive: true,
    tools: { rock: true }, inv: {}, bandage: 0,
    day: 1, time: 0.22, deaths: 0, bestDay: 1,
  };

  const state = {
    mode: "menu",          // menu | play | dead
    fires: [], bags: [], loots: [], animals: [], raiders: [], arrows: [],
    running: false, lastSave: 0, aimTarget: null, buildIdx: 0, buildOK: false,
    ghost: null, toastId: 0, night: 0, raidWave: 0, spawnedNight: -1,
  };

  let batches = {}, M = {}, terrain = null, canvas = null;

  // ── Звук ────────────────────────────────────────────────────────────────
  const Snd = {
    ctx: null, on: true,
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    },
    blip(freq, dur, type, vol, slide) {
      const ctx = this.ensure();
      if (!ctx || !this.on) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || "triangle";
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol, cutoff) {
      const ctx = this.ensure();
      if (!ctx || !this.on) return;
      const n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = cutoff || 900;
      const g = ctx.createGain();
      g.gain.value = vol || 0.2;
      src.connect(f).connect(g).connect(ctx.destination);
      src.start();
    },
    chop() { this.noise(0.18, 0.25, 700); this.blip(180, 0.1, "sine", 0.08, 90); },
    stone() { this.noise(0.14, 0.22, 2400); },
    hit() { this.blip(320, 0.1, "square", 0.1, 160); },
    hurt() { this.blip(160, 0.28, "sawtooth", 0.16, 60); },
    craft() { this.blip(520, 0.09, "square", 0.1); setTimeout(() => this.blip(780, 0.12, "square", 0.09), 90); },
    eat() { this.blip(380, 0.12, "sine", 0.1, 520); },
    bow() { this.noise(0.12, 0.16, 3000); this.blip(700, 0.12, "sine", 0.06, 300); },
    howl() { this.blip(280, 1.1, "sine", 0.07, 160); },
  };

  // ── Мелочи ──────────────────────────────────────────────────────────────
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const $ = (id) => document.getElementById(id);
  const inv = (k) => P.inv[k] || 0;
  const addInv = (k, n) => { P.inv[k] = Math.max(0, inv(k) + n); };

  function toast(text, bad) {
    const wrap = $("toasts");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "toast" + (bad ? " bad" : "");
    el.textContent = text;
    wrap.appendChild(el);
    if (wrap.children.length > 4) wrap.removeChild(wrap.firstChild);
    setTimeout(() => el.remove(), 2700);
  }

  function canPay(cost) {
    for (const k in cost) if (inv(k) < cost[k]) return false;
    return true;
  }
  function pay(cost) {
    for (const k in cost) addInv(k, -cost[k]);
  }
  function costText(cost) {
    return Object.keys(cost).map((k) => `${cost[k]} ${RES[k] || k}`).join(" · ");
  }

  // ── Мир и сцена ─────────────────────────────────────────────────────────
  function buildScene() {
    M = World.makeMeshes();
    terrain = { mesh: World.terrainMesh() };
    batches = {};
    const mk = (name, mesh, max) => (batches[name] = new GL.Batch(mesh, max));

    batches.terrain = new GL.Batch(terrain.mesh, 1);
    batches.terrain.add(0, 0, 0, 1, 1, 0, 1, 1, 1, 0);
    mk("water", M.water, 1);
    batches.water.add(0, World.WATER, 0, 1, 1, 0, 1, 1, 1, 0);

    for (const k of ["pine", "oak", "rock", "ore", "bush", "hemp", "barrel", "crate"]) {
      mk(k, M[k] || M.bush, 460);
    }
    mk("ruin", M.ruin, 24);
    mk("antenna", M.antenna, 2);
    mk("spring", M.spring, 12);
    mk("foundation", M.foundation, 220);
    mk("wall", M.wall, 260);
    mk("doorway", M.doorway, 60);
    mk("door", M.door, 60);
    mk("ceiling", M.ceiling, 220);
    mk("fireBase", M.fireBase, 24);
    mk("flame", M.flame, 24);
    mk("bag", M.bag, 12);
    mk("loot", M.loot, 40);
    mk("deer", M.deer, 24);
    mk("wolf", M.wolf, 24);
    mk("raider", M.raider, 24);
    mk("arrowMesh", M.arrow, 40);
  }

  function placeStatics() {
    for (const k of ["pine", "oak", "rock", "ore", "bush", "hemp", "barrel", "crate"]) batches[k].clear();
    batches.ruin.clear(); batches.antenna.clear();
    for (const n of World.nodes) {
      const def = World.NODE_DEFS[n.type];
      const b = batches[def.mesh];
      if (!b) continue;
      n.idx = b.add(n.x, n.y, n.z, n.scale, n.scale, n.rot, n.tint, n.tint, n.tint, def.mesh === "pine" || def.mesh === "oak" || def.mesh === "hemp" ? 1 : 0);
      if (!n.alive) b.hide(n.idx);
    }
    for (const p of World.props) {
      const b = batches[p.mesh];
      if (b) b.add(p.x, p.y, p.z, p.scale, p.scale, p.rot, 1, 1, 1, 0);
    }
    batches.spring.clear();
    for (const s of World.springs) batches.spring.add(s.x, s.y + 0.05, s.z, 1, 1, 0, 1, 1, 1, 0);
  }

  function rebuildPieces() {
    for (const k of ["foundation", "wall", "doorway", "door", "ceiling"]) batches[k].clear();
    for (const p of World.pieces) {
      const w = World.pieceWorld(p);
      const tint = p.tier === "stone" ? 0.62 : 1;
      const grey = p.tier === "stone" ? [0.72, 0.74, 0.72] : [1, 0.98, 0.95];
      const hurt = clamp(p.hp / p.maxHp, 0.35, 1);
      const rot = p.kind === "door" ? w.rot + (p.open ? Math.PI / 2 : 0) : w.rot;
      let x = w.x, z = w.z;
      if (p.kind === "door") {
        // Дверь висит на петле: сдвигаем к краю проёма, чтобы открывалась вбок.
        const dx = Math.cos(w.rot + Math.PI / 2) * 0.72, dz = Math.sin(w.rot + Math.PI / 2) * 0.72;
        x -= dx; z -= dz;
      }
      batches[p.kind].add(x, w.y, z, 1, 1, rot,
        grey[0] * tint * hurt, grey[1] * tint * hurt, grey[2] * tint * hurt, 0);
    }
  }

  // ── Существа ────────────────────────────────────────────────────────────
  function spawnAnimals(rng) {
    state.animals.length = 0;
    const put = (kind, n) => {
      for (let i = 0; i < n; i++) {
        for (let att = 0; att < 200; att++) {
          const x = (rng() - 0.5) * World.SIZE * 0.8, z = (rng() - 0.5) * World.SIZE * 0.8;
          const y = World.height(x, z);
          if (y < 1.5) continue;
          state.animals.push({
            kind, x, y, z, hp: kind === "deer" ? 70 : 90, max: kind === "deer" ? 70 : 90,
            dir: rng() * 6.28, t: rng() * 5, attack: 0, state: "idle",
          });
          break;
        }
      }
    };
    put("deer", 9);
    put("wolf", 4);
  }

  function spawnRaiders(count) {
    const r = World.ruins;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.28, d = 6 + Math.random() * 10;
      const x = r.x + Math.cos(a) * d, z = r.z + Math.sin(a) * d;
      state.raiders.push({
        x, y: World.height(x, z), z, hp: 110, max: 110, attack: 0,
        target: null, t: 0, hitPiece: null,
      });
    }
    toast(`Мародёры вышли к антенне: ${count}`, true);
    Snd.howl();
  }

  // ── Запуск ──────────────────────────────────────────────────────────────
  function newGame(seed) {
    const s = seed || ((Math.random() * 1e9) | 0);
    World.generate(s);
    placeStatics();
    rebuildPieces();
    const rng = World.mulberry32(s ^ 0x5bf03635);
    spawnAnimals(rng);
    state.fires.length = 0; state.bags.length = 0; state.loots.length = 0;
    state.raiders.length = 0; state.arrows.length = 0;
    state.spawnedNight = -1;

    P.tools = { rock: true };
    P.inv = {}; P.bandage = 0; P.slot = 0;
    P.hp = 100; P.hunger = 100; P.thirst = 100;
    P.day = 1; P.time = 0.22; P.alive = true;

    // Старт — на берегу, как и положено: пустые руки и вода за спиной.
    let sx = 0, sz = 0;
    for (let a = 0; a < 64; a++) {
      const ang = (a / 64) * 6.28;
      for (let d = World.SIZE * 0.45; d > 4; d -= 2) {
        const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
        if (World.height(x, z) > 1.2 && World.height(x, z) < 3.5) { sx = x; sz = z; a = 64; break; }
      }
    }
    P.x = sx; P.z = sz; P.y = World.height(sx, sz); P.vy = 0;
    P.yaw = Math.atan2(-sx, -sz) + Math.PI;
    state.mode = "play";
    save();
  }

  function save() {
    try {
      const data = {
        world: World.serialize(),
        p: {
          x: P.x, y: P.y, z: P.z, yaw: P.yaw, pitch: P.pitch, hp: P.hp,
          hunger: P.hunger, thirst: P.thirst, tools: P.tools, inv: P.inv,
          bandage: P.bandage, day: P.day, time: P.time, slot: P.slot,
          deaths: P.deaths, bestDay: P.bestDay,
        },
        fires: state.fires.map((f) => [f.x, f.y, f.z, Math.round(f.fuel)]),
        bags: state.bags.map((b) => [b.x, b.y, b.z]),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      state.lastSave = performance.now();
    } catch (e) { /* приватный режим или нет места — не мешаем игре */ }
  }

  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }

  function load() {
    let data;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return false; }
    if (!data || !data.world) return false;
    World.restore(data.world);
    placeStatics();
    rebuildPieces();
    Object.assign(P, data.p);
    P.inv = data.p.inv || {};
    P.tools = data.p.tools || { rock: true };
    state.fires = (data.fires || []).map(([x, y, z, fuel]) => ({ x, y, z, fuel }));
    state.bags = (data.bags || []).map(([x, y, z]) => ({ x, y, z }));
    state.loots.length = 0; state.raiders.length = 0; state.arrows.length = 0;
    spawnAnimals(World.mulberry32((data.world.seed ^ 0x5bf03635) | 0));
    state.mode = "play";
    P.alive = true;
    return true;
  }

  // ── Ввод ────────────────────────────────────────────────────────────────
  const input = {
    move: { x: 0, y: 0 }, look: { x: 0, y: 0 },
    stickId: null, lookId: null, stickOrigin: { x: 0, y: 0 },
    action: false, jump: false, use: false, keys: {},
  };

  function bindControls() {
    const stick = $("stick"), knob = $("knob");

    const startStick = (id, x, y) => {
      input.stickId = id;
      input.stickOrigin.x = x; input.stickOrigin.y = y;
      stick.style.left = x - 59 + "px";
      stick.style.top = y - 59 + "px";
      stick.style.bottom = "auto";
      stick.style.opacity = "0.9";
    };

    const moveStick = (x, y) => {
      const dx = x - input.stickOrigin.x, dy = y - input.stickOrigin.y;
      const d = Math.hypot(dx, dy), max = 52;
      const k = d > max ? max / d : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      input.move.x = (dx * k) / max;
      input.move.y = (dy * k) / max;
    };

    const endStick = () => {
      input.stickId = null;
      input.move.x = input.move.y = 0;
      knob.style.transform = "";
      stick.style.opacity = "0.55";
      stick.style.left = ""; stick.style.top = ""; stick.style.bottom = "";
    };

    const surface = $("touch");
    surface.addEventListener("pointerdown", (e) => {
      if (state.mode !== "play") return;
      // Мышь на компьютере: левая кнопка бьёт, правая зажатая — обзор.
      // Захват курсора не годится: с ним перестают нажиматься кнопки HUD.
      if (e.pointerType === "mouse") {
        if (e.button === 0) input.action = true;
        else {
          input.lookId = e.pointerId;
          input.look.x = e.clientX; input.look.y = e.clientY;
        }
        try { surface.setPointerCapture(e.pointerId); } catch (err) { /* мышь уже отпущена */ }
        return;
      }
      const leftZone = e.clientX < window.innerWidth * 0.46 && e.clientY > window.innerHeight * 0.42;
      if (leftZone && input.stickId === null) {
        startStick(e.pointerId, e.clientX, e.clientY);
      } else if (input.lookId === null) {
        input.lookId = e.pointerId;
        input.look.x = e.clientX; input.look.y = e.clientY;
      }
      try { surface.setPointerCapture(e.pointerId); } catch (err) { /* палец уже отпущен */ }
    });

    surface.addEventListener("pointermove", (e) => {
      if (e.pointerId === input.stickId) moveStick(e.clientX, e.clientY);
      else if (e.pointerId === input.lookId) {
        const sens = 0.0042;
        P.yaw -= (e.clientX - input.look.x) * sens;
        P.pitch = clamp(P.pitch - (e.clientY - input.look.y) * sens, -1.35, 1.35);
        input.look.x = e.clientX; input.look.y = e.clientY;
      }
    });

    const release = (e) => {
      if (e.pointerId === input.stickId) endStick();
      if (e.pointerId === input.lookId) input.lookId = null;
      if (e.pointerType === "mouse") input.action = false;
    };
    surface.addEventListener("pointerup", release);
    surface.addEventListener("pointercancel", release);

    const hold = (el, on, off) => {
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); el.classList.add("held"); on(); });
      const end = (e) => { e.preventDefault(); el.classList.remove("held"); if (off) off(); };
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
      el.addEventListener("pointerleave", end);
    };

    hold($("btnAction"), () => { input.action = true; }, () => { input.action = false; });
    hold($("btnJump"), () => { input.jump = true; }, () => { input.jump = false; });
    $("btnUse").addEventListener("pointerdown", (e) => { e.preventDefault(); useAction(); });

    surface.addEventListener("contextmenu", (e) => e.preventDefault());

    document.addEventListener("keydown", (e) => {
      input.keys[e.code] = true;
      if (state.mode !== "play") return;
      if (e.code === "Space") { input.jump = true; e.preventDefault(); }
      if (e.code === "KeyE") useAction();
      if (e.code === "KeyC") toggleScreen("craft");
      if (e.code === "KeyB") selectSlot(5);
      if (e.code === "Escape") toggleScreen("menu");
      if (/^Digit[1-6]$/.test(e.code)) selectSlot(parseInt(e.code.slice(5), 10) - 1);
    });
    document.addEventListener("keyup", (e) => {
      input.keys[e.code] = false;
      if (e.code === "Space") input.jump = false;
    });

  }

  function keyboardMove() {
    const k = input.keys;
    let x = 0, y = 0;
    if (k.KeyW || k.ArrowUp) y -= 1;
    if (k.KeyS || k.ArrowDown) y += 1;
    if (k.KeyA || k.ArrowLeft) x -= 1;
    if (k.KeyD || k.ArrowRight) x += 1;
    if (x || y) {
      const d = Math.hypot(x, y);
      return { x: x / d, y: y / d };
    }
    return null;
  }

  // ── Физика игрока ───────────────────────────────────────────────────────
  function groundAt(x, z, fromY) {
    let g = World.height(x, z);
    for (const p of nearPieces) {
      if (p.kind !== "foundation" && p.kind !== "ceiling") continue;
      if (Math.abs(x - p.wx) > World.GRID / 2 || Math.abs(z - p.wz) > World.GRID / 2) continue;
      const top = p.y + (p.kind === "foundation" ? 0.35 : 0.25);
      if (top > g && top <= fromY + 0.7) g = top;
    }
    return g;
  }

  function collide(nx, nz) {
    let x = nx, z = nz;
    for (const c of World.nearColliders(x, z)) {
      const dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(dx, dz), min = c.r + PLAYER_R;
      if (d < min && d > 0.0001) {
        x = c.x + (dx / d) * min;
        z = c.z + (dz / d) * min;
      }
    }
    for (const p of nearPieces) {
      if (p.kind !== "wall" && p.kind !== "doorway" && p.kind !== "door") continue;
      if (p.kind === "door" && p.open) continue;
      const top = p.y + 3;
      if (P.y + 1.6 < p.y || P.y > top) continue;
      const along = (p.edge & 1) === 0;        // 0 и 2 — стена вдоль X
      const hw = along ? World.GRID / 2 : 0.3;
      const hd = along ? 0.3 : World.GRID / 2;
      const dx = x - p.wx, dz = z - p.wz;
      if (Math.abs(dx) < hw + PLAYER_R && Math.abs(dz) < hd + PLAYER_R) {
        if (p.kind === "doorway" && Math.abs(along ? dx : dz) < 0.72) continue;  // проём открыт
        const px = hw + PLAYER_R - Math.abs(dx), pz = hd + PLAYER_R - Math.abs(dz);
        if (px < pz) x = p.wx + Math.sign(dx || 1) * (hw + PLAYER_R);
        else z = p.wz + Math.sign(dz || 1) * (hd + PLAYER_R);
      }
    }
    return { x, z };
  }

  function updatePlayer(dt) {
    const kb = keyboardMove();
    const mv = kb || input.move;
    const mag = Math.hypot(mv.x, mv.y);
    const sprint = mag > 0.82 || input.keys.ShiftLeft;
    const speed = (P.inWater ? 2.6 : sprint ? 6.1 : 4.1) * clamp(mag * 1.6, 0, 1);

    if (mag > 0.06) {
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
      const dx = (fx * -mv.y + rx * mv.x) * speed * dt;
      const dz = (fz * -mv.y + rz * mv.x) * speed * dt;
      const c = collide(P.x + dx, P.z + dz);
      P.x = clamp(c.x, -World.SIZE / 2 + 2, World.SIZE / 2 - 2);
      P.z = clamp(c.z, -World.SIZE / 2 + 2, World.SIZE / 2 - 2);
    }

    const g = groundAt(P.x, P.z, P.y);
    P.inWater = g < World.WATER - 0.4 && P.y < World.WATER + 0.5;

    if (input.jump && P.onGround && !P.inWater) {
      P.vy = 7.1;
      P.onGround = false;
    }
    P.vy -= (P.inWater ? 6 : 22) * dt;
    P.y += P.vy * dt;

    if (P.inWater && P.y < World.WATER) {
      P.y = Math.max(P.y, World.WATER - 0.6);
      P.vy = Math.max(P.vy, 0);
      P.onGround = true;
    }
    if (P.y <= g) { P.y = g; P.vy = 0; P.onGround = true; }
    else if (P.y > g + 0.05) P.onGround = false;

    GL.cam.x = P.x;
    GL.cam.y = P.y + 1.62;
    GL.cam.z = P.z;
    GL.cam.yaw = P.yaw;
    GL.cam.pitch = P.pitch;
  }

  // ── Выживание ───────────────────────────────────────────────────────────
  function nearFire(radius) {
    for (const f of state.fires) {
      if (f.fuel > 0 && (f.x - P.x) ** 2 + (f.z - P.z) ** 2 < radius * radius) return f;
    }
    return null;
  }

  function updateSurvival(dt) {
    P.hunger = clamp(P.hunger - DRAIN.hunger * dt, 0, 100);
    P.thirst = clamp(P.thirst - DRAIN.thirst * dt, 0, 100);

    let dmg = 0;
    if (P.hunger <= 0) dmg += STARVE;
    if (P.thirst <= 0) dmg += DEHYDRATE;
    const cold = state.night > 0.35 && !nearFire(6) && !(P.slot === 5 && P.tools.torch);
    if (cold) dmg += COLD * state.night;
    if (dmg > 0) hurt(dmg * dt, true);
    else if (P.hunger > 40 && P.thirst > 40 && P.hp < 100) P.hp = clamp(P.hp + REGEN * dt, 0, 100);

    for (const f of state.fires) if (f.fuel > 0) f.fuel -= dt;
  }

  function hurt(amount, silent) {
    if (!P.alive) return;
    P.hp -= amount;
    if (!silent) {
      const h = $("hurt");
      h.style.opacity = "0.85";
      setTimeout(() => (h.style.opacity = "0"), 130);
      Snd.hurt();
    }
    if (P.hp <= 0) die();
  }

  function die() {
    P.alive = false;
    P.hp = 0;
    P.deaths++;
    state.mode = "dead";
    const drop = {};
    for (const k in P.inv) {
      const half = Math.floor(inv(k) / 2);
      if (half > 0) { drop[k] = half; addInv(k, -half); }
    }
    if (Object.keys(drop).length) {
      state.loots.push({ x: P.x, y: World.height(P.x, P.z), z: P.z, inv: drop });
    }
    $("deadDay").textContent = String(P.day);
    $("deadBest").textContent = String(P.bestDay);
    $("deadDeaths").textContent = String(P.deaths);
    $("deadBag").textContent = Object.keys(drop).length ? "Половина припасов осталась мешком на месте смерти." : "Терять было нечего.";
    showScreen("dead");
    save();
  }

  function respawn() {
    const bag = state.bags[0];
    if (bag) { P.x = bag.x; P.z = bag.z; }
    else {
      let sx = 0, sz = 0;
      for (let a = 0; a < 48; a++) {
        const ang = (a / 48) * 6.28;
        for (let d = World.SIZE * 0.45; d > 4; d -= 2) {
          const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
          if (World.height(x, z) > 1.2 && World.height(x, z) < 3.5) { sx = x; sz = z; a = 48; break; }
        }
      }
      P.x = sx; P.z = sz;
    }
    P.y = World.height(P.x, P.z) + 0.2;
    P.hp = 60; P.hunger = Math.max(P.hunger, 45); P.thirst = Math.max(P.thirst, 45);
    P.alive = true; P.vy = 0;
    state.mode = "play";
    hideScreens();
    save();
  }

  // ── Прицеливание и удар ─────────────────────────────────────────────────
  // Кандидаты пересчитываются раз в кадр: перебирать все 700 объектов острова
  // на каждом шаге луча — это впустую сожжённая батарея.
  const nearNodes = [];
  const nearPieces = [];

  function refreshCandidates() {
    nearNodes.length = 0;
    for (const n of World.nodes) {
      if (!n.alive) continue;
      if ((n.x - P.x) ** 2 + (n.z - P.z) ** 2 < 64) nearNodes.push(n);
    }
    nearPieces.length = 0;
    for (const p of World.pieces) {
      if ((p.wx - P.x) ** 2 + (p.wz - P.z) ** 2 < 81) nearPieces.push(p);
    }
  }

  function aim() {
    const f = GL.basis;
    const ox = GL.cam.x, oy = GL.cam.y, oz = GL.cam.z;
    let best = null;
    for (let t = 0.5; t <= REACH; t += 0.22) {
      const x = ox + f.fx * t, y = oy + f.fy * t, z = oz + f.fz * t;

      for (const n of nearNodes) {
        const def = World.NODE_DEFS[n.type];
        const r = Math.max(0.7, def.radius * n.scale * 1.5);
        if ((n.x - x) ** 2 + (n.z - z) ** 2 < r * r && y > n.y - 1 && y < n.y + 5 * n.scale) {
          return { kind: "node", node: n, dist: t };
        }
      }
      for (const a of state.animals) {
        if (a.hp <= 0) continue;
        if ((a.x - x) ** 2 + (a.z - z) ** 2 < 0.9 && y > a.y - 0.3 && y < a.y + 2) {
          return { kind: "animal", animal: a, dist: t };
        }
      }
      for (const r of state.raiders) {
        if (r.hp <= 0) continue;
        if ((r.x - x) ** 2 + (r.z - z) ** 2 < 0.8 && y > r.y - 0.3 && y < r.y + 2.2) {
          return { kind: "raider", raider: r, dist: t };
        }
      }
      for (const l of state.loots) {
        if ((l.x - x) ** 2 + (l.z - z) ** 2 < 1 && Math.abs(l.y - y) < 1.4) {
          return { kind: "loot", loot: l, dist: t };
        }
      }
      for (const p of nearPieces) {
        if ((p.wx - x) ** 2 + (p.wz - z) ** 2 < 2.6 && y > p.y - 0.4 && y < p.y + 3.2) {
          if (!best) best = { kind: "piece", piece: p, dist: t };
        }
      }
      for (const fr of state.fires) {
        if ((fr.x - x) ** 2 + (fr.z - z) ** 2 < 1.2 && Math.abs(fr.y - y) < 1.6) {
          return { kind: "fire", fire: fr, dist: t };
        }
      }
    }
    return best;
  }

  function currentTool() {
    const order = ["rock", "axe", "pick", "spear", "bow", "plan"];
    let id = order[P.slot] || "rock";
    if (id === "axe" && P.tools.axeMetal) id = "axeMetal";
    if (id === "pick" && P.tools.pickMetal) id = "pickMetal";
    if (P.slot === 5 && !P.tools.plan && P.tools.torch) id = "torch";
    if (!P.tools[id] && id !== "rock") id = "rock";
    return { id, def: TOOLS[id] };
  }

  function nodeClass(type) {
    if (type === "pine" || type === "oak") return "tree";
    if (type === "rock") return "stone";
    if (type === "ore") return "ore";
    return "soft";
  }

  function swing() {
    const { id, def } = currentTool();
    if (def.build) return placeBuild();
    if (def.ranged) return shootArrow();

    P.swing = def.rate;
    const t = state.aimTarget;
    if (!t) return;

    if (t.kind === "node") {
      const n = t.node;
      const ndef = World.NODE_DEFS[n.type];
      const dmg = def.dmg[nodeClass(n.type)] || 5;
      n.hp -= dmg;
      const share = Math.max(1, Math.round((ndef.amount * dmg) / ndef.hp));
      if (ndef.give === "loot") {
        if (n.hp <= 0) {
          const scrap = 4 + Math.floor(Math.random() * 9);
          const cloth = 2 + Math.floor(Math.random() * 6);
          addInv("scrap", scrap); addInv("cloth", cloth);
          if (Math.random() > 0.6) { addInv("metal", 3); toast("+3 металл"); }
          toast(`+${scrap} лом · +${cloth} ткань`);
        }
      } else {
        addInv(ndef.give, share);
        toast(`+${share} ${RES[ndef.give] || ndef.give}`);
      }
      if (n.type === "rock" || n.type === "ore") Snd.stone(); else Snd.chop();
      if (n.hp <= 0) {
        n.alive = false;
        n.respawnAt = performance.now() / 1000 + ndef.respawn;
        batches[ndef.mesh].hide(n.idx);
        World.buildColliders();
      }
      return;
    }

    if (t.kind === "animal") {
      const a = t.animal;
      a.hp -= def.dmg.flesh || 8;
      a.state = "flee";
      a.fear = 6;
      Snd.hit();
      if (a.hp <= 0) killAnimal(a);
      return;
    }

    if (t.kind === "raider") {
      const r = t.raider;
      r.hp -= def.dmg.flesh || 8;
      Snd.hit();
      if (r.hp <= 0) killRaider(r);
      return;
    }

    if (t.kind === "piece") {
      // Свои стены ломаются обратно в половину стоимости.
      const p = t.piece;
      p.hp -= 45;
      Snd.chop();
      if (p.hp <= 0) {
        World.removePiece(p);
        addInv("wood", 30);
        rebuildPieces();
        toast("Постройка разобрана: +30 дерево");
      } else rebuildPieces();
      return;
    }

    if (t.kind === "loot") {
      takeLoot(t.loot);
    }
  }

  function killAnimal(a) {
    a.hp = 0;
    const meat = a.kind === "deer" ? 4 : 2;
    addInv("meat", meat);
    addInv("cloth", a.kind === "deer" ? 6 : 2);
    toast(`+${meat} сырое мясо`);
    a.respawnAt = performance.now() / 1000 + 90;
  }

  function killRaider(r) {
    r.hp = 0;
    const scrap = 10 + Math.floor(Math.random() * 12);
    addInv("scrap", scrap);
    addInv("cloth", 4);
    if (Math.random() > 0.7) { addInv("metal", 6); }
    toast(`Мародёр убит: +${scrap} лом`);
    const i = state.raiders.indexOf(r);
    if (i >= 0) state.raiders.splice(i, 1);
  }

  function takeLoot(l) {
    for (const k in l.inv) addInv(k, l.inv[k]);
    toast("Мешок подобран");
    const i = state.loots.indexOf(l);
    if (i >= 0) state.loots.splice(i, 1);
    Snd.craft();
  }

  function shootArrow() {
    if (inv("arrows") <= 0) { toast("Нет стрел", true); return; }
    addInv("arrows", -1);
    P.swing = TOOLS.bow.rate;
    const f = GL.basis;
    state.arrows.push({
      x: GL.cam.x + f.fx * 0.6, y: GL.cam.y + f.fy * 0.6, z: GL.cam.z + f.fz * 0.6,
      vx: f.fx * 42, vy: f.fy * 42, vz: f.fz * 42, life: 4,
    });
    Snd.bow();
  }

  function updateArrows(dt) {
    for (let i = state.arrows.length - 1; i >= 0; i--) {
      const a = state.arrows[i];
      a.life -= dt;
      a.vy -= 9.8 * dt;
      a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
      let hit = false;
      for (const t of state.animals) {
        if (t.hp > 0 && (t.x - a.x) ** 2 + (t.z - a.z) ** 2 < 0.8 && Math.abs(t.y + 0.9 - a.y) < 1.1) {
          t.hp -= TOOLS.bow.dmg.flesh; t.state = "flee"; t.fear = 6;
          if (t.hp <= 0) killAnimal(t); else Snd.hit();
          hit = true; break;
        }
      }
      if (!hit) {
        for (const r of state.raiders) {
          if (r.hp > 0 && (r.x - a.x) ** 2 + (r.z - a.z) ** 2 < 0.8 && Math.abs(r.y + 1 - a.y) < 1.3) {
            r.hp -= TOOLS.bow.dmg.flesh;
            if (r.hp <= 0) killRaider(r); else Snd.hit();
            hit = true; break;
          }
        }
      }
      if (hit || a.life <= 0 || a.y < World.height(a.x, a.z)) state.arrows.splice(i, 1);
    }
  }

  // ── Использование: пить, есть, двери, костёр ────────────────────────────
  function useAction() {
    if (state.mode !== "play") return;
    const t = state.aimTarget;

    if (t && t.kind === "piece" && t.piece.kind === "door") {
      t.piece.open = !t.piece.open;
      rebuildPieces();
      Snd.hit();
      return;
    }
    if (t && t.kind === "fire") {
      if (inv("wood") >= 20) {
        addInv("wood", -20);
        t.fire.fuel += 120;
        toast("В костёр подброшено дров");
        Snd.craft();
      } else toast("Нужно 20 дерева", true);
      return;
    }
    if (t && t.kind === "loot") return takeLoot(t.loot);

    for (const s of World.springs) {
      if ((s.x - P.x) ** 2 + (s.z - P.z) ** 2 < 9) {
        P.thirst = clamp(P.thirst + 45, 0, 100);
        toast("Напился из родника");
        Snd.eat();
        return;
      }
    }
    if (P.inWater) { toast("Морская вода не годится", true); return; }

    if (inv("cooked") > 0) {
      addInv("cooked", -1);
      P.hunger = clamp(P.hunger + 42, 0, 100);
      toast("Съедено жареное мясо");
      Snd.eat();
      return;
    }
    if (inv("berries") > 0) {
      addInv("berries", -1);
      P.hunger = clamp(P.hunger + 12, 0, 100);
      P.thirst = clamp(P.thirst + 5, 0, 100);
      toast("Съедены ягоды");
      Snd.eat();
      return;
    }
    if (P.bandage > 0 && P.hp < 100) {
      P.bandage--;
      P.hp = clamp(P.hp + 30, 0, 100);
      toast("Перевязался");
      Snd.eat();
      return;
    }
    toast("Нечего использовать", true);
  }

  // ── Стройка ─────────────────────────────────────────────────────────────
  function buildTarget() {
    const f = GL.basis;
    const dist = 5.5;
    const x = GL.cam.x + f.fx * dist, z = GL.cam.z + f.fz * dist;
    const gx = Math.round(x / World.GRID), gz = Math.round(z / World.GRID);
    const cx = gx * World.GRID, cz = gz * World.GRID;
    const dx = x - cx, dz = z - cz;
    const edge = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : (dz > 0 ? 2 : 0);
    return { gx, gz, edge, x: cx, z: cz };
  }

  function currentBuild() { return BUILD[state.buildIdx]; }

  function updateGhost() {
    const b = currentBuild();
    const t = buildTarget();
    const level = 0;
    let ok = canPay(b.cost);
    let y = World.foundationY(t.gx, t.gz);

    if (b.id === "foundation") {
      if (World.findPiece("foundation", t.gx, t.gz, 0)) ok = false;
      if (World.height(t.x, t.z) < 0.6) ok = false;
    } else if (b.id === "wall" || b.id === "doorway") {
      const f = World.findPiece("foundation", t.gx, t.gz, 0);
      if (!f) ok = false;
      else {
        y = World.levelY(t.gx, t.gz, level);
        if (World.findPiece("wall", t.gx, t.gz, level, t.edge) ||
            World.findPiece("doorway", t.gx, t.gz, level, t.edge)) ok = false;
      }
    } else if (b.id === "door") {
      const d = World.findPiece("doorway", t.gx, t.gz, level, t.edge);
      if (!d || World.findPiece("door", t.gx, t.gz, level, t.edge)) ok = false;
      else y = d.y;
    } else if (b.id === "ceiling") {
      const f = World.findPiece("foundation", t.gx, t.gz, 0);
      if (!f || World.findPiece("ceiling", t.gx, t.gz, level)) ok = false;
      else y = World.levelY(t.gx, t.gz, level) + 3;
    } else if (b.id === "campfire" || b.id === "bag") {
      y = World.height(t.x, t.z);
      if (y < 0.6) ok = false;
    } else if (b.id === "upgrade") {
      const target = state.aimTarget;
      ok = !!(target && target.kind === "piece" && target.piece.tier === "wood" && canPay(b.cost));
    }

    state.buildOK = ok;
    state.ghost = { b, t, y, level };
  }

  function placeBuild() {
    updateGhost();
    const { b, t, y, level } = state.ghost;
    if (!state.buildOK) {
      toast(canPay(b.cost) ? "Здесь не поставить" : `Нужно: ${costText(b.cost)}`, true);
      return;
    }

    // Пауза после любой постановки: иначе зажатая кнопка ставит по костру
    // в кадр и выносит все припасы за секунду.
    P.swing = 0.45;

    if (b.id === "upgrade") {
      const p = state.aimTarget.piece;
      pay(b.cost);
      p.tier = "stone";
      p.maxHp = World.PIECE_HP.stone;
      p.hp = World.PIECE_HP.stone;
      rebuildPieces();
      toast("Улучшено до камня");
      Snd.craft();
      return;
    }
    if (b.id === "campfire") {
      pay(b.cost);
      state.fires.push({ x: t.x, y, z: t.z, fuel: 240 });
      toast("Костёр разведён");
      Snd.craft();
      save();
      return;
    }
    if (b.id === "bag") {
      pay(b.cost);
      state.bags.length = 0;
      state.bags.push({ x: t.x, y, z: t.z });
      toast("Спальник поставлен: точка возрождения");
      Snd.craft();
      save();
      return;
    }

    pay(b.cost);
    World.addPiece(b.id, t.gx, t.gz, level, t.edge, "wood");
    rebuildPieces();
    Snd.craft();
  }

  // ── Крафт ───────────────────────────────────────────────────────────────
  let craftTab = "tools";

  function craft(r) {
    if (r.needFire && !nearFire(4.5)) { toast("Нужен горящий костёр рядом", true); return; }
    if (!canPay(r.cost)) { toast(`Нужно: ${costText(r.cost)}`, true); return; }
    pay(r.cost);
    if (r.tool) {
      P.tools[r.tool] = true;
      toast(`Скрафчено: ${r.name}`);
      const slotOf = { axe: 1, axeMetal: 1, pick: 2, pickMetal: 2, spear: 3, bow: 4, plan: 5, torch: 5 };
      if (slotOf[r.tool] !== undefined) selectSlot(slotOf[r.tool]);
    }
    if (r.give) {
      for (const k in r.give) {
        if (k === "bandage") P.bandage += r.give[k];
        else addInv(k, r.give[k]);
      }
      toast(`Готово: ${r.name}`);
    }
    Snd.craft();
    renderCraft();
    save();
  }

  function renderCraft() {
    const list = $("recipes");
    if (!list) return;
    list.innerHTML = "";
    for (const r of RECIPES) {
      if (r.tab !== craftTab) continue;
      const have = canPay(r.cost) && (!r.needFire || nearFire(4.5));
      const owned = r.tool && P.tools[r.tool];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "recipe " + (have && !owned ? "can" : "cant");
      btn.innerHTML = `<u>${r.icon}</u><span><b>${r.name}</b><em>${owned ? "уже есть" : r.note}</em></span><s>${costText(r.cost)}</s>`;
      btn.addEventListener("click", () => { if (!owned) craft(r); });
      list.appendChild(btn);
    }
    for (const t of list.parentElement.querySelectorAll(".tab")) {
      t.classList.toggle("on", t.dataset.tab === craftTab);
    }
  }

  // ── ИИ ──────────────────────────────────────────────────────────────────
  function stepToward(e, tx, tz, speed, dt) {
    const dx = tx - e.x, dz = tz - e.z;
    const d = Math.hypot(dx, dz) || 1;
    let nx = e.x + (dx / d) * speed * dt;
    let nz = e.z + (dz / d) * speed * dt;
    for (const c of World.nearColliders(nx, nz)) {
      const ddx = nx - c.x, ddz = nz - c.z;
      const dd = Math.hypot(ddx, ddz), min = c.r + 0.5;
      if (dd < min && dd > 0.001) { nx = c.x + (ddx / dd) * min; nz = c.z + (ddz / dd) * min; }
    }
    e.x = clamp(nx, -World.SIZE / 2 + 2, World.SIZE / 2 - 2);
    e.z = clamp(nz, -World.SIZE / 2 + 2, World.SIZE / 2 - 2);
    e.y = World.height(e.x, e.z);
    e.dir = Math.atan2(dx, dz);
  }

  function updateAnimals(dt) {
    const now = performance.now() / 1000;
    for (const a of state.animals) {
      if (a.hp <= 0) {
        if (a.respawnAt && now > a.respawnAt) {
          const ang = Math.random() * 6.28, d = 40 + Math.random() * 60;
          const x = clamp(P.x + Math.cos(ang) * d, -110, 110), z = clamp(P.z + Math.sin(ang) * d, -110, 110);
          if (World.height(x, z) > 1.5) {
            a.x = x; a.z = z; a.y = World.height(x, z); a.hp = a.max; a.state = "idle"; a.respawnAt = 0;
          }
        }
        continue;
      }
      const dist = Math.hypot(a.x - P.x, a.z - P.z);
      a.t -= dt;
      if (a.fear > 0) a.fear -= dt;

      if (a.kind === "deer") {
        if (dist < 16 || a.fear > 0) {
          stepToward(a, a.x + (a.x - P.x), a.z + (a.z - P.z), 7.5, dt);
        } else if (a.t <= 0) {
          a.dir = Math.random() * 6.28; a.t = 2 + Math.random() * 4;
        } else {
          stepToward(a, a.x + Math.sin(a.dir), a.z + Math.cos(a.dir), 1.4, dt);
        }
      } else {
        const aggressive = state.night > 0.2 || dist < 12;
        if (aggressive && dist < 34 && P.alive) {
          stepToward(a, P.x, P.z, 4.6, dt);
          a.attack -= dt;
          if (dist < 2.1 && a.attack <= 0) { a.attack = 1.3; hurt(12); }
        } else if (a.t <= 0) {
          a.dir = Math.random() * 6.28; a.t = 3 + Math.random() * 4;
        } else {
          stepToward(a, a.x + Math.sin(a.dir), a.z + Math.cos(a.dir), 1.8, dt);
        }
      }
    }
  }

  function updateRaiders(dt) {
    for (let i = state.raiders.length - 1; i >= 0; i--) {
      const r = state.raiders[i];
      if (r.hp <= 0) { state.raiders.splice(i, 1); continue; }
      if (state.night < 0.05) {          // на рассвете уходят
        state.raiders.splice(i, 1);
        continue;
      }
      const dist = Math.hypot(r.x - P.x, r.z - P.z);
      r.attack -= dt;

      if (dist < 60 && P.alive) {
        // Если между мародёром и игроком стена — бьют стену.
        const blocking = wallBetween(r.x, r.z, P.x, P.z);
        if (blocking && dist < 30) {
          const w = World.pieceWorld(blocking);
          stepToward(r, w.x, w.z, 2.6, dt);
          if (Math.hypot(r.x - w.x, r.z - w.z) < 2.2 && r.attack <= 0) {
            r.attack = 1.5;
            blocking.hp -= 25;
            Snd.chop();
            if (blocking.hp <= 0) { World.removePiece(blocking); toast("Стену пробили!", true); }
            rebuildPieces();
          }
        } else {
          stepToward(r, P.x, P.z, 3.1, dt);
          if (dist < 2.3 && r.attack <= 0) { r.attack = 1.5; hurt(14); }
        }
      } else {
        r.t -= dt;
        if (r.t <= 0) { r.dir = Math.random() * 6.28; r.t = 3 + Math.random() * 3; }
        stepToward(r, r.x + Math.sin(r.dir), r.z + Math.cos(r.dir), 1.6, dt);
      }
    }
  }

  function wallBetween(x0, z0, x1, z1) {
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      for (const p of World.pieces) {
        if (p.kind !== "wall" && p.kind !== "doorway" && p.kind !== "door") continue;
        if (p.kind === "door" && p.open) continue;
        if ((p.wx - x) ** 2 + (p.wz - z) ** 2 < 2.2) return p;
      }
    }
    return null;
  }

  // ── Время суток ─────────────────────────────────────────────────────────
  function updateTime(dt) {
    P.time += dt / DAY_LEN;
    if (P.time >= 1) {
      P.time -= 1;
      P.day++;
      P.bestDay = Math.max(P.bestDay, P.day);
      toast(`Рассвет. День ${P.day}`);
      save();
    }

    const t = P.time;
    const dayness = t < NIGHT_FROM
      ? Math.min(1, Math.sin((t / NIGHT_FROM) * Math.PI) * 1.6)
      : 0;
    state.night = 1 - dayness;

    const sunAngle = (t / NIGHT_FROM) * Math.PI;
    const sx = Math.cos(sunAngle), sy = Math.max(-0.2, Math.sin(sunAngle));
    const len = Math.hypot(sx, sy) || 1;
    GL.env.sun = [sx / len, sy / len, 0.25];

    const warm = clamp(1 - Math.abs(t / NIGHT_FROM - 0.5) * 2, 0, 1);
    const k = dayness;
    GL.env.sunColor = [0.35 + 0.75 * k, 0.32 + 0.66 * k * (0.7 + 0.3 * warm), 0.30 + 0.5 * k];
    GL.env.ambient = [0.13 + 0.25 * k, 0.14 + 0.26 * k, 0.20 + 0.24 * k];
    GL.env.fog = [0.06 + 0.56 * k, 0.08 + 0.62 * k, 0.12 + 0.66 * k];
    GL.env.skyTop = [0.03 + 0.21 * k, 0.05 + 0.40 * k, 0.12 + 0.63 * k];
    GL.env.skyBottom = [0.06 + 0.66 * k * (0.6 + 0.4 * (1 - warm)), 0.08 + 0.74 * k, 0.14 + 0.76 * k];
    GL.env.night = state.night;
    GL.env.fogFar = 110 + 110 * k;
    GL.env.fogNear = 20 + 30 * k;

    // Волна мародёров: одна на ночь, растёт с каждым прожитым днём.
    if (state.night > 0.5 && state.spawnedNight !== P.day) {
      state.spawnedNight = P.day;
      spawnRaiders(Math.min(6, 1 + Math.floor(P.day / 2)));
    }
  }

  function updateRespawn() {
    const now = performance.now() / 1000;
    for (const n of World.nodes) {
      if (!n.alive && n.respawnAt && now > n.respawnAt) {
        n.alive = true;
        n.hp = n.maxHp;
        n.respawnAt = 0;
        const def = World.NODE_DEFS[n.type];
        batches[def.mesh].set(n.idx, n.x, n.y, n.z, n.scale, n.scale, n.rot, n.tint, n.tint, n.tint,
          def.mesh === "pine" || def.mesh === "oak" || def.mesh === "hemp" ? 1 : 0);
        World.buildColliders();
      }
    }
  }

  // ── Отрисовка динамики ──────────────────────────────────────────────────
  function drawDynamic(time) {
    batches.fireBase.clear(); batches.flame.clear(); batches.bag.clear();
    batches.loot.clear(); batches.deer.clear(); batches.wolf.clear();
    batches.raider.clear(); batches.arrowMesh.clear();

    const lights = [];
    for (const f of state.fires) {
      batches.fireBase.add(f.x, f.y, f.z, 1, 1, 0, 1, 1, 1, 0);
      if (f.fuel > 0) {
        const flick = 0.85 + Math.sin(time * 9 + f.x) * 0.15;
        batches.flame.add(f.x, f.y + 0.15, f.z, flick, flick * 1.15, time * 2, 1, 0.75, 0.35, 0);
        lights.push({ x: f.x, y: f.y + 1, z: f.z, r: 14, col: [0.9, 0.45, 0.16] });
      }
    }
    if (P.slot === 5 && P.tools.torch && !P.tools.plan) {
      lights.push({ x: P.x, y: P.y + 1.4, z: P.z, r: 11, col: [0.8, 0.42, 0.15] });
    }
    lights.sort((a, b) => ((a.x - P.x) ** 2 + (a.z - P.z) ** 2) - ((b.x - P.x) ** 2 + (b.z - P.z) ** 2));
    GL.setLights(lights.slice(0, 4));

    for (const b of state.bags) batches.bag.add(b.x, b.y + 0.05, b.z, 1, 1, 0, 1, 1, 1, 0);
    for (const l of state.loots) batches.loot.add(l.x, l.y + 0.1, l.z, 1, 1, time * 0.7, 1, 0.9, 0.6, 0);

    for (const a of state.animals) {
      if (a.hp <= 0) continue;
      const b = a.kind === "deer" ? batches.deer : batches.wolf;
      const hurtTint = clamp(a.hp / a.max, 0.45, 1);
      b.add(a.x, a.y, a.z, 1, 1, a.dir, 1, hurtTint, hurtTint, 0);
    }
    for (const r of state.raiders) {
      const t = clamp(r.hp / r.max, 0.4, 1);
      batches.raider.add(r.x, r.y, r.z, 1, 1, r.dir || 0, 1, t, t, 0);
    }
    for (const a of state.arrows) {
      batches.arrowMesh.add(a.x, a.y, a.z, 1, 1, Math.atan2(a.vx, a.vz), 1, 1, 1, 0);
    }

    // Призрак постройки: зелёный — встанет, красный — нет.
    if (state.mode === "play" && currentTool().def.build && state.ghost) {
      const g = state.ghost;
      const col = state.buildOK ? [0.4, 1, 0.5] : [1, 0.4, 0.35];
      const kind = g.b.id === "campfire" ? "fireBase" : g.b.id === "bag" ? "bag" : g.b.id;
      if (batches[kind] && g.b.id !== "upgrade") {
        const isWall = kind === "wall" || kind === "doorway" || kind === "door";
        const off = World.GRID / 2;
        const pos = isWall
          ? [[g.t.x, g.t.z - off, 0], [g.t.x + off, g.t.z, Math.PI / 2], [g.t.x, g.t.z + off, 0], [g.t.x - off, g.t.z, Math.PI / 2]][g.t.edge & 3]
          : [g.t.x, g.t.z, 0];
        batches[kind].add(pos[0], g.y, pos[1], 1, 1, pos[2], col[0], col[1], col[2], 0);
      }
    }
  }

  function render(time) {
    GL.beginFrame(time);
    batches.terrain.draw();
    for (const k of ["pine", "oak", "rock", "ore", "bush", "hemp", "barrel", "crate", "ruin", "antenna", "spring",
      "foundation", "wall", "doorway", "door", "ceiling", "fireBase", "bag", "loot",
      "deer", "wolf", "raider", "arrowMesh"]) {
      if (batches[k]) batches[k].draw();
    }
    batches.flame.draw();
    GL.blend(true);
    batches.water.draw(0.72);
    GL.blend(false);
  }

  // ── Интерфейс ───────────────────────────────────────────────────────────
  let hudTick = 0;

  function updateHud(dt) {
    hudTick -= dt;
    if (hudTick > 0) return;
    hudTick = 0.1;

    $("hpFill").style.transform = `scaleX(${clamp(P.hp, 0, 100) / 100})`;
    $("foodFill").style.transform = `scaleX(${P.hunger / 100})`;
    $("waterFill").style.transform = `scaleX(${P.thirst / 100})`;
    $("hpText").textContent = Math.round(P.hp);
    $("foodText").textContent = Math.round(P.hunger);
    $("waterText").textContent = Math.round(P.thirst);

    const hour = Math.floor(P.time * 24);
    const min = Math.floor((P.time * 24 - hour) * 60);
    // Компас и подсказка к роднику: на острове без ориентиров жажда убивает
    // не потому, что воды нет, а потому что её не найти.
    const CARD = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];
    const ARROW = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
    const heading = Math.atan2(-Math.sin(P.yaw), Math.cos(P.yaw));
    const card = CARD[((Math.round(heading / (Math.PI / 4)) % 8) + 8) % 8];
    let guide = "";
    if (P.thirst < 55 && World.springs.length) {
      let best = null, bd = 1e9;
      for (const s of World.springs) {
        const d = (s.x - P.x) ** 2 + (s.z - P.z) ** 2;
        if (d < bd) { bd = d; best = s; }
      }
      const rel = Math.atan2(best.x - P.x, -(best.z - P.z)) - heading;
      const ai = ((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8;
      guide = ` · родник ${Math.round(Math.sqrt(bd))} м ${ARROW[ai]}`;
    }
    $("clock").innerHTML = `ДЕНЬ <b>${P.day}</b> · ${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")} · ${card}` +
      (state.night > 0.35 ? " · <b>НОЧЬ</b>" : "") + guide;

    const rows = [];
    for (const k of ["wood", "stone", "metal", "scrap", "cloth", "berries", "cooked", "arrows"]) {
      if (inv(k)) rows.push(`<i>${RES[k]}</i><b>${inv(k)}</b>`);
    }
    if (P.bandage) rows.push(`<i>бинты</i><b>${P.bandage}</b>`);
    $("pack").innerHTML = rows.join("");

    const t = state.aimTarget;
    const tEl = $("target");
    if (t && state.mode === "play") {
      let title = "", sub = "", frac = 0;
      if (t.kind === "node") {
        const def = World.NODE_DEFS[t.node.type];
        const names = { pine: "Сосна", oak: "Дуб", rock: "Камень", ore: "Металлическая руда", bush: "Куст ягод", hemp: "Конопля", barrel: "Бочка", crate: "Ящик" };
        title = names[t.node.type] || t.node.type;
        sub = def.tool === "axe" ? "нужен топор" : def.tool === "pick" ? "нужна кирка" : "бей чем угодно";
        frac = t.node.hp / t.node.maxHp;
      } else if (t.kind === "animal") {
        title = t.animal.kind === "deer" ? "Олень" : "Волк";
        sub = t.animal.kind === "deer" ? "мясо и ткань" : "опасен";
        frac = t.animal.hp / t.animal.max;
      } else if (t.kind === "raider") {
        title = "Мародёр"; sub = "лом"; frac = t.raider.hp / t.raider.max;
      } else if (t.kind === "piece") {
        const names = { foundation: "Фундамент", wall: "Стена", doorway: "Проём", door: "Дверь", ceiling: "Потолок" };
        title = names[t.piece.kind] + (t.piece.tier === "stone" ? " (камень)" : " (дерево)");
        sub = t.piece.kind === "door" ? "кнопка ⎋ — открыть" : "";
        frac = t.piece.hp / t.piece.maxHp;
      } else if (t.kind === "fire") {
        title = "Костёр";
        sub = t.fire.fuel > 0 ? `горит ${Math.ceil(t.fire.fuel)} с` : "погас, нужны дрова";
        frac = clamp(t.fire.fuel / 240, 0, 1);
      } else if (t.kind === "loot") { title = "Мешок"; sub = "кнопка ⎋ — забрать"; frac = 1; }
      tEl.innerHTML = `${title}<em>${sub}</em><span class="tbar"><i style="transform:scaleX(${frac})"></i></span>`;
      tEl.style.display = "";
    } else if (state.mode === "play" && World.springs.some((s) => (s.x - P.x) ** 2 + (s.z - P.z) ** 2 < 9)) {
      tEl.innerHTML = 'Родник<em>кнопка ВЗЯТЬ — напиться</em>';
      tEl.style.display = "";
    } else tEl.style.display = "none";

    const order = ["rock", "axe", "pick", "spear", "bow", "plan"];
    const slots = $("hotbar").children;
    for (let i = 0; i < slots.length; i++) {
      let id = order[i];
      if (id === "axe" && P.tools.axeMetal) id = "axeMetal";
      if (id === "pick" && P.tools.pickMetal) id = "pickMetal";
      if (i === 5 && !P.tools.plan && P.tools.torch) id = "torch";
      const owned = id === "rock" || P.tools[id];
      const def = TOOLS[id];
      slots[i].classList.toggle("on", P.slot === i);
      slots[i].style.opacity = owned ? "1" : "0.35";
      slots[i].innerHTML = `<u>${def.icon}</u>${def.ranged ? `<em>${inv("arrows")}</em>` : ""}`;
    }

    const building = currentTool().def.build;
    $("buildbar").hidden = !building;
    if (building) {
      const kids = $("buildbar").children;
      for (let i = 0; i < kids.length; i++) kids[i].classList.toggle("on", i === state.buildIdx);
    }
  }

  function selectSlot(i) {
    P.slot = clamp(i, 0, 5);
    hudTick = 0;
  }

  function showScreen(id) {
    input.action = false;
    for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== id;
    if (id === "craft") renderCraft();
  }
  function hideScreens() {
    for (const s of document.querySelectorAll(".screen")) s.hidden = true;
  }
  function toggleScreen(id) {
    const el = $(id);
    if (el.hidden) showScreen(id); else hideScreens();
  }

  // ── Цикл ────────────────────────────────────────────────────────────────
  let last = 0;

  function frame(ts) {
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts;
    const time = ts / 1000;

    if (state.mode === "play" && !document.querySelector(".screen:not([hidden])")) {
      refreshCandidates();
      updateTime(dt);
      updatePlayer(dt);
      updateSurvival(dt);
      updateAnimals(dt);
      updateRaiders(dt);
      updateArrows(dt);
      updateRespawn();
      state.aimTarget = aim();
      if (currentTool().def.build) updateGhost();
      P.swing -= dt;
      if (input.action && P.swing <= 0) swing();
      $("cross").classList.toggle("hit", !!state.aimTarget);
      if (ts - state.lastSave > 20000) save();
    }

    drawDynamic(time);
    render(time);
    updateHud(dt);
    requestAnimationFrame(frame);
  }

  // ── Сборка страницы ─────────────────────────────────────────────────────
  function buildHud() {
    const hud = $("hud");
    hud.innerHTML = `
      <div class="vitals">
        <span class="bar hp"><i id="hpFill"></i><span>ЗДОРОВЬЕ <b id="hpText">100</b></span></span>
        <span class="bar food"><i id="foodFill"></i><span>ГОЛОД <b id="foodText">100</b></span></span>
        <span class="bar water"><i id="waterFill"></i><span>ЖАЖДА <b id="waterText">100</b></span></span>
        <div class="clock" id="clock">ДЕНЬ 1</div>
      </div>
      <div class="pack" id="pack"></div>
      <div class="top-btns">
        <button class="ui-btn" id="btnCraft" type="button">Крафт</button>
        <button class="ui-btn" id="btnMenu" type="button">Меню</button>
      </div>
      <div class="cross" id="cross"></div>
      <div class="target" id="target"></div>
      <div class="toasts" id="toasts"></div>
      <div class="stick" id="stick"><b id="knob"></b></div>
      <button class="action" id="btnAction" type="button">Удар</button>
      <button class="side-btn jump" id="btnJump" type="button">Прыжок</button>
      <button class="side-btn use" id="btnUse" type="button">Взять</button>
      <div class="buildbar" id="buildbar" hidden></div>
      <div class="hotbar" id="hotbar"></div>`;

    const hot = $("hotbar");
    for (let i = 0; i < 6; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "slot";
      b.addEventListener("click", () => selectSlot(i));
      hot.appendChild(b);
    }

    const bb = $("buildbar");
    BUILD.forEach((b, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.textContent = b.short;
      el.addEventListener("click", () => { state.buildIdx = i; hudTick = 0; });
      bb.appendChild(el);
    });

    $("btnCraft").addEventListener("click", () => toggleScreen("craft"));
    $("btnMenu").addEventListener("click", () => toggleScreen("menu"));
  }

  function bindScreens() {
    $("btnNew").addEventListener("click", () => { Snd.ensure(); newGame(); hideScreens(); });
    $("btnContinue").addEventListener("click", () => {
      Snd.ensure();
      if (load()) hideScreens(); else { newGame(); hideScreens(); }
    });
    $("btnHelp").addEventListener("click", () => showScreen("help"));
    $("btnHelpBack").addEventListener("click", () => showScreen(state.mode === "play" ? "menu" : "start"));
    $("btnCraftClose").addEventListener("click", hideScreens);
    $("btnResume").addEventListener("click", hideScreens);
    $("btnSave").addEventListener("click", () => { save(); toast("Сохранено"); hideScreens(); });
    $("btnQuit").addEventListener("click", () => { save(); state.mode = "menu"; showScreen("start"); });
    $("btnRespawn").addEventListener("click", respawn);
    $("btnMenuHelp").addEventListener("click", () => showScreen("help"));
    for (const t of document.querySelectorAll("#craft .tab")) {
      t.addEventListener("click", () => { craftTab = t.dataset.tab; renderCraft(); });
    }
  }

  function init() {
    canvas = $("gl");
    if (!GL.init(canvas)) {
      document.body.innerHTML = '<div style="padding:24px;font:600 15px system-ui;color:#e8e0ce">' +
        "Не удалось запустить WebGL. Включи его в настройках Safari и перезагрузи страницу.</div>";
      return;
    }
    buildHud();
    bindScreens();
    bindControls();
    buildScene();
    World.generate((Math.random() * 1e9) | 0);
    placeStatics();
    P.x = 0; P.z = 0; P.y = World.height(0, 0);

    $("btnContinue").hidden = !hasSave();
    showScreen("start");

    window.addEventListener("resize", () => GL.resize());
    window.addEventListener("orientationchange", () => setTimeout(() => GL.resize(), 250));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && state.mode === "play") { save(); showScreen("menu"); }
    });
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      save();
      toast("Графика перезапускается…", true);
      setTimeout(() => location.reload(), 600);
    });

    requestAnimationFrame(frame);
  }

  return { init, state, P, save, load, newGame };
})();

// Скрипт может подключаться и после разбора страницы — тогда ждать уже нечего.
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => Game.init());
} else {
  Game.init();
}
