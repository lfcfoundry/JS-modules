/*!
 * netflow-sankey.js: lay out a flow chart (Sankey diagram) from a plain list of links. No dependencies.
 * Every link is drawn, a band is as thick as its flow everywhere (one scale), long links go through the layers in between, the order
 * minimizes WEIGHTED crossings (big flows crossing big flows cost most), and links that run backwards are drawn as bands under the picture.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 2.3.0 (API 2)
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
  var WASM_B64 = /*WASM:BEGIN*/'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'/*WASM:END*/, WM, WI;
  function wasmInstance() {
    if (WI !== undefined) return WI;
    WI = null;
    try {
      if (typeof WebAssembly !== 'object' || typeof WebAssembly.Module !== 'function') return WI;
      var bin, i;
      if (typeof atob === 'function') { var raw = atob(WASM_B64); bin = new Uint8Array(raw.length); for (i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i); }
      else bin = new Uint8Array(Buffer.from(WASM_B64, 'base64'));
      WM = new WebAssembly.Module(bin);
      WI = new WebAssembly.Instance(WM, {}).exports;
    } catch (e) { WI = null; }
    return WI;
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
    var need = Math.ceil((at + 64) / 65536) - X.memory.buffer.byteLength / 65536;
    try { if (need > 0) X.memory.grow(need); } catch (e) { return null; }
    var buf = X.memory.buffer, I32 = function (n, len) { return new Int32Array(buf, off[n], len); }, F64 = function (n, len) { return new Float64Array(buf, off[n], len); };
    var start = I32('start', nL + 2), r = { start: start, ord: I32('ord', nV), pos: I32('pos', nV), lenOf: F64('lenOf', nL), bary: F64('bary', nV), tmp: I32('tmp', nV) };
    I32('layerOf', nV).set(layerOf); I32('S1', nV + 1).set(S1); I32('I1', I1.length).set(I1); F64('O1', O1.length).set(O1); I32('S2', nV + 1).set(S2); I32('I2', I2.length).set(I2); F64('O2', O2.length).set(O2);
    start[0] = 0;
    for (k = 0; k < nL; k++) start[k + 1] = start[k] + lc[k];
    start[nL + 1] = start[nL];
    X.bind(nV, nL, off.layerOf, off.start, off.ord, off.pos, off.lenOf, off.bary, off.tmp, off.best, off.S1, off.I1, off.O1, off.S2, off.I2, off.O2, off.xBot, off.xW, off.xBit);
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
    var outE = [], inE = [], i, e;
    for (i = 0; i < n; i++) { outE.push([]); inE.push([]); }
    edges.forEach(function (ed, q) { if (ed.from !== ed.to) { outE[ed.from].push(q); inE[ed.to].push(q); } });
    /* order the items so that few links run backwards */
    var rank = new Int32Array(n), left = [], right = [], alive = new Uint8Array(n), nAlive = n, od = new Float64Array(n), idg = new Float64Array(n);
    for (i = 0; i < n; i++) { outE[i].forEach(function (q) { od[i] += edges[q].flow; }); inE[i].forEach(function (q) { idg[i] += edges[q].flow; }); }
    var oc = new Int32Array(n), ic = new Int32Array(n);   // how many links still lead out of / into items that are not placed yet
    for (i = 0; i < n; i++) { oc[i] = outE[i].length; ic[i] = inE[i].length; }
    var remove = function (v) { alive[v] = 0; nAlive--; outE[v].forEach(function (q) { var w = edges[q].to; ic[w]--; if (alive[w]) idg[w] -= edges[q].flow; }); inE[v].forEach(function (q) { var w = edges[q].from; oc[w]--; if (alive[w]) od[w] -= edges[q].flow; }); };
    var aliveOut = function (v) { return oc[v] > 0; }, aliveIn = function (v) { return ic[v] > 0; };
    for (i = 0; i < n; i++) alive[i] = 1;
    while (nAlive > 0) {
      var moved = true;
      while (moved) {
        moved = false;
        for (i = 0; i < n; i++) if (alive[i] && !aliveOut(i)) { right.push(i); remove(i); moved = true; }
        for (i = 0; i < n; i++) if (alive[i] && !aliveIn(i)) { left.push(i); remove(i); moved = true; }
      }
      if (nAlive > 0) { var bv = -1, bs = -Infinity; for (i = 0; i < n; i++) if (alive[i] && od[i] - idg[i] > bs) { bs = od[i] - idg[i]; bv = i; } left.push(bv); remove(bv); }
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
   * opts: unweighted (order as the old picture does: every link counts the same, no restarts), justifySinks, height (picture height to aim for), nodeW (bar width), gapLayer, pad (space between bars), restarts, budgetMs, seed.
   * Returns { nodes: [{id, label, x, y, w, h, layer, flow}], bands: [{edge, from, to, x0, y0a, y0b, x1, y1a, y1b, xm}], loops: [{edge, from, to, d, w, pts}],
   *           width, height, ky (pixels per unit of flow), crossingWeight, order, cols, ms }.
   * options(sk) cleans up a person's settings ({ nodeW, gap, pad, height, fixY, justify, order }) into the opts above; apply(L, r) writes a layout() result into the engine's drawing L (bar positions, picture size, L.sk).
   */
  function layout(L, opts) {
    opts = opts || {};
    var t0 = Date.now(), nodeW = opts.nodeW || 14, gapLayer = opts.gapLayer || 190, pad = opts.pad === undefined ? 12 : opts.pad, padD = 3;
    var byId = {}, V = [], layers = [], i, k, idx = {}, nk = function (n) { return n.nodeId !== undefined ? String(n.nodeId) : String(n.id); };   // nk: the name an item keeps across rebuilds
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
    L.nodes.forEach(function (n, q) {
      var v = { id: n.id, ukey: nk(n), node: n, layer: lay.layer[q], size: 0, key: rankKey[n.id], h: 0, y: 0, pos: 0, inAll: 0, outAll: 0, w: 0, x: 0, ix: V.length, pinned: false, loopOutTop: 0, loopInTop: 0 };
      byId[n.id] = v; V.push(v);
    });
    var fwd = [], loops = [];
    /* A long link gets one stand-in per layer it crosses so the layers can be ordered around it. Past DUMMY_CAP stand-ins in all, the lightest long links are drawn as one band from end to end instead (note in the result). */
    var noDummy = new Set(), dummyWant = 0, longLinks = [], simplified = 0;
    usable.forEach(function (ei, q) { var e = L.edges[ei], a = byId[e.from], b = byId[e.to]; if (!lay.feedback.has(q) && b.layer > a.layer + 1) { dummyWant += b.layer - a.layer - 1; longLinks.push(q); } });
    if (dummyWant > DUMMY_CAP) {
      var left = DUMMY_CAP;
      longLinks.sort(function (p, q) { return L.edges[usable[q]].flow - L.edges[usable[p]].flow || p - q; }).forEach(function (q) {
        var e = L.edges[usable[q]], need = byId[e.to].layer - byId[e.from].layer - 1;
        if (need <= left) left -= need; else { noDummy.add(q); simplified++; }
      });
    }
    var segU = [], segV = [], segW = [], segEi = [];   // one segment per band piece between two neighboring layers: from bar, to bar, flow, which link
    var link = function (u, v, w, ei) { segU.push(u.ix); segV.push(v.ix); segW.push(w); segEi.push(ei); };
    usable.forEach(function (ei, q) {
      var e = L.edges[ei], a = byId[e.from], b = byId[e.to];
      if (!lay.feedback.has(q) && b.layer > a.layer) {
        var prev = a;
        for (k = a.layer + 1; k < b.layer && !noDummy.has(q); k++) {
          var d = { id: null, edge: ei, pa: a, pb: b, layer: k, size: e.flow, key: (a.key + b.key) / 2, h: 0, y: 0, pos: 0, dummy: true, w: 0, x: 0, ix: V.length, pinned: false, loopOutTop: 0, loopInTop: 0 };
          V.push(d); link(prev, d, e.flow, ei); prev = d;
        }
        link(prev, b, e.flow, ei); a.outAll += e.flow; b.inAll += e.flow; fwd.push(ei);
      } else { loops.push(ei); a.outAll += e.flow; b.inAll += e.flow; }
    });
    V.forEach(function (v) { if (!v.dummy) v.size = Math.max(v.inAll, v.outAll, EPS); });
    /* ---- order inside each layer: weighted barycenter sweeps and weighted neighbor swaps, best of a few restarts ---- */
    var nV = V.length, vi, qi, nSeg = segU.length, nUp = nSeg, nDn = nSeg;
    var upS = new Int32Array(nV + 1), dnS = new Int32Array(nV + 1), upSeg = new Int32Array(nSeg), dnSeg = new Int32Array(nSeg), upI = new Int32Array(nSeg), upW = new Float64Array(nSeg), dnI = new Int32Array(nSeg), dnW = new Float64Array(nSeg), layerOf = new Int32Array(nV), cu, cd;
    for (qi = 0; qi < nSeg; qi++) { dnS[segU[qi] + 1]++; upS[segV[qi] + 1]++; }
    for (vi = 0; vi < nV; vi++) { dnS[vi + 1] += dnS[vi]; upS[vi + 1] += upS[vi]; layerOf[vi] = V[vi].layer; }
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
    for (vi = 0; vi < nV; vi++) { k = layerOf[vi]; ord[k][lc[k]++] = vi; key2[vi] = V[vi].key; }
    for (k = 0; k < nL; k++) sortSlots(ord[k], ord[k].length, tmp, key2, pos, false);   // first order: by the ranking the layering gave
    syncPos();
    var idOf = function (v) { return v.dummy ? '~' + nk(v.pa.node) + '>' + nk(v.pb.node) + ':' + v.layer : v.ukey; };
    var keepOrder = false;
    if (foLayer) {
      var where = {}; fo.layers.forEach(function (list, li) { list.forEach(function (id, j) { where[li + '|' + id] = j; }); });
      keepOrder = V.every(function (v) { return where[v.layer + '|' + idOf(v)] !== undefined; });
      if (keepOrder) {
        for (vi = 0; vi < nV; vi++) key2[vi] = where[V[vi].layer + '|' + idOf(V[vi])];
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
      for (j = 0; j < n; j++) pos[list[j]] = j;
    };
    var swapPass = function (q) {
      var list = ord[q], n = list.length, improved = true, guard = 0, j, a, b, before, after, side, xs, xe, ys, ye, px, py, S, I, O;
      while (improved && guard++ < 6) {
        improved = false;
        for (j = 0; j + 1 < n; j++) {
          a = list[j]; b = list[j + 1]; before = 0; after = 0;
          for (side = 0; side < 2; side++) {
            if (side) { S = sDnS; I = sDnI; O = sDnO; } else { S = sUpS; I = sUpI; O = sUpO; }
            for (xs = S[a], xe = S[a + 1]; xs < xe; xs++) {
              px = pos[I[xs]];
              for (ys = S[b], ye = S[b + 1]; ys < ye; ys++) { py = pos[I[ys]]; if (px > py) before += O[xs] * O[ys]; else if (px < py) after += O[xs] * O[ys]; }
            }
          }
          if (after < before - 1e-12) { list[j] = b; list[j + 1] = a; pos[a] = j + 1; pos[b] = j; improved = true; }
        }
      }
    };
    var run = function (rounds) {
      if (wk) return wk.run(rounds, V.length <= 800 ? 1 : 0);
      var best = snap(), bestC = total(), cur;
      for (var r = 0; r < rounds && bestC > 0; r++) {
        for (var q = 1; q < nL; q++) sweep(q, true);
        for (var q2 = nL - 2; q2 >= 0; q2--) sweep(q2, false);
        if (V.length <= 800) for (var q3 = 0; q3 < nL; q3++) swapPass(q3);
        cur = total(); if (cur < bestC - 1e-12) { bestC = cur; best = snap(); }
      }
      restore(best); return bestC;
    };
    var bestC = keepOrder ? total() : run(V.length > 1500 ? 2 : 8), bestSnap = snap();
    var restarts = keepOrder || opts.unweighted ? 0 : opts.restarts === undefined ? (V.length <= 300 ? 8 : V.length <= 800 ? 3 : 0) : opts.restarts, rnd = rng(opts.seed || 7), budget = opts.budgetMs || 400;
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
    for (k = 0; k < nL; k++) { var fin = ord[k], outList = new Array(fin.length); for (qi = 0; qi < fin.length; qi++) { outList[qi] = V[fin[qi]]; V[fin[qi]].pos = qi; } layers[k] = outList; }
    /* ---- one scale for everything, bar heights from flow, then vertical positions by relaxation ---- */
    var Hs = opts.height || Math.max(340, Math.min(760, 24 * layers.reduce(function (m, l) { return Math.max(m, l.length); }, 1))), ky = Infinity;
    layers.forEach(function (list) {
      var tot = 0, gaps = 0; list.forEach(function (v, j) { tot += v.size; if (j) gaps += v.dummy || list[j - 1].dummy ? padD : pad; });
      if (tot > 0) ky = Math.min(ky, Math.max(0.0001, Hs - gaps) / tot);
    });
    if (!isFinite(ky)) ky = 1;
    var minBar = 5;
    V.forEach(function (v) { v.h = v.dummy ? Math.max(v.size * ky, 0.8) : Math.max(v.size * ky, minBar); });
    var gapBetween = function (a, b) { return a.dummy || b.dummy ? padD : pad; };
    var pack = function (list) { var y = 0; list.forEach(function (v, j) { if (j) y += gapBetween(list[j - 1], v); v.y = y + v.h / 2; y += v.h; }); return y; };
    layers.forEach(function (list) { var h = pack(list); var shift = (Hs - h) / 2; list.forEach(function (v) { v.y += shift; }); });
    /* The relaxation below reads the same few numbers thousands of times, so they are copied into flat arrays for its duration (one slot per
       bar, the links of the order search are reused) and written back after. The arithmetic and its order are unchanged. */
    var Y = new Float64Array(nV), Hh = new Float64Array(nV), Dm = new Uint8Array(nV);
    for (vi = 0; vi < nV; vi++) { Y[vi] = V[vi].y; Hh[vi] = V[vi].h; Dm[vi] = V[vi].dummy ? 1 : 0; }
    var layerIx = layers.map(function (list) { var r = new Int32Array(list.length); list.forEach(function (v, j) { r[j] = v.ix; }); return r; });
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
    for (var it = 0; it < 14; it++) {
      var a = Math.max(0.15, 0.95 * Math.pow(0.84, it));
      for (k = 1; k < nL; k++) pull(layerIx[k], it % 3 === 2 ? 2 : 0, a);
      for (k = nL - 2; k >= 0; k--) pull(layerIx[k], it % 3 === 2 ? 2 : 1, a);
    }
    for (vi = 0; vi < nV; vi++) V[vi].y = Y[vi];
    var top = Infinity, bottom = -Infinity; V.forEach(function (v) { top = Math.min(top, v.y - v.h / 2); bottom = Math.max(bottom, v.y + v.h / 2); });
    var off = 30 - top; V.forEach(function (v) { v.y += off; }); bottom += off;
    /* ---- bars the person placed by hand: put them exactly there, keep the order by height, nudge only the others out of the way ---- */
    var fixY = opts.fixY || {}, anyPin = false;
    V.forEach(function (v) { v.pinned = false; if (!v.dummy && typeof fixY[v.ukey] === 'number' && isFinite(fixY[v.ukey])) { v.y = Math.max(0, fixY[v.ukey]) + v.h / 2; v.pinned = true; anyPin = true; } });
    if (anyPin) {
      layers.forEach(function (list) {
        list.sort(function (a, b) { return a.y - b.y || a.pos - b.pos; });
        for (var pass = 0; pass < 2; pass++) {
          for (var j = list.length - 2; j >= 0; j--) { var lim = list[j + 1].y - list[j + 1].h / 2 - gapBetween(list[j], list[j + 1]) - list[j].h / 2; if (!list[j].pinned && list[j].y > lim) list[j].y = lim; }
          for (j = 0; j < list.length; j++) { if (!list[j].pinned && list[j].y < list[j].h / 2) list[j].y = list[j].h / 2; if (j) { var lo = list[j - 1].y + list[j - 1].h / 2 + gapBetween(list[j - 1], list[j]) + list[j].h / 2; if (!list[j].pinned && list[j].y < lo) list[j].y = lo; } }
        }
        list.forEach(function (v, j) { v.pos = j; });
      });
      bottom = -Infinity; V.forEach(function (v) { bottom = Math.max(bottom, v.y + v.h / 2); });
    }
    /* ---- columns ---- */
    if (opts.autoGap && !opts.gapLayer) gapLayer = Math.max(90, Math.min(220, (1100 - nL * nodeW) / Math.max(1, nL - 1)));
    var colX = []; for (k = 0; k < nL; k++) colX.push(30 + k * (nodeW + gapLayer));
    V.forEach(function (v) { v.w = v.dummy ? 0 : nodeW; v.x = v.dummy ? colX[v.layer] + nodeW / 2 : colX[v.layer]; });
    /* ---- link ends: stack in the order of where they go ---- */
    var thick = function (f) { return Math.max(f * ky, 0.8); };
    var loopOutSum = new Map(), loopInSum = new Map();   // per item id: thickness of the loops leaving / entering it, added up in loop order
    loops.forEach(function (ei) {
      var e = L.edges[ei], t = thick(e.flow);
      loopOutSum.set(e.from, (loopOutSum.get(e.from) || 0) + t); loopInSum.set(e.to, (loopInSum.get(e.to) || 0) + t);
    });
    var segYo = new Float64Array(nSeg), segYi = new Float64Array(nSeg);   // where each piece starts on the bar it leaves / the bar it enters
    var byTarget = function (p, q) { return V[segV[p]].y - V[segV[q]].y || segEi[p] - segEi[q]; }, bySource = function (p, q) { return V[segU[p]].y - V[segU[q]].y || segEi[p] - segEi[q]; };
    var stackOrder = function (S, SEG, v, cmp) {   // this bar's pieces, ordered by where the other end sits (then by link number)
      var r = [], e;
      for (e = S[v]; e < S[v + 1]; e++) r.push(SEG[e]);
      return r.length > 1 ? r.sort(cmp) : r;
    };
    V.forEach(function (v) {
      var outs = stackOrder(dnS, dnSeg, v.ix, byTarget), ins = stackOrder(upS, upSeg, v.ix, bySource), q;
      var so = 0, si = 0; for (q = 0; q < outs.length; q++) so += thick(segW[outs[q]]); for (q = 0; q < ins.length; q++) si += thick(segW[ins[q]]);
      var lo = v.dummy ? 0 : loopOutSum.get(v.id) || 0, li = v.dummy ? 0 : loopInSum.get(v.id) || 0;
      var yo = v.y - v.h / 2 + Math.max(0, (v.h - so - lo) / 2), yi = v.y - v.h / 2 + Math.max(0, (v.h - si - li) / 2);
      for (q = 0; q < outs.length; q++) { segYo[outs[q]] = yo; yo += thick(segW[outs[q]]); }
      for (q = 0; q < ins.length; q++) { segYi[ins[q]] = yi; yi += thick(segW[ins[q]]); }
      v.loopOutTop = yo; v.loopInTop = yi;
    });
    var bands = [];
    for (vi = 0; vi < nV; vi++) {
      var u = V[vi];
      for (qi = dnS[vi]; qi < dnS[vi + 1]; qi++) {
        var sg = dnSeg[qi], v = V[segV[sg]], t = thick(segW[sg]), e = L.edges[segEi[sg]];
        var x0 = u.x + u.w, x1 = v.x - (v.dummy ? 0 : 0), y0 = segYo[sg], y1 = segYi[sg];
        bands.push({ edge: segEi[sg], from: e.from, to: e.to, x0: x0, y0a: y0, y0b: y0 + t, x1: x1, y1a: y1, y1b: y1 + t, xm: (x0 + x1) / 2 });
      }
    }
    /* ---- loops: bands that leave the right side, circle under the picture and come back in on the left ---- */
    var order = loops.slice().sort(function (p, q) {
      var a = L.edges[p], b = L.edges[q], sa = Math.abs(byId[a.to].layer - byId[a.from].layer), sb = Math.abs(byId[b.to].layer - byId[b.from].layer);
      return sa - sb || p - q;
    }), yLane = bottom + 22, loopOut = [];
    order.forEach(function (ei, lane) {
      var e = L.edges[ei], u = byId[e.from], v = byId[e.to], t = thick(e.flow), g = 16 + Math.min(40, lane * 4);
      var ys = u.loopOutTop + t / 2; u.loopOutTop += t; var ye = v.loopInTop + t / 2; v.loopInTop += t;
      var xs = u.x + u.w, xe = v.x, yl = yLane + t / 2; yLane += t + 7;
      var P = [[xs, ys], [xs + g, ys], [xs + g, yl], [xe - g, yl], [xe - g, ye], [xe, ye]];
      loopOut.push({ edge: ei, from: e.from, to: e.to, w: t, d: roundPath(P, Math.min(12, 3 + t)), pts: P, P: toBezier(P, Math.min(12, 3 + t)) });
    });
    var height = V.length ? Math.max(bottom, yLane) + 30 : 0, width = colX[nL - 1] + nodeW + 30;
    var nodes = V.filter(function (v) { return !v.dummy; }).map(function (v) { return { id: v.id, label: v.node.label || v.id, x: v.x, y: v.y - v.h / 2, w: v.w, h: v.h, layer: v.layer, flow: v.size, inFlow: v.inAll, outFlow: v.outAll, pinned: !!v.pinned }; });
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
  function toSvg(R, opts) {
    opts = opts || {};
    var cols = opts.colors && opts.colors.length ? opts.colors : PALETTE, fs = opts.fontSize || 12, op = opts.bandOpacity === undefined ? 0.45 : opts.bandOpacity;
    var color = {}, bandTail = {}, lastLayer = 0, s, opS = '" fill-opacity="' + op + '"/>';
    R.nodes.forEach(function (n, i) { color[n.id] = cols[i % cols.length]; if (n.layer > lastLayer) lastLayer = n.layer; });
    R.nodes.forEach(function (n) { var c = esc(color[n.id]); bandTail[n.id] = 'Z" fill="' + c + opS; });   // the end of each band, ready for the item it leaves
    s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f(R.width) + ' ' + f(R.height) + '" width="' + f(R.width) + '" height="' + f(R.height) + '" font-family="system-ui,sans-serif" font-size="' + fs + '" role="img"' + (opts.title ? ' aria-label="' + esc(opts.title) + '"' : '') + '>';
    if (opts.title) s += '<title>' + esc(opts.title) + '</title>';
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
    return s + '</svg>';
  }

  return { wasmAvailable: function () { return !!wasmInstance(); }, layoutFlows: layoutFlows, toSvg: toSvg, fromLinks: fromLinks, layout: layout, apply: apply, options: options, layering: layering, crossWeight: crossWeight, roundPath: roundPath, toBezier: toBezier };
}));
