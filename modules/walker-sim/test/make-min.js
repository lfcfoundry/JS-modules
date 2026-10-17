#!/usr/bin/env node
// Builds walker-sim.min.js from walker-sim.js: the header comment up to its Version line, then the terser output. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: TERSER=/path/to/terser node modules/walker-sim/test/make-min.js   (or have terser on the PATH). Then: node modules/walker-sim/test/run.js modules/walker-sim/walker-sim.min.js
var fs = require('fs'), path = require('path'), cp = require('child_process');
var src = path.join(__dirname, '..', 'walker-sim.js'), out = path.join(__dirname, '..', 'walker-sim.min.js');
var lines = fs.readFileSync(src, 'utf8').split('\n'), v = lines.findIndex(function (l) { return /\bVersion \d/.test(l); });
var head = lines.slice(0, v + 1).join('\n') + '\n */\n';
var body = cp.execFileSync(process.env.TERSER || 'terser', [src, '--ecma', '2018', '-c', '-m', '--comments', 'false']).toString();
fs.writeFileSync(out, head + body.trim() + '\n');
console.log('wrote ' + path.basename(out) + ': ' + Buffer.byteLength(head + body) + ' bytes');
