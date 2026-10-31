#!/usr/bin/env node
// save-kit durable option (IndexedDB mirror + recover()) in real browsers. Copyright (c) 2026 LFC Foundry. MIT License.
// 1 checks: mirror written, recover() brings back a copy newer than localStorage, ignores an older one.
// 2 speed: save() time on the page thread with and without durable (2 KB and 200 KB saves), time until the strict copy is on disk,
//   startup (create + load) with and without durable, and how long recover() takes to answer.
// 3 CRASH=1 (Chromium and Firefox): save every 100 ms for SECS seconds, kill the browser process, start it again on the same profile and
//   compare what localStorage kept against the IndexedDB copy.
//   CHROMIUM=/path/to/chrome FIREFOX=/path/to/firefox WEBKIT=1 node tests/save-kit-durable-browser.js
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const root = path.resolve(__dirname, '..') + '/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }
const SRC = fs.readFileSync(root + (process.env.SRC || 'modules/save-kit/save-kit.js'), 'utf8');
const ROUNDS = +(process.env.ROUNDS || 31), SECS = +(process.env.SECS || 8);

async function battery(src, rounds) {
  var M = (function () { var m = { exports: {} }; new Function('module', src)(m); return m.exports; })(), out = {}, n = 0;
  var schema = { gold: 'num', name: 'str:20', items: { type: 'counts', maxKeys: 5000 } };
  var key = function () { return 'skd-' + Date.now() + '-' + (n++); };
  var check = function (k, v) { out['check: ' + k] = v === true ? 'true' : 'FAIL'; };
  // checks
  var k1 = key(), a = M.create({ key: k1, schema: schema, durable: true });
  a.save({ gold: 1 }); check('flushed resolves true', (await a.flushed()) === true);
  var old = localStorage.getItem(k1);
  a.save({ gold: 9 }); await a.flushed();
  localStorage.setItem(k1, old);   // a crash that lost the last localStorage write
  var b = M.create({ key: k1, schema: schema, durable: true });
  check('load() still the fast localStorage copy', b.load().gold === 1);
  var r = await b.recover(); check('recover() brings back the newer copy', !!r && r.gold === 9);
  check('newer copy written back', JSON.parse(localStorage.getItem(k1)).gold === 9);
  var c = M.create({ key: k1, schema: schema, durable: true }); c.load();
  check('recover() null when nothing was lost', (await c.recover()) === null);
  // speed
  var med = function (x) { x = x.slice().sort(function (p, q) { return p - q; }); return x[x.length >> 1]; };
  var state = function (kb) { var items = {}, i, m = Math.round(kb * 1024 / 16); for (i = 0; i < m; i++) items['item ' + i] = i % 50 + 1; return { gold: 1234, name: 'Pip', items: items }; };
  var sizes = [2, 200], z, i, t;
  for (z = 0; z < sizes.length; z++) {
    var s = state(sizes[z]), kp = key(), kd = key(), plain = M.create({ key: kp, schema: schema, backupEveryMs: 1e12 }), dur = M.create({ key: kd, schema: schema, durable: true, backupEveryMs: 1e12 });
    await dur.recover();
    var tp = [], td = [], tf = [], tl = [];
    for (i = 0; i <= rounds; i++) {
      var order = i & 1 ? [0, 1] : [1, 0];
      for (var o = 0; o < 2; o++) {
        s.gold = i;
        if (order[o] === 0) { t = performance.now(); plain.save(s); if (i) tp.push(performance.now() - t); }
        else { t = performance.now(); dur.save(s); var t1 = performance.now(); await dur.flushed(); if (i) { td.push(t1 - t); tf.push(performance.now() - t); } }
      }
      await new Promise(function (ok) { setTimeout(ok, 5); });
    }
    var sp = [], sd = [], sr = [];
    for (i = 0; i <= rounds; i++) {
      t = performance.now(); var x = M.create({ key: kp, schema: schema }); x.load(); if (i) sp.push(performance.now() - t);
      t = performance.now(); var y = M.create({ key: kd, schema: schema, durable: true }); y.load(); var t2 = performance.now(); await y.recover(); if (i) { sd.push(t2 - t); sr.push(performance.now() - t); }
    }
    var lb = sizes[z] + ' KB ';
    out[lb + 'save() page time, plain'] = med(tp); out[lb + 'save() page time, durable'] = med(td); out[lb + 'durable: save until strict copy on disk'] = med(tf);
    out[lb + 'startup create+load, plain'] = med(sp); out[lb + 'startup create+load, durable'] = med(sd); out[lb + 'durable: until recover() answers'] = med(sr);
  }
  // durableCopy with a big text (Story Editor saves 1 to 4 MB of JSON)
  var big = JSON.stringify({ pages: Array.from({ length: 4600 }, function (_, q) { return { id: q, title: 'Page ' + q, text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(15) }; }) });
  var dn = key(), dc = M.durableCopy(dn), wp = [], wf = [], nw = [], br = Math.min(rounds, 11);
  dc.write(big, 0); await dc.flushed();
  for (i = 1; i <= br; i++) { t = performance.now(); dc.write(big, i); var tw = performance.now(); await dc.flushed(); wp.push(tw - t); wf.push(performance.now() - t); }
  for (i = 0; i < br; i++) { t = performance.now(); var dd = M.durableCopy(dn), got = await dd.newer(0); nw.push(performance.now() - t); }
  check('durableCopy 4 MB: newer() gives the last text', !!got && got.seq === br && got.text === big);
  var lb2 = (big.length / 1048576).toFixed(1) + ' MB text ';
  out[lb2 + 'durableCopy write() page time'] = med(wp); out[lb2 + 'durableCopy until on disk'] = med(wf); out[lb2 + 'durableCopy open + newer()'] = med(nw);
  return out;
}

async function crashRun(kind, exe, url) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skd-crash-'));
  const launch = () => kind === 'firefox' ? pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi', userDataDir: dir })
    : pp.launch({ executablePath: exe, headless: true, userDataDir: dir, args: ['--no-sandbox', '--disable-gpu'] });
  let b = await launch(), p = await b.newPage();
  await p.goto(url);
  await p.evaluate(src => { var m = { exports: {} }; new Function('module', src)(m); window.K = m.exports.create({ key: 'crash', schema: { gold: 'num' }, durable: true }); window.n = 0;
    setInterval(function () { window.K.save({ gold: ++window.n }); }, 100); }, SRC);
  await new Promise(r => setTimeout(r, SECS * 1000));
  const last = await p.evaluate(() => window.n);
  b.process().kill('SIGKILL');
  await new Promise(r => setTimeout(r, 500));
  b = await launch(); p = await b.newPage(); await p.goto(url);
  const got = await p.evaluate(async src => { var m = { exports: {} }; new Function('module', src)(m); var k = m.exports.create({ key: 'crash', schema: { gold: 'num' }, durable: true });
    var l = k.load(), r = await k.recover(); return { ls: l ? l.gold : 0, idb: r ? r.gold : l ? l.gold : 0 }; }, SRC);
  await b.close(); fs.rmSync(dir, { recursive: true, force: true });
  return { last, ls: got.ls, idb: got.idb };
}

(async () => {
  let fails = 0;
  const srv = require('http').createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><title>save-kit durable</title>'); });
  await new Promise(ok => srv.listen(+(process.env.PORT || 0), '127.0.0.1', ok));
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await wd.launch('webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' })
      : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    console.log('Browser: ' + await b.version());
    const p = await b.newPage(); await p.goto(url);
    const got = await p.evaluate(battery, SRC, ROUNDS);
    for (const k of Object.keys(got)) { if (got[k] === 'FAIL') fails++; console.log('  ' + k.padEnd(52) + (typeof got[k] === 'number' ? got[k].toFixed(3) + ' ms' : got[k])); }
    if (p.close) await p.close();
    await b.close();
    if (process.env.CRASH && kind !== 'webkit') {
      const c = await crashRun(kind, exe, url);
      console.log('  crash after ' + SECS + ' s of saves every 100 ms: last save ' + c.last + ', localStorage kept ' + c.ls + ' (' + (c.last - c.ls) + ' lost), with recover() ' + c.idb + ' (' + (c.last - c.idb) + ' lost)');
    }
  }
  console.log(fails ? fails + ' FAILED' : 'all durable checks passed');
  srv.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
