/*!
 * netflow-scene-index.js, an optional companion of netflow-scene.js: a screen-position index for big maps. The centers of the items are sorted along a Z-order (Morton) curve and kept as Elias-Fano, so "which items are in this box" and "which item is under this point" read a few short stretches of the sorted list instead of every item.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules. Cut from Netflow Map. Copyright (c) 2026 LFC Foundry. MIT License.
 * Version 1.3.1 (API 1)
 *
 * Needs elias-fano 1.0.0 or newer (global EliasFano, or the file next to it in this repository). Used only for maps of 100,000 items or more (up to 1,048,576); smaller maps keep the scene module's own grid, which is faster there.
 *   var S = NetflowScene.make(L, { spatial: NetflowSceneIndex });   // the scene module builds the index instead of its grid and uses it in pick() and inRect()
 * Answers equal the plain scan (inRect returns the same keys in the same order); pick() may differ from the grid only when two overlapping boxes share the very same paint order number.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetflowSceneIndex = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var MIN_ITEMS = 100000, MAX_ITEMS = 1048576, BOX_SHARE = 0.1, LEAF = 6;   // box queries bigger than 10% of the picture's area are left to the plain scan; cells are split down to 2^6 steps of the 65,536 steps per side
  var EFmod = null, tried = false;
  function ef() { if (!tried) { tried = true; try { EFmod = typeof EliasFano !== 'undefined' ? EliasFano : (typeof require === 'function' ? require('../elias-fano/elias-fano.js') : null); } catch (e) { EFmod = null; } } return EFmod; }
  function spread(v) { v &= 0xffff; v = (v | (v << 8)) & 0x00ff00ff; v = (v | (v << 4)) & 0x0f0f0f0f; v = (v | (v << 2)) & 0x33333333; v = (v | (v << 1)) & 0x55555555; return v >>> 0; }
  /** Sorts the item numbers by code with three passes of 11, 11 and 10 bits (stable, typed arrays only; a comparator sort of a million items takes about a second). */
  function radix(codes, n) {
    var ka = codes.slice(), kb = new Uint32Array(n), ia = new Uint32Array(n), ib = new Uint32Array(n), i, pass, shift, cnt, b, d, t;
    for (i = 0; i < n; i++) ia[i] = i;
    for (pass = 0; pass < 3; pass++) {
      shift = pass * 11; cnt = new Uint32Array(2049);
      for (i = 0; i < n; i++) cnt[((ka[i] >>> shift) & 2047) + 1]++;
      for (b = 0; b < 2048; b++) cnt[b + 1] += cnt[b];
      for (i = 0; i < n; i++) { d = cnt[(ka[i] >>> shift) & 2047]++; kb[d] = ka[i]; ib[d] = ia[i]; }
      t = ka; ka = kb; kb = t; t = ia; ia = ib; ib = t;
    }
    return { keys: ka, order: ia };
  }
  /** The index for scene S, or null when the map is too small or too big, or the sorted-list module is missing. */
  function build(S, opt) {
    var E = ef(), N = S.nodes.length, min = opt && opt.min ? opt.min : MIN_ITEMS;
    if (!E || N < min || N > MAX_ITEMS) return null;
    var x0 = S.x0, y0 = S.y0, W = S.w > 0 ? S.w : 1, H = S.h > 0 ? S.h : 1, i, n, codes = new Uint32Array(N), mhw = 0, mhh = 0, qa, qb;
    for (i = 0; i < N; i++) {
      n = S.nodes[i];
      qa = Math.floor((n.x + n.w / 2 - x0) / W * 65535); qa = qa < 0 ? 0 : qa > 65535 ? 65535 : qa;
      qb = Math.floor((n.y + n.h / 2 - y0) / H * 65535); qb = qb < 0 ? 0 : qb > 65535 ? 65535 : qb;
      codes[i] = (spread(qa) | (spread(qb) << 1)) >>> 0;
      if (n.w / 2 > mhw) mhw = n.w / 2; if (n.h / 2 > mhh) mhh = n.h / 2;
    }
    var r = radix(codes, N);
    return { ef: E.open(E.build(r.keys)), order: r.order, n: N, x0: x0, y0: y0, W: W, H: H, mhw: mhw, mhh: mhh };
  }
  function qx(I, x) { var q = Math.floor((x - I.x0) / I.W * 65535); return q < 0 ? 0 : q > 65535 ? 65535 : q; }
  function qy(I, y) { var q = Math.floor((y - I.y0) / I.H * 65535); return q < 0 ? 0 : q > 65535 ? 65535 : q; }
  /** Code ranges [lo, hi] (inclusive, merged when they touch) that cover the quantized box. */
  function ranges(qa, qb, qc, qd) {
    var out = [];
    (function rec(cx, cy, lev) {
      var sz = 1 << lev, ex = cx + sz - 1, ey = cy + sz - 1;
      if (ex < qa || cx > qc || ey < qb || cy > qd) return;
      var lo = (spread(cx) | (spread(cy) << 1)) >>> 0, hi = lo + sz * sz - 1;
      if ((cx >= qa && ex <= qc && cy >= qb && ey <= qd) || lev <= LEAF) { var l = out.length; if (l && out[l - 1] + 1 >= lo) out[l - 1] = hi; else out.push(lo, hi); return; }
      var h = sz >> 1; rec(cx, cy, lev - 1); rec(cx + h, cy, lev - 1); rec(cx, cy + h, lev - 1); rec(cx + h, cy + h, lev - 1);
    })(0, 0, 16);
    return out;
  }
  /** Item numbers whose centers might be in the world box (everything in the code ranges; the caller tests exactly). */
  function candidates(I, ax, ay, bx, by) {
    var r = ranges(qx(I, ax), qy(I, ay), qx(I, bx), qy(I, by)), out = [], p, a, b, t, L = I.ef;
    for (p = 0; p < r.length; p += 2) {
      a = L.nextGEQ(r[p]); b = r[p + 1] >= 4294967295 ? L.length : L.nextGEQ(r[p + 1] + 1);
      for (t = a; t < b; t++) out.push(I.order[t]);
    }
    return out;
  }
  /** Keys of the items whose centers are inside the box, in the scene's item order; null when the box is too big for the index to win (the caller scans). */
  function rect(S, I, ax, ay, bx, by) {
    if ((bx - ax) * (by - ay) >= BOX_SHARE * I.W * I.H) return null;
    var ids = candidates(I, ax, ay, bx, by), keep = [], j, n, cx, cy, out = [];
    for (j = 0; j < ids.length; j++) { n = S.nodes[ids[j]]; if (n.hidden || n.key.indexOf('shape:') === 0) continue; cx = n.x + n.w / 2; cy = n.y + n.h / 2; if (cx >= ax && cx <= bx && cy >= ay && cy <= by) keep.push(ids[j]); }
    keep = Uint32Array.from(keep).sort();
    for (j = 0; j < keep.length; j++) out.push(S.nodes[keep[j]].key);
    return out;
  }
  /** The topmost item box under the world point (the same rule as the scene module's grid), or null. */
  function pick(S, I, wx, wy, slop) {
    slop = slop || 0;
    var ids = candidates(I, wx - slop - I.mhw, wy - slop - I.mhh, wx + slop + I.mhw, wy + slop + I.mhh), best = null, j, n;
    for (j = 0; j < ids.length; j++) {
      n = S.nodes[ids[j]];
      if (n.hidden) continue;
      if (wx >= n.x - slop && wx <= n.x + n.w + slop && wy >= n.y - slop && wy <= n.y + n.h + slop) { if (!best || (n.o !== undefined ? n.o : n.i) > (best.o !== undefined ? best.o : best.i)) best = n; }
    }
    return best;
  }
  return { version: '1.3.1', api: 1, minItems: MIN_ITEMS, maxItems: MAX_ITEMS, available: function () { return ef() !== null; }, build: build, rect: rect, pick: pick, _candidates: candidates };
}));
