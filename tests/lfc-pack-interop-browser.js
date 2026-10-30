#!/usr/bin/env node
// Costs behind two LFC-pack format ideas, in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Part 1 (file or block hash, idea 6): 21 MB of packed-looking bytes through CRC-32 (slicing loop in JavaScript, and the WebAssembly loop of zip-open), XXH32 in plain JavaScript and SHA-256 (crypto.subtle). ms per pass, smaller is better.
// Part 2 (frame offset table, idea 1): flat files of the same 20,000 rows with 5, 50 and 200 keys. One-column read (keys:['k0'], the same column in every file) against the whole read: the growth of the one-column time with the key count is the most a table of frame offsets could save.
// Run: node tests/lfc-pack-interop-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS=7 (rounds)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/', REPS = +process.env.REPS || 7;
const SRC = fs.readFileSync(root + 'modules/lfc-pack/lfc-pack.js', 'utf8'), ZIP = fs.readFileSync(root + 'modules/zip-open/zip-open.js', 'utf8');
const PAGE = `
function xxh32(b, seed) {
  var P1 = 2654435761, P2 = 2246822519, P3 = 3266489917, P4 = 668265263, P5 = 374761393, n = b.length, p = 0, h, v1, v2, v3, v4;
  var rd = function (q) { return (b[q] | (b[q + 1] << 8) | (b[q + 2] << 16) | (b[q + 3] << 24)) >>> 0; }, rot = function (x, r) { return ((x << r) | (x >>> (32 - r))) >>> 0; };
  var rnd = function (a, x) { return Math.imul(rot((a + Math.imul(x, P2)) >>> 0, 13), P1) >>> 0; };
  if (n >= 16) { v1 = (seed + P1 + P2) >>> 0; v2 = (seed + P2) >>> 0; v3 = seed >>> 0; v4 = (seed - P1) >>> 0;
    for (; p + 16 <= n; p += 16) { v1 = rnd(v1, rd(p)); v2 = rnd(v2, rd(p + 4)); v3 = rnd(v3, rd(p + 8)); v4 = rnd(v4, rd(p + 12)); }
    h = (rot(v1, 1) + rot(v2, 7) + rot(v3, 12) + rot(v4, 18)) >>> 0; } else h = (seed + P5) >>> 0;
  h = (h + n) >>> 0;
  for (; p + 4 <= n; p += 4) h = Math.imul(rot((h + Math.imul(rd(p), P3)) >>> 0, 17), P4) >>> 0;
  for (; p < n; p++) h = Math.imul(rot((h + Math.imul(b[p], P5)) >>> 0, 11), P1) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, P2) >>> 0; h ^= h >>> 13; h = Math.imul(h, P3) >>> 0; h ^= h >>> 16; return h >>> 0;
}
var buf = null, files = {}, J = null, Z = window.ZipOpen;
async function setup() {
  J = window.LfcPack; await J.init(); var sd = 7, i, k, K, rows;
  var rnd = function () { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd; };
  buf = new Uint8Array(21 << 20); for (i = 0; i < buf.length; i++) buf[i] = rnd() >>> 24;
  [5, 50, 200].forEach(function (K) {
    rows = []; for (i = 0; i < 20000; i++) { var o = {}; for (k = 0; k < K; k++) o['k' + k] = k % 3 === 0 ? (i * (k + 1)) % 100000 : k % 3 === 1 ? 'v' + (rnd() % 300) : (rnd() % 10000) / 100; rows.push(o); }
    files[K] = J.pack(rows.map(function (r) { return JSON.stringify(r); }).join('\\n') + '\\n', { block: 'flat' });
  });
  var bad = []; [5, 50, 200].forEach(function (K) { var a = J.unpack(files[K], { keys: ['k0'] }), b = J.unpack(files[K]); if (a.length !== 20000 || b.length !== 20000 || a[7].k0 !== b[7].k0) bad.push('K=' + K); });
  var ref = Z.crc32(buf, true); if (Z.crc32(buf) !== ref) bad.push('crc wasm differs');
  return { bad: bad, sizes: { 5: files[5].length, 50: files[50].length, 200: files[200].length }, wasm: Z.wasmAvailable() };
}
async function job(name) {
  var t = performance.now(), r;
  if (name === 'crc32 slicing JS') r = Z.crc32(buf, true);
  else if (name === 'crc32 WebAssembly') r = Z.crc32(buf);
  else if (name === 'XXH32 JS') r = xxh32(buf, 0);
  else if (name === 'SHA-256 subtle') r = new Uint8Array(await crypto.subtle.digest('SHA-256', buf))[0];
  else { var m = /^(one|all) (\\d+)$/.exec(name); r = m[1] === 'one' ? J.unpack(files[m[2]], { keys: ['k0'] }).length : J.unpack(files[m[2]]).length; }
  return performance.now() - t;
}`;
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script>' + ZIP + '</script><script>' + SRC + '</script><script>' + PAGE + '</script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  const info = await p.evaluate('setup()'); if (info.bad.length) { console.log('FAIL ' + info.bad.join('; ')); return false; }
  const hashNames = ['crc32 slicing JS', 'crc32 WebAssembly', 'XXH32 JS', 'SHA-256 subtle'], ks = ['5', '50', '200'];
  const hm = await T.rotate(hashNames, REPS, (n) => p.evaluate((x) => job(x), n));
  const cm = await T.rotate(ks.flatMap((k) => ['one ' + k, 'all ' + k]), REPS, (n) => p.evaluate((x) => job(x), n));
  console.log('part 1, one pass over 21 MB (ms, median of ' + REPS + ' in rotating order; smaller is better; wasm available=' + info.wasm + ')');
  console.log(T.table(hashNames.map((n) => ({ name: n, ms: hm[n].toFixed(1), mbs: (21 / (hm[n] / 1000)).toFixed(0) })), [{ key: 'name', title: 'hash', align: 'left' }, { key: 'ms', title: 'ms' }, { key: 'mbs', title: 'MB/s' }]));
  console.log('part 2, flat files with 20,000 rows (ms, median of ' + REPS + '); sizes ' + JSON.stringify(info.sizes));
  console.log(T.table(ks.map((k) => ({ k, one: cm['one ' + k].toFixed(1), all: cm['all ' + k].toFixed(1), growth: (cm['one ' + k] / cm['one 5']).toFixed(2) })), [{ key: 'k', title: 'keys', align: 'left' }, { key: 'one', title: 'one column' }, { key: 'all', title: 'all columns' }, { key: 'growth', title: 'one column vs 5 keys' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ hash: hm, columns: cm, sizes: info.sizes }, null, 1));
  await p.close().catch(() => {}); srv.close(); return true;
});
