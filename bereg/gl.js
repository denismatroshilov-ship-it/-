/* Микродвижок на WebGL2: всё, что рисует «Голый берег».

   Библиотек нет намеренно — игра должна открываться с экрана «Домой» без сети,
   а значит ни одного запроса наружу. Отсюда же стиль геометрии: всё низкополи
   и с цветом в вершинах, текстур нет вообще.

   Рисуем инстансами: 400 деревьев — это один вызов draw, а не 400. */
const GL = (() => {
  "use strict";

  let gl = null, canvas = null;
  let prog = null, sky = null;
  const cam = { x: 0, y: 2, z: 0, yaw: 0, pitch: 0, fov: 70, near: 0.15, far: 260 };
  const view = new Float32Array(16);
  const proj = new Float32Array(16);
  const vp = new Float32Array(16);
  const basis = { fx: 0, fy: 0, fz: -1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 };
  const env = {
    sun: [0.6, 0.8, 0.2], sunColor: [1, 0.96, 0.88], ambient: [0.34, 0.36, 0.42],
    fog: [0.62, 0.7, 0.78], fogNear: 40, fogFar: 190,
    skyTop: [0.24, 0.45, 0.75], skyBottom: [0.72, 0.82, 0.9], night: 0,
  };
  const MAX_LIGHTS = 4;
  const lights = new Float32Array(MAX_LIGHTS * 4);   // x,y,z,radius
  const lightCols = new Float32Array(MAX_LIGHTS * 3);
  let lightCount = 0;

  // ── Матрицы (колоночные, как ждёт WebGL) ────────────────────────────────
  function perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out.fill(0);
    out[0] = f / aspect; out[5] = f; out[11] = -1;
    out[10] = (far + near) * nf; out[14] = 2 * far * near * nf;
    return out;
  }

  function lookAt(out, ex, ey, ez, cx, cy, cz, ux, uy, uz) {
    let zx = ex - cx, zy = ey - cy, zz = ez - cz;
    let len = Math.hypot(zx, zy, zz) || 1;
    zx /= len; zy /= len; zz /= len;
    let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
    len = Math.hypot(xx, xy, xz);
    if (len) { xx /= len; xy /= len; xz /= len; } else { xx = 1; xy = 0; xz = 0; }
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * ex + xy * ey + xz * ez);
    out[13] = -(yx * ex + yy * ey + yz * ez);
    out[14] = -(zx * ex + zy * ey + zz * ez);
    out[15] = 1;
    return out;
  }

  function multiply(out, a, b) {
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return out;
  }

  // ── Шейдеры ─────────────────────────────────────────────────────────────
  const VERT = `#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec3 aNormal;
  layout(location=2) in vec3 aColor;
  layout(location=3) in vec3 iPos;
  layout(location=4) in vec4 iParam;   // scaleXZ, scaleY, rotY, wind
  layout(location=5) in vec3 iTint;
  uniform mat4 uVP;
  uniform vec3 uCam;
  uniform float uTime;
  uniform float uFogNear, uFogFar;
  out vec3 vColor; out vec3 vNormal; out vec3 vWorld; out float vFog;
  void main(){
    float c = cos(iParam.z), s = sin(iParam.z);
    vec3 p = aPos * vec3(iParam.x, iParam.y, iParam.x);
    vec3 rp = vec3(p.x*c + p.z*s, p.y, -p.x*s + p.z*c);
    vec3 world = rp + iPos;
    // Ветер качает только то, что высоко над своей опорой: листву, траву.
    world.x += sin(uTime*1.3 + iPos.z*0.3) * iParam.w * max(rp.y, 0.0) * 0.03;
    vec3 n = vec3(aNormal.x*c + aNormal.z*s, aNormal.y, -aNormal.x*s + aNormal.z*c);
    vColor = aColor * iTint;
    vNormal = normalize(n);
    vWorld = world;
    vFog = clamp((distance(world, uCam) - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
    gl_Position = uVP * vec4(world, 1.0);
  }`;

  const FRAG = `#version 300 es
  precision mediump float;
  in vec3 vColor; in vec3 vNormal; in vec3 vWorld; in float vFog;
  uniform vec3 uSunDir, uSunColor, uAmbient, uFogColor;
  uniform float uAlpha;
  uniform int uLightCount;
  uniform vec4 uLights[4];
  uniform vec3 uLightCols[4];
  out vec4 frag;
  void main(){
    vec3 n = normalize(vNormal);
    float diff = max(dot(n, uSunDir), 0.0);
    float hemi = 0.55 + 0.45 * n.y;
    vec3 col = vColor * (uAmbient * hemi + uSunColor * diff);
    for (int i = 0; i < 4; i++) {
      if (i >= uLightCount) break;
      vec3 d = uLights[i].xyz - vWorld;
      float dist = length(d);
      float att = max(0.0, 1.0 - dist / uLights[i].w);
      col += vColor * uLightCols[i] * att * att * (0.35 + 0.65 * max(dot(n, normalize(d)), 0.0));
    }
    col = mix(col, uFogColor, vFog);
    frag = vec4(col, uAlpha);
  }`;

  // Небо: один треугольник на весь экран, луч считаем из базиса камеры.
  const SKY_VERT = `#version 300 es
  layout(location=0) in vec2 aXY;
  uniform vec3 uF, uR, uU;
  uniform float uTanY, uAspect;
  out vec3 vDir;
  void main(){
    vDir = normalize(uF + uR * (aXY.x * uTanY * uAspect) + uU * (aXY.y * uTanY));
    gl_Position = vec4(aXY, 0.9999, 1.0);
  }`;

  const SKY_FRAG = `#version 300 es
  precision mediump float;
  in vec3 vDir;
  uniform vec3 uTop, uBottom, uSunDir, uSunColor;
  uniform float uNight;
  out vec4 frag;
  float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  void main(){
    vec3 d = normalize(vDir);
    float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uBottom, uTop, pow(h, 0.65));
    float sun = max(dot(d, uSunDir), 0.0);
    col += uSunColor * pow(sun, 64.0) * 1.4;        // диск
    col += uSunColor * pow(sun, 6.0) * 0.22;        // ореол у горизонта
    if (uNight > 0.01 && d.y > 0.0) {
      vec3 g = floor(d * 190.0);
      float star = step(0.9975, hash(g));
      col += vec3(star) * uNight * (0.6 + 0.4 * hash(g + 3.1));
    }
    frag = vec4(col, 1.0);
  }`;

  function compile(vs, fs) {
    const make = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error("shader: " + gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const p = gl.createProgram();
    gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("link: " + gl.getProgramInfoLog(p));
    }
    const uniforms = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, "");
      uniforms[name] = gl.getUniformLocation(p, name);
    }
    return { p, u: uniforms };
  }

  // ── Геометрия ───────────────────────────────────────────────────────────
  function geo() { return { pos: [], norm: [], col: [], idx: [] }; }

  function pushQuad(g, a, b, c, d, color) {
    const base = g.pos.length / 3;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const v of [a, b, c, d]) {
      g.pos.push(v[0], v[1], v[2]);
      g.norm.push(nx, ny, nz);
      g.col.push(color[0], color[1], color[2]);
    }
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return g;
  }

  function box(g, w, h, d, color, ox = 0, oy = 0, oz = 0) {
    const x0 = ox - w / 2, x1 = ox + w / 2;
    const y0 = oy, y1 = oy + h;
    const z0 = oz - d / 2, z1 = oz + d / 2;
    const s = (k) => [color[0] * k, color[1] * k, color[2] * k];
    pushQuad(g, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], s(1));
    pushQuad(g, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], s(0.82));
    pushQuad(g, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], s(0.92));
    pushQuad(g, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], s(0.88));
    pushQuad(g, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], s(1.08));
    pushQuad(g, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], s(0.7));
    return g;
  }

  function cylinder(g, rb, rt, h, seg, color, oy = 0, jitter = 0) {
    const base = g.pos.length / 3;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const j = 1 + (jitter ? (Math.sin(i * 12.9898) * 0.5 + 0.5) * jitter : 0);
      const p = [
        [Math.cos(a0) * rb * j, oy, Math.sin(a0) * rb * j],
        [Math.cos(a1) * rb * j, oy, Math.sin(a1) * rb * j],
        [Math.cos(a1) * rt * j, oy + h, Math.sin(a1) * rt * j],
        [Math.cos(a0) * rt * j, oy + h, Math.sin(a0) * rt * j],
      ];
      const shade = 0.75 + 0.25 * (0.5 + 0.5 * Math.cos(a0));
      // Обход против часовой стрелки снаружи, иначе бок цилиндра отсечётся.
      pushQuad(g, p[0], p[3], p[2], p[1], [color[0] * shade, color[1] * shade, color[2] * shade]);
    }
    // Крышка
    const capBase = g.pos.length / 3;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      g.pos.push(Math.cos(a) * rt, oy + h, Math.sin(a) * rt);
      g.norm.push(0, 1, 0);
      g.col.push(color[0] * 1.1, color[1] * 1.1, color[2] * 1.1);
    }
    for (let i = 1; i < seg - 1; i++) g.idx.push(capBase, capBase + i + 1, capBase + i);
    void base;
    return g;
  }

  function cone(g, r, h, seg, color, oy = 0) {
    return cylinder(g, r, r * 0.06, h, seg, color, oy);
  }

  function sphere(g, r, seg, color, oy = 0, squash = 1) {
    const rings = Math.max(3, Math.round(seg / 2));
    const base = g.pos.length / 3;
    for (let y = 0; y <= rings; y++) {
      const phi = (y / rings) * Math.PI;
      for (let x = 0; x <= seg; x++) {
        const th = (x / seg) * Math.PI * 2;
        const nx = Math.sin(phi) * Math.cos(th), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(th);
        g.pos.push(nx * r, oy + ny * r * squash, nz * r);
        g.norm.push(nx, ny, nz);
        const k = 0.85 + 0.15 * ny;
        g.col.push(color[0] * k, color[1] * k, color[2] * k);
      }
    }
    for (let y = 0; y < rings; y++) {
      for (let x = 0; x < seg; x++) {
        const a = base + y * (seg + 1) + x, b = a + seg + 1;
        g.idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    return g;
  }

  function mesh(g) {
    const n = g.pos.length / 3;
    const data = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) {
      data[i * 9] = g.pos[i * 3]; data[i * 9 + 1] = g.pos[i * 3 + 1]; data[i * 9 + 2] = g.pos[i * 3 + 2];
      data[i * 9 + 3] = g.norm[i * 3]; data[i * 9 + 4] = g.norm[i * 3 + 1]; data[i * 9 + 5] = g.norm[i * 3 + 2];
      data[i * 9 + 6] = g.col[i * 3]; data[i * 9 + 7] = g.col[i * 3 + 1]; data[i * 9 + 8] = g.col[i * 3 + 2];
    }
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const ibo = gl.createBuffer();
    const idx = n > 65535 ? new Uint32Array(g.idx) : new Uint16Array(g.idx);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    return { vbo, ibo, count: g.idx.length, type: n > 65535 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
  }

  // ── Пачка инстансов: одна геометрия, много копий, один вызов draw ───────
  const STRIDE = 10;   // pos3 + param4 + tint3

  class Batch {
    constructor(m, max) {
      this.mesh = m;
      this.max = max;
      this.data = new Float32Array(max * STRIDE);
      this.n = 0;
      this.dirty = true;
      this.ibuf = gl.createBuffer();
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
      const fs = 4;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 9 * fs, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 9 * fs, 3 * fs);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 9 * fs, 6 * fs);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, STRIDE * fs, 0); gl.vertexAttribDivisor(3, 1);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.FLOAT, false, STRIDE * fs, 3 * fs); gl.vertexAttribDivisor(4, 1);
      gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 3, gl.FLOAT, false, STRIDE * fs, 7 * fs); gl.vertexAttribDivisor(5, 1);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
      gl.bindVertexArray(null);
    }

    clear() { this.n = 0; this.dirty = true; }

    add(x, y, z, sxz, sy, rot, r, g2, b, wind) {
      if (this.n >= this.max) return -1;
      const o = this.n * STRIDE;
      const d = this.data;
      d[o] = x; d[o + 1] = y; d[o + 2] = z;
      d[o + 3] = sxz; d[o + 4] = sy; d[o + 5] = rot; d[o + 6] = wind || 0;
      d[o + 7] = r; d[o + 8] = g2; d[o + 9] = b;
      this.dirty = true;
      return this.n++;
    }

    set(i, x, y, z, sxz, sy, rot, r, g2, b, wind) {
      if (i < 0 || i >= this.max) return;
      const o = i * STRIDE, d = this.data;
      d[o] = x; d[o + 1] = y; d[o + 2] = z;
      d[o + 3] = sxz; d[o + 4] = sy; d[o + 5] = rot; d[o + 6] = wind || 0;
      d[o + 7] = r; d[o + 8] = g2; d[o + 9] = b;
      this.dirty = true;
    }

    hide(i) {
      if (i < 0) return;
      this.data[i * STRIDE + 3] = 0;
      this.data[i * STRIDE + 4] = 0;
      this.dirty = true;
    }

    draw(alpha) {
      if (!this.n) return;
      gl.uniform1f(prog.u.uAlpha, alpha === undefined ? 1 : alpha);
      gl.bindVertexArray(this.vao);
      if (this.dirty) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * STRIDE);
        this.dirty = false;
      }
      gl.drawElementsInstanced(gl.TRIANGLES, this.mesh.count, this.mesh.type, 0, this.n);
      gl.bindVertexArray(null);
    }
  }

  // ── Кадр ────────────────────────────────────────────────────────────────
  let skyVao = null;

  function init(cv) {
    canvas = cv;
    gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
    if (!gl) return null;
    prog = compile(VERT, FRAG);
    sky = compile(SKY_VERT, SKY_FRAG);
    skyVao = gl.createVertexArray();
    gl.bindVertexArray(skyVao);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    resize();
    return gl;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
  }

  function updateCamera() {
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    basis.fx = -Math.sin(cam.yaw) * cp; basis.fy = sp; basis.fz = -Math.cos(cam.yaw) * cp;
    basis.rx = Math.cos(cam.yaw); basis.ry = 0; basis.rz = -Math.sin(cam.yaw);
    basis.ux = basis.ry * basis.fz - basis.rz * basis.fy;
    basis.uy = basis.rz * basis.fx - basis.rx * basis.fz;
    basis.uz = basis.rx * basis.fy - basis.ry * basis.fx;
    const aspect = canvas.width / Math.max(1, canvas.height);
    perspective(proj, (cam.fov * Math.PI) / 180, aspect, cam.near, cam.far);
    lookAt(view, cam.x, cam.y, cam.z, cam.x + basis.fx, cam.y + basis.fy, cam.z + basis.fz, 0, 1, 0);
    multiply(vp, proj, view);
    return aspect;
  }

  function beginFrame(time) {
    const aspect = updateCamera();
    // Цвет чистим обязательно: без preserveDrawingBuffer браузер возвращает
    // буфер с мусором, и незакрашенные тайлы показывают прошлый кадр.
    gl.clearColor(env.fog[0], env.fog[1], env.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.depthMask(false);
    gl.useProgram(sky.p);
    gl.bindVertexArray(skyVao);
    gl.uniform3f(sky.u.uF, basis.fx, basis.fy, basis.fz);
    gl.uniform3f(sky.u.uR, basis.rx, basis.ry, basis.rz);
    gl.uniform3f(sky.u.uU, basis.ux, basis.uy, basis.uz);
    gl.uniform1f(sky.u.uTanY, Math.tan((cam.fov * Math.PI) / 360));
    gl.uniform1f(sky.u.uAspect, aspect);
    gl.uniform3fv(sky.u.uTop, env.skyTop);
    gl.uniform3fv(sky.u.uBottom, env.skyBottom);
    gl.uniform3fv(sky.u.uSunDir, env.sun);
    gl.uniform3fv(sky.u.uSunColor, env.sunColor);
    gl.uniform1f(sky.u.uNight, env.night);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.depthMask(true);

    gl.useProgram(prog.p);
    gl.uniformMatrix4fv(prog.u.uVP, false, vp);
    gl.uniform3f(prog.u.uCam, cam.x, cam.y, cam.z);
    gl.uniform1f(prog.u.uTime, time);
    gl.uniform3fv(prog.u.uSunDir, env.sun);
    gl.uniform3fv(prog.u.uSunColor, env.sunColor);
    gl.uniform3fv(prog.u.uAmbient, env.ambient);
    gl.uniform3fv(prog.u.uFogColor, env.fog);
    gl.uniform1f(prog.u.uFogNear, env.fogNear);
    gl.uniform1f(prog.u.uFogFar, env.fogFar);
    gl.uniform1i(prog.u.uLightCount, lightCount);
    if (lightCount) {
      gl.uniform4fv(prog.u.uLights, lights);
      gl.uniform3fv(prog.u.uLightCols, lightCols);
    }
  }

  function setLights(list) {
    lightCount = Math.min(MAX_LIGHTS, list.length);
    for (let i = 0; i < lightCount; i++) {
      const l = list[i];
      lights[i * 4] = l.x; lights[i * 4 + 1] = l.y; lights[i * 4 + 2] = l.z; lights[i * 4 + 3] = l.r;
      lightCols[i * 3] = l.col[0]; lightCols[i * 3 + 1] = l.col[1]; lightCols[i * 3 + 2] = l.col[2];
    }
  }

  function blend(on) {
    if (on) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    } else {
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }
  }

  // Отладка: куда на экране попадает точка мира (NDC, y вверх).
  function project(x, y, z) {
    const w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    return {
      x: (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w,
      y: (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / w,
      z: (vp[2] * x + vp[6] * y + vp[10] * z + vp[14]) / w,
      w,
    };
  }

  return {
    init, resize, beginFrame, setLights, blend, env, cam, basis, project,
    geo, box, cylinder, cone, sphere, pushQuad, mesh, Batch,
    get gl() { return gl; },
    get canvas() { return canvas; },
  };
})();
