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

/* ---- maxflow (Dinic) ----------------------------------------------------------------------------------------------------------------------------------
   os (n+1), arc (2m): each item's residual arcs (arc 2i = link i forward, 2i+1 its twin); res (2m f64) is filled here from cap (m f64); level, it, q: n entries; path: n + 1 entries. Returns the flow value. */
f64 gw_maxflow(i32 n, i32 m, const i32 *os, const i32 *arc, const i32 *from, const i32 *to, const f64 *cap, f64 *res, i32 *level, i32 *it, i32 *q, i32 *path, i32 source, i32 sink) {
  i32 i, v, w, a, k, h, t, sp, end, adv;
  f64 value = 0, f;
  for (i = 0; i < m; i++) { res[2 * i] = from[i] == to[i] ? 0 : cap[i]; res[2 * i + 1] = 0; }
  for (;;) {
    for (v = 0; v < n; v++) level[v] = -1;
    level[source] = 0; h = 0; t = 0; q[t++] = source;
    while (h < t && level[sink] < 0) {
      v = q[h++];
      for (k = os[v]; k < os[v + 1]; k++) { a = arc[k]; if (res[a] > 0) { w = (a & 1) ? from[a >> 1] : to[a >> 1]; if (level[w] < 0) { level[w] = level[v] + 1; q[t++] = w; } } }
    }
    if (level[sink] < 0) break;
    for (v = 0; v < n; v++) it[v] = os[v];
    sp = 0; v = source;
    for (;;) {
      if (v == sink) {
        f = INF; for (k = 0; k < sp; k++) if (res[path[k]] < f) f = res[path[k]];
        for (k = 0; k < sp; k++) { res[path[k]] -= f; res[path[k] ^ 1] += f; }
        value += f;
        for (k = 0; k < sp; k++) if (res[path[k]] == 0) break;
        sp = k; v = k == 0 ? source : ((path[k - 1] & 1) ? from[path[k - 1] >> 1] : to[path[k - 1] >> 1]);
        continue;
      }
      adv = 0; end = os[v + 1];
      for (; it[v] < end; it[v]++) { a = arc[it[v]]; if (res[a] > 0) { w = (a & 1) ? from[a >> 1] : to[a >> 1]; if (level[w] == level[v] + 1) { path[sp++] = a; v = w; adv = 1; break; } } }
      if (adv) continue;
      if (v == source) break;
      level[v] = -1; a = path[--sp]; v = (a & 1) ? to[a >> 1] : from[a >> 1]; it[v]++;
    }
  }
  return value;
}

/* ---- closeness: breadth-first walks backwards from each start item. out (n f64, zero), dist (n, -1), q (n). */
void gw_closeness(i32 n, const i32 *is, const i32 *ie, const i32 *from, const i32 *srcs, i32 ns, f64 *out, i32 *dist, i32 *q, i32 wf) {
  i32 si, s, h, t, v, w, k, end, dv, i;
  f64 total, reached;
  for (si = 0; si < ns; si++) {
    s = srcs[si]; h = 0; t = 0; q[t++] = s; dist[s] = 0; total = 0;
    while (h < t) {
      v = q[h++]; end = is[v + 1]; dv = dist[v] + 1;
      for (k = is[v]; k < end; k++) { w = from[ie[k]]; if (dist[w] < 0) { dist[w] = dv; q[t++] = w; total += dv; } }
    }
    reached = (f64)(t - 1);
    if (total > 0 && n > 1) { out[s] = reached / total; if (wf) out[s] *= reached / (f64)(n - 1); }
    for (i = 0; i < t; i++) dist[q[i]] = -1;
  }
}

/* ---- triangles: mark, deg, per hold n entries (mark filled with -1, per zero); st, hs hold n + 1; adj holds 2m entries; hi holds m entries. Returns the total; per gets the count per item; deg the distinct neighbors. */
i32 gw_triangles(i32 n, const i32 *os, const i32 *oe, const i32 *to, const i32 *is, const i32 *ie, const i32 *from, i32 *mark, i32 *deg, i32 *st, i32 *adj, i32 *hs, i32 *hi, i32 *per) {
  i32 v, k, end, u, e, hp = 0, w, i, total = 0;
  for (v = 0; v < n; v++) {
    deg[v] = 0;
    end = os[v + 1]; for (k = os[v]; k < end; k++) { u = to[oe[k]]; if (u != v && mark[u] != v) { mark[u] = v; deg[v]++; } }
    end = is[v + 1]; for (k = is[v]; k < end; k++) { u = from[ie[k]]; if (u != v && mark[u] != v) { mark[u] = v; deg[v]++; } }
  }
  st[0] = 0; for (v = 0; v < n; v++) st[v + 1] = st[v] + deg[v];
  for (v = 0; v < n; v++) mark[v] = -1;
  for (v = 0; v < n; v++) {
    e = st[v];
    end = os[v + 1]; for (k = os[v]; k < end; k++) { u = to[oe[k]]; if (u != v && mark[u] != v) { mark[u] = v; adj[e++] = u; } }
    end = is[v + 1]; for (k = is[v]; k < end; k++) { u = from[ie[k]]; if (u != v && mark[u] != v) { mark[u] = v; adj[e++] = u; } }
  }
  for (v = 0; v < n; v++) { hs[v] = hp; for (k = st[v]; k < st[v + 1]; k++) { u = adj[k]; if (deg[u] > deg[v] || (deg[u] == deg[v] && u > v)) hi[hp++] = u; } }
  hs[n] = hp;
  for (v = 0; v < n; v++) mark[v] = -1;
  for (v = 0; v < n; v++) {
    for (k = hs[v]; k < hs[v + 1]; k++) mark[hi[k]] = v;
    for (k = hs[v]; k < hs[v + 1]; k++) { u = hi[k]; for (i = hs[u]; i < hs[u + 1]; i++) { w = hi[i]; if (mark[w] == v) { total++; per[v]++; per[u]++; per[w]++; } } }
  }
  return total;
}

/* ---- Louvain levels. Level 0 lists (off n+1, nbr E, wt E f64, loop n f64, kdeg n f64) are only read. a_* and b_* are two work sets of the same sizes (off n+1, nbr E, wt E, loop n, kdeg n) used by turns for the merged levels;
   comm, rn, members, ms (n + 1), fill, touched, seen: n i32; tot, wn, acc: n f64. owner (n) gets each item's final group number. */
void gw_louvain(i32 n, const i32 *off0, const i32 *nbr0, const f64 *wt0, const f64 *loop0, const f64 *kdeg0, f64 m2, f64 res, i32 *owner,
                i32 *a_off, i32 *a_nbr, f64 *a_wt, f64 *a_loop, f64 *a_kdeg, i32 *b_off, i32 *b_nbr, f64 *b_wt, f64 *b_loop, f64 *b_kdeg,
                i32 *comm, i32 *rn, i32 *members, i32 *ms, i32 *fill, i32 *touched, i32 *seen, f64 *tot, f64 *wn, f64 *acc) {
  i32 N = n, v, k, j, c, pass, ci, nt, best, moved, any, cnt, E = off0[n], len, cj, ne;
  f64 kv, gain, bestGain, x;
  const i32 *off = off0, *nbr = nbr0; const f64 *wt = wt0, *loop = loop0, *kdeg = kdeg0;
  i32 *noff = a_off, *nnbr = a_nbr; f64 *nwt = a_wt, *nloop = a_loop, *nkdeg = a_kdeg;
  i32 *oth_off = b_off, *oth_nbr = b_nbr; f64 *oth_wt = b_wt, *oth_loop = b_loop, *oth_kdeg = b_kdeg;
  (void)E;
  for (v = 0; v < n; v++) owner[v] = v;
  for (;;) {
    for (v = 0; v < N; v++) { comm[v] = v; tot[v] = kdeg[v]; wn[v] = 0; }
    any = 0;
    for (pass = 0; pass < 100; pass++) {
      moved = 0;
      for (v = 0; v < N; v++) {
        ci = comm[v]; kv = kdeg[v]; nt = 0;
        for (k = off[v]; k < off[v + 1]; k++) { c = comm[nbr[k]]; if (wn[c] == 0) touched[nt++] = c; wn[c] += wt[k]; }
        tot[ci] -= kv; best = ci; bestGain = wn[ci] - res * tot[ci] * kv / m2;
        for (j = 0; j < nt; j++) { c = touched[j]; gain = wn[c] - res * tot[c] * kv / m2; if (gain > bestGain + 1e-12) { bestGain = gain; best = c; } }
        for (j = 0; j < nt; j++) wn[touched[j]] = 0;
        tot[best] += kv; if (best != ci) { comm[v] = best; moved++; }
      }
      if (moved == 0) break;
      any = 1;
      if ((f64)moved < (f64)N * 1e-9) break;
    }
    if (!any) break;
    for (v = 0; v < N; v++) rn[v] = -1;
    cnt = 0; for (v = 0; v < N; v++) { if (rn[comm[v]] < 0) rn[comm[v]] = cnt++; }
    for (v = 0; v < n; v++) owner[v] = rn[comm[owner[v]]];
    if (cnt == N) break;
    for (c = 0; c <= cnt; c++) ms[c] = 0;
    for (v = 0; v < N; v++) ms[rn[comm[v]] + 1]++;
    for (c = 0; c < cnt; c++) ms[c + 1] += ms[c];
    for (c = 0; c < cnt; c++) fill[c] = ms[c];
    for (v = 0; v < N; v++) members[fill[rn[comm[v]]]++] = v;
    len = 0; noff[0] = 0;
    for (c = 0; c < cnt; c++) { nloop[c] = 0; seen[c] = -1; }
    for (c = 0; c < cnt; c++) {
      ne = len;
      for (j = ms[c]; j < ms[c + 1]; j++) {
        v = members[j]; nloop[c] += loop[v];
        for (k = off[v]; k < off[v + 1]; k++) {
          cj = rn[comm[nbr[k]]];
          if (cj == c) nloop[c] += wt[k];
          else { if (seen[cj] != c) { seen[cj] = c; acc[cj] = 0; nnbr[len++] = cj; } acc[cj] += wt[k]; }
        }
      }
      for (j = ne; j < len; j++) nwt[j] = acc[nnbr[j]];
      noff[c + 1] = len;
    }
    N = cnt;
    for (v = 0; v < N; v++) { x = nloop[v]; for (k = noff[v]; k < noff[v + 1]; k++) x += nwt[k]; nkdeg[v] = x; }
    off = noff; nbr = nnbr; wt = nwt; loop = nloop; kdeg = nkdeg;
    { i32 *to1 = noff, *to2 = nnbr; f64 *tw = nwt, *tl = nloop, *tk = nkdeg; noff = oth_off; nnbr = oth_nbr; nwt = oth_wt; nloop = oth_loop; nkdeg = oth_kdeg; oth_off = to1; oth_nbr = to2; oth_wt = tw; oth_loop = tl; oth_kdeg = tk; }
  }
}
