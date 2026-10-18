#!/usr/bin/env node
// Copyright (c) 2026 LFC Foundry. MIT License.
// Builds ppmd-decode-with-wasm.js: ppmd-decode.js and ppmd-decode-wasm.js in one file, in which the name ppmd7Decode itself tries WebAssembly first and
// falls back to the JavaScript decoder. Edit the two sources, never the joined file; run this after changing either of them.
//   node modules/ppmd-decode/wasm/join.js           writes the file
//   node modules/ppmd-decode/wasm/join.js --check   exits 1 when the file on disk is not what the two sources give
var fs = require('fs'), path = require('path'), dir = path.join(__dirname, '..'), out = path.join(dir, 'ppmd-decode-with-wasm.js');
function build() {
  var plain = fs.readFileSync(path.join(dir, 'ppmd-decode.js'), 'utf8').replace(/\s+$/, ''), wasm = fs.readFileSync(path.join(dir, 'ppmd-decode-wasm.js'), 'utf8').replace(/\s+$/, '');
  var v = /Version (\d+\.\d+\.\d+) \(API (\d+)\)/.exec(plain);
  var head = '/*! ppmd-decode-with-wasm.js: ppmd-decode.js and ppmd-decode-wasm.js in one file. ppmd7Decode(...) here tries the WebAssembly decoder first and uses the JavaScript decoder\n' +
    ' * when WebAssembly is not usable (the page policy lacks \'wasm-unsafe-eval\', or an old browser), so it always works and gives the same bytes. ppmd7Decode.plain is the JavaScript decoder alone;\n' +
    ' * ppmd7DecodeWasm is another name for ppmd7Decode. Built by wasm/join.js from the two files named above: edit those, not this one. Copyright (c) 2026 LFC Foundry. MIT License.\n' +
    ' * Version ' + v[1] + ' (API ' + v[2] + ') */\n';
  var tail = '\n/* from here on ppmd7Decode means "WebAssembly first": in a page the plain global is replaced; in Node module.exports already is the WebAssembly-first function */\n' +
    "if (typeof module === 'undefined' || !module.exports) (typeof globalThis !== 'undefined' ? globalThis : this).ppmd7Decode = ppmd7DecodeWasm;\n";
  return head + plain + '\n\n' + wasm + '\n' + tail;
}
if (require.main === module) {
  var text = build();
  if (process.argv[2] === '--check') {
    var disk = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (disk !== text) { console.error('ppmd-decode-with-wasm.js is out of date: run node modules/ppmd-decode/wasm/join.js'); process.exit(1); }
    console.log('ppmd-decode-with-wasm.js is up to date');
  } else { fs.writeFileSync(out, text); console.log('wrote ppmd-decode-with-wasm.js: ' + Buffer.byteLength(text) + ' bytes'); }
}
module.exports = build;
