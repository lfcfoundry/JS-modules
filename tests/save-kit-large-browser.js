#!/usr/bin/env node
// save-kit createLarge() checks and speed. Copyright (c) 2026 LFC Foundry. MIT License.
// In each real browser: correctness checks (round trip, refused broken numbers, damaged slot falls back to the backup, newest-save-wins, lock, other-tab message,
// prototype keys scrubbed), then, with LIBS=/folder/with/node_modules (holding idb-keyval 6.x and localforage 1.10), a speed table for saves of about 1, 5 and 20 MB against
// idb-keyval and localForage (microseconds shown as milliseconds, smaller is better, median of rounds). Run one browser at a time:
//   CHROMIUM=/path/to/chrome node tests/save-kit-large-browser.js   (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK; needs puppeteer-core for the first two)
// Exit 2 (skipped) when nothing can run.
'use strict';
const path = require('path'), fs = require('fs');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const root = path.resolve(__dirname, '..') + '/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }
const SRC = fs.readFileSync(root + (process.env.SRC || 'modules/save-kit/save-kit.js'), 'utf8');
const LIBS = process.env.LIBS ? { idb: fs.readFileSync(process.env.LIBS + '/idb-keyval/dist/umd.js', 'utf8'), lf: fs.readFileSync(process.env.LIBS + '/localforage/dist/localforage.min.js', 'utf8') } : null;
const ONLY = process.env.ONLY || '';   // e.g. ONLY=ours times just those operations (names containing the text)
const SIZES = (process.env.SIZES || '1,5,20').split(',').map(Number), ROUNDS = +(process.env.ROUNDS || 7);

async function battery(src) {
  var M = (function () { var m = { exports: {} }; new Function('module', src)(m); return m.exports; })(), out = {}, n = 0;
  var id = function () { return 'sk-t-' + Date.now() + '-' + (n++); };
  var schema = { gold: 'num', name: 'str:20', items: { type: 'counts', maxKeys: 2000 }, world: { type: 'raw' } };
  var defaults = { gold: 0, name: '', items: {}, world: [] };
  var mk = function (o) { return M.createLarge(Object.assign({ name: id(), schema: schema, defaults: defaults }, o || {})); };
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var world = []; for (var i = 0; i < 3000; i++) world.push({ x: i, y: i * 2, t: 'tile' + (i % 7), on: i % 3 === 0 });
  var items = {}; for (i = 0; i < 300; i++) items['item ' + i] = i + 1;
  var st = function () { return { gold: 1234, name: 'Pip', items: JSON.parse(JSON.stringify(items)), world: JSON.parse(JSON.stringify(world)) }; };
  var check = function (k, v) { out[k] = String(v); };
  var same = function (a, b) { return JSON.stringify(Object.assign({}, a, { items: Object.assign({}, a.items), seen: 0 })) === JSON.stringify(Object.assign({}, b, { items: Object.assign({}, b.items), seen: 0 })); };
  var raw = function (name, slot, fn) {   // edit a stored record directly
    return new Promise(function (ok) {
      var rq = indexedDB.open(name, 1);
      rq.onsuccess = function () { var d = rq.result, t = d.transaction('slots', 'readwrite'), s = t.objectStore('slots'), g = s.get(slot); g.onsuccess = function () { fn(g.result, s, slot); }; t.oncomplete = function () { d.close(); ok(); }; };
    });
  };
  var a, r, s;
  // 1 round trip
  a = mk(); s = st(); r = await a.save(s); check('save returns true', r === true);
  var got = await a.load(); check('round trip is the same save', got && got.gold === 1234 && got.name === 'Pip' && got.items['item 7'] === 8 && got.world.length === 3000 && JSON.stringify(got.world) === JSON.stringify(world));
  // 2 refused broken number
  var bad = st(); bad.gold = NaN; check('NaN save refused', (await a.save(bad)) === false);
  bad = st(); bad.items['item 1'] = -5; check('negative count refused', (await a.save(bad)) === false);
  got = await a.load(); check('refused save left the good one', got && got.gold === 1234);
  // 3 damaged main falls back to the backup
  var nm = id(); a = mk({ name: nm }); await a.save(st()); await a.close();
  await raw(nm, 'main', function (rec, store, slot) { rec.t = 'x' + rec.t.slice(1); store.put(rec, slot); });
  a = mk({ name: nm }); got = await a.load(); check('broken JSON in main: the backup is used', got && got.gold === 1234 && got.world.length === 3000);
  await a.close();
  a = mk({ name: nm }); await a.save(st()); await a.close();
  await raw(nm, 'main', function (rec, store, slot) { rec.t = rec.t.slice(0, -5); store.put(rec, slot); });
  a = mk({ name: nm }); got = await a.load(); check('cut-off main text (length differs): the backup is used', got && got.gold === 1234); await a.close();
  await raw(nm, 'backup', function (rec, store, slot) { rec.n = rec.n + 1; store.put(rec, slot); });
  a = mk({ name: nm }); check('both slots damaged: null', (await a.load()) === null); await a.close();
  // 4 newest save wins, every caller is told
  a = mk(); var ps = []; for (i = 0; i < 40; i++) { s = st(); s.gold = i; ps.push(a.save(s)); }
  r = await Promise.all(ps); check('40 quick saves: all resolve true', r.every(function (x) { return x === true; }));
  got = await a.load(); check('40 quick saves: the last one is stored', got && got.gold === 39);
  // 5 clear
  check('clear works', (await a.clear()) === true && (await a.load()) === null);
  // 6 missing: nothing stored
  check('nothing stored loads null', (await mk().load()) === null);
  // 7 prototype keys are scrubbed
  a = mk(); s = st(); s.world = JSON.parse('{"a":{"__proto__":{"polluted":1}},"b":2}'); await a.save(s);
  got = await a.load(); check('__proto__ key in a raw field is dropped', got && got.world && got.world.b === 2 && !Object.prototype.hasOwnProperty.call(got.world.a, '__proto__') && ({}).polluted === undefined);
  // 8 backup refresh follows backupEveryMs
  nm = id(); a = mk({ name: nm, backupEveryMs: 1e9 }); s = st(); s.gold = 1; await a.save(s); s = st(); s.gold = 2; await a.save(s); await a.close();
  await raw(nm, 'main', function (rec, store, slot) { rec.n += 1; store.put(rec, slot); });
  a = mk({ name: nm }); got = await a.load(); check('backup written once with backupEveryMs far away (older gold 1)', got && got.gold === 1); await a.close();
  // 9 lock
  nm = id(); a = mk({ name: nm, lock: true }); var b = mk({ name: nm, lock: true }); var lost = 0; a.onLost(function () { lost++; });
  check('lock: first tab saves', (await a.save(st())) === true);
  check('lock: second tab refused', (await b.save(st())) === false);
  check('lock: steal succeeds', (await b.claim(true)) === true);
  await wait(30); check('lock: the old holder is told', lost === 1);
  check('lock: new holder saves', (await b.save(st())) === true); check('lock: old holder refused', (await a.save(st())) === false);
  // 10 other tab message
  nm = id(); a = mk({ name: nm }); b = mk({ name: nm }); var heard = null; a.onOtherTab(function (x) { heard = x; });
  await a.load(); s = st(); s.gold = 77; await b.save(s); for (i = 0; i < 40 && !heard; i++) await wait(25);
  check('other tab save is heard', heard && heard.gold === 77); check('own save is not echoed', await (async function () { var c = 0; b.onOtherTab(function () { c++; }); s = st(); s.gold = 5; await b.save(s); await wait(100); return c === 0; })());
  // 11 no IndexedDB: everything quietly false/null
  var none = mk({ indexedDB: null }); check('no IndexedDB: save false, load null', (await none.save(st())) === false && (await none.load()) === null);
  return out;
}

async function bench(src, libs, sizes, rounds, only) {
  var M = (function () { var m = { exports: {} }; new Function('module', src)(m); return m.exports; })();
  var idbk = (function () { var m = { exports: {} }; new Function('module', 'exports', libs.idb)(m, m.exports); return m.exports; })();
  var lf = (function () { var m = { exports: {} }; new Function('module', 'exports', libs.lf)(m, m.exports); return m.exports; })();
  lf.config({ name: 'lf-bench' });
  var schema = { gold: 'num', name: 'str:20', items: { type: 'counts', maxKeys: 5000 }, world: { type: 'raw' } }, defaults = { gold: 0, name: '', items: {}, world: [] };
  var ours = M.createLarge({ name: 'ours-' + Date.now(), schema: schema, defaults: defaults, backupEveryMs: 60000 });
  var oursB = M.createLarge({ name: 'oursB-' + Date.now(), schema: schema, defaults: defaults, backupEveryMs: 0 });
  var customStore = idbk.createStore('idbk-bench-' + Date.now(), 'kv');
  function state(mb) {   // world tiles ~55 bytes of JSON each
    var n = Math.round(mb * 1e6 / 55), world = [], i, items = {};
    for (i = 0; i < n; i++) world.push({ x: i, y: i * 2, t: 'tile' + (i % 7), on: i % 3 === 0 });
    for (i = 0; i < 2000; i++) items['item ' + i] = i % 50 + 1;
    return { gold: 1234, name: 'Pip', items: items, world: world };
  }
  var med = function (a) { a = a.slice().sort(function (x, y) { return x - y; }); return a[a.length >> 1]; };
  var res = {};
  async function timed(fn) { var t = performance.now(); await fn(); return performance.now() - t; }
  for (var z = 0; z < sizes.length; z++) {
    var s = state(sizes[z]), kb = Math.round(JSON.stringify(s).length / 1024), ts = {}, k, r;
    var ops = {
      'ours save': function () { return ours.save(s); }, 'ours save (backup every time)': function () { return oursB.save(s); },
      'idb-keyval set': function () { return idbk.set('k', s, customStore); }, 'localForage setItem': function () { return lf.setItem('k', s); }
    };
    var lops = {
      'ours load': function () { return ours.load(); }, 'ours load (backup every time)': function () { return oursB.load(); },
      'idb-keyval get': function () { return idbk.get('k', customStore); }, 'localForage getItem': function () { return lf.getItem('k'); }
    };
    if (only) { [ops, lops].forEach(function (g) { Object.keys(g).forEach(function (k) { if (k.indexOf(only) < 0) delete g[k]; }); }); }
    // Each library runs its own block of rounds (so one library's leftover garbage does not land on the next one), blocks run forward and then in reverse, round 0 of each block is a warm-up.
    var groups = [['ours save', 'ours load'], ['ours save (backup every time)', 'ours load (backup every time)'], ['idb-keyval set', 'idb-keyval get'], ['localForage setItem', 'localForage getItem']];
    if (only) groups = groups.filter(function (g) { return g[0].indexOf(only) >= 0; });
    for (var pass = 0; pass < 2; pass++) {
      var gs = pass ? groups.slice().reverse() : groups;
      for (var gi = 0; gi < gs.length; gi++) for (r = 0; r <= rounds; r++) {
        var d = await timed(ops[gs[gi][0]]); if (r > 0) (ts[gs[gi][0]] = ts[gs[gi][0]] || []).push(d);
        d = await timed(lops[gs[gi][1]]); if (r > 0) (ts[gs[gi][1]] = ts[gs[gi][1]] || []).push(d);
      }
    }
    for (k in ts) res[sizes[z] + ' MB (' + kb + ' KB of text) ' + k] = Math.round(med(ts[k]) * 10) / 10;
  }
  return res;
}

(async () => {
  let fails = 0;
  const srv = require('http').createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><title>save-kit large</title>'); });   // IndexedDB needs a real origin, not about:blank
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await wd.launch('webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' })
      : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    console.log('Browser: ' + await b.version());
    const p = await b.newPage(); const errs = []; p.on && p.on('pageerror', e => errs.push(String(e && e.message || e)));
    await p.goto(url);
    const got = await p.evaluate(battery, SRC);
    const badk = Object.keys(got).filter(k => got[k] !== 'true');
    if (badk.length || errs.length) { fails++; console.log('  FAIL: ' + (badk.join('; ') || 'nothing differs') + (errs.length ? '; page error: ' + errs[0] : '')); }
    else console.log('  ok   ' + Object.keys(got).length + ' large-save checks');
    if (LIBS && !process.env.NOBENCH) {
      const t = Date.now(), res = await p.evaluate(bench, SRC, LIBS, SIZES, ROUNDS, ONLY);
      console.log('  speed (ms for the whole call, median of ' + 2 * ROUNDS + ' (two passes), smaller is better), ' + Math.round((Date.now() - t) / 1000) + ' s:');
      for (const k of Object.keys(res)) console.log('    ' + k.padEnd(70) + res[k]);
    }
    if (p.close) await p.close();
    await b.close();
  }
  console.log(fails ? fails + ' FAILED' : 'all large-save checks passed');
  srv.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
