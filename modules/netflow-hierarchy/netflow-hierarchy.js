/* Copyright (c) 2026 LFC Foundry. MIT License. https://github.com/lfcfoundry/JS-modules */
/*
 * Version 1.12.0 (API 1)
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
  var SCR_I = [], SCR_F = [], SCR_IV = [], SCR_FV = [], SCR_MAX = 20000;   /* ...and the last view of each slot, kept: the same size comes round again and again */
  function tmpI(slot, n, v0) {
    if (n > SCR_MAX) { var a = new Int32Array(n); if (v0) a.fill(v0); return a; }
    var b = SCR_I[slot]; if (!b || b.length < n) { b = SCR_I[slot] = new Int32Array(Math.max(n, 256)); SCR_IV[slot] = null; }
    var w = SCR_IV[slot]; if (!w || w.length !== n) w = SCR_IV[slot] = b.subarray(0, n);
    w.fill(v0 || 0); return w;
  }
  function tmpF(slot, n) {
    if (n > SCR_MAX) return new Float64Array(n);
    var b = SCR_F[slot]; if (!b || b.length < n) { b = SCR_F[slot] = new Float64Array(Math.max(n, 256)); SCR_FV[slot] = null; }
    var w = SCR_FV[slot]; if (!w || w.length !== n) w = SCR_FV[slot] = b.subarray(0, n);
    w.fill(0); return w;
  }
  /* A list that is only made when someone reads it (most layouts never read the child lists, names or groups of the tree: the drawing does, later). */
  function lazy(obj, key, make) {
    var put = function (v) { Object.defineProperty(obj, key, { value: v, writable: true, configurable: true, enumerable: true }); };
    Object.defineProperty(obj, key, { configurable: true, enumerable: true, get: function () { var v = make(); put(v); return v; }, set: put });
  }
  function kidArrays(N, kidOff, kidList) {
    var kids = new Array(N);
    for (var v = 0; v < N; v++) { var a = kidOff[v], c = kidOff[v + 1] - a; if (!c) { kids[v] = EMPTY; continue; } var k = new Array(c); for (var j = 0; j < c; j++) k[j] = kidList[a + j]; kids[v] = k; }
    return kids;
  }
  var HS = null, HS_MAX = 180002;   /* the working list of hierarchy(), reused up to 20,000 items and links (720 KB held) */
  /* Small lists are cut from a shared block instead of asked for one by one (a browser takes about as long to hand out an empty list as to
     lay out three items). A block is never handed out twice, so every list still starts at zero and belongs to one layout only. */
  var SLI = null, SLIp = 0, SLF = null, SLFp = 0;
  function intList(len) { if (len > 2048) return new Int32Array(len); if (SLI === null || SLIp + len > 16384) { SLI = new Int32Array(16384); SLIp = 0; } var a = SLI.subarray(SLIp, SLIp + len); SLIp += len; return a; }
  function fltList(len) { if (len > 2048) return new Float64Array(len); if (SLF === null || SLFp + len > 16384) { SLF = new Float64Array(16384); SLFp = 0; } var a = SLF.subarray(SLFp, SLFp + len); SLFp += len; return a; }
  function hierarchy(G, o, xf) {
    /* Boxes are numbered in the order they are reached, so a parent always comes before its children and the drawing order is simply
       0..N-1. Everything is kept in a few typed lists: the children of box v are kidList[kidOff[v]] .. kidList[kidOff[v + 1] - 1], and
       the plain lists (kids, label, group, idx) are only made when they are first read. All working lists are pieces of one list S. */
    var nodes = G.nodes, n = nodes.length, pk = typeof o.parentKey === 'string' && o.parentKey ? o.parentKey : null, E = pk ? null : G.edges, ne = pk ? n : E.length, eA = pk ? null : G.eA, eB = pk ? null : G.eB, nest = o.nest, i, e, nd, a, b, w, m = 0, st = -1;
    var named = !(eA && eA.length === ne), need = 4 * n + 2 + (named ? 5 : 1) * ne, S;
    if (need > HS_MAX) S = new Int32Array(need); else { S = HS || (HS = new Int32Array(HS_MAX)); S.fill(0, 0, 3 * n + 2); }
    var OFF = n, PO = 2 * n + 2, QU = 3 * n + 2, NB = 4 * n + 2, PE = NB + ne, TB = PE + ne, NO = TB + ne;   /* S: links into each item, where each item's links start, parents, the walk's queue, link ends by start, then the name work */
    var FT = null, IA = null, szOk = true, mkIdx = function () { var M = new Map(); for (var q = 0; q < n; q++) M.set(nodes[q].id, q); return M; }, idx = null;
    var grouped = nest === 'groups', gcount = 0, groups = null, groupsOf = function () { if (!groups) { groups = new Map(); for (var q = 0; q < n; q++) { var g = nodes[q].group || ''; if (!groups.has(g)) groups.set(g, groups.size); } } return groups; };
    if (grouped) gcount = groupsOf().size;
    /* one list holds the box lists and the links (asking the browser for a list costs far more than its size at 1,000 items) */
    i = (n + 1 + gcount) * 6 + 1 + n;
    if ((nest === 'groups' || nest === 'links') && i + ne * 2 <= 2048) { IA = intList(i + ne * 2); FT = IA.subarray(i); } else FT = intList(ne * 2);
    var F = null, SZ = 0, FX = -1, mkF = function (cap) { var len = cap * 2 + n, x = (xf | 0) * cap; if (x && len + x <= 2048) { FX = len; len += x; } F = fltList(len); SZ = cap * 2; };   /* a small tree's layout numbers (xf for each box) ride at the end of the same list */   /* totals, own values, and each item's size in item order */
    if (nest === 'groups' || nest === 'links') mkF(n + 1 + gcount);
    var sk = typeof o.sizeKey === 'string' && o.sizeKey && o.sizeKey !== 'sizeV' ? o.sizeKey : null;   /* o.sizeKey: the field that holds each item's size, when it is not sizeV */
    var sizes = function () {
      var q, x;
      if (sk) { szOk = true; for (q = 0; q < n; q++) { x = nodes[q][sk]; if (typeof x !== 'number') { if (x !== undefined) szOk = false; x = NaN; } F[SZ + q] = x; } }
      else for (q = 0; q < n; q++) { x = nodes[q].sizeV; if (typeof x !== 'number') { if (x !== undefined) szOk = false; x = NaN; } F[SZ + q] = x; }
    };
    if (!named) {   /* the app gives each link's item numbers: no lookup by name */
      for (i = 0; i < ne; i++) { a = eA[i]; b = eB[i]; if (a === b) continue; FT[m] = a; FT[ne + m] = b; m++; S[b]++; S[OFF + a + 2]++; }
      for (i = 0; i < n; i++) if (nodes[i].start) { st = i; break; }
      if (F) sizes();
    } else {
      /* Names: only the names the links use go into a lookup table (the starts of links, far fewer than the items in a tree), and each item's
         name is then asked for once. The end of a link is usually the next item in the list, which one comparison settles with no lookup.
         A full table of every name is only made for a list of links in no such order. */
      var M = new Map(), P = 0, g = 0, ls = S, lp = -1, miss = 0, fs, ts, pid, tv, full = false;
      if (pk) for (i = 0; i < n; i++) {   /* each item names its parent itself (o.parentKey): no list of links to read, and the child is the item at hand */
        fs = nodes[i][pk]; S[TB + i] = i;
        if (fs === null || fs === undefined || fs === '') { S[PE + i] = -1; continue; }
        if (fs === ls) pid = lp; else { pid = M.get(fs); if (pid === undefined) { pid = P++; M.set(fs, pid); } ls = fs; lp = pid; }
        S[PE + i] = pid;
      } else
      for (i = 0; i < ne; i++) {
        e = E[i]; fs = e.from; ts = e.to;
        if (g < n && nodes[g].id === ts) { tv = g; g++; }
        else if (g + 1 < n && nodes[g + 1].id === ts) { tv = g + 1; g += 2; }
        else { if (++miss > 32 + (i >> 3)) { full = true; break; } pid = M.get(ts); if (pid === undefined) { pid = P++; M.set(ts, pid); } tv = -1 - pid; }
        if (fs === ls) pid = lp; else { pid = M.get(fs); if (pid === undefined) { pid = P++; M.set(fs, pid); } ls = fs; lp = pid; }
        S[PE + i] = pid; S[TB + i] = tv;
      }
      if (full) {
        idx = mkIdx(); ls = S;
        for (i = 0; i < ne; i++) { e = E[i]; fs = e.from; if (fs !== ls) { a = idx.get(fs); ls = fs; } b = idx.get(e.to); if (a === undefined || b === undefined || a === b) continue; FT[m] = a; FT[ne + m] = b; m++; S[b]++; S[OFF + a + 2]++; }
        for (i = 0; i < n; i++) if (nodes[i].start) { st = i; break; }
        if (F) sizes();
      } else {
        S.fill(-1, NO, NO + P);
        if (F) for (i = 0; i < n; i++) {
          nd = nodes[i]; pid = M.get(nd.id); if (pid !== undefined) S[NO + pid] = i;
          if (st < 0 && nd.start) st = i;
          w = nd.sizeV; if (typeof w !== 'number') { if (w !== undefined) szOk = false; w = NaN; } F[SZ + i] = w;
        } else for (i = 0; i < n; i++) { nd = nodes[i]; pid = M.get(nd.id); if (pid !== undefined) S[NO + pid] = i; if (st < 0 && nd.start) st = i; }
        for (i = 0; i < ne; i++) { pid = S[PE + i]; if (pid < 0) continue; a = S[NO + pid]; tv = S[TB + i]; b = tv >= 0 ? tv : S[NO - 1 - tv]; if (a < 0 || b < 0 || a === b) continue; FT[m] = a; FT[ne + m] = b; m++; S[b]++; S[OFF + a + 2]++; }
      }
    }
    if (sk && F && named && !full) sizes();   /* the pass above read sizeV along the way; the sizes are in another field */
    var mode = nest;
    if (!F) {
      var isForest = true;
      for (i = 0; i < n; i++) if (S[i] > 1) { isForest = false; break; }
      mode = isForest && m > 0 ? 'links' : (groupsOf().size >= 2 && groups.size <= Math.max(2, n / 2) ? 'groups' : 'links');
      if (mode === 'groups') { grouped = true; gcount = groups.size; }
      mkF(n + 1 + gcount); sizes();
    }
    var cap = n + 1 + gcount, N = 0, KO = cap * 4, KL = cap * 5 + 1, AT = cap * 6 + 1;
    if (!IA) IA = intList(cap * 6 + 1 + n);
    var label = null, group = null, kids = null;   /* parents, items, depths, drawing order, where each box's children start (N + 1), the children, each item's box */
    var root = 0, extra = [], v, p, k, u;
    if (grouped) {
      label = new Array(cap); group = new Array(cap); kids = new Array(cap);
      var add = function (p, lab, it, g) { var v = N++; IA[v] = p; IA[cap + v] = it; label[v] = lab; group[v] = g; kids[v] = EMPTY; if (it >= 0) IA[AT + it] = v; if (p >= 0) { IA[cap * 2 + v] = IA[cap * 2 + p] + 1; if (kids[p] === EMPTY) kids[p] = [v]; else kids[p].push(v); } else IA[cap * 2 + v] = 0; return v; };
      root = add(-1, G.name || 'All', -1, '');
      var gbox = []; groups.forEach(function (k, g) { gbox[k] = add(root, g || '(no group)', -1, g); });
      for (i = 0; i < n; i++) { var gi = nodes[i].group || ''; add(gbox[groups.get(gi)], nodes[i].label, i, gi); }
      for (i = 0; i < m; i++) extra.push(i);
      label.length = N; group.length = N; kids.length = N;
      for (v = 0, k = 0; v < N; v++) { IA[cap * 3 + v] = v; IA[KO + v] = k; var kv = kids[v]; for (i = 0; i < kv.length; i++) IA[KL + k++] = kv[i]; }
      IA[KO + N] = k;
    } else {
      var j, j1, x, qh = 0, qt = 0, T = 0, scan = 0, phase = st >= 0 ? 0 : 1, s0;
      for (i = 0; i < n; i++) S[OFF + i + 2] += S[OFF + i + 1];
      for (i = 0; i < m; i++) { a = FT[i]; S[NB + S[OFF + a + 1]++] = FT[ne + i]; }   /* now the links out of item u are NB[OFF[u]] .. NB[OFF[u + 1] - 1], in the order given */
      /* a walk out from the start, then from each item nothing leads to, then (loops nothing leads into) from the best-linked item left */
      for (;;) {
        if (phase === 0) { s0 = st; phase = 1; }
        else if (phase === 1) { while (scan < n && (S[PO + scan] !== 0 || S[scan] !== 0)) scan++; if (scan < n) s0 = scan++; else { phase = 2; continue; } }
        else { if (qt >= n) break; var bd = -1; s0 = -1; for (i = 0; i < n; i++) if (S[PO + i] === 0) { var d = S[OFF + i + 1] - S[OFF + i]; if (d > bd) { bd = d; s0 = i; } } }
        S[PO + s0] = 1; S[QU + qt++] = s0; T++;
        while (qh < qt) {
          u = S[QU + qh]; IA[KO + qh + 1] = qt - T; qh++;   /* its children will be the next boxes made: how many boxes that are not tops came before */
          for (j = S[OFF + u], j1 = S[OFF + u + 1]; j < j1; j++) { x = S[NB + j]; if (S[PO + x] !== 0) continue; S[PO + x] = u + 2; S[QU + qt++] = x; }
        }
      }
      /* one real top item is the root itself; several hang under a made-up root. Box k + sh is the k-th item reached. */
      var sh = T !== 1 ? 1 : 0, ti = 0, nt = sh ? T : 0, c2 = cap * 2, c3 = cap * 3;
      if (sh) { IA[0] = -1; IA[cap] = -1; }
      for (k = 0; k < qt; k++) {
        u = S[QU + k]; v = k + sh; IA[AT + u] = v; IA[cap + v] = u; IA[c3 + v] = v; p = S[PO + u];
        if (p === 1) { IA[v] = sh - 1; IA[c2 + v] = sh; if (sh) IA[KL + ti++] = v; }
        else { p = IA[AT + p - 2]; IA[v] = p; IA[c2 + v] = IA[c2 + p] + 1; IA[KL + nt++] = v; }
        if (sh) IA[KO + v] += T; else IA[KO + k] = IA[KO + k + 1];
      }
      N = qt + sh; IA[KO + N] = N - 1; if (sh) IA[KO] = 0;
      if (m > n - T) {   /* more links than the tree uses: list the rest. The tree's link into an item is the first one from its parent. */
        S.fill(0, 0, n);
        for (i = 0; i < m; i++) { b = FT[ne + i]; if (S[PO + b] === FT[i] + 2 && S[b] === 0) S[b] = 1; else extra.push(i); }
      }
    }
    var kidOff = IA.subarray(KO, KO + N + 1), kidList = IA.subarray(KL, KL + Math.max(0, N - 1)), item = IA.subarray(cap, cap + N);
    var H = { N: N, par: IA.subarray(0, N), kids: kids, label: label, item: item, group: group, root: root, depth: IA.subarray(cap * 2, cap * 2 + N), order: IA.subarray(cap * 3, cap * 3 + N), mode: mode, extra: extra,
      from: FT.subarray(0, m), to: FT.subarray(ne, ne + m), idx: idx, kidOff: kidOff, kidList: kidList, at: IA.subarray(AT, AT + n), F: F, cap: cap, szOk: szOk, fx: FX, sk: sk, nw: o.write === false };
    if (pk) H.pk = pk;   /* idx: null when the app gave item numbers */
    if (!kids) {
      var topName = G.name || 'All';
      if (N <= 32) {   /* a small tree: making these three lists now costs less than setting them up to be made on demand */
        H.kids = kidArrays(N, kidOff, kidList);
        var Ll = new Array(N), Lg = new Array(N), q0, it0;
        for (q0 = 0; q0 < N; q0++) { it0 = item[q0]; if (it0 >= 0) { Ll[q0] = nodes[it0].label; Lg[q0] = nodes[it0].group || ''; } else { Ll[q0] = topName; Lg[q0] = ''; } }
        H.label = Ll; H.group = Lg;
      } else {
      lazy(H, 'kids', function () { return kidArrays(N, kidOff, kidList); });
      lazy(H, 'label', function () { var L = new Array(N); for (var q = 0; q < N; q++) L[q] = item[q] >= 0 ? nodes[item[q]].label : topName; return L; });
      lazy(H, 'group', function () { var L = new Array(N); for (var q = 0; q < N; q++) L[q] = item[q] >= 0 ? nodes[item[q]].group || '' : ''; return L; });
      }
    }
    if (named && !idx) { if (n <= 8) H.idx = mkIdx(); else lazy(H, 'idx', mkIdx); }
    return H;
  }
  /** Sums: value[i] = own value (leaves, or every item when sized) + what its children hold. Children are sorted biggest first (o.sort !== false). */
  /* Sorts kl[lo..hi] biggest value first, ties by lower number: a quicksort written out here (no call back per comparison), short runs by insertion.
     Every pair has one right order, so the result is the same whatever the method. */
  function kidSort(kl, val, lo, hi) {
    while (hi - lo > 12) {
      var mid = (lo + hi) >> 1, pc = kl[mid], pv = val[pc], i = lo, j = hi, c, v, t;
      while (i <= j) {
        for (;;) { c = kl[i]; v = val[c]; if (v > pv || (v === pv && c < pc)) i++; else break; }
        for (;;) { c = kl[j]; v = val[c]; if (v < pv || (v === pv && c > pc)) j--; else break; }
        if (i <= j) { t = kl[i]; kl[i] = kl[j]; kl[j] = t; i++; j--; }
      }
      if (j - lo < hi - i) { kidSort(kl, val, lo, j); lo = i; } else { kidSort(kl, val, i, hi); hi = j; }
    }
    for (var a = lo + 1; a <= hi; a++) {
      var x = kl[a], xv = val[x], b = a - 1, d;
      while (b >= lo && (val[d = kl[b]] < xv || (val[d] === xv && d > x))) { kl[b + 1] = d; b--; }
      kl[b + 1] = x;
    }
  }
  function sums(G, H, o) {
    var N = H.N, F = H.F, cap = H.cap, val = F.subarray(0, N), own = F.subarray(cap, cap + N), SZ = cap * 2, szOk = H.szOk, sized = !!o.sized, v, j, kidOff = H.kidOff, kidList = H.kidList, item = H.item, nodes = G.nodes, a, b, it, w, s;
    for (v = N - 1; v >= 0; v--) {
      s = 0; a = kidOff[v]; b = kidOff[v + 1]; w = 0;
      for (j = a; j < b; j++) s += val[kidList[j]];
      it = item[v];
      if (it >= 0 && (sized || a === b)) {
        if (szOk) { w = F[SZ + it]; if (!(w > 0)) w = 1; s += w; }
        else { w = H.sk ? nodes[it][H.sk] : nodes[it].sizeV; if (!(w === w && w > 0)) w = 1; s = s + w; }   /* a size that is not a plain number: read as before */
      }
      own[v] = w; val[v] = s;
    }
    if (o.sort !== false) {   /* biggest first; two children (the most common case) are just swapped, short lists are sorted in place, longer lists share one comparison */
      var moved = false;
      for (v = 0; v < N; v++) {
        a = kidOff[v]; var L = kidOff[v + 1] - a; if (L < 2) continue;
        if (L === 2) { var k0 = kidList[a], k1 = kidList[a + 1]; if (val[k1] > val[k0] || (val[k1] === val[k0] && k1 < k0)) { kidList[a] = k1; kidList[a + 1] = k0; moved = true; } }
        else { kidSort(kidList, val, a, a + L - 1); moved = true; }
      }
      if (moved && Object.getOwnPropertyDescriptor(H, 'kids').get === undefined) H.kids = kidArrays(N, kidOff, kidList);   /* plain lists that were already made follow the new order */
    }
    H.ownV = own;
    H.own = function (v) { return H.item[v] >= 0 && (sized || !H.kids[v].length) ? (H.sk ? itemValue({ sizeV: G.nodes[H.item[v]][H.sk] }) : itemValue(G.nodes[H.item[v]])) : 0; };
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
    if (o.parentKey && typeof o.parentKey === 'string') { var TP = tinyView(G, o, o.parentKey, 'treemap'); if (TP) return TP; }
    var H = hierarchy(G, o, 4), val = sums(G, H, o), N = H.N, R = H.fx >= 0 ? H.F.subarray(H.fx, H.fx + N * 4) : new Float64Array(N * 4);
    var total = val[H.root] || 1, side = Math.max(600, Math.min(4000, Math.sqrt(H.N) * 70)), W = side * 1.5, Ht = side;
    if (o.width > 0 && o.height > 0) { W = Math.max(160, o.width - 60); Ht = Math.max(120, o.height - 60); }   /* width and height given (since 1.5.0): lay the boxes out at that size; the picture keeps its 30-unit margin, so the SVG is exactly that size */
    R[H.root * 4] = 0; R[H.root * 4 + 1] = 0; R[H.root * 4 + 2] = W; R[H.root * 4 + 3] = Ht;
    var head = function (v) { return H.kids[v].length && (H.item[v] >= 0 || v !== H.root) && R[v * 4 + 3] - R[v * 4 + 1] > 60 && R[v * 4 + 2] - R[v * 4] > 40 ? 18 : 0; };   /* a box that holds others (a real item or a group box, not the top) keeps a strip for its name, so it never sits on its first tile's name */
    for (var i = 0; i < H.order.length; i++) {
      var v = H.order[i]; if (!H.kids[v].length) continue;
      var p = H.depth[v] ? 3 : 0, x0 = R[v * 4] + p, y0 = R[v * 4 + 1] + p + head(v), x1 = R[v * 4 + 2] - p, y1 = R[v * 4 + 3] - p;
      if (x1 < x0) x1 = x0; if (y1 < y0) y1 = y0;
      squarify(H, val, v, x0, y0, x1, y1, R);
    }
    return nestedOut('treemap', G, H, val, { R: R, W: W, H: Ht, total: total });
  }
  /** Partition: depth across, value along (icicle), or the same in rings (sunburst). */
  /* Tiny icicle and sunburst (items that name their own parent, up to TINY items): the whole layout in one function with plain lists. It shares
     nothing with the general path on purpose: plain lists flowing through the code that also lays out big trees made that code slower for seconds
     afterwards, in every browser (the browser had seen two kinds of list there). It gives the same result as the general path (the tests compare
     them) and hands the work back (returns null) for an item marked as the start, a loop, group nesting, or 'auto' with no link at all. */
  var TINY = 24;
  /* the treemap's rows for the tiny path: squarify() on plain lists */
  function tinySquarify(k, val, own, x0, y0, x1, y1, R) {
    var total = 0, i, kl = k.length; if (!kl) return;
    for (i = 0; i < kl; i++) total += val[k[i]];
    total += own; if (!(total > 0)) return;
    var W = x1 - x0, Ht = y1 - y0, area = W * Ht / total, at = 0;
    while (at < kl) {
      var side = Math.min(x1 - x0, y1 - y0); if (side <= 0) side = 1e-9;
      var rowSum = 0, minV = Infinity, maxV = 0, worst = Infinity, end = at;
      for (; end < kl; end++) {
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
  function zeros(n, v0) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = v0 || 0; return a; }
  /* the tree view for the tiny path: tree() and buchheim() on plain lists (boxes are numbered parents first) */
  function tinyTree(N, kids, par, depth, item, shape) {
    var X = zeros(N), Y = zeros(N), maxD = 0, i, skipRoot = item[0] < 0 ? 1 : 0, v, k, j;
    for (i = 0; i < N; i++) if (depth[i] > maxD) maxD = depth[i];
    if (shape === 'indented') {
      var row = 0, stack = [0];
      while (stack.length) { v = stack.pop(); if (!(skipRoot && v === 0)) { X[v] = (depth[v] - skipRoot) * 26; Y[v] = row++ * 26; } k = kids[v]; for (j = k.length - 1; j >= 0; j--) stack.push(k[j]); }
      return { X: X, Y: Y, shape: shape, W: (maxD + 1) * 26 + 360, H: row * 26 + 40, skipRoot: skipRoot };
    }
    var cluster = shape === 'cluster' || shape === 'radialCluster', B = zeros(N);
    if (cluster) {
      var leaf = 0, dfs = [0], post = [], w2, kk, q, seen = [0], vis = [], s, ks, p2, kp;
      while (dfs.length) { w2 = dfs.pop(); post.push(w2); kk = kids[w2]; for (q = 0; q < kk.length; q++) dfs.push(kk[q]); }
      while (seen.length) { s = seen.pop(); vis.push(s); ks = kids[s]; for (q = ks.length - 1; q >= 0; q--) seen.push(ks[q]); }
      for (q = 0; q < vis.length; q++) if (!kids[vis[q]].length) B[vis[q]] = leaf++;
      for (i = post.length - 1; i >= 0; i--) { p2 = post[i]; kp = kids[p2]; if (kp.length) B[p2] = (B[kp[0]] + B[kp[kp.length - 1]]) / 2; }
    } else tinyBuch(N, kids, par, B);
    var minB = Infinity, maxB = -Infinity;
    for (i = 0; i < N; i++) { if (skipRoot && i === 0) continue; if (B[i] < minB) minB = B[i]; if (B[i] > maxB) maxB = B[i]; }
    if (!isFinite(minB)) { minB = 0; maxB = 0; }
    var levels = maxD + 1 - skipRoot;
    if (shape === 'radial' || shape === 'radialCluster') {
      var count = maxB - minB + 1, Rad = Math.max(220, Math.min(3000, count * 16 / TAU, levels * 120 + 60)), cx = Rad + 200;
      if (count * 16 / TAU > Rad) Rad = Math.min(4000, count * 16 / TAU);
      cx = Rad + 200;
      for (i = 0; i < N; i++) {
        var an = (B[i] - minB) / Math.max(1, count) * TAU - Math.PI / 2, rr = cluster && !kids[i].length ? Rad : (depth[i] - skipRoot) / Math.max(1, levels - 1) * Rad;
        if (skipRoot && i === 0) rr = 0;
        X[i] = cx + Math.cos(an) * rr; Y[i] = cx + Math.sin(an) * rr;
      }
      return { X: X, Y: Y, shape: shape, cx: cx, cy: cx, W: cx * 2, H: cx * 2, skipRoot: skipRoot, minB: minB, count: count };
    }
    var dx = 180, dy = 26;
    for (i = 0; i < N; i++) { X[i] = (cluster && !kids[i].length ? levels - 1 : depth[i] - skipRoot) * dx + 20; Y[i] = (B[i] - minB) * dy + 20; }
    return { X: X, Y: Y, shape: shape, W: levels * dx + 300, H: (maxB - minB + 1) * dy + 40, skipRoot: skipRoot };
  }
  function tinyBuch(N, kids, par, B) {
    var prelim = zeros(N), mod = zeros(N), shift = zeros(N), change = zeros(N), thread = zeros(N, -1), ancestor = zeros(N), number = zeros(N), mid = zeros(N), acc = zeros(N);
    var fk = zeros(N, -1), lk = zeros(N, -1), ls = zeros(N, -1), lm = zeros(N, -1), i, j, k, L, c0;
    for (i = 0; i < N; i++) { ancestor[i] = i; k = kids[i]; L = k.length; if (!L) continue; fk[i] = k[0]; lk[i] = k[L - 1]; for (j = 0; j < L; j++) { c0 = k[j]; number[c0] = j; lm[c0] = k[0]; if (j) ls[c0] = k[j - 1]; } }
    /* apportion(), with nextLeft, nextRight, ancestorOf and moveSubtree written out where they are used */
    var apportion = function (v, def) {
      var w = ls[v]; if (w < 0) return def;
      var vip = v, vop = v, vim = w, vom = lm[v], sip = mod[vip], sop = mod[vop], sim = mod[vim], som = mod[vom], nr, nl, s, sub, a, wm;
      for (;;) {
        nr = lk[vim]; if (!(nr >= 0)) nr = thread[vim]; if (!(nr >= 0)) break;
        nl = fk[vip]; if (!(nl >= 0)) nl = thread[vip]; if (!(nl >= 0)) break;
        vim = nr; vip = nl;
        nl = fk[vom]; vom = nl >= 0 ? nl : thread[vom];
        nr = lk[vop]; vop = nr >= 0 ? nr : thread[vop];
        ancestor[vop] = v;
        s = (prelim[vim] + sim) - (prelim[vip] + sip) + 1;
        if (s > 0) {
          a = ancestor[vim]; wm = par[a] === par[v] && par[v] >= 0 ? a : def;
          sub = number[v] - number[wm]; if (sub <= 0) sub = 1;
          change[v] -= s / sub; shift[v] += s; change[wm] += s / sub; prelim[v] += s; mod[v] += s;
          sip += s; sop += s;
        }
        sim += mod[vim]; sip += mod[vip]; som += mod[vom]; sop += mod[vop];
      }
      nr = lk[vim]; if (!(nr >= 0)) nr = thread[vim];
      nl = lk[vop]; if (!(nl >= 0)) nl = thread[vop];
      if (nr >= 0 && !(nl >= 0)) { thread[vop] = nr; mod[vop] += sim - sop; }
      nr = fk[vip]; if (!(nr >= 0)) nr = thread[vip];
      nl = fk[vom]; if (!(nl >= 0)) nl = thread[vom];
      if (nr >= 0 && !(nl >= 0)) { thread[vom] = nr; mod[vom] += sip - som; def = v; }
      return def;
    };
    var k2, def, q2, c, w2, sh, ch, q, w;
    for (i = N - 1; i >= 0; i--) {
      k2 = kids[i]; if (!k2.length) continue;
      def = k2[0];
      for (q2 = 0; q2 < k2.length; q2++) {
        c = k2[q2]; w2 = q2 ? k2[q2 - 1] : -1;
        if (w2 >= 0) { prelim[c] = prelim[w2] + 1; if (kids[c].length) mod[c] = prelim[c] - mid[c]; }
        else prelim[c] = kids[c].length ? mid[c] : 0;
        def = apportion(c, def);
      }
      sh = 0; ch = 0;   /* executeShifts */
      for (q = k2.length - 1; q >= 0; q--) { w = k2[q]; prelim[w] += sh; mod[w] += sh; ch += change[w]; sh += shift[w] + ch; }
      mid[i] = (prelim[k2[0]] + prelim[k2[k2.length - 1]]) / 2;
    }
    prelim[0] = kids[0].length ? mid[0] : 0; B[0] = prelim[0];
    for (i = 0; i < N; i++) { if (par[i] >= 0) { acc[i] = acc[par[i]] + mod[par[i]]; B[i] = prelim[i] + acc[i]; } else { acc[i] = 0; B[i] = prelim[i]; } }
  }
  function tinyView(G, o, pk, view) {
    var nodes = G.nodes, n = nodes.length, nest = o.nest, radial = view === 'sunburst', treeV = view === 'tree';
    if (n < 1 || n > TINY || o._general || nest === 'groups') return null;
    var sk = typeof o.sizeKey === 'string' && o.sizeKey && o.sizeKey !== 'sizeV' ? o.sizeKey : null;
    var M = new Map(), sz = new Array(n), szOk = true, i, nd, x, p, a, par = new Array(n), kc = new Array(n), from = [], to = [];
    for (i = 0; i < n; i++) {
      nd = nodes[i]; if (nd.start) return null;
      M.set(nd.id, i); kc[i] = null;
      x = sk ? nd[sk] : nd.sizeV; if (typeof x !== 'number') { if (x !== undefined) szOk = false; x = NaN; } sz[i] = x;
    }
    for (i = 0; i < n; i++) {
      p = nodes[i][pk]; par[i] = -1;
      if (p === null || p === undefined || p === '') continue;
      a = M.get(p); if (a === undefined || a === i) continue;
      par[i] = a; from.push(a); to.push(i);
      if (kc[a] === null) kc[a] = [i]; else kc[a].push(i);
    }
    if (nest !== 'links' && from.length === 0) return null;
    var Q = new Array(n), qt = 0, qh = 0, tops = [], u, k, j, v, t;
    for (i = 0; i < n; i++) {
      if (par[i] >= 0) continue;
      tops.push(i); Q[qt++] = i;
      while (qh < qt) { u = Q[qh++]; k = kc[u]; if (k !== null) for (j = 0; j < k.length; j++) Q[qt++] = k[j]; }
    }
    if (qt < n) return null;
    var sh = tops.length !== 1 ? 1 : 0, N = n + sh, bpar = new Array(N), bitem = new Array(N), bdep = new Array(N), bord = new Array(N), at = new Array(n);
    var lab = new Array(N), grp = new Array(N), topName = G.name || 'All';
    if (sh) { bpar[0] = -1; bitem[0] = -1; bdep[0] = 0; bord[0] = 0; lab[0] = topName; grp[0] = ''; }
    for (k = 0; k < n; k++) {
      u = Q[k]; v = k + sh; at[u] = v; bitem[v] = u; bord[v] = v; nd = nodes[u]; lab[v] = nd.label; grp[v] = nd.group || '';
      p = par[u];
      if (p < 0) { bpar[v] = sh - 1; bdep[v] = sh; } else { p = at[p]; bpar[v] = p; bdep[v] = bdep[p] + 1; }
    }
    var kO = new Array(N + 1), kL = new Array(N > 0 ? N - 1 : 0), nk = 0;
    for (v = 0; v < N; v++) {
      kO[v] = nk;
      if (sh && v === 0) { for (j = 0; j < tops.length; j++) kL[nk++] = at[tops[j]]; continue; }
      k = kc[bitem[v]];
      if (k !== null) for (j = 0; j < k.length; j++) kL[nk++] = at[k[j]];
    }
    kO[N] = nk;
    /* totals, as sums() does them */
    if (view === 'treemap' && !szOk) return null;   /* a size that is not a plain number: the general path reads it as before */
    var val = new Array(N), own = new Array(N), sized = !!o.sized, s, w, b;
    if (!treeV) for (v = N - 1; v >= 0; v--) {
      s = 0; a = kO[v]; b = kO[v + 1]; w = 0;
      for (j = a; j < b; j++) s += val[kL[j]];
      i = bitem[v];
      if (i >= 0 && (sized || a === b)) {
        if (szOk) { w = sz[i]; if (!(w > 0)) w = 1; s += w; }
        else { w = sk ? nodes[i][sk] : nodes[i].sizeV; if (!(w === w && w > 0)) w = 1; s = s + w; }
      }
      own[v] = +w; val[v] = +s;
    }
    if (o.sort !== false && !treeV) {   /* biggest first, ties by lower number: an insertion sort per list (the tree view does not sort) */
      for (v = 0; v < N; v++) {
        a = kO[v]; b = kO[v + 1];
        for (j = a + 1; j < b; j++) { t = kL[j]; k = j - 1; while (k >= a && (val[kL[k]] < val[t] || (val[kL[k]] === val[t] && kL[k] > t))) { kL[k + 1] = kL[k]; k--; } kL[k + 1] = t; }
      }
    }
    var kb = new Array(N);
    for (v = 0; v < N; v++) { a = kO[v]; b = kO[v + 1]; if (a === b) kb[v] = EMPTY; else { k = new Array(b - a); for (j = a; j < b; j++) k[j - a] = kL[j]; kb[v] = k; } }
    var R, maxD = 0, geo, type = view, outNodes = nodes.slice(), at2 = at;
    if (view === 'icicle' || radial) {
      /* places, as partition() does them */
      var skipRoot = bitem[0] < 0 ? 1 : 0, v4, d, span, tt, cur, c, ww;
      R = new Array(N * 4); for (i = 0; i < N * 4; i++) R[i] = 0;
      R[1] = 0; R[3] = 1;
      for (v = 0; v < N; v++) {
        v4 = v * 4; a = R[v4 + 1]; d = bdep[v]; j = kO[v]; b = kO[v + 1];
        if (d > maxD) maxD = d;
        R[v4] = d - skipRoot; R[v4 + 2] = d - skipRoot + 1;
        if (j === b) continue;
        span = R[v4 + 3] - a; tt = val[v] || 1; cur = a + (own[v] > 0 ? span * own[v] / tt : 0);
        for (; j < b; j++) { c = kL[j]; ww = span * val[c] / tt; R[c * 4 + 1] = cur; R[c * 4 + 3] = cur + ww; cur += ww; }
      }
      var levels = maxD + 1 - skipRoot;
      if (radial) {
        var Rad = Math.max(260, Math.min(2200, 120 + Math.sqrt(N) * 26)), ring = Rad / Math.max(1, levels + 0.4);
        geo = { R: R, W: Rad * 2 + 340, H: Rad * 2 + 340, cx: Rad + 170, cy: Rad + 170, ring: ring, hole: ring * 0.4, skipRoot: skipRoot, levels: levels };
      } else {
        var colW = 200, Hh = Math.max(500, Math.min(30000, N * 22));
        geo = { R: R, W: Math.max(1, levels) * colW, H: Hh, colW: colW, skipRoot: skipRoot, levels: levels };
      }
    } else if (view === 'treemap') {
      var side = Math.max(600, Math.min(4000, Math.sqrt(N) * 70)), W = side * 1.5, Ht = side;
      if (o.width > 0 && o.height > 0) { W = Math.max(160, o.width - 60); Ht = Math.max(120, o.height - 60); }
      R = new Array(N * 4); for (i = 0; i < N * 4; i++) R[i] = 0;
      R[2] = W; R[3] = Ht;
      for (v = 0; v < N; v++) {
        if (kb[v].length === 0) continue;
        var hd = (bitem[v] >= 0 || v !== 0) && R[v * 4 + 3] - R[v * 4 + 1] > 60 && R[v * 4 + 2] - R[v * 4] > 40 ? 18 : 0, pd = bdep[v] ? 3 : 0;
        var tx0 = R[v * 4] + pd, ty0 = R[v * 4 + 1] + pd + hd, tx1 = R[v * 4 + 2] - pd, ty1 = R[v * 4 + 3] - pd;
        if (tx1 < tx0) tx1 = tx0; if (ty1 < ty0) ty1 = ty0;
        tinySquarify(kb[v], val, own[v], tx0, ty0, tx1, ty1, R);
      }
      geo = { R: R, W: W, H: Ht, total: val[0] || 1 };
    } else if (view === 'pack') {
      var padR = 3, PR = new Array(N), SX = new Array(N), SY = new Array(N), T0 = { x: 0, y: 0, r: 0 }, T1 = { x: 0, y: 0, r: 0 }, T2 = { x: 0, y: 0, r: 0 }, L3 = [T2, T1, T0], ra, rb, ow, n2, cs;
      for (i = 0; i < N; i++) { PR[i] = 0; SX[i] = 0; SY[i] = 0; }
      for (v = N - 1; v >= 0; v--) {
        j = kO[v]; b = kO[v + 1]; n2 = b - j; ow = own[v];
        if (!n2) { PR[v] = Math.sqrt(val[v] || 1) * 10; continue; }
        if (!(ow > 0) && n2 < 3) {
          if (n2 === 1) { PR[v] = PR[kL[j]] + padR + padR; continue; }
          ra = PR[kL[j]] + padR; rb = PR[kL[j + 1]] + padR;
          SX[kL[j]] = -rb; SX[kL[j + 1]] = ra; PR[v] = ra + rb + padR; continue;
        }
        if (n2 === 2) {
          T0.x = 0; T0.y = 0; T0.r = PR[kL[j]] + padR; T1.x = 0; T1.y = 0; T1.r = PR[kL[j + 1]] + padR; T2.x = 0; T2.y = 0; T2.r = Math.sqrt(ow) * 10 + padR;
          T0.x = -T1.r; T1.x = T0.r; place(T1, T0, T2); en_core(L3, 3);
          c = kL[j]; SX[c] = T0.x - EN[0]; SY[c] = T0.y - EN[1]; c = kL[j + 1]; SX[c] = T1.x - EN[0]; SY[c] = T1.y - EN[1];
          PR[v] = EN[2] + padR; continue;
        }
        cs = new Array(n2);
        for (k = 0; k < n2; k++) cs[k] = { x: 0, y: 0, r: PR[kL[j + k]] + padR };
        if (ow > 0) cs.push({ x: 0, y: 0, r: Math.sqrt(ow) * 10 + padR });
        PR[v] = packSiblings(cs) + padR;
        for (k = 0; k < n2; k++) { c = kL[j + k]; SX[c] = cs[k].x; SY[c] = cs[k].y; }
      }
      var want = Math.max(300, Math.min(3000, Math.sqrt(N) * 40)), scale = PR[0] > 0 ? want / PR[0] : 1, PX = new Array(N), PY = new Array(N), PRr = new Array(N);
      for (i = 0; i < N; i++) { PX[i] = 0; PY[i] = 0; PRr[i] = 0; }
      PX[0] = want + 40; PY[0] = want + 40; PRr[0] = want;
      for (u = 0; u < N; u++) for (j = kO[u], b = kO[u + 1]; j < b; j++) { c = kL[j]; PX[c] = PX[u] + SX[c] * scale; PY[c] = PY[u] + SY[c] * scale; PRr[c] = (PR[c] + padR - padR) * scale; }
      geo = { X: PX, Y: PY, Rr: PRr, W: want * 2 + 80, H: want * 2 + 80 };
    } else {
      geo = tinyTree(N, kb, bpar, bdep, bitem, o.treeShape || 'tidy');
    }
    if (o.write === false) { geo.at = at; geo.placed = false; }
    else {   /* each item's place, written onto the item */
      var xa, xb, ya, yb, x0, y0, x1, y1, an, rr, nd2, bx, rq = view === 'treemap' || view === 'icicle' || radial ? geo.R : null;
      for (i = 0; i < n; i++) {
        nd2 = outNodes[i]; bx = at[i];
        if (view === 'icicle') {
          xa = rq[bx * 4] * geo.colW; xb = rq[bx * 4 + 2] * geo.colW; ya = rq[bx * 4 + 1] * geo.H; yb = rq[bx * 4 + 3] * geo.H;
          nd2.x = xa; nd2.y = ya; nd2.w = Math.max(0, xb - xa); nd2.h = Math.max(0, yb - ya); nd2.cx = (xa + xb) / 2; nd2.cy = (ya + yb) / 2; nd2.hv = bx; continue;
        }
        if (radial) { an = (rq[bx * 4 + 1] + rq[bx * 4 + 3]) / 2 * TAU - Math.PI / 2; rr = geo.hole + (rq[bx * 4] + 0.5) * geo.ring; nd2.cx = geo.cx + Math.cos(an) * rr; nd2.cy = geo.cy + Math.sin(an) * rr; x0 = nd2.cx - 5; x1 = nd2.cx + 5; y0 = nd2.cy - 5; y1 = nd2.cy + 5; }
        else if (view === 'treemap') { x0 = rq[bx * 4]; y0 = rq[bx * 4 + 1]; x1 = rq[bx * 4 + 2]; y1 = rq[bx * 4 + 3]; }
        else if (view === 'pack') { rr = geo.Rr[bx]; x0 = geo.X[bx] - rr; x1 = geo.X[bx] + rr; y0 = geo.Y[bx] - rr; y1 = geo.Y[bx] + rr; }
        else { x0 = geo.X[bx] - 5; x1 = geo.X[bx] + 5; y0 = geo.Y[bx] - 5; y1 = geo.Y[bx] + 5; }
        nd2.x = x0; nd2.y = y0; nd2.w = Math.max(0, x1 - x0); nd2.h = Math.max(0, y1 - y0); nd2.cx = (x0 + x1) / 2; nd2.cy = (y0 + y1) / 2; nd2.hv = bx;
      }
    }
    geo.type = type; geo.val = treeV ? NOVAL : val; geo.N = N; geo.par = bpar; geo.kids = kb; geo.depth = bdep; geo.item = bitem; geo.label = lab; geo.group = grp; geo.root = 0; geo.order = bord; geo.mode = 'links';
    geo.extra = 0; geo.tree = { from: from, to: to, extraList: [] };
    var es = [];
    for (i = 0; i < n; i++) { p = nodes[i][pk]; if (p !== null && p !== undefined && p !== '') es.push({ from: p, to: nodes[i].id }); }
    return { kind: type, dir: 'none', nodes: outNodes, edges: es, chart: geo, width: geo.W, height: geo.H };
  }
  function partition(G, o, radial) {
    if (o.parentKey && typeof o.parentKey === 'string') { var TP = tinyView(G, o, o.parentKey, radial ? 'sunburst' : 'icicle'); if (TP) return TP; }
    var H = hierarchy(G, o, 4), val = sums(G, H, o), N = H.N, R = H.fx >= 0 ? H.F.subarray(H.fx, H.fx + N * 4) : new Float64Array(N * 4), maxD = 0, v, own = H.ownV, kidOff = H.kidOff, kidList = H.kidList, depth = H.depth;
    var skipRoot = H.item[H.root] < 0 ? 1 : 0;
    R[H.root * 4 + 1] = 0; R[H.root * 4 + 3] = 1;
    for (v = 0; v < N; v++) {   /* a parent always comes before its children */
      var v4 = v * 4, a = R[v4 + 1], d = depth[v], j = kidOff[v], j1 = kidOff[v + 1];
      if (d > maxD) maxD = d;
      R[v4] = d - skipRoot; R[v4 + 2] = d - skipRoot + 1;
      if (j === j1) continue;
      var span = R[v4 + 3] - a, t = val[v] || 1, at = a + (own[v] > 0 ? span * own[v] / t : 0);   /* an item that holds something itself keeps that much of its own slice, first */
      for (; j < j1; j++) { var c = kidList[j], w = span * val[c] / t; R[c * 4 + 1] = at; R[c * 4 + 3] = at + w; at += w; }
    }
    var levels = maxD + 1 - skipRoot;
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
  function ps_score(nd) { var p = nd.c, q = nd.next.c, ab = p.r + q.r, dx = (p.x * q.r + q.x * p.r) / ab, dy = (p.y * q.r + q.y * p.r) / ab; return dx * dx + dy * dy; }
  function packSiblings(cs) {
    var n = cs.length; if (!n) return 0;
    var a = cs[0]; a.x = 0; a.y = 0; if (n === 1) return a.r;
    var b = cs[1]; a.x = -b.r; b.x = a.r; b.y = 0; if (n === 2) return a.r + b.r;
    var c = cs[2], i; place(b, a, c);
    if (n > 3) {
    /* the front chain as a ring of links */
    var A = { c: a }, B = { c: b }, C = { c: c }; A.next = C.prev = B; B.next = A.prev = C; C.next = B.prev = A;
    pack: for (i = 3; i < n; i++) {
      c = cs[i]; place(A.c, B.c, c); C = { c: c };
      var j = B.next, k = A.prev, sj = B.c.r, sk = A.c.r;
      do {
        if (sj <= sk) { if (overlaps(j.c, C.c)) { B = j; A.next = B; B.prev = A; --i; continue pack; } sj += j.c.r; j = j.next; }
        else { if (overlaps(k.c, C.c)) { A = k; A.next = B; B.prev = A; --i; continue pack; } sk += k.c.r; k = k.prev; }
      } while (j !== k.next);
      C.prev = A; C.next = B; A.next = B.prev = B = C;
      var aa = ps_score(A), bb; while ((C = C.next) !== B) { if ((bb = ps_score(C)) < aa) { A = C; aa = bb; } } B = A.next;
    }
    }
    var e = enclose(cs);
    for (i = 0; i < n; i++) { cs[i].x -= e.x; cs[i].y -= e.y; }
    return e.r;
  }
  /* the smallest enclosing circle: its helpers are made once and pass circles as plain numbers (EN holds the last one worked out), so nothing is created along the way */
  var EN = new Float64Array(3);
  function en_inside(ax, ay, ar, b) { var dr = ar - b.r + Math.max(ar, b.r, 1) * 1e-9, dx = b.x - ax, dy = b.y - ay; return dr >= 0 && dr * dr >= dx * dx + dy * dy; }
  function en_not(ax, ay, ar, b) { var dr = ar - b.r, dx = b.x - ax, dy = b.y - ay; return dr < 0 || dr * dr < dx * dx + dy * dy; }
  function en_all(ax, ay, ar, nb, b0, b1, b2) { return !(nb > 0 && !en_inside(ax, ay, ar, b0)) && !(nb > 1 && !en_inside(ax, ay, ar, b1)) && !(nb > 2 && !en_inside(ax, ay, ar, b2)); }
  function en_c2(a, b) { var x1 = a.x, y1 = a.y, r1 = a.r, x21 = b.x - x1, y21 = b.y - y1, r21 = b.r - r1, l = Math.sqrt(x21 * x21 + y21 * y21) || 1e-12; EN[0] = (x1 + b.x + x21 / l * r21) / 2; EN[1] = (y1 + b.y + y21 / l * r21) / 2; EN[2] = (l + r1 + b.r) / 2; }
  function en_c3(a, b, c) {
    var x1 = a.x, y1 = a.y, r1 = a.r, x2 = b.x, y2 = b.y, r2 = b.r, x3 = c.x, y3 = c.y, r3 = c.r;
    var a2 = x1 - x2, a3 = x1 - x3, b2 = y1 - y2, b3 = y1 - y3, c2_ = r2 - r1, c3_ = r3 - r1, d1 = x1 * x1 + y1 * y1 - r1 * r1, d2 = d1 - x2 * x2 - y2 * y2 + r2 * r2, d3 = d1 - x3 * x3 - y3 * y3 + r3 * r3;
    var ab = a3 * b2 - a2 * b3; if (!ab) { en_c2(a, c); return; }
    var xa = (b2 * d3 - b3 * d2) / (ab * 2) - x1, xb = (b3 * c2_ - b2 * c3_) / ab, ya = (a3 * d2 - a2 * d3) / (ab * 2) - y1, yb = (a2 * c3_ - a3 * c2_) / ab;
    var A = xb * xb + yb * yb - 1, Bq = 2 * (r1 + xa * xb + ya * yb), Cq = xa * xa + ya * ya - r1 * r1, r = -(Math.abs(A) > 1e-6 ? (Bq + Math.sqrt(Math.max(0, Bq * Bq - 4 * A * Cq))) / (2 * A) : Cq / Bq);
    EN[0] = x1 + xa + xb * r; EN[1] = y1 + ya + yb * r; EN[2] = r;
  }
  function enclose(cs) {
    var L = cs.slice(), i, n = L.length, seed = 1;
    for (i = n - 1; i > 0; i--) { seed = (seed * 1664525 + 1013904223) >>> 0; var j = seed % (i + 1), t = L[i]; L[i] = L[j]; L[j] = t; }   /* shuffled with a fixed seed: the same picture every time */
    en_core(L, n);
    return { x: EN[0], y: EN[1], r: EN[2] };
  }
  /* the circle around the first n of L, in that order, left in EN */
  function en_core(L, n) {
    var i = 0, b0 = null, b1 = null, b2 = null, nb = 0, has = false, ex = 0, ey = 0, er = 0, q, r, Bq, Br, found;
    while (i < n) {
      var p = L[i];
      if (has && en_inside(ex, ey, er, p)) { ++i; continue; }
      /* the new edge set: p alone, p with one old edge circle, or p with two */
      if (en_all(p.x, p.y, p.r, nb, b0, b1, b2)) { b0 = p; nb = 1; }
      else {
        found = false;
        for (q = 0; q < nb && !found; q++) {
          Bq = q === 0 ? b0 : q === 1 ? b1 : b2;
          if (en_not(p.x, p.y, p.r, Bq)) { en_c2(Bq, p); if (en_all(EN[0], EN[1], EN[2], nb, b0, b1, b2)) { b0 = Bq; b1 = p; nb = 2; found = true; } }
        }
        for (q = 0; q < nb - 1 && !found; q++) for (r = q + 1; r < nb && !found; r++) {
          Bq = q === 0 ? b0 : b1; Br = r === 1 ? b1 : b2;
          en_c2(Bq, Br); if (!en_not(EN[0], EN[1], EN[2], p)) continue;
          en_c2(Bq, p); if (!en_not(EN[0], EN[1], EN[2], Br)) continue;
          en_c2(Br, p); if (!en_not(EN[0], EN[1], EN[2], Bq)) continue;
          en_c3(Bq, Br, p); if (en_all(EN[0], EN[1], EN[2], nb, b0, b1, b2)) { b0 = Bq; b1 = Br; b2 = p; nb = 3; found = true; }
        }
        if (!found) { b0 = p; nb = 1; }
      }
      if (nb === 1) { ex = b0.x; ey = b0.y; er = b0.r; }
      else { if (nb === 2) en_c2(b0, b1); else en_c3(b0, b1, b2); ex = EN[0]; ey = EN[1]; er = EN[2]; }
      has = true; i = 0;
    }
    EN[0] = ex; EN[1] = ey; EN[2] = er;
  }
  function pack(G, o) {
    if (o.parentKey && typeof o.parentKey === 'string') { var TP = tinyView(G, o, o.parentKey, 'pack'); if (TP) return TP; }
    var H = hierarchy(G, o), val = sums(G, H, o), N = H.N, i, j, c, padR = 3, order = H.order, kidOff = H.kidOff, kidList = H.kidList, own = H.ownV;
    /* each box's own circle size and its place inside its parent, in plain number lists; one or two children need no packing at all */
    var PR = fltList(N), SX = fltList(N), SY = fltList(N), T0 = { x: 0, y: 0, r: 0 }, T1 = { x: 0, y: 0, r: 0 }, T2 = { x: 0, y: 0, r: 0 }, L3 = [T2, T1, T0];   /* the order the fixed shuffle gives three circles */
    for (i = order.length - 1; i >= 0; i--) {
      var v = order[i], j0 = kidOff[v], j1 = kidOff[v + 1], n = j1 - j0, ow = own[v];
      if (!n) { PR[v] = Math.sqrt(val[v] || 1) * 10; continue; }
      if (!(ow > 0) && n < 3) {
        if (n === 1) { PR[v] = PR[kidList[j0]] + padR + padR; continue; }
        var ra = PR[kidList[j0]] + padR, rb = PR[kidList[j0 + 1]] + padR;
        SX[kidList[j0]] = -rb; SX[kidList[j0 + 1]] = ra; PR[v] = ra + rb + padR; continue;
      }
      if (n === 2) {   /* two children and the item's own circle: the same sums as the general case below, on three circles kept for the whole run */
        T0.x = 0; T0.y = 0; T0.r = PR[kidList[j0]] + padR; T1.x = 0; T1.y = 0; T1.r = PR[kidList[j0 + 1]] + padR; T2.x = 0; T2.y = 0; T2.r = Math.sqrt(ow) * 10 + padR;
        T0.x = -T1.r; T1.x = T0.r; place(T1, T0, T2); en_core(L3, 3);
        c = kidList[j0]; SX[c] = T0.x - EN[0]; SY[c] = T0.y - EN[1]; c = kidList[j0 + 1]; SX[c] = T1.x - EN[0]; SY[c] = T1.y - EN[1];
        PR[v] = EN[2] + padR; continue;
      }
      var cs = new Array(n);
      for (j = 0; j < n; j++) cs[j] = { x: 0, y: 0, r: PR[kidList[j0 + j]] + padR };
      if (ow > 0) cs.push({ x: 0, y: 0, r: Math.sqrt(ow) * 10 + padR });   /* what the item holds itself: a circle of its own inside */
      PR[v] = packSiblings(cs) + padR;
      for (j = 0; j < n; j++) { c = kidList[j0 + j]; SX[c] = cs[j].x; SY[c] = cs[j].y; }
    }
    var root = H.root, want = Math.max(300, Math.min(3000, Math.sqrt(N) * 40)), scale = PR[root] > 0 ? want / PR[root] : 1;
    var X = fltList(N), Y = fltList(N), Rr = fltList(N);
    X[root] = want + 40; Y[root] = want + 40; Rr[root] = want;
    for (i = 0; i < order.length; i++) {
      var u = order[i], xu = X[u], yu = Y[u];
      for (j = kidOff[u], j1 = kidOff[u + 1]; j < j1; j++) { c = kidList[j]; X[c] = xu + SX[c] * scale; Y[c] = yu + SY[c] * scale; Rr[c] = (PR[c] + padR - padR) * scale; }
    }
    return nestedOut('pack', G, H, val, { X: X, Y: Y, Rr: Rr, W: want * 2 + 80, H: want * 2 + 80 });
  }
  /**
   * Tidy tree in linear time (Buchheim, Junger and Leipert's version of Reingold-Tilford): no two items of a row touch and a parent sits over its children.
   * shape: 'tidy' (left to right), 'cluster' (every leaf in the last column, a dendrogram), 'radial', 'radialCluster', 'indented'.
   */
  function tree(G, o) {
    if (o.parentKey && typeof o.parentKey === 'string') { var TP = tinyView(G, o, o.parentKey, 'tree'); if (TP) return TP; }
    var H = hierarchy(G, o), val = NOVAL, N = H.N, shape = o.treeShape || 'tidy', i;
    var X = fltList(N), Y = fltList(N), maxD = 0;
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
  /* writes each item's place (x, y, w, h, cx, cy and its box number hv) onto the item, from the shape's lists */
  function placeItems(type, nodes, at, ch) {
    var R = ch.R, nn = nodes.length, i;
    if (type === 'icicle') {
      var cw = ch.colW, hh = ch.H;
      for (i = 0; i < nn; i++) {
        var n1 = nodes[i], b = at[i], b4 = b * 4, xa = R[b4] * cw, xb = R[b4 + 2] * cw, ya = R[b4 + 1] * hh, yb = R[b4 + 3] * hh;
        n1.x = xa; n1.y = ya; n1.w = Math.max(0, xb - xa); n1.h = Math.max(0, yb - ya); n1.cx = (xa + xb) / 2; n1.cy = (ya + yb) / 2; n1.hv = b;
      }
    } else
    for (var q = 0; q < nodes.length; q++) {
      var nd = nodes[q], v = at[q], x0, y0, x1, y1;
      if (type === 'treemap') { x0 = R[v * 4]; y0 = R[v * 4 + 1]; x1 = R[v * 4 + 2]; y1 = R[v * 4 + 3]; }
      else if (type === 'icicle') { x0 = R[v * 4] * ch.colW; x1 = R[v * 4 + 2] * ch.colW; y0 = R[v * 4 + 1] * ch.H; y1 = R[v * 4 + 3] * ch.H; }
      else if (type === 'sunburst') { var an = (R[v * 4 + 1] + R[v * 4 + 3]) / 2 * TAU - Math.PI / 2, rr = ch.hole + (R[v * 4] + 0.5) * ch.ring; nd.cx = ch.cx + Math.cos(an) * rr; nd.cy = ch.cy + Math.sin(an) * rr; x0 = nd.cx - 5; x1 = nd.cx + 5; y0 = nd.cy - 5; y1 = nd.cy + 5; }
      else if (type === 'pack') { var r = ch.Rr[v]; x0 = ch.X[v] - r; x1 = ch.X[v] + r; y0 = ch.Y[v] - r; y1 = ch.Y[v] + r; }
      else { x0 = ch.X[v] - 5; x1 = ch.X[v] + 5; y0 = ch.Y[v] - 5; y1 = ch.Y[v] + 5; }
      nd.x = x0; nd.y = y0; nd.w = Math.max(0, x1 - x0); nd.h = Math.max(0, y1 - y0); nd.cx = (x0 + x1) / 2; nd.cy = (y0 + y1) / 2; nd.hv = v;
    }
  }
  /** After a layout made with write: false: puts the places onto the items now (the drawing calls this itself). Does nothing otherwise. */
  function placeAll(L) {
    var ch = L && L.chart;
    if (ch && ch.placed === false) { placeItems(ch.type, L.nodes, ch.at, ch); ch.placed = true; }
    return L;
  }
  function nestedOut(type, G, H, val, geo) {
    var nodes = G.nodes.slice(), nn = nodes.length, at = H.at;
    /* write: false leaves the items alone (the places are in the shape's lists; at[i] is item i's box) until place() or the drawing asks */
    if (H.nw) { geo.at = at; geo.placed = false; } else placeItems(type, nodes, at, geo);
    geo.type = type; geo.val = val; geo.N = H.N; geo.par = H.par; var small = H.N <= 32; if (small) geo.kids = H.kids; else lazy(geo, 'kids', function () { return H.kids; }); geo.depth = H.depth; geo.item = H.item; if (small) { geo.label = H.label; geo.group = H.group; } else { lazy(geo, 'label', function () { return H.label; }); lazy(geo, 'group', function () { return H.group; }); } geo.root = H.root; geo.order = H.order; geo.mode = H.mode;
    geo.extra = H.extra.length; geo.tree = { from: H.from, to: H.to, extraList: H.extra };
    if (!H.pk) return { kind: type, dir: 'none', nodes: nodes, edges: G.edges, chart: geo, width: geo.W, height: geo.H };
    /* items that name their own parent came with no list of links: one is made only if somebody reads it (the drawing does, to style a link) */
    var out = { kind: type, dir: 'none', nodes: nodes, chart: geo, width: geo.W, height: geo.H }, key = H.pk;
    var mkEdges = function () { var es = [], q, p; for (q = 0; q < nn; q++) { p = nodes[q][key]; if (p !== null && p !== undefined && p !== '') es.push({ from: p, to: nodes[q].id }); } return es; };
    if (nn <= 32) out.edges = mkEdges(); else lazy(out, 'edges', mkEdges);
    return out;
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
    placeAll(L);
    var ch = L.chart, type = ch.type;
    var showDots = type === 'pack' || type === 'tree' || type === 'bundles';
    /* the scene module gets its own copy of each item (plain objects of one shape, so reading them stays fast); the copies are kept on the layout and filled in again for the next picture, so a look change makes no new ones */
    /* Each item is read in full only once per layout: items that came from a worker are slow dictionary objects, and copying all their fields
       on every look change cost about 1 s per 100,000 items in Chromium. Later pictures refresh only the size, which is all a look change alters here. */
    var SN = L.__stub; if (!SN || SN.src !== L.nodes || SN.nodes.length !== L.nodes.length) SN = L.__stub = { src: L.nodes, nodes: L.nodes.map(function (nd) { return { ...nd }; }) };
    var nodes = SN.nodes;
    L.nodes.forEach(function (nd, q) { var c = nodes[q]; if (nd.w !== undefined) c.w = nd.w; if (nd.h !== undefined) c.h = nd.h; if (!showDots || (type === 'pack' && ch.kids[nd.hv].length)) { c.w = 0; c.h = 0; } });
    if (type === 'pack') nodes.forEach(function (nd) { if (!ch.kids[nd.hv].length) { nd.w = nd.h = 2 * ch.Rr[nd.hv]; } });
    if (type === 'tree' || type === 'bundles') nodes.forEach(function (nd) { nd.w = nd.h = 9; });
    var stub = { kind: 'network', view: 'network', dir: 'none', nodes: nodes, edges: [], width: L.width, height: L.height, ch: L.ch, flow: L.flow, cls: L.cls, imp: L.imp, groups: L.groups, startId: L.startId, n: L.n, m: L.m, dotFills: type === 'treemap' || type === 'icicle' || type === 'sunburst' };
    var lab0 = o.lab || {};
    var S = NS.make(stub, Object.assign({}, o, { hulls: false, lab: { items: Object.assign({}, lab0.items || {}, { show: false }), links: lab0.links || { show: true, scale: 1 }, groups: { show: false, scale: 1 } }, lens: null, flat: false }));
    S.view = type; S.kind = type; S.chart = true;
    var T = S.theme, alpha = NS.alpha, mix = NS.mix;
    var groupsHex = T.groups, gIdx = new Map(), famH = null, gcol = function (g) { if (o.groupColors && o.groupColors[g]) return NS.hex(o.groupColors[g]); if (famH && famH.has(g || '')) return famH.get(g || ''); if (!gIdx.has(g)) gIdx.set(g, gIdx.size); return groupsHex[gIdx.get(g) % groupsHex.length]; };
    (function () {   /* group boxes take the same place in the color list as the scene gives their items: groups sorted by name, or in options.groupOrder */
      var gs = Array.from(new Set((L.nodes || []).map(function (n) { return n.group || ''; }))).sort();
      if (o.groupOrder && o.groupOrder.length) { var all = o.groupOrder.slice(), seenG = new Set(all); gs.forEach(function (g) { if (!seenG.has(g)) all.push(g); }); gs = all; }
      gs.forEach(function (g) { gcol(g); });
      if (o.families && NS.familyColors) famH = NS.familyColors(gs.filter(function (g) { return g !== '(none)'; }), T, o.families);   /* the same family steps the scene gives the items */
    })();
    (L.groups || []).forEach(function (g) { gcol(g); });
    var itemShow = !(lab0.items && lab0.items.show === false), iscale = lab0.items && lab0.items.scale || 1;
    var colOfNode = function (q) { var rec = S.nodes[q], d = rec && S.dots.filter ? null : null; return gcol(L.nodes[q].group || ''); };
    var dotOf = new Array(S.nodes.length), dl = S.dots, di; for (di = 0; di < dl.length; di++) { if (dl[di].node >= 0) dotOf[dl[di].node] = dl[di]; }   /* item record number to its dot (the last one wins) */
    var dfill = S.dotFills || null;   /* shapes drawn here: the scene gave the colors and no zero-size dots */
    var fillOf = function (q) { var d = q >= 0 && q < dotOf.length ? dotOf[q] : undefined; return d ? d.fill : dfill && dfill[q] ? dfill[q] : gcol(L.nodes[q].group || ''); };
    var lab = function (x, y, t, size, c, op) { var l = { x: x, y: y, t: t, size: size, color: c, align: 'c', bold: false, rot: 0, minK: 0, node: -1 }; if (op) for (var k in op) l[k] = op[k]; if (l.rot) l.rot *= 180 / Math.PI; S.labels.push(l); return l; };   /* angles in radians here, the renderer takes degrees */
    var clip = function (s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; };
    var recOf = function (q) { return S.nodes[q]; };
    /* text on a shape: the preferred color when it reads at 4.5:1 or better on the shape (as drawn over the background), otherwise near-black or white, whichever reads better (black where neither reaches 4.5:1) */
    var ink = function (fill, pref, under) { var c = over(fill, under || T.bg); if (pref && contrast(pref, c) >= 4.5) return pref; var d = contrast(INK_DARK, c), w = contrast(INK_LIGHT, c); return Math.max(d, w) >= 4.5 ? (d >= w ? INK_DARK : INK_LIGHT) : INK_BLACK; };   /* pure black reaches 4.5:1 on every color where neither does */
    /* a shape that neither near-black nor white names read on at 4.5:1 (as drawn over what is under it): the smallest change that fixes it, a shade darker for white names or a shade lighter for near-black ones, darker on a tie;
       returns the new color (opaque) or null when the shape already reads (owner's card, 2026.11.05: the violet tile 5% darker with white names, 4.57:1) */
    var fitM = new Map(), NONE = [];
    var fitFill = function (fill, under) {   /* the answer is kept per pair of color arrays (shared fills and parent boxes repeat) */
      under = under || T.bg; var m = fitM.get(fill), got; if (!m) fitM.set(fill, m = new Map()); got = m.get(under);
      if (got === undefined) { got = fitOnce(fill, under) || NONE; m.set(under, got); }
      return got === NONE ? null : got;
    };
    var fitOnce = function (fill, under) {
      var c = over(fill, under), r = function (v) { return Math.round(v * 255) / 255; }, s, dk, lt;
      if (Math.max(contrast(INK_DARK, c), contrast(INK_LIGHT, c)) >= 4.5) return null;
      for (s = 0.01; s < 1; s += 0.01) {
        dk = [r(c[0] * (1 - s)), r(c[1] * (1 - s)), r(c[2] * (1 - s)), 1]; if (contrast(INK_LIGHT, dk) >= 4.5) return dk;
        lt = [r(c[0] + (1 - c[0]) * s), r(c[1] + (1 - c[1]) * s), r(c[2] + (1 - c[2]) * s), 1]; if (contrast(INK_DARK, lt) >= 4.5) return lt;
      }
      return null;
    };
    /* a name that runs over shapes drawn later (a box's name over its first tiles, a circle's name over the circles inside): the ink that reads best on every color under it, the preferred one when it reaches 4.5:1 on all of them */
    var inkOver = function (cols, pref) {   /* cols: [color, share of the name, ...]; the preferred ink when it reaches 4.5:1 on all of them, else the ink whose worst contrast is highest */
      var worst = function (k) { var m = 99; for (var i = 0; i < cols.length; i += 2) m = Math.min(m, contrast(k, cols[i])); return m; };
      if (pref && worst(pref) >= 4.5) return pref;
      var best = INK_BLACK, bw = -1; [INK_DARK, INK_LIGHT, INK_BLACK].forEach(function (k) { var w = worst(k); if (w > bw + 0.01) { bw = w; best = k; } }); return best;
    };
    var textBox = function (l) { var w = l.t.length * l.size * 0.6, x0 = l.align === 'l' ? l.x : l.x - w / 2; return [x0, l.y - l.size * 0.75, x0 + w, l.y + 1]; };
    /* the colors under a name, sampled on a 12 by 3 grid over its text: topAt(x, y) gives the color drawn on top there; a color under less than a sixth of the name is left out */
    var underName = function (l, topAt) {
      var b = textBox(l), cnt = new Map(), n = 0;
      for (var gy = 0; gy < 3; gy++) for (var gx = 0; gx < 12; gx++) { var c = topAt(b[0] + (gx + 0.5) / 12 * (b[2] - b[0]), b[1] + (gy + 0.5) / 3 * (b[3] - b[1])); cnt.set(c, (cnt.get(c) || 0) + 1); n++; }
      var out = []; cnt.forEach(function (k, c) { if (k * 6 >= n) out.push(c, k / n); }); return out;
    };
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
      var Rm = ch.R, cw = ch.colW, Hh = ch.H, rectLine = alpha(T.bg, 0.9), lookM = new Map(), paintM = new Map(), seen = type === 'treemap' ? new Array(ch.N) : null, heads = [], tok = [];   /* treemap: the color each box shows (laid over its parent box), so text is checked on the pixels a reader sees */
      /* a box's fill from its base color: made once per base color and kind and shared (nothing changes these arrays in place) */
      var look = function (base, k) { var e = lookM.get(base); if (!e) lookM.set(base, e = [null, null]); return e[k] || (e[k] = k ? alpha(mix(base, T.bg, 0.55), 0.9) : alpha(base, type === 'icicle' ? 0.85 : 0.92)); };
      var TR = o.typedRects === true && NS.makeRectsT ? NS.makeRectsT(ch.order.length, rectLine) : null;   /* since 1.7.0: typedRects: true keeps the tiles as typed arrays in S.rectsT instead of one object each in S.rects */
      for (var oi = 0; oi < ch.order.length; oi++) {
        var v = ch.order[oi]; if (type === 'icicle' && ch.depth[v] < ch.skipRoot) continue; if (type === 'treemap' && v === ch.root && ch.item[v] < 0) continue;
        var x0, y0, x1, y1;
        if (type === 'treemap') { x0 = Rm[v * 4]; y0 = Rm[v * 4 + 1]; x1 = Rm[v * 4 + 2]; y1 = Rm[v * 4 + 3]; }
        else { x0 = Rm[v * 4] * cw; x1 = Rm[v * 4 + 2] * cw - 1; y0 = Rm[v * 4 + 1] * Hh; y1 = Rm[v * 4 + 3] * Hh - 1; }
        var w2 = x1 - x0, h2 = y1 - y0; if (w2 <= 0.3 || h2 <= 0.3) continue;
        var it = ch.item[v], base = hcol(v), box = ch.kids[v].length > 0;
        var fill = look(base, type === 'treemap' && box ? 1 : 0), pv0 = seen ? ch.par[v] : -1, under = pv0 >= 0 && seen[pv0] ? seen[pv0] : T.bg, fit = fitFill(fill, under);
        if (fit) fill = fit;
        /* what a fill shows over what is under it, and the text color that reads on it: worked out once per pair of colors (siblings of one color share both) */
        var pm = paintM.get(under); if (!pm) paintM.set(under, pm = new Map());
        var pe = pm.get(fill); if (!pe) pm.set(fill, pe = [null, null, null]);
        if (seen) seen[v] = pe[0] || (pe[0] = over(fill, under));
        if (TR) NS.pushRectT(TR, x0, y0, w2, h2, fill, it >= 0 ? recOf(it).i : -1);
        else S.rects.push({ x: x0, y: y0, w: w2, h: h2, r: 0, fill: fill, stroke: rectLine, sw: 1, layer: 1, node: it >= 0 ? recOf(it).i : -1, a: 1 });
        var size = (type === 'treemap' && box ? 12 : 11) * iscale, txt = ch.label[v];
        if (itemShow && w2 > size * 2.2 && h2 > size * 1.3) {
          var maxC = Math.floor((w2 - 8) / (size * 0.58)), pk = type === 'treemap' && box ? 1 : 2, tcol = pe[pk] || (pe[pk] = ink(fill, pk === 1 ? T.fg : null, under));
          var lb = lab(x0 + 4, y0 + size + 2, clip(txt, maxC), size, tcol, { align: 'l', node: it >= 0 ? it : -1, minK: 0, bold: box, val: ch.val[v] });
          if (seen && box) heads.push(lb, v, 0);
        }
      }
      if (TR) S.rectsT = NS.endRectsT(TR);
      for (var hq = 0; hq < heads.length; hq += 3) {   /* box names: also read on the tiles drawn over the box under the name */
        var hl = heads[hq], hv = heads[hq + 1], hb = textBox(hl), clear = true, hk = ch.kids[hv];
        for (var kq0 = 0; kq0 < hk.length && clear; kq0++) { var k0 = hk[kq0]; if (seen[k0] && Rm[k0 * 4] < hb[2] && Rm[k0 * 4 + 2] > hb[0] && Rm[k0 * 4 + 1] < hb[3] && Rm[k0 * 4 + 3] > hb[1]) clear = false; }
        if (clear) continue;   /* the usual case: the name sits on its own strip, nothing drawn over it */
        var hc = underName(hl, function (x, y) {   /* the deepest box inside this one that holds the point */
          var u = hv, moved = true;
          while (moved) { moved = false; var ks = ch.kids[u]; for (var kq = 0; kq < ks.length; kq++) { var kk = ks[kq]; if (seen[kk] && x >= Rm[kk * 4] && x <= Rm[kk * 4 + 2] && y >= Rm[kk * 4 + 1] && y <= Rm[kk * 4 + 3]) { u = kk; moved = true; break; } } }
          return tok[u] || (tok[u] = seen[u].slice());   /* counted box by box, as before the colors were shared: one copy per box that is sampled */
        });
        if (hc.length > 2 || hc[0] !== tok[hv]) hl.color = inkOver(hc, T.fg);
      }
    } else if (type === 'sunburst') {
      var Rs = ch.R, scx = ch.cx, scy = ch.cy, sfM = new Map();
      for (var si = 0; si < ch.order.length; si++) {
        var u = ch.order[si], d = Rs[u * 4]; if (d < 0) continue;
        var a0 = Rs[u * 4 + 1] * TAU - Math.PI / 2, a1 = Rs[u * 4 + 3] * TAU - Math.PI / 2; if (a1 - a0 < 0.002) continue;
        var r0 = ch.hole + d * ch.ring, r1 = r0 + ch.ring - 1.5, it2 = ch.item[u], base2 = hcol(u);
        var gap = Math.min(0.004, (a1 - a0) * 0.1);
        var sfA = sfM.get(base2); if (!sfA) sfM.set(base2, sfA = []);
        var sf = sfA[d]; if (!sf) { sf = alpha(base2, 0.9 - Math.min(0.3, d * 0.06)); sf = sfA[d] = fitFill(sf, T.bg) || sf; }   /* one fill per color and ring */
        pushSector(S, scx, scy, r0, r1, a0 + gap, a1 - gap, sf, [0, 0, 0, 0], it2 < 0 ? { group: ch.group[u] } : null);
        var midA = (a0 + a1) / 2, rr = (r0 + r1) / 2, arcLen = (a1 - a0) * rr;
        if (itemShow && arcLen > 12 * iscale) {
          var right2 = Math.cos(midA) >= 0, maxC2 = Math.floor((ch.ring - 8) / (6.5 * iscale));
          lab(scx + Math.cos(midA) * rr, scy + Math.sin(midA) * rr + 4, clip(ch.label[u], maxC2), 11 * iscale, ink(sf, null), { rot: right2 ? midA : midA + Math.PI, node: it2 >= 0 ? it2 : -1, minK: 0.2 });
        }
      }
      if (ch.skipRoot) lab(scx, scy + 5, clip(ch.label[ch.root], 18), 13, T.fg, { bold: true });
    } else if (type === 'pack') {
      /* a circle's fill as drawn: its own shade over every circle around it */
      var pheads = [], leafC = new Map(), shown = new Map(), parentFill = function (v) { var p = ch.par[v]; if (p < 0 || !ch.kids[p].length) return T.bg; var c = shown.get(p); return c || T.bg; };
      for (var pi = 0; pi < ch.order.length; pi++) {
        var pv = ch.order[pi]; if (!ch.kids[pv].length) continue; if (pv === ch.root && ch.item[pv] < 0 && false) continue;
        var pr = ch.Rr[pv], px = ch.X[pv], py = ch.Y[pv], ip = ch.item[pv], pb = hcol(pv);
        var circ = [], nseg = Math.max(24, Math.min(96, Math.round(pr / 3)));
        for (var cq = 0; cq < nseg; cq++) { var ca = cq / nseg * TAU; circ.push(px + Math.cos(ca) * pr, py + Math.sin(ca) * pr); }
        var dep = ch.depth[pv];
        var pfill = alpha(mix(pb, T.bg, 0.6), dep === 0 ? 0.35 : 0.5);
        shown.set(pv, over(pfill, parentFill(pv)));
        S.polys.push({ pts: circ, c: [px, py], fill: pfill, stroke: alpha(pb, 0.6), group: ip < 0 ? ch.group[pv] : undefined, node: ip });
        if (itemShow && pr > 30) pheads.push(lab(px, py - pr + 16 * iscale, clip(ch.label[pv], Math.floor(pr / 5)), 12 * iscale, ink(over(pfill, parentFill(pv)), T.fg), { bold: true, node: ip >= 0 ? ip : -1, minK: 0.1 }), pv);
      }
      for (var hp = 0; hp < pheads.length; hp += 2) {   /* a circle's name: also read on the circles inside it that the name runs over */
        var pl = pheads[hp], pu = pheads[hp + 1], own = shown.get(pu);
        var pc = underName(pl, function (x, y) {   /* the deepest circle inside this one that holds the point */
          var u = pu, moved = true;
          while (moved) { moved = false; var ks = ch.kids[u]; for (var kq = 0; kq < ks.length; kq++) { var kk = ks[kq], dx = x - ch.X[kk], dy = y - ch.Y[kk]; if (dx * dx + dy * dy <= ch.Rr[kk] * ch.Rr[kk]) { u = kk; moved = true; break; } } }
          if (u === pu) return own; if (ch.kids[u].length) return shown.get(u) || own;
          var it3 = ch.item[u]; return it3 >= 0 ? (leafC.get(it3) || (leafC.set(it3, over(fillOf(it3), T.bg)), leafC.get(it3))) : own;
        });
        if (pc.length > 2 || pc[0] !== own) pl.color = inkOver(pc, T.fg);
      }
      L.nodes.forEach(function (nd, q) { if (ch.kids[nd.hv].length || !dotOf[q]) return; var f = fitFill(dotOf[q].fill, T.bg); if (f) { dotOf[q].fill = f; leafC.delete(q); } });   /* leaf circles names cannot read on: the smallest shade change */
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
    if (S.rectsT) for (var qT = 0; qT < S.rectsT.n; qT++) { grow(S.rectsT.x[qT], S.rectsT.y[qT]); grow(S.rectsT.x[qT] + S.rectsT.w[qT], S.rectsT.y[qT] + S.rectsT.h[qT]); }
    S.dots.forEach(function (d) { grow(d.cx - d.r, d.cy - d.r); grow(d.cx + d.r, d.cy + d.r); });
    if (dfill) L.nodes.forEach(function (nd, q) { if (dfill[q]) grow(nd.cx, nd.cy); });   /* the zero-size dots that were not built still counted at their centers */
    S.polys.forEach(function (p) { for (var i = 0; i < p.pts.length; i += 2) grow(p.pts[i], p.pts[i + 1]); });
    S.curves.forEach(function (c) { for (var i = 0; i < c.P.length; i += 2) grow(c.P[i], c.P[i + 1]); });
    S.labels.forEach(function (l) { if (l.rot) { var r = l.t.length * l.size * 0.6, a = l.rot * Math.PI / 180, sg = l.align === 'r' ? -1 : 1; grow(l.x + Math.cos(a) * r * sg, l.y + Math.sin(a) * r * sg); grow(l.x - Math.sin(a) * l.size, l.y + Math.cos(a) * l.size * 0.4); }   /* label angles are kept in degrees (for the renderer): turn them back for the bounds, so a tilted name is never cut off */ else { var b = NS.labelBox(l); if (b) { grow(b[0], b[1]); grow(b[2], b[3]); } } });
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
  function linCh(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function relLum(c) { return 0.2126 * linCh(c[0]) + 0.7152 * linCh(c[1]) + 0.0722 * linCh(c[2]); }
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
  /* Table rows in your own column names work too: name them with o.from, o.to and o.value, or leave them out and the first two text columns and the first number column are used. */
  /* an amount written as text: '1,200', '$1,200' and '45%' read as numbers, the same way netflow-plot reads them (since 1.5.1) */
  function amount(v) {
    if (typeof v === 'number') return v;
    if (v === undefined || v === null || v === '') return NaN;
    var q = Number(v); if (q === q && String(v).trim() !== '') return q;
    var t = String(v).trim().replace(/[,$\u00a3\u00a5%\s]/g, ''); return t === '' ? NaN : Number(t);
  }
  function asLinks(d, o) {
    o = o || {}; var l = Array.isArray(d) ? d : (d && (d.links || d.edges)) || [], r0 = l[0] || {}, F = typeof o.from === 'string' ? o.from : null, T = typeof o.to === 'string' ? o.to : null, V = typeof o.value === 'string' ? o.value : null;
    if (!F && !T && r0.from === undefined && r0.to === undefined) { var txt = [], num = null; Object.keys(r0).forEach(function (k) { var v = r0[k]; if (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && isFinite(amount(v)))) { if (num === null) num = k; } else if (typeof v === 'string') txt.push(k); }); F = txt[0] || null; T = txt[1] || null; if (!V) V = num; }
    return l.map(function (e) { var v = V ? e[V] : e.value !== undefined ? e.value : e.weight !== undefined ? e.weight : e.count !== undefined ? e.count : 1; return { from: F ? e[F] : e.from, to: T ? e[T] : e.to, value: v === undefined || v === '' ? 1 : amount(v) }; });
  }
  /** NetflowScene from the page (or, in Node, from the folder next door), with a plain error when it is missing. */
  function sceneLib(who) {
    var g = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : {};
    if (g.NetflowScene) return g.NetflowScene;
    if (typeof require === 'function') { try { return require('../netflow-scene/netflow-scene.js'); } catch (e) { /* not there */ } }
    throw new Error(who + ': NetflowScene was not found. Load netflow-scene.js before ' + who + '.js.');
  }
  /** Links (as above) or { nodes, edges } as a graph for layout(): items are made from the links' ends when not given. */
  function asGraph(d, o) {
    if (d && !Array.isArray(d) && d.nodes && d.edges) return d;
    var ls = asLinks(d, o), ns = d && !Array.isArray(d) && d.nodes ? d.nodes.slice() : [], seen = {};
    ns.forEach(function (n) { seen[n.id] = 1; }); ls.forEach(function (e) { [e.from, e.to].forEach(function (id) { if (!seen[id]) { seen[id] = 1; ns.push({ id: id, label: String(id) }); } }); });
    var inV = {}, outV = {}; ls.forEach(function (e) { if (e.value > 0) { inV[e.to] = (inV[e.to] || 0) + e.value; outV[e.from] = (outV[e.from] || 0) + e.value; } });
    ns = ns.map(function (n) { if (n.sizeV !== undefined) return n; var c = {}; for (var k in n) c[k] = n[k]; c.sizeV = Math.max(1e-6, (inV[n.id] || 0) - (outV[n.id] || 0)); return c; });   /* each box holds what flows into it and stays there (what flows on is drawn by the boxes inside) */
    return { nodes: ns, edges: ls.map(function (e) { return { from: e.from, to: e.to, weight: e.value, count: 1, widthV: NaN, flow: 0 }; }) };
  }
  /** One call to a picture: toSvg(data, options) returns SVG text. options.type picks the view (default treemap); the rest go to layout() and scene(). */
  function toSvg(data, o) {
    o = o || {}; var NS = sceneLib('netflow-hierarchy'), lo = {}; for (var k in o) lo[k] = o[k]; if (lo.nest === undefined) lo.nest = 'auto'; if (lo.sized === undefined) lo.sized = true;
    return NS.toSvg(scene(layout(o.type || 'treemap', asGraph(data, o), lo), o, NS), o.title);
  }
  /* warm(): optional, never called for you. Draws two small made-up pictures (a treemap and a sunburst of 30 items) once and throws them away, so the browser's JavaScript engine has already
     optimized the drawing code when your first real picture comes. Call it from an idle callback, after netflow-scene.js has loaded (about 10 ms of work). Returns true when it ran, false when
     NetflowScene is missing. Nothing else changes: a picture comes out the same with or without it. */
  function warm() {
    var rows = [], i, s = 5, r = function () { return (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
    try { sceneLib('netflow-hierarchy'); } catch (e) { return false; }
    for (i = 1; i < 30; i++) rows.push({ from: 'n' + (i >> 2), to: 'n' + i, value: Math.round(r() * 90) + 10 });
    toSvg(rows); toSvg(rows, { type: 'sunburst' });
    return true;
  }
  return { warm: warm, VIEWS: VIEWS, IS: IS, NESTED: NESTED, layout: layout, scene: scene, toSvg: toSvg, asGraph: asGraph, sceneLib: sceneLib, hierarchy: hierarchy, sums: sums, place: placeAll, packSiblings: packSiblings, enclose: enclose, linkValue: linkValue, itemValue: itemValue,
    tmpI: tmpI, tmpF: tmpF, sector: sector, pushSector: pushSector, lumi: lumi };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NetflowHierarchy;
