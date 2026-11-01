/*!
 * netflow-sankey.js: lay out a flow chart (Sankey diagram) from a plain list of links. No dependencies.
 * Every link is drawn, a band is as thick as its flow everywhere (one scale), long links go through the layers in between, the order
 * minimizes WEIGHTED crossings (big flows crossing big flows cost most), and links that run backwards are drawn as bands under the picture.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 2.6.0 (API 2)
 *
 *   var R = NetflowSankey.layoutFlows({ links: [{ from: "Wages", to: "Rent", value: 40 }, { from: "Wages", to: "Food", value: 25 }] });
 *   svgElement.innerHTML = NetflowSankey.toSvg(R);          // or draw R.nodes, R.bands and R.loops yourself (see README)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetflowSankey = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var EPS = 1e-9, DUMMY_CAP = 20000;   // DUMMY_CAP: most stand-in points for long links the layout routes (the rest are drawn straight through)
  function rng(seed) { var s = seed | 0; return function () { s = (s + 0x6d2b79f5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }


  /* ---- WebAssembly for the order search (wasm/order.c): the same sweeps, swaps and crossing count, same arithmetic, same answer. Plain JavaScript runs when WebAssembly is missing, refused by the page, or a flow is not an ordinary number. ---- */
  var WASM_B64 = /*WASM:BEGIN*/'AGFzbQEAAAABUgZgGn9/f39/f39/f39/f39/f39/f39/f39/f39/AGACf38BfGAAAXxgAn9/AGAQf39/f39/f39/f39/fHx/fwBgD39/f39/f3x/f39/f398fAADBwYAAQIDBAUFAwEAAQYPAn8BQfDIAAt/AEHwyAALBy0FBm1lbW9yeQIABGJpbmQAAANydW4AAQVyZWxheAAEC19faGVhcF9iYXNlAwEK/UwGtgIAQQAgATYChIiAgABBACAANgKAiICAAEEAIAI2AoiIgIAAQQAgAzYCjIiAgABBACAENgKQiICAAEEAIAU2ApSIgIAAQQAgBjYCmIiAgABBACAHNgKciICAAEEAIAg2AqCIgIAAQQAgCTYCpIiAgABBACAKNgKoiICAAEEAIAs2AqyIgIAAQQAgDDYCsIiAgABBACANNgK0iICAAEEAIA42AriIgIAAQQAgDzYCvIiAgABBACAQNgLAiICAAEEAIBE2AsSIgIAAQQAgEjYCyIiAgABBACAUNgLQiICAAEEAIBM2AsyIgIAAQQAgFTYC1IiAgABBACAWNgLciICAAEEAIBc2AuCIgIAAQQAgGDYC6IiAgABBACAZNgLsiICAAEEAQQA2AtiIgIAAQQBBADYC5IiAgAALjiUHCX8BfCN/AXwBfwF8A38CQEEAKAKAiICAACICQQFIDQAgAkEDcSEDQQAoAqSIgIAAIQRBACgCkIiAgAAhBUEAIQYCQCACQQRJDQAgAkH8////B3EhB0EAIQhBACEGA0AgBCAIaiIJIAUgCGoiCigCADYCACAJQQRqIApBBGooAgA2AgAgCUEIaiAKQQhqKAIANgIAIAlBDGogCkEMaigCADYCACAIQRBqIQggByAGQQRqIgZHDQALCyADRQ0AIAUgBkECdCIJaiEIIAQgCWohCQNAIAkgCCgCADYCACAIQQRqIQggCUEEaiEJIANBf2oiAw0ACwsCQEEAKAKEiICAACIIQQFIDQAgCEEDcSEKQQAhA0EAKALsiICAACEEQQAoAuiIgIAAIQUCQCAIQQRJDQAgCEH8////B3EhBiAEIQggBSEJQQAhAwNAIAlBADYCACAIQX42AgAgCUEEakEANgIAIAhBDGpBfjYCACAJQQhqQQA2AgAgCEEYakF+NgIAIAlBDGpBADYCACAIQSRqQX42AgAgCEEwaiEI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'/*WASM:END*/, WM, WI;
  var binCache = null;
  function wasmBytes() {
    if (binCache) return binCache;
    var bin, i;
    if (typeof Uint8Array.fromBase64 === 'function') bin = Uint8Array.fromBase64(WASM_B64);
    else if (typeof atob === 'function') { var raw = atob(WASM_B64); bin = new Uint8Array(raw.length); for (i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i); }
    else bin = new Uint8Array(Buffer.from(WASM_B64, 'base64'));
    return (binCache = bin);
  }
  /* compile early: the engine compiles the wasm on another thread as soon as this file loads, so the first layout only starts it; a layout asked for before that is done compiles on the spot, as before */
  var early = null;
  function compileEarly() {
    if (early) return early;
    try {
      early = typeof WebAssembly === 'object' && WebAssembly && typeof WebAssembly.compile === 'function'
        ? WebAssembly.compile(wasmBytes()).then(function (m) { if (!WM) WM = m; binCache = null; return true; }, function () { return false; }) : Promise.resolve(false);
    } catch (e) { early = Promise.resolve(false); }
    return early;
  }
  function wasmInstance() {
    if (WI !== undefined) return WI;
    WI = null;
    try {
      if (typeof WebAssembly !== 'object' || typeof WebAssembly.Module !== 'function') return WI;
      if (!WM) WM = new WebAssembly.Module(wasmBytes());
      binCache = null;
      WI = new WebAssembly.Instance(WM, {}).exports;
    } catch (e) { WI = null; }
    return WI;
  }
  /* The relaxation (pull and settle in layout()) in WebAssembly: copies the lists in, runs relax in wasm/order.c, copies the places (Y) back.
     Same arithmetic, same order, so the same places to the last digit. Returns false (and the JavaScript runs) when WebAssembly is missing or memory cannot grow.
     Its lists go at the start of the module's free memory: the order search is finished by then. */
  var RELAX = { min: 64, calls: 0 };
  function relaxWasm(nV, nL, layerIx, Y, Hh, Dm, upS, upI, upW, dnS, dnI, dnW, pad, padD, alpha) {
    if (nV < RELAX.min) return false;
    var X = wasmInstance(); if (!X || !X.relax) return false;
    var nS = upS[nV], nD = dnS[nV], k;
    for (k = 0; k < nS; k++) if (!(upW[k] <= 1e300 && upW[k] >= -1e300)) return false;
    for (k = 0; k < nD; k++) if (!(dnW[k] <= 1e300 && dnW[k] >= -1e300)) return false;
    var at = X.__heap_base.value !== undefined ? X.__heap_base.value : X.__heap_base, off = {}, put = function (name, bytes) { at = (at + 7) & ~7; off[name] = at; at += bytes; };
    put('start', 4 * (nL + 1)); put('ix', 4 * nV); put('Y', 8 * nV); put('Hh', 8 * nV); put('Dm', nV); put('upS', 4 * (nV + 1)); put('upI', 4 * nS); put('upW', 8 * nS);
    put('dnS', 4 * (nV + 1)); put('dnI', 4 * nD); put('dnW', 8 * nD); put('alpha', 8 * alpha.length);
    var need = Math.ceil((at + 64) / 65536) - X.memory.buffer.byteLength / 65536;
    try { if (need > 0) X.memory.grow(need); } catch (e) { return false; }
    var buf = X.memory.buffer, st = new Int32Array(buf, off.start, nL + 1), ix = new Int32Array(buf, off.ix, nV), r = 0;
    for (k = 0; k < nL; k++) { st[k] = r; ix.set(layerIx[k], r); r += layerIx[k].length; }
    st[nL] = r;
    var Yw = new Float64Array(buf, off.Y, nV); Yw.set(Y); new Float64Array(buf, off.Hh, nV).set(Hh); new Uint8Array(buf, off.Dm, nV).set(Dm);
    new Int32Array(buf, off.upS, nV + 1).set(upS.subarray(0, nV + 1)); new Int32Array(buf, off.upI, nS).set(upI.subarray(0, nS)); new Float64Array(buf, off.upW, nS).set(upW.subarray(0, nS));
    new Int32Array(buf, off.dnS, nV + 1).set(dnS.subarray(0, nV + 1)); new Int32Array(buf, off.dnI, nD).set(dnI.subarray(0, nD)); new Float64Array(buf, off.dnW, nD).set(dnW.subarray(0, nD));
    new Float64Array(buf, off.alpha, alpha.length).set(alpha);
    X.relax(nL, off.start, off.ix, off.Y, off.Hh, off.Dm, off.upS, off.upI, off.upW, off.dnS, off.dnI, off.dnW, pad, padD, off.alpha, alpha.length);
    Y.set(Yw); RELAX.calls++;
    return true;
  }
  /* Puts the order search's arrays into WebAssembly memory (the JavaScript below works on views of the same bytes) and returns them with run(rounds, swaps), or null. */
  function orderWasm(nV, nL, layerOf, lc, S1, I1, O1, S2, I2, O2) {
    var X = wasmInstance(), i, k, maxDeg = 1, maxLen = 1;
    if (!X || nV < 2) return null;
    for (i = 0; i < O1.length; i++) if (!(O1[i] <= 1e100 && O1[i] >= 0)) return null;
    for (i = 0; i < O2.length; i++) if (!(O2[i] <= 1e100 && O2[i] >= 0)) return null;
    for (i = 0; i < nV; i++) { if (S1[i + 1] - S1[i] > maxDeg) maxDeg = S1[i + 1] - S1[i]; if (S2[i + 1] - S2[i] > maxDeg) maxDeg = S2[i + 1] - S2[i]; }
    for (k = 0; k < nL; k++) if (lc[k] > maxLen) maxLen = lc[k];
    var at = X.__heap_base, off = {}, put = function (name, bytes) { at = (at + 7) & ~7; off[name] = at; at += bytes; };
    put('layerOf', 4 * nV); put('start', 4 * (nL + 2)); put('ord', 4 * nV); put('pos', 4 * nV); put('lenOf', 8 * nL); put('bary', 8 * nV); put('tmp', 4 * nV); put('best', 4 * nV);
    put('S1', 4 * (nV + 1)); put('I1', 4 * I1.length); put('O1', 8 * O1.length); put('S2', 4 * (nV + 1)); put('I2', 4 * I2.length); put('O2', 8 * O2.length);
    put('xBot', 4 * maxDeg); put('xW', 8 * maxDeg); put('xBit', 8 * (maxLen + 4));
    var seenCap = Math.max(8, Math.min(256, Math.floor(1048576 / nV))); put('seenOrd', 4 * seenCap * nV); put('seenRem', 4 * seenCap);
    var memoN = Math.min(maxLen, 256); put('memo', 4 * memoN * memoN); put('lver', 4 * nL); put('sig', 12 * nL);
    var need = Math.ceil((at + 64) / 65536) - X.memory.buffer.byteLength / 65536;
    try { if (need > 0) X.memory.grow(need); } catch (e) { return null; }
    var buf = X.memory.buffer, I32 = function (n, len) { return new Int32Array(buf, off[n], len); }, F64 = function (n, len) { return new Float64Array(buf, off[n], len); };
    var start = I32('start', nL + 2), r = { start: start, ord: I32('ord', nV), pos: I32('pos', nV), lenOf: F64('lenOf', nL), bary: F64('bary', nV), tmp: I32('tmp', nV) };
    I32('layerOf', nV).set(layerOf); I32('S1', nV + 1).set(S1); I32('I1', I1.length).set(I1); F64('O1', O1.length).set(O1); I32('S2', nV + 1).set(S2); I32('I2', I2.length).set(I2); F64('O2', O2.length).set(O2);
    start[0] = 0;
    for (k = 0; k < nL; k++) start[k + 1] = start[k] + lc[k];
    start[nL + 1] = start[nL];
    X.bind(nV, nL, off.layerOf, off.start, off.ord, off.pos, off.lenOf, off.bary, off.tmp, off.best, off.S1, off.I1, off.O1, off.S2, off.I2, off.O2, off.xBot, off.xW, off.xBit, off.seenOrd, off.seenRem, seenCap, off.memo, memoN, off.lver, off.sig);
    I32('memo', memoN * memoN).fill(0);
    r.run = function (rounds, swaps) { return X.run(rounds, swaps); };
    return r;
  }

  /** Weighted crossings between two neighboring layers: links as [posTop, posBottom, weight]. Sum of w1*w2 over crossing pairs, in n log n. */
  function crossWeight(links, nb) {
    if (links.length < 2) return 0;
    var idx = links.slice().sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; }), bit = new Float64Array(nb + 2), total = 0, i = 0, j, k;
    var add = function (p, w) { for (p++; p <= nb + 1; p += p & -p) bit[p] += w; };
    var sum = function (p) { var s = 0; for (p++; p > 0; p -= p & -p) s += bit[p]; return s; };
    var all = 0;
    while (i < idx.length) {
      j = i; while (j < idx.length && idx[j][0] === idx[i][0]) j++;
      for (k = i; k < j; k++) total += idx[k][2] * (all - sum(idx[k][1]));   // earlier links (smaller top position) that end strictly lower down the page
      for (k = i; k < j; k++) { add(idx[k][1], idx[k][2]); all += idx[k][2]; }
      i = j;
    }
    return total;
  }

  /* crossWeight for the order search, which asks thousands of times: the bars of the upper layer are taken in order (each one's links are one
     group of equal top position), a group is ordered by bottom position (equal ones stay in their order, as a stable sort leaves them), and the
     work arrays are kept between calls. It adds up in the same order as crossWeight, so the answer is the same. */
  var xBot = new Int32Array(64), xW = new Float64Array(64), xBit = new Float64Array(256);
  function crossTyped(ord, pos, dnS, dnI, dnO, nb) {
    var len = ord.length, n = 0, i, k, m, p, v, s0, c, w, sum, tb, tw, all = 0, total = 0;
    for (i = 0; i < len; i++) n += dnS[ord[i] + 1] - dnS[ord[i]];
    if (n < 2) return 0;
    if (xBit.length < nb + 2) xBit = new Float64Array(Math.max(nb + 2, xBit.length * 2)); else xBit.fill(0, 0, nb + 2);
    for (i = 0; i < len; i++) {
      v = ord[i]; s0 = dnS[v]; c = dnS[v + 1] - s0;
      if (!c) continue;
      if (xBot.length < c) { xBot = new Int32Array(c * 2); xW = new Float64Array(c * 2); }
      for (k = 0; k < c; k++) {   // this bar's links, ordered by bottom position
        tb = pos[dnI[s0 + k]]; tw = dnO[s0 + k];
        for (m = k - 1; m >= 0 && xBot[m] > tb; m--) { xBot[m + 1] = xBot[m]; xW[m + 1] = xW[m]; }
        xBot[m + 1] = tb; xW[m + 1] = tw;
      }
      for (k = 0; k < c; k++) { sum = 0; for (p = xBot[k] + 1; p > 0; p -= p & -p) sum += xBit[p]; total += xW[k] * (all - sum); }
      for (k = 0; k < c; k++) { w = xW[k]; for (p = xBot[k] + 1; p <= nb + 1; p += p & -p) xBit[p] += w; all += w; }
    }
    return total;
  }
  /* Stable merge sort of bar slots a[0..n) by key[slot] (ties: by pos[slot] when tie is set, else they keep their order). */
  function sortSlots(a, n, tmp, key, pos, tie) {
    var i, j, x, w, lo, mid, hi, p, q, k, src = a, dst = tmp, t, y;
    for (lo = 0; lo < n; lo += 8) {
      hi = lo + 8 < n ? lo + 8 : n;
      for (i = lo + 1; i < hi; i++) {
        x = a[i]; j = i - 1;
        while (j >= lo) { y = a[j]; if (key[x] < key[y] || (tie && key[x] === key[y] && pos[x] < pos[y])) { a[j + 1] = y; j--; } else break; }
        a[j + 1] = x;
      }
    }
    for (w = 8; w < n; w *= 2) {
      for (lo = 0; lo < n; lo += 2 * w) {
        mid = lo + w < n ? lo + w : n; hi = lo + 2 * w < n ? lo + 2 * w : n; p = lo; q = mid; k = lo;
        while (p < mid && q < hi) {
          x = src[q]; y = src[p];
          if (key[x] < key[y] || (tie && key[x] === key[y] && pos[x] < pos[y])) { dst[k++] = x; q++; } else { dst[k++] = y; p++; }
        }
        while (p < mid) dst[k++] = src[p++];
        while (q < hi) dst[k++] = src[q++];
      }
      t = src; src = dst; dst = t;
    }
    if (src !== a) for (i = 0; i < n; i++) a[i] = src[i];
  }

  /**
   * Layers for a flow diagram: break cycles by turning the lightest-looking backward links around (weighted Eades-Lin-Smyth), give every item the
   * length of its longest path from a source, pull sources up next to their first consumer, and (optionally) send items that nothing leaves to the last layer.
   * ids: item ids; edges: [{from, to, flow}] with from/to as indexes. Returns { layer: Int32Array, feedback: Set of edge indexes that run backwards }.
   */
  function layering(n, edges, justifySinks) {
    var i, q, m = edges.length;
    /* each item's links out and in as flat lists (in link order, as before) */
    var oS = new Int32Array(n + 1), iS = new Int32Array(n + 1), oE = new Int32Array(m), iE = new Int32Array(m), eFrom = new Int32Array(m), eTo = new Int32Array(m), eFlow = new Float64Array(m);
    for (q = 0; q < m; q++) { var ed = edges[q]; eFrom[q] = ed.from; eTo[q] = ed.to; eFlow[q] = ed.flow; if (ed.from !== ed.to) { oS[ed.from + 1]++; iS[ed.to + 1]++; } }
    for (i = 0; i < n; i++) { oS[i + 1] += oS[i]; iS[i + 1] += iS[i]; }
    var oAt = oS.slice(0, n), iAt = iS.slice(0, n);
    for (q = 0; q < m; q++) if (eFrom[q] !== eTo[q]) { oE[oAt[eFrom[q]]++] = q; iE[iAt[eTo[q]]++] = q; }
    /* order the items so that few links run backwards (weighted Eades-Lin-Smyth). Same removal order as scanning all items for sinks, then for sources,
       until nothing moves: an item that becomes a sink (source) during a scan is taken in that scan when it comes later in item order, else in the next one. */
    var rank = new Int32Array(n), left = [], right = [], alive = new Uint8Array(n), nAlive = n, od = new Float64Array(n), idg = new Float64Array(n), j;
    for (i = 0; i < n; i++) { for (j = oS[i]; j < oS[i + 1]; j++) od[i] += eFlow[oE[j]]; for (j = iS[i]; j < iS[i + 1]; j++) idg[i] += eFlow[iE[j]]; }
    var oc = new Int32Array(n), ic = new Int32Array(n);   // how many links still lead out of / into items that are not placed yet
    for (i = 0; i < n; i++) { oc[i] = oS[i + 1] - oS[i]; ic[i] = iS[i + 1] - iS[i]; alive[i] = 1; }
    var sinkNext = [], srcNext = [], heap = new Int32Array(n), hn = 0, cur = -1, scanSinks = false;
    for (i = 0; i < n; i++) { if (!oc[i]) sinkNext.push(i); if (!ic[i]) srcNext.push(i); }
    var hpush = function (x) { var k = hn++, p; while (k > 0) { p = (k - 1) >> 1; if (heap[p] <= x) break; heap[k] = heap[p]; k = p; } heap[k] = x; };
    var hpop = function () { var top = heap[0], x = heap[--hn], k = 0, c; while ((c = 2 * k + 1) < hn) { if (c + 1 < hn && heap[c + 1] < heap[c]) c++; if (heap[c] >= x) break; heap[k] = heap[c]; k = c; } heap[k] = x; return top; };
    var remove = function (v) {
      alive[v] = 0; nAlive--;
      for (var t = oS[v]; t < oS[v + 1]; t++) { var e = oE[t], w = eTo[e]; if (--ic[w] === 0) { if (!scanSinks && w > cur) hpush(w); else srcNext.push(w); } if (alive[w]) idg[w] -= eFlow[e]; }
      for (t = iS[v]; t < iS[v + 1]; t++) { e = iE[t]; w = eFrom[e]; if (--oc[w] === 0) { if (scanSinks && w > cur) hpush(w); else sinkNext.push(w); } if (alive[w]) od[w] -= eFlow[e]; }
    };
    var scan = function (sinks) {   // one scan in item order; returns whether anything moved
      var list = sinks ? sinkNext : srcNext, moved = false, k;
      hn = 0; for (k = 0; k < list.length; k++) if (alive[list[k]]) hpush(list[k]);
      if (sinks) sinkNext = []; else srcNext = [];
      scanSinks = sinks; cur = -1;
      while (hn) {
        var v = hpop(); if (!alive[v] || v === cur) continue;
        cur = v; (sinks ? right : left).push(v); remove(v); moved = true;
      }
      cur = -1; scanSinks = false; hn = 0;
      return moved;
    };
    while (nAlive > 0) {
      var moved = true;
      while (moved) { var a1 = scan(true), a2 = scan(false); moved = a1 || a2; }
      if (nAlive > 0) { var bv = -1, bs = -Infinity; for (i = 0; i < n; i++) if (alive[i] && od[i] - idg[i] > bs) { bs = od[i] - idg[i]; bv = i; } left.push(bv); cur = n; remove(bv); cur = -1; }
    }
    var seq = left.concat(right.reverse()); seq.forEach(function (v, q) { rank[v] = q; });
    var feedback = new Set(), indeg = new Int32Array(n), layer = new Int32Array(n), succ = [], pred = [];
    for (i = 0; i < n; i++) { succ.push([]); pred.push([]); }
    edges.forEach(function (ed, q) { if (ed.from === ed.to) return; if (rank[ed.from] > rank[ed.to]) feedback.add(q); else { succ[ed.from].push(ed.to); pred[ed.to].push(ed.from); indeg[ed.to]++; } });
    var queue = []; for (i = 0; i < n; i++) if (!indeg[i]) queue.push(i);
    for (var h = 0; h < queue.length; h++) { var u = queue[h]; succ[u].forEach(function (w) { if (layer[w] < layer[u] + 1) layer[w] = layer[u] + 1; if (--indeg[w] === 0) queue.push(w); }); }
    var maxL = 0; for (i = 0; i < n; i++) maxL = Math.max(maxL, layer[i]);
    for (var r = queue.length - 1; r >= 0; r--) { var v = queue[r]; if (!pred[v].length && succ[v].length) { var mn = Infinity; succ[v].forEach(function (w) { mn = Math.min(mn, layer[w]); }); layer[v] = mn - 1; } }
    if (justifySinks) for (i = 0; i < n; i++) if (pred[i].length && !succ[i].length) layer[i] = maxL;
    return { layer: layer, feedback: feedback, levels: maxL + 1, order: seq };
  }

  /**
   * layout(L, opts). L: the Sankey drawing from the engine (L.nodes with .id .layer .label, L.edges with .from .to .flow .kind and, for long links, .pts).
   * opts: unweighted (order as the old picture does: every link counts the same, no restarts), stopCap and stopCapFrom (see the stand-in cap below), justifySinks, height (picture height to aim for), nodeW (bar width), gapLayer, pad (space between bars), restarts, budgetMs, seed.
   * Returns { nodes: [{id, label, x, y, w, h, layer, flow}], bands: [{edge, from, to, x0, y0a, y0b, x1, y1a, y1b, xm}], loops: [{edge, from, to, d, w, pts}],
   *           width, height, ky (pixels per unit of flow), crossingWeight, order, cols, ms }.
   * options(sk) cleans up a person's settings ({ nodeW, gap, pad, height, fixY, justify, order }) into the opts above; apply(L, r) writes a layout() result into the engine's drawing L (bar positions, picture size, L.sk).
   */
  function layout(L, opts) {
    opts = opts || {};
    var t0 = Date.now(), nodeW = opts.nodeW || 14, gapLayer = opts.gapLayer || 190, pad = opts.pad === undefined ? 12 : opts.pad, padD = 3;
    var byId = {}, layers = [], i, k, idx = {}, nk = function (n) { return n.nodeId !== undefined ? String(n.nodeId) : String(n.id); };   // nk: the name an item keeps across rebuilds
    var usable = []; L.edges.forEach(function (e, ei) { if (e.kind !== 'self' && e.from !== e.to && e.flow > EPS && L.pos[e.from] && L.pos[e.to]) usable.push(ei); });
    L.nodes.forEach(function (n, q) { idx[n.id] = q; });
    var fo = opts.fixedOrder, foLayer = null;
    if (fo && fo.layers && fo.loops) {   // reuse an earlier order (moving things by hand must not shuffle the rest)
      foLayer = {}; var okFo = true;
      fo.layers.forEach(function (list, li) { list.forEach(function (id) { if (id.charAt(0) !== '~') foLayer[id] = li; }); });
      L.nodes.forEach(function (n) { if (foLayer[nk(n)] === undefined) okFo = false; });
      if (!okFo || !fo.layers.length) foLayer = null;
    }
    var lay;
    if (foLayer) {
      var fb = new Set(), loopSet = {}; fo.loops.forEach(function (x) { loopSet[x] = 1; }); usable.forEach(function (ei, q) { var e0 = L.edges[ei], a0 = L.pos[e0.from], b0 = L.pos[e0.to]; if (loopSet[nk(a0) + '>' + nk(b0)]) fb.add(q); });
      lay = { layer: Int32Array.from(L.nodes.map(function (n) { return foLayer[nk(n)]; })), feedback: fb, levels: fo.layers.length, order: L.nodes.map(function (n, q) { return q; }) };
    } else lay = layering(L.nodes.length, usable.map(function (ei) { var e = L.edges[ei]; return { from: idx[e.from], to: idx[e.to], flow: e.flow }; }), opts.justifySinks !== false);
    var nL = lay.levels;
    var rankKey = {}; lay.order.forEach(function (q, r) { rankKey[L.nodes[q].id] = r; });
    /* Bars and stand-in stops live in flat arrays, one slot each: the items first (in their order), then the stand-ins. Only items keep an
       object (names and flow totals); a stand-in is just its slot. */
    var nN = L.nodes.length, Rb = new Array(nN), LayN = lay.layer;
    L.nodes.forEach(function (n, q) { var v = { id: n.id, ukey: nk(n), node: n, ix: q, inAll: 0, outAll: 0, pinned: false }; byId[n.id] = v; Rb[q] = v; });
    var fwd = [], loops = [];
    /* A long link gets one stand-in per layer it crosses so the layers can be ordered around it. Past DUMMY_CAP stand-ins in all, the lightest long links are drawn as one band from end to end instead (note in the result). */
    var noDummy = new Set(), dummyWant = 0, longLinks = [], simplified = 0;
    usable.forEach(function (ei, q) { var e = L.edges[ei], a = LayN[byId[e.from].ix], b = LayN[byId[e.to].ix]; if (!lay.feedback.has(q) && b > a + 1) { dummyWant += b - a - 1; longLinks.push(q); } });
    /* stopCap (off by default): a lower cap on stand-ins, so big maps draw more long links straight through (faster; a different picture).
       It only applies to maps with at least stopCapFrom items (default 1,000), so small maps keep every stand-in. */
    var capOn = typeof opts.stopCap === 'number' && opts.stopCap >= 0 && L.nodes.length >= (typeof opts.stopCapFrom === 'number' ? opts.stopCapFrom : 1000);
    var cap = capOn ? Math.min(DUMMY_CAP, Math.floor(opts.stopCap)) : DUMMY_CAP;
    if (dummyWant > cap) {
      var left = cap;
      longLinks.sort(function (p, q) { return L.edges[usable[q]].flow - L.edges[usable[p]].flow || p - q; }).forEach(function (q) {
        var e = L.edges[usable[q]], need = LayN[byId[e.to].ix] - LayN[byId[e.from].ix] - 1;
        if (need <= left) left -= need; else { noDummy.add(q); simplified++; }
      });
    }
    var nD = 0, nSeg = 0;   // count the stand-ins and band pieces first, so every array is made once at its size
    usable.forEach(function (ei, q) { var e = L.edges[ei], a = LayN[byId[e.from].ix], b = LayN[byId[e.to].ix]; if (!lay.feedback.has(q) && b > a) { if (!noDummy.has(q)) { nD += b - a - 1; nSeg += b - a; } else nSeg++; } });
    var nV = nN + nD, vi, qi, nUp = nSeg, nDn = nSeg;
    var bLay = new Int32Array(nV), bSize = new Float64Array(nV), bKey = new Float64Array(nV), Hh = new Float64Array(nV), Y = new Float64Array(nV), bPos = new Int32Array(nV),
      bX = new Float64Array(nV), bW = new Float64Array(nV), bLOT = new Float64Array(nV), bLIT = new Float64Array(nV), Dm = new Uint8Array(nV), bPin = new Uint8Array(nV),
      dA = new Int32Array(nV), dB = new Int32Array(nV);   // dA, dB: the items a stand-in's link leaves and enters
    for (vi = 0; vi < nN; vi++) { bLay[vi] = LayN[vi]; bKey[vi] = rankKey[L.nodes[vi].id]; }
    var segU = new Int32Array(nSeg), segV = new Int32Array(nSeg), segW = new Float64Array(nSeg), segEi = new Int32Array(nSeg), ns = 0, nv = nN;   // one segment per band piece between two neighboring layers: from bar, to bar, flow, which link
    var link = function (u, v, w, ei) { segU[ns] = u; segV[ns] = v; segW[ns] = w; segEi[ns] = ei; ns++; };
    usable.forEach(function (ei, q) {
      var e = L.edges[ei], A = byId[e.from], B = byId[e.to], a = A.ix, b = B.ix;
      if (!lay.feedback.has(q) && bLay[b] > bLay[a]) {
        var prev = a;
        for (k = bLay[a] + 1; k < bLay[b] && !noDummy.has(q); k++) {
          var d = nv++; dA[d] = a; dB[d] = b; bLay[d] = k; bSize[d] = e.flow; bKey[d] = (bKey[a] + bKey[b]) / 2; Dm[d] = 1;
          link(prev, d, e.flow, ei); prev = d;
        }
        link(prev, b, e.flow, ei); A.outAll += e.flow; B.inAll += e.flow; fwd.push(ei);
      } else { loops.push(ei); A.outAll += e.flow; B.inAll += e.flow; }
    });
    for (vi = 0; vi < nN; vi++) bSize[vi] = Math.max(Rb[vi].inAll, Rb[vi].outAll, EPS);
    /* ---- order inside each layer: weighted barycenter sweeps and weighted neighbor swaps, best of a few restarts ---- */
    var upS = new Int32Array(nV + 1), dnS = new Int32Array(nV + 1), upSeg = new Int32Array(nSeg), dnSeg = new Int32Array(nSeg), upI = new Int32Array(nSeg), upW = new Float64Array(nSeg), dnI = new Int32Array(nSeg), dnW = new Float64Array(nSeg), layerOf = bLay, cu, cd;
    for (qi = 0; qi < nSeg; qi++) { dnS[segU[qi] + 1]++; upS[segV[qi] + 1]++; }
    for (vi = 0; vi < nV; vi++) { dnS[vi + 1] += dnS[vi]; upS[vi + 1] += upS[vi]; }
    var curU = dnS.slice(0, nV), curD = upS.slice(0, nV);   // fill each bar's links in the order they were made
    for (qi = 0; qi < nSeg; qi++) {
      cd = curU[segU[qi]]++; dnSeg[cd] = qi; dnI[cd] = segV[qi]; dnW[cd] = segW[qi];
      cu = curD[segV[qi]]++; upSeg[cu] = qi; upI[cu] = segU[qi]; upW[cu] = segW[qi];
    }
    var upO = upW, dnO = dnW;   // the weights the order search counts with
    if (opts.unweighted) { upO = new Float64Array(nUp).fill(1); dnO = new Float64Array(nDn).fill(1); }
    /* The order search only looks at links between neighboring layers. A link drawn straight through (see above) reaches a bar further away: it stays in the lists above for stacking the band ends and placing the bars, and is left out of these. */
    var sUpS = upS, sUpI = upI, sUpO = upO, sDnS = dnS, sDnI = dnI, sDnO = dnO;
    if (simplified) {
      var near = function (S, I, O) {
        var S2 = new Int32Array(nV + 1), I2 = [], O2 = [], x, y;
        for (x = 0; x < nV; x++) { for (y = S[x]; y < S[x + 1]; y++) if (Math.abs(layerOf[I[y]] - layerOf[x]) === 1) { I2.push(I[y]); O2.push(O[y]); } S2[x + 1] = I2.length; }
        return [S2, Int32Array.from(I2), Float64Array.from(O2)];
      };
      var nu = near(upS, upI, upO), nd = near(dnS, dnI, dnO);
      sUpS = nu[0]; sUpI = nu[1]; sUpO = nu[2]; sDnS = nd[0]; sDnI = nd[1]; sDnO = nd[2];
    }
    var lc = new Int32Array(nL);
    for (vi = 0; vi < nV; vi++) lc[layerOf[vi]]++;
    var wk = opts.wasm === false ? null : orderWasm(nV, nL, layerOf, lc, sUpS, sUpI, sUpO, sDnS, sDnI, sDnO);
    var ord = [], pos = wk ? wk.pos : new Int32Array(nV), lenOf = wk ? wk.lenOf : new Float64Array(nL), bary = wk ? wk.bary : new Float64Array(nV), key2 = new Float64Array(nV), tmp = wk ? wk.tmp : new Int32Array(nV);
    var syncPos = function () { for (var q = 0; q < nL; q++) { var list = ord[q]; lenOf[q] = list.length || 1; for (var j = 0; j < list.length; j++) pos[list[j]] = j; } };
    for (k = 0; k < nL; k++) ord.push(wk ? wk.ord.subarray(wk.start[k], wk.start[k + 1]) : new Int32Array(lc[k]));
    lc.fill(0);
    for (vi = 0; vi < nV; vi++) { k = layerOf[vi]; ord[k][lc[k]++] = vi; key2[vi] = bKey[vi]; }
    for (k = 0; k < nL; k++) sortSlots(ord[k], ord[k].length, tmp, key2, pos, false);   // first order: by the ranking the layering gave
    syncPos();
    var idOf = function (v) { return Dm[v] ? '~' + nk(L.nodes[dA[v]]) + '>' + nk(L.nodes[dB[v]]) + ':' + bLay[v] : Rb[v].ukey; };   // v: a slot
    var keepOrder = false;
    if (foLayer) {
      var where = {}; fo.layers.forEach(function (list, li) { list.forEach(function (id, j) { where[li + '|' + id] = j; }); });
      keepOrder = true; for (vi = 0; vi < nV && keepOrder; vi++) if (where[bLay[vi] + '|' + idOf(vi)] === undefined) keepOrder = false;
      if (keepOrder) {
        for (vi = 0; vi < nV; vi++) key2[vi] = where[bLay[vi] + '|' + idOf(vi)];
        for (k = 0; k < nL; k++) sortSlots(ord[k], ord[k].length, tmp, key2, pos, false);
        syncPos();
      }
    }
    var total = function () {
      var c = 0;
      for (var q = 0; q + 1 < nL; q++) c += crossTyped(ord[q], pos, sDnS, sDnI, sDnO, ord[q + 1].length + 1);
      return c;
    };
    var snap = function () { return ord.map(function (l) { return l.slice(); }); };
    var restore = function (sn) { for (var q = 0; q < nL; q++) ord[q].set(sn[q]); syncPos(); };
    var sweep = function (q, goUp) {
      var list = ord[q], n = list.length, len = lenOf[q], j, e, e1, v, s, w, ww, nb, S, I, O, b, nan = false;
      if (goUp) { S = sUpS; I = sUpI; O = sUpO; } else { S = sDnS; I = sDnI; O = sDnO; }
      for (j = 0; j < n; j++) {
        v = list[j]; s = 0; w = 0;
        for (e = S[v], e1 = S[v + 1]; e < e1; e++) { nb = I[e]; ww = O[e]; s += ww * (pos[nb] + 0.5) / lenOf[layerOf[nb]]; w += ww; }
        b = w ? s / w : (pos[v] + 0.5) / len;
        if (b !== b) nan = true;
        bary[v] = b;
      }
      if (nan) {   // not a number somewhere (a flow that is not finite): let the built-in sort decide, as before
        var arr = Array.prototype.slice.call(list); arr.sort(function (x, y) { return bary[x] - bary[y] || pos[x] - pos[y]; }); list.set(arr);
      } else sortSlots(list, n, tmp, bary, pos, true);
      var ch = false; for (j = 0; j < n; j++) { if (pos[list[j]] !== j) ch = true; pos[list[j]] = j; }
      if (ch) lver[q]++;
    };
    /* Same shortcuts as swapPass in wasm/order.c: a pair's decision is kept for the rest of the call, and a layer that settled with its neighbor layers as they are now is skipped. Same decisions as before. */
    var lver = new Int32Array(nL), sig = new Int32Array(3 * nL).fill(-2), memoN = 0, memo = null, stamp = 0, loc = new Int32Array(nV);
    for (k = 0; k < nL; k++) if (ord[k].length > memoN) memoN = ord[k].length;
    memoN = Math.min(memoN, 256); memo = new Int32Array(memoN * memoN);
    var pairSwaps = function (a, b) {
      var before = 0, after = 0, side, xs, xe, ys, ye, px, py, S, I, O;
      for (side = 0; side < 2; side++) {
        if (side) { S = sDnS; I = sDnI; O = sDnO; } else { S = sUpS; I = sUpI; O = sUpO; }
        for (xs = S[a], xe = S[a + 1]; xs < xe; xs++) {
          px = pos[I[xs]];
          for (ys = S[b], ye = S[b + 1]; ys < ye; ys++) { py = pos[I[ys]]; if (px > py) before += O[xs] * O[ys]; else if (px < py) after += O[xs] * O[ys]; }
        }
      }
      return after < before - 1e-12 ? 1 : 0;
    };
    var swapPass = function (q) {
      var list = ord[q], n = list.length, improved = true, guard = 0, j, a, b, d, m, kk, s0 = q > 0 ? lver[q - 1] : -1, s2 = q + 1 < nL ? lver[q + 1] : -1, useMemo = n <= memoN;
      if (sig[3 * q] === s0 && sig[3 * q + 1] === lver[q] && sig[3 * q + 2] === s2) return;
      if (useMemo) { stamp++; for (j = 0; j < n; j++) loc[list[j]] = j; }
      while (improved && guard++ < 6) {
        improved = false;
        for (j = 0; j + 1 < n; j++) {
          a = list[j]; b = list[j + 1];
          if (useMemo) { kk = loc[a] * memoN + loc[b]; m = memo[kk]; if ((m >> 1) === stamp) d = m & 1; else { d = pairSwaps(a, b); memo[kk] = (stamp << 1) | d; } }
          else d = pairSwaps(a, b);
          if (d) { list[j] = b; list[j + 1] = a; pos[a] = j + 1; pos[b] = j; improved = true; }
        }
        if (improved) lver[q]++;
      }
      if (!improved) { sig[3 * q] = s0; sig[3 * q + 1] = lver[q]; sig[3 * q + 2] = s2; } else sig[3 * q] = -2;
    };
    /* Orderings already followed (same rule as seenCheck in wasm/order.c): the search from an ordering is always the same, so a run that reaches an ordering an earlier run followed for at least as many more rounds stops with the same final answer. */
    var seenOrd = [], seenRem = [], seenCap = Math.max(8, Math.min(256, Math.floor(1048576 / Math.max(1, nV))));
    var seenCheck = function (rem) {
      var s, i, k, j, o, n = 0, flat = null, same;
      for (s = 0; s < seenOrd.length; s++) {
        o = seenOrd[s]; same = true; n = 0;
        for (k = 0; k < ord.length && same; k++) for (j = 0; j < ord[k].length; j++) if (o[n++] !== ord[k][j]) { same = false; break; }
        if (same) { if (seenRem[s] >= rem) return true; seenRem[s] = rem; return false; }
      }
      if (seenOrd.length < seenCap) { flat = new Int32Array(nV); n = 0; for (k = 0; k < ord.length; k++) for (j = 0; j < ord[k].length; j++) flat[n++] = ord[k][j]; seenOrd.push(flat); seenRem.push(rem); }
      return false;
    };
    var run = function (rounds) {
      if (wk) return wk.run(rounds, nV <= 800 ? 1 : 0);
      var best = snap(), bestC = total(), cur;
      lver.fill(0); sig.fill(-2);   // the caller may have reordered: nothing is known to be settled
      seenCheck(rounds);
      for (var r = 0; r < rounds && bestC > 0; r++) {
        for (var q = 1; q < nL; q++) sweep(q, true);
        for (var q2 = nL - 2; q2 >= 0; q2--) sweep(q2, false);
        if (nV <= 800) for (var q3 = 0; q3 < nL; q3++) swapPass(q3);
        cur = total(); if (cur < bestC - 1e-12) { bestC = cur; best = snap(); }
        if (seenCheck(rounds - r - 1)) break;
      }
      restore(best); return bestC;
    };
    var bestC = keepOrder ? total() : run(nV > 1500 ? 2 : 8), bestSnap = snap();
    var restarts = keepOrder || opts.unweighted ? 0 : opts.restarts === undefined ? (nV <= 300 ? 8 : nV <= 800 ? 3 : 0) : opts.restarts, rnd = rng(opts.seed || 7), budget = opts.budgetMs || 400;
    for (i = 0; i < restarts && bestC > 0 && Date.now() - t0 < budget; i++) {
      restore(bestSnap);
      for (k = 0; k < nL; k++) {
        var lst = ord[k], ln = lst.length || 1;
        for (qi = 0; qi < lst.length; qi++) key2[lst[qi]] = (pos[lst[qi]] + 0.5) / ln + (rnd() + rnd() + rnd() - 1.5) * 0.35;
        sortSlots(lst, lst.length, tmp, key2, pos, false);
      }
      syncPos(); var c2 = run(6); if (c2 < bestC - 1e-12) { bestC = c2; bestSnap = snap(); }
    }
    restore(bestSnap); var crossingWeight = bestC;
    for (k = 0; k < nL; k++) { var fin = ord[k], outList = new Array(fin.length); for (qi = 0; qi < fin.length; qi++) { outList[qi] = fin[qi]; bPos[fin[qi]] = qi; } layers[k] = outList; }
    /* ---- one scale for everything, bar heights from flow, then vertical positions by relaxation ---- */
    var Hs = opts.height || Math.max(340, Math.min(760, 24 * layers.reduce(function (m, l) { return Math.max(m, l.length); }, 1))), ky = Infinity;
    layers.forEach(function (list) {
      var tot = 0, gaps = 0; list.forEach(function (v, j) { tot += bSize[v]; if (j) gaps += Dm[v] || Dm[list[j - 1]] ? padD : pad; });
      if (tot > 0) ky = Math.min(ky, Math.max(0.0001, Hs - gaps) / tot);
    });
    if (!isFinite(ky)) ky = 1;
    var minBar = 5;
    for (vi = 0; vi < nV; vi++) Hh[vi] = Dm[vi] ? Math.max(bSize[vi] * ky, 0.8) : Math.max(bSize[vi] * ky, minBar);
    var gapBetween = function (a, b) { return Dm[a] || Dm[b] ? padD : pad; };
    var pack = function (list) { var y = 0; list.forEach(function (v, j) { if (j) y += gapBetween(list[j - 1], v); Y[v] = y + Hh[v] / 2; y += Hh[v]; }); return y; };
    layers.forEach(function (list) { var h = pack(list); var shift = (Hs - h) / 2; list.forEach(function (v) { Y[v] += shift; }); });
    var layerIx = layers.map(function (list) { return Int32Array.from(list); });
    var settle = function (list) {   // keep the order, enforce gaps, then pull back inside the top
      var j, n = list.length, p, c;
      for (j = 1; j < n; j++) { p = list[j - 1]; c = list[j]; var lim = Y[p] + Hh[p] / 2 + (Dm[p] || Dm[c] ? padD : pad) + Hh[c] / 2; if (Y[c] < lim) Y[c] = lim; }
      if (n) { var up = Y[list[0]] - Hh[list[0]] / 2; if (up < 0) for (j = 0; j < n; j++) Y[list[j]] -= up; }
    };
    var pull = function (list, mode, a) {   // mode 0: look at the layer before, 1: the layer after, 2: both (up links first, as before)
      for (var j = 0, len = list.length; j < len; j++) {
        var i = list[j], s = 0, w = 0, q, e;
        if (mode !== 1) { for (q = upS[i], e = upS[i + 1]; q < e; q++) { s += Y[upI[q]] * upW[q]; w += upW[q]; } }
        if (mode !== 0) { for (q = dnS[i], e = dnS[i + 1]; q < e; q++) { s += Y[dnI[q]] * dnW[q]; w += dnW[q]; } }
        if (w > 0) Y[i] += (s / w - Y[i]) * a;
      }
      settle(list);
    };
    var alpha = new Float64Array(14);
    for (var it = 0; it < 14; it++) alpha[it] = Math.max(0.15, 0.95 * Math.pow(0.84, it));
    if (!(opts.wasm !== false && relaxWasm(nV, nL, layerIx, Y, Hh, Dm, upS, upI, upW, dnS, dnI, dnW, pad, padD, alpha))) {
      for (it = 0; it < 14; it++) {
        var a = alpha[it];
        for (k = 1; k < nL; k++) pull(layerIx[k], it % 3 === 2 ? 2 : 0, a);
        for (k = nL - 2; k >= 0; k--) pull(layerIx[k], it % 3 === 2 ? 2 : 1, a);
      }
    }
    var top = Infinity, bottom = -Infinity; for (vi = 0; vi < nV; vi++) { top = Math.min(top, Y[vi] - Hh[vi] / 2); bottom = Math.max(bottom, Y[vi] + Hh[vi] / 2); }
    var off = 30 - top; for (vi = 0; vi < nV; vi++) Y[vi] += off; bottom += off;
    /* ---- bars the person placed by hand: put them exactly there, keep the order by height, nudge only the others out of the way ---- */
    var fixY = opts.fixY || {}, anyPin = false;
    for (vi = 0; vi < nN; vi++) { var ub = Rb[vi].ukey; if (typeof fixY[ub] === 'number' && isFinite(fixY[ub])) { Y[vi] = Math.max(0, fixY[ub]) + Hh[vi] / 2; bPin[vi] = 1; Rb[vi].pinned = true; anyPin = true; } }
    if (anyPin) {
      layers.forEach(function (list) {
        list.sort(function (a, b) { return Y[a] - Y[b] || bPos[a] - bPos[b]; });
        for (var pass = 0; pass < 2; pass++) {
          for (var j = list.length - 2; j >= 0; j--) { var p1 = list[j + 1], p0 = list[j], lim = Y[p1] - Hh[p1] / 2 - gapBetween(p0, p1) - Hh[p0] / 2; if (!bPin[p0] && Y[p0] > lim) Y[p0] = lim; }
          for (j = 0; j < list.length; j++) { var c = list[j]; if (!bPin[c] && Y[c] < Hh[c] / 2) Y[c] = Hh[c] / 2; if (j) { var pv = list[j - 1], lo = Y[pv] + Hh[pv] / 2 + gapBetween(pv, c) + Hh[c] / 2; if (!bPin[c] && Y[c] < lo) Y[c] = lo; } }
        }
        list.forEach(function (v, j) { bPos[v] = j; });
      });
      bottom = -Infinity; for (vi = 0; vi < nV; vi++) bottom = Math.max(bottom, Y[vi] + Hh[vi] / 2);
    }
    /* ---- columns ---- */
    if (opts.autoGap && !opts.gapLayer) gapLayer = Math.max(90, Math.min(220, (1100 - nL * nodeW) / Math.max(1, nL - 1)));
    var colX = []; for (k = 0; k < nL; k++) colX.push(30 + k * (nodeW + gapLayer));
    for (vi = 0; vi < nV; vi++) { bW[vi] = Dm[vi] ? 0 : nodeW; bX[vi] = Dm[vi] ? colX[bLay[vi]] + nodeW / 2 : colX[bLay[vi]]; }
    /* ---- link ends: stack in the order of where they go ---- */
    var thick = function (f) { return Math.max(f * ky, 0.8); };
    var loopOutSum = new Map(), loopInSum = new Map();   // per item id: thickness of the loops leaving / entering it, added up in loop order
    loops.forEach(function (ei) {
      var e = L.edges[ei], t = thick(e.flow);
      loopOutSum.set(e.from, (loopOutSum.get(e.from) || 0) + t); loopInSum.set(e.to, (loopInSum.get(e.to) || 0) + t);
    });
    var segYo = new Float64Array(nSeg), segYi = new Float64Array(nSeg);   // where each piece starts on the bar it leaves / the bar it enters
    /* each bar's pieces, ordered by where the other end sits (then by link number): the same order Array sort gave, by insertion into one kept list
       (most bars have a few pieces; a bar with many uses the built-in sort) */
    var yAt = Y, segEiA = segEi, segUA = segU, segVA = segV, segWA = segW;
    var stk = new Int32Array(64), big = [];
    var stackOrder = function (S, SEG, v, END) {   // fills stk (or big) and returns the count; END: the bar at the other end of a piece
      var a = S[v], z = S[v + 1], n = z - a, e, j, x, yx, ex, y;
      if (n > 64) {
        big.length = 0; for (e = a; e < z; e++) big.push(SEG[e]);
        big.sort(function (p, q) { return yAt[END[p]] - yAt[END[q]] || segEiA[p] - segEiA[q]; });
        return -n;
      }
      for (e = 0; e < n; e++) {
        x = SEG[a + e]; yx = yAt[END[x]]; ex = segEiA[x]; j = e - 1;
        while (j >= 0) { y = stk[j]; var d = yAt[END[y]] - yx || segEiA[y] - ex; if (d > 0) { stk[j + 1] = y; j--; } else break; }
        stk[j + 1] = x;
      }
      return n;
    };
    var place = function (n, start, out) {   // writes where each piece starts, from start; returns where the next would
      var q, list = n < 0 ? big : stk, m = n < 0 ? -n : n;
      for (q = 0; q < m; q++) { var sg = list[q]; out[sg] = start; start += thick(segWA[sg]); }
      return start;
    };
    var sumThick = function (n) { var q, list = n < 0 ? big : stk, m = n < 0 ? -n : n, t = 0; for (q = 0; q < m; q++) t += thick(segWA[list[q]]); return t; };
    for (vi = 0; vi < nV; vi++) {
      var lo = Dm[vi] ? 0 : loopOutSum.get(Rb[vi].id) || 0, li = Dm[vi] ? 0 : loopInSum.get(Rb[vi].id) || 0, cnt;
      cnt = stackOrder(dnS, dnSeg, vi, segVA); var so = sumThick(cnt);
      var yo = Y[vi] - Hh[vi] / 2 + Math.max(0, (Hh[vi] - so - lo) / 2); yo = place(cnt, yo, segYo);
      cnt = stackOrder(upS, upSeg, vi, segUA); var si = sumThick(cnt);
      var yi = Y[vi] - Hh[vi] / 2 + Math.max(0, (Hh[vi] - si - li) / 2); yi = place(cnt, yi, segYi);
      bLOT[vi] = yo; bLIT[vi] = yi;
    }
    var bands = [];
    for (vi = 0; vi < nV; vi++) {
      for (qi = dnS[vi]; qi < dnS[vi + 1]; qi++) {
        var sg = dnSeg[qi], t = thick(segW[sg]), e = L.edges[segEi[sg]];
        var x0 = bX[vi] + bW[vi], x1 = bX[segV[sg]], y0 = segYo[sg], y1 = segYi[sg];
        bands.push({ edge: segEi[sg], from: e.from, to: e.to, x0: x0, y0a: y0, y0b: y0 + t, x1: x1, y1a: y1, y1b: y1 + t, xm: (x0 + x1) / 2 });
      }
    }
    /* ---- loops: bands that leave the right side, circle under the picture and come back in on the left ---- */
    var order = loops.slice().sort(function (p, q) {
      var a = L.edges[p], b = L.edges[q], sa = Math.abs(bLay[byId[a.to].ix] - bLay[byId[a.from].ix]), sb = Math.abs(bLay[byId[b.to].ix] - bLay[byId[b.from].ix]);
      return sa - sb || p - q;
    }), yLane = bottom + 22, loopOut = [];
    order.forEach(function (ei, lane) {
      var e = L.edges[ei], u = byId[e.from].ix, v = byId[e.to].ix, t = thick(e.flow), g = 16 + Math.min(40, lane * 4);
      var ys = bLOT[u] + t / 2; bLOT[u] += t; var ye = bLIT[v] + t / 2; bLIT[v] += t;
      var xs = bX[u] + bW[u], xe = bX[v], yl = yLane + t / 2; yLane += t + 7;
      var P = [[xs, ys], [xs + g, ys], [xs + g, yl], [xe - g, yl], [xe - g, ye], [xe, ye]];
      loopOut.push({ edge: ei, from: e.from, to: e.to, w: t, d: roundPath(P, Math.min(12, 3 + t)), pts: P, P: toBezier(P, Math.min(12, 3 + t)) });
    });
    var height = nV ? Math.max(bottom, yLane) + 30 : 0, width = colX[nL - 1] + nodeW + 30;
    var nodes = Rb.map(function (v, q) { return { id: v.id, label: v.node.label || v.id, x: bX[q], y: Y[q] - Hh[q] / 2, w: bW[q], h: Hh[q], layer: bLay[q], flow: bSize[q], inFlow: v.inAll, outFlow: v.outAll, pinned: !!v.pinned }; });
    var orderOut = { layers: layers.map(function (list) { return list.map(idOf); }), loops: loops.map(function (ei) { var e1 = L.edges[ei]; return nk(L.pos[e1.from]) + '>' + nk(L.pos[e1.to]); }) };
    return { nodes: nodes, bands: bands, loops: loopOut, width: width, height: height, simplified: simplified, note: simplified ? simplified + ' very long links are drawn as one straight-through band each, because routing all of them would make the picture too slow. The rest are laid out as usual.' : '', ky: ky, crossingWeight: crossingWeight, order: orderOut, cols: nL, ms: Date.now() - t0 };
  }

  /** A polyline with rounded corners, as an SVG path. */
  function roundPath(P, r) {
    var d = 'M' + f(P[0][0]) + ' ' + f(P[0][1]), i;
    for (i = 1; i + 1 < P.length; i++) {
      var a = P[i - 1], b = P[i], c = P[i + 1], l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]), rr = Math.min(r, l1 / 2, l2 / 2);
      var p1 = [b[0] - (b[0] - a[0]) / (l1 || 1) * rr, b[1] - (b[1] - a[1]) / (l1 || 1) * rr], p2 = [b[0] + (c[0] - b[0]) / (l2 || 1) * rr, b[1] + (c[1] - b[1]) / (l2 || 1) * rr];
      d += 'L' + f(p1[0]) + ' ' + f(p1[1]) + 'Q' + f(b[0]) + ' ' + f(b[1]) + ' ' + f(p2[0]) + ' ' + f(p2[1]);
    }
    var z = P[P.length - 1]; return d + 'L' + f(z[0]) + ' ' + f(z[1]);
  }
  /** The same rounded polyline as flat cubic Bezier controls [x0, y0, c1x, c1y, c2x, c2y, x, y, ...] (what the drawing lists use). */
  function toBezier(P, r) {
    var out = [P[0][0], P[0][1]], cur = P[0], i;
    var line = function (b) { out.push(cur[0] + (b[0] - cur[0]) / 3, cur[1] + (b[1] - cur[1]) / 3, cur[0] + 2 * (b[0] - cur[0]) / 3, cur[1] + 2 * (b[1] - cur[1]) / 3, b[0], b[1]); cur = b; };
    for (i = 1; i + 1 < P.length; i++) {
      var a = P[i - 1], b = P[i], c = P[i + 1], l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]), rr = Math.min(r, l1 / 2, l2 / 2);
      var p1 = [b[0] - (b[0] - a[0]) / (l1 || 1) * rr, b[1] - (b[1] - a[1]) / (l1 || 1) * rr], p2 = [b[0] + (c[0] - b[0]) / (l2 || 1) * rr, b[1] + (c[1] - b[1]) / (l2 || 1) * rr];
      line(p1);
      out.push(p1[0] + 2 / 3 * (b[0] - p1[0]), p1[1] + 2 / 3 * (b[1] - p1[1]), p2[0] + 2 / 3 * (b[0] - p2[0]), p2[1] + 2 / 3 * (b[1] - p2[1]), p2[0], p2[1]); cur = p2;
    }
    line(P[P.length - 1]);
    return out;
  }
  /** Writes a layout result into the drawing L (bar positions, size of the picture) and keeps the rest in L.sk. */
  function apply(L, r) {
    var byId = {}; r.nodes.forEach(function (n) { byId[n.id] = n; });
    var put = function (n, s) { n.x = s.x; n.y = s.y; n.w = s.w; n.h = s.h; n.cx = s.x + s.w / 2; n.cy = s.y + s.h / 2; n.layer = s.layer; };
    L.nodes.forEach(function (n) { var s = byId[n.id]; if (!s) return; put(n, s); var p = L.pos && L.pos[n.id]; if (p && p !== n) put(p, s); n.skIn = s.inFlow; n.skOut = s.outFlow; n.skPinned = s.pinned; });
    L.width = r.width; L.height = r.height; L.dir = 'LR';
    L.sk = { bands: r.bands, loops: r.loops, ky: r.ky, order: r.order, cols: r.cols, crossingWeight: r.crossingWeight, ms: r.ms };
    return L;
  }
  /** The look-and-place settings a person can change, cleaned up for layout(): { nodeW, gap, pad, height, fixY, justify }. */
  function options(sk) {
    sk = sk || {}; var num = function (v, d, lo, hi) { return typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
    return { nodeW: num(sk.nodeW, 14, 4, 80), gapLayer: sk.gap >= 60 ? num(sk.gap, 190, 60, 700) : undefined, autoGap: !(sk.gap >= 60), pad: num(sk.pad, 12, 2, 80), height: num(sk.height, 0, 0, 4000) || undefined, fixY: sk.fixY || {}, justifySinks: sk.justify !== false, fixedOrder: sk.order && sk.order.layers && sk.order.loops ? sk.order : undefined };
  }
  function f(n) {   // n rounded to 2 decimals as a number; the quick way is used unless n*100 is close to a half (where only toFixed is exact)
    var t = n * 100, r = Math.round(t), e = t - r;
    if (e < 0.49 && e > -0.49 && t < 1e12 && t > -1e12) return n === 0 ? 0 : r / 100;
    return +n.toFixed(2);
  }


  /* ---------------------------------------------------------------- plain input and plain output */
  var BAD_IDS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };
  /**
   * Plain links in, what layout() reads out. input: { links: [{ from, to, value }], nodes: [id or { id, label }] (optional) }.
   * value is how much flows along the link (more than 0). Items that only appear in links are added. Self-links and links with no
   * positive finite value are dropped; the result says how many ('ignored').
   */
  function fromLinks(input) {
    input = input || {};
    var nodes = [], pos = {}, edges = [], ignored = 0;
    function addNode(n) {
      var id = n !== null && typeof n === 'object' ? String(n.id) : String(n);
      if (BAD_IDS[id]) throw new Error('"' + id + '" cannot be used as an item name here.');
      if (!Object.prototype.hasOwnProperty.call(pos, id)) { var o = { id: id, label: n !== null && typeof n === 'object' && n.label !== undefined ? String(n.label) : id }; nodes.push(o); pos[id] = o; }
      return id;
    }
    (input.nodes || []).forEach(addNode);
    (input.links || []).forEach(function (l, i) {
      var v = Number(l && l.value);
      if (!l || !(v > 0) || !isFinite(v) || String(l.from) === String(l.to)) { ignored++; return; }
      edges.push({ from: addNode(l.from), to: addNode(l.to), flow: v, kind: '', link: i });
    });
    return { nodes: nodes, edges: edges, pos: pos, ignored: ignored };
  }

  /** The whole thing for plain input: the same result as layout(), with each band and loop also saying which of your links it is (link) and how much flows (value). */
  function layoutFlows(input, opts) {
    var L = fromLinks(input), R = layout(L, opts);
    R.bands.forEach(function (b) { b.link = L.edges[b.edge].link; b.value = L.edges[b.edge].flow; });
    R.loops.forEach(function (b) { b.link = L.edges[b.edge].link; b.value = L.edges[b.edge].flow; });
    R.ignored = L.ignored;
    return R;
  }

  var PALETTE = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#76b7b2', '#edc948', '#b07aa1', '#9c755f'];
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  /**
   * A finished picture as an SVG string. opts: { colors: [css colors], labels: true, fontSize: 12, textColor: '#222', bandOpacity: 0.45, title }.
   * Each band takes the color of the item it leaves; loops are drawn as thick lines under the picture.
   */
  /** The links of any plain input: a list of { from, to, value } (weight or count also name the amount; 1 when none), or { links } or { edges }. */
  function asLinks(d) { var l = Array.isArray(d) ? d : (d && (d.links || d.edges)) || []; return l.map(function (e) { var v = e.value !== undefined ? e.value : e.weight !== undefined ? e.weight : e.count !== undefined ? e.count : 1; return { from: e.from, to: e.to, value: +v }; }); }
  /** toSvg(data, opts) in one call (data: links as above), or toSvg(R, opts) for a layout result (it has nodes and bands). */
  function toSvg(R, opts) {
    opts = opts || {};
    if (!R || !R.bands || !R.nodes) R = layoutFlows({ nodes: R && !Array.isArray(R) && R.nodes ? R.nodes : undefined, links: asLinks(R) }, opts);
    var cols = opts.colors && opts.colors.length ? opts.colors : PALETTE, fs = opts.fontSize || 12, op = opts.bandOpacity === undefined ? 0.45 : opts.bandOpacity;
    var color = {}, bandTail = {}, lastLayer = 0, s, opS = '" fill-opacity="' + op + '"/>';
    R.nodes.forEach(function (n, i) { color[n.id] = cols[i % cols.length]; if (n.layer > lastLayer) lastLayer = n.layer; });
    R.nodes.forEach(function (n) { var c = esc(color[n.id]); bandTail[n.id] = 'Z" fill="' + c + opS; });   // the end of each band, ready for the item it leaves
    /* optional title block (title, subtitle, source), drawn like the plot and treemap ones: bold title and lighter subtitle above, small source below; the picture itself does not move inside its group */
    var tc = esc(opts.textColor || '#222'), pad = 14, head = 0, foot = 0, blk = '', y = pad;
    if (opts.title) { y += 20; blk += '<text x="' + pad + '" y="' + y + '" font-size="20" font-weight="700" fill="' + tc + '">' + esc(opts.title) + '</text>'; y += 6; }
    if (opts.subtitle) { y += 13; blk += '<text x="' + pad + '" y="' + y + '" font-size="13" fill="' + tc + '" fill-opacity="0.8">' + esc(opts.subtitle) + '</text>'; y += 6; }
    if (blk) head = f(y + pad * 0.6);
    if (opts.source) { foot = 24; blk += '<text x="' + pad + '" y="' + f(head + R.height + 15) + '" font-size="11" fill="' + tc + '" fill-opacity="0.72">' + esc(opts.source) + '</text>'; }
    var H = f(R.height + head + foot);
    s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f(R.width) + ' ' + H + '" width="' + f(R.width) + '" height="' + H + '" font-family="system-ui,sans-serif" font-size="' + fs + '" role="img"' + (opts.title ? ' aria-label="' + esc(opts.title) + '"' : '') + '>';
    if (opts.title) s += '<title>' + esc(opts.title) + '</title>';
    s += blk + (head ? '<g transform="translate(0 ' + head + ')">' : '');
    var bands = R.bands, i, b, x0, x1, xm, y0a, y0b, y1a, y1b;
    for (i = 0; i < bands.length; i++) {
      b = bands[i]; x0 = f(b.x0); x1 = f(b.x1); xm = f(b.xm); y0a = f(b.y0a); y0b = f(b.y0b); y1a = f(b.y1a); y1b = f(b.y1b);
      s += '<path d="M' + x0 + ' ' + y0a + 'C' + xm + ' ' + y0a + ' ' + xm + ' ' + y1a + ' ' + x1 + ' ' + y1a + 'L' + x1 + ' ' + y1b + 'C' + xm + ' ' + y1b + ' ' + xm + ' ' + y0b + ' ' + x0 + ' ' + y0b + (bandTail[b.from] || 'Z" fill="' + esc(color[b.from]) + opS);
    }
    R.loops.forEach(function (l) { s += '<path d="' + l.d + '" fill="none" stroke="' + esc(color[l.from]) + '" stroke-opacity="' + op + '" stroke-width="' + f(l.w) + '"/>'; });
    R.nodes.forEach(function (n) {
      s += '<rect x="' + f(n.x) + '" y="' + f(n.y) + '" width="' + f(n.w) + '" height="' + f(Math.max(n.h, 1)) + '" fill="' + esc(color[n.id]) + '"/>';
      if (opts.labels !== false) {
        var right = n.layer < lastLayer || lastLayer === 0;
        s += '<text x="' + f(right ? n.x + n.w + 5 : n.x - 5) + '" y="' + f(n.y + n.h / 2) + '" dy="0.35em" text-anchor="' + (right ? 'start' : 'end') + '" fill="' + esc(opts.textColor || '#222') + '">' + esc(n.label) + '</text>';
      }
    });
    return s + (head ? '</g>' : '') + '</svg>';
  }

  compileEarly();
  return { wasmAvailable: function () { return !!wasmInstance(); }, wasmReady: function () { return compileEarly(); }, wasmModule: function () { return WM || null; }, layoutFlows: layoutFlows, toSvg: toSvg, fromLinks: fromLinks, layout: layout, apply: apply, options: options, layering: layering, crossWeight: crossWeight, roundPath: roundPath, toBezier: toBezier };
}));
