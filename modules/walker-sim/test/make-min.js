#!/usr/bin/env node
// Builds walker-sim.min.js, walker-sim-wasm.min.js and walker-sim-with-wasm.min.js (the two joined) from walker-sim.js and walker-sim-wasm.js: the header comment up to its Version line, then the terser output. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: TERSER=/path/to/terser node modules/walker-sim/test/make-min.js   (or have terser on the PATH). Then: node modules/walker-sim/test/run.js modules/walker-sim/walker-sim.min.js
var fs = require('fs'), path = require('path'), cp = require('child_process');
var dir = path.join(__dirname, '..'), built = {};
function build(name) {      // name.js -> name.min.js: the header comment up to its Version line, then the terser output
  var lines = fs.readFileSync(path.join(dir, name + '.js'), 'utf8').split('\n'), v = lines.findIndex(function (l) { return /\bVersion \d/.test(l); });
  var head = lines.slice(0, v + 1).join('\n') + '\n */\n';
  var body = cp.execFileSync(process.env.TERSER || 'terser', [path.join(dir, name + '.js'), '--ecma', '2018', '-c', '-m', '--comments', 'false']).toString();
  return (built[name] = head + body.trim() + '\n');
}
function write(file, text) { fs.writeFileSync(path.join(dir, file), text); console.log('wrote ' + file + ': ' + Buffer.byteLength(text) + ' bytes'); }
write('walker-sim.min.js', build('walker-sim'));
write('walker-sim-wasm.min.js', build('walker-sim-wasm'));
write('walker-sim-with-wasm.min.js', built['walker-sim'] + built['walker-sim-wasm']);       // both in one file, for a page or a single-file app that wants the WebAssembly loop without a second script
