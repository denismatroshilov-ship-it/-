/* «Голый берег» — выживание по правилам Rust, целиком офлайн на телефоне.

   Здесь логика: игрок, физика, добыча, бой, стройка, ИИ, время суток.
   Таблица баланса — в items.js, мир — в world.js, отрисовка — в gl.js. */
const Game = (() => {
  "use strict";

  // ── Баланс ──────────────────────────────────────────────────────────────
  const DAY_LEN = 480;
  const NIGHT_FROM = 0.70;
  const DRAIN = { hunger: 100 / 720, thirst: 100 / 540 };
  const REGEN = 0.35;
  const STARVE = 0.45, DEHYDRATE = 0.8, COLD = 0.22;
  const BLEED_DPS = 1.6;
  const REACH = 4.2;
  const PLAYER_R = 0.45;
  const UPKEEP_EVERY = 60;          // секунд между списаниями налога
  const SAVE_KEY = "bereg.save.v2";

  const TOOLS = {
    rock: { name: "Камень", icon: "🪨", dmg: { tree: 8, stone: 10, ore: 6, soft: 12, flesh: 10 }, rate: 0.55 },
    axe: { name: "Каменный топор", icon: "🪓", dmg: { tree: 26, stone: 8, ore: 5, soft: 18, flesh: 22 }, rate: 0.5 },
    axeMetal: { name: "Топор из металла", icon: "🪓", dmg: { tree: 48, stone: 12, ore: 8, soft: 26, flesh: 32 }, rate: 0.45 },
    pick: { name: "Каменная кирка", icon: "⛏️", dmg: { tree: 8, stone: 26, ore: 24, soft: 16, flesh: 20 }, rate: 0.5 },
    pickMetal: { name: "Кирка из металла", icon: "⛏️", dmg: { tree: 12, stone: 48, ore: 46, soft: 22, flesh: 28 }, rate: 0.45 },
    spear: { name: "Копьё", icon: "🔱", dmg: { tree: 9, stone: 6, ore: 4, soft: 20, flesh: 38 }, rate: 0.7 },
    bow: { name: "Охотничий лук", icon: "🏹", rate: 0.9, ammo: "arrows", proj: { speed: 42, dmg: 42 } },
    crossbow: { name: "Арбалет", icon: "🎯", rate: 1.15, ammo: "arrows", proj: { speed: 60, dmg: 68 } },
    revolver: { name: "Револьвер", icon: "🔫", rate: 0.45, gun: { ammo: "pistolAmmo", dmg: 35, spread: 0.012, recoil: 0.035 } },
    rifle: { name: "Штурмовая винтовка", icon: "🔫", rate: 0.13, gun: { ammo: "rifleAmmo", dmg: 50, spread: 0.022, recoil: 0.028, auto: true } },
    torch: { name: "Факел", icon: "🔥", dmg: { tree: 5, stone: 4, ore: 3, soft: 8, flesh: 12 }, rate: 0.6, light: true },
    hammer: { name: "Молоток", icon: "🔨", dmg: { tree: 6, stone: 6, ore: 4, soft: 8, flesh: 10 }, rate: 0.5, repair: true },
    plan: { name: "План стройки", icon: "📐", dmg: {}, rate: 0.5, build: true },
  };

  // Пояс: восемь слотов, содержимое подставляется по тому, что скрафчено.
  const BELT = [
    { key: "rock", pick: () => "rock" },
    { key: "axe", pick: (t) => (t.axeMetal ? "axeMetal" : t.axe ? "axe" : null) },
    { key: "pick", pick: (t) => (t.pickMetal ? "pickMetal" : t.pick ? "pick" : null) },
    { key: "melee", pick: (t) => (t.spear ? "spear" : null) },
    { key: "ranged", pick: (t) => (t.rifle ? "rifle" : t.revolver ? "revolver" : t.crossbow ? "crossbow" : t.bow ? "bow" : null) },
    { key: "plan", pick: (t) => (t.plan ? "plan" : null) },
    { key: "hammer", pick: (t) => (t.hammer ? "hammer" : null) },
    { key: "torch", pick: (t) => (t.torch ? "torch" : null) },
  ];

  // Постройки: цена, прочность и что во что улучшается.
  const BUILD = [
    { id: "foundation", short: "ФУНД", name: "Фундамент", cost: { wood: 100 } },
    { id: "wall", short: "СТЕНА", name: "Стена", cost: { wood: 80 } },
    { id: "doorway", short: "ПРОЁМ", name: "Дверной проём", cost: { wood: 100 } },
    { id: "door", short: "ДВЕРЬ", name: "Дверь", cost: { wood: 60 } },
    { id: "ceiling", short: "ПОТОЛ", name: "Потолок", cost: { wood: 80 } },
  ];

  const TIERS = ["wood", "stone", "metal", "armored"];
  const TIER_NAME = { wood: "дерево", stone: "камень", metal: "листовой металл", armored: "броня" };
  const TIER_UP = {
    stone: { stone: 150 },
    metal: { metal: 200 },
    armored: { hqm: 25 },
  };

  const DEPLOY = {
    campfire: { name: "Костёр", short: "КОСТЁР", mesh: "fireBase", r: 0.8 },
    bag: { name: "Спальник", short: "СПАЛЬН", mesh: "bag", r: 0.9 },
    furnace: { name: "Печь", short: "ПЕЧЬ", mesh: "furnace", r: 0.9, smelt: 1 },
    furnaceLarge: { name: "Большая печь", short: "БОЛ.ПЕЧЬ", mesh: "furnaceLarge", r: 1.4, smelt: 4 },
    box: { name: "Ящик", short: "ЯЩИК", mesh: "box", r: 0.7, store: 12 },
    largeBox: { name: "Большой ящик", short: "БОЛ.ЯЩИК", mesh: "largeBox", r: 1.0, store: 30 },
    wb1: { name: "Верстак 1", short: "ВЕРСТАК 1", mesh: "wb1", r: 1.1, wb: 1 },
    wb2: { name: "Верстак 2", short: "ВЕРСТАК 2", mesh: "wb2", r: 1.1, wb: 2 },
    wb3: { name: "Верстак 3", short: "ВЕРСТАК 3", mesh: "wb3", r: 1.1, wb: 3 },
    research: { name: "Исследовательский стол", short: "ИССЛЕД", mesh: "research", r: 1.0 },
    tc: { name: "Шкаф инструментов", short: "ШКАФ", mesh: "tc", r: 0.8 },
    recycler: { name: "Переработчик", short: "ПЕРЕРАБ", mesh: "recycler", r: 0.9 },
  };

  const RES = Items.RES;

  // ── Состояние ───────────────────────────────────────────────────────────
  const P = {
    x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0,
    hp: 100, hunger: 100, thirst: 100, bleed: 0,
    onGround: true, inWater: false,
    slot: 0, swing: 0, alive: true,
    tools: { rock: true }, bp: {}, inv: {}, bandage: 0, armor: 0,
    day: 1, time: 0.22, deaths: 0, bestDay: 1,
  };

  const state = {
    mode: "menu",
    deploys: [], loots: [], animals: [], raiders: [], arrows: [], tracers: [],
    lastSave: 0, aimTarget: null, buildIdx: 0, buildOK: false, ghost: null,
    night: 0, spawnedNight: -1, openDeploy: null, upkeepAt: 0, upkeepFail: false,
  };

  let batches = {}, M = {}, canvas = null;

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
    shot() { this.noise(0.16, 0.5, 5200); this.blip(120, 0.14, "sawtooth", 0.22, 45); },
    howl() { this.blip(280, 1.1, "sine", 0.07, 160); },
    learn() { this.blip(440, 0.1, "square", 0.09); setTimeout(() => this.blip(660, 0.1, "square", 0.09), 90); setTimeout(() => this.blip(880, 0.16, "square", 0.08), 180); },
  };

  // ── Мелочи ──────────────────────────────────────────────────────────────
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const $ = (id) => document.getElementById(id);
  const inv = (k) => P.inv[k] || 0;
  const addInv = (k, n) => { P.inv[k] = Math.max(0, inv(k) + n); };
  const resName = (k) => (RES[k] ? RES[k].name : DEPLOY[k] ? DEPLOY[k].name.toLowerCase() : k);

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

  const canPay = (cost) => Object.keys(cost).every((k) => inv(k) >= cost[k]);
  const pay = (cost) => { for (const k in cost) addInv(k, -cost[k]); };
  const costText = (cost) => Object.keys(cost).map((k) => `${cost[k]} ${resName(k)}`).join(" · ");

  // ── Сцена ───────────────────────────────────────────────────────────────
  function buildScene() {
    M = World.makeMeshes();
    batches = {};
    const mk = (name, mesh, max) => (batches[name] = new GL.Batch(mesh, max));

    batches.terrain = new GL.Batch(World.terrainMesh(), 1);
    batches.terrain.add(0, 0, 0, 1, 1, 0, 1, 1, 1, 0);
    mk("water", M.water, 1);
    batches.water.add(0, World.WATER, 0, 1, 1, 0, 1, 1, 1, 0);

    for (const k of ["pine", "oak", "rock", "ore", "sulfurNode", "hqmNode", "bush", "hemp", "barrel", "crate"]) {
      mk(k, M[k], 460);
    }
    mk("ruin", M.ruin, 24);
    mk("antenna", M.antenna, 2);
    mk("spring", M.spring, 12);
    mk("foundation", M.foundation, 220);
    mk("wall", M.wall, 260);
    mk("doorway", M.doorway, 60);
    mk("door", M.door, 60);
    mk("ceiling", M.ceiling, 220);
    mk("flame", M.flame, 24);
    mk("loot", M.loot, 40);
    mk("deer", M.deer, 24);
    mk("wolf", M.wolf, 24);
    mk("raider", M.raider, 24);
    mk("arrowMesh", M.arrow, 60);
    for (const id in DEPLOY) mk(id, M[DEPLOY[id].mesh], 60);
  }

  function placeStatics() {
    for (const k of ["pine", "oak", "rock", "ore", "sulfurNode", "hqmNode", "bush", "hemp", "barrel", "crate"]) {
      batches[k].clear();
    }
    batches.ruin.clear(); batches.antenna.clear(); batches.spring.clear();
    for (const n of World.nodes) {
      const def = World.NODE_DEFS[n.type];
      const b = batches[def.mesh];
      if (!b) continue;
      const wind = def.mesh === "pine" || def.mesh === "oak" || def.mesh === "hemp" ? 1 : 0;
      n.idx = b.add(n.x, n.y, n.z, n.scale, n.scale, n.rot, n.tint, n.tint, n.tint, wind);
      if (!n.alive) b.hide(n.idx);
    }
    for (const p of World.props) {
      const b = batches[p.mesh];
      if (b) b.add(p.x, p.y, p.z, p.scale, p.scale, p.rot, 1, 1, 1, 0);
    }
    for (const s of World.springs) batches.spring.add(s.x, s.y + 0.05, s.z, 1, 1, 0, 1, 1, 1, 0);
  }

  const TIER_TINT = {
    wood: [1, 0.98, 0.95], stone: [0.74, 0.74, 0.72],
    metal: [0.62, 0.66, 0.70], armored: [0.45, 0.48, 0.55],
  };

  function rebuildPieces() {
    for (const k of ["foundation", "wall", "doorway", "door", "ceiling"]) batches[k].clear();
    for (const p of World.pieces) {
      const w = World.pieceWorld(p);
      const t = TIER_TINT[p.tier] || TIER_TINT.wood;
      const hurt = clamp(p.hp / p.maxHp, 0.4, 1);
      const rot = p.kind === "door" ? w.rot + (p.open ? Math.PI / 2 : 0) : w.rot;
      let x = w.x, z = w.z;
      if (p.kind === "door") {
        x -= Math.cos(w.rot + Math.PI / 2) * 0.72;
        z -= Math.sin(w.rot + Math.PI / 2) * 0.72;
      }
      batches[p.kind].add(x, w.y, z, 1, 1, rot, t[0] * hurt, t[1] * hurt, t[2] * hurt, 0);
    }
  }

  function rebuildDeploys() {
    for (const id in DEPLOY) batches[id].clear();
    for (const d of state.deploys) {
      const def = DEPLOY[d.type];
      if (!def || !batches[d.type]) continue;
      batches[d.type].add(d.x, d.y, d.z, 1, 1, d.rot || 0, 1, 1, 1, 0);
    }
  }

  const deploysOf = (type) => state.deploys.filter((d) => d.type === type);

  function nearDeploy(type, radius) {
    for (const d of state.deploys) {
      if (d.type !== type) continue;
      if ((d.x - P.x) ** 2 + (d.z - P.z) ** 2 < radius * radius) return d;
    }
    return null;
  }

  function benchLevel() {
    let lvl = 0;
    for (const d of state.deploys) {
      const def = DEPLOY[d.type];
      if (!def.wb) continue;
      if ((d.x - P.x) ** 2 + (d.z - P.z) ** 2 < 25) lvl = Math.max(lvl, def.wb);
    }
    return lvl;
  }

  function burningFire(radius) {
    for (const d of state.deploys) {
      if (d.type !== "campfire" || d.fuel <= 0) continue;
      if ((d.x - P.x) ** 2 + (d.z - P.z) ** 2 < radius * radius) return d;
    }
    return null;
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
            dir: rng() * 6.28, t: rng() * 5, attack: 0, fear: 0, respawnAt: 0,
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
        x, y: World.height(x, z), z, hp: 110, max: 110, attack: 0, dir: 0, t: 0,
        armed: P.day > 3 && Math.random() > 0.55,
      });
    }
    toast(`Мародёры вышли к антенне: ${count}`, true);
    Snd.howl();
  }

  // ── Запуск и сохранение ─────────────────────────────────────────────────
  function beachSpot() {
    for (let a = 0; a < 64; a++) {
      const ang = (a / 64) * 6.28;
      for (let d = World.SIZE * 0.45; d > 4; d -= 2) {
        const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
        const h = World.height(x, z);
        if (h > 1.2 && h < 3.5) return { x, z, y: h };
      }
    }
    return { x: 0, z: 0, y: World.height(0, 0) };
  }

  function addMonumentDeploys() {
    // Переработчик стоит у руин — единственный на острове, как в монументе.
    const r = World.ruins;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * 6.28;
      const x = r.x + Math.cos(ang) * 6, z = r.z + Math.sin(ang) * 6;
      if (World.slope(x, z) < 0.4) {
        state.deploys.push({ type: "recycler", x, y: World.height(x, z), z, rot: ang, fixed: true });
        return;
      }
    }
    state.deploys.push({ type: "recycler", x: r.x + 6, y: World.height(r.x + 6, r.z), z: r.z, rot: 0, fixed: true });
  }

  function newGame(seed) {
    const s = seed || ((Math.random() * 1e9) | 0);
    World.generate(s);
    placeStatics();
    rebuildPieces();
    spawnAnimals(World.mulberry32(s ^ 0x5bf03635));
    state.deploys.length = 0;
    state.loots.length = 0; state.raiders.length = 0;
    state.arrows.length = 0; state.tracers.length = 0;
    state.spawnedNight = -1; state.upkeepAt = 0; state.upkeepFail = false;
    addMonumentDeploys();
    rebuildDeploys();

    P.tools = { rock: true };
    P.bp = {}; P.inv = {}; P.bandage = 0; P.armor = 0; P.slot = 0; P.bleed = 0;
    P.hp = 100; P.hunger = 100; P.thirst = 100;
    P.day = 1; P.time = 0.22; P.alive = true;

    const spot = beachSpot();
    P.x = spot.x; P.z = spot.z; P.y = spot.y; P.vy = 0;
    P.yaw = Math.atan2(-spot.x, -spot.z) + Math.PI;
    state.mode = "play";
    save();
  }

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        world: World.serialize(),
        p: {
          x: P.x, y: P.y, z: P.z, yaw: P.yaw, pitch: P.pitch, hp: P.hp,
          hunger: P.hunger, thirst: P.thirst, tools: P.tools, bp: P.bp, inv: P.inv,
          bandage: P.bandage, armor: P.armor, day: P.day, time: P.time, slot: P.slot,
          deaths: P.deaths, bestDay: P.bestDay,
        },
        deploys: state.deploys,
      }));
      state.lastSave = performance.now();
    } catch (e) { /* приватный режим — играем без сейва */ }
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
    P.bp = data.p.bp || {};
    state.deploys = data.deploys || [];
    if (!state.deploys.some((d) => d.type === "recycler")) addMonumentDeploys();
    rebuildDeploys();
    state.loots.length = 0; state.raiders.length = 0;
    state.arrows.length = 0; state.tracers.length = 0;
    spawnAnimals(World.mulberry32((data.world.seed ^ 0x5bf03635) | 0));
    state.mode = "play";
    P.alive = true;
    return true;
  }

  // ── Ввод ────────────────────────────────────────────────────────────────
  const input = {
    move: { x: 0, y: 0 }, look: { x: 0, y: 0 },
    stickId: null, lookId: null, stickOrigin: { x: 0, y: 0 },
    action: false, jump: false, keys: {},
  };

  function bindControls() {
    const stick = $("stick"), knob = $("knob"), surface = $("touch");

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

    surface.addEventListener("pointerdown", (e) => {
      if (state.mode !== "play") return;
      if (e.pointerType === "mouse") {
        if (e.button === 0) input.action = true;
        else { input.lookId = e.pointerId; input.look.x = e.clientX; input.look.y = e.clientY; }
        try { surface.setPointerCapture(e.pointerId); } catch (err) { /* мышь отпущена */ }
        return;
      }
      const leftZone = e.clientX < window.innerWidth * 0.46 && e.clientY > window.innerHeight * 0.42;
      if (leftZone && input.stickId === null) startStick(e.pointerId, e.clientX, e.clientY);
      else if (input.lookId === null) {
        input.lookId = e.pointerId;
        input.look.x = e.clientX; input.look.y = e.clientY;
      }
      try { surface.setPointerCapture(e.pointerId); } catch (err) { /* палец отпущен */ }
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
    surface.addEventListener("contextmenu", (e) => e.preventDefault());

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

    document.addEventListener("keydown", (e) => {
      input.keys[e.code] = true;
      if (state.mode !== "play") return;
      if (e.code === "Space") { input.jump = true; e.preventDefault(); }
      if (e.code === "KeyE") useAction();
      if (e.code === "KeyC") toggleScreen("craft");
      if (e.code === "KeyT") toggleScreen("tech");
      if (e.code === "Escape") toggleScreen("menu");
      if (/^Digit[1-8]$/.test(e.code)) selectSlot(parseInt(e.code.slice(5), 10) - 1);
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
    if (!x && !y) return null;
    const d = Math.hypot(x, y);
    return { x: x / d, y: y / d };
  }

  // ── Физика ──────────────────────────────────────────────────────────────
  const nearNodes = [], nearPieces = [], nearDeploys = [];

  function refreshCandidates() {
    nearNodes.length = 0;
    for (const n of World.nodes) {
      if (n.alive && (n.x - P.x) ** 2 + (n.z - P.z) ** 2 < 64) nearNodes.push(n);
    }
    nearPieces.length = 0;
    for (const p of World.pieces) {
      if ((p.wx - P.x) ** 2 + (p.wz - P.z) ** 2 < 81) nearPieces.push(p);
    }
    nearDeploys.length = 0;
    for (const d of state.deploys) {
      if ((d.x - P.x) ** 2 + (d.z - P.z) ** 2 < 81) nearDeploys.push(d);
    }
  }

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
      if (d < min && d > 0.0001) { x = c.x + (dx / d) * min; z = c.z + (dz / d) * min; }
    }
    for (const d of nearDeploys) {
      const def = DEPLOY[d.type];
      if (!def || def.r < 0.7) continue;
      const dx = x - d.x, dz = z - d.z;
      const dist = Math.hypot(dx, dz), min = def.r + PLAYER_R;
      if (dist < min && dist > 0.0001) { x = d.x + (dx / dist) * min; z = d.z + (dz / dist) * min; }
    }
    for (const p of nearPieces) {
      if (p.kind !== "wall" && p.kind !== "doorway" && p.kind !== "door") continue;
      if (p.kind === "door" && p.open) continue;
      if (P.y + 1.6 < p.y || P.y > p.y + 3) continue;
      const along = (p.edge & 1) === 0;
      const hw = along ? World.GRID / 2 : 0.3;
      const hd = along ? 0.3 : World.GRID / 2;
      const dx = x - p.wx, dz = z - p.wz;
      if (Math.abs(dx) < hw + PLAYER_R && Math.abs(dz) < hd + PLAYER_R) {
        if (p.kind === "doorway" && Math.abs(along ? dx : dz) < 0.72) continue;
        const px = hw + PLAYER_R - Math.abs(dx), pz = hd + PLAYER_R - Math.abs(dz);
        if (px < pz) x = p.wx + Math.sign(dx || 1) * (hw + PLAYER_R);
        else z = p.wz + Math.sign(dz || 1) * (hd + PLAYER_R);
      }
    }
    return { x, z };
  }

  function updatePlayer(dt) {
    const mv = keyboardMove() || input.move;
    const mag = Math.hypot(mv.x, mv.y);
    const sprint = mag > 0.82 || input.keys.ShiftLeft;
    const speed = (P.inWater ? 2.6 : sprint ? 6.1 : 4.1) * clamp(mag * 1.6, 0, 1);

    if (mag > 0.06) {
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
      const c = collide(
        P.x + (fx * -mv.y + rx * mv.x) * speed * dt,
        P.z + (fz * -mv.y + rz * mv.x) * speed * dt
      );
      P.x = clamp(c.x, -World.SIZE / 2 + 2, World.SIZE / 2 - 2);
      P.z = clamp(c.z, -World.SIZE / 2 + 2, World.SIZE / 2 - 2);
    }

    const g = groundAt(P.x, P.z, P.y);
    P.inWater = g < World.WATER - 0.4 && P.y < World.WATER + 0.5;

    if (input.jump && P.onGround && !P.inWater) { P.vy = 7.1; P.onGround = false; }
    P.vy -= (P.inWater ? 6 : 22) * dt;
    P.y += P.vy * dt;

    if (P.inWater && P.y < World.WATER) {
      P.y = Math.max(P.y, World.WATER - 0.6);
      P.vy = Math.max(P.vy, 0);
      P.onGround = true;
    }
    if (P.y <= g) { P.y = g; P.vy = 0; P.onGround = true; }
    else if (P.y > g + 0.05) P.onGround = false;

    GL.cam.x = P.x; GL.cam.y = P.y + 1.62; GL.cam.z = P.z;
    GL.cam.yaw = P.yaw; GL.cam.pitch = P.pitch;
  }

  // ── Выживание ───────────────────────────────────────────────────────────
  function updateSurvival(dt) {
    P.hunger = clamp(P.hunger - DRAIN.hunger * dt, 0, 100);
    P.thirst = clamp(P.thirst - DRAIN.thirst * dt, 0, 100);

    let dmg = 0;
    if (P.hunger <= 0) dmg += STARVE;
    if (P.thirst <= 0) dmg += DEHYDRATE;
    const warm = burningFire(6) || (P.slot === 7 && P.tools.torch) || P.armor > 0;
    if (state.night > 0.35 && !warm) dmg += COLD * state.night;
    if (P.bleed > 0) {
      dmg += BLEED_DPS;
      P.bleed = Math.max(0, P.bleed - dt);
    }
    if (dmg > 0) hurt(dmg * dt, true);
    else if (P.hunger > 40 && P.thirst > 40 && P.hp < 100) P.hp = clamp(P.hp + REGEN * dt, 0, 100);

    for (const d of state.deploys) {
      if (d.type === "campfire" && d.fuel > 0) d.fuel -= dt;
    }
  }

  function hurt(amount, silent) {
    if (!P.alive) return;
    P.hp -= amount * (1 - Math.min(0.45, P.armor));
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
    P.bleed = 0;
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
    $("deadBag").textContent = Object.keys(drop).length
      ? "Половина припасов осталась мешком на месте смерти."
      : "Терять было нечего.";
    showScreen("dead");
    save();
  }

  function respawn() {
    const bag = deploysOf("bag")[0];
    if (bag) { P.x = bag.x; P.z = bag.z; }
    else { const s = beachSpot(); P.x = s.x; P.z = s.z; }
    P.y = World.height(P.x, P.z) + 0.2;
    P.hp = 60;
    P.hunger = Math.max(P.hunger, 45);
    P.thirst = Math.max(P.thirst, 45);
    P.alive = true; P.vy = 0; P.bleed = 0;
    state.mode = "play";
    hideScreens();
    save();
  }

  // ── Прицел ──────────────────────────────────────────────────────────────
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
        if (a.hp > 0 && (a.x - x) ** 2 + (a.z - z) ** 2 < 0.9 && y > a.y - 0.3 && y < a.y + 2) {
          return { kind: "animal", animal: a, dist: t };
        }
      }
      for (const r of state.raiders) {
        if (r.hp > 0 && (r.x - x) ** 2 + (r.z - z) ** 2 < 0.8 && y > r.y - 0.3 && y < r.y + 2.2) {
          return { kind: "raider", raider: r, dist: t };
        }
      }
      for (const l of state.loots) {
        if ((l.x - x) ** 2 + (l.z - z) ** 2 < 1 && Math.abs(l.y - y) < 1.4) {
          return { kind: "loot", loot: l, dist: t };
        }
      }
      for (const d of nearDeploys) {
        const def = DEPLOY[d.type];
        const r = (def ? def.r : 0.8) + 0.5;
        if ((d.x - x) ** 2 + (d.z - z) ** 2 < r * r && y > d.y - 0.6 && y < d.y + 2.4) {
          return { kind: "deploy", deploy: d, dist: t };
        }
      }
      for (const p of nearPieces) {
        if ((p.wx - x) ** 2 + (p.wz - z) ** 2 < 2.6 && y > p.y - 0.4 && y < p.y + 3.2) {
          if (!best) best = { kind: "piece", piece: p, dist: t };
        }
      }
    }
    return best;
  }

  function beltTool(i) {
    const slot = BELT[i];
    return slot ? slot.pick(P.tools) : null;
  }

  function currentTool() {
    const id = beltTool(P.slot) || "rock";
    return { id, def: TOOLS[id] };
  }

  const nodeClass = (type) =>
    type === "pine" || type === "oak" ? "tree"
      : type === "rock" ? "stone"
        : type === "ore" || type === "sulfur" || type === "hqmNode" ? "ore" : "soft";

  // ── Удар и стрельба ─────────────────────────────────────────────────────
  function swing() {
    const { def } = currentTool();
    if (def.build) return placeBuild();
    if (def.gun) return shoot(def);
    if (def.ammo) return shootProjectile(def);

    P.swing = def.rate;
    const t = state.aimTarget;
    if (!t) return;

    if (t.kind === "node") return hitNode(t.node, def);
    if (t.kind === "animal") {
      t.animal.hp -= def.dmg.flesh || 8;
      t.animal.fear = 6;
      Snd.hit();
      if (t.animal.hp <= 0) killAnimal(t.animal);
      return;
    }
    if (t.kind === "raider") {
      t.raider.hp -= def.dmg.flesh || 8;
      Snd.hit();
      if (t.raider.hp <= 0) killRaider(t.raider);
      return;
    }
    if (t.kind === "loot") return takeLoot(t.loot);
    if (t.kind === "deploy") return pickUpDeploy(t.deploy);
    if (t.kind === "piece") {
      if (def.repair) return upgradePiece(t.piece);
      const p = t.piece;
      p.hp -= 45;
      Snd.chop();
      if (p.hp <= 0) {
        World.removePiece(p);
        addInv("wood", 25);
        toast("Постройка разобрана: +25 дерево");
      }
      rebuildPieces();
    }
  }

  function hitNode(n, def) {
    const ndef = World.NODE_DEFS[n.type];
    const dmg = def.dmg[nodeClass(n.type)] || 5;
    n.hp -= dmg;
    if (ndef.give === "loot") {
      if (n.hp <= 0) {
        const table = n.type === "crate" ? Items.LOOT.crate : Items.LOOT.barrel;
        const got = Items.roll(table);
        const parts = [];
        for (const k in got) { addInv(k, got[k]); parts.push(`${got[k]} ${resName(k)}`); }
        toast("+" + parts.join(" · "));
      }
      Snd.stone();
    } else {
      const share = Math.max(1, Math.round((ndef.amount * dmg) / ndef.hp));
      addInv(ndef.give, share);
      toast(`+${share} ${resName(ndef.give)}`);
      if (n.type === "rock" || n.type === "ore" || n.type === "sulfur" || n.type === "hqmNode") Snd.stone();
      else Snd.chop();
    }
    if (n.hp <= 0) {
      n.alive = false;
      n.respawnAt = performance.now() / 1000 + ndef.respawn;
      batches[ndef.mesh].hide(n.idx);
      World.buildColliders();
    }
  }

  function shootProjectile(def) {
    if (inv(def.ammo) <= 0) { toast("Нет стрел", true); return; }
    addInv(def.ammo, -1);
    P.swing = def.rate;
    const f = GL.basis;
    state.arrows.push({
      x: GL.cam.x + f.fx * 0.6, y: GL.cam.y + f.fy * 0.6, z: GL.cam.z + f.fz * 0.6,
      vx: f.fx * def.proj.speed, vy: f.fy * def.proj.speed, vz: f.fz * def.proj.speed,
      dmg: def.proj.dmg, life: 4,
    });
    Snd.bow();
  }

  function shoot(def) {
    const g = def.gun;
    if (inv(g.ammo) <= 0) { toast("Нет патронов", true); return; }
    addInv(g.ammo, -1);
    P.swing = def.rate;
    Snd.shot();

    const f = GL.basis;
    const sx = f.fx + (Math.random() - 0.5) * g.spread;
    const sy = f.fy + (Math.random() - 0.5) * g.spread;
    const sz = f.fz + (Math.random() - 0.5) * g.spread;
    const len = Math.hypot(sx, sy, sz);
    const dx = sx / len, dy = sy / len, dz = sz / len;
    P.pitch = clamp(P.pitch + g.recoil, -1.35, 1.35);

    let hitAt = 160;
    let victim = null, head = false;
    for (let t = 1; t < 160; t += 0.4) {
      const x = GL.cam.x + dx * t, y = GL.cam.y + dy * t, z = GL.cam.z + dz * t;
      if (y < World.height(x, z)) { hitAt = t; break; }
      let found = null;
      for (const a of state.animals) {
        if (a.hp > 0 && (a.x - x) ** 2 + (a.z - z) ** 2 < 0.8 && y > a.y && y < a.y + 1.9) { found = a; break; }
      }
      if (!found) {
        for (const r of state.raiders) {
          if (r.hp > 0 && (r.x - x) ** 2 + (r.z - z) ** 2 < 0.7 && y > r.y && y < r.y + 2.1) { found = r; break; }
        }
      }
      if (found) {
        victim = found;
        head = y > found.y + 1.55;         // попадание в голову бьёт вдвое
        hitAt = t;
        break;
      }
    }

    state.tracers.push({
      x: GL.cam.x + dx * 1.2, y: GL.cam.y + dy * 1.2, z: GL.cam.z + dz * 1.2,
      dx, dy, dz, len: Math.min(hitAt, 60), life: 0.07,
    });

    if (victim) {
      victim.hp -= g.dmg * (head ? 2 : 1);
      if (victim.kind) { victim.fear = 6; if (victim.hp <= 0) killAnimal(victim); else Snd.hit(); }
      else if (victim.hp <= 0) killRaider(victim); else Snd.hit();
      if (head) toast("В голову!");
    }
  }

  function killAnimal(a) {
    a.hp = 0;
    const meat = a.kind === "deer" ? 4 : 2;
    addInv("meat", meat);
    addInv("cloth", a.kind === "deer" ? 4 : 2);
    addInv("leather", a.kind === "deer" ? 6 : 3);
    toast(`+${meat} сырое мясо · +кожа`);
    a.respawnAt = performance.now() / 1000 + 90;
  }

  function killRaider(r) {
    r.hp = 0;
    const got = Items.roll(Items.LOOT.crate);
    const parts = [];
    for (const k in got) { addInv(k, got[k]); parts.push(`${got[k]} ${resName(k)}`); }
    toast("Мародёр убит: +" + parts.join(" · "));
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

  function updateProjectiles(dt) {
    for (let i = state.arrows.length - 1; i >= 0; i--) {
      const a = state.arrows[i];
      a.life -= dt;
      a.vy -= 9.8 * dt;
      a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
      let hit = false;
      for (const t of state.animals) {
        if (t.hp > 0 && (t.x - a.x) ** 2 + (t.z - a.z) ** 2 < 0.8 && Math.abs(t.y + 0.9 - a.y) < 1.1) {
          t.hp -= a.dmg; t.fear = 6;
          if (t.hp <= 0) killAnimal(t); else Snd.hit();
          hit = true; break;
        }
      }
      if (!hit) {
        for (const r of state.raiders) {
          if (r.hp > 0 && (r.x - a.x) ** 2 + (r.z - a.z) ** 2 < 0.8 && Math.abs(r.y + 1 - a.y) < 1.3) {
            r.hp -= a.dmg;
            if (r.hp <= 0) killRaider(r); else Snd.hit();
            hit = true; break;
          }
        }
      }
      if (hit || a.life <= 0 || a.y < World.height(a.x, a.z)) state.arrows.splice(i, 1);
    }
    for (let i = state.tracers.length - 1; i >= 0; i--) {
      state.tracers[i].life -= dt;
      if (state.tracers[i].life <= 0) state.tracers.splice(i, 1);
    }
  }

  // ── Взаимодействие ──────────────────────────────────────────────────────
  function useAction() {
    if (state.mode !== "play") return;
    const t = state.aimTarget;

    if (t && t.kind === "deploy") return openDeploy(t.deploy);
    if (t && t.kind === "piece" && t.piece.kind === "door") {
      t.piece.open = !t.piece.open;
      rebuildPieces();
      Snd.hit();
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

    if (P.bleed > 0 && P.bandage > 0) {
      P.bandage--; P.bleed = 0;
      P.hp = clamp(P.hp + 30, 0, 100);
      toast("Кровь остановлена");
      Snd.eat();
      return;
    }
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

  function pickUpDeploy(d) {
    if (d.fixed) { toast("Это не сдвинуть", true); return; }
    if (d.type === "campfire" || d.type === "bag") {
      state.deploys.splice(state.deploys.indexOf(d), 1);
      addInv(d.type, 1);
      rebuildDeploys();
      toast(`${DEPLOY[d.type].name} убран в рюкзак`);
      return;
    }
    toast("Сначала забери содержимое", true);
  }

  // ── Стройка ─────────────────────────────────────────────────────────────
  function buildMenu() {
    // Список того, что сейчас можно поставить: части базы плюс предметы в рюкзаке.
    const list = BUILD.map((b) => ({ ...b, type: "piece" }));
    list.push({ id: "upgrade", short: "УЛУЧШ", name: "Улучшить постройку", type: "upgrade" });
    for (const id in DEPLOY) {
      if (inv(id) > 0) {
        list.push({ id, short: `${DEPLOY[id].short} ${inv(id)}`, name: DEPLOY[id].name, type: "deploy" });
      }
    }
    return list;
  }

  function buildTarget() {
    const f = GL.basis;
    const x = GL.cam.x + f.fx * 5.5, z = GL.cam.z + f.fz * 5.5;
    const gx = Math.round(x / World.GRID), gz = Math.round(z / World.GRID);
    const cx = gx * World.GRID, cz = gz * World.GRID;
    const dx = x - cx, dz = z - cz;
    const edge = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : (dz > 0 ? 2 : 0);
    return { gx, gz, edge, x: cx, z: cz };
  }

  function updateGhost() {
    const menu = buildMenu();
    state.buildIdx = clamp(state.buildIdx, 0, menu.length - 1);
    const b = menu[state.buildIdx];
    const t = buildTarget();
    let ok = true;
    let y = World.foundationY(t.gx, t.gz);

    if (b.type === "piece") {
      ok = canPay(b.cost);
      if (b.id === "foundation") {
        if (World.findPiece("foundation", t.gx, t.gz, 0) || World.height(t.x, t.z) < 0.6) ok = false;
      } else if (b.id === "wall" || b.id === "doorway") {
        if (!World.findPiece("foundation", t.gx, t.gz, 0)) ok = false;
        else {
          y = World.levelY(t.gx, t.gz, 0);
          if (World.findPiece("wall", t.gx, t.gz, 0, t.edge) || World.findPiece("doorway", t.gx, t.gz, 0, t.edge)) ok = false;
        }
      } else if (b.id === "door") {
        const d = World.findPiece("doorway", t.gx, t.gz, 0, t.edge);
        if (!d || World.findPiece("door", t.gx, t.gz, 0, t.edge)) ok = false;
        else y = d.y;
      } else if (b.id === "ceiling") {
        if (!World.findPiece("foundation", t.gx, t.gz, 0) || World.findPiece("ceiling", t.gx, t.gz, 0)) ok = false;
        else y = World.levelY(t.gx, t.gz, 0) + 3;
      }
    } else if (b.type === "deploy") {
      const f = GL.basis;
      y = World.height(GL.cam.x + f.fx * 3.2, GL.cam.z + f.fz * 3.2);
      ok = inv(b.id) > 0 && y > 0.6;
      for (const d of state.deploys) {
        if ((d.x - (GL.cam.x + f.fx * 3.2)) ** 2 + (d.z - (GL.cam.z + f.fz * 3.2)) ** 2 < 2.2) ok = false;
      }
    } else {
      const target = state.aimTarget;
      ok = !!(target && target.kind === "piece" && nextTier(target.piece));
      if (ok) ok = canPay(TIER_UP[nextTier(state.aimTarget.piece)]);
    }

    state.buildOK = ok;
    state.ghost = { b, t, y, menu };
  }

  const nextTier = (p) => TIERS[TIERS.indexOf(p.tier) + 1] || null;

  function upgradePiece(p) {
    const next = nextTier(p);
    if (!next) { toast("Уже броня — дальше некуда", true); return; }
    const cost = TIER_UP[next];
    if (!canPay(cost)) { toast(`Нужно: ${costText(cost)}`, true); return; }
    pay(cost);
    p.tier = next;
    p.maxHp = World.PIECE_HP[next];
    p.hp = p.maxHp;
    rebuildPieces();
    toast(`Улучшено: ${TIER_NAME[next]}`);
    Snd.craft();
    P.swing = 0.5;
  }

  function placeBuild() {
    updateGhost();
    const { b, t, y } = state.ghost;
    P.swing = 0.45;

    if (!state.buildOK) {
      if (b.type === "piece" && !canPay(b.cost)) toast(`Нужно: ${costText(b.cost)}`, true);
      else toast("Здесь не поставить", true);
      return;
    }

    if (b.type === "upgrade") return upgradePiece(state.aimTarget.piece);

    if (b.type === "deploy") {
      const f = GL.basis;
      const dx = GL.cam.x + f.fx * 3.2, dz = GL.cam.z + f.fz * 3.2;
      addInv(b.id, -1);
      const d = { type: b.id, x: dx, y, z: dz, rot: P.yaw + Math.PI };
      if (b.id === "campfire") d.fuel = 240;
      if (DEPLOY[b.id].smelt) { d.fuel = 0; d.ore = {}; d.out = {}; d.burn = 0; }
      if (DEPLOY[b.id].store) d.items = {};
      if (b.id === "tc") { d.items = {}; }
      if (b.id === "bag") {
        for (const old of deploysOf("bag")) state.deploys.splice(state.deploys.indexOf(old), 1);
      }
      state.deploys.push(d);
      rebuildDeploys();
      toast(`${DEPLOY[b.id].name} поставлен`);
      Snd.craft();
      save();
      return;
    }

    pay(b.cost);
    World.addPiece(b.id, t.gx, t.gz, 0, t.edge, "wood");
    rebuildPieces();
    Snd.craft();
  }

  // ── Крафт, чертежи, технологии ──────────────────────────────────────────
  let craftTab = "tools";

  function recipeState(r) {
    const lvl = benchLevel();
    if (r.bp && !P.bp[r.id]) return { ok: false, why: "нужен чертёж", lock: true };
    if (r.wb > lvl) return { ok: false, why: `нужен верстак ${r.wb}`, lock: true };
    if (!canPay(r.cost)) return { ok: false, why: "не хватает материалов" };
    return { ok: true, why: "" };
  }

  function craft(r) {
    const st = recipeState(r);
    if (!st.ok) { toast(st.why, true); return; }
    if (r.needFire && !burningFire(4.5)) { toast("Нужен горящий костёр рядом", true); return; }
    pay(r.cost);
    if (r.kind === "tool") {
      P.tools[r.tool] = true;
      const slot = BELT.findIndex((s) => s.pick(P.tools) === r.tool);
      if (slot >= 0) selectSlot(slot);
    } else if (r.kind === "deploy") {
      addInv(r.deploy, 1);
    } else if (r.give) {
      for (const k in r.give) {
        if (k === "bandage") P.bandage += r.give[k];
        else if (k === "armorHide") P.armor = Math.max(P.armor, 0.18);
        else if (k === "armorMetal") P.armor = Math.max(P.armor, 0.38);
        else addInv(k, r.give[k]);
      }
    }
    toast(`Готово: ${r.name}`);
    Snd.craft();
    renderCraft();
    save();
  }

  function renderCraft() {
    const list = $("recipes");
    if (!list) return;
    const lvl = benchLevel();
    $("craftBench").textContent = lvl ? `Рядом верстак ${lvl}` : "Верстака рядом нет";
    $("craftBench").className = "eyebrow" + (lvl ? "" : " off");
    list.innerHTML = "";
    for (const r of Items.RECIPES) {
      if (r.tab !== craftTab) continue;
      const st = recipeState(r);
      const owned = r.kind === "tool" && P.tools[r.tool];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "recipe " + (owned ? "cant" : st.ok ? "can" : "cant");
      const badge = r.wb ? `<i class="wb">В${r.wb}</i>` : "";
      const note = owned ? "уже есть" : st.lock ? st.why : r.note;
      btn.innerHTML = `<u>${r.icon}</u><span><b>${r.name}${badge}</b><em>${note}</em></span><s>${costText(r.cost)}</s>`;
      btn.addEventListener("click", () => { if (!owned) craft(r); });
      list.appendChild(btn);
    }
    for (const t of document.querySelectorAll("#craft .tab")) {
      t.classList.toggle("on", t.dataset.tab === craftTab);
    }
  }

  function techCost(r) {
    return { scrap: r.scrap };
  }

  function unlock(node) {
    const r = Items.BY_ID[node.id];
    if (P.bp[node.id]) return;
    if (node.need && !P.bp[node.need]) { toast(`Сначала: ${Items.BY_ID[node.need].name}`, true); return; }
    const lvl = benchLevel();
    if (lvl < node.wbLevel) { toast(`Нужен верстак ${node.wbLevel} рядом`, true); return; }
    if (inv("scrap") < node.scrap) { toast(`Нужно ${node.scrap} лома`, true); return; }
    addInv("scrap", -node.scrap);
    P.bp[node.id] = true;
    toast(`Изучено: ${r.name}`);
    Snd.learn();
    renderTech();
    save();
  }

  function renderTech() {
    const wrap = $("techList");
    if (!wrap) return;
    const lvl = benchLevel();
    $("techBench").textContent = lvl ? `Рядом верстак ${lvl}` : "Верстака рядом нет";
    $("techBench").className = "eyebrow" + (lvl ? "" : " off");
    $("techScrap").textContent = inv("scrap");
    wrap.innerHTML = "";
    for (const branch of Items.TECH) {
      const h = document.createElement("h3");
      h.className = "branch";
      h.textContent = `Ветка верстака ${branch.wb}`;
      wrap.appendChild(h);
      for (const node of branch.nodes) {
        node.wbLevel = branch.wb;
        const r = Items.BY_ID[node.id];
        const have = P.bp[node.id];
        const blocked = node.need && !P.bp[node.need];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "recipe " + (have ? "known" : blocked || lvl < branch.wb || inv("scrap") < node.scrap ? "cant" : "can");
        btn.innerHTML = `<u>${r.icon}</u><span><b>${r.name}</b><em>${have ? "изучено" : blocked ? `после: ${Items.BY_ID[node.need].name}` : r.note}</em></span>` +
          `<s>${have ? "✓" : node.scrap + " лом"}</s>`;
        btn.addEventListener("click", () => unlock(node));
        wrap.appendChild(btn);
      }
    }
  }

  // Исследовательский стол: собрал образец — получил чертёж.
  function renderResearch() {
    const wrap = $("researchList");
    wrap.innerHTML = "";
    const price = { 0: 20, 1: 75, 2: 125, 3: 250 };
    for (const r of Items.RECIPES) {
      if (!r.bp || P.bp[r.id]) continue;
      const scrap = price[r.wb] || 75;
      const affordable = canPay(r.cost) && inv("scrap") >= scrap;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "recipe " + (affordable ? "can" : "cant");
      btn.innerHTML = `<u>${r.icon}</u><span><b>${r.name}</b><em>разобрать образец на чертёж</em></span>` +
        `<s>${costText(r.cost)} + ${scrap} лом</s>`;
      btn.addEventListener("click", () => {
        if (!affordable) { toast("Нужен образец и лом", true); return; }
        pay(r.cost);
        addInv("scrap", -scrap);
        P.bp[r.id] = true;
        toast(`Чертёж получен: ${r.name}`);
        Snd.learn();
        renderResearch();
        save();
      });
      wrap.appendChild(btn);
    }
    if (!wrap.children.length) {
      wrap.innerHTML = '<p class="lede">Всё, что можно изучить, уже изучено.</p>';
    }
  }

  // ── Печь, ящик, шкаф, переработчик ──────────────────────────────────────
  function openDeploy(d) {
    const def = DEPLOY[d.type];
    state.openDeploy = d;
    if (def.smelt) { renderFurnace(); showScreen("furnace"); return; }
    if (def.store || d.type === "tc") { renderStore(); showScreen("store"); return; }
    if (d.type === "research") { renderResearch(); showScreen("research"); return; }
    if (d.type === "recycler") { renderRecycler(); showScreen("recycler"); return; }
    if (d.type === "campfire") {
      if (inv("wood") >= 20) {
        addInv("wood", -20);
        d.fuel = (d.fuel || 0) + 120;
        toast("В костёр подброшено дров");
        Snd.craft();
      } else toast("Нужно 20 дерева", true);
      return;
    }
    if (def.wb) { toast(`${def.name}: рецепты открыты, пока стоишь рядом`); return; }
    if (d.type === "bag") { toast("Здесь ты очнёшься после смерти"); return; }
  }

  function updateFurnaces(dt) {
    for (const d of state.deploys) {
      const def = DEPLOY[d.type];
      if (!def || !def.smelt || !d.ore) continue;
      if (d.fuel <= 0) continue;
      const keys = Object.keys(d.ore).filter((k) => d.ore[k] > 0);
      if (!keys.length) continue;

      d.burn = (d.burn || 0) + dt * def.smelt;
      d.fuel -= dt * def.smelt * 0.5;
      const k = keys[0];
      const rule = Items.SMELT[k];
      if (!rule) { delete d.ore[k]; continue; }
      // За кадр может «догореть» сразу несколько порций: на телефоне кадр
      // короткий, но игру можно свернуть и вернуться.
      let guard = 0;
      while (d.burn >= rule.time && d.ore[k] > 0 && guard++ < 500) {
        const take = rule.ratio || 1;
        if (d.ore[k] < take) { d.burn = 0; break; }
        d.burn -= rule.time;
        d.ore[k] -= take;
        d.out[rule.out] = (d.out[rule.out] || 0) + rule.amount;
      }
      if (d.ore[k] <= 0) delete d.ore[k];
    }
  }

  function renderFurnace() {
    const d = state.openDeploy;
    if (!d) return;
    $("furnaceTitle").textContent = DEPLOY[d.type].name;
    $("furnaceFuel").textContent = Math.max(0, Math.round(d.fuel || 0));
    const rows = [];
    const line = (label, obj) => {
      const keys = Object.keys(obj || {}).filter((k) => obj[k] > 0);
      return `<div class="srow"><i>${label}</i><b>${keys.length ? keys.map((k) => `${obj[k]} ${resName(k)}`).join(" · ") : "пусто"}</b></div>`;
    };
    rows.push(line("В печи", d.ore));
    rows.push(line("Готово", d.out));
    $("furnaceState").innerHTML = rows.join("");

    const acts = $("furnaceActions");
    acts.innerHTML = "";
    const addBtn = (text, fn, ghost) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "big-btn" + (ghost ? " ghost" : "");
      b.textContent = text;
      b.addEventListener("click", fn);
      acts.appendChild(b);
    };
    addBtn("Заложить дрова (50)", () => {
      const n = Math.min(50, inv("wood"));
      if (!n) return toast("Нет дерева", true);
      addInv("wood", -n);
      d.fuel = (d.fuel || 0) + n * 4;
      renderFurnace(); Snd.craft();
    });
    for (const ore of ["metalOre", "sulfurOre", "hqmOre", "wood"]) {
      if (inv(ore) <= 0) continue;
      addBtn(`Загрузить ${resName(ore)} (${inv(ore)})`, () => {
        d.ore[ore] = (d.ore[ore] || 0) + inv(ore);
        P.inv[ore] = 0;
        renderFurnace(); Snd.craft();
      }, true);
    }
    addBtn("Забрать готовое", () => {
      let any = false;
      for (const k in d.out) { if (d.out[k] > 0) { addInv(k, d.out[k]); any = true; } }
      d.out = {};
      toast(any ? "Забрано из печи" : "Пока пусто", !any);
      renderFurnace(); save();
    }, true);
  }

  function renderStore() {
    const d = state.openDeploy;
    if (!d) return;
    const isTC = d.type === "tc";
    $("storeTitle").textContent = DEPLOY[d.type].name;
    $("storeHint").textContent = isTC
      ? "Из шкафа списывается налог: пока в нём есть материалы, база не разрушается."
      : "Всё, что положено сюда, не теряется при смерти.";
    const wrap = $("storeList");
    wrap.innerHTML = "";
    const keys = new Set([...Object.keys(d.items || {}), ...Object.keys(P.inv)]);
    for (const k of keys) {
      const here = (d.items && d.items[k]) || 0;
      const mine = inv(k);
      if (!here && !mine) continue;
      const row = document.createElement("div");
      row.className = "srow store";
      row.innerHTML = `<i>${RES[k] ? RES[k].icon : "📦"} ${resName(k)}</i><b>${here}</b>`;
      const put = document.createElement("button");
      put.type = "button"; put.className = "mini"; put.textContent = `положить ${mine}`;
      put.disabled = !mine;
      put.addEventListener("click", () => {
        d.items[k] = here + mine; P.inv[k] = 0; renderStore(); save();
      });
      const take = document.createElement("button");
      take.type = "button"; take.className = "mini"; take.textContent = `забрать ${here}`;
      take.disabled = !here;
      take.addEventListener("click", () => {
        addInv(k, here); delete d.items[k]; renderStore(); save();
      });
      row.appendChild(put); row.appendChild(take);
      wrap.appendChild(row);
    }
    if (!wrap.children.length) wrap.innerHTML = '<p class="lede">И здесь, и в рюкзаке пусто.</p>';
  }

  function renderRecycler() {
    const wrap = $("recyclerList");
    wrap.innerHTML = "";
    let any = false;
    for (const k in Items.RECYCLE) {
      if (inv(k) <= 0) continue;
      any = true;
      const out = Items.RECYCLE[k];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "recipe can";
      btn.innerHTML = `<u>${RES[k].icon}</u><span><b>${resName(k)} ×${inv(k)}</b><em>${Object.keys(out).map((o) => `${out[o]} ${resName(o)}`).join(" · ")} за штуку</em></span><s>переработать</s>`;
      btn.addEventListener("click", () => {
        const n = inv(k);
        P.inv[k] = 0;
        for (const o in out) addInv(o, out[o] * n);
        toast(`Переработано: ${n} ${resName(k)}`);
        Snd.craft();
        renderRecycler();
        save();
      });
      wrap.appendChild(btn);
    }
    if (!any) wrap.innerHTML = '<p class="lede">Компонентов нет. Их находят в бочках и ящиках у руин.</p>';
  }

  // ── Налог и распад ──────────────────────────────────────────────────────
  function updateUpkeep(now) {
    if (now < state.upkeepAt) return;
    state.upkeepAt = now + UPKEEP_EVERY;
    const pieces = World.pieces.length;
    if (!pieces) return;
    const tc = deploysOf("tc")[0];
    const need = Math.ceil(pieces * 2);
    if (!tc) {
      for (const p of World.pieces) p.hp = Math.max(1, p.hp - p.maxHp * 0.02);
      state.upkeepFail = true;
      rebuildPieces();
      return;
    }
    const have = (tc.items && tc.items.wood) || 0;
    if (have >= need) {
      tc.items.wood = have - need;
      state.upkeepFail = false;
    } else {
      tc.items.wood = 0;
      state.upkeepFail = true;
      for (const p of World.pieces) p.hp = Math.max(1, p.hp - p.maxHp * 0.01);
      rebuildPieces();
      toast("В шкафу кончилось дерево: база ветшает", true);
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
            a.x = x; a.z = z; a.y = World.height(x, z); a.hp = a.max; a.respawnAt = 0;
          }
        }
        continue;
      }
      const dist = Math.hypot(a.x - P.x, a.z - P.z);
      a.t -= dt;
      if (a.fear > 0) a.fear -= dt;

      if (a.kind === "deer") {
        if (dist < 16 || a.fear > 0) stepToward(a, a.x + (a.x - P.x), a.z + (a.z - P.z), 7.5, dt);
        else if (a.t <= 0) { a.dir = Math.random() * 6.28; a.t = 2 + Math.random() * 4; }
        else stepToward(a, a.x + Math.sin(a.dir), a.z + Math.cos(a.dir), 1.4, dt);
      } else {
        const aggressive = state.night > 0.2 || dist < 12;
        if (aggressive && dist < 34 && P.alive) {
          stepToward(a, P.x, P.z, 4.6, dt);
          a.attack -= dt;
          if (dist < 2.1 && a.attack <= 0) {
            a.attack = 1.3;
            hurt(12);
            if (Math.random() > 0.5) P.bleed = 6;
          }
        } else if (a.t <= 0) { a.dir = Math.random() * 6.28; a.t = 3 + Math.random() * 4; }
        else stepToward(a, a.x + Math.sin(a.dir), a.z + Math.cos(a.dir), 1.8, dt);
      }
    }
  }

  function wallBetween(x0, z0, x1, z1) {
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      for (const p of World.pieces) {
        if (p.kind !== "wall" && p.kind !== "doorway" && p.kind !== "door") continue;
        if (p.kind === "door" && p.open) continue;
        if ((p.wx - x) ** 2 + (p.wz - z) ** 2 < 2.2) return p;
      }
    }
    return null;
  }

  function updateRaiders(dt) {
    for (let i = state.raiders.length - 1; i >= 0; i--) {
      const r = state.raiders[i];
      if (r.hp <= 0 || state.night < 0.05) { state.raiders.splice(i, 1); continue; }
      const dist = Math.hypot(r.x - P.x, r.z - P.z);
      r.attack -= dt;

      if (dist < 60 && P.alive) {
        const blocking = wallBetween(r.x, r.z, P.x, P.z);
        if (blocking && dist < 30) {
          stepToward(r, blocking.wx, blocking.wz, 2.6, dt);
          if (Math.hypot(r.x - blocking.wx, r.z - blocking.wz) < 2.2 && r.attack <= 0) {
            r.attack = 1.5;
            blocking.hp -= r.armed ? 45 : 25;
            Snd.chop();
            if (blocking.hp <= 0) { World.removePiece(blocking); toast("Стену пробили!", true); }
            rebuildPieces();
          }
        } else if (r.armed && dist > 6 && dist < 40) {
          // Вооружённый стреляет с дистанции — прятаться за стеной стало важно.
          if (r.attack <= 0) {
            r.attack = 2.2;
            stepToward(r, P.x, P.z, 1.2, dt);
            Snd.shot();
            if (Math.random() > 0.45) {
              hurt(9);
              if (Math.random() > 0.6) P.bleed = 5;
            }
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
    const dayness = t < NIGHT_FROM ? Math.min(1, Math.sin((t / NIGHT_FROM) * Math.PI) * 1.6) : 0;
    state.night = 1 - dayness;

    const sunAngle = (t / NIGHT_FROM) * Math.PI;
    const sx = Math.cos(sunAngle), sy = Math.max(-0.2, Math.sin(sunAngle));
    const len = Math.hypot(sx, sy) || 1;
    GL.env.sun = [sx / len, sy / len, 0.25];

    const k = dayness;
    const warm = clamp(1 - Math.abs(t / NIGHT_FROM - 0.5) * 2, 0, 1);
    GL.env.sunColor = [0.35 + 0.75 * k, 0.32 + 0.66 * k * (0.7 + 0.3 * warm), 0.30 + 0.5 * k];
    GL.env.ambient = [0.13 + 0.25 * k, 0.14 + 0.26 * k, 0.20 + 0.24 * k];
    GL.env.fog = [0.06 + 0.56 * k, 0.08 + 0.62 * k, 0.12 + 0.66 * k];
    GL.env.skyTop = [0.03 + 0.21 * k, 0.05 + 0.40 * k, 0.12 + 0.63 * k];
    GL.env.skyBottom = [0.06 + 0.66 * k * (0.6 + 0.4 * (1 - warm)), 0.08 + 0.74 * k, 0.14 + 0.76 * k];
    GL.env.night = state.night;
    GL.env.fogFar = 110 + 110 * k;
    GL.env.fogNear = 20 + 30 * k;

    if (state.night > 0.5 && state.spawnedNight !== P.day) {
      state.spawnedNight = P.day;
      spawnRaiders(Math.min(6, 1 + Math.floor(P.day / 2)));
    }
  }

  let respawnTick = 0;
  function updateRespawn(dt) {
    respawnTick -= dt;
    if (respawnTick > 0) return;
    respawnTick = 0.5;
    const now = performance.now() / 1000;
    for (const n of World.nodes) {
      if (!n.alive && n.respawnAt && now > n.respawnAt) {
        n.alive = true;
        n.hp = n.maxHp;
        n.respawnAt = 0;
        const def = World.NODE_DEFS[n.type];
        const wind = def.mesh === "pine" || def.mesh === "oak" || def.mesh === "hemp" ? 1 : 0;
        batches[def.mesh].set(n.idx, n.x, n.y, n.z, n.scale, n.scale, n.rot, n.tint, n.tint, n.tint, wind);
        World.buildColliders();
      }
    }
  }

  // ── Отрисовка ───────────────────────────────────────────────────────────
  function drawDynamic(time) {
    batches.flame.clear(); batches.loot.clear(); batches.deer.clear();
    batches.wolf.clear(); batches.raider.clear(); batches.arrowMesh.clear();

    const lights = [];
    for (const d of state.deploys) {
      if (d.type === "campfire" && d.fuel > 0) {
        const flick = 0.85 + Math.sin(time * 9 + d.x) * 0.15;
        batches.flame.add(d.x, d.y + 0.15, d.z, flick, flick * 1.15, time * 2, 1, 0.75, 0.35, 0);
        lights.push({ x: d.x, y: d.y + 1, z: d.z, r: 14, col: [0.9, 0.45, 0.16] });
      }
      if (DEPLOY[d.type] && DEPLOY[d.type].smelt && d.fuel > 0 && Object.keys(d.ore || {}).length) {
        lights.push({ x: d.x, y: d.y + 0.6, z: d.z, r: 9, col: [0.85, 0.40, 0.12] });
      }
    }
    if (P.slot === 7 && P.tools.torch) {
      lights.push({ x: P.x, y: P.y + 1.4, z: P.z, r: 11, col: [0.8, 0.42, 0.15] });
    }
    lights.sort((a, b) => ((a.x - P.x) ** 2 + (a.z - P.z) ** 2) - ((b.x - P.x) ** 2 + (b.z - P.z) ** 2));
    GL.setLights(lights.slice(0, 4));

    for (const l of state.loots) batches.loot.add(l.x, l.y + 0.1, l.z, 1, 1, time * 0.7, 1, 0.9, 0.6, 0);
    for (const a of state.animals) {
      if (a.hp <= 0) continue;
      const b = a.kind === "deer" ? batches.deer : batches.wolf;
      const t = clamp(a.hp / a.max, 0.45, 1);
      b.add(a.x, a.y, a.z, 1, 1, a.dir, 1, t, t, 0);
    }
    for (const r of state.raiders) {
      const t = clamp(r.hp / r.max, 0.4, 1);
      batches.raider.add(r.x, r.y, r.z, 1, 1, r.dir || 0, r.armed ? 1 : 0.85, t * 0.9, t * 0.8, 0);
    }
    for (const a of state.arrows) {
      batches.arrowMesh.add(a.x, a.y, a.z, 1, 1, Math.atan2(a.vx, a.vz), 1, 1, 1, 0);
    }
    for (const tr of state.tracers) {
      batches.arrowMesh.add(tr.x, tr.y, tr.z, 1, tr.len, Math.atan2(tr.dx, tr.dz), 1.6, 1.3, 0.7, 0);
    }

    if (state.mode === "play" && currentTool().def.build && state.ghost) {
      const g = state.ghost;
      const col = state.buildOK ? [0.4, 1, 0.5] : [1, 0.4, 0.35];
      if (g.b.type === "piece") {
        const isWall = g.b.id === "wall" || g.b.id === "doorway" || g.b.id === "door";
        const off = World.GRID / 2;
        const pos = isWall
          ? [[g.t.x, g.t.z - off, 0], [g.t.x + off, g.t.z, Math.PI / 2], [g.t.x, g.t.z + off, 0], [g.t.x - off, g.t.z, Math.PI / 2]][g.t.edge & 3]
          : [g.t.x, g.t.z, 0];
        batches[g.b.id].add(pos[0], g.y, pos[1], 1, 1, pos[2], col[0], col[1], col[2], 0);
      } else if (g.b.type === "deploy") {
        const f = GL.basis;
        batches[g.b.id].add(GL.cam.x + f.fx * 3.2, g.y, GL.cam.z + f.fz * 3.2, 1, 1, P.yaw + Math.PI, col[0], col[1], col[2], 0);
      }
    }
  }

  const DRAW_ORDER = ["pine", "oak", "rock", "ore", "sulfurNode", "hqmNode", "bush", "hemp", "barrel", "crate",
    "ruin", "antenna", "spring", "foundation", "wall", "doorway", "door", "ceiling",
    "loot", "deer", "wolf", "raider", "arrowMesh"];

  function render(time) {
    GL.beginFrame(time);
    batches.terrain.draw();
    for (const k of DRAW_ORDER) batches[k].draw();
    for (const id in DEPLOY) batches[id].draw();
    batches.flame.draw();
    GL.blend(true);
    batches.water.draw(0.72);
    GL.blend(false);
  }

  // ── Интерфейс ───────────────────────────────────────────────────────────
  let hudTick = 0;

  const CARD = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];
  const ARROW = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

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
    $("hpBar").classList.toggle("bleeding", P.bleed > 0);

    const hour = Math.floor(P.time * 24);
    const min = Math.floor((P.time * 24 - hour) * 60);
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
      (state.night > 0.35 ? " · <b>НОЧЬ</b>" : "") + guide +
      (state.upkeepFail && World.pieces.length ? ' · <b class="warn">БАЗА ВЕТШАЕТ</b>' : "");

    const rows = [];
    for (const k of ["wood", "stone", "metal", "sulfur", "hqm", "coal", "gunpowder", "scrap", "cloth", "leather", "cooked", "arrows", "pistolAmmo", "rifleAmmo"]) {
      if (inv(k)) rows.push(`<i>${resName(k)}</i><b>${inv(k)}</b>`);
    }
    if (P.bandage) rows.push(`<i>бинты</i><b>${P.bandage}</b>`);
    $("pack").innerHTML = rows.slice(0, 9).join("");

    const t = state.aimTarget;
    const tEl = $("target");
    if (t && state.mode === "play") {
      let title = "", sub = "", frac = 0;
      if (t.kind === "node") {
        const names = {
          pine: "Сосна", oak: "Дуб", rock: "Камень", ore: "Металлическая руда",
          sulfur: "Серная руда", hqmNode: "Руда ВКМ", bush: "Куст ягод",
          hemp: "Конопля", barrel: "Бочка", crate: "Ящик",
        };
        const def = World.NODE_DEFS[t.node.type];
        title = names[t.node.type] || t.node.type;
        sub = def.tool === "axe" ? "нужен топор" : def.tool === "pick" ? "нужна кирка" : "бей чем угодно";
        frac = t.node.hp / t.node.maxHp;
      } else if (t.kind === "animal") {
        title = t.animal.kind === "deer" ? "Олень" : "Волк";
        sub = t.animal.kind === "deer" ? "мясо, ткань, кожа" : "опасен";
        frac = t.animal.hp / t.animal.max;
      } else if (t.kind === "raider") {
        title = t.raider.armed ? "Мародёр с оружием" : "Мародёр";
        sub = "лом и компоненты";
        frac = t.raider.hp / t.raider.max;
      } else if (t.kind === "deploy") {
        const def = DEPLOY[t.deploy.type];
        title = def.name;
        sub = def.smelt ? (t.deploy.fuel > 0 ? "горит" : "нужны дрова") :
          def.store || t.deploy.type === "tc" ? "ВЗЯТЬ — открыть" :
            def.wb ? "рецепты открыты рядом" : "ВЗЯТЬ — использовать";
        frac = 1;
      } else if (t.kind === "piece") {
        const names = { foundation: "Фундамент", wall: "Стена", doorway: "Проём", door: "Дверь", ceiling: "Потолок" };
        title = `${names[t.piece.kind]} · ${TIER_NAME[t.piece.tier]}`;
        sub = t.piece.kind === "door" ? "ВЗЯТЬ — открыть" : "молотком — улучшить";
        frac = t.piece.hp / t.piece.maxHp;
      } else if (t.kind === "loot") { title = "Мешок"; sub = "ВЗЯТЬ — забрать"; frac = 1; }
      tEl.innerHTML = `${title}<em>${sub}</em><span class="tbar"><i style="transform:scaleX(${frac})"></i></span>`;
      tEl.style.display = "";
    } else if (state.mode === "play" && World.springs.some((s) => (s.x - P.x) ** 2 + (s.z - P.z) ** 2 < 9)) {
      tEl.innerHTML = 'Родник<em>ВЗЯТЬ — напиться</em>';
      tEl.style.display = "";
    } else tEl.style.display = "none";

    const slots = $("hotbar").children;
    for (let i = 0; i < slots.length; i++) {
      const id = beltTool(i);
      const def = id ? TOOLS[id] : null;
      slots[i].classList.toggle("on", P.slot === i);
      slots[i].style.opacity = def ? "1" : "0.3";
      const ammo = def && (def.ammo || (def.gun && def.gun.ammo));
      slots[i].innerHTML = def
        ? `<u>${def.icon}</u>${ammo ? `<em>${inv(ammo)}</em>` : ""}`
        : `<u>·</u>`;
    }

    const building = currentTool().def.build;
    $("buildbar").hidden = !building;
    if (building) renderBuildBar();
  }

  let buildBarSig = "";
  function renderBuildBar() {
    const menu = buildMenu();
    const sig = menu.map((m) => m.short).join("|") + ":" + state.buildIdx;
    if (sig === buildBarSig) return;
    buildBarSig = sig;
    const bar = $("buildbar");
    bar.innerHTML = "";
    menu.forEach((b, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.textContent = b.short;
      el.className = i === state.buildIdx ? "on" : "";
      el.addEventListener("click", () => { state.buildIdx = i; buildBarSig = ""; hudTick = 0; });
      bar.appendChild(el);
    });
  }

  function selectSlot(i) {
    P.slot = clamp(i, 0, BELT.length - 1);
    hudTick = 0;
    buildBarSig = "";
  }

  function showScreen(id) {
    input.action = false;
    for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== id;
    if (id === "craft") renderCraft();
    if (id === "tech") renderTech();
  }
  function hideScreens() {
    for (const s of document.querySelectorAll(".screen")) s.hidden = true;
    state.openDeploy = null;
  }
  function toggleScreen(id) {
    if ($(id).hidden) showScreen(id); else hideScreens();
  }

  // ── Цикл ────────────────────────────────────────────────────────────────
  let last = 0;

  function frame(ts) {
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts;
    const time = ts / 1000;
    const screenOpen = !!document.querySelector(".screen:not([hidden])");

    if (state.mode === "play" && !screenOpen) {
      refreshCandidates();
      updateTime(dt);
      updatePlayer(dt);
      updateSurvival(dt);
      updateAnimals(dt);
      updateRaiders(dt);
      updateProjectiles(dt);
      updateRespawn(dt);
      updateFurnaces(dt);
      updateUpkeep(time);
      state.aimTarget = aim();
      if (currentTool().def.build) updateGhost();
      P.swing -= dt;
      if (input.action && P.swing <= 0) swing();
      $("cross").classList.toggle("hit", !!state.aimTarget);
      if (ts - state.lastSave > 20000) save();
    } else if (state.mode === "play" && screenOpen) {
      updateFurnaces(dt);          // печь работает, пока смотришь в меню
    }

    drawDynamic(time);
    render(time);
    updateHud(dt);
    requestAnimationFrame(frame);
  }

  // ── Сборка страницы ─────────────────────────────────────────────────────
  function buildHud() {
    $("hud").innerHTML = `
      <div class="vitals">
        <span class="bar hp" id="hpBar"><i id="hpFill"></i><span>ЗДОРОВЬЕ <b id="hpText">100</b></span></span>
        <span class="bar food"><i id="foodFill"></i><span>ГОЛОД <b id="foodText">100</b></span></span>
        <span class="bar water"><i id="waterFill"></i><span>ЖАЖДА <b id="waterText">100</b></span></span>
        <div class="clock" id="clock">ДЕНЬ 1</div>
      </div>
      <div class="pack" id="pack"></div>
      <div class="top-btns">
        <button class="ui-btn" id="btnCraft" type="button">Крафт</button>
        <button class="ui-btn" id="btnTech" type="button">Технологии</button>
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
    for (let i = 0; i < BELT.length; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "slot";
      b.addEventListener("click", () => selectSlot(i));
      hot.appendChild(b);
    }

    $("btnCraft").addEventListener("click", () => toggleScreen("craft"));
    $("btnTech").addEventListener("click", () => toggleScreen("tech"));
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
    $("btnResume").addEventListener("click", hideScreens);
    $("btnSave").addEventListener("click", () => { save(); toast("Сохранено"); hideScreens(); });
    $("btnQuit").addEventListener("click", () => { save(); state.mode = "menu"; showScreen("start"); });
    $("btnRespawn").addEventListener("click", respawn);
    $("btnMenuHelp").addEventListener("click", () => showScreen("help"));
    for (const id of ["btnCraftClose", "btnTechClose", "btnFurnaceClose", "btnStoreClose", "btnResearchClose", "btnRecyclerClose"]) {
      const el = $(id);
      if (el) el.addEventListener("click", hideScreens);
    }
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
    const spot = beachSpot();
    P.x = spot.x; P.z = spot.z; P.y = spot.y;

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

  return { init, state, P, save, load, newGame, DEPLOY, TOOLS };
})();

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => Game.init());
} else {
  Game.init();
}
