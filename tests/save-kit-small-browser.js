#!/usr/bin/env node
// save-kit create() against a plain JSON save, idb-keyval and localForage for small saves. Copyright (c) 2026 LFC Foundry. MIT License.
// Early-stop A/B rule (tests/ab-sequential.js): is ours (B) more than 5% slower than each alternative (A)? ratio = ours / theirs, below 1 means ours is faster. CHROMIUM=... | FIREFOX=... | WEBKIT=1, LIBS=<folder with node_modules>.
'use strict';
const path = require('path'), fs = require('fs'), http = require('http');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const root = path.resolve(__dirname, '..') + '/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length || !process.env.LIBS) { console.log('skipped: needs CHROMIUM, FIREFOX or WEBKIT=1, and LIBS'); process.exit(2); }
const AB = fs.readFileSync(path.join(__dirname, 'ab-sequential.js'), 'utf8');   // the early-stop A/B rule (qa-guide/ab-sequential): ours (B) against each alternative (A), limit 5%
const SRC = fs.readFileSync(root + 'modules/save-kit/save-kit.js', 'utf8');
const LIBS = { idb: fs.readFileSync(process.env.LIBS + '/idb-keyval/dist/umd.js', 'utf8'), lf: fs.readFileSync(process.env.LIBS + '/localforage/dist/localforage.min.js', 'utf8') };
async function bench(src, libs, abSrc) {
  var M = (function () { var m = { exports: {} }; new Function('module', src)(m); return m.exports; })();
  var idbk = (function () { var m = { exports: {} }; new Function('module', 'exports', libs.idb)(m, m.exports); return m.exports; })();
  var lf = (function () { var m = { exports: {} }; new Function('module', 'exports', libs.lf)(m, m.exports); return m.exports; })();
  var AB = (function () { var m = { exports: {} }; new Function('module', 'exports', abSrc)(m, m.exports); return m.exports; })();
  lf.config({ name: 'lf-small' }); var store = idbk.createStore('idbk-small', 'kv');
  var schema = { count: 'num', total: 'num', name: 'str:19', sound: 'flag', upgrades: { type: 'counts' }, owned: { type: 'counts' } };
  var defaults = { count: 0, total: 0, name: '', sound: 1, upgrades: {}, owned: {} };
  function state(n) { var s = { count: 1234, total: 99999, name: 'Apple Fan', sound: 1, upgrades: {}, owned: {} }, i; for (i = 0; i < n; i++) { s.upgrades['Upgrade number ' + i] = i % 9 + 1; s.owned['Item ' + i] = i % 3 + 1; } return s; }
  var kit = M.create({ key: 'sk', schema: schema, defaults: defaults, backupEveryMs: 60000 }), res = {};
  var sizes = [['448 B', 3, 20000], ['20 KB', 400, 300]];
  function sync(fn, n) { return function () { var t = performance.now(), i; for (i = 0; i < n; i++) fn(); return (performance.now() - t) * 1000 / n; }; }
  function asy(fn, n) { return async function () { var t = performance.now(), i; for (i = 0; i < n; i++) await fn(); return (performance.now() - t) * 1000 / n; }; }
  for (var z = 0; z < sizes.length; z++) {
    var s = state(sizes[z][1]), n = sizes[z][2], m = n > 1000 ? 60 : 30;
    kit.save(s); localStorage.setItem('pj', JSON.stringify(s)); await idbk.set('k', s, store); await lf.setItem('k', s);
    var ours = { save: sync(function () { kit.save(s); }, n), load: sync(function () { kit.load(); }, n) };
    var pairs = [
      ['save', 'plain JSON', sync(function () { localStorage.setItem('pj', JSON.stringify(s)); }, n)], ['load', 'plain JSON', sync(function () { JSON.parse(localStorage.getItem('pj')); }, n)],
      ['save', 'idb-keyval', asy(function () { return idbk.set('k', s, store); }, m)], ['load', 'idb-keyval', asy(function () { return idbk.get('k', store); }, m)],
      ['save', 'localForage', asy(function () { return lf.setItem('k', s); }, m)], ['load', 'localForage', asy(function () { return lf.getItem('k'); }, m)]
    ];
    for (var i = 0; i < pairs.length; i++) {
      var d = await AB.abSequential(pairs[i][2], ours[pairs[i][0]], { limit: 0.05, minRounds: 4, maxRounds: 16 });
      res[sizes[z][0] + ' ' + pairs[i][0] + ' vs ' + pairs[i][1]] = d.verdict + ' (ours/theirs ' + d.ratio.toFixed(2) + ', range ' + d.low.toFixed(2) + ' to ' + d.high.toFixed(2) + ', ' + d.rounds + ' rounds' + (d.noisy ? ', noisy' : '') + ')';
    }
  }
  return res;
}
(async () => {
  const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<title>x</title>'); }); await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await wd.launch('webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' }) : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    console.log('Browser: ' + await b.version());
    const p = await b.newPage(); await p.goto('http://127.0.0.1:' + srv.address().port + '/');
    const res = await p.evaluate(bench, SRC, LIBS, AB);
    for (const k of Object.keys(res)) console.log('  ' + k.padEnd(34) + res[k]);
    if (p.close) await p.close(); await b.close();
  }
  srv.close(); process.exit(0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
