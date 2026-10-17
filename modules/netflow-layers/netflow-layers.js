/*!
 * netflow-layers.js: lay out a graph in rows (a Sugiyama-style layered drawing): top to bottom or left to right, with long links as tags, story order, a column for the pages every route passes, and tall maps cut into columns. No dependencies.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.0 (API 1)
 *
 *   var R = NetflowLayers.layout({ nodes: [{ id: "start", w: 140, h: 44 }, { id: "a", w: 140, h: 44 }], edges: [{ from: "start", to: "a" }], root: "start" }, { dir: "TB" });
 *   svgElement.innerHTML = NetflowLayers.toSvg(R);          // or draw R.nodes and R.edges yourself (see README)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetflowLayers = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function mapPlaceLine(want, w, gaps, lo) {
    var n = want.length, off = new Array(n);
    off[0] = 0;
    for (var i = 1; i < n; i++) off[i] = off[i - 1] + gaps[i - 1];
    var blocks = [];
    for (i = 0; i < n; i++) {
      blocks.push([w[i] * (want[i] - off[i]), w[i], 1]);
      while (blocks.length > 1) {
        var b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
        if (a[0] / a[1] <= b[0] / b[1]) break;
        blocks.pop(); a[0] += b[0]; a[1] += b[1]; a[2] += b[2];
      }
    }
    var out = new Array(n), at = 0, floor = lo === undefined ? -Infinity : lo;
    for (var bi = 0; bi < blocks.length; bi++) {
      var bl = blocks[bi], val = Math.max(bl[0] / bl[1], floor);
      for (var kk = 0; kk < bl[2]; kk++, at++) out[at] = val + off[at];
      floor = -Infinity;
    }
    if (lo !== undefined && out[0] < lo) { var dd = lo - out[0]; for (var q = 0; q < n; q++) out[q] += dd; }
    for (var z = 1; z < n; z++) if (out[z] < out[z - 1] + gaps[z - 1]) out[z] = out[z - 1] + gaps[z - 1];
    return out;
  }
  /** Crossings between two neighboring layers (Fenwick tree, n log n). */
  function mapCrossPairs(segs) {
    segs.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var n = segs.length;
    if (n < 2) return 0;
    var lows = Array.from(new Set(segs.map(function (x) { return x[1]; }))).sort(function (x, y) { return x - y; });
    var idx = new Map(lows.map(function (v, i) { return [v, i + 1]; }));
    var tree = new Int32Array(lows.length + 2), c = 0, done = 0;
    for (var i = 0; i < n;) {
      var j = i;
      while (j < n && segs[j][0] === segs[i][0]) j++;
      for (var k = i; k < j; k++) {
        var q = 0;
        for (var t = idx.get(segs[k][1]); t > 0; t -= t & -t) q += tree[t];
        c += done - q;
      }
      for (k = i; k < j; k++) { for (var t2 = idx.get(segs[k][1]); t2 < tree.length; t2 += t2 & -t2) tree[t2]++; done++; }
      i = j;
    }
    return c;
  }

  /**
   * Rows in the order of the story. Links that close a loop (found depth-first from the start) are set aside, then each page goes one row
   * below the lowest page that leads to it. Pages the start cannot reach keep going below the rest, as in the shortest-route drawing.
   */
  function storyRows(G, layer, outs, opts, byNode) {
    var state = {}, backE = new Set(), order = [], reach = {};
    var dfs = function (r, isMain) {
      if (state[r]) return;
      state[r] = 1; if (isMain) reach[r] = true;
      var stack = [[r, 0]];
      while (stack.length) {
        var t = stack[stack.length - 1], list = outs[t[0]];
        if (t[1] < list.length) {
          var w = list[t[1]++];
          if (state[w] === 1) backE.add(t[0] + '>' + w);
          else if (!state[w]) { state[w] = 1; if (isMain) reach[w] = true; stack.push([w, 0]); }
        } else { state[t[0]] = 2; order.push(t[0]); stack.pop(); }
      }
    };
    if (opts.root && byNode[opts.root]) dfs(opts.root, true);
    G.nodes.forEach(function (n) { dfs(n.id, false); });
    order.reverse();
    var ins = {}, lay = {}, maxMain = -1;
    G.nodes.forEach(function (n) { ins[n.id] = []; });
    G.edges.forEach(function (e) { if (e.from !== e.to && !backE.has(e.from + '>' + e.to) && !reach[e.from] === !reach[e.to]) ins[e.to].push(e.from); });
    order.forEach(function (v) {
      var m = 0, l = ins[v];
      for (var i = 0; i < l.length; i++) if (lay[l[i]] + 1 > m) m = lay[l[i]] + 1;
      lay[v] = m;
      if (reach[v] && m > maxMain) maxMain = m;
    });
    G.nodes.forEach(function (n) { layer[n.id] = lay[n.id] + (reach[n.id] ? 0 : maxMain + 1); });
  }
  /**
   * A layered drawing of G (boxes with w and h set). opts: dir 'LR'|'TB', root (box id), spine (hold choke boxes on one line),
   * lane (box -> number), prev ({boxId: 0-1 order from last time}), gapLayer, gapNode, maxVertices.
   * Off unless asked for (the picture is then exactly the old one):
   *   rows: 'story'   rows follow the order of the story (a page sits below every page that leads to it; only real loops go back)
   *                   instead of the shortest route from the start,
   *   tagLen: N       links that span more than N rows are not drawn through the rows between; they get kind 'tag' (a tag at each end),
   *   better: true    crossing reduction with the middle value and neighbor swaps on big maps too,
   *   wrapRows: R     a tall map is cut every R rows into columns side by side (links between columns become tags).
   */
  function layered(G, opts) {
    opts = opts || {};
    var dir = opts.dir || 'LR', LR = dir === 'LR';
    var byNode = {}, outs = {}, ins = {};
    G.nodes.forEach(function (n) { byNode[n.id] = n; outs[n.id] = []; ins[n.id] = []; });
    G.edges.forEach(function (e) { outs[e.from].push(e.to); ins[e.to].push(e.from); });
    var layer = {}, maxL = 0;
    var bfsFrom = function (r, base, loose) {
      if (layer[r] !== undefined) return;
      layer[r] = base; byNode[r].loose = loose;
      var q = [r];
      for (var i = 0; i < q.length; i++) {
        var outl = outs[q[i]];
        for (var j = 0; j < outl.length; j++) {
          var w = outl[j];
          if (layer[w] === undefined) { layer[w] = layer[q[i]] + 1; byNode[w].loose = loose; q.push(w); }
        }
      }
      q.forEach(function (id) { if (layer[id] > maxL) maxL = layer[id]; });
    };
    if (opts.root && byNode[opts.root]) bfsFrom(opts.root, 0, false);
    G.nodes.forEach(function (n) {
      if (layer[n.id] === undefined && !ins[n.id].some(function (f) { return layer[f] === undefined && f !== n.id; })) bfsFrom(n.id, maxL + 1, true);
    });
    G.nodes.forEach(function (n) { if (layer[n.id] === undefined) bfsFrom(n.id, maxL + 1, true); });
    var tagLen = opts.tagLen > 1 ? opts.tagLen : 0, wrapR = opts.wrapRows > 1 && !opts.lane ? Math.floor(opts.wrapRows) : 0;
    /* a link is drawn as a pair of tags when it is very long, or (when a tall map is wrapped into columns) when it leaves its column */
    var tagged = function (la, lb) { return (tagLen && Math.abs(lb - la) > tagLen) || (wrapR && Math.floor(la / wrapR) !== Math.floor(lb / wrapR)); };
    if (opts.rows === 'story') { storyRows(G, layer, outs, opts, byNode); maxL = 0; for (var idr in layer) if (layer[idr] > maxL) maxL = layer[idr]; }
    var dummies = 0;
    G.edges.forEach(function (e) { var s = Math.abs(layer[e.to] - layer[e.from]); if (tagged(layer[e.from], layer[e.to])) return; if (s > 1) dummies += s - 1; });
    if (dummies + G.nodes.length > (opts.maxVertices || 90000)) {
      var err = new Error('too big for a layered drawing (' + (dummies + G.nodes.length) + ' stops); use the Network view or filter first');
      err.tooBig = true;
      throw err;
    }
    var L = [], vert = [];
    var addV = function (rec, k) { rec.layer = k; rec.idx = vert.length; vert.push(rec); (L[k] = L[k] || []).push(rec); return rec; };
    G.nodes.forEach(function (n) { n.v = addV({ id: n.id, node: n, dummy: false }, layer[n.id]); });
    var links = [];
    G.edges.forEach(function (e) {
      var a = byNode[e.from], b = byNode[e.to], la = layer[e.from], lb = layer[e.to];
      e.chain = [];
      if (e.from === e.to) { e.kind = 'self'; return; }
      if (la === lb) { e.kind = 'flat'; return; }
      if (tagged(la, lb)) { e.kind = 'tag'; e.tagFwd = lb > la; return; }
      e.kind = lb > la ? 'fwd' : 'back';
      var lo = Math.min(la, lb), hi = Math.max(la, lb), prevV = (lb > la ? a : b).v;
      for (var k = lo + 1; k < hi; k++) {
        var d = addV({ dummy: true, edge: e }, k);
        e.chain.push(d); links.push([prevV, d, prevV.dummy ? 8 : 2]); prevV = d;
      }
      links.push([prevV, (lb > la ? b : a).v, prevV.dummy ? 2 : 1]);
      if (e.kind === 'back') e.chain.reverse();
    });
    var up = vert.map(function () { return []; }), down = vert.map(function () { return []; });
    links.forEach(function (l) { down[l[0].idx].push([l[1], l[2]]); up[l[1].idx].push([l[0], l[2]]); });
    var nL = L.length;
    for (var k0 = 0; k0 < nL; k0++) L[k0] = L[k0] || [];
    /* depth-first rank without recursion */
    var dfsRank = {}, rank = 0, seenD = new Set();
    var visitFrom = function (r) {
      if (seenD.has(r)) return;
      var stack = [[r, 0]];
      seenD.add(r); dfsRank[r] = rank++;
      while (stack.length) {
        var top = stack[stack.length - 1], list = outs[top[0]];
        if (top[1] < list.length) {
          var w = list[top[1]++];
          if (!seenD.has(w)) { seenD.add(w); dfsRank[w] = rank++; stack.push([w, 0]); }
        } else stack.pop();
      }
    };
    if (opts.root && byNode[opts.root]) visitFrom(opts.root);
    G.nodes.forEach(function (n) { visitFrom(n.id); });
    var prev = opts.prev || {};
    var laneOfEdge = function (e) { return Math.min(opts.lane(byNode[e.from]), opts.lane(byNode[e.to])); };
    var laneOf = function (v) { return v.dummy ? (opts.lane ? laneOfEdge(v.edge) : 0) : opts.lane ? opts.lane(v.node) : 0; };
    var rn = Math.max(1, rank);
    L.forEach(function (list) {
      list.forEach(function (v) {
        v.key = v.dummy ? (dfsRank[v.edge.from] + dfsRank[v.edge.to]) / 2 / rn : (prev[v.id] !== undefined ? prev[v.id] : dfsRank[v.id] / rn);
      });
    });
    L.forEach(function (list) {
      list.sort(function (a, b) { return laneOf(a) - laneOf(b) || a.key - b.key; });
      list.forEach(function (v, i) { v.pos = i; });
    });
    var crossBetween = function (k) {
      var segs = [];
      L[k].forEach(function (u) { down[u.idx].forEach(function (d) { segs.push([u.pos, d[0].pos]); }); });
      return mapCrossPairs(segs);
    };
    var totalCross = function () { var c = 0; for (var k = 0; k + 1 < nL; k++) c += crossBetween(k); return c; };
    var snapshot = function () { return L.map(function (list) { return list.slice(); }); };
    var best = snapshot(), bestC = totalCross();
    var medianNow = false;
    var sweep = function (k, nb) {
      L[k].forEach(function (v) {
        var ns = nb[v.idx];
        if (medianNow && ns.length) { var ps = ns.map(function (o) { return o[0].pos; }).sort(function (a, b) { return a - b; }), mid = ps.length >> 1; v.bary = ps.length % 2 ? ps[mid] : (ps[mid - 1] + ps[mid]) / 2; }
        else v.bary = ns.length ? ns.reduce(function (s, o) { return s + o[0].pos; }, 0) / ns.length : v.pos;
      });
      L[k].sort(function (a, b) { return laneOf(a) - laneOf(b) || a.bary - b.bary || a.pos - b.pos; });
      L[k].forEach(function (v, i) { v.pos = i; });
    };
    var transpose = function (k) {
      var improved = true, guard = 0;
      while (improved && guard++ < 8) {
        improved = false;
        for (var i = 0; i + 1 < L[k].length; i++) {
          var a = L[k][i], b = L[k][i + 1];
          if (laneOf(a) !== laneOf(b)) continue;
          var before = 0, after = 0;
          var tally = function (ea, eb) {
            for (var p = 0; p < ea.length; p++) for (var q = 0; q < eb.length; q++) {
              var x = ea[p][0].pos, y = eb[q][0].pos;
              if (x > y) before++; else if (x < y) after++;
            }
          };
          if (k + 1 < nL) tally(down[a.idx], down[b.idx]);
          if (k > 0) tally(up[a.idx], up[b.idx]);
          if (after < before) { a.pos = i + 1; b.pos = i; L[k][i] = b; L[k][i + 1] = a; improved = true; }
        }
      }
    };
    var big = vert.length > 600, baseRounds = big ? 2 : 6;
    /* "better": after the usual rounds, six more (average and middle value in turn, neighbor swaps always); the best order seen is kept, so it is never worse */
    for (var it = 0; it < baseRounds + (opts.better ? 6 : 0) && bestC > 0; it++) {
      medianNow = it >= baseRounds && (it - baseRounds) % 2 === 1;
      for (var k1 = 1; k1 < nL; k1++) sweep(k1, up);
      for (var k2 = nL - 2; k2 >= 0; k2--) sweep(k2, down);
      if (!big || it >= baseRounds) for (var k3 = 0; k3 < nL; k3++) transpose(k3);
      var c = totalCross();
      if (c < bestC) { bestC = c; best = snapshot(); }
    }
    best.forEach(function (list, k) { L[k] = list; list.forEach(function (v, i) { v.pos = i; }); });
    var across = function (v) { return v.dummy ? 0 : LR ? v.node.h : v.node.w; };
    var gapN = opts.gapNode !== undefined ? opts.gapNode : LR ? 22 : 28, gapD = 12;
    var gapOf = function (a, b) { return (across(a) + across(b)) / 2 + (a.dummy || b.dummy ? gapD : gapN) + (opts.lane && laneOf(a) !== laneOf(b) ? 40 : 0); };
    L.forEach(function (list) {
      var c2 = 0;
      list.forEach(function (v, i) { if (i) c2 += gapOf(list[i - 1], v); v.c = c2; });
    });
    var isChoke = function (v) { return !v.dummy && opts.spine && v.node.choke; };
    var placeLayer = function (list, nb) {
      if (!list.length) return;
      var want = [], wt = [], gaps = [];
      list.forEach(function (v, i) {
        var ns = nb[v.idx], s = 0, sw = 0;
        ns.forEach(function (o) { s += o[0].c * o[1]; sw += o[1]; });
        if (isChoke(v)) { want.push(0); wt.push(1000); }
        else { want.push(sw ? s / sw : v.c); wt.push(sw ? sw + (v.dummy ? 2 : 0) : 0.2); }
        if (i) gaps.push(gapOf(list[i - 1], v));
      });
      var xs = mapPlaceLine(want, wt, gaps);
      list.forEach(function (v, i) { v.c = xs[i]; });
    };
    var both = vert.map(function (_, i) { return up[i].concat(down[i]); });
    for (var it2 = 0; it2 < (big ? 3 : 8); it2++) {
      for (var k4 = 1; k4 < nL; k4++) placeLayer(L[k4], it2 % 3 === 2 ? both : up);
      for (var k5 = nL - 2; k5 >= 0; k5--) placeLayer(L[k5], it2 % 3 === 2 ? both : down);
    }
    var lanes = [];
    if (opts.lane) {
      var ext = {};
      vert.forEach(function (v) {
        var ln = laneOf(v), lo = v.c - across(v) / 2, hi = v.c + across(v) / 2;
        ext[ln] = ext[ln] ? [Math.min(ext[ln][0], lo), Math.max(ext[ln][1], hi)] : [lo, hi];
      });
      var order = Object.keys(ext).map(Number).sort(function (a, b) { return a - b; }), shift = {}, at = 0;
      order.forEach(function (ln) {
        shift[ln] = at - ext[ln][0] + 28;
        lanes.push({ lane: ln, from: at, to: at + (ext[ln][1] - ext[ln][0]) + 56 });
        at += ext[ln][1] - ext[ln][0] + 56 + 16;
      });
      vert.forEach(function (v) { v.c += shift[laneOf(v)]; });
    }
    var gapL = opts.gapLayer !== undefined ? opts.gapLayer : LR ? 80 : 64, depthOf = [], at2 = 0;
    for (var k6 = 0; k6 < nL; k6++) {
      var mm = 0;
      L[k6].forEach(function (v) { if (!v.dummy) mm = Math.max(mm, LR ? v.node.w : v.node.h); });
      depthOf[k6] = [at2, mm || 20];
      at2 += (mm || 20) + gapL;
    }
    var minC = Infinity, band = function (v) { return wrapR ? Math.floor(v.layer / wrapR) : 0; }, nb = wrapR ? Math.floor((nL - 1) / wrapR) + 1 : 1;
    var bLo = [], bHi = [], bAt = [];
    vert.forEach(function (v) {
      var lo = v.c - across(v) / 2, hi = v.c + across(v) / 2, b = band(v);
      minC = Math.min(minC, lo);
      if (bLo[b] === undefined || lo < bLo[b]) bLo[b] = lo;
      if (bHi[b] === undefined || hi > bHi[b]) bHi[b] = hi;
    });
    if (!isFinite(minC)) minC = 0;
    var pad = 20, bX = [], bY = [], gapB = 90, run = 0;
    for (var bb = 0; bb < nb; bb++) {
      bY[bb] = wrapR ? depthOf[bb * wrapR][0] : 0;
      bX[bb] = wrapR && bLo[bb] !== undefined ? run - bLo[bb] + minC : 0;   /* shift so this column starts right after the one before */
      if (wrapR && bLo[bb] !== undefined) run += bHi[bb] - bLo[bb] + gapB;
    }
    vert.forEach(function (v) {
      var b = band(v), dm = depthOf[v.layer], along = dm[0] + dm[1] / 2 - bY[b], acrossC = v.c - minC + bX[b];
      if (v.dummy) { v.x = LR ? pad + along : pad + acrossC; v.y = LR ? pad + acrossC : pad + along; return; }
      var n = v.node;
      n.layer = v.layer;
      n.x = LR ? pad + along - n.w / 2 : pad + acrossC - n.w / 2;
      n.y = LR ? pad + acrossC - n.h / 2 : pad + along - n.h / 2;
    });
    lanes = lanes.map(function (l) { return { lane: l.lane, from: pad + l.from - minC, to: pad + l.to - minC }; });
    G.edges.forEach(function (e) { e.pts = e.chain.map(function (v) { return [v.x, v.y]; }); });
    var W = 0, H = 0;
    G.nodes.forEach(function (n) { W = Math.max(W, n.x + n.w); H = Math.max(H, n.y + n.h); });
    vert.forEach(function (v) { if (v.dummy) { W = Math.max(W, v.x); H = Math.max(H, v.y); } });
    if (lanes.length) { if (LR) H = Math.max(H, lanes[lanes.length - 1].to); else W = Math.max(W, lanes[lanes.length - 1].to); }
    var ord = {};
    L.forEach(function (list) { list.forEach(function (v) { if (!v.dummy) ord[v.id] = (v.pos + 0.5) / list.length; }); });
    var pos = {};
    G.nodes.forEach(function (n) { pos[n.id] = n; delete n.v; });
    G.edges.forEach(function (e) { delete e.chain; });
    var ruler = depthOf.map(function (dm, k) { var b = wrapR ? Math.floor(k / wrapR) : 0; return { at: pad + dm[0] + dm[1] / 2 - bY[b], edge: pad + (wrapR && bLo[b] !== undefined ? bLo[b] - minC + bX[b] : 0) }; });
    var kinds = { fwd: 0, back: 0, flat: 0, self: 0, tag: 0 };
    var goldTags = 0;
    G.edges.forEach(function (e) { kinds[e.kind]++; if (e.kind === 'tag' && !e.tagFwd) goldTags++; });
    return { kind: 'nodes', dir: dir, nodes: G.nodes, edges: G.edges, pos: pos, order: ord, lanes: lanes, width: W + pad + 60, height: H + pad + 30, crossings: bestC,
      rows: depthOf, ruler: ruler, info: { columns: nb, rows: nL, stops: vert.length - G.nodes.length, back: kinds.back, flat: kinds.flat, tags: kinds.tag, goldTags: goldTags, rowMode: opts.rows === 'story' ? 'story' : 'route' } };
  }


  /** Counts of what the drawing needed, used by layout() for the wrap rule. */
  function layout(graph, opts) {
    opts = opts || {};
    var nodes = graph.nodes.map(function (n) { var c = {}; for (var k in n) c[k] = n[k]; return c; });
    var edges = graph.edges.map(function (e) { var c = {}; for (var k in e) c[k] = e[k]; if (c.count === undefined) c.count = 1; return c; });
    var G = { nodes: nodes, edges: edges };
    var base = { dir: opts.dir === 'TB' ? 'TB' : 'LR', root: graph.root, prev: opts.prev, spine: !!opts.spine, rows: opts.rows === 'story' ? 'story' : undefined, tagLen: opts.tagLen > 1 ? opts.tagLen : 0, better: !!opts.better };
    if (opts.gapNode !== undefined) base.gapNode = opts.gapNode;
    if (opts.gapLayer !== undefined) base.gapLayer = opts.gapLayer;
    if (opts.maxVertices !== undefined) base.maxVertices = opts.maxVertices;
    var laned = opts.lanes && nodes.some(function (n) { return n.lane !== undefined; });
    if (laned) base.lane = function (n) { return Math.max(0, n.lane | 0); };
    var R = layered(G, base);
    if (opts.wrap && base.dir === 'TB' && !laned && R.height > 2.2 * R.width) {
      var K = Math.round(Math.sqrt(1.6 * R.height / R.width)), rows = Math.ceil(R.info.rows / Math.max(1, K));
      if (K >= 2 && rows >= 2 && rows < R.info.rows) { var o2 = {}; for (var k in base) o2[k] = base[k]; o2.wrapRows = rows; R = layered(G, o2); }
    }
    return R;
  }

  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var f1 = function (x) { return Math.round(x * 10) / 10; };
  /** A plain SVG picture of a layout() result: boxes, curved links through the stops, tags with name chips. Options: gold, line, box, boxLine, text, muted (colors). */
  function toSvg(R, o) {
    o = o || {};
    var gold = o.gold || '#c98a00', line = o.line || '#6b7a90', box = o.box || '#eaf0f8', boxLine = o.boxLine || '#44546a', ink = o.text || '#222', muted = o.muted || '#667', LR = R.dir !== 'TB', out = [];
    var name = function (n) { return esc(n.label !== undefined ? n.label : n.id); }, cx = function (n) { return n.x + n.w / 2; }, cy = function (n) { return n.y + n.h / 2; };
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + f1(R.width) + ' ' + f1(R.height) + '" width="' + Math.round(R.width) + '" height="' + Math.round(R.height) + '" font-family="system-ui,sans-serif">');
    var path = function (pts) { var d = 'M' + f1(pts[0][0]) + ',' + f1(pts[0][1]); for (var i = 1; i < pts.length; i++) { var a = pts[i - 1], b = pts[i]; if (LR) { var m = (b[0] - a[0]) / 2; d += ' C' + f1(a[0] + m) + ',' + f1(a[1]) + ' ' + f1(b[0] - m) + ',' + f1(b[1]) + ' ' + f1(b[0]) + ',' + f1(b[1]); } else { var q = (b[1] - a[1]) / 2; d += ' C' + f1(a[0]) + ',' + f1(a[1] + q) + ' ' + f1(b[0]) + ',' + f1(b[1] - q) + ' ' + f1(b[0]) + ',' + f1(b[1]); } } return d; };
    R.edges.forEach(function (e) {
      var a = R.pos[e.from], b = R.pos[e.to], back = e.kind === 'back' || e.kind === 'flat' || (e.kind === 'tag' && !e.tagFwd), col = back ? gold : line, dash = back ? ' stroke-dasharray="6 4"' : '';
      if (e.kind === 'self') return;
      if (e.kind === 'tag') {
        var up = e.tagFwd, s0 = LR ? [a.x + (up ? a.w : 0), cy(a)] : [cx(a), a.y + (up ? a.h : 0)], s1 = LR ? [b.x + (up ? 0 : b.w), cy(b)] : [cx(b), b.y + (up ? 0 : b.h)], d0 = (LR ? [up ? 1 : -1, 0] : [0, up ? 1 : -1]), d1 = [-d0[0], -d0[1]];
        var e0 = [s0[0] + d0[0] * 24, s0[1] + d0[1] * 24], e1 = [s1[0] + d1[0] * 24, s1[1] + d1[1] * 24], g = LR ? (up ? '→ ' : '← ') : (up ? '↓ ' : '↑ ');
        out.push('<path d="M' + f1(s0[0]) + ',' + f1(s0[1]) + ' L' + f1(e0[0]) + ',' + f1(e0[1]) + '" fill="none" stroke="' + col + '" stroke-width="2"/><path d="M' + f1(e1[0]) + ',' + f1(e1[1]) + ' L' + f1(s1[0]) + ',' + f1(s1[1]) + '" fill="none" stroke="' + col + '" stroke-width="2"/>');
        out.push('<text x="' + f1(e0[0] + (LR ? (up ? 4 : -4) : 0)) + '" y="' + f1(e0[1] + (LR ? 4 : (up ? 12 : -4))) + '" font-size="10.5" fill="' + (back ? gold : muted) + '" text-anchor="' + (LR ? (up ? 'start' : 'end') : 'middle') + '">' + g + name(b) + '</text>');
        out.push('<text x="' + f1(e1[0] + (LR ? (up ? -4 : 4) : 0)) + '" y="' + f1(e1[1] + (LR ? 4 : (up ? -4 : 12))) + '" font-size="10.5" fill="' + (back ? gold : muted) + '" text-anchor="' + (LR ? (up ? 'end' : 'start') : 'middle') + '">from ' + name(a) + '</text>');
        return;
      }
      var pts;
      if (e.kind === 'fwd') pts = [LR ? [a.x + a.w, cy(a)] : [cx(a), a.y + a.h]].concat(e.pts, [LR ? [b.x, cy(b)] : [cx(b), b.y]]);
      else if (e.kind === 'back') pts = [LR ? [a.x, cy(a)] : [cx(a), a.y]].concat(e.pts.slice().reverse(), [LR ? [b.x + b.w, cy(b)] : [cx(b), b.y + b.h]]);
      else { var x = Math.max(a.x + a.w, b.x + b.w) + 30; out.push('<path d="M' + f1(a.x + a.w) + ',' + f1(cy(a)) + ' C' + f1(x) + ',' + f1(cy(a)) + ' ' + f1(x) + ',' + f1(cy(b)) + ' ' + f1(b.x + b.w) + ',' + f1(cy(b)) + '" fill="none" stroke="' + col + '" stroke-width="2"' + dash + '/>'); return; }
      out.push('<path d="' + path(pts) + '" fill="none" stroke="' + col + '" stroke-width="2"' + dash + ' opacity="0.85"/>');
    });
    R.nodes.forEach(function (n) {
      out.push('<rect x="' + f1(n.x) + '" y="' + f1(n.y) + '" width="' + f1(n.w) + '" height="' + f1(n.h) + '" rx="8" fill="' + (n.choke ? '#fde7b0' : box) + '" stroke="' + boxLine + '" stroke-width="1.5"/>');
      out.push('<text x="' + f1(cx(n)) + '" y="' + f1(cy(n) + 5) + '" font-size="14" text-anchor="middle" fill="' + ink + '">' + name(n) + '</text>');
    });
    out.push('</svg>');
    return out.join('\n');
  }

  return { version: '1.0.0', layout: layout, toSvg: toSvg };
}));
