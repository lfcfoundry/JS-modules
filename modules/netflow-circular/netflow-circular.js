/* Copyright (c) 2026 LFC Foundry. MIT License. https://github.com/lfcfoundry/JS-modules */
/*
 * Version 1.2.0 (API 1)
 * netflow-circular.js: the circular views of Netflow Map (Chord, Bundles). layout(view, G, o) returns a plain layout; scene(L, o, NS) turns it
 * into drawing lists for netflow-scene. Built on netflow-hierarchy (its tree, values and drawing frame): load netflow-hierarchy.js first,
 * or keep it next to this folder in Node. No page, no DOM.
 */
var NetflowCircular = (function () {
  'use strict';
  var TAU = Math.PI * 2;
  /* netflow-hierarchy: a page global, the file in its own folder next to this one, or (a copy kept with others in one folder) the file next to this one */
  var HY = typeof NetflowHierarchy !== 'undefined' ? NetflowHierarchy : typeof require === 'function' ? (function () { try { return require('../netflow-hierarchy/netflow-hierarchy.js'); } catch (e) { return require('./netflow-hierarchy.js'); } })() : null;
  if (!HY) throw new Error('netflow-circular: load netflow-hierarchy.js first');
  var hierarchy = HY.hierarchy, linkValue = HY.linkValue, pushSector = HY.pushSector;
  var VIEWS = [
    ['chord', 'Chord', 'Who sends how much to whom, around a circle; each band is as wide as the amount it carries.'],
    ['bundles', 'Bundles', 'Items around a circle, links bent along the tree so links that go the same way run together.']
  ];
  var IS = {}; VIEWS.forEach(function (v) { IS[v[0]] = true; });
  var NESTED = { bundles: 1 };

  /* ---------------------------------------------------------------- chord */
  /**
   * Items (or groups, when there are many items) around a circle; each arc is as long as what it sends plus what it gets, the sending part first.
   * The order around the circle is searched for few crossing bands (d3-chord keeps the order it is given), and the bands leaving an arc are sorted by where they land so they do not cross each other at the arc.
   */
  function chord(G, o) {
    var n = G.nodes.length, idx = new Map(), i;
    for (i = 0; i < n; i++) idx.set(G.nodes[i].id, i);
    var byGroup = o.chordBy === 'groups' || (o.chordBy !== 'items' && n > 60);
    var ent = [], entOf = new Int32Array(n), gk = new Map();
    if (byGroup) { for (i = 0; i < n; i++) { var g = G.nodes[i].group || ''; if (!gk.has(g)) { gk.set(g, ent.length); ent.push({ label: g || '(no group)', group: g, items: [] }); } entOf[i] = gk.get(g); ent[entOf[i]].items.push(i); } }
    else for (i = 0; i < n; i++) { entOf[i] = i; ent.push({ label: G.nodes[i].label, group: G.nodes[i].group || '', items: [i], item: i }); }
    var K = ent.length, flows = new Map(), fl = [];
    G.edges.forEach(function (e, ei) {
      var a = idx.get(e.from), b = idx.get(e.to); if (a === undefined || b === undefined) return;
      var s = entOf[a], t = entOf[b], v = linkValue(e); if (!(v > 0)) return;
      var key = s * K + t, f = flows.get(key);
      if (!f) { f = { s: s, t: t, v: 0, edges: [] }; flows.set(key, f); fl.push(f); }
      f.v += v; f.edges.push(ei);
    });
    var out = new Float64Array(K), inn = new Float64Array(K), tot = 0;
    fl.forEach(function (f) { out[f.s] += f.v; inn[f.t] += f.v; tot += f.v * 2; });
    /* order around the circle: start by group, then move each one toward the middle of what it is joined to; keep the order with the fewest crossings */
    var ord = []; for (i = 0; i < K; i++) ord.push(i);
    ord.sort(function (a, b) { return ent[a].group < ent[b].group ? -1 : ent[a].group > ent[b].group ? 1 : a - b; });
    var adj = new Array(K); for (i = 0; i < K; i++) adj[i] = [];
    fl.forEach(function (f) { if (f.s !== f.t) { adj[f.s].push(f.t, f.v); adj[f.t].push(f.s, f.v); } });
    /* chords cross when their ends interleave around the circle; counted for up to 3,000 bands. Bands are bucketed by their first end, so each band only meets the bands that start inside it; stop counting once past the best so far */
    var mC = 0; fl.forEach(function (f) { if (f.s !== f.t) mC++; });
    var cS = new Int32Array(mC), cT = new Int32Array(mC), cV = new Float64Array(mC), cA = new Int32Array(mC), cB = new Int32Array(mC), cW = new Float64Array(mC), cHo = new Int32Array(mC), cStart = new Int32Array(K + 1), cFill = new Int32Array(K);
    mC = 0; fl.forEach(function (f) { if (f.s !== f.t) { cS[mC] = f.s; cT[mC] = f.t; cV[mC++] = f.v; } });
    /* the same sum, counted by weight: going from the heaviest band down, a band adds its own weight once for each heavier band it crosses
       (the lighter of two crossing bands sets their cost), and the heavier bands are counted in a 2D Fenwick table of (near end, far end) */
    var byW = null, bit = null;
    var crossingsW = function (pos, stop) {
      var K1 = K + 1, x, i2, j2, c = 0;
      if (!byW) { byW = new Int32Array(mC); for (x = 0; x < mC; x++) byW[x] = x; byW.sort(function (p, q) { return cV[q] - cV[p] || p - q; }); bit = new Int32Array(K1 * K1); } else bit.fill(0);
      var sum = function (a, b) { var t = 0; for (var i = a + 1; i > 0; i -= i & -i) for (var j = b + 1; j > 0; j -= j & -j) t += bit[i * K1 + j]; return t; };   /* heavier bands with near end <= a and far end <= b */
      var rect = function (a0, a1, b0, b1) { if (a0 > a1 || b0 > b1) return 0; return sum(a1, b1) - sum(a0 - 1, b1) - sum(a1, b0 - 1) + sum(a0 - 1, b0 - 1); };
      for (var h = 0; h < mC; h++) {
        x = byW[h]; var p = pos[cS[x]], q = pos[cT[x]], lo = p < q ? p : q, hi = p < q ? q : p;
        var n2 = rect(lo + 1, hi - 1, hi + 1, K - 1) + rect(0, lo - 1, lo + 1, hi - 1);
        if (n2) { c += cV[x] * n2; if (c >= stop) return c; }   /* the sum only grows: past the best so far is enough to know */
        for (i2 = lo + 1; i2 <= K; i2 += i2 & -i2) for (j2 = hi + 1; j2 <= K; j2 += j2 & -j2) bit[i2 * K1 + j2]++;
      }
      return c;
    };
    var crossings = function (pos, stop) {
      if (mC > 3000) return -1;
      if (K <= 1024 && mC > 120) return crossingsW(pos, stop);   /* small charts: the bucket walk below is quicker (fewer pairs than Fenwick steps) */
      var x, k, y;
      /* two counting sorts: by far end (far first), then stably by near end, so each near-end bucket lists its bands far end first */
      cStart.fill(0);
      for (x = 0; x < mC; x++) { var a = pos[cS[x]], b = pos[cT[x]]; cStart[K - 1 - (a < b ? b : a) + 1]++; }
      for (k = 0; k < K; k++) cStart[k + 1] += cStart[k];
      for (x = 0; x < mC; x++) { var a1 = pos[cS[x]], b1 = pos[cT[x]], hi = a1 < b1 ? b1 : a1, at = cStart[K - 1 - hi]++; cHo[at] = x; }
      cStart.fill(0);
      for (x = 0; x < mC; x++) { var a2 = pos[cS[x]], b2 = pos[cT[x]]; cStart[(a2 < b2 ? a2 : b2) + 1]++; }
      for (k = 0; k < K; k++) cStart[k + 1] += cStart[k];
      for (k = 0; k < K; k++) cFill[k] = cStart[k];
      for (var h = 0; h < mC; h++) { x = cHo[h]; var a3 = pos[cS[x]], b3 = pos[cT[x]], lo = a3 < b3 ? a3 : b3, at2 = cFill[lo]++; cA[at2] = lo; cB[at2] = a3 < b3 ? b3 : a3; cW[at2] = cV[x]; }
      /* a band crosses the bands that start strictly inside it and end past it: in each bucket those come first */
      var c = 0;
      for (x = 0; x < mC; x++) {
        var p0 = cA[x], p1 = cB[x], pw = cW[x];
        for (k = p0 + 1; k < p1; k++) for (y = cStart[k]; y < cStart[k + 1] && cB[y] > p1; y++) { var qw = cW[y]; c += pw < qw ? pw : qw; }
        if (c >= stop) return c;
      }
      return c;
    };
    var pos = new Int32Array(K), posOf = function (ordr) { for (var k = 0; k < K; k++) pos[ordr[k]] = k; return pos; };
    var bestOrd = ord.slice(), bestC = crossings(posOf(ord), Infinity);
    if (bestC > 0 && K > 3 && o.chordOrder === 'fewest') {   /* chordOrder 'fewest' searches the order; 'fast' (the default) keeps the group order, about d3-chord's work */
      /* places are whole steps round the circle, so their cosines and sines are read from a table made once */
      var cosT = new Float64Array(K), sinT = new Float64Array(K), key2 = new Float64Array(K), prev = new Int32Array(K), cur = ord.slice();
      for (i = 0; i < K; i++) { cosT[i] = Math.cos(i / K * TAU); sinT[i] = Math.sin(i / K * TAU); }
      var byKey = function (a, b) { return key2[a] - key2[b] || a - b; };
      for (var round = 0; round < 24; round++) {   /* pos holds the places of cur here */
        for (i = 0; i < K; i++) {
          var pi0 = pos[i], sx = cosT[pi0] * 0.5, sy = sinT[pi0] * 0.5, w = 0.5, a2 = adj[i];
          for (var j = 0; j < a2.length; j += 2) { var pj = pos[a2[j]], wj = a2[j + 1]; sx += cosT[pj] * wj; sy += sinT[pj] * wj; w += wj; }
          key2[i] = Math.atan2(sy / w, sx / w);
        }
        for (i = 0; i < K; i++) prev[i] = cur[i];
        cur.sort(byKey);
        var same = true; for (i = 0; i < K && same; i++) same = prev[i] === cur[i];
        if (same) break;   /* the same order again: every later round would repeat it */
        var c2 = crossings(posOf(cur), bestC);
        if (c2 < 0) { bestOrd = cur.slice(); break; }
        if (c2 < bestC) { bestC = c2; bestOrd = cur.slice(); }
      }
    }
    ord = bestOrd;
    var R = Math.max(220, Math.min(1400, 60 + K * 9)), th = Math.max(10, Math.min(26, R * 0.05)), pad = K > 1 ? Math.min(0.04, TAU * 0.25 / K) : 0;
    var span = TAU - pad * K, cx = R + 170, cy = R + 170;
    var arcs = new Array(K), a0 = -Math.PI / 2;
    ord.forEach(function (k) {
      var len = tot > 0 ? (out[k] + inn[k]) / tot * span : span / K;
      if (!(len > 0)) len = 0;
      arcs[k] = { k: k, a0: a0, a1: a0 + len, mid: a0 + len / 2, label: ent[k].label, group: ent[k].group, item: ent[k].item, out: out[k], inn: inn[k] };
      a0 += len + pad;
    });
    /* slots: what an arc sends, sorted by where it lands (going round from this arc), then what it gets, sorted by where it comes from */
    var rel = function (k, t) { var d = arcs[t].mid - arcs[k].mid; while (d <= 0) d += TAU; return d; };
    var sendList = new Array(K), getList = new Array(K);
    for (i = 0; i < K; i++) { sendList[i] = []; getList[i] = []; }
    fl.forEach(function (f) { sendList[f.s].push(f); getList[f.t].push(f); });
    var scale = tot > 0 ? span / tot : 0;
    for (i = 0; i < K; i++) {
      var A = arcs[i], at = A.a0;
      sendList[i].sort(function (p, q) { return rel(i, q.t) - rel(i, p.t); });
      sendList[i].forEach(function (f) { f.sa0 = at; at += f.v * scale; f.sa1 = at; });
      getList[i].sort(function (p, q) { return rel(i, q.s) - rel(i, p.s); });
      getList[i].forEach(function (f) { f.ta0 = at; at += f.v * scale; f.ta1 = at; });
    }
    var nodes = G.nodes.slice();
    nodes.forEach(function (nd, q) {
      var A = arcs[entOf[q]], r = R + th / 2, w = byGroup ? 6 : Math.max(8, th);
      nd.cx = cx + Math.cos(A.mid) * r; nd.cy = cy + Math.sin(A.mid) * r; nd.w = nd.h = w; nd.x = nd.cx - w / 2; nd.y = nd.cy - w / 2;
    });
    return { kind: 'chord', dir: 'none', nodes: nodes, edges: G.edges, chart: { type: 'chord', cx: cx, cy: cy, R: R, th: th, arcs: arcs, flows: fl, byGroup: byGroup, crossings: bestC, total: tot / 2 }, width: cx * 2, height: cy * 2 };
  }
  /**
   * Hierarchical edge bundling (Holten 2006): items on a circle in tree order, each link a smooth curve through the tree path between its ends,
   * pulled toward the straight line by 1 - beta. Leaves under one parent are put in the order of where their links go, which untangles the bundles.
   */
  function bundles(G, o) {
    var H = hierarchy(G, o), N = H.N, i;
    /* leaves (items) in tree order, siblings sorted by the mean place of what they link to (two passes) */
    var leafPos = new Float64Array(N), items = [];
    var walkOrder = function () {
      items = []; var st = [H.root];
      while (st.length) { var v = st.pop(); if (H.item[v] >= 0) items.push(v); var k = H.kids[v]; for (var j = k.length - 1; j >= 0; j--) st.push(k[j]); }
      items.forEach(function (v, q) { leafPos[v] = q; });
    };
    walkOrder();
    var nb = new Array(N); for (i = 0; i < N; i++) nb[i] = [];
    var atItem = new Int32Array(G.nodes.length).fill(-1); for (i = 0; i < N; i++) if (H.item[i] >= 0) atItem[H.item[i]] = i;
    for (i = 0; i < H.from.length; i++) { var a = atItem[H.from[i]], b = atItem[H.to[i]]; nb[a].push(b); nb[b].push(a); }
    for (var pass = 0; pass < 2; pass++) {
      var key = new Float64Array(N); for (i = 0; i < N; i++) { var s = 0, l = nb[i]; for (var j2 = 0; j2 < l.length; j2++) s += leafPos[l[j2]]; key[i] = l.length ? s / l.length : leafPos[i]; }
      for (i = 0; i < N; i++) if (H.kids[i].length > 1) H.kids[i].sort(function (p, q) { return key[p] - key[q] || p - q; });
      walkOrder();
    }
    var K = items.length, Rad = Math.max(220, Math.min(3000, K * 14 / TAU)), cx = Rad + 220;
    var X = new Float64Array(N), Y = new Float64Array(N), ang = new Float64Array(N), RX = new Float64Array(N), RY = new Float64Array(N), maxD = 0;
    for (i = 0; i < N; i++) if (H.depth[i] > maxD) maxD = H.depth[i];
    /* every item sits on the circle; each part of the tree also has a bend point inside, at the middle angle of what it holds, nearer the middle the higher up it is */
    var lo = new Float64Array(N).fill(Infinity), hi = new Float64Array(N).fill(-Infinity);
    items.forEach(function (v, q) { var an = q / Math.max(1, K) * TAU - Math.PI / 2; ang[v] = an; X[v] = cx + Math.cos(an) * Rad; Y[v] = cx + Math.sin(an) * Rad; for (var u = v; u >= 0; u = H.par[u]) { if (an < lo[u]) lo[u] = an; if (an > hi[u]) hi[u] = an; } });
    for (i = 0; i < N; i++) {
      var an2 = (lo[i] + hi[i]) / 2, r = (H.depth[i] + 1) / (maxD + 2) * Rad * 0.9;
      if (i === H.root || !isFinite(an2)) { an2 = 0; r = 0; }
      RX[i] = cx + Math.cos(an2) * r; RY[i] = cx + Math.sin(an2) * r;
    }
    var beta = typeof o.beta === 'number' ? o.beta : 0.85, paths = [];
    var lca = function (a, b) {
      var A = [], Bv = [], u;
      for (u = a; u >= 0; u = H.par[u]) A.push(u);
      for (u = b; u >= 0; u = H.par[u]) Bv.push(u);
      while (A.length > 1 && Bv.length > 1 && A[A.length - 2] === Bv[Bv.length - 2]) { A.pop(); Bv.pop(); }
      return A.concat(Bv.slice(0, -1).reverse());
    };
    var IX = H.idx;
    G.edges.forEach(function (e, ei) {
      var fa = IX ? IX.get(e.from) : G.eA[ei], fb = IX ? IX.get(e.to) : G.eB[ei]; if (fa === undefined || fb === undefined || fa === fb) return;
      var a0 = atItem[fa], b0 = atItem[fb], path = lca(a0, b0);
      /* the bend points: the parts each end sits in, up to where the two meet (an end that holds the other bends at its own point) */
      var mid = path.slice(1, -1), pl = path.length; if (pl > 1 && H.par[path[1]] === path[0]) mid.unshift(path[0]); if (pl > 1 && H.par[path[pl - 2]] === path[pl - 1]) mid.push(path[pl - 1]);
      var x0 = X[a0], y0 = Y[a0], xn = X[b0], yn = Y[b0], pts = [], seq = [-1].concat(mid, [-2]), n2 = seq.length;
      for (var q = 0; q < n2; q++) { var t = q / (n2 - 1), u2 = seq[q], px = u2 === -1 ? x0 : u2 === -2 ? xn : RX[u2], py = u2 === -1 ? y0 : u2 === -2 ? yn : RY[u2]; pts.push(beta * px + (1 - beta) * (x0 + t * (xn - x0)), beta * py + (1 - beta) * (y0 + t * (yn - y0))); }
      paths.push({ edge: ei, P: bsplineToBezier(pts), from: e.from, to: e.to });
    });
    var nodes = G.nodes.slice();
    nodes.forEach(function (nd, q) { var v = atItem[q]; nd.cx = X[v]; nd.cy = Y[v]; nd.w = nd.h = 7; nd.x = nd.cx - 3.5; nd.y = nd.cy - 3.5; nd.ang = ang[v]; });
    return { kind: 'bundles', dir: 'none', nodes: nodes, edges: G.edges, chart: { type: 'bundles', cx: cx, cy: cx, R: Rad, paths: paths, mode: H.mode, beta: beta }, width: cx * 2, height: cx * 2 };
  }  /** A uniform cubic B-spline through control points (ends clamped by tripling them) as a chain of Bezier pieces: [x0,y0, c1x,c1y, c2x,c2y, x1,y1, ...]. */
  function bsplineToBezier(p) {
    var n = p.length / 2;
    if (n === 2) return [p[0], p[1], p[0] + (p[2] - p[0]) / 3, p[1] + (p[3] - p[1]) / 3, p[0] + 2 * (p[2] - p[0]) / 3, p[1] + 2 * (p[3] - p[1]) / 3, p[2], p[3]];
    var c = [p[0], p[1], p[0], p[1]].concat(p, [p[p.length - 2], p[p.length - 1], p[p.length - 2], p[p.length - 1]]), m = c.length / 2, out = [];
    for (var i = 0; i + 3 < m; i++) {
      var x0 = c[i * 2], y0 = c[i * 2 + 1], x1 = c[i * 2 + 2], y1 = c[i * 2 + 3], x2 = c[i * 2 + 4], y2 = c[i * 2 + 5], x3 = c[i * 2 + 6], y3 = c[i * 2 + 7];
      var sx = (x0 + 4 * x1 + x2) / 6, sy = (y0 + 4 * y1 + y2) / 6, ex = (x1 + 4 * x2 + x3) / 6, ey = (y1 + 4 * y2 + y3) / 6;
      if (!out.length) out.push(sx, sy);
      out.push((2 * x1 + x2) / 3, (2 * y1 + y2) / 3, (x1 + 2 * x2) / 3, (y1 + 2 * y2) / 3, ex, ey);
    }
    return out;
  }
  function layout(view, G, o) {
    o = o || {};
    if (view === 'chord') return chord(G, o);
    return bundles(G, o);
  }

  /** A chord band from one arc slice to another, through the middle; quads along its length (each one seen whole from its middle). */
  function pushRibbon(S, cx, cy, r, sa0, sa1, ta0, ta1, fill, arrow) {
    var pt = function (a, rr) { return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; };
    var bez = function (p0, p3, u) { var m = 1 - u; return [m * m * m * p0[0] + 3 * m * u * (m * cx + u * cx) + u * u * u * p3[0], m * m * m * p0[1] + 3 * m * u * (m * cy + u * cy) + u * u * u * p3[1]]; };
    var tipR = arrow ? r - Math.min(14, r * 0.06) : r;
    var A0 = pt(sa0, r), A1 = pt(sa1, r), B0 = pt(ta1, tipR), B1 = pt(ta0, tipR);   /* side one: sa0 to ta1, side two: sa1 to ta0 */
    var n = 16, side1 = [], side2 = [], i;
    for (i = 0; i <= n; i++) { side1.push(bez(A0, B0, i / n)); side2.push(bez(A1, B1, i / n)); }
    for (i = 0; i < n; i++) {
      var p = [side1[i][0], side1[i][1], side1[i + 1][0], side1[i + 1][1], side2[i + 1][0], side2[i + 1][1], side2[i][0], side2[i][1]];
      S.polys.push({ pts: p, c: [(p[0] + p[2] + p[4] + p[6]) / 4, (p[1] + p[3] + p[5] + p[7]) / 4], fill: fill, stroke: [0, 0, 0, 0], piece: true });
    }
    /* the end at the target: a short arc slice, and an arrowhead into it when the band is directed */
    var endPts = [B0[0], B0[1]], m = Math.max(2, Math.ceil(Math.abs(ta1 - ta0) / 0.05));
    if (arrow) { var tm = pt((ta0 + ta1) / 2, r); endPts = [B0[0], B0[1], tm[0], tm[1], B1[0], B1[1]]; }
    else { endPts = []; for (i = 0; i <= m; i++) { var q = pt(ta1 + (ta0 - ta1) * i / m, r); endPts.push(q[0], q[1]); } }
    var ex = 0, ey = 0; for (i = 0; i < endPts.length; i += 2) { ex += endPts[i]; ey += endPts[i + 1]; }
    S.polys.push({ pts: endPts, c: [ex / (endPts.length / 2), ey / (endPts.length / 2)], fill: fill, stroke: [0, 0, 0, 0], piece: true });
    return { mid: bez(pt((sa0 + sa1) / 2, r), pt((ta0 + ta1) / 2, tipR), 0.5), a: pt((sa0 + sa1) / 2, r), b: pt((ta0 + ta1) / 2, tipR) };
  }
  /* the shapes of the two views, drawn inside netflow-hierarchy's drawing frame (it makes the items, names, colors and key, and the bounds) */
  var EXT = {
    draw: function (type, C) {
      var S = C.S, L = C.L, ch = C.ch, o = C.o, T = C.T, alpha = C.alpha, groupsHex = C.groupsHex, gcol = C.gcol, fillOf = C.fillOf, lab = C.lab, clip = C.clip, mono = C.mono, idxOfId = C.idxOfId, addCurve = C.addCurve, itemShow = C.itemShow, iscale = C.iscale;
      if (type === 'chord') {
      var R = ch.R, th = ch.th, cx = ch.cx, cy = ch.cy;
      ch.arcs.forEach(function (A) {
        if (!(A.a1 > A.a0)) return;
        var col = mono && !ch.byGroup ? groupsHex[A.k % groupsHex.length] : A.item !== undefined ? fillOf(A.item) : gcol(A.group);
        pushSector(S, cx, cy, R, R + th, A.a0, A.a1, col, [0, 0, 0, 0], ch.byGroup ? { group: A.group } : null);
        var mid = A.mid, lr = R + th + 8, right = Math.cos(mid) >= 0, rot = right ? mid : mid + Math.PI;
        if (itemShow) lab(cx + Math.cos(mid) * lr, cy + Math.sin(mid) * lr, clip(A.label, 28), 12 * iscale, T.fg, { align: right ? 'l' : 'r', rot: rot, node: A.item !== undefined ? A.item : -1, minK: 0.15, group: ch.byGroup ? A.group : undefined });
      });
      var directed = ch.flows.length <= 4000;
      ch.flows.forEach(function (f) {
        var src = ch.arcs[f.s], c = mono && !ch.byGroup ? groupsHex[src.k % groupsHex.length] : src.item !== undefined ? fillOf(src.item) : gcol(src.group), ends = pushRibbon(S, cx, cy, R, f.sa0, f.sa1, f.ta0, f.ta1, alpha(c, 0.62), directed && f.s !== f.t);
        /* a thin line along the band's middle, not drawn (fully clear), so the band can be pointed at like any link */
        var e0 = L.edges[f.edges[0]], fx = ends.a, tx = ends.b, w = Math.max(2, Math.abs(f.sa1 - f.sa0) * R);
        S.curves.push({ P: [fx[0], fx[1], (fx[0] + cx * 2) / 3, (fx[1] + cy * 2) / 3, (tx[0] + cx * 2) / 3, (tx[1] + cy * 2) / 3, tx[0], tx[1]], w: w, color: [0, 0, 0, 0], arrow: false, line: false, edge: f.edges[0], from: e0.from, to: e0.to, ghostPick: true });
      });
        return true;
      }
      if (type === 'bundles') {
      var bc = ch.cx;
      ch.paths.forEach(function (p) { var q = idxOfId.get(p.from); addCurve(p.P, 1.2, alpha(fillOf(q), 0.5), p.edge, p.from, p.to, false); });
      if (itemShow) L.nodes.forEach(function (nd, q) {
        var an = nd.ang, right = Math.cos(an) >= 0, lr = ch.R + 8;
        lab(bc + Math.cos(an) * lr, ch.cy + Math.sin(an) * lr, clip(nd.label, 26), 11 * iscale, T.fg, { align: right ? 'l' : 'r', rot: right ? an : an + Math.PI, node: q, minK: 0.2 });
      });
        return true;
      }
      return false;
    },
    note: function (L) {
      var ch = L.chart;
      if (ch.type === 'chord') return (ch.byGroup ? 'One arc per group' : 'One arc per item') + '; band width is the amount each link carries' + (ch.crossings > 0 ? '. Order chosen for fewer crossing bands.' : '.');
      if (ch.type === 'bundles') return 'Links follow the ' + (ch.mode === 'groups' ? 'groups' : 'tree of links from the start') + ', so links that go the same way run together.';
      return undefined;
    }
  };
  function scene(L, o, NS) { return HY.scene(L, o, NS, EXT); }
  /** One call to a picture: toSvg(data, options) returns SVG text (data: links as { from, to, value }, or { nodes, edges }); options.type is chord (the default) or bundles. */
  function toSvg(data, o) {
    o = o || {}; var NS = HY.sceneLib ? HY.sceneLib('netflow-circular') : NetflowScene, lo = {}; for (var k in o) lo[k] = o[k]; if (lo.chordBy === undefined) lo.chordBy = 'auto';
    return NS.toSvg(scene(layout(o.type || 'chord', HY.asGraph(data), lo), o, NS), o.title);
  }

  return { VIEWS: VIEWS, IS: IS, NESTED: NESTED, layout: layout, scene: scene, toSvg: toSvg, bsplineToBezier: bsplineToBezier };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NetflowCircular;
