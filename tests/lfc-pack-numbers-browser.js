#!/usr/bin/env node
// Decimal number columns (3 to 5 decimals, slowly changing or not): file size, pack time and read time of the build under test against OLD=path/to/older/lfc-pack.js, taking turns. Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node tests/lfc-pack-numbers-browser.js <chromium|firefox|webkit> [out.json]     Env: NESTED=1 (rows with a nested object and a list, so the nested layout is used), N=rows (default 100000), OLD=/path/old/lfc-pack.js (default /tmp/lfc-pack-old.js), REPS=11
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const NEW = fs.readFileSync(path.resolve(__dirname, '../modules/lfc-pack/lfc-pack.js'), 'utf8'), OLD = fs.readFileSync(process.env.OLD || '/tmp/lfc-pack-old.js', 'utf8'), REPS = +process.env.REPS || 11;
const PAGE = (`
var TEXT = {}, FILES = {}, SETS = ['sensor 3 dec', 'GPS 5 dec', 'random 3 dec', 'price 4 dec', 'noisy 2 dec', 'pairs 5 dec'];
async function setup() {
  var J = window.LfcPack, sd = 5, i, x = 20, la = 40, lo = -74, p = 100, c = {}, n = +'__N__', bad = [];
  await J.init(); await window.LfcOld.init();
  var r = function () { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
  var g = function () { var u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  SETS.forEach(function (s) { c[s] = []; });
  for (i = 0; i < n; i++) { x += g() * 0.05; c['sensor 3 dec'].push(+x.toFixed(3)); la += g() * 0.0001; c['GPS 5 dec'].push(+la.toFixed(5)); c['random 3 dec'].push(+(r() * 100).toFixed(3)); p *= 1 + g() * 0.0005; c['price 4 dec'].push(+p.toFixed(4)); c['noisy 2 dec'].push(Math.round(1000 + g() * 30) / 100); lo += g() * 0.0001; c['pairs 5 dec'].push([+lo.toFixed(5), +la.toFixed(5)]); }
  SETS.forEach(function (s) {
    TEXT[s] = c[s].map(function (v, k) { return JSON.stringify(__ROW__); }).join('\\n') + '\\n';
    FILES[s] = { old: window.LfcOld.pack(TEXT[s]), neu: J.pack(TEXT[s]) };
    var a = J.unpack(FILES[s].neu), b = J.unpack(FILES[s].old); if (a.length !== n || JSON.stringify(a[n - 1].v) !== JSON.stringify(c[s][n - 1]) || JSON.stringify(a[777].v) !== JSON.stringify(c[s][777]) || JSON.stringify(b[777].v) !== JSON.stringify(c[s][777])) bad.push(s);
  });
  return { bad: bad, sizes: SETS.map(function (s) { return { s: s, old: FILES[s].old.length, neu: FILES[s].neu.length }; }) };
}
async function job(name) {
  var q = name.split('|'), L = q[0] === 'old' ? window.LfcOld : window.LfcPack, t = performance.now(), x;
  if (q[1] === 'pack') x = L.pack(TEXT[q[2]]); else x = L.unpack(FILES[q[2]][q[0] === 'old' ? 'old' : 'neu']);
  return performance.now() - t;
}`).replace('__N__', process.env.N || '100000').replace('__ROW__', process.env.NESTED ? "{ t: k, meta: { src: 'a' + (k % 5) }, v: v, tags: [1, 2] }" : '{ t: k, v: v }');
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/p.html': '<!doctype html><meta charset=utf-8><script>' + OLD + '</script><script>window.LfcOld = window.LfcPack;</script><script>' + NEW + '</script><script>' + PAGE + '</script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/p.html'); const s = await p.evaluate('setup()'); if (s.bad.length) throw new Error('round trip failed: ' + s.bad);
  const sets = s.sizes.map((z) => z.s), jobs = []; sets.forEach((n) => ['pack', 'read'].forEach((w) => ['old', 'new'].forEach((v) => jobs.push(v + '|' + w + '|' + n))));
  const r = await T.rotate(jobs, REPS, (n) => p.evaluate((x) => job(x), n));
  console.log((process.env.N || '100,000') + ' rows of {t, v}; ms median of ' + REPS + ' (smaller is better); size in bytes');
  console.log(T.table(s.sizes.map((z) => { const o = (w, v) => r[v + '|' + w + '|' + z.s]; return { s: z.s, so: z.old, sn: z.neu, sd: ((z.neu / z.old - 1) * 100).toFixed(1) + '%', po: o('pack', 'old').toFixed(0), pn: o('pack', 'new').toFixed(0), pd: ((o('pack', 'new') / o('pack', 'old') - 1) * 100).toFixed(0) + '%', ro: o('read', 'old').toFixed(0), rn: o('read', 'new').toFixed(0), rd: ((o('read', 'new') / o('read', 'old') - 1) * 100).toFixed(0) + '%' }; }),
    [{ key: 's', title: 'Data', align: 'left' }, { key: 'so', title: 'Size old' }, { key: 'sn', title: 'Size new' }, { key: 'sd', title: 'Change' }, { key: 'po', title: 'Pack old' }, { key: 'pn', title: 'Pack new' }, { key: 'pd', title: 'Change' }, { key: 'ro', title: 'Read old' }, { key: 'rn', title: 'Read new' }, { key: 'rd', title: 'Change' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ browser: which, reps: REPS, sizes: s.sizes, results: r }, null, 1));
  await p.close().catch(() => {}); srv.close();
});
