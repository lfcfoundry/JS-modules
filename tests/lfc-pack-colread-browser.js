#!/usr/bin/env node
// One-column and whole reads of flat files with 5, 50 and 200 keys (20,000 rows), build under test against OLD=path/to/older/lfc-pack.js, taking turns. ms, smaller is better. Copyright (c) 2026 LFC Foundry. MIT License.
// Env CHECK=xxh64 packs the files with xxh64 block checks (old reads them with crc32, new with xxh64).
// Run: node tests/lfc-pack-colread-browser.js <chromium|firefox|webkit> [out.json]     Env: OLD=/path/old/lfc-pack.js (default /tmp/lfc-pack-old.js), REPS=15
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const NEW = fs.readFileSync(path.resolve(__dirname, '../modules/lfc-pack/lfc-pack.js'), 'utf8'), OLD = fs.readFileSync(process.env.OLD || '/tmp/lfc-pack-old.js', 'utf8'), REPS = +process.env.REPS || 15;
const PAGE = (`
var files = {};
async function setup() {
  var J = window.LfcPack, sd = 7, i, k, bad = []; await J.init(); await window.LfcOld.init();
  var rnd = function () { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd; };
  [5, 50, 200].forEach(function (K) {
    var rows = []; for (i = 0; i < 20000; i++) { var o = {}; for (k = 0; k < K; k++) o['k' + k] = k % 3 === 0 ? (i * (k + 1)) % 100000 : k % 3 === 1 ? 'v' + (rnd() % 300) : (rnd() % 10000) / 100; rows.push(JSON.stringify(o)); }
    files[K] = J.pack(rows.join('\\n') + '\\n', { block: 'flat', check: '__CHECK__' });
    var a = J.unpack(files[K], { keys: ['k0'] }), b = window.LfcOld.unpack(files[K], { keys: ['k0'] }); if (a.length !== 20000 || JSON.stringify(a[77]) !== JSON.stringify(b[77])) bad.push(K);
  });
  var os = {}; [5, 50, 200].forEach(function (K) { os[K] = window.LfcOld.pack(window.LfcPack.unpack(files[K]).map(function (r) { return JSON.stringify(r); }).join('\\n') + '\\n', { block: 'flat' }).length; });
  return { bad: bad, sizes: { 5: files[5].length, 50: files[50].length, 200: files[200].length }, oldSizes: os };
}
async function job(name, old) {
  var J = old ? window.LfcOld : window.LfcPack, m = /^(one|all) (\\d+)$/.exec(name), t = performance.now(), x;
  x = m[1] === 'one' ? J.unpack(files[m[2]], { keys: ['k0'] }) : J.unpack(files[m[2]]);
  if (x.length !== 20000) throw new Error('rows'); return performance.now() - t;
}`).replace('__CHECK__', process.env.CHECK || '');
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/p.html': '<!doctype html><meta charset=utf-8><script>' + OLD + '</script><script>window.LfcOld = window.LfcPack;</script><script>' + NEW + '</script><script>' + PAGE + '</script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/p.html');
  const s = await p.evaluate('setup()'); if (s.bad.length) throw new Error('old and new differ for ' + s.bad);
  const jobs = []; ['one', 'all'].forEach((w) => [5, 50, 200].forEach((K) => ['old', 'new'].forEach((v) => jobs.push(v + ' ' + w + ' ' + K))));
  const r = await T.rotate(jobs, REPS, (n) => { const q = n.split(' '); return p.evaluate((a) => job(a[0] + ' ' + a[1], a[2]), [q[1], q[2], q[0] === 'old']); });
  const rows = []; ['one', 'all'].forEach((w) => [5, 50, 200].forEach((K) => { const o = r['old ' + w + ' ' + K], n = r['new ' + w + ' ' + K]; rows.push({ w: w === 'one' ? 'one column' : 'all columns', K, o: o.toFixed(1), n: n.toFixed(1), d: ((n / o - 1) * 100).toFixed(0) + '%' }); }));
  console.log('20,000 rows, flat layout, sizes ' + JSON.stringify(s.sizes) + ' (old build ' + JSON.stringify(s.oldSizes) + ') (ms, median of ' + REPS + '; smaller is better)');
  console.log(T.table(rows, [{ key: 'w', title: 'Read', align: 'left' }, { key: 'K', title: 'Keys' }, { key: 'o', title: 'Old' }, { key: 'n', title: 'New' }, { key: 'd', title: 'Change' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ browser: which, reps: REPS, results: r }, null, 1));
  await p.close().catch(() => {}); srv.close();
});
