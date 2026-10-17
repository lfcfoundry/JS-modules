/*!
 * river-layout.js: lay out a flow chart (Sankey diagram) from a plain list of links. No dependencies.
 * Every link is drawn, a band is as thick as its flow everywhere (one scale), long links go through the layers in between, the order
 * minimizes WEIGHTED crossings (big flows crossing big flows cost most), and links that run backwards are drawn as bands under the picture.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.0 (API 1)
 *
 *   var R = RiverLayout.layoutFlows({ links: [{ from: "Wages", to: "Rent", value: 40 }, { from: "Wages", to: "Food", value: 25 }] });
 *   svgElement.innerHTML = RiverLayout.toSvg(R);          // or draw R.nodes, R.bands and R.loops yourself (see README)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RiverLayout = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var EPS = 1e-9;
  function rng(seed) { var s = seed | 0; return function () { s = (s + 0x6d2b79f5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

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
    var remove = function (v) { alive[v] = 0; nAlive--; outE[v].forEach(function (q) { var w = edges[q].to; if (alive[w]) idg[w] -= edges[q].flow; }); inE[v].forEach(function (q) { var w = edges[q].from; if (alive[w]) od[w] -= edges[q].flow; }); };
    var aliveOut = function (v) { return outE[v].some(function (q) { return alive[edges[q].to]; }); }, aliveIn = function (v) { return inE[v].some(function (q) { return alive[edges[q].from]; }); };
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
   * layout(L, opts). L: the River drawing from the engine (L.nodes with .id .layer .label, L.edges with .from .to .flow .kind and, for long links, .pts).
   * opts: unweighted (order as the old picture does: every link counts the same, no restarts), justifySinks, height (picture height to aim for), nodeW (bar width), gapLayer, pad (space between bars), restarts, budgetMs, seed.
   * Returns { nodes: [{id, label, x, y, w, h, layer, flow}], bands: [{edge, from, to, x0, y0a, y0b, x1, y1a, y1b, xm}], loops: [{edge, from, to, d, w, pts}],
   *           width, height, ky (pixels per unit of flow), crossingWeight, ms }.
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
    var nL = lay.levels; for (k = 0; k < nL; k++) layers.push([]);
    var rankKey = {}; lay.order.forEach(function (q, r) { rankKey[L.nodes[q].id] = r; });
    L.nodes.forEach(function (n, q) {
      var v = { id: n.id, ukey: nk(n), node: n, layer: lay.layer[q], size: 0, up: [], down: [], key: rankKey[n.id], h: 0, y: 0, pos: 0, inAll: 0, outAll: 0 };
      byId[n.id] = v; V.push(v); layers[v.layer].push(v);
    });
    var fwd = [], loops = [];
    usable.forEach(function (ei, q) {
      var e = L.edges[ei], a = byId[e.from], b = byId[e.to];
      if (!lay.feedback.has(q) && b.layer > a.layer) {
        var prev = a;
        for (k = a.layer + 1; k < b.layer; k++) {
          var d = { id: null, edge: ei, pair: nk(a.node) + '>' + nk(b.node), layer: k, size: e.flow, up: [], down: [], key: (a.key + b.key) / 2, h: 0, y: 0, pos: 0, dummy: true };
          V.push(d); layers[k].push(d); prev.down.push({ o: d, w: e.flow, ei: ei }); d.up.push({ o: prev, w: e.flow, ei: ei }); prev = d;
        }
        prev.down.push({ o: b, w: e.flow, ei: ei }); b.up.push({ o: prev, w: e.flow, ei: ei }); a.outAll += e.flow; b.inAll += e.flow; fwd.push(ei);
      } else { loops.push(ei); a.outAll += e.flow; b.inAll += e.flow; }
    });
    V.forEach(function (v) { if (!v.dummy) v.size = Math.max(v.inAll, v.outAll, EPS); });
    /* ---- order inside each layer: weighted barycenter sweeps and weighted neighbor swaps, best of a few restarts ---- */
    var nbOf = function (list) { return list.length + 1; }, ow = opts.unweighted ? function () { return 1; } : function (w) { return w; };
    var setPos = function () { layers.forEach(function (list) { list.forEach(function (v, j) { v.pos = j; }); }); };
    var total = function () {
      var c = 0;
      for (var q = 0; q + 1 < nL; q++) { var ls = []; layers[q].forEach(function (v) { v.down.forEach(function (d) { ls.push([v.pos, d.o.pos, ow(d.w)]); }); }); c += crossWeight(ls, nbOf(layers[q + 1])); }
      return c;
    };
    layers.forEach(function (list) { list.sort(function (a, b) { return a.key - b.key; }); }); setPos();
    var idOf = function (v) { return v.dummy ? '~' + v.pair + ':' + v.layer : v.ukey; };
    var keepOrder = false;
    if (foLayer) {
      var where = {}; fo.layers.forEach(function (list, li) { list.forEach(function (id, j) { where[li + '|' + id] = j; }); });
      keepOrder = V.every(function (v) { return where[v.layer + '|' + idOf(v)] !== undefined; });
      if (keepOrder) { layers.forEach(function (list, li) { list.sort(function (a, b) { return where[li + '|' + idOf(a)] - where[li + '|' + idOf(b)]; }); }); setPos(); }
    }
    var snap = function () { return layers.map(function (l) { return l.slice(); }); };
    var restore = function (s) { s.forEach(function (l, q) { layers[q] = l.slice(); }); setPos(); };
    var sweep = function (q, nb) {
      var len = layers[q].length || 1;
      layers[q].forEach(function (v) { var s = 0, w = 0; nb[v.dummy ? 'dummy' : 'node'](v).forEach(function (d) { s += ow(d.w) * (d.o.pos + 0.5) / (layers[d.o.layer].length || 1); w += ow(d.w); }); v.bary = w ? s / w : (v.pos + 0.5) / len; });
      layers[q].sort(function (a, b) { return a.bary - b.bary || a.pos - b.pos; }); layers[q].forEach(function (v, j) { v.pos = j; });
    };
    var upNb = { dummy: function (v) { return v.up; }, node: function (v) { return v.up; } }, downNb = { dummy: function (v) { return v.down; }, node: function (v) { return v.down; } };
    var swapPass = function (q) {
      var improved = true, guard = 0;
      while (improved && guard++ < 6) {
        improved = false;
        for (var j = 0; j + 1 < layers[q].length; j++) {
          var a = layers[q][j], b = layers[q][j + 1], before = 0, after = 0;
          var tally = function (ea, eb) { ea.forEach(function (x) { eb.forEach(function (y) { if (x.o.pos > y.o.pos) before += ow(x.w) * ow(y.w); else if (x.o.pos < y.o.pos) after += ow(x.w) * ow(y.w); }); }); };
          tally(a.up, b.up); tally(a.down, b.down);
          if (after < before - 1e-12) { layers[q][j] = b; layers[q][j + 1] = a; a.pos = j + 1; b.pos = j; improved = true; }
        }
      }
    };
    var run = function (rounds) {
      var best = snap(), bestC = total(), cur;
      for (var r = 0; r < rounds && bestC > 0; r++) {
        for (var q = 1; q < nL; q++) sweep(q, upNb);
        for (var q2 = nL - 2; q2 >= 0; q2--) sweep(q2, downNb);
        if (V.length <= 800) for (var q3 = 0; q3 < nL; q3++) swapPass(q3);
        cur = total(); if (cur < bestC - 1e-12) { bestC = cur; best = snap(); }
      }
      restore(best); return bestC;
    };
    var bestC = keepOrder ? total() : run(V.length > 1500 ? 2 : 8), bestSnap = snap();
    var restarts = keepOrder || opts.unweighted ? 0 : opts.restarts === undefined ? (V.length <= 300 ? 8 : V.length <= 800 ? 3 : 0) : opts.restarts, rnd = rng(opts.seed || 7), budget = opts.budgetMs || 400;
    for (i = 0; i < restarts && bestC > 0 && Date.now() - t0 < budget; i++) {
      restore(bestSnap);
      layers.forEach(function (list) { var len = list.length || 1; list.forEach(function (v) { v.key2 = (v.pos + 0.5) / len + (rnd() + rnd() + rnd() - 1.5) * 0.35; }); list.sort(function (a, b) { return a.key2 - b.key2; }); });
      setPos(); var c2 = run(6); if (c2 < bestC - 1e-12) { bestC = c2; bestSnap = snap(); }
    }
    restore(bestSnap); var crossingWeight = bestC;
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
    var settle = function (list) {   // keep the order, enforce gaps, then pull back inside the top
      var j;
      for (j = 1; j < list.length; j++) { var lim = list[j - 1].y + list[j - 1].h / 2 + gapBetween(list[j - 1], list[j]) + list[j].h / 2; if (list[j].y < lim) list[j].y = lim; }
      if (list.length) { var up = list[0].y - list[0].h / 2; if (up < 0) for (j = 0; j < list.length; j++) list[j].y -= up; }
    };
    var pull = function (list, nb, a) {
      list.forEach(function (v) { var s = 0, w = 0; nb(v).forEach(function (d) { s += d.o.y * d.w; w += d.w; }); if (w > 0) v.y += (s / w - v.y) * a; });
      settle(list);
    };
    var nbUp = function (v) { return v.up; }, nbDown = function (v) { return v.down; }, nbBoth = function (v) { return v.up.concat(v.down); };
    for (var it = 0; it < 14; it++) {
      var a = Math.max(0.15, 0.95 * Math.pow(0.84, it));
      for (k = 1; k < nL; k++) pull(layers[k], it % 3 === 2 ? nbBoth : nbUp, a);
      for (k = nL - 2; k >= 0; k--) pull(layers[k], it % 3 === 2 ? nbBoth : nbDown, a);
    }
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
    var outY = {}, inY = {};    // key edge index + ':' + vertex id -> top of the band end
    V.forEach(function (v) {
      var outs = v.down.slice().sort(function (p, q) { return p.o.y - q.o.y || p.ei - q.ei; }), ins = v.up.slice().sort(function (p, q) { return p.o.y - q.o.y || p.ei - q.ei; });
      var so = 0, si = 0; outs.forEach(function (d) { so += thick(d.w); }); ins.forEach(function (d) { si += thick(d.w); });
      v.loopOutTop = 0; v.loopInTop = 0;
      var lo = 0, li = 0;
      loops.forEach(function (ei) { var e = L.edges[ei]; if (!v.dummy && e.from === v.id) lo += thick(e.flow); if (!v.dummy && e.to === v.id) li += thick(e.flow); });
      var yo = v.y - v.h / 2 + Math.max(0, (v.h - so - lo) / 2), yi = v.y - v.h / 2 + Math.max(0, (v.h - si - li) / 2);
      outs.forEach(function (d) { outY[d.ei + ':' + (v.dummy ? 'd' + v.layer : v.id)] = yo; yo += thick(d.w); });
      ins.forEach(function (d) { inY[d.ei + ':' + (v.dummy ? 'd' + v.layer : v.id)] = yi; yi += thick(d.w); });
      v.loopOutTop = yo; v.loopInTop = yi;
    });
    var bands = [];
    V.forEach(function (u) {
      u.down.forEach(function (d) {
        var v = d.o, t = thick(d.w), ukey = d.ei + ':' + (u.dummy ? 'd' + u.layer : u.id), vkey = d.ei + ':' + (v.dummy ? 'd' + v.layer : v.id), e = L.edges[d.ei];
        var x0 = u.x + u.w, x1 = v.x - (v.dummy ? 0 : 0), y0 = outY[ukey], y1 = inY[vkey];
        bands.push({ edge: d.ei, from: e.from, to: e.to, x0: x0, y0a: y0, y0b: y0 + t, x1: x1, y1a: y1, y1b: y1 + t, xm: (x0 + x1) / 2 });
      });
    });
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
    var height = Math.max(bottom, yLane) + 30, width = colX[nL - 1] + nodeW + 30;
    var nodes = V.filter(function (v) { return !v.dummy; }).map(function (v) { return { id: v.id, label: v.node.label || v.id, x: v.x, y: v.y - v.h / 2, w: v.w, h: v.h, layer: v.layer, flow: v.size, inFlow: v.inAll, outFlow: v.outAll, pinned: !!v.pinned }; });
    var orderOut = { layers: layers.map(function (list) { return list.map(idOf); }), loops: loops.map(function (ei) { var e1 = L.edges[ei]; return nk(L.pos[e1.from]) + '>' + nk(L.pos[e1.to]); }) };
    return { nodes: nodes, bands: bands, loops: loopOut, width: width, height: height, ky: ky, crossingWeight: crossingWeight, order: orderOut, cols: nL, ms: Date.now() - t0 };
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
  function f(n) { return +n.toFixed(2); }


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
    var color = {}, lastLayer = 0, s;
    R.nodes.forEach(function (n, i) { color[n.id] = cols[i % cols.length]; if (n.layer > lastLayer) lastLayer = n.layer; });
    s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f(R.width) + ' ' + f(R.height) + '" width="' + f(R.width) + '" height="' + f(R.height) + '" font-family="system-ui,sans-serif" font-size="' + fs + '" role="img"' + (opts.title ? ' aria-label="' + esc(opts.title) + '"' : '') + '>';
    if (opts.title) s += '<title>' + esc(opts.title) + '</title>';
    R.bands.forEach(function (b) {
      s += '<path d="M' + f(b.x0) + ' ' + f(b.y0a) + 'C' + f(b.xm) + ' ' + f(b.y0a) + ' ' + f(b.xm) + ' ' + f(b.y1a) + ' ' + f(b.x1) + ' ' + f(b.y1a) + 'L' + f(b.x1) + ' ' + f(b.y1b) + 'C' + f(b.xm) + ' ' + f(b.y1b) + ' ' + f(b.xm) + ' ' + f(b.y0b) + ' ' + f(b.x0) + ' ' + f(b.y0b) + 'Z" fill="' + esc(color[b.from]) + '" fill-opacity="' + op + '"/>';
    });
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

  return { layoutFlows: layoutFlows, toSvg: toSvg, fromLinks: fromLinks, layout: layout, layering: layering, crossWeight: crossWeight, roundPath: roundPath, toBezier: toBezier };
}));
