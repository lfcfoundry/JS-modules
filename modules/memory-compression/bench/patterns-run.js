'use strict';
// Copyright (c) 2026 LFC Foundry. MIT License.
// What do text patterns cost and save? Usage: node --expose-gc bench/patterns-run.js [reps=7]
var D = require('../test/data.js'), J = require('../memory-compression.js'), reps = +process.argv[2] || 7;
function best(f, k) { var b = 1e18, r, i, t; for (i = 0; i < k; i++) { if (global.gc) global.gc(); t = process.hrtime.bigint(); r = f(); t = Number(process.hrtime.bigint() - t) / 1e6; if (t < b) b = t; } return [b, r]; }
var N = { 'nfm-nodes': 100000, 'api-users': 50000, 'events': 200000 };
console.log('| data set | mode | text patterns | size MB (lower is better) | pack ms (lower is better) | unpack ms (lower is better) |\n|---|---|---|---:|---:|---:|');
Object.keys(N).forEach(function (name) { var d = D.sets[name](N[name]);
  ['fast', 'small'].forEach(function (m) { [true, false].forEach(function (p) {
    var a = best(function () { return J.pack(d, { mode: m, patterns: p }); }, reps), b = best(function () { return J.unpack(a[1]); }, reps);
    console.log('| ' + name + ' | ' + m + ' | ' + (p ? 'on (default)' : 'off') + ' | ' + (a[1].length / 1e6).toFixed(3) + ' | ' + a[0].toFixed(1) + ' | ' + b[0].toFixed(1) + ' |');
  }); });
});
