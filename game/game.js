/* «Точка реза» — аркада про то, чем занят монтажёр коротких роликов:
   поймать момент склейки с точностью до кадра, пока зритель не свайпнул.

   Правила живут здесь, в одном месте: шаг сложности, цена промаха и цена
   идеального реза — это одни и те же числа для отрисовки, звука и счёта. */
(() => {
  "use strict";

  // ── Числа, которые решают, как ощущается игра ───────────────────────────
  const FRAMES = 120;            // кадров в окне на линейке (5 с материала @24fps)
  const FILM_FPS = 24;
  const GAIN = { perfect: 11, good: 7, ok: 4 };
  const PENALTY = { miss: 15, decoy: 22, timeout: 17 };
  const VIEWS = { perfect: 24000, good: 9000, ok: 3200 };
  const FREEZE_OK = 0.46;        // пауза на вердикт, чтобы успеть его прочитать
  const FREEZE_BAD = 0.72;

  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ── Сцены: то, что «играет» на мониторе, пока идёт дубль ────────────────
  const SCENES = [
    { name: "Погоня по крышам", type: "city", src: "reel_04.mp4" },
    { name: "Он узнаёт правду", type: "face", src: "reel_11.mp4" },
    { name: "Тишина перед выстрелом", type: "corridor", src: "reel_02.mp4" },
    { name: "Разворот на пороге", type: "face", src: "reel_09.mp4" },
    { name: "Взрыв за спиной", type: "burst", src: "reel_07.mp4" },
    { name: "Последний кадр заката", type: "horizon", src: "reel_15.mp4" },
    { name: "Дождь и никого", type: "city", src: "reel_03.mp4" },
    { name: "Прыжок без страховки", type: "burst", src: "reel_12.mp4" },
    { name: "Молчаливый взгляд", type: "face", src: "reel_06.mp4" },
    { name: "Дверь закрывается", type: "corridor", src: "reel_08.mp4" },
  ];

  // Подсказка появляется ровно на том дубле, где правило меняется.
  const HINTS = {
    1: "тапни, когда игла войдёт в зону",
    2: "ближе к центру — больше просмотров",
    4: "красное — вода, по ней не режь",
    8: "две зоны — два реза за проход",
    12: "зона плывёт, целься с упреждением",
    16: "игла вернётся: есть второй проход",
  };

  // ── Звук: короткие синтезированные сигналы, без файлов ──────────────────
  const Snd = {
    ctx: null,
    on: true,
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    },
    tone(freq, dur, type, vol, at) {
      const ctx = this.ctx;
      if (!ctx || !this.on) return;
      const t0 = at || ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || "triangle";
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },
    hit(grade) {
      if (!this.ensure() || !this.on) return;
      const t = this.ctx.currentTime;
      if (grade === "perfect") {
        this.tone(660, 0.09, "square", 0.16, t);
        this.tone(990, 0.14, "square", 0.13, t + 0.06);
        this.tone(1320, 0.2, "triangle", 0.1, t + 0.12);
      } else if (grade === "good") {
        this.tone(560, 0.1, "square", 0.13, t);
        this.tone(760, 0.12, "triangle", 0.09, t + 0.05);
      } else {
        this.tone(420, 0.12, "triangle", 0.1, t);
      }
    },
    fail() {
      const ctx = this.ensure();
      if (!ctx || !this.on) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(48, t + 0.3);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    },
    tick() {
      if (!this.ctx || !this.on) return;
      this.tone(1800, 0.02, "square", 0.025);
    },
  };

  // ── Разметка ────────────────────────────────────────────────────────────
  const root = document.getElementById("app") || document.body;
  root.className = "app";
  root.innerHTML = `
    <div class="phone" id="phone">
      <div class="hud">
        <div class="meter">
          <span class="meter-label">УДЕРЖАНИЕ</span>
          <span class="meter-track"><span class="meter-fill" id="meter"></span></span>
          <span class="meter-val" id="meterVal">100%</span>
          <button class="sound" id="sound" type="button" aria-label="Звук">ЗВК</button>
        </div>
        <div class="stats">
          <span class="stat"><span class="stat-key">ПРОСМОТРЫ</span><span class="stat-val" id="views">0</span></span>
          <span class="stat"><span class="stat-key">СЕРИЯ</span><span class="stat-val" id="combo">×1</span></span>
          <span class="stat"><span class="stat-key">ДУБЛЬ</span><span class="stat-val" id="round">1</span></span>
        </div>
      </div>

      <div class="stage" id="stage">
        <canvas id="monitor"></canvas>
        <div class="slate"><span class="rec"></span><span id="src">reel_04.mp4</span><span>· 1080×1920 · 24к/с</span></div>
        <div class="scene-name" id="sceneName">Погоня по крышам</div>
        <div class="verdict" id="verdict">
          <span class="verdict-word" id="vWord"></span>
          <span class="verdict-sub" id="vSub"></span>
          <span class="verdict-gain" id="vGain"></span>
        </div>
        <div class="leader" id="leader" hidden>3</div>
        <div class="flash" id="flash"></div>
      </div>

      <div class="deck">
        <div class="deck-row"><span class="tc" id="tc">00:00:00:00</span><span class="hint" id="hint">тапни, когда игла войдёт в зону</span></div>
        <div class="strip-wrap"><canvas id="strip"></canvas></div>
        <div class="deck-row"><span id="frames">кадр 000 / 120</span><span class="acc" id="acc">—</span></div>
      </div>

      <div class="overlay" id="overlay"></div>
      <div class="rotate">Игра вертикальная.<br>Поверни телефон.</div>
    </div>`;

  const $ = (id) => document.getElementById(id);
  const ui = {
    phone: $("phone"), stage: $("stage"), monitor: $("monitor"), strip: $("strip"),
    meter: $("meter"), meterVal: $("meterVal"), views: $("views"), combo: $("combo"),
    round: $("round"), tc: $("tc"), frames: $("frames"), acc: $("acc"), hint: $("hint"),
    sceneName: $("sceneName"), src: $("src"), verdict: $("verdict"), vWord: $("vWord"),
    vSub: $("vSub"), vGain: $("vGain"), leader: $("leader"), flash: $("flash"),
    overlay: $("overlay"), sound: $("sound"),
  };

  const mctx = ui.monitor.getContext("2d");
  const sctx = ui.strip.getContext("2d");
  const mon = { w: 0, h: 0 };
  const strip = { w: 0, h: 0 };

  function fitCanvas(canvas, ctx, box) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const r = canvas.getBoundingClientRect();
    box.w = Math.max(1, Math.round(r.width));
    box.h = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(box.w * dpr);
    canvas.height = Math.round(box.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function fitAll() {
    fitCanvas(ui.monitor, mctx, mon);
    fitCanvas(ui.strip, sctx, strip);
  }

  // Зерно плёнки — один раз в офскрин, дальше просто возим паттерн.
  const grain = document.createElement("canvas");
  grain.width = grain.height = 96;
  (() => {
    const g = grain.getContext("2d");
    const img = g.createImageData(96, 96);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 120 + Math.random() * 135;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  })();
  let grainPattern = null;

  // ── Состояние ───────────────────────────────────────────────────────────
  const game = {
    mode: "menu",          // menu | play | pause | over
    views: 0, shownViews: 0, combo: 0, maxCombo: 0, roundNo: 0, retention: 100,
    best: 0, r: null, freeze: 0, leader: 0, shake: 0, flash: 0, glitch: 0,
    particles: [], lastScene: -1, lastTick: -1,
  };

  const BEST_KEY = "tochka-reza.best";
  function loadBest() {
    try { return parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* приватный режим — переживём */ }
  }

  // ── Форматирование по-русски ────────────────────────────────────────────
  function fmtViews(n) {
    n = Math.floor(n);
    if (n < 1000) return String(n);
    if (n < 1e6) {
      const k = n / 1000;
      return (k < 100 ? k.toFixed(1).replace(".", ",") : String(Math.round(k))) + " тыс";
    }
    const m = n / 1e6;
    return (m < 100 ? m.toFixed(1).replace(".", ",") : String(Math.round(m))) + " млн";
  }
  const pad = (v, n) => String(Math.floor(v)).padStart(n, "0");
  function timecode(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = Math.floor(sec) % 60;
    const f = Math.floor((sec % 1) * FILM_FPS);
    return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}:${pad(f, 2)}`;
  }
  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  // ── Сборка дубля ────────────────────────────────────────────────────────
  function makeRound(n) {
    const dur = Math.max(0.85, 2.3 - n * 0.055);
    const hw = Math.max(0.028, 0.09 - n * 0.0034);
    const hooks = n >= 8 && (n % 3 === 2 || n >= 15) ? 2 : 1;
    const decoys = n < 4 ? 0 : n < 10 ? 1 : 2;
    const driftAmp = n >= 12 ? Math.min(0.065, 0.03 + (n - 12) * 0.004) : 0;
    const zones = [];

    const put = (kind, w, drift) => {
      for (let att = 0; att < 80; att++) {
        const c = rnd(0.12, 0.88);
        const room = drift + w + 0.05;
        if (zones.every((z) => Math.abs(z.c - c) > z.hw + z.drift + room)) {
          zones.push({ kind, c, hw: w, drift, hit: false, phase: rnd(0, 6.283), speed: rnd(1.1, 1.9) });
          return;
        }
      }
      // Место не нашлось — лучше дубль попроще, чем две зоны внахлёст.
      if (kind === "hook" && !zones.some((z) => z.kind === "hook")) {
        zones.push({ kind, c: 0.5, hw: w, drift: 0, hit: false, phase: 0, speed: 1.4 });
      }
    };

    for (let i = 0; i < hooks; i++) put("hook", hw, driftAmp);
    for (let i = 0; i < decoys; i++) put("decoy", hw * 1.2, 0);

    let si = Math.floor(Math.random() * SCENES.length);
    if (si === game.lastScene) si = (si + 1) % SCENES.length;
    game.lastScene = si;

    return {
      dur, zones, t: 0, pos: 0, dir: 1, passes: 0,
      pingpong: n >= 16,
      left: zones.filter((z) => z.kind === "hook").length,
      scene: SCENES[si],
      base: Math.floor(rnd(0, 2)) * 3600 + Math.floor(rnd(0, 60)) * 60 + rnd(0, 59),
      seed: Math.random() * 1000,
    };
  }

  const zoneCenter = (z, t) =>
    z.drift ? clamp(z.c + Math.sin(t * z.speed + z.phase) * z.drift, 0.06, 0.94) : z.c;

  // ── Ход игры ────────────────────────────────────────────────────────────
  function startGame() {
    Snd.ensure();
    game.mode = "play";
    game.views = game.shownViews = 0;
    game.combo = 0; game.maxCombo = 0; game.retention = 100;
    game.particles.length = 0;
    game.leader = REDUCED ? 0.6 : 3;
    game.freeze = 0;
    hideOverlay();
    startRound(1);
  }

  function startRound(n) {
    game.roundNo = n;
    game.r = makeRound(n);
    game.lastTick = -1;
    ui.round.textContent = String(n);
    ui.sceneName.textContent = game.r.scene.name;
    ui.src.textContent = game.r.scene.src;
    ui.acc.textContent = "—";
    if (HINTS[n]) ui.hint.textContent = HINTS[n];
  }

  function verdict(word, sub, gain, cls) {
    ui.vWord.textContent = word;
    ui.vWord.className = "verdict-word " + cls;
    ui.vSub.textContent = sub;
    ui.vGain.textContent = gain;
    ui.vGain.className = "verdict-gain " + cls;
    ui.verdict.classList.remove("show");
    void ui.verdict.offsetWidth;   // перезапуск анимации
    ui.verdict.classList.add("show");
  }

  function spark(x, color, power) {
    if (REDUCED) return;
    for (let i = 0; i < power; i++) {
      game.particles.push({
        x, y: strip.h / 2,
        vx: rnd(-90, 90), vy: rnd(-150, 150),
        life: rnd(0.25, 0.6), age: 0, color,
      });
    }
  }

  function tap() {
    if (game.mode !== "play" || game.freeze > 0 || game.leader > 0 || !game.r) return;
    const r = game.r;
    const p = r.pos;

    for (const z of r.zones) {
      if (z.kind !== "decoy") continue;
      if (Math.abs(p - zoneCenter(z, r.t)) / z.hw <= 1) return fail("decoy");
    }

    let best = null, bestD = Infinity;
    for (const z of r.zones) {
      if (z.kind !== "hook" || z.hit) continue;
      const d = Math.abs(p - zoneCenter(z, r.t)) / z.hw;
      if (d < bestD) { bestD = d; best = z; }
    }
    if (!best || bestD > 1) return fail("miss");

    const err = (p - zoneCenter(best, r.t)) * FRAMES;
    const g = bestD < 0.3 ? "perfect" : bestD < 0.7 ? "good" : "ok";
    best.hit = true;
    r.left--;

    const gained = Math.round(VIEWS[g] * (1 + game.combo * 0.12) * (1 + game.roundNo * 0.07));
    game.views += gained;
    game.retention = clamp(game.retention + GAIN[g], 0, 100);
    if (g !== "ok") {
      game.combo++;
      game.maxCombo = Math.max(game.maxCombo, game.combo);
    }

    const frames = Math.abs(err);
    const fr = frames < 1
      ? "рез: кадр в кадр"
      : `рез: ${err > 0 ? "+" : "−"}${Math.round(frames)} ${plural(Math.round(frames), "кадр", "кадра", "кадров")}`;
    ui.acc.textContent = fr.replace("рез: ", "");

    Snd.hit(g);
    spark(p * strip.w, g === "perfect" ? "#35c2a8" : "#f1e7da", g === "perfect" ? 26 : 12);
    if (g === "perfect") { game.flash = 1; game.shake = 9; }
    else if (g === "good") { game.shake = 4; }

    verdict(
      g === "perfect" ? "ЗАЛЕТЕЛО" : g === "good" ? "ЧИСТО" : "ПО КРАЮ",
      fr,
      `+${fmtViews(gained)} · +${GAIN[g]}% удержания`,
      g === "ok" ? "warm" : "good"
    );

    if (r.left > 0) {
      ui.hint.textContent = "ещё одна склейка в проходе";
      return;
    }
    game.freeze = FREEZE_OK;
  }

  function fail(kind) {
    game.retention = clamp(game.retention - PENALTY[kind], 0, 100);
    game.combo = 0;
    game.glitch = 1;
    game.shake = 7;
    Snd.fail();
    spark((game.r ? game.r.pos : 0.5) * strip.w, "#ff4b33", 14);
    const copy = {
      miss: ["МИМО", "склейка не на моменте", "зритель свайпнул"],
      decoy: ["ВОДА", "порезал по пустому плану", "такое досматривают до 2-й секунды"],
      timeout: ["ПРОСПАЛ", "проход кончился", "момент ушёл в корзину"],
    }[kind];
    verdict(copy[0], copy[1], `${copy[2]} · −${PENALTY[kind]}% удержания`, "bad");
    ui.acc.textContent = "промах";
    game.freeze = FREEZE_BAD;
  }

  function advance() {
    if (game.retention <= 0) return gameOver();
    startRound(game.roundNo + 1);
  }

  function tickRound(dt) {
    const r = game.r;
    r.t += dt;
    r.pos += (r.dir * dt) / r.dur;

    if (r.pos > 1 || r.pos < 0) {
      const over = r.pos > 1;
      if (r.pingpong && r.passes < 1) {
        r.passes++;
        r.dir = -r.dir;
        r.pos = over ? 2 - r.pos : -r.pos;
      } else {
        r.pos = clamp(r.pos, 0, 1);
        return fail("timeout");
      }
    }

    const tickIndex = Math.floor(r.pos * 8);
    if (tickIndex !== game.lastTick) { game.lastTick = tickIndex; Snd.tick(); }

    const drain = Math.min(6.5, 1.6 + game.roundNo * 0.16);
    game.retention -= drain * dt;
    if (game.retention <= 0) { game.retention = 0; gameOver(); }
  }

  function gameOver() {
    game.mode = "over";
    game.r = null;
    const record = game.views > game.best;
    if (record) { game.best = game.views; saveBest(game.best); }
    showOver(record);
  }

  // ── Оверлеи ─────────────────────────────────────────────────────────────
  function hideOverlay() { ui.overlay.hidden = true; }

  function showMenu() {
    game.mode = "menu";
    const standalone = window.navigator.standalone === true ||
      matchMedia("(display-mode: standalone)").matches;
    ui.overlay.hidden = false;
    ui.overlay.innerHTML = `
      <div>
        <p class="eyebrow">ОДИН ПАЛЕЦ · ВЕРТИКАЛЬНО · БЕЗ СЕТИ</p>
        <h1 class="title">Точка<br>реза</h1>
      </div>
      <p class="lede">Момент в ролике решается одним кадром. Поймай его — и ролик залетит. Опоздай — зритель свайпнет.</p>
      <ul class="rules">
        <li class="rule"><i class="z-head"></i><span><b>Игла</b> идёт по линейке слева направо.</span></li>
        <li class="rule"><i class="z-hook"></i><span><b>Бирюзовая зона</b> — сильный момент. Тапни, когда игла внутри: чем ближе к центру, тем больше просмотров.</span></li>
        <li class="rule"><i class="z-decoy"></i><span><b>Красная</b> — вода. Порежешь по ней или промахнёшься — удержание падает.</span></li>
      </ul>
      ${game.best ? `<p class="record">ЛУЧШИЙ РОЛИК — ${fmtViews(game.best)} просмотров</p>` : ""}
      <div class="btn-row">
        <button class="btn" id="play" type="button">Снять дубль</button>
      </div>
      <p class="foot" ${standalone ? "hidden" : ""}>Чтобы играть без браузера и без сети:<br>Поделиться → «На экран „Домой“».</p>`;
    $("play").addEventListener("click", startGame);
  }

  function showOver(record) {
    ui.overlay.hidden = false;
    ui.overlay.innerHTML = `
      <div>
        <p class="eyebrow">${record ? "НОВЫЙ РЕКОРД" : "РОЛИК УМЕР"}</p>
        <h1 class="title">${game.views >= 1e6 ? "Залетело" : "Досмотр<br>упал"}</h1>
      </div>
      <dl class="score">
        <div class="score-row"><dt>ПРОСМОТРЫ</dt><dd class="big">${fmtViews(game.views)}</dd></div>
        <div class="score-row"><dt>ЛУЧШИЙ РОЛИК</dt><dd>${fmtViews(game.best)}</dd></div>
        <div class="score-row"><dt>МАКС. СЕРИЯ</dt><dd>×${game.maxCombo + 1}</dd></div>
        <div class="score-row"><dt>ДУБЛЕЙ СНЯТО</dt><dd>${game.roundNo}</dd></div>
      </dl>
      <div class="btn-row">
        <button class="btn" id="again" type="button">Ещё дубль</button>
        <button class="btn ghost" id="share" type="button">Поделиться результатом</button>
      </div>`;
    $("again").addEventListener("click", startGame);
    $("share").addEventListener("click", share);
  }

  function showPause() {
    if (game.mode !== "play") return;
    game.mode = "pause";
    ui.overlay.hidden = false;
    ui.overlay.innerHTML = `
      <div><p class="eyebrow">ПАУЗА</p><h1 class="title">Монтаж<br>встал</h1></div>
      <p class="lede">Дубль ${game.roundNo}, удержание ${Math.round(game.retention)}%, ${fmtViews(game.views)} просмотров.</p>
      <div class="btn-row">
        <button class="btn" id="resume" type="button">Продолжить</button>
        <button class="btn ghost" id="toMenu" type="button">В начало</button>
      </div>`;
    $("resume").addEventListener("click", () => { game.mode = "play"; hideOverlay(); Snd.ensure(); });
    $("toMenu").addEventListener("click", showMenu);
  }

  function share() {
    const text = `«Точка реза» — ${fmtViews(game.views)} просмотров за ${game.roundNo} ${plural(game.roundNo, "дубль", "дубля", "дублей")}.`;
    const btn = $("share");
    if (navigator.share) {
      navigator.share({ title: "Точка реза", text, url: location.href }).catch(() => {});
      return;
    }
    const done = () => { btn.textContent = "Скопировано"; setTimeout(() => (btn.textContent = "Поделиться результатом"), 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(`${text} ${location.href}`).then(done, () => {});
    else done();
  }

  // ── Отрисовка монитора ──────────────────────────────────────────────────
  function drawScene(c, w, h, t, scene, seed) {
    switch (scene.type) {
      case "horizon": {
        const sky = c.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, "#2a1c33");
        sky.addColorStop(0.55, "#7a3a34");
        sky.addColorStop(1, "#f5a623");
        c.fillStyle = sky; c.fillRect(0, 0, w, h);
        const sy = h * 0.62 - Math.sin(t * 0.3) * h * 0.04;
        c.fillStyle = "rgba(255,214,140,0.95)";
        c.beginPath(); c.arc(w * 0.5, sy, w * 0.13, 0, 6.283); c.fill();
        c.fillStyle = "#150f18";
        c.beginPath(); c.moveTo(0, h);
        for (let x = 0; x <= w; x += 12) c.lineTo(x, h * 0.72 + Math.sin(x * 0.012 + seed) * h * 0.05);
        c.lineTo(w, h); c.closePath(); c.fill();
        c.fillRect(w * 0.5 - 3, h * 0.66, 6, h * 0.1);
        break;
      }
      case "city": {
        c.fillStyle = "#0f0b14"; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 9; i++) {
          const bx = ((i * 0.13 + t * 0.02) % 1.2 - 0.1) * w;
          const bw = w * 0.16, bh = h * (0.3 + ((i * 7) % 5) * 0.09);
          c.fillStyle = i % 2 ? "#1b1424" : "#241a2e";
          c.fillRect(bx, h - bh, bw, bh);
          for (let k = 0; k < 5; k++) {
            if ((i * 13 + k * 7 + Math.floor(t * 2)) % 11 < 3) continue;
            c.fillStyle = "rgba(245,166,35,0.5)";
            c.fillRect(bx + bw * 0.2, h - bh + 14 + k * 22, bw * 0.25, 8);
          }
        }
        c.strokeStyle = "rgba(200,215,255,0.22)"; c.lineWidth = 1;
        for (let i = 0; i < 60; i++) {
          const x = ((i * 137.5 + t * 380) % (w + 60)) - 30;
          const y = ((i * 73 + t * 900) % (h + 40)) - 20;
          c.beginPath(); c.moveTo(x, y); c.lineTo(x - 4, y + 18); c.stroke();
        }
        break;
      }
      case "burst": {
        c.fillStyle = "#120a10"; c.fillRect(0, 0, w, h);
        const cx = w * 0.5, cy = h * 0.46, pulse = 0.6 + Math.sin(t * 6) * 0.08;
        const g = c.createRadialGradient(cx, cy, 0, cx, cy, w * 0.62 * pulse);
        g.addColorStop(0, "rgba(255,236,190,0.95)");
        g.addColorStop(0.35, "rgba(255,124,50,0.7)");
        g.addColorStop(1, "rgba(18,10,16,0)");
        c.fillStyle = g; c.fillRect(0, 0, w, h);
        c.strokeStyle = "rgba(255,180,90,0.35)"; c.lineWidth = 2;
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * 6.283 + t * 0.5 + seed;
          c.beginPath(); c.moveTo(cx + Math.cos(a) * w * 0.1, cy + Math.sin(a) * w * 0.1);
          c.lineTo(cx + Math.cos(a) * w * 0.9, cy + Math.sin(a) * w * 0.9); c.stroke();
        }
        c.fillStyle = "#0c0710";
        c.beginPath(); c.ellipse(w * 0.5, h * 1.02, w * 0.3, h * 0.2, 0, 0, 6.283); c.fill();
        break;
      }
      case "face": {
        // Контровой свет и плечи — крупный план, а не голова в пустоте.
        const bg = c.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, "#221829");
        bg.addColorStop(0.6, "#16101c");
        bg.addColorStop(1, "#0c0810");
        c.fillStyle = bg; c.fillRect(0, 0, w, h);
        const bob = Math.sin(t * 0.9) * h * 0.01;
        const cy = h * 0.44 + bob, rx = w * 0.21, ry = h * 0.17;
        c.fillStyle = "#0a070d";
        c.beginPath(); c.ellipse(w * 0.5, h * 0.95 + bob, w * 0.52, h * 0.24, 0, 0, 6.283); c.fill();
        c.beginPath(); c.ellipse(w * 0.5, cy, rx, ry, 0, 0, 6.283); c.fill();
        c.strokeStyle = "rgba(255,140,100,0.8)"; c.lineWidth = 4;
        c.beginPath(); c.ellipse(w * 0.5, cy, rx, ry, 0, -2.5, -0.5); c.stroke();
        c.strokeStyle = "rgba(53,194,168,0.35)"; c.lineWidth = 2.5;
        c.beginPath(); c.ellipse(w * 0.5, cy, rx, ry, 0, 1.1, 2.4); c.stroke();
        c.fillStyle = "rgba(241,231,218,0.85)";
        c.fillRect(w * 0.42, cy - ry * 0.15, w * 0.05, 2.5);
        c.fillRect(w * 0.53, cy - ry * 0.15, w * 0.05, 2.5);
        break;
      }
      default: {
        c.fillStyle = "#0b0810"; c.fillRect(0, 0, w, h);
        const cx = w * 0.5, cy = h * 0.45, depth = (t * 0.35) % 1;
        c.strokeStyle = "rgba(53,194,168,0.32)"; c.lineWidth = 1.5;
        for (let i = 0; i < 7; i++) {
          const k = ((i / 7 + depth) % 1) ** 2.2;
          const rw = w * 0.08 + k * w * 1.2, rh = h * 0.06 + k * h * 1.2;
          c.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh);
        }
        c.strokeStyle = "rgba(245,166,35,0.5)";
        c.beginPath();
        c.moveTo(0, h); c.lineTo(cx, cy); c.lineTo(w, h);
        c.stroke();
        c.fillStyle = "rgba(255,235,200,0.9)";
        c.beginPath(); c.arc(cx, cy, 4 + Math.sin(t * 4) * 1.5, 0, 6.283); c.fill();
      }
    }
  }

  function drawMonitor(dt) {
    const w = mon.w, h = mon.h;
    const r = game.r;
    mctx.save();
    mctx.clearRect(0, 0, w, h);
    if (r) drawScene(mctx, w, h, r.t, r.scene, r.seed);
    else {
      mctx.fillStyle = "#0d0a11"; mctx.fillRect(0, 0, w, h);
      drawScene(mctx, w, h, performance.now() / 1000, SCENES[5], 3);
    }

    // Глитч на промахе: строки кадра уезжают, как при битом склейке.
    if (game.glitch > 0) {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const y = Math.random() * h, sh = rnd(4, 22);
        const dx = rnd(-26, 26) * game.glitch;
        mctx.drawImage(ui.monitor, 0, y * (ui.monitor.height / h), ui.monitor.width, sh * (ui.monitor.height / h),
          dx, y, w, sh);
      }
      mctx.fillStyle = `rgba(255,75,51,${0.18 * game.glitch})`;
      mctx.fillRect(0, 0, w, h);
    }

    if (!grainPattern) grainPattern = mctx.createPattern(grain, "repeat");
    mctx.globalAlpha = 0.07;
    mctx.save();
    mctx.translate(-Math.random() * 96, -Math.random() * 96);
    mctx.fillStyle = grainPattern;
    mctx.fillRect(0, 0, w + 96, h + 96);
    mctx.restore();
    mctx.globalAlpha = 1;

    const vig = mctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.66)");
    mctx.fillStyle = vig; mctx.fillRect(0, 0, w, h);
    mctx.restore();
  }

  // ── Отрисовка линейки ───────────────────────────────────────────────────
  function drawStrip(dt) {
    const w = strip.w, h = strip.h, r = game.r;
    sctx.clearRect(0, 0, w, h);
    sctx.fillStyle = "#1c1724"; sctx.fillRect(0, 0, w, h);

    // Перфорация — чтобы линейка читалась как плёнка, а не как прогресс-бар.
    sctx.fillStyle = "#241d2e";
    for (let x = 6; x < w; x += 22) {
      sctx.fillRect(x, 5, 11, 7);
      sctx.fillRect(x, h - 12, 11, 7);
    }

    const top = 20, bh = h - 40;
    sctx.fillStyle = "#14101a"; sctx.fillRect(0, top, w, bh);

    sctx.fillStyle = "#372d40";
    for (let i = 0; i <= 16; i++) {
      const x = (i / 16) * w;
      const tall = i % 4 === 0;
      sctx.fillRect(Math.min(w - 1, x), top + (tall ? 0 : bh * 0.3), 1, tall ? bh : bh * 0.4);
    }

    if (r) {
      for (const z of r.zones) {
        const c = zoneCenter(z, r.t);
        const x0 = (c - z.hw) * w, x1 = (c + z.hw) * w;
        if (z.kind === "hook") {
          sctx.fillStyle = z.hit ? "rgba(53,194,168,0.16)" : "rgba(53,194,168,0.26)";
          sctx.fillRect(x0, top, x1 - x0, bh);
          sctx.fillStyle = z.hit ? "rgba(53,194,168,0.4)" : "#35c2a8";
          sctx.fillRect(x0, top, 2, bh);
          sctx.fillRect(x1 - 2, top, 2, bh);
          sctx.fillStyle = z.hit ? "rgba(241,231,218,0.35)" : "rgba(241,231,218,0.7)";
          sctx.fillRect(c * w - 0.5, top + bh * 0.18, 1, bh * 0.64);
        } else {
          sctx.save();
          sctx.beginPath(); sctx.rect(x0, top, x1 - x0, bh); sctx.clip();
          sctx.fillStyle = "rgba(255,75,51,0.16)";
          sctx.fillRect(x0, top, x1 - x0, bh);
          sctx.strokeStyle = "rgba(255,75,51,0.55)"; sctx.lineWidth = 1;
          for (let x = x0 - bh; x < x1; x += 7) {
            sctx.beginPath(); sctx.moveTo(x, top + bh); sctx.lineTo(x + bh, top); sctx.stroke();
          }
          sctx.restore();
          sctx.fillStyle = "#ff4b33";
          sctx.fillRect(x0, top, 1.5, bh); sctx.fillRect(x1 - 1.5, top, 1.5, bh);
        }
      }

      const px = r.pos * w;
      sctx.fillStyle = "rgba(241,231,218,0.18)";
      sctx.fillRect(px - 5, top, 10, bh);
      sctx.fillStyle = "#f1e7da";
      sctx.fillRect(px - 1, 4, 2, h - 8);
      sctx.beginPath();
      sctx.moveTo(px - 7, 4); sctx.lineTo(px + 7, 4); sctx.lineTo(px, 16);
      sctx.closePath(); sctx.fill();
    }

    for (let i = game.particles.length - 1; i >= 0; i--) {
      const p = game.particles[i];
      p.age += dt;
      if (p.age >= p.life) { game.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt;
      sctx.globalAlpha = 1 - p.age / p.life;
      sctx.fillStyle = p.color;
      sctx.fillRect(p.x, p.y, 2, 2);
    }
    sctx.globalAlpha = 1;
  }

  // ── HUD ─────────────────────────────────────────────────────────────────
  function drawHud() {
    const rt = Math.max(0, Math.round(game.retention));
    ui.meter.style.transform = `scaleX(${clamp(game.retention, 0, 100) / 100})`;
    ui.meter.style.backgroundColor = rt > 55 ? "#35c2a8" : rt > 25 ? "#f5a623" : "#ff4b33";
    ui.meterVal.textContent = rt + "%";
    ui.views.textContent = fmtViews(game.shownViews);
    ui.combo.textContent = "×" + (game.combo + 1);
    ui.combo.classList.toggle("hot", game.combo >= 3);
    if (game.r) {
      const sec = game.r.base + game.r.pos * (FRAMES / FILM_FPS);
      ui.tc.textContent = timecode(sec);
      ui.frames.textContent = `кадр ${pad(game.r.pos * FRAMES, 3)} / ${FRAMES}`;
    }
  }

  // ── Цикл ────────────────────────────────────────────────────────────────
  let last = 0;
  function frame(ts) {
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
    last = ts;

    if (game.mode === "play") {
      if (game.leader > 0) {
        game.leader -= dt;
        const n = Math.ceil(game.leader);
        ui.leader.hidden = game.leader <= 0;
        ui.leader.textContent = n > 0 ? String(n) : "";
        if (game.leader <= 0) { ui.leader.hidden = true; Snd.hit("good"); }
      } else if (game.freeze > 0) {
        game.freeze -= dt;
        if (game.freeze <= 0) advance();
      } else if (game.r) {
        tickRound(dt);
      }
    }

    game.shownViews += (game.views - game.shownViews) * Math.min(1, dt * 7);
    if (Math.abs(game.views - game.shownViews) < 1) game.shownViews = game.views;
    game.shake = Math.max(0, game.shake - dt * 30);
    game.flash = Math.max(0, game.flash - dt * 5);
    game.glitch = Math.max(0, game.glitch - dt * 3.2);

    ui.flash.style.opacity = String(game.flash * 0.5);
    if (game.shake > 0.1) {
      ui.phone.style.transform = `translate(${rnd(-1, 1) * game.shake}px, ${rnd(-1, 1) * game.shake * 0.6}px)`;
    } else if (ui.phone.style.transform) {
      ui.phone.style.transform = "";
    }

    drawMonitor(dt);
    drawStrip(dt);
    drawHud();
    requestAnimationFrame(frame);
  }

  // ── Ввод ────────────────────────────────────────────────────────────────
  ui.phone.addEventListener("pointerdown", (e) => {
    // По оверлею не режем: там кнопки и текст, который можно прокрутить.
    if (e.target.closest("button") || e.target.closest(".overlay")) return;
    e.preventDefault();
    tap();
  }, { passive: false });

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" && e.code !== "Enter") return;
    if (document.activeElement && document.activeElement.tagName === "BUTTON") return;
    e.preventDefault();
    if (game.mode === "play") tap();
    else if (game.mode === "menu" || game.mode === "over") startGame();
  });

  ui.sound.addEventListener("click", () => {
    Snd.on = !Snd.on;
    if (Snd.on) Snd.ensure();
    ui.sound.textContent = Snd.on ? "ЗВК" : "ТИХ";
    ui.sound.style.color = Snd.on ? "" : "#5c5364";
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.mode === "play") showPause();
  });

  window.addEventListener("resize", fitAll);
  window.addEventListener("orientationchange", () => setTimeout(fitAll, 250));
  if (window.visualViewport) window.visualViewport.addEventListener("resize", fitAll);

  // ── Старт ───────────────────────────────────────────────────────────────
  function boot(saved) {
    fitAll();
    game.best = Math.max(loadBest(), (saved && saved.best) || 0);
    if (saved && saved.mode === "play") {
      // Страница перезагрузилась посреди дубля — не теряем прогресс, встаём на паузу.
      game.views = game.shownViews = saved.views || 0;
      game.combo = saved.combo || 0;
      game.maxCombo = saved.maxCombo || 0;
      game.retention = saved.retention || 100;
      startRound(saved.roundNo || 1);
      game.mode = "play";
      showPause();
    } else {
      showMenu();
    }
    requestAnimationFrame(frame);
  }

  if (window.claude && window.claude.hot) {
    window.claude.hot.snapshot(() => ({
      best: game.best, mode: game.mode, views: game.views, combo: game.combo,
      maxCombo: game.maxCombo, retention: game.retention, roundNo: game.roundNo,
    }));
  }
  const hot = window.claude && window.claude.hot;
  if (hot && hot.ready) hot.ready(boot);
  else boot((hot && hot.data) || {});
})();
