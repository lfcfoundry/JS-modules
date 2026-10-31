/*!
 * graph-walk.js: the small walks over a link list that map and flow tools keep rewriting: breadth-first distances from an item, and a depth-first pass that marks the links that close a loop and lists the items in finishing order, connected components, strongly connected components, topological order and shortest paths. Works on the plain "links of every item" layout (CSR) in typed arrays. No dependencies.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 0.7.1 (API 0)
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
  var WASM_B64 = /*WASM:gw:BEGIN*/'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EEEBcUUNACALIA0gEkECdGooAgAiD0EDdCISakIANwMAIAogD0ECdGpBfzYCACAMIBJqQgA3AwALIA5BAWoiDiAIRw0ACwsL8RgCBn8BfgJAIAFBAUgNACABQQFxIQxBACENAkAgAUEBRg0AIAFB/v///wdxIQ5BACENIAchDyAFIRAgBCERA0AgECARKQMAIhJCf4UgEkKAgICAgICAgIB/hCASQgBTGzcDACAPIA02AgAgD0EEaiANQQFqNgIAIBBBCGogEUEIaikDACISQn+FIBJCgICAgICAgICAf4QgEkIAUxs3AwAgD0EIaiEPIBBBEGohECARQRBqIREgDUECaiINIA5HDQALCyAMRQ0AIAcgDUECdGogDTYCACAFIA1BA3QiDWogBCANaikDACISQn+FIBJCgICAgICAgICAf4QgEkIAUxs3AwALIAlBBGohEEEAIQ8DfyAJIA9qIg1BADYCAAJAIA9BgIAQRw0AAkAgAUEBSA0AIAFBAXEhBEEAIQ8CQCABQQFGDQAgAUH+////B3EhDkEAIQ8gBSENA0AgECANLwEAQQJ0aiIRIBEoAgBBAWo2AgAgECANQQhqLwEAQQJ0aiIRIBEoAgBBAWo2AgAgDUEQaiENIA4gD0ECaiIPRw0ACwsgBEUNACAQIAUgD0EDdGovAQBBAnRqIg0gDSgCAEEBajYCAAsgCSgCACERQQAhDwNAIAkgD2oiDUEEaiIOIA4oAgAgEWoiETYCACANQQhqIg4gDigCACARaiIRNgIAIA1BDGoiDiAOKAIAIBFqIhE2AgAgDUEQaiINIA0oAgAgEWoiETYCACAPQRBqIg9BgIAQRw0ACwJAIAFBAUgNACABQQFxIQxBACEOAkAgAUEBRg0AIAFB/v///wdxIQRBACEOIAchDSAFIQ8DQCAJIA8pAwAiEqdB//8DcUECdGoiESARKAIAIhFBAWo2AgAgBiARQQN0aiASNwMAIAggEUECdGogDSgCADYCACAJIA9BCGopAwAiEqdB//8DcUECdGoiESARKAIAIhFBAWo2AgAgBiARQQN0aiASNwMAIAggEUECdGogDUEEaigCADYCACANQQhqIQ0gD0EQaiEPIAQgDkECaiIORw0ACwsgDEUNACAJIAUgDkEDdGopAwAiEqdB//8DcUECdGoiDSANKAIAIg1BAWo2AgAg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'/*WASM:gw:END*/;
  var W = null, MOD = null, mem = null, backend = 'auto', permEnd = 0, readyPromise = null;
  function b64bytes(t) { var bin, i; if (typeof atob === 'function') { var r = atob(t); bin = new Uint8Array(r.length); for (i = 0; i < r.length; i++) bin[i] = r.charCodeAt(i); } else bin = new Uint8Array(Buffer.from(t, 'base64')); return bin; }
  function start() {
    if (readyPromise) return readyPromise;
    if (typeof WebAssembly !== 'object' || !WASM_B64) return (readyPromise = Promise.resolve(false));
    try {
      readyPromise = WebAssembly.compile(b64bytes(WASM_B64)).then(function (m) { MOD = m; return WebAssembly.instantiate(m, {}); }).then(function (r) { W = r.exports; mem = W.memory; permEnd = (W.__heap_base.value + 7) & ~7; return true; }, function () { return false; });
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
    var inst = null;   // one WebAssembly instance per helper, kept across graphs (its memory only grows)
    function load(d) {
      var c = { n: d.n, os: d.os, oe: d.oe, to: d.to, is: d.is, ie: d.ie, from: d.from, X: null, P: null, ready: null };
      function lay(X) {
        var mem = X.memory, n = c.n, at = (X.__heap_base.value + 7) & ~7, P = {}, list = [['os', c.os], ['oe', c.oe], ['to', c.to], ['is', c.is], ['ie', c.ie], ['from', c.from]], i;
        for (i = 0; i < list.length; i++) { P[list[i][0]] = at; at = (at + 4 * list[i][1].length + 7) & ~7; }
        P.srcs = at; at += 4 * n; P.bc = at; at += 8 * n; P.sigma = at; at += 8 * n; P.delta = at; at += 8 * n; P.dist = at; at += 4 * n; P.q = at; at += 4 * n;
        if (at > mem.buffer.byteLength) mem.grow(Math.ceil((at - mem.buffer.byteLength) / 65536));
        var all = new Int32Array(mem.buffer);
        for (i = 0; i < list.length; i++) all.set(list[i][1], P[list[i][0]] >> 2);
        new Int32Array(mem.buffer, P.dist, n).fill(-1); new Float64Array(mem.buffer, P.sigma, 2 * n).fill(0);
        c.X = X; c.P = P;
      }
      if (d.wasm && d.keepInst && inst) lay(inst);
      else if (d.wasm) c.ready = WebAssembly.instantiate(d.wasm, {}).then(function (r) { var X = (r.instance || r).exports; if (d.keepInst) inst = X; lay(X); }, function () { c.X = null; });
      return c;
    }
    var accJob = 0, acc = null;   // the job being done in pieces (more: true) and, without WebAssembly, its running sum (with it, the sum stays in wasm memory)
    onmessage = function (ev) {
      var d = ev.data;
      if (d.n !== undefined) cur = load(d);
      function run() {
        var c = cur, n = c.n, bc, j, fresh = !d.more || accJob !== d.job;
        if (d.flush) { bc = c.X ? (accJob === d.job ? new Float64Array(c.X.memory.buffer, c.P.bc, n).slice() : new Float64Array(n)) : (accJob === d.job && acc ? acc : new Float64Array(n)); accJob = 0; acc = null; postMessage({ job: d.job, bc: bc }, [bc.buffer]); return; }
        if (c.X) {
          var mem = c.X.memory, P = c.P;
          new Int32Array(mem.buffer, P.srcs, d.srcs.length).set(d.srcs);
          if (fresh) new Float64Array(mem.buffer, P.bc, n).fill(0);
          c.X.gw_betweenness(n, P.os, P.oe, P.to, P.is, P.ie, P.from, P.srcs, d.srcs.length, P.bc, P.dist, P.sigma, P.delta, P.q);
          if (!d.more) bc = new Float64Array(mem.buffer, P.bc, n).slice();
        } else {
          bc = js(c, d.srcs);
          if (d.more) { if (fresh || !acc) acc = bc; else for (j = 0; j < n; j++) acc[j] += bc[j]; }
        }
        if (d.more) { accJob = d.job; postMessage({ job: d.job, ask: 1 }); return; }
        postMessage({ job: d.job, bc: bc }, [bc.buffer]);
      }
      if (cur.ready) cur.ready.then(run); else run();
    };
  }
  var pool = null, poolTimer = 0, gids = 0, jobs = 0;
  /** Ends the kept helper threads now (they also end by themselves after `idleMs` without work, 5 seconds by default). */
  function closePool() { if (poolTimer) { clearTimeout(poolTimer); poolTimer = 0; } if (pool) { for (var i = 0; i < pool.workers.length; i++) pool.workers[i].terminate(); try { URL.revokeObjectURL(pool.url); } catch (e) { /* gone */ } pool = null; } }
  // own: helpers for one call only (pool: false); they never touch the kept pool, so a pool: false call does not close helpers that other calls kept warm
  function endPool(P) { for (var i = 0; i < P.workers.length; i++) P.workers[i].terminate(); try { URL.revokeObjectURL(P.url); } catch (e) { /* gone */ } }
  function getPool(count, own) {
    if (!own && pool && pool.workers.length === count) return pool;
    if (!own) closePool();
    var url = URL.createObjectURL(new Blob(['(' + workerMain.toString() + ')()'], { type: 'text/javascript' })), P = { url: url, workers: [], loaded: [], jobs: {} }, i;
    P.dead = function () { var js = P.jobs; if (pool === P) closePool(); else endPool(P); P.jobs = {}; for (var k in js) js[k].fail(); };
    for (i = 0; i < count; i++) {
      var wk = new Worker(url); P.workers.push(wk); P.loaded.push(null);
      (function (wi) { wk.onmessage = function (ev) { var j = P.jobs[ev.data.job]; if (j) { if (ev.data.ask) j.ask(wi); else j.add(ev.data.bc); } }; })(i);
      wk.onerror = P.dead;
    }
    return own ? P : (pool = P);
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
        if (!keep) { if (P) endPool(P); } else { if (poolTimer) clearTimeout(poolTimer); poolTimer = setTimeout(closePool, options.idleMs === undefined ? 5000 : options.idleMs); }
        if (!ok) { resolve(betweenness(g, options)); return; }
        if (options.normalized !== false && n > 2) { var scale = 1 / ((n - 1) * (n - 2)); for (var j = 0; j < n; j++) total[j] *= scale; }
        resolve(total);
      }
      try {
        P = getPool(count, !keep);
        if (keep && poolTimer) { clearTimeout(poolTimer); poolTimer = 0; }
        if (!g._gid) g._gid = ++gids;
        key = g._gid + (wasmOn ? 'w' : 'j');
        var dyn = options._dyn !== undefined ? options._dyn : false, useMod = options._mod !== undefined ? options._mod : false, next = 0, chunk = 0, w;
        if (dyn) chunk = Math.max(1, Math.ceil(srcs.length / (count * (options._pieces || 8))));
        var out = new Int32Array(count);   // pieces each helper still has queued
        function piece(wi) { var e = Math.min(srcs.length, next + chunk), list = new Int32Array(srcs.slice(next, e)); next = e; out[wi]++; return list; }
        function send(wi, msg, list) {
          if (P.loaded[wi] !== key) { msg.n = n; msg.os = g.outStart; msg.oe = g.outEdge; msg.to = g.to; msg.is = g.inStart; msg.ie = g.inEdge; msg.from = g.from; msg.wasm = wasmOn ? (useMod && MOD ? MOD : b64bytes(WASM_B64)) : null; msg.keepInst = useMod; P.loaded[wi] = key; }
          P.workers[wi].postMessage(msg, list ? [list.buffer] : []);
        }
        P.jobs[id] = { add: function (bc) { for (var j = 0; j < n; j++) total[j] += bc[j]; if (--pending === 0) finish(true); }, fail: function () { finish(false); },
          ask: function (wi) { out[wi]--; if (next < srcs.length) { var l = piece(wi); send(wi, { job: id, srcs: l, more: true }, l); } else if (out[wi] === 0) send(wi, { job: id, flush: 1 }, null); } };
        for (w = 0; w < count; w++) {
          if (dyn) { var l1 = piece(w); send(w, { job: id, srcs: l1, more: true }, l1); if (next < srcs.length) { var l2 = piece(w); send(w, { job: id, srcs: l2, more: true }, l2); } continue; }
          var list = new Int32Array(Math.ceil((srcs.length - w) / count)); for (k = 0; k < list.length; k++) list[k] = srcs[w + k * count];
          send(w, { job: id, srcs: list }, list);
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

  /** Link numbers from the start of a `shortest` result to `target`, in walking order; [] when target is the start, null when it was not reached. */
  function pathTo(g, r, target) {
    if (!(target >= 0 && target < g.n) || r.dist[target] === Infinity) return null;
    var out = [], v = target, e;
    while ((e = r.via[v]) >= 0) { out.push(e); v = g.from[e]; }
    return out.reverse();
  }
  return { version: '0.7.1', api: 0, csr: csr, bfs: bfs, loops: loops, components: components, scc: scc, topo: topo, shortest: shortest, pathTo: pathTo, path: path, kcore: kcore, mst: mst, pagerank: pagerank, betweenness: betweenness, betweennessAsync: betweennessAsync, closePool: closePool, free: free, ready: start, accelerated: useWasm, setBackend: function (b) { if (b !== 'auto' && b !== 'js' && b !== 'wasm') throw new Error('backend is auto, js or wasm'); backend = b; } };
}));
