#!/usr/bin/env node
// Copyright (c) 2026 LFC Foundry. MIT License.
// Builds lzma-decode-with-wasm.js: lzma-decode.js and lzma-decode-wasm.js in one file, in which the name lzmaDecode itself tries WebAssembly first and
// falls back to the JavaScript decoder. Edit the two sources, never the joined file; run this after changing either of them.
//   node modules/lzma-decode/wasm/join.js           writes the file
//   node modules/lzma-decode/wasm/join.js --check   exits 1 when the file on disk is not what the two sources give
var fs = require('fs'), path = require('path'), dir = path.join(__dirname, '..'), out = path.join(dir, 'lzma-decode-with-wasm.js');
function build() {
  var plain = fs.readFileSync(path.join(dir, 'lzma-decode.js'), 'utf8').replace(/\s+$/, ''), wasm = fs.readFileSync(path.join(dir, 'lzma-decode-wasm.js'), 'utf8').replace(/\s+$/, '');
  var v = /Version (\d+\.\d+\.\d+) \(API (\d+)\)/.exec(plain);
  var head = '/*! lzma-decode-with-wasm.js: lzma-decode.js and lzma-decode-wasm.js in one file. lzmaDecode(...) here tries the WebAssembly decoder first and uses the JavaScript decoder\n' +
    ' * when WebAssembly is not usable (the page policy lacks \'wasm-unsafe-eval\', or an old browser), so it always works and gives the same bytes. lzmaDecode.plain is the JavaScript decoder alone;\n' +
    ' * lzmaDecodeWasm is another name for lzmaDecode. Built by wasm/join.js from the two files named above: edit those, not this one.\n' +
    ' * Version ' + v[1] + ' (API ' + v[2] + ') */\n';
  var tail = '\n/* from here on lzmaDecode means "WebAssembly first": in a page the plain global is replaced; in Node module.exports already is the WebAssembly-first function */\n' +
    "if (typeof module === 'undefined' || !module.exports) (typeof globalThis !== 'undefined' ? globalThis : this).lzmaDecode = lzmaDecodeWasm;\n";
  return head + plain + '\n\n' + wasm + '\n' + tail;
}
if (require.main === module) {
  var text = build();
  if (process.argv[2] === '--check') {
    var disk = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (disk !== text) { console.error('lzma-decode-with-wasm.js is out of date: run node modules/lzma-decode/wasm/join.js'); process.exit(1); }
    console.log('lzma-decode-with-wasm.js is up to date');
  } else { fs.writeFileSync(out, text); console.log('wrote lzma-decode-with-wasm.js: ' + Buffer.byteLength(text) + ' bytes'); }
}
module.exports = build;
