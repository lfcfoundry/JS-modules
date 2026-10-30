/* Copyright (c) 2026 LFC Foundry. MIT License.
 * graph-walk kernels for WebAssembly: the same algorithms and answers as graph-walk.js (components, strongly connected groups, topological order, cheapest paths to every item).
 * Freestanding C: no library, every array is passed in by the caller (graph-walk.js owns the memory). Build with wasm/build.sh. */
typedef int i32;
typedef unsigned int u32;
typedef double f64;
#define INF (__builtin_inf())

/* groups joined by links in either direction; p, id, sizes each hold n entries; returns the group count */
i32 gw_components(i32 n, i32 m, const i32 *from, const i32 *to, i32 *p, i32 *id, i32 *sizes) {
  i32 i, a, b, t, c = 0;
  for (i = 0; i < n; i++) p[i] = i;
  for (i = 0; i < m; i++) {
    a = from[i]; b = to[i];
    while (p[a] != a) { p[a] = p[p[a]]; a = p[a]; }
    while (p[b] != b) { p[b] = p[p[b]]; b = p[b]; }
    if (a != b) { if (a < b) p[b] = a; else p[a] = b; }
  }
  for (i = 0; i < n; i++) { t = p[i]; if (t == i) id[i] = c++; else { while (p[t] != t) t = p[t]; p[i] = t; id[i] = id[t]; } }
  for (i = 0; i < c; i++) sizes[i] = 0;
  for (i = 0; i < n; i++) sizes[id[i]]++;
  return c;
}

/* Tarjan without recursion; idx, low, it, st, cs hold n entries each; id gets the group numbers (sinks first); returns the group count */
i32 gw_scc(i32 n, const i32 *os, const i32 *oe, const i32 *to, i32 *idx, i32 *low, i32 *id, i32 *it, i32 *st, i32 *cs) {
  i32 s, v, w, k, end, sp = 0, cp = 0, next = 0, count = 0;
  for (s = 0; s < n; s++) { idx[s] = -1; id[s] = -1; }
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
        if (low[v] == idx[v]) { do { w = st[--sp]; id[w] = count; } while (w != v); count++; }
        if (cp) { w = cs[cp - 1]; if (low[v] < low[w]) low[w] = low[v]; }
      }
    }
  }
  return count;
}

/* Kahn; deg and q hold n entries each (q ends up as the order); returns how many items were placed */
i32 gw_topo(i32 n, i32 m, const i32 *os, const i32 *oe, const i32 *to, i32 *deg, i32 *q) {
  i32 i, v, k, end, h = 0, tl = 0;
  for (i = 0; i < n; i++) deg[i] = 0;
  for (i = 0; i < m; i++) deg[to[i]]++;
  for (i = 0; i < n; i++) if (!deg[i]) q[tl++] = i;
  while (h < tl) {
    v = q[h++]; end = os[v + 1];
    for (k = os[v]; k < end; k++) { i = to[oe[k]]; if (--deg[i] == 0) q[tl++] = i; }
  }
  return tl;
}

/* cheapest paths from src to every item: four-ary indexed heap; dist (f64) and via hold n entries (the caller fills dist with Infinity and via with -1), heap and pos hold n entries (pos filled with -1).
   Returns 0, or link number + 1 of the first negative or missing weight met. */
i32 gw_dijkstra(i32 n, const i32 *os, const i32 *oe, const i32 *to, const f64 *w, i32 src, f64 *dist, i32 *via, i32 *heap, i32 *pos) {
  i32 hs = 0, v, k, e, x, end, i, par, c, best, last;
  f64 nd, d, dx, y;
  dist[src] = 0; heap[0] = src; pos[src] = 0; hs = 1;
  while (hs) {
    v = heap[0]; pos[v] = -2;
    last = heap[--hs];
    if (hs) {
      dx = dist[last]; i = 0;
      for (;;) {
        c = 4 * i + 1; if (c >= hs) break;
        best = c; y = dist[heap[c]];
        if (c + 1 < hs && dist[heap[c + 1]] < y) { best = c + 1; y = dist[heap[best]]; }
        if (c + 2 < hs && dist[heap[c + 2]] < y) { best = c + 2; y = dist[heap[best]]; }
        if (c + 3 < hs && dist[heap[c + 3]] < y) { best = c + 3; y = dist[heap[best]]; }
        if (y >= dx) break;
        heap[i] = heap[best]; pos[heap[i]] = i; i = best;
      }
      heap[i] = last; pos[last] = i;
    }
    end = os[v + 1]; d = dist[v];
    for (k = os[v]; k < end; k++) {
      e = oe[k]; x = to[e]; if (pos[x] == -2) continue;
      y = w[e]; if (!(y >= 0)) return e + 1;
      nd = d + y;
      if (nd < dist[x]) {
        dist[x] = nd; via[x] = e;
        i = pos[x]; if (i == -1) i = hs++;
        while (i > 0) { par = (i - 1) >> 2; if (dist[heap[par]] <= nd) break; heap[i] = heap[par]; pos[heap[i]] = i; i = par; }
        heap[i] = x; pos[x] = i;
      }
    }
  }
  return 0;
}
