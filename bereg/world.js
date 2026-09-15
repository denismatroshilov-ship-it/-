/* Остров: рельеф, ресурсы, руины и постройки игрока.

   Карта не хранится файлом — она выводится из seed'а. В сейв идут только seed
   и то, что игрок изменил: что срублено, что построено, где спальник. */
const World = (() => {
  "use strict";

  const SIZE = 256;          // метров по стороне карты
  const CELLS = 128;         // клеток рельефа на сторону
  const STEP = SIZE / CELLS;
  const WATER = 0;
  const GRID = 3;            // шаг строительной сетки, метры

  const heights = new Float32Array((CELLS + 1) * (CELLS + 1));
  let seed = 1;

  // ── Шум ─────────────────────────────────────────────────────────────────
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2(x, y) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function valueNoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  function fbm(x, y, oct) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += valueNoise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5; freq *= 2.05;
    }
    return sum / norm;
  }

  // Высота: холмы из fbm, срезанные радиальной маской, чтобы получился остров.
  function rawHeight(x, z) {
    const n = fbm(x * 0.012, z * 0.012, 5);
    const ridge = Math.abs(fbm(x * 0.03 + 11, z * 0.03 + 7, 3) - 0.5) * 2;
    const d = Math.hypot(x, z) / (SIZE * 0.47);
    const mask = 1 - Math.min(1, Math.pow(d, 2.6));
    let h = (n * 34 + (1 - ridge) * 9) * mask - 7.5;
    if (h > 0 && h < 1.6) h *= 0.55;         // пологий пляж у воды
    return h;
  }

  function buildHeightmap() {
    for (let j = 0; j <= CELLS; j++) {
      for (let i = 0; i <= CELLS; i++) {
        heights[j * (CELLS + 1) + i] = rawHeight(-SIZE / 2 + i * STEP, -SIZE / 2 + j * STEP);
      }
    }
  }

  function height(x, z) {
    const fx = (x + SIZE / 2) / STEP, fz = (z + SIZE / 2) / STEP;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= CELLS || j >= CELLS) return -8;
    const tx = fx - i, tz = fz - j;
    const row = CELLS + 1;
    const h00 = heights[j * row + i], h10 = heights[j * row + i + 1];
    const h01 = heights[(j + 1) * row + i], h11 = heights[(j + 1) * row + i + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  function slope(x, z) {
    const d = 1.5;
    const hx = height(x + d, z) - height(x - d, z);
    const hz = height(x, z + d) - height(x, z - d);
    return Math.hypot(hx, hz) / (2 * d);
  }

  // ── Геометрия мира ──────────────────────────────────────────────────────
  function terrainMesh() {
    const g = GL.geo();
    const sand = [0.80, 0.73, 0.55], grass = [0.30, 0.42, 0.22];
    const dark = [0.20, 0.31, 0.16], rock = [0.42, 0.41, 0.42];
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; i++) {
        const x0 = -SIZE / 2 + i * STEP, z0 = -SIZE / 2 + j * STEP;
        const x1 = x0 + STEP, z1 = z0 + STEP;
        const row = CELLS + 1;
        const y00 = heights[j * row + i], y10 = heights[j * row + i + 1];
        const y11 = heights[(j + 1) * row + i + 1], y01 = heights[(j + 1) * row + i];
        const avg = (y00 + y10 + y11 + y01) / 4;
        const st = (Math.abs(y10 - y00) + Math.abs(y01 - y00)) / STEP;
        let c;
        if (avg < 1.2) c = sand;
        else if (st > 0.85) c = rock;
        else c = avg > 14 ? rock : (hash2(i, j) > 0.5 ? grass : dark);
        const tone = 0.93 + hash2(i * 3 + 1, j * 7 + 2) * 0.12;
        GL.pushQuad(g, [x0, y00, z0], [x0, y01, z1], [x1, y11, z1], [x1, y10, z0],
          [c[0] * tone, c[1] * tone, c[2] * tone]);
      }
    }
    return GL.mesh(g);
  }

  // Наборы мешей: каждый рисуется одной пачкой инстансов.
  function makeMeshes() {
    const M = {};
    let g;

    g = GL.geo();
    GL.cylinder(g, 0.30, 0.20, 3.6, 6, [0.32, 0.23, 0.15]);
    GL.cone(g, 1.7, 2.2, 7, [0.16, 0.34, 0.18], 2.6);
    GL.cone(g, 1.3, 2.0, 7, [0.20, 0.40, 0.21], 4.1);
    GL.cone(g, 0.9, 1.8, 7, [0.24, 0.46, 0.24], 5.4);
    M.pine = GL.mesh(g);

    g = GL.geo();
    GL.cylinder(g, 0.34, 0.26, 2.8, 6, [0.36, 0.26, 0.17]);
    GL.sphere(g, 2.1, 8, [0.25, 0.42, 0.20], 4.0, 0.75);
    GL.sphere(g, 1.4, 7, [0.29, 0.47, 0.23], 5.0, 0.7);
    M.oak = GL.mesh(g);

    g = GL.geo();
    GL.sphere(g, 1.25, 7, [0.46, 0.45, 0.46], 0.45, 0.7);
    GL.sphere(g, 0.7, 6, [0.40, 0.39, 0.40], 1.2, 0.8);
    M.rock = GL.mesh(g);

    g = GL.geo();
    GL.sphere(g, 1.15, 7, [0.38, 0.36, 0.34], 0.4, 0.75);
    GL.box(g, 0.5, 0.4, 0.5, [0.62, 0.42, 0.22], 0.5, 0.9, 0.2);
    GL.box(g, 0.4, 0.3, 0.4, [0.66, 0.46, 0.25], -0.4, 0.8, -0.3);
    M.ore = GL.mesh(g);

    g = GL.geo();
    GL.sphere(g, 0.75, 6, [0.22, 0.36, 0.18], 0.35, 0.8);
    GL.sphere(g, 0.16, 5, [0.62, 0.14, 0.18], 0.85, 1);
    GL.sphere(g, 0.14, 5, [0.58, 0.12, 0.16], 0.7, 1);
    M.bush = GL.mesh(g);

    g = GL.geo();
    GL.cylinder(g, 0.07, 0.05, 1.5, 4, [0.30, 0.42, 0.20]);
    GL.sphere(g, 0.42, 6, [0.34, 0.52, 0.24], 1.5, 1.35);
    GL.sphere(g, 0.3, 5, [0.30, 0.46, 0.21], 1.0, 1.2);
    M.hemp = GL.mesh(g);

    g = GL.geo();
    GL.cylinder(g, 0.45, 0.45, 1.1, 8, [0.48, 0.24, 0.16]);
    GL.cylinder(g, 0.47, 0.47, 0.12, 8, [0.30, 0.30, 0.32], 0.5);
    M.barrel = GL.mesh(g);

    g = GL.geo();
    GL.box(g, 1.1, 0.8, 0.8, [0.44, 0.33, 0.20]);
    GL.box(g, 1.14, 0.1, 0.84, [0.30, 0.30, 0.33], 0, 0.4, 0);
    M.crate = GL.mesh(g);

    g = GL.geo();
    GL.box(g, 4, 3.2, 4, [0.52, 0.51, 0.49]);
    M.ruin = GL.mesh(g);

    // Родник: единственная пресная вода, поэтому его видно издалека.
    g = GL.geo();
    GL.cylinder(g, 1.5, 1.45, 0.12, 10, [0.30, 0.62, 0.72]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      GL.box(g, 0.5, 0.36, 0.5, [0.44, 0.43, 0.42], Math.cos(a) * 1.7, -0.05, Math.sin(a) * 1.7);
    }
    M.spring = GL.mesh(g);

    g = GL.geo();
    GL.box(g, 0.5, 14, 0.5, [0.55, 0.30, 0.26]);
    GL.box(g, 2.2, 0.3, 0.3, [0.58, 0.33, 0.28], 0, 11.5, 0);
    GL.box(g, 1.6, 0.3, 0.3, [0.58, 0.33, 0.28], 0, 12.6, 0);
    M.antenna = GL.mesh(g);

    g = GL.geo();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      GL.box(g, 0.28, 0.22, 0.28, [0.45, 0.44, 0.44], Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
    }
    GL.box(g, 0.8, 0.16, 0.18, [0.34, 0.24, 0.15], 0, 0.05, 0);
    GL.box(g, 0.18, 0.16, 0.8, [0.34, 0.24, 0.15], 0, 0.15, 0);
    M.fireBase = GL.mesh(g);

    g = GL.geo();
    GL.cone(g, 0.32, 0.9, 6, [1.0, 0.55, 0.15], 0);
    M.flame = GL.mesh(g);

    g = GL.geo();
    GL.box(g, 1.9, 0.25, 0.9, [0.30, 0.38, 0.55]);
    GL.box(g, 0.5, 0.18, 0.8, [0.42, 0.48, 0.62], 0.6, 0.2, 0);
    M.bag = GL.mesh(g);

    g = GL.geo();
    GL.box(g, 0.6, 0.5, 0.45, [0.42, 0.34, 0.22]);
    M.loot = GL.mesh(g);

    // Постройки
    g = GL.geo(); GL.box(g, GRID, 0.35, GRID, [0.55, 0.42, 0.26]); M.foundation = GL.mesh(g);
    g = GL.geo(); GL.box(g, GRID, 3, 0.22, [0.58, 0.45, 0.28]); M.wall = GL.mesh(g);
    g = GL.geo();
    GL.box(g, 0.75, 3, 0.22, [0.58, 0.45, 0.28], -1.13, 0, 0);
    GL.box(g, 0.75, 3, 0.22, [0.58, 0.45, 0.28], 1.13, 0, 0);
    GL.box(g, GRID, 0.9, 0.22, [0.58, 0.45, 0.28], 0, 2.1, 0);
    M.doorway = GL.mesh(g);
    g = GL.geo(); GL.box(g, 1.45, 2.05, 0.14, [0.46, 0.34, 0.20], 0.725, 0, 0); M.door = GL.mesh(g);
    g = GL.geo(); GL.box(g, GRID, 0.25, GRID, [0.52, 0.40, 0.25]); M.ceiling = GL.mesh(g);

    // Живность и мародёры — крупные блоки, читаемые силуэтом издалека.
    g = GL.geo();
    GL.box(g, 0.75, 0.8, 1.7, [0.55, 0.38, 0.22], 0, 0.75, 0);
    GL.box(g, 0.45, 0.5, 0.5, [0.58, 0.42, 0.25], 0, 1.35, -0.95);
    GL.box(g, 0.14, 0.75, 0.14, [0.40, 0.28, 0.16], 0.25, 0, 0.6);
    GL.box(g, 0.14, 0.75, 0.14, [0.40, 0.28, 0.16], -0.25, 0, 0.6);
    GL.box(g, 0.14, 0.75, 0.14, [0.40, 0.28, 0.16], 0.25, 0, -0.6);
    GL.box(g, 0.14, 0.75, 0.14, [0.40, 0.28, 0.16], -0.25, 0, -0.6);
    M.deer = GL.mesh(g);

    g = GL.geo();
    GL.box(g, 0.6, 0.6, 1.4, [0.35, 0.33, 0.34], 0, 0.55, 0);
    GL.box(g, 0.4, 0.4, 0.55, [0.30, 0.28, 0.29], 0, 0.75, -0.85);
    GL.box(g, 0.13, 0.55, 0.13, [0.26, 0.24, 0.25], 0.2, 0, 0.45);
    GL.box(g, 0.13, 0.55, 0.13, [0.26, 0.24, 0.25], -0.2, 0, 0.45);
    GL.box(g, 0.13, 0.55, 0.13, [0.26, 0.24, 0.25], 0.2, 0, -0.5);
    GL.box(g, 0.13, 0.55, 0.13, [0.26, 0.24, 0.25], -0.2, 0, -0.5);
    M.wolf = GL.mesh(g);

    g = GL.geo();
    GL.box(g, 0.66, 0.95, 0.38, [0.42, 0.40, 0.36], 0, 0.85, 0);
    GL.box(g, 0.38, 0.36, 0.34, [0.72, 0.58, 0.45], 0, 1.8, 0);
    GL.box(g, 0.18, 0.8, 0.18, [0.38, 0.36, 0.33], 0.42, 0.95, 0);
    GL.box(g, 0.18, 0.8, 0.18, [0.38, 0.36, 0.33], -0.42, 0.95, 0);
    GL.box(g, 0.22, 0.9, 0.22, [0.30, 0.30, 0.32], 0.18, 0, 0);
    GL.box(g, 0.22, 0.9, 0.22, [0.30, 0.30, 0.32], -0.18, 0, 0);
    M.raider = GL.mesh(g);

    g = GL.geo();
    GL.box(g, 0.06, 0.06, 0.9, [0.62, 0.52, 0.34], 0, 0, 0);
    M.arrow = GL.mesh(g);

    g = GL.geo();
    // Вода чуть ниже нуля: вплотную к пляжу она бы дралась с рельефом за глубину.
    GL.box(g, 400, 0.1, 400, [0.10, 0.28, 0.40], 0, -0.22, 0);
    M.water = GL.mesh(g);

    return M;
  }

  // ── Наполнение острова ──────────────────────────────────────────────────
  const nodes = [];          // деревья, камни, руда, кусты, бочки, ящики
  const props = [];          // декор без взаимодействия (руины, антенна)
  const springs = [];        // родники: источник пресной воды
  let ruins = { x: 0, z: 0 };

  const NODE_DEFS = {
    pine: { mesh: "pine", hp: 120, give: "wood", amount: 26, tool: "axe", radius: 0.5, respawn: 200 },
    oak: { mesh: "oak", hp: 140, give: "wood", amount: 30, tool: "axe", radius: 0.55, respawn: 220 },
    rock: { mesh: "rock", hp: 130, give: "stone", amount: 24, tool: "pick", radius: 0.9, respawn: 220 },
    ore: { mesh: "ore", hp: 160, give: "ore", amount: 12, tool: "pick", radius: 0.9, respawn: 300 },
    bush: { mesh: "bush", hp: 20, give: "berries", amount: 4, tool: "any", radius: 0.5, respawn: 120 },
    hemp: { mesh: "hemp", hp: 22, give: "cloth", amount: 8, tool: "any", radius: 0.4, respawn: 150 },
    barrel: { mesh: "barrel", hp: 40, give: "loot", amount: 1, tool: "any", radius: 0.5, respawn: 240 },
    crate: { mesh: "crate", hp: 55, give: "loot", amount: 2, tool: "any", radius: 0.6, respawn: 300 },
  };

  function scatter(rng, type, count, test) {
    let placed = 0, guard = 0;
    while (placed < count && guard++ < count * 40) {
      const x = (rng() - 0.5) * SIZE * 0.92;
      const z = (rng() - 0.5) * SIZE * 0.92;
      const y = height(x, z);
      if (!test(x, z, y)) continue;
      let tooClose = false;
      for (const n of nodes) {
        if ((n.x - x) ** 2 + (n.z - z) ** 2 < 9) { tooClose = true; break; }
      }
      if (tooClose) continue;
      const def = NODE_DEFS[type];
      nodes.push({
        type, x, y, z, rot: rng() * Math.PI * 2,
        scale: 0.8 + rng() * 0.5, hp: def.hp, maxHp: def.hp,
        alive: true, respawnAt: 0, idx: -1,
        tint: 0.85 + rng() * 0.3,
      });
      placed++;
    }
  }

  function generate(s) {
    seed = s | 0 || 1;
    nodes.length = 0; props.length = 0; springs.length = 0;
    buildHeightmap();
    const rng = mulberry32(seed ^ 0x9e3779b9);

    const land = (x, z, y) => y > 1.4 && slope(x, z) < 0.6;
    scatter(rng, "pine", 210, (x, z, y) => land(x, z, y) && y > 3);
    scatter(rng, "oak", 140, (x, z, y) => land(x, z, y) && y > 2 && y < 18);
    scatter(rng, "rock", 150, (x, z, y) => y > 0.8 && slope(x, z) < 0.9);
    scatter(rng, "ore", 60, (x, z, y) => y > 5 && slope(x, z) < 1.1);
    scatter(rng, "bush", 70, (x, z, y) => land(x, z, y) && y < 16);
    scatter(rng, "hemp", 85, (x, z, y) => y > 1.6 && y < 12 && slope(x, z) < 0.45);

    // Руины: единственный ориентир на острове и главный источник лома.
    let best = null;
    for (let i = 0; i < 400; i++) {
      const x = (rng() - 0.5) * SIZE * 0.5, z = (rng() - 0.5) * SIZE * 0.5;
      const y = height(x, z);
      if (y < 4 || y > 20) continue;
      const sc = slope(x, z);
      if (!best || sc < best.sc) best = { x, z, y, sc };
    }
    ruins = best || { x: 0, z: 0, y: height(0, 0) };
    props.push({ mesh: "antenna", x: ruins.x, y: height(ruins.x, ruins.z), z: ruins.z, rot: 0, scale: 1 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng();
      const d = 9 + rng() * 9;
      const x = ruins.x + Math.cos(a) * d, z = ruins.z + Math.sin(a) * d;
      props.push({ mesh: "ruin", x, y: height(x, z) - 0.6, z, rot: rng() * 0.6, scale: 0.7 + rng() * 0.7 });
    }
    for (let i = 0; i < 16; i++) {
      const a = rng() * Math.PI * 2, d = 4 + rng() * 16;
      const x = ruins.x + Math.cos(a) * d, z = ruins.z + Math.sin(a) * d;
      const type = rng() > 0.35 ? "barrel" : "crate";
      const def = NODE_DEFS[type];
      nodes.push({
        type, x, y: height(x, z), z, rot: rng() * 6.28, scale: 1,
        hp: def.hp, maxHp: def.hp, alive: true, respawnAt: 0, idx: -1, tint: 1,
      });
    }

    // Родники — единственная пресная вода, к ним придётся возвращаться.
    for (let i = 0; i < 6; i++) {
      for (let att = 0; att < 300; att++) {
        const x = (rng() - 0.5) * SIZE * 0.8, z = (rng() - 0.5) * SIZE * 0.8;
        const y = height(x, z);
        if (y > 3 && y < 22 && slope(x, z) < 0.35) { springs.push({ x, y, z }); break; }
      }
    }

    buildColliders();
    return { seed, ruins };
  }

  // ── Столкновения со статикой ────────────────────────────────────────────
  const CELL = 8;
  const colliders = new Map();
  const key = (cx, cz) => cx * 10007 + cz;

  function addCollider(x, z, r, ref) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const k = key(cx + dx, cz + dz);
        if (!colliders.has(k)) colliders.set(k, []);
        if (dx === 0 && dz === 0) colliders.get(k).push({ x, z, r, ref });
      }
    }
  }

  function buildColliders() {
    colliders.clear();
    for (const n of nodes) {
      const def = NODE_DEFS[n.type];
      if (def.radius > 0.45) addCollider(n.x, n.z, def.radius * n.scale, n);
    }
    for (const p of props) {
      if (p.mesh === "ruin") addCollider(p.x, p.z, 2.6 * p.scale, p);
      if (p.mesh === "antenna") addCollider(p.x, p.z, 0.6, p);
    }
  }

  function nearColliders(x, z) {
    return colliders.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || [];
  }

  // ── Постройки ───────────────────────────────────────────────────────────
  const pieces = [];
  const PIECE_HP = { wood: 250, stone: 500 };

  function snap(v) { return Math.round(v / GRID) * GRID; }

  function pieceKey(p) { return `${p.kind}:${p.gx}:${p.gz}:${p.level}:${p.edge}`; }

  function findPiece(kind, gx, gz, level, edge) {
    return pieces.find((p) => p.kind === kind && p.gx === gx && p.gz === gz &&
      p.level === level && (edge === undefined || p.edge === edge));
  }

  function foundationY(gx, gz) {
    const x = gx * GRID, z = gz * GRID;
    let h = -99;
    for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [1.4, 1.4], [-1.4, 1.4], [0, 0]]) {
      h = Math.max(h, height(x + dx, z + dz));
    }
    return h + 0.05;
  }

  function levelY(gx, gz, level) {
    const f = findPiece("foundation", gx, gz, 0);
    const base = f ? f.y : foundationY(gx, gz);
    return base + 0.35 + level * 3;
  }

  function addPiece(kind, gx, gz, level, edge, tier) {
    if (findPiece(kind, gx, gz, level, edge)) return null;
    const p = {
      kind, gx, gz, level, edge: edge === undefined ? 0 : edge,
      tier: tier || "wood", hp: PIECE_HP[tier || "wood"], maxHp: PIECE_HP[tier || "wood"],
      open: false, y: 0,
    };
    p.y = kind === "foundation" ? foundationY(gx, gz) : levelY(gx, gz, level);
    const w0 = pieceWorld(p);
    p.wx = w0.x; p.wz = w0.z; p.wrot = w0.rot;   // кэш для горячих проверок
    pieces.push(p);
    if (kind !== "door") {
      const { x, z } = pieceWorld(p);
      addCollider(x, z, kind === "foundation" ? 0 : 1.6, p);
    }
    return p;
  }

  function removePiece(p) {
    const i = pieces.indexOf(p);
    if (i >= 0) pieces.splice(i, 1);
    buildColliders();
    for (const q of pieces) {
      if (q.kind !== "door" && q.kind !== "foundation") {
        const { x, z } = pieceWorld(q);
        addCollider(x, z, 1.6, q);
      }
    }
  }

  // Мировые координаты и поворот куска: стены живут на рёбрах клетки.
  function pieceWorld(p) {
    const cx = p.gx * GRID, cz = p.gz * GRID;
    if (p.kind === "wall" || p.kind === "doorway" || p.kind === "door") {
      const off = GRID / 2;
      const map = [
        { x: cx, z: cz - off, rot: 0 },
        { x: cx + off, z: cz, rot: Math.PI / 2 },
        { x: cx, z: cz + off, rot: 0 },
        { x: cx - off, z: cz, rot: Math.PI / 2 },
      ][p.edge & 3];
      return { x: map.x, z: map.z, rot: map.rot, y: p.y };
    }
    return { x: cx, z: cz, rot: 0, y: p.y };
  }

  function serialize() {
    return {
      seed,
      harvested: nodes.reduce((acc, n, i) => (n.alive ? acc : (acc.push(i), acc)), []),
      pieces: pieces.map((p) => [p.kind, p.gx, p.gz, p.level, p.edge, p.tier, Math.round(p.hp), p.open ? 1 : 0]),
    };
  }

  function restore(save) {
    generate(save.seed);
    if (save.harvested) {
      for (const i of save.harvested) {
        if (nodes[i]) { nodes[i].alive = false; nodes[i].respawnAt = 0; nodes[i].hp = 0; }
      }
    }
    pieces.length = 0;
    if (save.pieces) {
      for (const [kind, gx, gz, level, edge, tier, hp, open] of save.pieces) {
        const p = addPiece(kind, gx, gz, level, edge, tier);
        if (p) { p.hp = hp; p.open = !!open; }
      }
    }
  }

  return {
    SIZE, CELLS, STEP, WATER, GRID, NODE_DEFS, PIECE_HP,
    generate, restore, serialize, height, slope, terrainMesh, makeMeshes,
    nodes, props, springs, pieces, nearColliders, buildColliders,
    addPiece, removePiece, findPiece, pieceWorld, foundationY, levelY, snap,
    get ruins() { return ruins; },
    mulberry32,
  };
})();
