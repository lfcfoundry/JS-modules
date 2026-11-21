// The line charts the lines-only file is built from and tested with. Copyright (c) 2026 LFC Foundry. MIT License.
// make-line.js runs every chart here once and keeps only the functions that ran; run.js draws them with both files and compares.
// each(fn, seed, sizes): calls fn(data, options) for every case. seed: a different seed gives different data with the same shapes; sizes: row counts to use (the test uses both).
'use strict';
function rnd(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
var NAMES = ['North', 'South', 'East', 'West', 'Central', 'A very long region name indeed', 'Other', 'Rest of the world and beyond', 'x', 'y', 'z', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'Alpha Beta', 'Gamma'];
var AGGS = ['sum', 'mean', 'count', 'median', 'min', 'max'];
function table(r, n, kind, groups) {
  var rows = [], y = 0, i, v, scale = [1, 1e-3, 1e3, 1e6, 1e9, 0.01, 100, 1][kind % 8];
  for (i = 0; i < n; i++) {
    y += r() - 0.5; v = kind % 8 === 5 ? Math.abs(Math.sin(i / 7 + y)) : kind % 8 === 6 ? Math.round(y * 10) : kind % 8 === 7 ? Math.max(0, y + 3) : Math.round(y * 1000) / 1000 * scale;
    rows.push({ t: i, v: v, w: -v / 3 + i, g: NAMES[i % groups], d: new Date(Date.UTC(2015, 0, 1) + i * [864e5, 36e5, 6048e5, 31536e6 / 12][kind % 4]).toISOString().slice(0, kind % 4 === 1 ? 16 : 10), yr: 1990 + (i % 40), cat: 'c' + (i % 12), s: String(v), u: i * (kind % 3 ? 1.37 : 250) });
  }
  return rows;
}
function each(fn, seed, sizes) {
  var r = rnd(seed || 1), k = 0; sizes = sizes || [0, 1, 2, 3, 12, 40, 300, 401, 2100, 5001, 6000, 20000, 100000];
  sizes.forEach(function (n) {
    for (var kind = 0; kind < 8; kind++) {
      var groups = [1, 2, 3, 5, 12, 20, 3, 8][kind], rows = table(r, n, kind + k, groups), g = rows.map(function (q, i) { return i % 9 === 4 ? Object.assign({}, q, { v: null }) : i % 31 === 5 ? Object.assign({}, q, { v: NaN }) : q; });
      var small = n <= 6000, o = [{}, { width: 400, height: 220 }, { theme: 'dark' }, { title: 'A title', subtitle: 'A subtitle', source: 'Source: tests' }, { zero: true }, { clean: false }, { width: 1400, height: 700, title: 'Wide' }, { percent: false, theme: 'dark', clean: false }][kind];
      var O = function (a) { return Object.assign({ type: 'line' }, a, o); };
      k++;
      fn(rows, O({ x: 't', y: 'v' }));
      fn(g, O({ x: 't', y: 'v' }));
      fn({ t: Float64Array.from(rows, function (q) { return q.t; }), v: Float64Array.from(rows, function (q) { return q.v; }) }, O({ x: 't', y: 'v' }));
      fn({ t: rows.map(function (q) { return q.t; }), v: rows.map(function (q) { return q.v; }), g: rows.map(function (q) { return q.g; }) }, O({ x: 't', y: 'v', color: kind % 2 ? 'g' : undefined }));
      fn({ u: Float32Array.from(rows, function (q) { return q.u; }), v: Int32Array.from(rows, function (q) { return q.v; }) }, O({ x: 'u', y: 'v' }));
      fn(rows, O({ x: 'u', y: 'w' }));
      fn(rows, O({ x: 'd', y: 'v' }));
      fn(rows, O({ x: 't', y: 's' }));
      fn(rows.map(function (q) { return { attrs: q, id: 'r' + q.t }; }), O({ x: 't', y: 'v' }));
      fn(rows, O({ x: 't', y: 'v', get: function (row, key) { return key === 'v' ? row.w : row[key]; } }));
      if (small) {
        fn(rows, O({ x: 't', y: 'v', color: 'g' }));
        fn(g, O({ x: 'd', y: 'v', color: 'g' }));
        fn(rows, O({ x: 'd', y: 'v', color: 'g', highlight: NAMES[kind % groups] }));
        fn(rows, O({ x: 't', y: 'v', color: 'g', highlight: 'nobody' }));
        fn(rows, O({ x: 't', y: 'v', highlight: 'v' }));
        fn(rows, O({ x: 'yr', y: 'v', agg: AGGS[kind % AGGS.length] }));
        fn(rows, O({ x: 'yr', y: 'v', color: 'g', agg: AGGS[(kind + 3) % AGGS.length] }));
        fn(rows, O({ x: 'cat', y: 'v', agg: AGGS[(kind + 1) % AGGS.length] }));
        fn(rows, O({ x: 'cat', y: 'v', color: 'g' }));
        fn(rows, O({ x: 'yr' }));
        fn(rows, O({ x: 'd', y: 'v', color: 'g', index: true }));
        fn(rows, O({ x: 't', y: 'v', color: 'g', top: 3 }));
        fn(rows, O({ x: 't', y: 'v', color: 'g', palette: ['#111111', '#cc3311', '#3366cc'] }));
        fn(rows, O({ x: 't', y: 'v', smooth: true }));
        fn(rows, O({ x: 'd', y: 'v', color: 'cat' }));
        fn(rows.slice().reverse(), O({ x: 't', y: 'v' }));
        fn(rows, O({ y: 'v' }));
        fn(rows, O({ x: 'missing', y: 'v' }));
        fn(rows, O({ x: 't', y: 'missing' }));
      }
    }
  });
}
module.exports = { each: each, rnd: rnd };
