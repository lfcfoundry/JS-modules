/*!
 * graph-walk.js: the small walks over a link list that map and flow tools keep rewriting: breadth-first distances from an item, and a depth-first pass that marks the links that close a loop and lists the items in finishing order, connected components, strongly connected components, topological order and shortest paths. Works on the plain "links of every item" layout (CSR) in typed arrays. No dependencies.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 0.2.0 (API 0)
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
  function components(g) {
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
  function scc(g) {
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
  function topo(g) {
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
  function shortest(g, src, weights, target) {
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
    var S = g._scratch || (g._scratch = { df: new Float64Array(n).fill(Infinity), db: new Float64Array(n).fill(Infinity), vf: new Int32Array(n), vb: new Int32Array(n), hf: null, hb: null,
      bf: new Int32Array(n).fill(-1), bb: new Int32Array(n).fill(-1), qf: new Int32Array(n), qb: new Int32Array(n) });
    var os = g.outStart, oe = g.outEdge, to = g.to, from = g.from, is = g.inStart, ie = g.inEdge, vf = S.vf, vb = S.vb, v, k, e, w, x, nd, end, best = Infinity, meet = -1, u, i, links = [], rev;
    if (!weights) {
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

  /** Link numbers from the start of a `shortest` result to `target`, in walking order; [] when target is the start, null when it was not reached. */
  function pathTo(g, r, target) {
    if (!(target >= 0 && target < g.n) || r.dist[target] === Infinity) return null;
    var out = [], v = target, e;
    while ((e = r.via[v]) >= 0) { out.push(e); v = g.from[e]; }
    return out.reverse();
  }
  return { version: '0.2.0', api: 0, csr: csr, bfs: bfs, loops: loops, components: components, scc: scc, topo: topo, shortest: shortest, pathTo: pathTo, path: path };
}));
