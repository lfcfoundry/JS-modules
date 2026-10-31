/*!
 * graph-walk.js: the small walks over a link list that map and flow tools keep rewriting: breadth-first distances from an item, and a depth-first pass that marks the links that close a loop and lists the items in finishing order, connected components, strongly connected components, topological order and shortest paths. Works on the plain "links of every item" layout (CSR) in typed arrays. No dependencies.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 0.8.0 (API 0)
 *
 *   var g = GraphWalk.csr(n, fromArray, toArray);         // item numbers 0..n-1; link i joins from[i] to to[i]
 *   var depth = GraphWalk.bfs(g, root);                    // Int32Array, -1 where not reached; bfs(g, root, skip) never enters item `skip`
 *   var w = GraphWalk.loops(g, start);                     // { closes: Uint8Array(m), keep: Uint8Array(m), post: Int32Array, count }
 *   var c = GraphWalk.components(g);                       // { id: Int32Array(n), count, sizes }   groups of items joined by links in either direction
 *   var s = GraphWalk.scc(g);                              // { id: Int32Array(n), count }          groups where every item reaches every other following link directions (ids: sinks first)
 *   var t = GraphWalk.topo(g);                             // { order: Int32Array, complete }       every link goes forward in order; complete is false when a loop blocks it
 *   var r = GraphWalk.shortest(g, src, weights, target);   // { dist: Float64Array, via: Int32Array }  cheapest total weight (or fewest links with no weights); via[v] = last link into v
 *   var p = GraphWalk.pathTo(g, r, target);                // link numbers from src to target, or null
 *   var q = GraphWalk.path(g, src, target, weights);       // { cost, links } searching from both ends (best for one pair), or null
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GraphWalk = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /** Links of every item: g.outStart[v]..g.outStart[v+1] index into g.outEdge, which holds link numbers in input order. g.to[i] is where link i leads. */
  function csr(n, from, to) {
    var m = from.length;
    if (to.length !== m) throw new RangeError('from and to must have the same length');
    // one allocation holds all four arrays (fewer buffers to create and collect); the fill runs backwards from each item's end so no scratch copy of the starts is needed
    var buf = new Int32Array(n + 1 + 3 * m), os = buf.subarray(0, n + 1), oe = buf.subarray(n + 1, n + 1 + m), f = buf.subarray(n + 1 + m, n + 1 + 2 * m), t = buf.subarray(n + 1 + 2 * m), i, a, b;
    f.set(from); t.set(to);
    for (i = 0; i < m; i++) {
      a = f[i]; b = t[i];
      if (!(a >= 0 && a < n && b >= 0 && b < n)) throw new RangeError('link ' + i + ' names an item outside 0..' + (n - 1));
      os[a]++;
    }
    for (i = 1; i < n; i++) os[i] += os[i - 1];
    for (i = m - 1; i >= 0; i--) oe[--os[f[i]]] = i;
    os[n] = m;
    var g = { n: n, m: m, from: f, to: t, outStart: os, outEdge: oe };
    return g;
  }
  /** Breadth-first distances (number of links) from `root`, never entering `skip`; -1 where not reached. `out` (an Int32Array of length g.n) is reused when given. */
  function bfs(g, root, skip, out) {
    var n = g.n, d = out && out.length === n ? out.fill(-1) : new Int32Array(n).fill(-1);
    if (root < 0 || root >= n || root === skip || n === 0) return d;
    var q = new Int32Array(n), h = 0, tl = 0, os = g.outStart, oe = g.outEdge, to = g.to, v, k, w, end;
    q[tl++] = root; d[root] = 0;
    while (h < tl) {
      v = q[h++]; end = os[v + 1];
      for (k = os[v]; k < end; k++) {
        w = to[oe[k]];
        if (w !== skip && d[w] < 0) { d[w] = d[v] + 1; q[tl++] = w; }
      }
    }
    return d;
  }
  /**
   * Depth-first from `start` (no recursion). closes[i] = 1 for a reached link that leads back to an item still being walked (it closes a loop, a self-link included);
   * keep[i] = 1 for every other reached link (so keep is the link set without its loops, a graph with no loop); post lists the reached items in finishing order
   * (walk it backwards for parents before children); count is how many links close a loop.
   */
  function loops(g, start) {
    var n = g.n, m = g.m, state = new Uint8Array(n), keep = new Uint8Array(m), closes = new Uint8Array(m), post = new Int32Array(n), np = 0, count = 0;
    if (start < 0 || start >= n) return { closes: closes, keep: keep, post: post.subarray(0, 0), count: 0 };
    var os = g.outStart, oe = g.outEdge, to = g.to, it = new Int32Array(n), stack = new Int32Array(n + 1), sp = 0, v, e, w;
    stack[sp++] = start; state[start] = 1;
    while (sp) {
      v = stack[sp - 1];
      if (os[v] + it[v] < os[v + 1]) {
        e = oe[os[v] + it[v]++]; w = to[e];
        if (state[w] === 1) { closes[e] = 1; count++; continue; }
        keep[e] = 1;
        if (!state[w]) { state[w] = 1; stack[sp++] = w; }
      } else { state[v] = 2; post[np++] = v; sp--; }
    }
    return { closes: closes, keep: keep, post: post.subarray(0, np), count: count };
  }

  /** Groups of items joined by links in either direction. id[v] counts up in order of each group's lowest item number; sizes[id] is the group's item count. Union-find over the link list (no walk, no queue). */
  function componentsJS(g) {
    var n = g.n, m = g.m, from = g.from, to = g.to, p = new Int32Array(n), i, a, b, t, id = new Int32Array(n), sizes, c = 0;
    for (i = 0; i < n; i++) p[i] = i;
    for (i = 0; i < m; i++) {
      a = from[i]; b = to[i];
      while (p[a] !== a) { p[a] = p[p[a]]; a = p[a]; }
      while (p[b] !== b) { p[b] = p[p[b]]; b = p[b]; }
      if (a !== b) { if (a < b) p[b] = a; else p[a] = b; }
    }
    // roots are the lowest item of their group (the smaller number always wins), so one pass numbers groups in order and every other item reads its root's id
    for (i = 0; i < n; i++) { t = p[i]; if (t === i) id[i] = c++; else { while (p[t] !== t) t = p[t]; p[i] = t; id[i] = id[t]; } }
    sizes = new Int32Array(c);
    for (i = 0; i < n; i++) sizes[id[i]]++;
    return { id: id, count: c, sizes: sizes };
  }

  /** Strongly connected groups (Tarjan, no recursion). id[v] numbers groups sinks first: a link between two groups always goes from the higher id to the lower id, so counting ids down gives sources first. */
  function sccJS(g) {
    var n = g.n, os = g.outStart, oe = g.outEdge, to = g.to, idx = new Int32Array(n).fill(-1), low = new Int32Array(n), id = new Int32Array(n).fill(-1), it = new Int32Array(n),
        st = new Int32Array(n), sp = 0, cs = new Int32Array(n), cp = 0, next = 0, count = 0, s, v, w, k, end;
    for (s = 0; s < n; s++) {
      if (idx[s] >= 0) continue;
      cs[cp++] = s; idx[s] = low[s] = next++; st[sp++] = s; it[s] = os[s];
      while (cp) {
        v = cs[cp - 1]; k = it[v]; end = os[v + 1];
        if (k < end) {
          it[v] = k + 1; w = to[oe[k]];
          if (idx[w] < 0) { idx[w] = low[w] = next++; st[sp++] = w; it[w] = os[w]; cs[cp++] = w; }
          else if (id[w] < 0 && idx[w] < low[v]) low[v] = idx[w];
        } else {
          cp--;
          if (low[v] === idx[v]) { do { w = st[--sp]; id[w] = count; } while (w !== v); count++; }
          if (cp) { w = cs[cp - 1]; if (low[v] < low[w]) low[w] = low[v]; }
        }
      }
    }
    return { id: id, count: count };
  }

  /** Items in an order where every link goes forward (Kahn). complete is true when all items are placed; with a loop (a self-link counts) the items on or behind it are left out and order is shorter. */
  function topoJS(g) {
    var n = g.n, m = g.m, os = g.outStart, oe = g.outEdge, to = g.to, deg = new Int32Array(n), q = new Int32Array(n), h = 0, tl = 0, i, v, k, end;
    for (i = 0; i < m; i++) deg[to[i]]++;
    for (i = 0; i < n; i++) if (!deg[i]) q[tl++] = i;
    while (h < tl) {
      v = q[h++]; end = os[v + 1];
      for (k = os[v]; k < end; k++) { i = to[oe[k]]; if (--deg[i] === 0) q[tl++] = i; }
    }
    return { order: tl === n ? q : q.subarray(0, tl), complete: tl === n };
  }

  /** Four-ary heap of items keyed by their distance, with a position table so a better distance moves an item up instead of adding a copy: it never holds more than n items. pos: -1 not seen, -2 settled. */
  function Heap(n, dist) { this.a = new Int32Array(n); this.pos = new Int32Array(n).fill(-1); this.touched = new Int32Array(n); this.nt = 0; this.size = 0; this.dist = dist; }
  /** Put `v` in the heap, or move it up after its distance dropped. */
  Heap.prototype.up = function (v) {
    var a = this.a, pos = this.pos, dist = this.dist, i = pos[v], d = dist[v], par;
    if (i === -1) { i = this.size++; this.touched[this.nt++] = v; }
    while (i > 0) { par = (i - 1) >> 2; if (dist[a[par]] <= d) break; a[i] = a[par]; pos[a[i]] = i; i = par; }
    a[i] = v; pos[v] = i;
  };
  /** Forget everything put in since the last clear, in time proportional to what was touched (distances go back to Infinity). */
  Heap.prototype.clear = function () {
    var t = this.touched, pos = this.pos, dist = this.dist, i, v;
    for (i = 0; i < this.nt; i++) { v = t[i]; dist[v] = Infinity; pos[v] = -1; }
    this.nt = 0; this.size = 0;
  };
  /** Take out the nearest item and mark it settled. */
  Heap.prototype.pop = function () {
    var a = this.a, pos = this.pos, dist = this.dist, top = a[0], last = a[--this.size], hs = this.size, i = 0, c, best, x, dx;
    pos[top] = -2;
    if (hs) {
      dx = dist[last];
      for (;;) {
        c = 4 * i + 1; if (c >= hs) break;
        best = c; x = dist[a[c]];
        if (c + 1 < hs && dist[a[c + 1]] < x) { best = c + 1; x = dist[a[best]]; }
        if (c + 2 < hs && dist[a[c + 2]] < x) { best = c + 2; x = dist[a[best]]; }
        if (c + 3 < hs && dist[a[c + 3]] < x) { best = c + 3; x = dist[a[best]]; }
        if (x >= dx) break;
        a[i] = a[best]; pos[a[i]] = i; i = best;
      }
      a[i] = last; pos[last] = i;
    }
    return top;
  };

  /** Links into every item, built once per graph and kept on it (g.inStart, g.inEdge) for searches that also walk backwards. */
  function reverse(g) {
    if (g.inEdge) return g;
    var n = g.n, m = g.m, to = g.to, is = new Int32Array(n + 1), ie = new Int32Array(m), i;
    for (i = 0; i < m; i++) is[to[i]]++;
    for (i = 1; i < n; i++) is[i] += is[i - 1];
    for (i = m - 1; i >= 0; i--) ie[--is[to[i]]] = i;
    is[n] = m; g.inStart = is; g.inEdge = ie;
    return g;
  }

  /**
   * Cheapest way from `src` to every item: dist[v] (Infinity when not reached) and via[v] (the last link into v, -1 for src and unreached items). With `weights` (one non-negative number per link, in input order) the cost
   * is the weight total, otherwise the number of links. With a `target` the search stops once the target is settled: dist[target] and the links on its path are exact, other entries may be partial (for one pair, `path` is faster).
   */
  function shortestJS(g, src, weights, target) {
    var n = g.n, os = g.outStart, oe = g.outEdge, to = g.to, dist = new Float64Array(n).fill(Infinity), via = new Int32Array(n).fill(-1), v, k, e, w, nd, end, x, h;
    if (target === undefined || !(target >= 0 && target < n)) target = -1;
    if (src < 0 || src >= n) return { dist: dist, via: via };
    dist[src] = 0;
    if (!weights) {   // fewest links: breadth-first, the first arrival is the shortest
      var q = new Int32Array(n), hd = 0, tl = 0; q[tl++] = src;
      while (hd < tl) {
        v = q[hd++]; if (v === target) break; end = os[v + 1]; nd = dist[v] + 1;
        for (k = os[v]; k < end; k++) { e = oe[k]; w = to[e]; if (dist[w] === Infinity) { dist[w] = nd; via[w] = e; q[tl++] = w; } }
      }
      return { dist: dist, via: via };
    }
    if (weights.length !== g.m) throw new RangeError('weights needs one number per link');
    h = new Heap(n, dist); h.up(src);   // all items, or stop when the target is settled
    while (h.size) {
      v = h.pop(); if (v === target) break;
      end = os[v + 1];
      for (k = os[v]; k < end; k++) {
        e = oe[k]; w = to[e]; if (h.pos[w] === -2) continue;
        x = weights[e]; if (!(x >= 0)) throw new RangeError('link ' + e + ' has a negative or missing weight');
        nd = dist[v] + x;
        if (nd < dist[w]) { dist[w] = nd; via[w] = e; h.up(w); }
      }
    }
    return { dist: dist, via: via };
  }

  /**
   * One cheapest path between two items, searching from both ends: { cost, links } (links in walking order), or null when target cannot be reached. Weighted when `weights` is given, else fewest links.
   * The first call builds the links-into-every-item index and working arrays and keeps them on the graph (memory of about 20 numbers per item); later calls cost only what the search touches, not the size of the graph.
   */
  function path(g, src, target, weights) {
    var n = g.n;
    if (!(src >= 0 && src < n && target >= 0 && target < n)) return null;
    if (src === target) return { cost: 0, links: [] };
    if (weights && weights.length !== g.m) throw new RangeError('weights needs one number per link');
    reverse(g);
    var S = g._scratch || (g._scratch = { vf: new Int32Array(n), vb: new Int32Array(n), df: null, hf: null, bf: null });   // working arrays are made when a kind of search first needs them
    var os = g.outStart, oe = g.outEdge, to = g.to, from = g.from, is = g.inStart, ie = g.inEdge, vf = S.vf, vb = S.vb, v, k, e, w, x, nd, end, best = Infinity, meet = -1, u, i, links = [], rev;
    if (!weights) {
      if (!S.bf) { S.bf = new Int32Array(n).fill(-1); S.bb = new Int32Array(n).fill(-1); S.qf = new Int32Array(n); S.qb = new Int32Array(n); }
      var df = S.bf, db = S.bb, qf = S.qf, qb = S.qb, hf = 0, tf = 0, hb = 0, tb = 0, stop;
      qf[tf++] = src; df[src] = 0; qb[tb++] = target; db[target] = 0;
      while (hf < tf && hb < tb && best === Infinity) {
        if (tf - hf <= tb - hb) {   // extend the smaller side by one whole level
          stop = tf;
          while (hf < stop) {
            v = qf[hf++]; end = os[v + 1];
            for (k = os[v]; k < end; k++) {
              e = oe[k]; w = to[e];
              if (df[w] < 0) { df[w] = df[v] + 1; vf[w] = e; qf[tf++] = w; if (db[w] >= 0 && df[w] + db[w] < best) { best = df[w] + db[w]; meet = w; } }
            }
          }
        } else {
          stop = tb;
          while (hb < stop) {
            v = qb[hb++]; end = is[v + 1];
            for (k = is[v]; k < end; k++) {
              e = ie[k]; u = from[e];
              if (db[u] < 0) { db[u] = db[v] + 1; vb[u] = e; qb[tb++] = u; if (df[u] >= 0 && df[u] + db[u] < best) { best = df[u] + db[u]; meet = u; } }
            }
          }
        }
      }
      for (i = 0; i < tf; i++) df[qf[i]] = -1;
      for (i = 0; i < tb; i++) db[qb[i]] = -1;
    } else {
      if (!S.df) { S.df = new Float64Array(n).fill(Infinity); S.db = new Float64Array(n).fill(Infinity); }
      var distF = S.df, distB = S.db, heapF = S.hf || (S.hf = new Heap(n, distF)), heapB = S.hb || (S.hb = new Heap(n, distB));
      try {
        distF[src] = 0; heapF.up(src); distB[target] = 0; heapB.up(target);
        // always extend the side whose nearest open item is closer; stop when the two nearest open items together cost at least the best meeting found
        while (heapF.size && heapB.size) {
          if (distF[heapF.a[0]] + distB[heapB.a[0]] >= best) break;
          if (distF[heapF.a[0]] <= distB[heapB.a[0]]) {
            v = heapF.pop(); end = os[v + 1];
            for (k = os[v]; k < end; k++) {
              e = oe[k]; w = to[e]; if (heapF.pos[w] === -2) continue;
              x = weights[e]; if (!(x >= 0)) throw new RangeError('link ' + e + ' has a negative or missing weight');
              nd = distF[v] + x;
              if (nd < distF[w]) { distF[w] = nd; vf[w] = e; heapF.up(w); if (nd + distB[w] < best) { best = nd + distB[w]; meet = w; } }
            }
          } else {
            v = heapB.pop(); end = is[v + 1];
            for (k = is[v]; k < end; k++) {
              e = ie[k]; u = from[e]; if (heapB.pos[u] === -2) continue;
              x = weights[e]; if (!(x >= 0)) throw new RangeError('link ' + e + ' has a negative or missing weight');
              nd = distB[v] + x;
              if (nd < distB[u]) { distB[u] = nd; vb[u] = e; heapB.up(u); if (nd + distF[u] < best) { best = nd + distF[u]; meet = u; } }
            }
          }
        }
      } finally { heapF.clear(); heapB.clear(); }
    }
    if (meet < 0) return null;
    for (u = meet; u !== src; u = from[e]) { e = vf[u]; links.push(e); }
    links.reverse();
    for (u = meet; u !== target; u = to[e]) { e = vb[u]; links.push(e); }
    return { cost: best, links: links };
  }


  /* ---- WebAssembly (wasm/graph-walk.c): the same algorithms and answers for components, scc, topo and weighted shortest paths to every item; compiled the moment this file loads, never blocking; the plain JavaScript answers until it is ready ---- */
  var WASM_B64 = /*WASM:gw:BEGIN*/'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'/*WASM:gw:END*/;
  var W = null, mem = null, backend = 'auto', permEnd = 0, readyPromise = null;
  function b64bytes(t) { var bin, i; if (typeof atob === 'function') { var r = atob(t); bin = new Uint8Array(r.length); for (i = 0; i < r.length; i++) bin[i] = r.charCodeAt(i); } else bin = new Uint8Array(Buffer.from(t, 'base64')); return bin; }
  function start() {
    if (readyPromise) return readyPromise;
    if (typeof WebAssembly !== 'object' || !WASM_B64) return (readyPromise = Promise.resolve(false));
    try {
      readyPromise = WebAssembly.instantiate(b64bytes(WASM_B64), {}).then(function (r) { W = r.instance.exports; mem = W.memory; permEnd = (W.__heap_base.value + 7) & ~7; return true; }, function () { return false; });
    } catch (e) { readyPromise = Promise.resolve(false); }
    return readyPromise;
  }
  function useWasm() { return W !== null && backend !== 'js'; }
  function grow(end) { var have = mem.buffer.byteLength; if (end > have) mem.grow(Math.ceil((end - have) / 65536)); }
  /** The graph's own arrays copied into wasm memory once and kept (g._wp); GraphWalk.free(g) gives the space back when it is the newest. */
  function upload(g) {
    if (g._wp && g._wp.mem === mem) return g._wp;
    var n = g.n, m = g.m, start0 = permEnd, p = { mem: mem, start: start0, os: start0, oe: start0 + 4 * (n + 1), to: 0, from: 0, is: 0, ie: 0, rev: false, end: 0 };
    p.to = p.oe + 4 * m; p.from = p.to + 4 * m; p.is = (p.from + 4 * m + 7) & ~7; p.ie = p.is + 4 * (n + 1); p.end = (p.ie + 4 * m + 7) & ~7;   // room for the links-into-items index is kept, filled when a job needs it
    grow(p.end); permEnd = p.end;
    var all = new Int32Array(mem.buffer);
    all.set(g.outStart, p.os >> 2); all.set(g.outEdge, p.oe >> 2); all.set(g.to, p.to >> 2); all.set(g.from, p.from >> 2);
    g._wp = p; return p;
  }
  function uploadRev(g, p) {
    if (p.rev) return p; reverse(g);
    var all = new Int32Array(mem.buffer); all.set(g.inStart, p.is >> 2); all.set(g.inEdge, p.ie >> 2); p.rev = true; return p;
  }
  /** Scratch space above the kept graphs for one call: sizes in bytes, returns the byte offsets. */
  function scratch(sizes) {
    var at = permEnd, out = [], i;
    for (i = 0; i < sizes.length; i++) { out.push(at); at = (at + sizes[i] + 7) & ~7; }
    grow(at); return out;
  }
  function componentsW(g) {
    var n = g.n, m = g.m, p = upload(g), q = scratch([4 * n, 4 * n, 4 * n]), count = W.gw_components(n, m, p.from, p.to, q[0], q[1], q[2]), b = mem.buffer;
    return { id: new Int32Array(b, q[1], n).slice(), count: count, sizes: new Int32Array(b, q[2], count).slice() };
  }
  function sccW(g) {
    var n = g.n, p = upload(g), q = scratch([4 * n, 4 * n, 4 * n, 4 * n, 4 * n, 4 * n]), count = W.gw_scc(n, p.os, p.oe, p.to, q[0], q[1], q[2], q[3], q[4], q[5]);
    return { id: new Int32Array(mem.buffer, q[2], n).slice(), count: count };
  }
  function topoW(g) {
    var n = g.n, p = upload(g), q = scratch([4 * n, 4 * n]), placed = W.gw_topo(n, g.m, p.os, p.oe, p.to, q[0], q[1]), order = new Int32Array(mem.buffer, q[1], placed).slice();
    return { order: order, complete: placed === n };
  }
  function shortestW(g, src, weights, target) {
    var n = g.n, m = g.m, p = upload(g), q = scratch([8 * m, 8 * n, 4 * n, 4 * n, 4 * n]), b = mem.buffer, dist, via, bad;
    new Float64Array(b, q[0], m).set(weights);
    dist = new Float64Array(b, q[1], n).fill(Infinity); via = new Int32Array(b, q[2], n).fill(-1); new Int32Array(b, q[4], n).fill(-1);
    bad = W.gw_dijkstra(n, p.os, p.oe, p.to, q[0], src, q[1], q[2], q[3], q[4]);
    if (bad) throw new RangeError('link ' + (bad - 1) + ' has a negative or missing weight');
    return { dist: dist.slice(), via: via.slice() };
  }
  function components(g) { return useWasm() ? componentsW(g) : componentsJS(g); }
  function scc(g) { return useWasm() ? sccW(g) : sccJS(g); }
  function topo(g) { return useWasm() ? topoW(g) : topoJS(g); }
  /** As the JavaScript version; with `weights` and no `target` (cheapest paths to every item) the work runs in WebAssembly when it is ready. */
  function shortest(g, src, weights, target) {
    if (weights && (target === undefined || !(target >= 0)) && useWasm() && src >= 0 && src < g.n) {
      if (weights.length !== g.m) throw new RangeError('weights needs one number per link');
      return shortestW(g, src, weights, target);
    }
    return shortestJS(g, src, weights, target);
  }

  function kcoreW(g) {
    var n = g.n, p = uploadRev(g, upload(g)), q = scratch([4 * n, 4 * n, 4 * n, 4 * (2 * g.m + 2)]), max = W.gw_kcore(n, p.os, p.oe, p.to, p.is, p.ie, p.from, q[0], q[1], q[2], q[3]);
    return { core: new Int32Array(mem.buffer, q[0], n).slice(), max: max };
  }
  function pagerankW(g, options) {
    options = options || {};
    var n = g.n, m = g.m, os = g.outStart, w = options.weights, i, k, sum, dang = [], wsum = w ? new Float64Array(n) : null;
    if (w && w.length !== m) throw new RangeError('weights needs one number per link');
    if (n === 0) return { rank: new Float64Array(0), iterations: 0, converged: true };
    for (i = 0; i < n; i++) {
      if (w) { sum = 0; for (k = os[i]; k < os[i + 1]; k++) sum += w[g.outEdge[k]]; wsum[i] = sum; if (!(sum > 0)) dang.push(i); } else if (os[i + 1] === os[i]) dang.push(i);
    }
    var p = upload(g), q = scratch([8 * n, 8 * n, 4 * (dang.length + 1), w ? 8 * m : 8, w ? 8 * n : 8]), b = mem.buffer;
    new Int32Array(b, q[2], dang.length).set(dang);
    if (w) { new Float64Array(b, q[3], m).set(w); new Float64Array(b, q[4], n).set(wsum); }
    var r = W.gw_pagerank(n, p.os, p.oe, p.to, w ? q[3] : 0, w ? q[4] : 0, q[2], dang.length, options.alpha === undefined ? 0.85 : options.alpha, options.tolerance === undefined ? 1e-6 : options.tolerance, options.maxIterations === undefined ? 100 : options.maxIterations, q[0], q[1]);
    return { rank: new Float64Array(mem.buffer, q[0], n).slice(), iterations: r >> 1, converged: (r & 1) === 1 };
  }
  function betweennessW(g, options) {
    options = options || {};
    var n = g.n, p = uploadRev(g, upload(g)), srcs = options.sources, ns, i, k = 0, q = scratch([8 * n, 4 * n, 8 * n, 8 * n, 4 * n, 4 * (srcs ? srcs.length : n) + 4]), b = mem.buffer, bc, scale;
    var list = new Int32Array(b, q[5], srcs ? srcs.length : n);
    if (srcs) { for (i = 0; i < srcs.length; i++) if (srcs[i] >= 0 && srcs[i] < n) list[k++] = srcs[i]; } else { for (i = 0; i < n; i++) list[i] = i; k = n; }
    new Float64Array(b, q[0], n).fill(0); new Int32Array(b, q[1], n).fill(-1); new Float64Array(b, q[2], n).fill(0); new Float64Array(b, q[3], n).fill(0);
    W.gw_betweenness(n, p.os, p.oe, p.to, p.is, p.ie, p.from, q[5], k, q[0], q[1], q[2], q[3], q[4]);
    bc = new Float64Array(mem.buffer, q[0], n).slice();
    if (options.normalized !== false && n > 2) { scale = 1 / ((n - 1) * (n - 2)); for (i = 0; i < n; i++) bc[i] *= scale; }
    return bc;
  }
  function mstW(g, weights) {
    var n = g.n, m = g.m, i, total = 0;
    if (!weights || weights.length !== m) throw new RangeError('weights needs one number per link');
    for (i = 0; i < m; i++) if (weights[i] !== weights[i]) throw new RangeError('link ' + i + ' has no weight');
    var p = upload(g), q = scratch([8 * m, 8 * m, 8 * m, 4 * m, 4 * m, 4 * 65537, 4 * n, 4 * (n + 1)]), b = mem.buffer;
    new Float64Array(b, q[0], m).set(weights);
    var no = W.gw_mst(n, m, p.from, p.to, q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7]), links = new Int32Array(mem.buffer, q[7], no).slice();
    for (i = 0; i < no; i++) total += weights[links[i]];
    return { links: links, total: total };
  }

  function maxflowW(g, source, sink, capacity) {
    var n = g.n, m = g.m, i, cap = capacity || new Float64Array(m).fill(1);
    if (!(source >= 0 && source < n && sink >= 0 && sink < n) || source === sink) throw new RangeError('source and sink must be two different items of the graph');
    if (cap.length !== m) throw new RangeError('capacity needs one number per link');
    for (i = 0; i < m; i++) if (!(cap[i] >= 0)) throw new RangeError('link ' + i + ' has a negative or missing capacity');
    var fa = flowArcs(g), p = upload(g), q = scratch([4 * (n + 1), 8 * m, 8 * m, 16 * m, 4 * n, 4 * n, 4 * n, 4 * (n + 1), 8 * m]), b = mem.buffer, value, res;
    new Int32Array(b, q[0], n + 1).set(fa.os); new Int32Array(b, q[1], 2 * m).set(fa.arc); new Float64Array(b, q[2], m).set(cap);
    value = W.gw_maxflow(n, m, q[0], q[1], p.from, p.to, q[2], q[3], q[4], q[5], q[6], q[7], source, sink);
    res = new Float64Array(mem.buffer, q[3], 2 * m).slice();
    return flowResult(g, source, cap, res, value);
  }
  function closenessW(g, options) {
    options = options || {};
    var n = g.n, p = uploadRev(g, upload(g)), srcs = options.sources, i, k = 0, q = scratch([8 * n, 4 * n, 4 * n, 4 * (srcs ? srcs.length : n) + 4]), b = mem.buffer, list = new Int32Array(b, q[3], srcs ? srcs.length : n);
    if (srcs) { for (i = 0; i < srcs.length; i++) if (srcs[i] >= 0 && srcs[i] < n) list[k++] = srcs[i]; } else { for (i = 0; i < n; i++) list[i] = i; k = n; }
    new Float64Array(b, q[0], n).fill(0); new Int32Array(b, q[1], n).fill(-1);
    W.gw_closeness(n, p.is, p.ie, p.from, q[3], k, q[0], q[1], q[2], options.wassermanFaust ? 1 : 0);
    return new Float64Array(mem.buffer, q[0], n).slice();
  }
  function trianglesW(g) {
    var n = g.n, m = g.m, p = uploadRev(g, upload(g)), q = scratch([4 * n, 4 * n, 4 * (n + 1), 8 * m + 4, 4 * (n + 1), 4 * m + 4, 4 * n]), b = mem.buffer, total, deg, per, clustering, triples = 0, v, a, c;
    new Int32Array(b, q[0], n).fill(-1); new Int32Array(b, q[6], n).fill(0);
    total = W.gw_triangles(n, p.os, p.oe, p.to, p.is, p.ie, p.from, q[0], q[1], q[2], q[3], q[4], q[5], q[6]);
    deg = new Int32Array(mem.buffer, q[1], n); per = new Int32Array(mem.buffer, q[6], n).slice(); clustering = new Float64Array(n);
    for (v = 0; v < n; v++) { a = deg[v]; if (a > 1) { c = a * (a - 1) / 2; clustering[v] = per[v] / c; triples += c; } }
    return { total: total, perItem: per, clustering: clustering, transitivity: triples ? 3 * total / triples : 0 };
  }
  function louvainLoopW(n, off, nbr, wt, loop, kdeg, m2, res, minGain, owner) {
    var E = nbr.length, sz = [4 * (n + 1), 4 * E + 4, 8 * E + 8, 8 * n, 8 * n], q = scratch(sz.concat(sz, sz, [4 * n, 4 * n, 4 * n, 4 * (n + 1), 4 * n, 4 * n, 4 * n, 8 * n, 8 * n, 8 * n, 4 * n])), b = mem.buffer;
    // q[0..4] level 0 lists, q[5..9] and q[10..14] two work sets, then comm, rn, members, ms, fill, touched, seen, tot, wn, acc, owner
    new Int32Array(b, q[0], n + 1).set(off); new Int32Array(b, q[1], E).set(nbr); new Float64Array(b, q[2], E).set(wt); new Float64Array(b, q[3], n).set(loop); new Float64Array(b, q[4], n).set(kdeg);
    W.gw_louvain(n, q[0], q[1], q[2], q[3], q[4], m2, res, q[25], q[5], q[6], q[7], q[8], q[9], q[10], q[11], q[12], q[13], q[14], q[15], q[16], q[17], q[18], q[19], q[20], q[21], q[22], q[23], q[24]);
    owner.set(new Int32Array(mem.buffer, q[25], n));
  }
  function maxflow(g, source, sink, capacity) { return useWasm() ? maxflowW(g, source, sink, capacity) : maxflowJS(g, source, sink, capacity); }
  function closeness(g, options) { return useWasm() ? closenessW(g, options) : closenessJS(g, options); }
  function triangles(g) { return useWasm() ? trianglesW(g) : trianglesJS(g); }
  function kcore(g) { return useWasm() ? kcoreW(g) : kcoreJS(g); }
  function mst(g, weights) { return useWasm() ? mstW(g, weights) : mstJS(g, weights); }
  function pagerank(g, options) { return useWasm() ? pagerankW(g, options) : pagerankJS(g, options); }
  function betweenness(g, options) { return useWasm() ? betweennessW(g, options) : betweennessJS(g, options); }


  /* ---- betweenness split across workers: the start items are dealt out to helper threads, each adds up its share, the shares are summed; the helpers are kept for a while so repeated jobs skip the start-up ---- */
  /** Runs inside a worker (sent as text, so keep it free of outside names). A message with `n` loads a graph (and the wasm bytes, when given) and keeps it; every message with `srcs` runs a share and answers with its partial sums. */
  function workerMain() {
    var cur = null;   // { n, os, oe, to, is, ie, from, X, P, ready }
    function js(c, srcs) {
      var n = c.n, os = c.os, oe = c.oe, to = c.to, is = c.is, ie = c.ie, from = c.from, ns = srcs.length;
      var bc = new Float64Array(n), dist = new Int32Array(n).fill(-1), sigma = new Float64Array(n), delta = new Float64Array(n), q = new Int32Array(n), si, s, h, t, v, w, k, end, dv, cnt0, coef;
      for (si = 0; si < ns; si++) {
        s = srcs[si]; h = 0; t = 0; q[t++] = s; dist[s] = 0; sigma[s] = 1;
        while (h < t) { v = q[h++]; end = os[v + 1]; dv = dist[v] + 1; for (k = os[v]; k < end; k++) { w = to[oe[k]]; if (dist[w] < 0) { dist[w] = dv; q[t++] = w; } if (dist[w] === dv) sigma[w] += sigma[v]; } }
        cnt0 = t;
        while (t > 1) { w = q[--t]; end = is[w + 1]; dv = dist[w] - 1; coef = (1 + delta[w]) / sigma[w]; for (k = is[w]; k < end; k++) { v = from[ie[k]]; if (dist[v] === dv) delta[v] += sigma[v] * coef; } bc[w] += delta[w]; }
        for (k = 0; k < cnt0; k++) { v = q[k]; dist[v] = -1; sigma[v] = 0; delta[v] = 0; }
      }
      return bc;
    }
    function load(d) {
      var c = { n: d.n, os: d.os, oe: d.oe, to: d.to, is: d.is, ie: d.ie, from: d.from, X: null, P: null, ready: null };
      if (d.wasm) c.ready = WebAssembly.instantiate(d.wasm, {}).then(function (r) {
        var X = r.instance.exports, mem = X.memory, n = c.n, at = (X.__heap_base.value + 7) & ~7, P = {}, list = [['os', c.os], ['oe', c.oe], ['to', c.to], ['is', c.is], ['ie', c.ie], ['from', c.from]], i;
        for (i = 0; i < list.length; i++) { P[list[i][0]] = at; at = (at + 4 * list[i][1].length + 7) & ~7; }
        P.srcs = at; at += 4 * n; P.bc = at; at += 8 * n; P.sigma = at; at += 8 * n; P.delta = at; at += 8 * n; P.dist = at; at += 4 * n; P.q = at; at += 4 * n;
        if (at > mem.buffer.byteLength) mem.grow(Math.ceil((at - mem.buffer.byteLength) / 65536));
        var all = new Int32Array(mem.buffer);
        for (i = 0; i < list.length; i++) all.set(list[i][1], P[list[i][0]] >> 2);
        new Int32Array(mem.buffer, P.dist, n).fill(-1);
        c.X = X; c.P = P;
      }, function () { c.X = null; });
      return c;
    }
    onmessage = function (ev) {
      var d = ev.data;
      if (d.n !== undefined) cur = load(d);
      function run() {
        var c = cur, bc;
        if (c.X) {
          var mem = c.X.memory, P = c.P, n = c.n;
          new Int32Array(mem.buffer, P.srcs, d.srcs.length).set(d.srcs);
          new Float64Array(mem.buffer, P.bc, n).fill(0);
          c.X.gw_betweenness(n, P.os, P.oe, P.to, P.is, P.ie, P.from, P.srcs, d.srcs.length, P.bc, P.dist, P.sigma, P.delta, P.q);
          bc = new Float64Array(mem.buffer, P.bc, n).slice();
        } else bc = js(c, d.srcs);
        postMessage({ job: d.job, bc: bc }, [bc.buffer]);
      }
      if (cur.ready) cur.ready.then(run); else run();
    };
  }
  var pool = null, poolTimer = 0, gids = 0, jobs = 0;
  /** Ends the kept helper threads now (they also end by themselves after `idleMs` without work, 5 seconds by default). */
  function closePool() { if (poolTimer) { clearTimeout(poolTimer); poolTimer = 0; } if (pool) { for (var i = 0; i < pool.workers.length; i++) pool.workers[i].terminate(); try { URL.revokeObjectURL(pool.url); } catch (e) { /* gone */ } pool = null; } }
  function getPool(count, onDead) {
    if (pool && pool.workers.length === count) return pool;
    closePool();
    var url = URL.createObjectURL(new Blob(['(' + workerMain.toString() + ')()'], { type: 'text/javascript' })), P = { url: url, workers: [], loaded: [], jobs: {} }, i;
    P.dead = function () { var js = P.jobs; closePool(); P.jobs = {}; for (var k in js) js[k].fail(); };
    for (i = 0; i < count; i++) {
      var wk = new Worker(url); P.workers.push(wk); P.loaded.push(null);
      wk.onmessage = function (ev) { var j = P.jobs[ev.data.job]; if (j) j.add(ev.data.bc); };
      wk.onerror = P.dead;
    }
    return (pool = P);
  }
  /**
   * Same answer as `betweenness`, but the start items are dealt out to `workers` helper threads (default: the cores the browser reports, at most 8) and the partial sums added; returns a Promise of the Float64Array.
   * The helpers stay alive for `idleMs` (default 5000) after the last job and keep the last graph they were given, so repeated jobs on one graph pay neither start-up nor the copy; `pool: false` makes them for the one call and closes them after.
   * Falls back to the calling thread when there are no workers (older browsers, a page whose policy forbids blob workers, tiny jobs). options: as `betweenness`, plus workers, pool, idleMs, minWork (start items times items-plus-links below which the calling thread does it, default 4e6).
   */
  function betweennessAsync(g, options) {
    options = options || {};
    var n = g.n, srcs = [], i, k, hw = (typeof navigator === 'object' && navigator.hardwareConcurrency) || 1, count = options.workers || Math.min(8, hw), src = options.sources, keep = options.pool !== false;
    for (i = 0; i < (src ? src.length : n); i++) { k = src ? src[i] : i; if (k >= 0 && k < n) srcs.push(k); }
    if (count < 2 || typeof Worker !== 'function' || typeof Blob !== 'function' || typeof URL !== 'function' || srcs.length < 2 * count || srcs.length * (n + g.m) < (options.minWork === undefined ? 4e6 : options.minWork)) return Promise.resolve(betweenness(g, options));   // small jobs finish faster on the calling thread
    reverse(g);
    return new Promise(function (resolve) {
      var P, total = new Float64Array(n), pending = count, id = ++jobs, wasmOn = useWasm(), key, done = false;
      function finish(ok) {
        if (done) return; done = true; if (P) delete P.jobs[id];
        if (!keep) closePool(); else { if (poolTimer) clearTimeout(poolTimer); poolTimer = setTimeout(closePool, options.idleMs === undefined ? 5000 : options.idleMs); }
        if (!ok) { resolve(betweenness(g, options)); return; }
        if (options.normalized !== false && n > 2) { var scale = 1 / ((n - 1) * (n - 2)); for (var j = 0; j < n; j++) total[j] *= scale; }
        resolve(total);
      }
      try {
        P = getPool(count);
        if (poolTimer) { clearTimeout(poolTimer); poolTimer = 0; }
        if (!g._gid) g._gid = ++gids;
        key = g._gid + (wasmOn ? 'w' : 'j');
        P.jobs[id] = { add: function (bc) { for (var j = 0; j < n; j++) total[j] += bc[j]; if (--pending === 0) finish(true); }, fail: function () { finish(false); } };
        for (i = 0; i < count; i++) {
          var list = new Int32Array(Math.ceil((srcs.length - i) / count)); for (k = 0; k < list.length; k++) list[k] = srcs[i + k * count];
          var msg = { job: id, srcs: list };
          if (P.loaded[i] !== key) { msg.n = n; msg.os = g.outStart; msg.oe = g.outEdge; msg.to = g.to; msg.is = g.inStart; msg.ie = g.inEdge; msg.from = g.from; msg.wasm = wasmOn ? b64bytes(WASM_B64) : null; P.loaded[i] = key; }
          P.workers[i].postMessage(msg, [list.buffer]);
        }
      } catch (e) { finish(false); }
    });
  }

  /** Gives back the WebAssembly copy of a graph's arrays when it is the newest one kept; otherwise the space stays until the page closes. */
  function free(g) { var p = g._wp; if (p) { if (p.end === permEnd) permEnd = p.start; g._wp = null; } }
  start();   // compile early


  /**
   * Core numbers: the largest k for which an item stays when everything with fewer than k links is peeled away repeatedly. Links count in both directions, every link on its own (parallel links count each time), self-links not at all.
   * Returns { core: Int32Array(n), max }. Batagelj and Zaversnik, linear in items plus links.
   */
  function kcoreJS(g) {
    reverse(g);
    var n = g.n, os = g.outStart, oe = g.outEdge, to = g.to, from = g.from, is = g.inStart, ie = g.inEdge, deg = new Int32Array(n), pos = new Int32Array(n), vert = new Int32Array(n), v, u, e, k, end, md = 0, i, d, start = 0, bin, du, pu, pw, w;
    for (v = 0; v < n; v++) {
      d = os[v + 1] - os[v] + is[v + 1] - is[v];
      end = os[v + 1]; for (k = os[v]; k < end; k++) if (to[oe[k]] === v) d -= 2;   // a self-link sits in both lists
      deg[v] = d; if (d > md) md = d;
    }
    bin = new Int32Array(md + 2);
    for (v = 0; v < n; v++) bin[deg[v]]++;
    for (d = 0; d <= md; d++) { i = bin[d]; bin[d] = start; start += i; }
    for (v = 0; v < n; v++) { pos[v] = bin[deg[v]]++; vert[pos[v]] = v; }
    for (d = md; d > 0; d--) bin[d] = bin[d - 1];
    bin[0] = 0;
    for (i = 0; i < n; i++) {
      v = vert[i]; d = deg[v];
      end = os[v + 1];
      for (k = os[v]; k < end; k++) {
        u = to[oe[k]];
        if (u !== v && deg[u] > d) { du = deg[u]; pu = pos[u]; pw = bin[du]; w = vert[pw]; if (u !== w) { pos[u] = pw; vert[pu] = w; pos[w] = pu; vert[pw] = u; } bin[du]++; deg[u]--; }
      }
      end = is[v + 1];
      for (k = is[v]; k < end; k++) {
        u = from[ie[k]];
        if (u !== v && deg[u] > d) { du = deg[u]; pu = pos[u]; pw = bin[du]; w = vert[pw]; if (u !== w) { pos[u] = pw; vert[pw] = u; vert[pu] = w; pos[w] = pu; } bin[du]++; deg[u]--; }
      }
    }
    for (v = 0, d = 0; v < n; v++) if (deg[v] > d) d = deg[v];
    return { core: deg, max: d };
  }

  /**
   * Cheapest set of links joining every group of items (a minimum spanning forest, directions ignored), Kruskal with a radix sort on the weights. Returns { links: Int32Array of link numbers in
   * ascending weight order (ties by link number), total }. Weights: one number per link (negative allowed, not NaN).
   */
  function mstJS(g, weights) {
    var n = g.n, m = g.m, from = g.from, to = g.to, i, a, b, pass, k, c, src, dst, cnt, p = new Int32Array(n), out = new Int32Array(Math.max(0, n - 1)), no = 0, total = 0;
    if (!weights || weights.length !== m) throw new RangeError('weights needs one number per link');
    // sort link numbers by weight: the bit pattern of a double, with its sign handled, orders like the number; four stable passes of 16 bits
    var lo = new Uint32Array(m), hi = new Uint32Array(m), f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer), L = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1 ? 0 : 1;
    for (i = 0; i < m; i++) {
      f64[0] = weights[i]; if (f64[0] !== f64[0]) throw new RangeError('link ' + i + ' has no weight');
      a = u32[L]; b = u32[1 - L];
      if (b >>> 31) { a = ~a >>> 0; b = ~b >>> 0; } else b = (b | 0x80000000) >>> 0;
      lo[i] = a; hi[i] = b;
    }
    src = new Int32Array(m); dst = new Int32Array(m); for (i = 0; i < m; i++) src[i] = i;
    cnt = new Int32Array(65537);
    for (pass = 0; pass < 4; pass++) {
      var key = pass < 2 ? lo : hi, shift = (pass & 1) * 16;
      cnt.fill(0);
      for (i = 0; i < m; i++) cnt[((key[src[i]] >>> shift) & 65535) + 1]++;
      for (i = 0; i < 65536; i++) cnt[i + 1] += cnt[i];
      for (i = 0; i < m; i++) { k = src[i]; dst[cnt[(key[k] >>> shift) & 65535]++] = k; }
      c = src; src = dst; dst = c;
    }
    for (i = 0; i < n; i++) p[i] = i;
    for (i = 0; i < m && no < n - 1; i++) {
      k = src[i]; a = from[k]; b = to[k];
      while (p[a] !== a) { p[a] = p[p[a]]; a = p[a]; }
      while (p[b] !== b) { p[b] = p[p[b]]; b = p[b]; }
      if (a !== b) { if (a < b) p[b] = a; else p[a] = b; out[no++] = k; total += weights[k]; }
    }
    return { links: out.subarray(0, no), total: total };
  }

  /**
   * PageRank by power iteration (the textbook form: damping `alpha`, items with no outgoing links share their rank evenly, stop when the total change is under n * tolerance).
   * options: alpha (0.85), tolerance (1e-6), maxIterations (100), weights (one per link; each item's rank is split by weight). Returns { rank: Float64Array summing to 1, iterations, converged }.
   */
  function pagerankJS(g, options) {
    options = options || {};
    var n = g.n, m = g.m, os = g.outStart, oe = g.outEdge, to = g.to, alpha = options.alpha === undefined ? 0.85 : options.alpha, tol = options.tolerance === undefined ? 1e-6 : options.tolerance,
        maxIt = options.maxIterations === undefined ? 100 : options.maxIterations, w = options.weights, i, k, end, c, err, dangle, it = 0, converged = false, p = 1 / n, tmp, x, y, sum, base;
    if (w && w.length !== m) throw new RangeError('weights needs one number per link');
    if (n === 0) return { rank: new Float64Array(0), iterations: 0, converged: true };
    x = new Float64Array(n).fill(p); y = new Float64Array(n);
    var dang = [], share = new Float64Array(n), wsum = w ? new Float64Array(n) : null;
    for (i = 0; i < n; i++) {
      if (w) { sum = 0; end = os[i + 1]; for (k = os[i]; k < end; k++) sum += w[oe[k]]; wsum[i] = sum; if (!(sum > 0)) dang.push(i); }
      else if (os[i + 1] === os[i]) dang.push(i);
    }
    while (it < maxIt) {
      dangle = 0; for (i = 0; i < dang.length; i++) dangle += x[dang[i]];
      base = (alpha * dangle + (1 - alpha)) * p;
      y.fill(base);
      for (i = 0; i < n; i++) {
        end = os[i + 1]; if (end === os[i]) continue;
        if (w) { if (!(wsum[i] > 0)) continue; c = alpha * x[i] / wsum[i]; for (k = os[i]; k < end; k++) y[to[oe[k]]] += c * w[oe[k]]; }
        else { c = alpha * x[i] / (end - os[i]); for (k = os[i]; k < end; k++) y[to[oe[k]]] += c; }
      }
      err = 0; for (i = 0; i < n; i++) err += Math.abs(y[i] - x[i]);
      tmp = x; x = y; y = tmp; it++;
      if (err < n * tol) { converged = true; break; }
    }
    return { rank: x, iterations: it, converged: converged };
  }

  /**
   * Betweenness centrality by fewest links (Brandes): how many of the shortest paths between other pairs run through each item, links followed in their direction, parallel links counted as separate paths.
   * options: normalized (true: divide by (n-1)(n-2)), sources (an array of start items to use instead of all, for a sampled estimate; not rescaled). Returns Float64Array(n).
   */
  function betweennessJS(g, options) {
    reverse(g); options = options || {};
    var n = g.n, os = g.outStart, oe = g.outEdge, to = g.to, from = g.from, is = g.inStart, ie = g.inEdge, bc = new Float64Array(n), dist = new Int32Array(n).fill(-1), sigma = new Float64Array(n), delta = new Float64Array(n), q = new Int32Array(n),
        srcs = options.sources, ns = srcs ? srcs.length : n, cnt0, si, s, h, t, v, w, k, end, dv, coef, scale;
    for (si = 0; si < ns; si++) {
      s = srcs ? srcs[si] : si; if (!(s >= 0 && s < n)) continue;
      h = 0; t = 0; q[t++] = s; dist[s] = 0; sigma[s] = 1;
      while (h < t) {
        v = q[h++]; end = os[v + 1]; dv = dist[v] + 1;
        for (k = os[v]; k < end; k++) { w = to[oe[k]]; if (dist[w] < 0) { dist[w] = dv; q[t++] = w; } if (dist[w] === dv) sigma[w] += sigma[v]; }
      }
      cnt0 = t;
      while (t > 1) {   // farthest first; delta of an item is settled before its parents read it
        w = q[--t]; end = is[w + 1]; dv = dist[w] - 1; coef = (1 + delta[w]) / sigma[w];
        for (k = is[w]; k < end; k++) { v = from[ie[k]]; if (dist[v] === dv) delta[v] += sigma[v] * coef; }
        bc[w] += delta[w];
      }
      for (k = 0; k < cnt0; k++) { v = q[k]; dist[v] = -1; sigma[v] = 0; delta[v] = 0; }
    }
    if (options.normalized !== false && n > 2) { scale = 1 / ((n - 1) * (n - 2)); for (k = 0; k < n; k++) bc[k] *= scale; }
    return bc;
  }


  /** Residual arcs of every item, built once per graph and kept on it: arc 2i is link i forward, arc 2i+1 its backward twin; g._fa.os / g._fa.arc list each item's arcs. */
  function flowArcs(g) {
    if (g._fa) return g._fa;
    var n = g.n, m = g.m, from = g.from, to = g.to, os = new Int32Array(n + 1), arc = new Int32Array(2 * m), i;
    for (i = 0; i < m; i++) { os[from[i]]++; os[to[i]]++; }
    for (i = 1; i < n; i++) os[i] += os[i - 1];
    for (i = m - 1; i >= 0; i--) { arc[--os[to[i]]] = 2 * i + 1; arc[--os[from[i]]] = 2 * i; }
    os[n] = 2 * m; g._fa = { os: os, arc: arc };
    return g._fa;
  }
  function flowResult(g, s, cap, res, value) {
    var n = g.n, m = g.m, from = g.from, to = g.to, os = g._fa.os, arc = g._fa.arc, flow = new Float64Array(m), reach = new Uint8Array(n), q = new Int32Array(n), h = 0, t = 0, i, v, a, w, k, cl = [];
    for (i = 0; i < m; i++) flow[i] = res[2 * i + 1];
    reach[s] = 1; q[t++] = s;
    while (h < t) { v = q[h++]; for (k = os[v]; k < os[v + 1]; k++) { a = arc[k]; w = (a & 1) ? from[a >> 1] : to[a >> 1]; if (!reach[w] && res[a] > 0) { reach[w] = 1; q[t++] = w; } } }
    for (i = 0; i < m; i++) if (reach[from[i]] && !reach[to[i]] && cap[i] > 0) cl.push(i);
    return { value: value, flow: flow, side: reach, cut: Int32Array.from(cl) };
  }
  /**
   * Largest total that can be sent from `source` to `sink` along links, each link carrying at most its capacity (Dinic, no recursion). capacity: one non-negative number per link, input order (default 1 each).
   * Returns { value, flow (Float64Array per link), side (1 for items on the source side of a smallest cut), cut (Int32Array of the links that cross it, all full) }. Self-links carry nothing.
   */
  function maxflowJS(g, source, sink, capacity) {
    var n = g.n, m = g.m, i, end;
    if (!(source >= 0 && source < n && sink >= 0 && sink < n) || source === sink) throw new RangeError('source and sink must be two different items of the graph');
    var cap = capacity || new Float64Array(m).fill(1);
    if (cap.length !== m) throw new RangeError('capacity needs one number per link');
    var fa = flowArcs(g), os = fa.os, arc = fa.arc, from = g.from, to = g.to, res = new Float64Array(2 * m), level = new Int32Array(n), it = new Int32Array(n), q = new Int32Array(n), path = new Int32Array(n + 1), value = 0, h, t, v, w, a, k, sp, f, adv;
    for (i = 0; i < m; i++) { if (!(cap[i] >= 0)) throw new RangeError('link ' + i + ' has a negative or missing capacity'); res[2 * i] = from[i] === to[i] ? 0 : cap[i]; }
    for (;;) {
      level.fill(-1); level[source] = 0; h = 0; t = 0; q[t++] = source;
      while (h < t && level[sink] < 0) { v = q[h++]; for (k = os[v]; k < os[v + 1]; k++) { a = arc[k]; if (res[a] > 0) { w = (a & 1) ? from[a >> 1] : to[a >> 1]; if (level[w] < 0) { level[w] = level[v] + 1; q[t++] = w; } } } }
      if (level[sink] < 0) break;
      for (v = 0; v < n; v++) it[v] = os[v];
      sp = 0; v = source;
      for (;;) {
        if (v === sink) {
          f = Infinity; for (k = 0; k < sp; k++) if (res[path[k]] < f) f = res[path[k]];
          for (k = 0; k < sp; k++) { res[path[k]] -= f; res[path[k] ^ 1] += f; }
          value += f;
          for (k = 0; k < sp; k++) if (res[path[k]] === 0) break;   // back up to the first full arc
          sp = k; v = k === 0 ? source : ((path[k - 1] & 1) ? from[path[k - 1] >> 1] : to[path[k - 1] >> 1]);
          continue;
        }
        adv = false; end = os[v + 1];
        for (; it[v] < end; it[v]++) { a = arc[it[v]]; if (res[a] > 0) { w = (a & 1) ? from[a >> 1] : to[a >> 1]; if (level[w] === level[v] + 1) { path[sp++] = a; v = w; adv = true; break; } } }
        if (adv) continue;
        if (v === source) break;
        level[v] = -1; a = path[--sp]; v = (a & 1) ? to[a >> 1] : from[a >> 1]; it[v]++;
      }
    }
    return flowResult(g, source, cap, res, value);
  }


  /**
   * Closeness: for each item, (items that can reach it) divided by the sum of their link distances to it (0 when nothing reaches it) — the same definition graphology uses (walks backwards along links).
   * options: wassermanFaust (multiply by reached / (n - 1), good for networks in pieces), sources (an array of items to compute; the others stay 0). Returns Float64Array(n).
   */
  function closenessJS(g, options) {
    reverse(g); options = options || {};
    var n = g.n, is = g.inStart, ie = g.inEdge, from = g.from, out = new Float64Array(n), dist = new Int32Array(n).fill(-1), q = new Int32Array(n), srcs = options.sources, ns = srcs ? srcs.length : n, si, s, h, t, v, w, k, end, total, dv, i;
    for (si = 0; si < ns; si++) {
      s = srcs ? srcs[si] : si; if (!(s >= 0 && s < n)) continue;
      h = 0; t = 0; q[t++] = s; dist[s] = 0; total = 0;
      while (h < t) { v = q[h++]; end = is[v + 1]; dv = dist[v] + 1; for (k = is[v]; k < end; k++) { w = from[ie[k]]; if (dist[w] < 0) { dist[w] = dv; q[t++] = w; total += dv; } } }
      if (total > 0 && n > 1) { out[s] = (t - 1) / total; if (options.wassermanFaust) out[s] *= (t - 1) / (n - 1); }
      for (i = 0; i < t; i++) dist[q[i]] = -1;
    }
    return out;
  }

  /**
   * Triangles in the network with directions, self-links and repeated links ignored. Returns { total, perItem (Int32Array: triangles each item is in), clustering (Float64Array: share of an item's neighbor pairs that are linked),
   * transitivity (3 * triangles / connected triples) }. Each triangle is found once, from its lowest-ranked corner (rank: fewer neighbors first).
   */
  function trianglesJS(g) {
    reverse(g);
    var n = g.n, os = g.outStart, oe = g.outEdge, to = g.to, is = g.inStart, ie = g.inEdge, from = g.from, mark = new Int32Array(n).fill(-1), deg = new Int32Array(n), st = new Int32Array(n + 1), v, k, end, u, i, e = 0, adj;
    for (v = 0; v < n; v++) {   // distinct neighbors of every item
      end = os[v + 1]; for (k = os[v]; k < end; k++) { u = to[oe[k]]; if (u !== v && mark[u] !== v) { mark[u] = v; deg[v]++; } }
      end = is[v + 1]; for (k = is[v]; k < end; k++) { u = from[ie[k]]; if (u !== v && mark[u] !== v) { mark[u] = v; deg[v]++; } }
    }
    for (v = 0; v < n; v++) st[v + 1] = st[v] + deg[v];
    adj = new Int32Array(st[n]); mark.fill(-1);
    for (v = 0; v < n; v++) {
      e = st[v];
      end = os[v + 1]; for (k = os[v]; k < end; k++) { u = to[oe[k]]; if (u !== v && mark[u] !== v) { mark[u] = v; adj[e++] = u; } }
      end = is[v + 1]; for (k = is[v]; k < end; k++) { u = from[ie[k]]; if (u !== v && mark[u] !== v) { mark[u] = v; adj[e++] = u; } }
    }
    // keep only links toward higher-ranked items, then count with a mark per start item
    var hs = new Int32Array(n + 1), hi = new Int32Array(st[n] >> 1 || 1), per = new Int32Array(n), total = 0, w, hp = 0, a, b;
    for (v = 0; v < n; v++) { hs[v] = hp; for (k = st[v]; k < st[v + 1]; k++) { u = adj[k]; if (deg[u] > deg[v] || (deg[u] === deg[v] && u > v)) hi[hp++] = u; } }
    hs[n] = hp; mark.fill(-1);
    for (v = 0; v < n; v++) {
      for (k = hs[v]; k < hs[v + 1]; k++) mark[hi[k]] = v;
      for (k = hs[v]; k < hs[v + 1]; k++) { u = hi[k]; for (i = hs[u]; i < hs[u + 1]; i++) { w = hi[i]; if (mark[w] === v) { total++; per[v]++; per[u]++; per[w]++; } } }
    }
    var clustering = new Float64Array(n), triples = 0;
    for (v = 0; v < n; v++) { a = deg[v]; if (a > 1) { b = a * (a - 1) / 2; clustering[v] = per[v] / b; triples += b; } }
    return { total: total, perItem: per, clustering: clustering, transitivity: triples ? 3 * total / triples : 0 };
  }

  /**
   * Groups of items that link to each other much more than chance (Louvain: move items between groups while modularity rises, merge groups, repeat). Directions are ignored; `weights` (one per link) default to 1.
   * options: resolution (1; higher gives more, smaller groups), weights, minGain (1e-7). Deterministic (items visited in order). Returns { id: Int32Array (0.. count - 1, biggest first), count, modularity }.
   */
  /** The merge-and-move levels of Louvain on the weighted symmetric lists (off, nbr, wt, loop, kdeg); fills `owner` (original item -> group number). */
  function louvainLoopJS(n, off, nbr, wt, loop, kdeg, m2, res, minGain, owner) {
    var N = n, v, x, k, i;
    for (v = 0; v < n; v++) owner[v] = v;
    if (m2 > 0) for (;;) {
      var comm = new Int32Array(N), tot = Float64Array.from(kdeg), wn = new Float64Array(N), touched = new Int32Array(N), moved = 0, anyMove = false, pass, ci, nt, c, gain, best, bestGain, kv, j;
      for (v = 0; v < N; v++) comm[v] = v;
      for (pass = 0; pass < 100; pass++) {
        moved = 0;
        for (v = 0; v < N; v++) {
          ci = comm[v]; kv = kdeg[v]; nt = 0;
          for (k = off[v]; k < off[v + 1]; k++) { c = comm[nbr[k]]; if (wn[c] === 0) touched[nt++] = c; wn[c] += wt[k]; }
          tot[ci] -= kv; best = ci; bestGain = wn[ci] - res * tot[ci] * kv / m2;
          for (j = 0; j < nt; j++) { c = touched[j]; gain = wn[c] - res * tot[c] * kv / m2; if (gain > bestGain + 1e-12) { bestGain = gain; best = c; } }
          for (j = 0; j < nt; j++) wn[touched[j]] = 0;
          tot[best] += kv; if (best !== ci) { comm[v] = best; moved++; }
        }
        if (moved === 0) break; anyMove = true;
        if (moved < N * 1e-9) break;
      }
      if (!anyMove) break;
      var rn = new Int32Array(N).fill(-1), cnt = 0;
      for (v = 0; v < N; v++) { if (rn[comm[v]] < 0) rn[comm[v]] = cnt++; }
      for (v = 0; v < n; v++) owner[v] = rn[comm[owner[v]]];
      if (cnt === N) break;
      // next level: one item per group
      var members = new Int32Array(N), ms = new Int32Array(cnt + 1);
      for (v = 0; v < N; v++) ms[rn[comm[v]] + 1]++;
      for (c = 0; c < cnt; c++) ms[c + 1] += ms[c];
      var fill = ms.slice(0, cnt); for (v = 0; v < N; v++) members[fill[rn[comm[v]]]++] = v;
      var noff = new Int32Array(cnt + 1), nloop = new Float64Array(cnt), acc = new Float64Array(cnt), seen = new Int32Array(cnt).fill(-1), ln = [], lw = [], listStart, nk = new Float64Array(cnt);
      for (c = 0; c < cnt; c++) {
        listStart = ln.length;
        for (j = ms[c]; j < ms[c + 1]; j++) {
          v = members[j]; nloop[c] += loop[v] || 0;
          for (k = off[v]; k < off[v + 1]; k++) { var cj = rn[comm[nbr[k]]]; if (cj === c) nloop[c] += wt[k]; else { if (seen[cj] !== c) { seen[cj] = c; acc[cj] = 0; ln.push(cj); } acc[cj] += wt[k]; } }
        }
        for (j = listStart; j < ln.length; j++) lw.push(acc[ln[j]]);
        noff[c + 1] = ln.length;
      }
      off = noff; nbr = Int32Array.from(ln); wt = Float64Array.from(lw); loop = nloop; N = cnt;
      kdeg = new Float64Array(N); for (v = 0; v < N; v++) { x = loop[v]; for (k = off[v]; k < off[v + 1]; k++) x += wt[k]; kdeg[v] = x; }
    }
  }

  function communitiesJS(g, options) {
    options = options || {};
    var n = g.n, m = g.m, from = g.from, to = g.to, w = options.weights, res = options.resolution === undefined ? 1 : options.resolution, minGain = options.minGain === undefined ? 1e-7 : options.minGain, i, a, b, x, k;
    if (w && w.length !== m) throw new RangeError('weights needs one number per link');
    if (n === 0) return { id: new Int32Array(0), count: 0, modularity: 0 };
    var off = new Int32Array(n + 1), loop = new Float64Array(n);
    for (i = 0; i < m; i++) { a = from[i]; b = to[i]; if (a === b) continue; off[a + 1]++; off[b + 1]++; }
    for (i = 0; i < n; i++) off[i + 1] += off[i];
    var nbr = new Int32Array(off[n]), wt = new Float64Array(off[n]), at = off.slice(0, n);
    for (i = 0; i < m; i++) { a = from[i]; b = to[i]; x = w ? w[i] : 1; if (a === b) { loop[a] += 2 * x; continue; } nbr[at[a]] = b; wt[at[a]++] = x; nbr[at[b]] = a; wt[at[b]++] = x; }
    var N = n, kdeg = new Float64Array(n), m2 = 0, v;
    for (v = 0; v < n; v++) { x = loop[v]; for (k = off[v]; k < off[v + 1]; k++) x += wt[k]; kdeg[v] = x; m2 += x; }
    var N = n, owner = new Int32Array(n), v, c, j;
    var off0 = off, nbr0 = nbr, wt0 = wt, loop0 = loop, k0 = kdeg;
    if (useWasm() && m2 > 0) louvainLoopW(n, off, nbr, wt, loop, kdeg, m2, res, minGain, owner); else louvainLoopJS(n, off, nbr, wt, loop, kdeg, m2, res, minGain, owner);
    // order groups by size (biggest first), then compute modularity on the original network
    var size = new Int32Array(n); for (v = 0; v < n; v++) size[owner[v]]++;
    var ids = []; for (v = 0; v < n; v++) if (size[v]) ids.push(v);
    ids.sort(function (p, q) { return size[q] - size[p] || p - q; });
    var remap = new Int32Array(n).fill(-1); for (j = 0; j < ids.length; j++) remap[ids[j]] = j;
    var id = new Int32Array(n); for (v = 0; v < n; v++) id[v] = remap[owner[v]];
    var inW = new Float64Array(ids.length), totW = new Float64Array(ids.length), q = 0;
    for (v = 0; v < n; v++) { c = id[v]; totW[c] += k0[v]; inW[c] += loop0[v]; for (k = off0[v]; k < off0[v + 1]; k++) if (id[nbr0[k]] === c) inW[c] += wt0[k]; }
    if (m2 > 0) for (c = 0; c < ids.length; c++) q += inW[c] / m2 - res * (totW[c] / m2) * (totW[c] / m2);
    return { id: id, count: ids.length, modularity: q };
  }

  /**
   * Longest path through a network with no loops (the critical path of a plan): `weights` are the lengths of the links (default 1; may be negative). Returns { complete (false when a loop exists, then nothing else is set),
   * length, links (Int32Array, walking order), end (the item the path ends at), dist (Float64Array: longest way to reach each item, starting anywhere; 0 for an empty way), via (last link into each item, -1 at starts) }.
   */
  function criticalPath(g, weights) {
    var t = topo(g), n = g.n, os = g.outStart, oe = g.outEdge, to = g.to, from = g.from, i, v, k, e, x, d, dist, via, best = -1, links = [];
    if (!t.complete) return { complete: false, length: NaN, links: new Int32Array(0), end: -1, dist: null, via: null };
    if (weights && weights.length !== g.m) throw new RangeError('weights needs one number per link');
    dist = new Float64Array(n); via = new Int32Array(n).fill(-1);
    for (i = 0; i < n; i++) {
      v = t.order[i]; d = dist[v];
      for (k = os[v]; k < os[v + 1]; k++) { e = oe[k]; x = to[e]; if (d + (weights ? weights[e] : 1) > dist[x]) { dist[x] = d + (weights ? weights[e] : 1); via[x] = e; } }
    }
    for (v = 0; v < n; v++) if (best < 0 || dist[v] > dist[best]) best = v;
    if (best < 0) return { complete: true, length: 0, links: new Int32Array(0), end: -1, dist: dist, via: via };
    for (v = best; via[v] >= 0; v = from[via[v]]) links.push(via[v]);
    links.reverse();
    return { complete: true, length: dist[best], links: Int32Array.from(links), end: best, dist: dist, via: via };
  }


  /**
   * An index for many cheapest-path questions on one network: distances from and to a few well-spread "landmark" items (farthest-first picks), then `landmarkPath` uses them to steer the search (A*, the ALT bounds)
   * so fewer items are touched than in `path`. Answers are as exact as `path`. options: count (8 landmarks), weights (one non-negative number per link, default 1).
   * Memory: 2 * count * n numbers. Worth it for many questions on one network, most on long thin ones (roads, grids), much less on short bushy ones.
   */
  function landmarks(g, options) {
    options = options || {};
    var n = g.n, m = g.m, count = Math.min(options.count || 8, n), w = options.weights || new Float64Array(m).fill(1), rg, fwd = [], bwd = [], ids = [], minD = new Float64Array(n).fill(Infinity), v, best, r, d, c, dv;
    if (w.length !== m) throw new RangeError('weights needs one number per link');
    if (n === 0 || count < 1) return { g: g, w: w, count: 0, ids: ids, fwd: fwd, bwd: bwd };
    rg = csr(n, g.to, g.from);
    r = shortest(g, 0, w).dist; best = 0; for (v = 0; v < n; v++) if (r[v] < Infinity && r[v] >= r[best]) best = v;   // first landmark: farthest from item 0; then farthest-first on the smallest distance to those already picked
    for (c = 0; c < count; c++) {
      ids.push(best); d = shortest(g, best, w).dist; fwd.push(d); bwd.push(shortest(rg, best, w).dist);
      for (v = 0; v < n; v++) { dv = Math.min(d[v], bwd[c][v]); if (dv < minD[v]) minD[v] = dv; }
      best = -1; for (v = 0; v < n; v++) if (minD[v] < Infinity && minD[v] > 0 && (best < 0 || minD[v] > minD[best])) best = v;
      if (best < 0) break;
    }
    return { g: g, w: w, count: fwd.length, ids: ids, fwd: fwd, bwd: bwd };
  }
  /** One cheapest path steered by a landmark index: { cost, links } or null. Same answer as `path` (up to rounding in the last digit). */
  function landmarkPath(ix, src, target) {
    var g = ix.g, n = g.n, w = ix.w, os = g.outStart, oe = g.outEdge, to = g.to, from = g.from, L = ix.count, fwd = ix.fwd, bwd = ix.bwd, i, k, e, x, v, nd, end;
    if (!(src >= 0 && src < n && target >= 0 && target < n)) return null;
    if (src === target) return { cost: 0, links: [] };
    var S = ix._s || (ix._s = { gs: new Float64Array(n).fill(Infinity), key: new Float64Array(n).fill(Infinity), hs: new Float64Array(n), via: new Int32Array(n), heap: null });
    if (!S.heap) S.heap = new Heap(n, S.key);
    var gs = S.gs, key = S.key, hs = S.hs, via = S.via, heap = S.heap, tf = new Float64Array(L), tb = new Float64Array(L), found = false;
    for (i = 0; i < L; i++) { tf[i] = fwd[i][target]; tb[i] = bwd[i][target]; }
    function h(u) { var best = 0, a, j; for (j = 0; j < L; j++) { a = tf[j] - fwd[j][u]; if (a > best && a < Infinity) best = a; a = bwd[j][u] - tb[j]; if (a > best && a < Infinity) best = a; } return best; }
    try {
      gs[src] = 0; hs[src] = h(src); key[src] = hs[src]; heap.up(src);
      while (heap.size) {
        v = heap.pop();
        if (v === target) { found = true; break; }
        end = os[v + 1];
        for (k = os[v]; k < end; k++) {
          e = oe[k]; x = to[e]; if (heap.pos[x] === -2) continue;
          if (!(w[e] >= 0)) throw new RangeError('link ' + e + ' has a negative or missing weight');
          nd = gs[v] + w[e];
          if (nd < gs[x]) { if (heap.pos[x] === -1) hs[x] = h(x); gs[x] = nd; via[x] = e; key[x] = nd + hs[x]; heap.up(x); }
        }
      }
      if (!found) return null;
      var links = []; for (v = target; v !== src; v = from[via[v]]) links.push(via[v]);
      return { cost: gs[target], links: links.reverse() };
    } finally {
      for (i = 0; i < heap.nt; i++) gs[heap.touched[i]] = Infinity;
      heap.clear();
    }
  }

  /** Link numbers from the start of a `shortest` result to `target`, in walking order; [] when target is the start, null when it was not reached. */
  function pathTo(g, r, target) {
    if (!(target >= 0 && target < g.n) || r.dist[target] === Infinity) return null;
    var out = [], v = target, e;
    while ((e = r.via[v]) >= 0) { out.push(e); v = g.from[e]; }
    return out.reverse();
  }
  return { version: '0.8.0', api: 0, csr: csr, bfs: bfs, loops: loops, components: components, scc: scc, topo: topo, shortest: shortest, pathTo: pathTo, path: path, maxflow: maxflow, closeness: closeness, triangles: triangles, communities: communitiesJS, criticalPath: criticalPath, landmarks: landmarks, landmarkPath: landmarkPath, kcore: kcore, mst: mst, pagerank: pagerank, betweenness: betweenness, betweennessAsync: betweennessAsync, closePool: closePool, free: free, ready: start, accelerated: useWasm, setBackend: function (b) { if (b !== 'auto' && b !== 'js' && b !== 'wasm') throw new Error('backend is auto, js or wasm'); backend = b; } };
}));
