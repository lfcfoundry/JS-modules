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

typedef unsigned long long u64;

/* core numbers: deg gets the answer; pos, vert hold n entries, bin holds maxdegree + 2 entries (the caller passes 2 * links + 2). Returns the largest core number. */
i32 gw_kcore(i32 n, const i32 *os, const i32 *oe, const i32 *to, const i32 *is, const i32 *ie, const i32 *from, i32 *deg, i32 *pos, i32 *vert, i32 *bin) {
  i32 v, u, k, end, md = 0, i, d, start = 0, du, pu, pw, w;
  for (v = 0; v < n; v++) {
    d = os[v + 1] - os[v] + is[v + 1] - is[v];
    end = os[v + 1]; for (k = os[v]; k < end; k++) if (to[oe[k]] == v) d -= 2;
    deg[v] = d; if (d > md) md = d;
  }
  for (d = 0; d <= md + 1; d++) bin[d] = 0;
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
      if (u != v && deg[u] > d) { du = deg[u]; pu = pos[u]; pw = bin[du]; w = vert[pw]; if (u != w) { pos[u] = pw; vert[pu] = w; pos[w] = pu; vert[pw] = u; } bin[du]++; deg[u]--; }
    }
    end = is[v + 1];
    for (k = is[v]; k < end; k++) {
      u = from[ie[k]];
      if (u != v && deg[u] > d) { du = deg[u]; pu = pos[u]; pw = bin[du]; w = vert[pw]; if (u != w) { pos[u] = pw; vert[pu] = w; pos[w] = pu; vert[pw] = u; } bin[du]++; deg[u]--; }
    }
  }
  md = 0; for (v = 0; v < n; v++) if (deg[v] > md) md = deg[v];
  return md;
}

/* PageRank, push form. x starts at 1/n and holds the answer on return; y is scratch (n entries each); dang lists the items with nothing to give (nd of them); w may be null, else wsum holds each item's weight total.
   Returns iterations * 2 + converged. */
i32 gw_pagerank(i32 n, const i32 *os, const i32 *oe, const i32 *to, const f64 *w, const f64 *wsum, const i32 *dang, i32 nd, f64 alpha, f64 tol, i32 maxit, f64 *x, f64 *y) {
  i32 i, k, end, it = 0, conv = 0, j;
  f64 p = 1.0 / n, dangle, base, c, err, *t;
  for (i = 0; i < n; i++) x[i] = p;
  while (it < maxit) {
    dangle = 0; for (j = 0; j < nd; j++) dangle += x[dang[j]];
    base = (alpha * dangle + (1 - alpha)) * p;
    for (i = 0; i < n; i++) y[i] = base;
    for (i = 0; i < n; i++) {
      end = os[i + 1]; if (end == os[i]) continue;
      if (w) { if (!(wsum[i] > 0)) continue; c = alpha * x[i] / wsum[i]; for (k = os[i]; k < end; k++) y[to[oe[k]]] += c * w[oe[k]]; }
      else { c = alpha * x[i] / (f64)(end - os[i]); for (k = os[i]; k < end; k++) y[to[oe[k]]] += c; }
    }
    err = 0; for (i = 0; i < n; i++) { f64 e = y[i] - x[i]; err += e < 0 ? -e : e; }
    t = x; x = y; y = t; it++;
    if (err < n * tol) { conv = 1; break; }
  }
  if (it & 1) { for (i = 0; i < n; i++) y[i] = x[i]; }   /* the answer is in the caller's second array: copy it back to the first */
  return it * 2 + conv;
}

/* betweenness by fewest links (Brandes); bc (f64), sigma (f64), delta (f64) hold n entries (zero), dist holds n entries (-1), q holds n entries; srcs lists ns start items. Adds raw (unscaled) sums into bc. */
void gw_betweenness(i32 n, const i32 *os, const i32 *oe, const i32 *to, const i32 *is, const i32 *ie, const i32 *from, const i32 *srcs, i32 ns, f64 *bc, i32 *dist, f64 *sigma, f64 *delta, i32 *q) {
  i32 si, s, h, t, v, w, k, end, dv, cnt0;
  f64 coef;
  for (si = 0; si < ns; si++) {
    s = srcs[si];
    h = 0; t = 0; q[t++] = s; dist[s] = 0; sigma[s] = 1;
    while (h < t) {
      v = q[h++]; end = os[v + 1]; dv = dist[v] + 1;
      for (k = os[v]; k < end; k++) { w = to[oe[k]]; if (dist[w] < 0) { dist[w] = dv; q[t++] = w; } if (dist[w] == dv) sigma[w] += sigma[v]; }
    }
    cnt0 = t;
    while (t > 1) {
      w = q[--t]; end = is[w + 1]; dv = dist[w] - 1; coef = (1 + delta[w]) / sigma[w];
      for (k = is[w]; k < end; k++) { v = from[ie[k]]; if (dist[v] == dv) delta[v] += sigma[v] * coef; }
      bc[w] += delta[w];
    }
    for (k = 0; k < cnt0; k++) { v = q[k]; dist[v] = -1; sigma[v] = 0; delta[v] = 0; }
  }
}

/* minimum spanning forest, Kruskal with a 16-bit radix sort on the weights' bit patterns. a1, a2: m entries of u64 keys; i1, i2: m entries of link numbers; cnt: 65537 entries; p, out: n entries. Returns how many links were chosen (written to out). */
i32 gw_mst(i32 n, i32 m, const i32 *from, const i32 *to, const u64 *wbits, u64 *a1, u64 *a2, i32 *i1, i32 *i2, i32 *cnt, i32 *p, i32 *out) {
  i32 i, k, pass, a, b, no = 0, sh;
  u64 key, *ka = a1, *kb = a2, *kt;
  i32 *ia = i1, *ib = i2, *it;
  for (i = 0; i < m; i++) { key = wbits[i]; ka[i] = (key >> 63) ? ~key : (key | 0x8000000000000000ULL); ia[i] = i; }
  for (pass = 0; pass < 4; pass++) {
    sh = pass * 16;
    for (i = 0; i <= 65536; i++) cnt[i] = 0;
    for (i = 0; i < m; i++) cnt[((ka[i] >> sh) & 65535) + 1]++;
    for (i = 0; i < 65536; i++) cnt[i + 1] += cnt[i];
    for (i = 0; i < m; i++) { k = cnt[(ka[i] >> sh) & 65535]++; kb[k] = ka[i]; ib[k] = ia[i]; }
    kt = ka; ka = kb; kb = kt; it = ia; ia = ib; ib = it;
  }
  for (i = 0; i < n; i++) p[i] = i;
  for (i = 0; i < m && no < n - 1; i++) {
    k = ia[i]; a = from[k]; b = to[k];
    while (p[a] != a) { p[a] = p[p[a]]; a = p[a]; }
    while (p[b] != b) { p[b] = p[p[b]]; b = p[b]; }
    if (a != b) { if (a < b) p[b] = a; else p[a] = b; out[no++] = k; }
  }
  return no;
}
