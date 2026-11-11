// Copyright (c) 2026 LFC Foundry. MIT License.
// Node-only pilot. Measures a view alias against the candidate's private-copy expression.
const { performance } = require('node:perf_hooks');
const n = Number(process.argv[2] || 262144);
const rounds = Number(process.argv[3] || 1000);
const mode = process.argv[4] || 'private';
const source = Buffer.allocUnsafeSlow(n + 32); source.fill(13);
const before = process.memoryUsage();
let check = 0, maxRss = before.rss, maxExternal = before.external;
for (let i = 0; i < 100; i++) {
  const x = mode === 'private' ? new Uint8Array(source.buffer, 16, n).slice() : source.subarray(16, 16 + n);
  check += x[0];
}
if (global.gc) global.gc();
const t = performance.now();
for (let i = 0; i < rounds; i++) {
  const x = mode === 'private' ? new Uint8Array(source.buffer, 16, n).slice() : source.subarray(16, 16 + n);
  check += x[i % n];
  if (i % 10 === 0) { const m = process.memoryUsage(); maxRss = Math.max(maxRss, m.rss); maxExternal = Math.max(maxExternal, m.external); }
}
const elapsed = performance.now() - t;
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,mode,bytesPerOperation:n,rounds,
  elapsedMs:elapsed,usPerOperation:elapsed*1000/rounds,logicalBytesCopied:mode==='private'?n*rounds:0,
  peakObservedRss:maxRss,peakObservedExternal:maxExternal,check}));
