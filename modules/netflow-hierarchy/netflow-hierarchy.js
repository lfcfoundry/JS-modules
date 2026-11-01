/* Copyright (c) 2026 LFC Foundry. MIT License. https://github.com/lfcfoundry/JS-modules */
/*
 * Version 1.3.0 (API 1)
 * netflow-hierarchy.js: the nested views of Netflow Map (Treemap, Sunburst, Icicle, Circle pack, Tree), and the tree and drawing
 * helpers the circular views (netflow-circular.js) build on.
 * layout(view, G, o) runs in the engine helper and returns a plain layout; scene(L, o, NS) turns it into drawing lists
 * on top of the scene module's own (items, names, colors and key come from it, so every look setting still applies).
 * No page, no DOM, no dependencies.
 */
var NetflowHierarchy = (function () {
  'use strict';
  var TAU = Math.PI * 2;
  var VIEWS = [
    ['treemap', 'Treemap', 'Nested boxes: each box is as big as what it holds.'],
    ['sunburst', 'Sunburst', 'Rings out from the middle: each ring is one step down, each slice as wide as what it holds.'],
    ['icicle', 'Icicle', 'Steps down from left to right; each bar as tall as what it holds.'],
    ['pack', 'Circle pack', 'Circles inside circles: each circle is as big as what it holds.'],
    ['tree', 'Tree', 'One parent for each item, drawn as a tidy tree.']
  ];
  var IS = {}; VIEWS.forEach(function (v) { IS[v[0]] = true; });
  var NESTED = { treemap: 1, sunburst: 1, icicle: 1, pack: 1, tree: 1 };

  /* ---------------------------------------------------------------- values and the tree */
  /** How much a link carries: the chosen width value, else simulated traffic, else its weight, else how many links it stands for. */
  function linkValue(e) {
    var v = e.widthV; if (v === v && v > 0) return v;
    if (e.flow > 1e-12) return e.flow;
    if (e.weight > 0) return e.weight;
    return e.count || 1;
  }
  function itemValue(n) { var v = n.sizeV; return v === v && v > 0 ? v : 1; }

  /**
   * One parent for each item. nest 'links': a walk out from the start (then from items nothing leads to, then from the best-linked item left);
   * 'groups': a box for each group; 'auto': links when the links already form a tree (or a forest), groups when there are 2 or more groups, else links.
   * Returns { N (items + made-up boxes), par Int32Array, kids [[...]], label [], item [] (index in G.nodes or -1), group [], root, depth Int32Array, mode, extra (links not in the tree) }.
   */
  var EMPTY = Object.freeze([]);   /* the child list of every leaf */
  var NOVAL = new Float64Array(0);   /* the tree drawing needs no totals; an empty list rather than null keeps one kind of value in the result */
  /* Scratch lists reused from one layout to the next. A new typed list costs 3 to 12 microseconds in Chromium even when small, and one layout used
     about 30 of them, which was a third of the time at 1,000 items. Only lists that do not leave the layout are reused, and only up to 20,000 items,
     so at most about 2 MB stays held. Each caller has its own slot (layouts never run inside each other). */
  var SCR_I = [], SCR_F = [], SCR_MAX = 20000;
  function tmpI(slot, n, v0) {
    if (n > SCR_MAX) { var a = new Int32Array(n); if (v0) a.fill(v0); return a; }
    var b = SCR_I[slot]; if (!b || b.length < n) b = SCR_I[slot] = new Int32Array(Math.max(n, 256));
    var w = b.subarray(0, n); w.fill(v0 || 0); return w;
  }
  function tmpF(slot, n) {
    if (n > SCR_MAX) return new Float64Array(n);
    var b = SCR_F[slot]; if (!b || b.length < n) b = SCR_F[slot] = new Float64Array(Math.max(n, 256));
    var w = b.subarray(0, n); w.fill(0); return w;
  }
  function hierarchy(G, o) {
    /* One pass into typed arrays: boxes are numbered in the order they are reached, so a parent always comes before its children and the
       drawing order is simply 0..N-1; a box with no children shares one empty list (most boxes are leaves, and a list each was a third of the garbage). */
    var n = G.nodes.length, idx = null, i, e, nodes = G.nodes;
    var E = G.edges, indeg = tmpI(0, n), from = new Int32Array(E.length), to = new Int32Array(E.length), m = 0, eA = G.eA, eB = G.eB;
    if (eA && eA.length === E.length) {   /* the app gives each link's item numbers: no lookup by name (that lookup was a third of the setup) */
      for (i = 0; i < E.length; i++) { var a0 = eA[i], b0 = eB[i]; if (a0 === b0) continue; from[m] = a0; to[m++] = b0; indeg[b0]++; }
    } else {
      idx = new Map(); for (i = 0; i < n; i++) idx.set(nodes[i].id, i);
      for (i = 0; i < E.length; i++) { e = E[i]; var a = idx.get(e.from), b = idx.get(e.to); if (a === undefined || b === undefined || a === b) continue; from[m] = a; to[m++] = b; indeg[b]++; }
    }
    from = from.subarray(0, m); to = to.subarray(0, m);
    var isForest = true;
    for (i = 0; i < n; i++) if (indeg[i] > 1) { isForest = false; break; }
    var groups = null, groupsOf = function () { if (!groups) { groups = new Map(); for (var q = 0; q < n; q++) { var g = nodes[q].group || ''; if (!groups.has(g)) groups.set(g, groups.size); } } return groups; };
    var mode = o.nest === 'groups' || o.nest === 'links' ? o.nest : isForest && m > 0 ? 'links' : (groupsOf().size >= 2 && groups.size <= Math.max(2, n / 2) ? 'groups' : 'links');
    var cap = mode === 'groups' ? n + 1 + groupsOf().size : n + 1, N = 0;
    var IA = new Int32Array(cap * 4), par = IA.subarray(0, cap), item = IA.subarray(cap, cap * 2), depth = IA.subarray(cap * 2, cap * 3), label = new Array(cap), group = new Array(cap), kids = new Array(cap);
    var add = function (p, lab, it, g) { var v = N++; par[v] = p; item[v] = it; label[v] = lab; group[v] = g; kids[v] = EMPTY; if (p >= 0) { depth[v] = depth[p] + 1; if (kids[p] === EMPTY) kids[p] = [v]; else kids[p].push(v); } else depth[v] = 0; return v; };
    var root = -1, extra = [];
    if (mode === 'groups') {
      root = add(-1, G.name || 'All', -1, '');
      var gbox = []; groups.forEach(function (k, g) { gbox[k] = add(root, g || '(no group)', -1, g); });
      for (i = 0; i < n; i++) { var gi = nodes[i].group || ''; add(gbox[groups.get(gi)], nodes[i].label, i, gi); }
      for (i = 0; i < m; i++) extra.push(i);
    } else {
      var off = tmpI(1, n + 1); for (i = 0; i < m; i++) off[from[i] + 1]++; for (i = 0; i < n; i++) off[i + 1] += off[i];
      var nb = tmpI(2, m), en = tmpI(3, m), fill = tmpI(9, n); fill.set(off.subarray(0, n));
      for (i = 0; i < m; i++) { var q = fill[from[i]]++; nb[q] = to[i]; en[q] = i; }
      var pOf = tmpI(4, n, -2), viaEdge = tmpI(5, n, -1), queue = tmpI(6, n), qh = 0, qt = 0;
      var walk = function (s) {
        pOf[s] = -1; queue[qt++] = s;
        while (qh < qt) { var u = queue[qh++]; for (var j = off[u]; j < off[u + 1]; j++) { var v = nb[j]; if (pOf[v] !== -2) continue; pOf[v] = u; viaEdge[v] = en[j]; queue[qt++] = v; } }
      };
      var st = -1; for (i = 0; i < n; i++) if (nodes[i].start) { st = i; break; }
      if (st >= 0) walk(st);
      for (i = 0; i < n; i++) if (pOf[i] === -2 && indeg[i] === 0) walk(i);
      while (qt < n) {   /* loops nothing leads into: start from the best-linked item left */
        var best = -1, bd = -1; for (i = 0; i < n; i++) if (pOf[i] === -2) { var d = off[i + 1] - off[i]; if (d > bd) { bd = d; best = i; } }
        walk(best);
      }
      var tops = 0; for (i = 0; i < n; i++) if (pOf[i] === -1) tops++;
      /* one real top item is the root itself; several hang under a made-up root */
      if (tops !== 1) root = add(-1, G.name || 'All', -1, '');
      var at = tmpI(7, n);
      for (var k = 0; k < qt; k++) { var u2 = queue[k], nd = nodes[u2]; at[u2] = add(pOf[u2] < 0 ? root : at[pOf[u2]], nd.label, u2, nd.group || ''); }
      if (tops === 1) root = 0;
      var inTree = tmpI(8, m); for (i = 0; i < n; i++) if (viaEdge[i] >= 0) inTree[viaEdge[i]] = 1;
      for (i = 0; i < m; i++) if (!inTree[i]) extra.push(i);
    }
    var order = IA.subarray(cap * 3, cap * 3 + N); for (i = 0; i < N; i++) order[i] = i;
    if (N < cap) { par = par.subarray(0, N); item = item.subarray(0, N); depth = depth.subarray(0, N); label.length = N; group.length = N; kids.length = N; }
    return { N: N, par: par, kids: kids, label: label, item: item, group: group, root: root, depth: depth, order: order, mode: mode, extra: extra, from: from, to: to, idx: idx };   /* idx: null when the app gave item numbers */
  }
  /** Sums: value[i] = own value (leaves, or every item when sized) + what its children hold. Children are sorted biggest first (o.sort !== false). */
  function sums(G, H, o) {
    var N = H.N, val = new Float64Array(N), sized = !!o.sized, i;
    for (i = H.order.length - 1; i >= 0; i--) {
      var v = H.order[i], k = H.kids[v], s = 0;
      for (var j = 0; j < k.length; j++) s += val[k[j]];
      var own = H.item[v] >= 0 && (sized || !k.length) ? itemValue(G.nodes[H.item[v]]) : 0;
      val[v] = s + own;
    }
    if (o.sort !== false) {   /* biggest first; two children (the most common case) are just swapped, longer lists share one comparison */
      var cmp = function (a, b) { return val[b] - val[a] || a - b; };
      for (i = 0; i < N; i++) { var kk = H.kids[i], L = kk.length; if (L < 2) continue; if (L === 2) { var k0 = kk[0], k1 = kk[1]; if (val[k1] > val[k0] || (val[k1] === val[k0] && k1 < k0)) { kk[0] = k1; kk[1] = k0; } } else kk.sort(cmp); }
    }
    H.own = function (v) { return H.item[v] >= 0 && (sized || !H.kids[v].length) ? itemValue(G.nodes[H.item[v]]) : 0; };
    return val;
  }



  /* ---------------------------------------------------------------- nested shapes */
  /** Squarified treemap (Bruls, Huizing and van Wijk): rows whose worst aspect ratio stops improving are closed. Writes x0,y0,x1,y1 for the children of v. */
  function squarify(H, val, v, x0, y0, x1, y1, R) {
    var k = H.kids[v], total = 0, i; if (!k.length) return;
    var own = H.own(v); for (i = 0; i < k.length; i++) total += val[k[i]];
    total += own; if (!(total > 0)) return;
    var W = x1 - x0, Ht = y1 - y0, area = W * Ht / total, at = 0;
    while (at < k.length) {
      var side = Math.min(x1 - x0, y1 - y0); if (side <= 0) side = 1e-9;
      var rowSum = 0, minV = Infinity, maxV = 0, worst = Infinity, end = at;
      for (; end < k.length; end++) {
        var vv = val[k[end]] * area, s2 = rowSum + vv, mn = Math.min(minV, vv), mx = Math.max(maxV, vv);
        var wr = Math.max(side * side * mx / (s2 * s2), s2 * s2 / (side * side * mn));
        if (end > at && wr > worst) break;
        rowSum = s2; minV = mn; maxV = mx; worst = wr;
      }
      var horiz = (x1 - x0) >= (y1 - y0), thick = rowSum / side, p = horiz ? y0 : x0;
      for (i = at; i < end; i++) {
        var c = k[i], len = val[c] * area / (thick || 1);
        if (horiz) { R[c * 4] = x0; R[c * 4 + 1] = p; R[c * 4 + 2] = x0 + thick; R[c * 4 + 3] = p + len; }
        else { R[c * 4] = p; R[c * 4 + 1] = y0; R[c * 4 + 2] = p + len; R[c * 4 + 3] = y0 + thick; }
        p += len;
      }
      if (horiz) x0 += thick; else y0 += thick;
      at = end;
    }
  }
  function treemap(G, o) {
    var H = hierarchy(G, o), val = sums(G, H, o), N = H.N, R = new Float64Array(N * 4);
    var total = val[H.root] || 1, side = Math.max(600, Math.min(4000, Math.sqrt(H.N) * 70)), W = side * 1.5, Ht = side;
    R[H.root * 4] = 0; R[H.root * 4 + 1] = 0; R[H.root * 4 + 2] = W; R[H.root * 4 + 3] = Ht;
    var head = function (v) { return H.kids[v].length && H.item[v] >= 0 && R[v * 4 + 3] - R[v * 4 + 1] > 60 && R[v * 4 + 2] - R[v * 4] > 40 ? 18 : 0; };   /* a real item that holds others keeps a strip for its name */
    for (var i = 0; i < H.order.length; i++) {
      var v = H.order[i]; if (!H.kids[v].length) continue;
      var p = H.depth[v] ? 3 : 0, x0 = R[v * 4] + p, y0 = R[v * 4 + 1] + p + head(v), x1 = R[v * 4 + 2] - p, y1 = R[v * 4 + 3] - p;
      if (x1 < x0) x1 = x0; if (y1 < y0) y1 = y0;
      squarify(H, val, v, x0, y0, x1, y1, R);
    }
    return nestedOut('treemap', G, H, val, { R: R, W: W, H: Ht, total: total });
  }
  /** Partition: depth across, value along (icicle), or the same in rings (sunburst). */
  function partition(G, o, radial) {
    var H = hierarchy(G, o), val = sums(G, H, o), N = H.N, R = new Float64Array(N * 4), maxD = 0, i, sized = !!o.sized;
    for (i = 0; i < N; i++) if (H.depth[i] > maxD) maxD = H.depth[i];
    var skipRoot = H.item[H.root] < 0 ? 1 : 0, levels = maxD + 1 - skipRoot;
    R[H.root * 4 + 1] = 0; R[H.root * 4 + 3] = 1;
    for (i = 0; i < H.order.length; i++) {
      var v = H.order[i], k = H.kids[v], a = R[v * 4 + 1], span = R[v * 4 + 3] - a, t = val[v] || 1;
      var it0 = H.item[v], at = a + (it0 >= 0 && (sized || !k.length) ? span * itemValue(G.nodes[it0]) / t : 0);   /* an item that holds something itself keeps that much of its own slice, first */
      for (var j = 0; j < k.length; j++) { var c = k[j], w = span * val[c] / t; R[c * 4 + 1] = at; R[c * 4 + 3] = at + w; at += w; }
    }
    for (i = 0; i < N; i++) { var d = H.depth[i] - skipRoot; R[i * 4] = d; R[i * 4 + 2] = d + 1; }
    if (radial) {
      var Rad = Math.max(260, Math.min(2200, 120 + Math.sqrt(N) * 26)), ring = Rad / Math.max(1, levels + 0.4);
      return nestedOut('sunburst', G, H, val, { R: R, W: Rad * 2 + 340, H: Rad * 2 + 340, cx: Rad + 170, cy: Rad + 170, ring: ring, hole: ring * 0.4, skipRoot: skipRoot, levels: levels });
    }
    var colW = 200, Hh = Math.max(500, Math.min(30000, N * 22));
    return nestedOut('icicle', G, H, val, { R: R, W: Math.max(1, levels) * colW, H: Hh, colW: colW, skipRoot: skipRoot, levels: levels });
  }
  /* circle packing: the front-chain method (Wang, Wang, Dai and Wang, "Visualization of large hierarchical data by circle packing", 2006) with the smallest enclosing circle by Welzl's move-to-front */
  function place(b, a, c) {
    var dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
    if (d2) {
      var a2 = (a.r + c.r) * (a.r + c.r), b2 = (b.r + c.r) * (b.r + c.r);
      if (a2 > b2) { var x = (d2 + b2 - a2) / (2 * d2), y = Math.sqrt(Math.max(0, b2 / d2 - x * x)); c.x = b.x - x * dx - y * dy; c.y = b.y - x * dy + y * dx; }
      else { var x2 = (d2 + a2 - b2) / (2 * d2), y2 = Math.sqrt(Math.max(0, a2 / d2 - x2 * x2)); c.x = a.x + x2 * dx - y2 * dy; c.y = a.y + x2 * dy + y2 * dx; }
    } else { c.x = a.x + c.r; c.y = a.y; }
  }
  function overlaps(a, b) { var dr = a.r + b.r - 1e-6, dx = b.x - a.x, dy = b.y - a.y; return dr > 0 && dr * dr > dx * dx + dy * dy; }
  function packSiblings(cs) {
    var n = cs.length; if (!n) return 0;
    var a = cs[0]; a.x = 0; a.y = 0; if (n === 1) return a.r;
    var b = cs[1]; a.x = -b.r; b.x = a.r; b.y = 0; if (n === 2) return a.r + b.r;
    var c = cs[2]; place(b, a, c);
    /* the front chain as a ring of links */
    var A = { c: a }, B = { c: b }, C = { c: c }; A.next = C.prev = B; B.next = A.prev = C; C.next = B.prev = A;
    var score = function (nd) { var p = nd.c, q = nd.next.c, ab = p.r + q.r, dx = (p.x * q.r + q.x * p.r) / ab, dy = (p.y * q.r + q.y * p.r) / ab; return dx * dx + dy * dy; };
    pack: for (var i = 3; i < n; i++) {
      c = cs[i]; place(A.c, B.c, c); C = { c: c };
      var j = B.next, k = A.prev, sj = B.c.r, sk = A.c.r;
      do {
        if (sj <= sk) { if (overlaps(j.c, C.c)) { B = j; A.next = B; B.prev = A; --i; continue pack; } sj += j.c.r; j = j.next; }
        else { if (overlaps(k.c, C.c)) { A = k; A.next = B; B.prev = A; --i; continue pack; } sk += k.c.r; k = k.prev; }
      } while (j !== k.next);
      C.prev = A; C.next = B; A.next = B.prev = B = C;
      var aa = score(A), bb; while ((C = C.next) !== B) { if ((bb = score(C)) < aa) { A = C; aa = bb; } } B = A.next;
    }
    var e = enclose(cs);
    for (i = 0; i < n; i++) { cs[i].x -= e.x; cs[i].y -= e.y; }
    return e.r;
  }
  function enclose(cs) {
    var L = cs.slice(), i, n = L.length, B = [], e = null, seed = 1;
    for (i = n - 1; i > 0; i--) { seed = (seed * 1664525 + 1013904223) >>> 0; var j = seed % (i + 1), t = L[i]; L[i] = L[j]; L[j] = t; }   /* shuffled with a fixed seed: the same picture every time */
    var inside = function (a, b) { var dr = a.r - b.r + Math.max(a.r, b.r, 1) * 1e-9, dx = b.x - a.x, dy = b.y - a.y; return dr >= 0 && dr * dr >= dx * dx + dy * dy; };
    var c1 = function (a) { return { x: a.x, y: a.y, r: a.r }; };
    var c2 = function (a, b) { var x1 = a.x, y1 = a.y, r1 = a.r, x21 = b.x - x1, y21 = b.y - y1, r21 = b.r - r1, l = Math.sqrt(x21 * x21 + y21 * y21) || 1e-12; return { x: (x1 + b.x + x21 / l * r21) / 2, y: (y1 + b.y + y21 / l * r21) / 2, r: (l + r1 + b.r) / 2 }; };
    var c3 = function (a, b, c) {
      var x1 = a.x, y1 = a.y, r1 = a.r, x2 = b.x, y2 = b.y, r2 = b.r, x3 = c.x, y3 = c.y, r3 = c.r;
      var a2 = x1 - x2, a3 = x1 - x3, b2 = y1 - y2, b3 = y1 - y3, c2_ = r2 - r1, c3_ = r3 - r1, d1 = x1 * x1 + y1 * y1 - r1 * r1, d2 = d1 - x2 * x2 - y2 * y2 + r2 * r2, d3 = d1 - x3 * x3 - y3 * y3 + r3 * r3;
      var ab = a3 * b2 - a2 * b3; if (!ab) return c2(a, c);
      var xa = (b2 * d3 - b3 * d2) / (ab * 2) - x1, xb = (b3 * c2_ - b2 * c3_) / ab, ya = (a3 * d2 - a2 * d3) / (ab * 2) - y1, yb = (a2 * c3_ - a3 * c2_) / ab;
      var A = xb * xb + yb * yb - 1, Bq = 2 * (r1 + xa * xb + ya * yb), Cq = xa * xa + ya * ya - r1 * r1, r = -(Math.abs(A) > 1e-6 ? (Bq + Math.sqrt(Math.max(0, Bq * Bq - 4 * A * Cq))) / (2 * A) : Cq / Bq);
      return { x: x1 + xa + xb * r, y: y1 + ya + yb * r, r: r };
    };
    var all = function (c, list) { for (var q = 0; q < list.length; q++) if (!inside(c, list[q])) return false; return true; };
    var basis = function (Bs) { return Bs.length === 1 ? c1(Bs[0]) : Bs.length === 2 ? c2(Bs[0], Bs[1]) : c3(Bs[0], Bs[1], Bs[2]); };
    var not = function (a, b) { var dr = a.r - b.r, dx = b.x - a.x, dy = b.y - a.y; return dr < 0 || dr * dr < dx * dx + dy * dy; };
    var extend = function (Bs, p) {
      var q, r;
      if (all(p, Bs)) return [p];
      for (q = 0; q < Bs.length; q++) if (not(p, Bs[q]) && all(c2(Bs[q], p), Bs)) return [Bs[q], p];
      for (q = 0; q < Bs.length - 1; q++) for (r = q + 1; r < Bs.length; r++) {
        if (not(c2(Bs[q], Bs[r]), p) && not(c2(Bs[q], p), Bs[r]) && not(c2(Bs[r], p), Bs[q]) && all(c3(Bs[q], Bs[r], p), Bs)) return [Bs[q], Bs[r], p];
      }
      return [p];
    };
    i = 0;
    while (i < n) { var p = L[i]; if (e && inside(e, p)) ++i; else { B = extend(B, p); e = basis(B); i = 0; } }
    return e || { x: 0, y: 0, r: 0 };
  }
  function pack(G, o) {
    var H = hierarchy(G, o), val = sums(G, H, o), N = H.N, C = new Array(N), i, padR = 3;
    for (i = H.order.length - 1; i >= 0; i--) {
      var v = H.order[i], k = H.kids[v];
      if (!k.length) { C[v] = { x: 0, y: 0, r: Math.sqrt(val[v] || 1) * 10 }; continue; }
      var cs = k.map(function (c) { return { x: 0, y: 0, r: C[c].r + padR, id: c }; });
      if (H.own(v) > 0) cs.push({ x: 0, y: 0, r: Math.sqrt(H.own(v)) * 10 + padR, id: -1 });   /* what the item holds itself: a circle of its own inside */
      var r = packSiblings(cs);
      C[v] = { x: 0, y: 0, r: r + padR, kids: cs };
    }
    var scale = 0, root = C[H.root];
    var want = Math.max(300, Math.min(3000, Math.sqrt(N) * 40)); scale = root.r > 0 ? want / root.r : 1;
    var X = new Float64Array(N), Y = new Float64Array(N), Rr = new Float64Array(N);
    X[H.root] = want + 40; Y[H.root] = want + 40; Rr[H.root] = want;
    for (i = 0; i < H.order.length; i++) {
      var u = H.order[i], cu = C[u]; if (!cu.kids) continue;
      cu.kids.forEach(function (s) { if (s.id < 0) return; X[s.id] = X[u] + s.x * scale; Y[s.id] = Y[u] + s.y * scale; Rr[s.id] = (s.r - padR) * scale; });
    }
    return nestedOut('pack', G, H, val, { X: X, Y: Y, Rr: Rr, W: want * 2 + 80, H: want * 2 + 80 });
  }
  /**
   * Tidy tree in linear time (Buchheim, Junger and Leipert's version of Reingold-Tilford): no two items of a row touch and a parent sits over its children.
   * shape: 'tidy' (left to right), 'cluster' (every leaf in the last column, a dendrogram), 'radial', 'radialCluster', 'indented'.
   */
  function tree(G, o) {
    var H = hierarchy(G, o), val = NOVAL, N = H.N, shape = o.treeShape || 'tidy', i;
    var X = new Float64Array(N), Y = new Float64Array(N), maxD = 0;
    for (i = 0; i < N; i++) if (H.depth[i] > maxD) maxD = H.depth[i];
    var skipRoot = H.item[H.root] < 0 ? 1 : 0;
    if (shape === 'indented') {
      var row = 0, stack = [H.root];
      while (stack.length) { var v = stack.pop(); if (!(skipRoot && v === H.root)) { X[v] = (H.depth[v] - skipRoot) * 26; Y[v] = row++ * 26; } var k = H.kids[v]; for (var j = k.length - 1; j >= 0; j--) stack.push(k[j]); }
      return nestedOut('tree', G, H, val, { X: X, Y: Y, shape: shape, W: (maxD + 1) * 26 + 360, H: row * 26 + 40, skipRoot: skipRoot });
    }
    var cluster = shape === 'cluster' || shape === 'radialCluster';
    var B = tmpF(6, N);   /* breadth position: rows of 1 */
    if (cluster) {
      var leaf = 0;
      var dfs = [H.root], post = [];
      while (dfs.length) { var w2 = dfs.pop(); post.push(w2); var kk = H.kids[w2]; for (var q = 0; q < kk.length; q++) dfs.push(kk[q]); }
      var seen = [H.root], vis = [];   /* leaves in tree order */
      while (seen.length) { var s = seen.pop(); vis.push(s); var ks = H.kids[s]; for (var q2 = ks.length - 1; q2 >= 0; q2--) seen.push(ks[q2]); }
      vis.forEach(function (v2) { if (!H.kids[v2].length) B[v2] = leaf++; });
      for (i = post.length - 1; i >= 0; i--) { var p2 = post[i], kp = H.kids[p2]; if (kp.length) B[p2] = (B[kp[0]] + B[kp[kp.length - 1]]) / 2; }
    } else buchheim(H, B);
    var minB = Infinity, maxB = -Infinity;
    for (i = 0; i < N; i++) { if (skipRoot && i === H.root) continue; if (B[i] < minB) minB = B[i]; if (B[i] > maxB) maxB = B[i]; }
    if (!isFinite(minB)) { minB = 0; maxB = 0; }
    var levels = maxD + 1 - skipRoot;
    if (shape === 'radial' || shape === 'radialCluster') {
      var count = maxB - minB + 1, Rad = Math.max(220, Math.min(3000, count * 16 / TAU, levels * 120 + 60)), cx = Rad + 200;
      if (count * 16 / TAU > Rad) Rad = Math.min(4000, count * 16 / TAU);
      cx = Rad + 200;
      for (i = 0; i < N; i++) {
        var an = (B[i] - minB) / Math.max(1, count) * TAU - Math.PI / 2, rr = cluster && !H.kids[i].length ? Rad : (H.depth[i] - skipRoot) / Math.max(1, levels - 1) * Rad;
        if (skipRoot && i === H.root) rr = 0;
        X[i] = cx + Math.cos(an) * rr; Y[i] = cx + Math.sin(an) * rr;
      }
      return nestedOut('tree', G, H, val, { X: X, Y: Y, shape: shape, cx: cx, cy: cx, W: cx * 2, H: cx * 2, skipRoot: skipRoot, minB: minB, count: count });
    }
    var dx = 180, dy = 26;
    for (i = 0; i < N; i++) { X[i] = (cluster && !H.kids[i].length ? levels - 1 : H.depth[i] - skipRoot) * dx + 20; Y[i] = (B[i] - minB) * dy + 20; }
    return nestedOut('tree', G, H, val, { X: X, Y: Y, shape: shape, W: levels * dx + 300, H: (maxB - minB + 1) * dy + 40, skipRoot: skipRoot });
  }
  /** Buchheim et al. 2002, written over the hierarchy's lists: B[v] = breadth position, rows 1 apart. */
  function buchheim(H, B) {
    var N = H.N, kids = H.kids, par = H.par;
    var prelim = tmpF(0, N), mod = tmpF(1, N), shift = tmpF(2, N), change = tmpF(3, N);
    var thread = tmpI(10, N, -1), ancestor = tmpI(11, N), number = tmpI(12, N), i;
    /* first and last child, left sibling and leftmost sibling as flat lists: the walk below reads them over and over */
    var fk = tmpI(14, N, -1), lk = tmpI(15, N, -1), ls = tmpI(16, N, -1), lm = tmpI(17, N, -1);
    for (i = 0; i < N; i++) { ancestor[i] = i; var k = kids[i], L = k.length; if (!L) continue; fk[i] = k[0]; lk[i] = k[L - 1]; for (var j = 0; j < L; j++) { var c0 = k[j]; number[c0] = j; lm[c0] = k[0]; if (j) ls[c0] = k[j - 1]; } }
    var leftSib = function (v) { return ls[v]; };
    var leftMost = function (v) { return lm[v]; };
    var nextLeft = function (v) { var c = fk[v]; return c >= 0 ? c : thread[v]; };
    var nextRight = function (v) { var c = lk[v]; return c >= 0 ? c : thread[v]; };
    var moveSubtree = function (wm, wp, s) { var sub = number[wp] - number[wm]; if (sub <= 0) sub = 1; change[wp] -= s / sub; shift[wp] += s; change[wm] += s / sub; prelim[wp] += s; mod[wp] += s; };
    var ancestorOf = function (vim, v, def) { return par[ancestor[vim]] === par[v] && par[v] >= 0 ? ancestor[vim] : def; };
    var apportion = function (v, def) {
      var w = leftSib(v); if (w < 0) return def;
      var vip = v, vop = v, vim = w, vom = leftMost(v), sip = mod[vip], sop = mod[vop], sim = mod[vim], som = mod[vom];
      while (nextRight(vim) >= 0 && nextLeft(vip) >= 0) {
        vim = nextRight(vim); vip = nextLeft(vip); vom = nextLeft(vom); vop = nextRight(vop);
        ancestor[vop] = v;
        var s = (prelim[vim] + sim) - (prelim[vip] + sip) + 1;
        if (s > 0) { moveSubtree(ancestorOf(vim, v, def), v, s); sip += s; sop += s; }
        sim += mod[vim]; sip += mod[vip]; som += mod[vom]; sop += mod[vop];
      }
      if (nextRight(vim) >= 0 && nextRight(vop) < 0) { thread[vop] = nextRight(vim); mod[vop] += sim - sop; }
      if (nextLeft(vip) >= 0 && nextLeft(vom) < 0) { thread[vom] = nextLeft(vip); mod[vom] += sip - som; def = v; }
      return def;
    };
    var executeShifts = function (v) { var sh = 0, ch = 0, k = kids[v]; for (var q = k.length - 1; q >= 0; q--) { var w = k[q]; prelim[w] += sh; mod[w] += sh; ch += change[w]; sh += shift[w] + ch; } };
    var mid = tmpF(4, N);   /* boxes are numbered parents first, so walking the numbers backward meets every child before its parent */
    /* Buchheim's first walk without recursion: a child's own place is set (from its left sibling, now final) just before it is fitted against the subtrees to its left */
    for (i = N - 1; i >= 0; i--) {
      var v2 = i, k2 = kids[v2]; if (!k2.length) continue;
      var def = k2[0];
      for (var q2 = 0; q2 < k2.length; q2++) {
        var c = k2[q2], w2 = q2 ? k2[q2 - 1] : -1;
        if (w2 >= 0) { prelim[c] = prelim[w2] + 1; if (kids[c].length) mod[c] = prelim[c] - mid[c]; }
        else prelim[c] = kids[c].length ? mid[c] : 0;
        def = apportion(c, def);
      }
      executeShifts(v2);
      mid[v2] = (prelim[k2[0]] + prelim[k2[k2.length - 1]]) / 2;
    }
    prelim[H.root] = kids[H.root].length ? mid[H.root] : 0;
    B[H.root] = prelim[H.root];
    var order = H.order, acc = tmpF(5, N);
    for (i = 0; i < order.length; i++) { var u = order[i]; if (par[u] >= 0) { acc[u] = acc[par[u]] + mod[par[u]]; B[u] = prelim[u] + acc[u]; } else { acc[u] = 0; B[u] = prelim[u]; } }
  }

  /** The common result of the nested views: G's items placed where the shape put them (for picking and names), plus the shape itself. */
  function nestedOut(type, G, H, val, geo) {
    var nodes = G.nodes.slice(), at = tmpI(13, G.nodes.length, -1), i;
    for (i = 0; i < H.N; i++) if (H.item[i] >= 0) at[H.item[i]] = i;
    var R = geo.R, ch = geo;
    for (var q = 0; q < nodes.length; q++) {
      var nd = nodes[q], v = at[q], x0, y0, x1, y1;
      if (type === 'treemap') { x0 = R[v * 4]; y0 = R[v * 4 + 1]; x1 = R[v * 4 + 2]; y1 = R[v * 4 + 3]; }
      else if (type === 'icicle') { x0 = R[v * 4] * ch.colW; x1 = R[v * 4 + 2] * ch.colW; y0 = R[v * 4 + 1] * ch.H; y1 = R[v * 4 + 3] * ch.H; }
      else if (type === 'sunburst') { var an = (R[v * 4 + 1] + R[v * 4 + 3]) / 2 * TAU - Math.PI / 2, rr = ch.hole + (R[v * 4] + 0.5) * ch.ring; nd.cx = ch.cx + Math.cos(an) * rr; nd.cy = ch.cy + Math.sin(an) * rr; x0 = nd.cx - 5; x1 = nd.cx + 5; y0 = nd.cy - 5; y1 = nd.cy + 5; }
      else if (type === 'pack') { var r = ch.Rr[v]; x0 = ch.X[v] - r; x1 = ch.X[v] + r; y0 = ch.Y[v] - r; y1 = ch.Y[v] + r; }
      else { x0 = ch.X[v] - 5; x1 = ch.X[v] + 5; y0 = ch.Y[v] - 5; y1 = ch.Y[v] + 5; }
      nd.x = x0; nd.y = y0; nd.w = Math.max(0, x1 - x0); nd.h = Math.max(0, y1 - y0); nd.cx = (x0 + x1) / 2; nd.cy = (y0 + y1) / 2; nd.hv = v;
    }
    geo.type = type; geo.val = val; geo.N = H.N; geo.par = H.par; geo.kids = H.kids; geo.depth = H.depth; geo.item = H.item; geo.label = H.label; geo.group = H.group; geo.root = H.root; geo.order = H.order; geo.mode = H.mode;
    geo.extra = H.extra.length; geo.tree = { from: H.from, to: H.to, extraList: H.extra };
    return { kind: type, dir: 'none', nodes: nodes, edges: G.edges, chart: geo, width: geo.W, height: geo.H };
  }




  function layout(view, G, o) {
    o = o || {};
    if (view === 'treemap') return treemap(G, o);
    if (view === 'sunburst') return partition(G, o, true);
    if (view === 'icicle') return partition(G, o, false);
    if (view === 'pack') return pack(G, o);
    return tree(G, o);
  }

  /* ---------------------------------------------------------------- drawing lists */
  /** Points along an annular sector, outer arc then inner arc back. */
  function sector(cx, cy, r0, r1, a0, a1, out) {
    var n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.05)), i, a;
    for (i = 0; i <= n; i++) { a = a0 + (a1 - a0) * i / n; out.push(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); }
    for (i = n; i >= 0; i--) { a = a0 + (a1 - a0) * i / n; out.push(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); }
    return out;
  }
  /** A filled shape the renderer fans out from one middle point, so it is cut into pieces that each see their whole edge from their middle. */
  function pushSector(S, cx, cy, r0, r1, a0, a1, fill, stroke, extra) {
    var step = 0.5, a = a0;
    while (a < a1 - 1e-9) {
      var b = Math.min(a1, a + step), pts = sector(cx, cy, r0, r1, a, b, []), mx = 0, my = 0, q;
      for (q = 0; q < pts.length; q += 2) { mx += pts[q]; my += pts[q + 1]; }
      var p = { pts: pts, c: [mx / (pts.length / 2), my / (pts.length / 2)], fill: fill, stroke: stroke };
      if (extra) for (var k in extra) p[k] = extra[k];
      S.polys.push(p); a = b;
    }
  }


  /**
   * The drawing for a chart layout. The scene module draws the items (dots, names, colors, key) from a plain network-style copy of the layout;
   * this adds the shapes and replaces what does not fit (links are drawn here, names placed for the shape).
   */
  /** ext (from netflow-circular): { draw(type, C) draws the shapes of its own views and returns true, note(L) the line under the picture }. */
  function scene(L, o, NS, ext) {
    var ch = L.chart, type = ch.type;
    var showDots = type === 'pack' || type === 'tree' || type === 'bundles';
    /* the scene module gets its own copy of each item (plain objects of one shape, so reading them stays fast); the copies are kept on the layout and filled in again for the next picture, so a look change makes no new ones */
    /* Each item is read in full only once per layout: items that came from a worker are slow dictionary objects, and copying all their fields
       on every look change cost about 1 s per 100,000 items in Chromium. Later pictures refresh only the size, which is all a look change alters here. */
    var SN = L.__stub; if (!SN || SN.src !== L.nodes || SN.nodes.length !== L.nodes.length) SN = L.__stub = { src: L.nodes, nodes: L.nodes.map(function (nd) { var c = {}; for (var k in nd) c[k] = nd[k]; return c; }) };
    var nodes = SN.nodes;
    L.nodes.forEach(function (nd, q) { var c = nodes[q]; if (nd.w !== undefined) c.w = nd.w; if (nd.h !== undefined) c.h = nd.h; if (!showDots || (type === 'pack' && ch.kids[nd.hv].length)) { c.w = 0; c.h = 0; } });
    if (type === 'pack') nodes.forEach(function (nd) { if (!ch.kids[nd.hv].length) { nd.w = nd.h = 2 * ch.Rr[nd.hv]; } });
    if (type === 'tree' || type === 'bundles') nodes.forEach(function (nd) { nd.w = nd.h = 9; });
    var stub = { kind: 'network', view: 'network', dir: 'none', nodes: nodes, edges: [], width: L.width, height: L.height, ch: L.ch, flow: L.flow, cls: L.cls, imp: L.imp, groups: L.groups, startId: L.startId, n: L.n, m: L.m };
    var lab0 = o.lab || {};
    var S = NS.make(stub, Object.assign({}, o, { hulls: false, lab: { items: Object.assign({}, lab0.items || {}, { show: false }), links: lab0.links || { show: true, scale: 1 }, groups: { show: false, scale: 1 } }, lens: null, flat: false }));
    S.view = type; S.kind = type; S.chart = true;
    var T = S.theme, alpha = NS.alpha, mix = NS.mix;
    var groupsHex = T.groups, gIdx = new Map(), gcol = function (g) { if (o.groupColors && o.groupColors[g]) return NS.hex(o.groupColors[g]); if (!gIdx.has(g)) gIdx.set(g, gIdx.size); return groupsHex[gIdx.get(g) % groupsHex.length]; };
    (L.groups || []).forEach(function (g) { gcol(g); });
    var itemShow = !(lab0.items && lab0.items.show === false), iscale = lab0.items && lab0.items.scale || 1;
    var colOfNode = function (q) { var rec = S.nodes[q], d = rec && S.dots.filter ? null : null; return gcol(L.nodes[q].group || ''); };
    var dotOf = new Array(S.nodes.length), dl = S.dots, di; for (di = 0; di < dl.length; di++) { if (dl[di].node >= 0) dotOf[dl[di].node] = dl[di]; }   /* item record number to its dot (the last one wins) */
    var fillOf = function (q) { var d = q >= 0 && q < dotOf.length ? dotOf[q] : undefined; return d ? d.fill : gcol(L.nodes[q].group || ''); };
    var lab = function (x, y, t, size, c, op) { var l = { x: x, y: y, t: t, size: size, color: c, align: 'c', bold: false, rot: 0, minK: 0, node: -1 }; if (op) for (var k in op) l[k] = op[k]; if (l.rot) l.rot *= 180 / Math.PI; S.labels.push(l); return l; };   /* angles in radians here, the renderer takes degrees */
    var clip = function (s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; };
    var recOf = function (q) { return S.nodes[q]; };
    /* text on a shape: the preferred color when it reads at 4.5:1 or better on the shape (as drawn over the background), otherwise near-black or white, whichever reads better (black where neither reaches 4.5:1) */
    var ink = function (fill, pref) { var c = over(fill, T.bg); if (pref && contrast(pref, c) >= 4.5) return pref; var d = contrast(INK_DARK, c), w = contrast(INK_LIGHT, c); return Math.max(d, w) >= 4.5 ? (d >= w ? INK_DARK : INK_LIGHT) : INK_BLACK; };   /* pure black reaches 4.5:1 on every color where neither does */
    /* one color for everything says nothing: then each top branch (or each arc) gets its own color from the color set */
    var mono = (L.groups || []).length <= 1 && (!o.colorBy || o.colorBy === 'group' || o.colorBy === 'found');
    var topIdx = null;
    if (mono && ch.par) { topIdx = new Int32Array(ch.N); var kr = ch.kids[ch.root]; for (var t0 = 0; t0 < ch.order.length; t0++) { var w0 = ch.order[t0], pw = ch.par[w0]; topIdx[w0] = pw < 0 ? 0 : pw === ch.root ? kr.indexOf(w0) : topIdx[pw]; } }
    var hcol = function (v) { if (topIdx) return groupsHex[topIdx[v] % groupsHex.length]; var it = ch.item[v]; return it >= 0 ? fillOf(it) : gcol(ch.group[v]); };
    var addCurve = function (P, w, color, edge, from, to, arrow) { S.curves.push({ P: P, w: w, color: color, arrow: !!arrow, line: false, edge: edge, from: from, to: to }); };

    var C = { S: S, L: L, ch: ch, o: o, NS: NS, T: T, alpha: alpha, mix: mix, groupsHex: groupsHex, gcol: gcol, fillOf: fillOf, lab: lab, clip: clip, mono: mono, idxOfId: null, addCurve: addCurve, itemShow: itemShow, iscale: iscale };
    var idxOfId = null; Object.defineProperty(C, 'idxOfId', { get: function () { if (!idxOfId) { idxOfId = new Map(); L.nodes.forEach(function (nd, q) { idxOfId.set(nd.id, q); }); } return idxOfId; } });   /* item name to number: made only for a view that asks */
    if (ext && ext.draw(type, C)) { /* drawn by the extension */ }
    else if (type === 'treemap' || type === 'icicle') {
      var Rm = ch.R, cw = ch.colW, Hh = ch.H, rectLine = alpha(T.bg, 0.9), lookM = new Map();
      /* a box's fill from its base color: made once per base color and kind and shared (nothing changes these arrays in place) */
      var look = function (base, k) { var e = lookM.get(base); if (!e) lookM.set(base, e = [null, null]); return e[k] || (e[k] = k ? alpha(mix(base, T.bg, 0.55), 0.9) : alpha(base, type === 'icicle' ? 0.85 : 0.92)); };
      for (var oi = 0; oi < ch.order.length; oi++) {
        var v = ch.order[oi]; if (type === 'icicle' && ch.depth[v] < ch.skipRoot) continue; if (type === 'treemap' && v === ch.root && ch.item[v] < 0) continue;
        var x0, y0, x1, y1;
        if (type === 'treemap') { x0 = Rm[v * 4]; y0 = Rm[v * 4 + 1]; x1 = Rm[v * 4 + 2]; y1 = Rm[v * 4 + 3]; }
        else { x0 = Rm[v * 4] * cw; x1 = Rm[v * 4 + 2] * cw - 1; y0 = Rm[v * 4 + 1] * Hh; y1 = Rm[v * 4 + 3] * Hh - 1; }
        var w2 = x1 - x0, h2 = y1 - y0; if (w2 <= 0.3 || h2 <= 0.3) continue;
        var it = ch.item[v], base = hcol(v), box = ch.kids[v].length > 0;
        var fill = look(base, type === 'treemap' && box ? 1 : 0);
        S.rects.push({ x: x0, y: y0, w: w2, h: h2, r: 0, fill: fill, stroke: rectLine, sw: 1, layer: 1, node: it >= 0 ? recOf(it).i : -1, a: 1 });
        var size = (type === 'treemap' && box ? 12 : 11) * iscale, txt = ch.label[v];
        if (itemShow && w2 > size * 2.2 && h2 > size * 1.3) {
          var maxC = Math.floor((w2 - 8) / (size * 0.58)), tcol = ink(fill, type === 'treemap' && box ? T.fg : null);
          lab(x0 + 4, y0 + size + 2, clip(txt, maxC), size, tcol, { align: 'l', node: it >= 0 ? it : -1, minK: 0, bold: box, val: ch.val[v] });
        }
      }
    } else if (type === 'sunburst') {
      var Rs = ch.R, scx = ch.cx, scy = ch.cy;
      for (var si = 0; si < ch.order.length; si++) {
        var u = ch.order[si], d = Rs[u * 4]; if (d < 0) continue;
        var a0 = Rs[u * 4 + 1] * TAU - Math.PI / 2, a1 = Rs[u * 4 + 3] * TAU - Math.PI / 2; if (a1 - a0 < 0.002) continue;
        var r0 = ch.hole + d * ch.ring, r1 = r0 + ch.ring - 1.5, it2 = ch.item[u], base2 = hcol(u);
        var gap = Math.min(0.004, (a1 - a0) * 0.1);
        pushSector(S, scx, scy, r0, r1, a0 + gap, a1 - gap, alpha(base2, 0.9 - Math.min(0.3, d * 0.06)), [0, 0, 0, 0], it2 < 0 ? { group: ch.group[u] } : null);
        var midA = (a0 + a1) / 2, rr = (r0 + r1) / 2, arcLen = (a1 - a0) * rr;
        if (itemShow && arcLen > 12 * iscale) {
          var right2 = Math.cos(midA) >= 0, maxC2 = Math.floor((ch.ring - 8) / (6.5 * iscale));
          lab(scx + Math.cos(midA) * rr, scy + Math.sin(midA) * rr + 4, clip(ch.label[u], maxC2), 11 * iscale, ink(alpha(base2, 0.9 - Math.min(0.3, d * 0.06)), null), { rot: right2 ? midA : midA + Math.PI, node: it2 >= 0 ? it2 : -1, minK: 0.2 });
        }
      }
      if (ch.skipRoot) lab(scx, scy + 5, clip(ch.label[ch.root], 18), 13, T.fg, { bold: true });
    } else if (type === 'pack') {
      /* a circle's fill as drawn: its own shade over every circle around it */
      var shown = new Map(), parentFill = function (v) { var p = ch.par[v]; if (p < 0 || !ch.kids[p].length) return T.bg; var c = shown.get(p); return c || T.bg; };
      for (var pi = 0; pi < ch.order.length; pi++) {
        var pv = ch.order[pi]; if (!ch.kids[pv].length) continue; if (pv === ch.root && ch.item[pv] < 0 && false) continue;
        var pr = ch.Rr[pv], px = ch.X[pv], py = ch.Y[pv], ip = ch.item[pv], pb = hcol(pv);
        var circ = [], nseg = Math.max(24, Math.min(96, Math.round(pr / 3)));
        for (var cq = 0; cq < nseg; cq++) { var ca = cq / nseg * TAU; circ.push(px + Math.cos(ca) * pr, py + Math.sin(ca) * pr); }
        var dep = ch.depth[pv];
        var pfill = alpha(mix(pb, T.bg, 0.6), dep === 0 ? 0.35 : 0.5);
        shown.set(pv, over(pfill, parentFill(pv)));
        S.polys.push({ pts: circ, c: [px, py], fill: pfill, stroke: alpha(pb, 0.6), group: ip < 0 ? ch.group[pv] : undefined, node: ip });
        if (itemShow && pr > 30) lab(px, py - pr + 16 * iscale, clip(ch.label[pv], Math.floor(pr / 5)), 12 * iscale, ink(over(pfill, parentFill(pv)), T.fg), { bold: true, node: ip >= 0 ? ip : -1, minK: 0.1 });
      }
      if (itemShow) L.nodes.forEach(function (nd, q) { if (ch.kids[nd.hv].length) return; var r = ch.Rr[nd.hv]; if (r > 14) lab(nd.cx, nd.cy + 4, clip(nd.label, Math.floor(r / 3.6)), Math.min(13, r / 2.6) * iscale, ink(fillOf(q), null), { node: q, minK: 0.3 }); });
      /* polys are drawn under the dots: move the outer circles first */
    } else if (type === 'tree') {
      var radial = ch.shape === 'radial' || ch.shape === 'radialCluster', ind = ch.shape === 'indented', X = ch.X, Y = ch.Y, treeLine = alpha(T.line, 0.75);
      for (var ti = 0; ti < ch.order.length; ti++) {
        var c = ch.order[ti], p2 = ch.par[c]; if (p2 < 0 || (ch.skipRoot && p2 === ch.root)) continue;
        var ic = ch.item[c], ipp = ch.item[p2], P;
        if (ind) P = [X[p2] + 6, Y[p2], X[p2] + 6, Y[p2] + (Y[c] - Y[p2]) * 0.6, X[p2] + 6, Y[c], X[c], Y[c]];
        else if (radial) {
          var ax = X[p2] - ch.cx, ay = Y[p2] - ch.cy, bx = X[c] - ch.cx, by = Y[c] - ch.cy, ra = Math.hypot(ax, ay), rb = Math.hypot(bx, by), rm = (ra + rb) / 2;
          var an1 = Math.atan2(ay, ax), an2 = Math.atan2(by, bx);
          if (ra < 1e-6) an1 = an2;
          P = [X[p2], Y[p2], ch.cx + Math.cos(an1) * rm, ch.cy + Math.sin(an1) * rm, ch.cx + Math.cos(an2) * rm, ch.cy + Math.sin(an2) * rm, X[c], Y[c]];
        } else { var xm = (X[p2] + X[c]) / 2; P = [X[p2], Y[p2], xm, Y[p2], xm, Y[c], X[c], Y[c]]; }
        var e = edgeBetween(L, ch, p2, c);
        addCurve(P, 1.3, treeLine, e, ipp >= 0 ? L.nodes[ipp].id : undefined, ic >= 0 ? L.nodes[ic].id : undefined, false);
      }
      if (itemShow) for (var li = 0; li < ch.N; li++) {
        var itl = ch.item[li]; if (itl < 0) continue;
        var leafy = !ch.kids[li].length, lx = X[li], ly = Y[li];
        if (radial) {
          var an3 = Math.atan2(ly - ch.cy, lx - ch.cx), right3 = Math.cos(an3) >= 0, out = leafy ? 8 : -8;
          if (Math.hypot(lx - ch.cx, ly - ch.cy) < 1) { lab(lx, ly - 10, clip(ch.label[li], 24), 11 * iscale, T.fg, { node: itl, minK: 0.2 }); continue; }
          lab(lx + Math.cos(an3) * out, ly + Math.sin(an3) * out + 3, clip(ch.label[li], 26), 11 * iscale, T.fg, { align: (right3 === leafy) ? 'l' : 'r', rot: right3 ? an3 : an3 + Math.PI, node: itl, minK: 0.2 });
        } else lab(lx + (leafy || ind ? 9 : -9), ly + 4, clip(ch.label[li], 30), 11 * iscale, T.fg, { align: leafy || ind ? 'l' : 'r', node: itl, minK: 0.2, bg: !leafy && !ind });
      }
    }
    /* the drawing order: shapes under items; a pack's outer circles first (they are in tree order already) */
    if (type !== 'chord' && type !== 'sunburst') S.polys.sort(function (a, b) { return (a.piece ? 1 : 0) - (b.piece ? 1 : 0); });
    /* items the scene module named are dropped above (names off there); bounds again over everything */
    var x0b = Infinity, y0b = Infinity, x1b = -Infinity, y1b = -Infinity;
    var grow = function (x, y) { if (x < x0b) x0b = x; if (x > x1b) x1b = x; if (y < y0b) y0b = y; if (y > y1b) y1b = y; };
    S.rects.forEach(function (r) { grow(r.x, r.y); grow(r.x + r.w, r.y + r.h); });
    S.dots.forEach(function (d) { grow(d.cx - d.r, d.cy - d.r); grow(d.cx + d.r, d.cy + d.r); });
    S.polys.forEach(function (p) { for (var i = 0; i < p.pts.length; i += 2) grow(p.pts[i], p.pts[i + 1]); });
    S.curves.forEach(function (c) { for (var i = 0; i < c.P.length; i += 2) grow(c.P[i], c.P[i + 1]); });
    S.labels.forEach(function (l) { if (l.rot) { var r = l.t.length * l.size * 0.6; grow(l.x + Math.cos(l.rot) * r * (l.align === 'r' ? -1 : 1), l.y + Math.sin(l.rot) * r * (l.align === 'r' ? -1 : 1)); } else { var b = NS.labelBox(l); if (b) { grow(b[0], b[1]); grow(b[2], b[3]); } } });
    if (!isFinite(x0b)) { x0b = 0; y0b = 0; x1b = 100; y1b = 100; }
    var pad = 30; S.x0 = x0b - pad; S.y0 = y0b - pad; S.w = x1b - x0b + 2 * pad; S.h = y1b - y0b + 2 * pad;
    S.gridStale = true; S.eidx = null; S.spatial = null;
    if (S.legendTitle === '' && !S.legend.length && (L.groups || []).length > 1) (L.groups || []).slice(0, 12).forEach(function (g) { S.legend.push({ k: 'group', c: gcol(g), t: g || '(no group)', key: 'g:' + g }); });
    S.chartNote = chartNote(L, ext);
    if (NS.addTitles) NS.addTitles(S, o);   /* opt-in o.title, o.subtitle, o.source */
    return S;
  }
  function lumi(c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  var INK_DARK = [0.1, 0.1, 0.12, 1], INK_LIGHT = [1, 1, 1, 1], INK_BLACK = [0, 0, 0, 1];
  /** A color with opacity laid over an opaque one, as the picture shows it. */
  function over(c, bg) { var a = c[3] === undefined ? 1 : c[3]; return [c[0] * a + bg[0] * (1 - a), c[1] * a + bg[1] * (1 - a), c[2] * a + bg[2] * (1 - a), 1]; }
  /** WCAG relative luminance and contrast ratio (1 to 21) of two opaque colors with channels 0 to 1. */
  function relLum(c) { var f = function (v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }
  function contrast(a, b) { var x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  /** The tree link from p to c as a link of the map, when it is one (made-up group boxes are not). */
  function edgeBetween(L, ch, p, c) {
    var ip = ch.item[p], ic = ch.item[c]; if (ip < 0 || ic < 0) return -1;
    /* each child's answer is kept on the layout (its links and items do not change between pictures) */
    if (!ch.__eb || ch.__ebE !== L.edges || ch.__eb.length !== ch.N) { ch.__eb = new Int32Array(ch.N).fill(-2); ch.__ebE = L.edges; }
    var kept = ch.__eb[c]; if (kept !== -2 && ch.par[c] === p) return kept;
    var a = L.nodes[ip].id, b = L.nodes[ic].id;
    if (!ch.__ei) { ch.__ei = new Map(); L.edges.forEach(function (e, ei) { var k = e.from + '\u0000' + e.to; if (!ch.__ei.has(k)) ch.__ei.set(k, ei); }); }
    var r = ch.__ei.get(a + '\u0000' + b); r = r === undefined ? -1 : r; if (ch.par[c] === p) ch.__eb[c] = r; return r;
  }
  /** One line under the picture that says what the shape is made from. */
  function chartNote(L, ext) {
    var ch = L.chart; if (!ch) return '';
    if (ext && ext.note) { var t = ext.note(L); if (t !== undefined) return t; }
    var n = function (x) { return Number(x).toLocaleString('en-US'); };
    var src = ch.mode === 'groups' ? 'Nested by group.' : 'Nested by links: each item hangs under the first item that leads to it from the start.';
    return src + (ch.extra ? ' ' + n(ch.extra) + ' other links are not part of the nesting.' : '');
  }

  /** The links of any plain input: a list of { from, to, value } (weight or count also name the amount; 1 when none), or { links } or { edges }. */
  function asLinks(d) { var l = Array.isArray(d) ? d : (d && (d.links || d.edges)) || []; return l.map(function (e) { var v = e.value !== undefined ? e.value : e.weight !== undefined ? e.weight : e.count !== undefined ? e.count : 1; return { from: e.from, to: e.to, value: +v }; }); }
  /** NetflowScene from the page (or, in Node, from the folder next door), with a plain error when it is missing. */
  function sceneLib(who) {
    var g = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : {};
    if (g.NetflowScene) return g.NetflowScene;
    if (typeof require === 'function') { try { return require('../netflow-scene/netflow-scene.js'); } catch (e) { /* not there */ } }
    throw new Error(who + ': NetflowScene was not found. Load netflow-scene.js before ' + who + '.js.');
  }
  /** Links (as above) or { nodes, edges } as a graph for layout(): items are made from the links' ends when not given. */
  function asGraph(d) {
    if (d && !Array.isArray(d) && d.nodes && d.edges) return d;
    var ls = asLinks(d), ns = d && !Array.isArray(d) && d.nodes ? d.nodes.slice() : [], seen = {};
    ns.forEach(function (n) { seen[n.id] = 1; }); ls.forEach(function (e) { [e.from, e.to].forEach(function (id) { if (!seen[id]) { seen[id] = 1; ns.push({ id: id, label: String(id) }); } }); });
    var inV = {}, outV = {}; ls.forEach(function (e) { if (e.value > 0) { inV[e.to] = (inV[e.to] || 0) + e.value; outV[e.from] = (outV[e.from] || 0) + e.value; } });
    ns = ns.map(function (n) { if (n.sizeV !== undefined) return n; var c = {}; for (var k in n) c[k] = n[k]; c.sizeV = Math.max(1e-6, (inV[n.id] || 0) - (outV[n.id] || 0)); return c; });   /* each box holds what flows into it and stays there (what flows on is drawn by the boxes inside) */
    return { nodes: ns, edges: ls.map(function (e) { return { from: e.from, to: e.to, weight: e.value, count: 1, widthV: NaN, flow: 0 }; }) };
  }
  /** One call to a picture: toSvg(data, options) returns SVG text. options.type picks the view (default treemap); the rest go to layout() and scene(). */
  function toSvg(data, o) {
    o = o || {}; var NS = sceneLib('netflow-hierarchy'), lo = {}; for (var k in o) lo[k] = o[k]; if (lo.nest === undefined) lo.nest = 'auto'; if (lo.sized === undefined) lo.sized = true;
    return NS.toSvg(scene(layout(o.type || 'treemap', asGraph(data), lo), o, NS), o.title);
  }
  return { VIEWS: VIEWS, IS: IS, NESTED: NESTED, layout: layout, scene: scene, toSvg: toSvg, asGraph: asGraph, sceneLib: sceneLib, hierarchy: hierarchy, sums: sums, packSiblings: packSiblings, enclose: enclose, linkValue: linkValue, itemValue: itemValue,
    tmpI: tmpI, tmpF: tmpF, sector: sector, pushSector: pushSector, lumi: lumi };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NetflowHierarchy;
