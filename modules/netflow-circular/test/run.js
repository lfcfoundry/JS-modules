/* Copyright (c) 2026 LFC Foundry. MIT License. netflow-circular checks: the shared view checks live with netflow-hierarchy, which this module builds on. Run: node modules/netflow-circular/test/run.js */
'use strict';
/* 1.5.0: typed:true gives the same bands as typed arrays (chart.flowsT), and the same picture */
{
  const NC = require('../netflow-circular.js'), NS = require('../../netflow-scene/netflow-scene.js'), NSs = NS.NetflowScene || NS;
  let s = 9, bad = 0, n = 0; const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let t = 0; t < 40; t++) {
    const N = 2 + ((r() * 40) | 0), nodes = [], edges = [];
    for (let i = 0; i < N; i++) nodes.push({ id: 'n' + i, label: 'n' + i, group: 'g' + ((r() * 4) | 0) });
    const m = (r() * N * N * 0.5) | 0; for (let k = 0; k < m; k++) edges.push({ from: 'n' + ((r() * N) | 0), to: 'n' + ((r() * N) | 0), weight: r() < 0.1 ? 0 : Math.floor(r() * 50) + 1, widthV: 1 });
    const o = { chordBy: ['items', 'groups'][t % 2], chordOrder: t % 4 < 2 ? 'fast' : 'fewest' };
    const a = NC.layout('chord', { nodes, edges }, o), b = NC.layout('chord', { nodes, edges }, Object.assign({ typed: true }, o));
    const F = a.chart.flows, Q = b.chart.flowsT; let ok = !b.chart.flows && F.length === Q.n;
    for (let i = 0; ok && i < F.length; i++) { const f = F[i]; let e = Q.firstEdge[i], c = 0; ok = f.s === Q.s[i] && f.t === Q.t[i] && f.v === Q.v[i] && f.sa0 === Q.sa0[i] && f.sa1 === Q.sa1[i] && f.ta0 === Q.ta0[i] && f.ta1 === Q.ta1[i]; while (ok && e >= 0) { ok = f.edges[c++] === e; e = Q.nextEdge[e]; } ok = ok && c === f.edges.length && Q.count[i] === c; }
    ok = ok && NSs.toSvg(NC.scene(a, {}, NSs)) === NSs.toSvg(NC.scene(b, {}, NSs)); n++; if (!ok) bad++;
  }
  console.log(bad ? 'FAIL typed chord: ' + bad + ' of ' + n : 'ok   typed chord: bands, edges and picture equal on ' + n + ' charts'); if (bad) process.exit(1);
}
require('../../netflow-hierarchy/test/run.js');
