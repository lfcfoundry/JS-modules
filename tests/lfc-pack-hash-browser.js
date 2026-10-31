#!/usr/bin/env node
// File hashes over 21 MB of packed-looking bytes, one browser at a time (ms per pass, median, smaller is better): LfcPack.hash crc32 and xxh64 (WebAssembly inside the zstd module) against the plain JavaScript CRC-32 (ZipOpen.crc32(b, true)) and SHA-256 (crypto.subtle). Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/lfc-pack-hash-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS=15
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js'), REPS = +process.env.REPS || 15, root = path.resolve(__dirname, '..') + '/';
const SRC = fs.readFileSync(root + 'modules/lfc-pack/lfc-pack.js', 'utf8'), ZIP = fs.readFileSync(root + 'modules/zip-open/zip-open.js', 'utf8');
const PAGE = `
var buf = null;
async function setup() {
  var J = window.LfcPack, Z = window.ZipOpen, sd = 7, i; await J.init();
  buf = new Uint8Array(21 << 20); for (i = 0; i < buf.length; i++) { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; buf[i] = sd >>> 24; }
  var ref = Z.crc32(buf, true), bad = []; if (J.hash(buf) !== ref) bad.push('crc32 differs'); if (J.hash(new Uint8Array(0), 'xxh64') !== 'ef46db3751d8e999') bad.push('xxh64 empty');
  return { bad: bad, xxh64: J.hash(buf, 'xxh64') };
}
async function job(name) {
  var J = window.LfcPack, Z = window.ZipOpen, t = performance.now();
  if (name === 'crc32 JavaScript') Z.crc32(buf, true); else if (name === 'crc32 WebAssembly (LfcPack.hash)') J.hash(buf); else if (name === 'xxh64 WebAssembly (LfcPack.hash)') J.hash(buf, 'xxh64'); else await crypto.subtle.digest('SHA-256', buf);
  return performance.now() - t;
}`;
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/p.html': '<!doctype html><meta charset=utf-8><script>' + SRC + '</script><script>' + ZIP + '</script><script>' + PAGE + '</script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/p.html'); const s = await p.evaluate('setup()'); if (s.bad.length) throw new Error('hash check: ' + s.bad);
  const jobs = ['crc32 JavaScript', 'crc32 WebAssembly (LfcPack.hash)', 'xxh64 WebAssembly (LfcPack.hash)', 'SHA-256 (crypto.subtle)'];
  const r = await T.rotate(jobs, REPS, (n) => p.evaluate((x) => job(x), n));
  console.log('21 MB, ms per pass (median of ' + REPS + '; smaller is better)');
  console.log(T.table(jobs.map((n) => ({ n, ms: r[n].toFixed(1), gbs: (21 * 1.048576 / r[n]).toFixed(2) })), [{ key: 'n', title: 'Hash', align: 'left' }, { key: 'ms', title: 'ms' }, { key: 'gbs', title: 'GB/s' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ browser: which, reps: REPS, results: r }, null, 1));
  await p.close().catch(() => {}); srv.close();
});
