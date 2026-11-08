// Copyright (c) 2026 LFC Foundry. MIT License.
// Non-ASCII text in the flat fast path: the line counter must flag a non-ASCII byte wherever it sits (first 16 bytes, middle, last bytes), with and without SIMD (0.7.1 lost the flag when the SIMD counter's result was overwritten).
// Run alone: node test/nonascii.cjs   (it starts itself again with the SIMD probe turned off for the second pass)
'use strict';
const assert = require('assert'), { spawnSync } = require('child_process');
if (process.argv[2] === 'plain') { const v = WebAssembly.validate; WebAssembly.validate = function (b) { if (b && b.length === 31 && b[22] === 253) return false; return v.apply(this, arguments); }; }
const JF = require('../lfc-pack.js');
(async () => {
  await JF.init();
  const chars = ['é', '€', '😀', 'ß'], rows = [];
  for (let n = 0; n < 400; n++) {   // text lengths and the place of the one non-ASCII character both vary, so every 16-byte and 8-byte boundary gets a turn
    const len = 1 + (n % 70), at = (n * 7) % len, c = chars[n % 4];
    let s = ''; for (let i = 0; i < len; i++) s += i === at ? c : String.fromCharCode(97 + (i % 26));
    rows.push({ id: n, s, t: 'x'.repeat(n % 40) + (n % 3 ? '' : 'ü'), v: n * 0.5 });
  }
  const text = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  for (const bytes of [Buffer.from(text), Buffer.from(rows.slice(0, 40).map((r) => JSON.stringify(r)).join('\n') + '\n'), Buffer.from(JSON.stringify({ a: 'é' }) + '\n')]) {
    const f = JF.pack(bytes), got = JF.unpack(f), want = bytes.toString('utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepStrictEqual(got, want, 'round trip differs'); assert.deepStrictEqual(JF.unpackRows(f, { from: 0, count: want.length }), want, 'unpackRows differs');
  }
  // a long ASCII run that ends in a non-ASCII byte at every offset of the last 40 bytes
  for (let k = 0; k < 40; k++) { const line = JSON.stringify({ s: 'a'.repeat(100) + 'é'.repeat(1) + 'b'.repeat(k), n: k }) + '\n'; const b = Buffer.from(line.repeat(3)); assert.deepStrictEqual(JF.unpack(JF.pack(b)), b.toString().trim().split('\n').map((l) => JSON.parse(l)), 'tail case ' + k); }
  console.log('non-ASCII text in the flat path' + (process.argv[2] === 'plain' ? ' (no SIMD)' : '') + ', ok');
})().then(() => { if (process.argv[2] !== 'plain') { const r = spawnSync(process.execPath, [__filename, 'plain'], { encoding: 'utf8' }); process.stdout.write(r.stdout); process.stderr.write(r.stderr); process.exit(r.status); } }).catch((e) => { console.error(e); process.exit(1); });
