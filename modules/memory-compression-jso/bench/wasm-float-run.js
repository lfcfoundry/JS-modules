'use strict';
// Copyright (c) 2026 LFC Foundry. MIT License.
// What do the WebAssembly helper and the opt-in float32 option change? Usage: node --expose-gc bench/wasm-float-run.js [reps=7]
var D = require('../test/data.js'), J = require('../memory-compression-jso.js'), reps = +process.argv[2] || 7;
function best(f, k) { var b = 1e18, r, i, t; for (i = 0; i < k; i++) { if (global.gc) global.gc(); t = process.hrtime.bigint(); r = f(); t = Number(process.hrtime.bigint() - t) / 1e6; if (t < b) b = t; } return [b, r]; }
var N = { 'nfm-links': 300000, 'nfm-nodes': 100000, 'api-users': 50000, 'events': 200000 };
console.log('| data set | mode | WebAssembly | pack ms (lower is better) | unpack ms (lower is better) | size MB (lower is better) |\n|---|---|---|---:|---:|---:|');
Object.keys(N).forEach(function (name) {
  var d = D.sets[name](N[name]);
  ['fast', 'small'].forEach(function (m) {
    [true, false].forEach(function (w) {
      var a = best(function () { return J.pack(d, { mode: m, wasm: w }); }, reps), b = best(function () { return J.unpack(a[1], { wasm: w }); }, reps);
      console.log('| ' + name + ' | ' + m + ' | ' + (w ? 'on' : 'off (plain JavaScript)') + ' | ' + a[0].toFixed(1) + ' | ' + b[0].toFixed(1) + ' | ' + (a[1].length / 1e6).toFixed(3) + ' |');
    });
  });
});
var d = D.sets['nfm-links'](300000), a = best(function () { return J.pack(d); }, reps), f = best(function () { return J.pack(d, { float32: true }); }, reps), u = J.unpack(f[1]), i, worst = 0, x, y;
for (i = 0; i < d.length; i++) for (var k in d[i]) { x = d[i][k]; y = u[i][k]; if (typeof x === 'number' && x !== y && Math.abs(x) > 0) worst = Math.max(worst, Math.abs(x - y) / Math.abs(x)); }
console.log('\nfloat32 option on nfm-links: size ' + (a[1].length / 1e6).toFixed(2) + ' MB -> ' + (f[1].length / 1e6).toFixed(2) + ' MB (lower is better), worst relative error ' + worst.toExponential(1) + ', pack ' + a[0].toFixed(0) + ' -> ' + f[0].toFixed(0) + ' ms');
