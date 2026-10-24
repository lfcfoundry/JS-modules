/* Copyright (c) 2026 LFC Foundry. MIT License. A made-up network of n items in comms clusters (the same generator Netflow Map's example uses). */
'use strict';
const EX = (function () {
  function rng(seed) { var s = seed | 0; return function () { s = (s + 0x6d2b79f5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function bigNetwork(n, comms, seed) {
    var r = rng(seed), nodes = [], edges = [], per = Math.ceil(n / comms), names = ['Atlas', 'Birch', 'Cedar', 'Delta', 'Ember', 'Fjord'];
    for (var i = 0; i < n; i++) nodes.push({ id: 'p' + i, label: names[Math.floor(i / per) % names.length] + ' ' + (i % per + 1), group: '', valence: '', ghost: false, attrs: { community: Math.floor(i / per) } });
    var seen = new Set();
    var add = function (a, b) { if (a === b) return; var k = a + '>' + b; if (seen.has(k)) return; seen.add(k); edges.push({ from: 'p' + a, to: 'p' + b, label: '', kind: '', attrs: {} }); };
    for (var j = 0; j < n; j++) {
      var c = Math.floor(j / per), m = 2 + Math.floor(r() * 3);
      for (var q = 0; q < m; q++) { var t = c * per + Math.floor(r() * per); if (t < n) add(j, t); }
      if (r() < 0.12) add(j, Math.floor(r() * n));
    }
    return { name: 'Six communities', start: null, nodes: nodes, edges: edges };
  }
  return { bigNetwork: bigNetwork };
})();
module.exports = EX.bigNetwork;
