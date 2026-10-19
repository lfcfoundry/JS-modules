/*! sprite-baker-wasm.js: an optional add-on for sprite-baker.js that fills the triangles in WebAssembly (built from wasm/tri.c). Copyright (c) 2026 LFC Foundry. MIT License. Version 1.6.0 (API 1)
 * Load sprite-baker.js first, then this file (in Node: require it; it loads sprite-baker.js itself and returns SpriteBaker). It adds one function:
 *
 *   SpriteBaker.wasm([bytes])   returns { available, engine, Rast, drawMesh, setLight, features, stats }
 *
 * `Rast` and `drawMesh` are used exactly like SpriteBaker.Rast and SpriteBaker.drawMesh and give the same bytes of color and depth, pixel for pixel; only the speed differs
 * (about 1.0 to 1.8 times as fast for the fill, depending on the browser and the picture; numbers in README.md). The fill never runs per frame in a game, so it shortens the
 * baking time, not the FPS. `bytes` is another build of tri.wasm (for example the lean one from wasm/build.sh); without it the wasm inside this file is used.
 * When the browser has no WebAssembly, the page policy lacks 'wasm-unsafe-eval', or the module will not start, `available` is false, `engine` is 'js' and Rast and drawMesh are
 * SpriteBaker's own plain JavaScript ones, so code written against the result works everywhere. A single call can also fall back by itself (a surface over 1,048,576 pixels, a
 * texture over 229,376 pixels, a grid over 393,216 numbers, a material the wasm lacks the code for, odd numbers in the material): it then draws with the plain JavaScript and the
 * picture is the same. The depth and color of all Rasts made by one result live in one piece of wasm memory (no copy per fill); making a newer Rast copies the older one out first,
 * so every Rast stays correct, but read `rast.px` and `rast.z` fresh instead of keeping a reference across the making of another Rast. toImageData() returns a copy.
 * That copy costs about 0.06 ms for a 140 x 140 surface; `rast.release()` ("done with it") skips it when you make many small Rasts one after another.
 * `stats` counts the drawMesh calls the wasm filled and the ones it handed to the plain code ({ wasm, js }).
 */
(function (root) {
  'use strict';
  var SB = typeof SpriteBaker === 'object' && SpriteBaker ? SpriteBaker : require('./sprite-baker.js');
  var JOB = 0x10000, LUT = 0x11000, TEX = 0x20000, TRIS = 0x100000, Z = 0x400000, PX = 0x800000, MEM = 0x1000000;
  var MAX_PIXELS = (PX - Z) / 4, MAX_TEX_BYTES = TRIS - TEX, MAX_NUMBERS = (Z - TRIS) / 8, PI2 = Math.PI * 2, NO_DEPTH = -1e9;
  var WASM_B64 = /*WASM:BEGIN*/'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'/*WASM:END*/;
  var defaultEngine = null;
  if (!SB.Rast.prototype.release) SB.Rast.prototype.release = function () {};   // so code that calls release() on whatever Rast it got works with the plain one too

  function bytesOf(b64) {
    var t = atob(b64), u = new Uint8Array(t.length), i;
    for (i = 0; i < t.length; i++) u[i] = t.charCodeAt(i);
    return u;
  }

  /* the result when nothing can be started: SpriteBaker's own functions */
  function plainEngine() {
    return { available: false, engine: 'js', Rast: SB.Rast, drawMesh: SB.drawMesh, setLight: function (r, l) { return r.setLight(l); }, features: { texture: true, ridge: true } };
  }

  function make(bytes) {
    var inst, ex, mem, buf;
    try {
      if (typeof WebAssembly !== 'object' || !WebAssembly || typeof WebAssembly.Instance !== 'function') return plainEngine();
      inst = new WebAssembly.Instance(new WebAssembly.Module(bytes), { env: { pow: Math.pow, cos: Math.cos } });
      ex = inst.exports; mem = ex.memory; buf = mem.buffer;
      if (typeof ex.fill_mesh !== 'function' || !buf || buf.byteLength < MEM) return plainEngine();
    } catch (e) { return plainEngine(); }
    var feat = typeof ex.features === 'function' ? ex.features() : 3, hasTex = !!(feat & 1), hasRidge = !!(feat & 2);
    var f64 = new Float64Array(buf, JOB, 20), i32 = new Int32Array(buf, JOB + 160, 8), u32 = new Uint32Array(buf, JOB + 192, 4);
    var lutV = new Uint8Array(buf, LUT, 768), texV = new Uint8Array(buf, TEX, MAX_TEX_BYTES), vV = new Float64Array(buf, TRIS, MAX_NUMBERS);
    var stats = { wasm: 0, js: 0 }, owner = null, materialCache = typeof WeakMap === 'function' ? new WeakMap() : null;

    /* Rast: same fields and methods as SpriteBaker.Rast; z and px are views into the wasm memory while this Rast is the newest one (or the one drawn into last) */
    function Rast(w, h) {
      if (!(this instanceof Rast)) return new Rast(w, h);
      w = w | 0; h = h | 0;
      if (!(w >= 1 && h >= 1 && w * h <= MAX_PIXELS)) return new SB.Rast(w, h);
      this.w = w; this.h = h; this.z = null; this.px = null;
      claim(this);
      this.z.fill(NO_DEPTH); this.px.fill(0);
      this.setLight(SB.DEFAULT_LIGHT);
    }
    Rast.prototype = Object.create(SB.Rast.prototype);
    Rast.prototype.constructor = Rast;
    /* release(): "I am done with this Rast". Makes the next Rast (or the next drawMesh into another one) skip the copy that keeps this one correct; z and px are unusable after it,
       and drawing into it throws. Never needed for correctness, only for speed when many small Rasts are made one after another. */
    Rast.prototype.release = function () {
      if (owner === this) owner = null;
      this.z = null; this.px = null; this.released = true;
    };
    Rast.prototype.toImageData = function () {   // a copy, so a Rast made later cannot change a picture already handed out
      return SB.Rast.prototype.toImageData.call({ w: this.w, h: this.h, px: this.px.slice() });
    };

    /* make r the Rast whose buffers sit in wasm memory: the old one gets plain copies, r's copies (if it had any) are written back */
    function claim(r) {
      if (owner === r) return;
      var n = r.w * r.h, oldZ = r.z, oldPx = r.px;
      if (owner) { owner.z = owner.z.slice(); owner.px = owner.px.slice(); }
      r.z = new Float32Array(buf, Z, n); r.px = new Uint8ClampedArray(buf, PX, n * 4);
      if (oldZ) { r.z.set(oldZ); r.px.set(oldPx); }
      owner = r;
    }

    function asMaterial(m) {
      if (m && m.lut) return m;
      if (Array.isArray(m)) {
        var hit = materialCache && materialCache.get(m);
        if (!hit) { hit = SB.material(m); if (materialCache) materialCache.set(m, hit); }
        return hit;
      }
      return m;   // not a material: the plain drawMesh throws its own error
    }
    function nums(mat) { return typeof mat.specular === 'number' && typeof mat.bounce === 'number' && typeof mat.pool === 'number' && typeof mat.rimLight === 'number' && typeof mat.edge === 'number'; }

    /* true when wasm can draw this mesh with this material onto this Rast */
    function fits(rast, m, mat, st) {
      var T = mat.texture, Rg = mat.ridge;
      if (rast instanceof Rast && rast.released) throw new Error('this Rast was released; make a new one');
      if (!(rast instanceof Rast) || !(m.nu >= 1 && m.nv >= 1) || !nums(mat) || !mat.lut || mat.lut.length < 768) return false;
      if ((m.nu + 1) * (m.nv + 1) * st > MAX_NUMBERS) return false;
      if (T) {
        if (!hasTex || !(T.w >= 1 && T.h >= 1 && T.w === Math.floor(T.w) && T.h === Math.floor(T.h)) || !T.data || T.data.length < T.w * T.h * 4 || T.w * T.h * 4 > MAX_TEX_BYTES) return false;
      }
      if (Rg && !hasRidge) return false;
      return true;
    }

    function setup(rast, mat, cull) {
      var T = mat.texture, Rg = mat.ridge, pick = function (v, d) { return v === undefined ? d : v; };
      f64[0] = rast.L[0]; f64[1] = rast.L[1]; f64[2] = rast.L[2]; f64[3] = rast.H[0]; f64[4] = rast.H[1]; f64[5] = rast.H[2];
      f64[6] = mat.specular; f64[7] = mat.bounce * 0.16; f64[8] = mat.pool * 0.3; f64[9] = mat.rimLight * 0.4; f64[10] = mat.edge; f64[11] = cull === false ? NaN : cull === undefined ? -0.75 : cull;
      f64[12] = Rg ? pick(Rg.freq, 5) : 0; f64[13] = Rg ? pick(Rg.dark, -0.86) : 0; f64[14] = Rg ? pick(Rg.darkScale, 0.93) : 1; f64[15] = Rg && Rg.lit !== undefined ? Rg.lit : 0; f64[16] = Rg ? pick(Rg.litAdd, 0.06) : 0;
      f64[17] = T ? pick(T.shadeBase, 0.66) : 0.66; f64[18] = T ? pick(T.shadeWrap, 0.5) : 0.5; f64[19] = T ? pick(T.vWrap, PI2) : PI2;
      i32[0] = rast.w; i32[1] = rast.h; i32[2] = Rg ? 1 : 0; i32[3] = Rg && Rg.lit !== undefined ? 1 : 0; i32[4] = T ? 1 : 0; i32[5] = T ? (pick(T.uClamp, true) ? 1 : 0) : 1; i32[6] = T ? T.w : 0; i32[7] = T ? T.h : 0;
      u32[0] = LUT; u32[1] = TEX; u32[2] = Z; u32[3] = PX;
      lutV.set(mat.lut.length === 768 ? mat.lut : mat.lut.subarray(0, 768));
      if (T) texV.set(T.data.length === T.w * T.h * 4 ? T.data : T.data.subarray(0, T.w * T.h * 4));   // copied on every call, so a picture changed in place is seen at once
    }

    /* drawMesh(rast, m, mat, view, opts): the same arguments and result as SpriteBaker.drawMesh */
    function drawMesh(rast, m, mat, view, opts) {
      mat = asMaterial(mat);
      var withUV = !!(mat && (mat.texture || mat.ridge)), st = withUV ? 8 : 6;
      if (!mat || typeof mat !== 'object' || !fits(rast, m, mat, st)) {
        if (rast instanceof Rast) claim(rast);
        stats.js++;
        return SB.drawMesh(rast, m, mat, view, opts);
      }
      claim(rast);
      view = view || {};
      var s = view.scale === undefined ? 1 : view.scale, ox = view.ox || 0, oy = view.oy || 0, rot = view.rot || null, cen = view.center || [0, 0, 0];
      var cols = m.nv + 1, n = cols * (m.nu + 1), k, x, y, z, nx, ny, nz, p, V = vV, uvs = m.uv, pose = opts && typeof opts.pose === 'function' ? opts.pose : null;
      for (k = 0; k < n; k++) {
        x = m.pos[k * 3]; y = m.pos[k * 3 + 1]; z = m.pos[k * 3 + 2]; nx = m.nrm[k * 3]; ny = m.nrm[k * 3 + 1]; nz = m.nrm[k * 3 + 2];
        if (rot) {
          x -= cen[0]; y -= cen[1]; z -= cen[2];
          var rx = rot[0] * x + rot[1] * y + rot[2] * z + cen[0], ry = rot[3] * x + rot[4] * y + rot[5] * z + cen[1], rz = rot[6] * x + rot[7] * y + rot[8] * z + cen[2];
          var qx = rot[0] * nx + rot[1] * ny + rot[2] * nz, qy = rot[3] * nx + rot[4] * ny + rot[5] * nz, qz = rot[6] * nx + rot[7] * ny + rot[8] * nz;
          x = rx; y = ry; z = rz; nx = qx; ny = qy; nz = qz;
        }
        if (pose) { var P = { x: x, y: y, z: z, nx: nx, ny: ny, nz: nz }, Q = pose(P) || P; x = Q.x; y = Q.y; z = Q.z; nx = Q.nx; ny = Q.ny; nz = Q.nz; }
        p = k * st; V[p] = ox + x * s; V[p + 1] = oy + y * s; V[p + 2] = z * s; V[p + 3] = nx; V[p + 4] = ny; V[p + 5] = nz;
        if (withUV) { V[p + 6] = uvs ? uvs[k * 2] : ((k / cols) | 0) / m.nu; V[p + 7] = uvs ? uvs[k * 2 + 1] : ((k % cols) / m.nv) * PI2; }
      }
      setup(rast, mat, opts && opts.cull);
      ex.fill_mesh(JOB, TRIS, m.nu, m.nv, st);
      stats.wasm++;
    }

    return { available: true, engine: 'wasm', Rast: Rast, drawMesh: drawMesh, setLight: function (r, l) { return r.setLight(l); }, features: { texture: hasTex, ridge: hasRidge }, stats: stats };
  }

  SB.wasm = function (bytes) {
    if (bytes) return make(bytes);
    if (!defaultEngine) defaultEngine = WASM_B64 ? make(bytesOf(WASM_B64)) : plainEngine();
    return defaultEngine;
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SB;
})(typeof globalThis !== 'undefined' ? globalThis : this);
