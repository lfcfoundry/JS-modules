/*!
 * graph-walk.js: the small walks over a link list that map and flow tools keep rewriting: breadth-first distances from an item, and a depth-first pass that marks the links that close a loop and lists the items in finishing order. Works on the plain "links of every item" layout (CSR) in typed arrays. No dependencies.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 0.1.0 (API 0)
 *
 *   var g = GraphWalk.csr(n, fromArray, toArray);         // item numbers 0..n-1; link i joins from[i] to to[i]
 *   var depth = GraphWalk.bfs(g, root);                    // Int32Array, -1 where not reached; bfs(g, root, skip) never enters item `skip`
 *   var w = GraphWalk.loops(g, start);                     // { closes: Uint8Array(m), keep: Uint8Array(m), post: Int32Array, count }
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
    var g = { n: n, m: m, from: Int32Array.from(from), to: Int32Array.from(to), outStart: new Int32Array(n + 1), outEdge: new Int32Array(m) }, i;
    for (i = 0; i < m; i++) {
      if (!(g.from[i] >= 0 && g.from[i] < n && g.to[i] >= 0 && g.to[i] < n)) throw new RangeError('link ' + i + ' names an item outside 0..' + (n - 1));
      g.outStart[g.from[i] + 1]++;
    }
    for (i = 0; i < n; i++) g.outStart[i + 1] += g.outStart[i];
    var at = g.outStart.slice(0, n);
    for (i = 0; i < m; i++) g.outEdge[at[g.from[i]]++] = i;
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
  return { version: '0.1.0', api: 0, csr: csr, bfs: bfs, loops: loops };
}));
