// Copyright (c) 2026 LFC Foundry. MIT License. Demo page logic for netflow-engine; kept in its own file so the page policy needs no inline script.
(function () {
  function rng(seed) { var s = seed | 0; return function () { s = (s + 0x6d2b79f5) | 0; var x = Math.imul(s ^ (s >>> 15), 1 | s); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
  function make(n) { var r = rng(5), nodes = [], edges = [], i; for (i = 0; i < n; i++) nodes.push({ id: 'n' + i, label: 'Item ' + i, group: ['A', 'B', 'C', 'D'][i % 4], valence: '', ghost: false, attrs: {} }); for (i = 1; i < n; i++) { edges.push({ from: 'n' + Math.floor(r() * i), to: 'n' + i, label: '', kind: '', attrs: {} }); if (r() < 0.5) { var b = Math.floor(r() * n); if (b !== i) edges.push({ from: 'n' + i, to: 'n' + b, label: '', kind: '', attrs: {} }); } } return { start: null, nodes: nodes, edges: edges }; }
  var COL = { A: '#d35', B: '#28b', C: '#3a6', D: '#b80' };
  document.getElementById('go').onclick = function () {
    var E = NetflowEngine, n = +document.getElementById('n').value, arr = document.getElementById('a').value, on = document.getElementById('w').checked;
    E.forceWasm.on = on; E.stressWasm.on = on;
    var t0 = performance.now(), L = E.build(make(n), { view: 'network', arrange: arr, colorBy: 'group' }), ms = performance.now() - t0;
    document.getElementById('s').textContent = n + ' items, ' + L.edges.length + ' links in ' + Math.round(ms) + ' ms (lower is better)';
    var c = document.getElementById('c'), g = c.getContext('2d'), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, k, i, p;
    L.nodes.forEach(function (q) { x0 = Math.min(x0, q.cx); y0 = Math.min(y0, q.cy); x1 = Math.max(x1, q.cx); y1 = Math.max(y1, q.cy); });
    k = Math.min(c.width / (x1 - x0 + 40), c.height / (y1 - y0 + 40));
    g.clearRect(0, 0, c.width, c.height); g.strokeStyle = 'rgba(128,128,128,.25)'; g.lineWidth = 1; g.beginPath();
    var at = {}; L.nodes.forEach(function (q) { at[q.id] = q; });
    L.edges.forEach(function (e) { var a = at[e.from], b = at[e.to]; if (a && b) { g.moveTo((a.cx - x0 + 20) * k, (a.cy - y0 + 20) * k); g.lineTo((b.cx - x0 + 20) * k, (b.cy - y0 + 20) * k); } }); g.stroke();
    L.nodes.forEach(function (q) { g.fillStyle = COL[q.group] || '#888'; g.beginPath(); g.arc((q.cx - x0 + 20) * k, (q.cy - y0 + 20) * k, Math.max(1.5, q.w / 2 * k), 0, 6.2832); g.fill(); });
  };
})();
