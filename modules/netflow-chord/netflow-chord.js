/*!
 * netflow-chord.js: the chord layout of Netflow Map as one small file with nothing to load first. Arcs around a circle (one per item, or one per group when there are many items), and a band for each pair as wide as the amount it carries; the bands leaving an arc are sorted by where they land, so they do not cross each other at the arc. Layout only: it makes numbers (angles, radii, typed lists of bands), not a picture.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules. Cut from netflow-circular. Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.0 (API 1)
 *
 *   var L = NetflowChord.layout({ nodes: [{ id: 'a', label: 'A', group: 'x' }, ...], edges: [{ from: 'a', to: 'b', value: 40 }, ...] }, { chordBy: 'auto' });
 *   L.chart.arcs[k]  -> { k, a0, a1, mid, label, group, item, out, inn }   (angles in radians, the sending part of an arc first)
 *   L.chart.flowsT   -> { n, s, t, v, sa0, sa1, ta0, ta1, firstEdge, nextEdge, count }   (typed lists: band q goes from arc s[q] to arc t[q], carries v[q])
 * The order around the circle is the order of the groups (like d3-chord keeps the order it is given). netflow-circular, which needs netflow-scene and netflow-hierarchy, also searches the order for fewer crossing bands and draws the picture.
 */
var NetflowChord = (function () {
  'use strict';
  var TAU = Math.PI * 2;
  /* the amount of a link: widthV, then value, flow, weight, count (1 when none is given) */
  function linkValue(e) { var v = e.widthV; if (v === v && v > 0) return v; if (e.value > 0) return e.value; if (e.flow > 1e-12) return e.flow; if (e.weight > 0) return e.weight; return e.count || 1; }
  function chord(G, o) {
    var n = G.nodes.length, idx = new Map(), i;
    for (i = 0; i < n; i++) idx.set(G.nodes[i].id, i);
    var byGroup = o.chordBy === 'groups' || (o.chordBy !== 'items' && n > 60);
    var ent = [], entOf = new Int32Array(n), gk = new Map();
    if (byGroup) { for (i = 0; i < n; i++) { var g = G.nodes[i].group || ''; if (!gk.has(g)) { gk.set(g, ent.length); ent.push({ label: g || '(no group)', group: g, items: [] }); } entOf[i] = gk.get(g); ent[entOf[i]].items.push(i); } }
    else for (i = 0; i < n; i++) { entOf[i] = i; ent.push({ label: G.nodes[i].label, group: G.nodes[i].group || '', items: [i], item: i }); }
    var K = ent.length, flows = new Map(), eN = G.edges.length, tab = K * K <= 8 * eN + 4096 ? new Int32Array(K * K).fill(-1) : null;   /* a table of places for the pairs when edges are dense, else a Map */
    var flowsT = null, nF = 0, fi, fq, sF, tF, vF, headE, tailE, nextE, cntE;
    var out = new Float64Array(K), inn = new Float64Array(K), tot = 0;
    sF = new Int32Array(eN); tF = new Int32Array(eN); vF = new Float64Array(eN); headE = new Int32Array(eN); tailE = new Int32Array(eN); nextE = new Int32Array(eN).fill(-1); cntE = new Int32Array(eN);
    G.edges.forEach(function (e, ei) {
      var a = idx.get(e.from), b = idx.get(e.to); if (a === undefined || b === undefined) return;
      var s = entOf[a], t = entOf[b], v = linkValue(e); if (!(v > 0)) return;
      var key = s * K + t; if (tab) fi = tab[key]; else { fi = flows.get(key); if (fi === undefined) fi = -1; }
      if (fi < 0) { fi = nF++; if (tab) tab[key] = fi; else flows.set(key, fi); sF[fi] = s; tF[fi] = t; vF[fi] = v; headE[fi] = ei; tailE[fi] = ei; cntE[fi] = 1; return; }
      vF[fi] += v; nextE[tailE[fi]] = ei; tailE[fi] = ei; cntE[fi]++;
    });
    for (fq = 0; fq < nF; fq++) { out[sF[fq]] += vF[fq]; inn[tF[fq]] += vF[fq]; tot += vF[fq] * 2; }
    /* order around the circle: by group, then as given */
    var ord = []; for (i = 0; i < K; i++) ord.push(i);
    ord.sort(function (a, b) { return ent[a].group < ent[b].group ? -1 : ent[a].group > ent[b].group ? 1 : a - b; });
    var R = Math.max(220, Math.min(1400, 60 + K * 9)), th = Math.max(10, Math.min(26, R * 0.05)), pad = K > 1 ? Math.min(0.04, TAU * 0.25 / K) : 0;
    if (o.width > 0 && o.height > 0) { R = Math.max(40, o._ringR > 0 ? o._ringR : Math.min(o.width, o.height) / 2 - 45); th = Math.max(6, Math.min(26, R * 0.05)); }   /* width and height given (since 1.3.0): the ring fits that box; toSvg() shrinks it once more if the names stick out */
    var span = TAU - pad * K, cx = R + 170, cy = R + 170;
    var arcs = new Array(K), a0 = -Math.PI / 2;
    ord.forEach(function (k) {
      var len = tot > 0 ? (out[k] + inn[k]) / tot * span : span / K;
      if (!(len > 0)) len = 0;
      arcs[k] = { k: k, a0: a0, a1: a0 + len, mid: a0 + len / 2, label: ent[k].label, group: ent[k].group, item: ent[k].item, out: out[k], inn: inn[k] };
      a0 += len + pad;
    });
    /* slots: what an arc sends, sorted by where it lands (going round from this arc), then what it gets, sorted by where it comes from */
    var posA = new Int32Array(K), slotF = new Int32Array(K).fill(-1), lk, fo, kk, sSt = new Int32Array(K + 1), gSt = new Int32Array(K + 1), sIx = new Int32Array(nF), gIx = new Int32Array(nF);
    var sa0 = new Float64Array(nF), sa1 = new Float64Array(nF), ta0 = new Float64Array(nF), ta1 = new Float64Array(nF);
    for (i = 0; i < K; i++) posA[ord[i]] = i;
    var scale = tot > 0 ? span / tot : 0;
    /* around the circle the arcs' middles grow with the place, so "sorted by where it lands, going round from this arc" is the place distance (this arc itself first, then the arcs behind it, nearest first): one band per pair, so each arc's bands are placed straight into a table of K places, no sort */
    for (lk = 0; lk < nF; lk++) { sSt[sF[lk] + 1]++; gSt[tF[lk] + 1]++; }
    for (i = 0; i < K; i++) { sSt[i + 1] += sSt[i]; gSt[i + 1] += gSt[i]; }
    var sFill = sSt.slice(0, K), gFill = gSt.slice(0, K);
    for (lk = 0; lk < nF; lk++) { sIx[sFill[sF[lk]]++] = lk; gIx[gFill[tF[lk]]++] = lk; }
    for (i = 0; i < K; i++) {
      var at = arcs[i].a0, pi1 = posA[i], q0 = sSt[i], q1 = sSt[i + 1], m1 = q1 - q0;
      if (m1 === 1) { fo = sIx[q0]; sa0[fo] = at; at += vF[fo] * scale; sa1[fo] = at; }
      else if (m1 > 1) {
        for (lk = q0; lk < q1; lk++) { fo = sIx[lk]; kk = pi1 - posA[tF[fo]]; slotF[kk < 0 ? kk + K : kk] = fo; }
        for (lk = 0, kk = 0; lk < m1; kk++) if ((fo = slotF[kk]) >= 0) { slotF[kk] = -1; lk++; sa0[fo] = at; at += vF[fo] * scale; sa1[fo] = at; }
      }
      q0 = gSt[i]; q1 = gSt[i + 1]; m1 = q1 - q0;
      if (m1 === 1) { fo = gIx[q0]; ta0[fo] = at; at += vF[fo] * scale; ta1[fo] = at; }
      else if (m1 > 1) {
        for (lk = q0; lk < q1; lk++) { fo = gIx[lk]; kk = pi1 - posA[sF[fo]]; slotF[kk < 0 ? kk + K : kk] = fo; }
        for (lk = 0, kk = 0; lk < m1; kk++) if ((fo = slotF[kk]) >= 0) { slotF[kk] = -1; lk++; ta0[fo] = at; at += vF[fo] * scale; ta1[fo] = at; }
      }
    }
    flowsT = { n: nF, s: sF, t: tF, v: vF, sa0: sa0, sa1: sa1, ta0: ta0, ta1: ta1, firstEdge: headE, nextEdge: nextE, count: cntE };
    var nodes = G.nodes.slice();
    nodes.forEach(function (nd, q) {
      var A = arcs[entOf[q]], r = R + th / 2, w = byGroup ? 6 : Math.max(8, th);
      nd.cx = cx + Math.cos(A.mid) * r; nd.cy = cy + Math.sin(A.mid) * r; nd.w = nd.h = w; nd.x = nd.cx - w / 2; nd.y = nd.cy - w / 2;
    });
    var res = { kind: 'chord', dir: 'none', nodes: nodes, edges: G.edges, chart: { type: 'chord', cx: cx, cy: cy, R: R, th: th, arcs: arcs, flowsT: flowsT, byGroup: byGroup, total: tot / 2 }, width: cx * 2, height: cy * 2 };
    return res;
  }
  /** layout(G, options): G is { nodes: [{ id, label?, group? }], edges: [{ from, to, value }] }. options: chordBy ('auto' | 'items' | 'groups'; auto gives one arc per group above 60 items), width and height (the circle is sized to fit). */
  function layout(G, o) { return chord(G, o || {}); }
  return { version: '1.0.0', api: 1, layout: layout };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NetflowChord;
