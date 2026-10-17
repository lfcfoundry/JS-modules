#!/usr/bin/env node
// save-kit "field rules read once" check. Copyright (c) 2026 LFC Foundry. MIT License.
// In Node and in each real browser: one game-sized schema (13 plain fields and 3 counts lists, like Apple Press) is saved and loaded with the new file and with OLD=/path/to/an/older/save-kit.js,
// alternating, and the check says whether both wrote the same stored text and loaded the same save, and how long one save and one load took (microseconds, smaller is better) for a small,
// a medium and a large save. Without OLD it only times the new file.
// Run one browser at a time: CHROMIUM=/path/to/chrome node tests/save-kit-speed-browser.js   (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK, WEBKIT=epiphany for GNOME Web)
// Needs puppeteer-core for Chromium and Firefox; WebKitGTK goes through tests/webkit-shim.js and tools/webkit-driver. Exit 2 (skipped) when nothing can run.
'use strict';
const path = require('path'), fs = require('fs');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const root = path.resolve(__dirname, '..') + '/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }
const SRC = fs.readFileSync(root + 'modules/save-kit/save-kit.js', 'utf8');
const OLD = process.env.OLD ? fs.readFileSync(process.env.OLD, 'utf8') : '';

// Runs unchanged in Node and in a page. `ms` holds microseconds a call (smaller is better).
function battery(src, oldSrc) {
  var load = function (text) { var m = { exports: {} }; new Function('module', text)(m); return m.exports; };
  var N = load(src), O = oldSrc ? load(oldSrc) : null, out = {}, ms = {};
  var mem = function () { var m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; }, dump: function () { return JSON.stringify(m); } }; };
  var schema = function () { return { count: 'num', total: 'num', credits: 'num', caught: 'int', runs: 'int', secs: 'num', name: 'str:19', pet: 'str:19', sound: 'flag', music: 'flag', fx: 'flag', hints: 'flag', short: 'flag', upgrades: { type: 'counts', max: 1e6 }, owned: { type: 'counts' }, stats: { type: 'counts' } }; };
  var defaults = { count: 0, total: 0, credits: 0, caught: 0, runs: 0, secs: 0, name: '', pet: '', sound: 1, music: 1, fx: 1, hints: 1, short: 0, upgrades: {}, owned: {}, stats: {} };
  function state(nUp, nOther) { var s = { count: 1234, total: 99999, credits: 42, caught: 77, runs: 12, secs: 3600, name: 'Apple Fan', pet: 'Pip', sound: 1, music: 0, fx: 1, hints: 1, short: 0, upgrades: {}, owned: {}, stats: {} }, i; for (i = 0; i < nUp; i++) s.upgrades['Upgrade number ' + i] = (i % 9) + 1; for (i = 0; i < nOther; i++) { s.owned['Item ' + i] = i % 3 + 1; s.stats['Stat ' + i] = i * 7 + 1; } return s; }
  function make(M) { var st = mem(); return { st: st, kit: M.create({ key: 'ap', schema: schema(), defaults: defaults, storage: st, backupEveryMs: 1e12, stamp: 'seen' }) }; }
  function round(fn, n) { var t = performance.now(), i; for (i = 0; i < n; i++) fn(); return (performance.now() - t) * 1000 / n; }
  var sizes = [['small', 3, 5, 20000], ['medium', 40, 50, 5000], ['large', 1500, 500, 100]], z, op, r, who;
  for (z = 0; z < sizes.length; z++) {
    var s = state(sizes[z][1], sizes[z][2]), n = sizes[z][3], kits = { new: make(N) }, best = {};
    if (O) kits.old = make(O);
    for (who in kits) kits[who].kit.save(Object.assign({}, s));
    if (O) {
      out[sizes[z][0] + ' stored text is the same'] = String(kits.new.st.dump().replace(/\\"seen\\":\d+/g, '') === kits.old.st.dump().replace(/\\"seen\\":\d+/g, ''));
      var a = kits.new.kit.load(), b = kits.old.kit.load(); a.seen = b.seen = 0;
      out[sizes[z][0] + ' loads the same save'] = String(JSON.stringify(a) === JSON.stringify(b));
    }
    for (op = 0; op < 2; op++) for (r = 0; r < (O ? 7 : 3); r++) for (who in (r % 2 ? { old: 1, new: 1 } : { new: 1, old: 1 })) {
      if (!kits[who]) continue;
      var k = sizes[z][0] + ' ' + (op ? 'load' : 'save') + ' ' + who, fn = op ? function () { kits[who].kit.load(); } : function () { kits[who].kit.save(s); }, v = round(fn, n);
      if (r > 0 && (best[k] === undefined || v < best[k])) best[k] = v;   // round 0 warms up
    }
    for (var key in best) ms[key] = Math.round(best[key] * 100) / 100;
  }
  return { out: out, ms: ms };
}

const bad = (o) => Object.keys(o).filter(k => o[k] !== 'true');
const table = (ms) => { const rows = []; for (const k of Object.keys(ms)) if (/ new$/.test(k)) { const base = k.slice(0, -4), o = ms[base + ' old']; rows.push('    ' + base.padEnd(14) + ms[k] + ' us' + (o !== undefined ? ' (old ' + o + ' us, ' + (o / ms[k]).toFixed(2) + 'x as fast; higher is better)' : '')); } return rows.join('\n'); };
const ref = battery(SRC, OLD);
let fails = bad(ref.out).length;
console.log('Node ' + process.version + ': ' + (OLD ? (fails ? 'DIFFERS: ' + bad(ref.out).join('; ') : 'old and new store and load the same') : 'timed the new file only') + '\n' + table(ref.ms));

(async () => {
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await wd.launch(exe === 'epiphany' ? 'epiphany' : 'webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' })
      : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    console.log('Browser: ' + await b.version());
    const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e && e.message || e)));
    await p.goto('about:blank');
    const got = await p.evaluate(battery, SRC, OLD);
    const diff = bad(got.out);
    if (diff.length || errs.length) { fails++; console.log('  FAIL: ' + (diff.join('; ') || 'nothing differs') + (errs.length ? '; page error: ' + errs[0] : '')); }
    else console.log('  ok   ' + (OLD ? 'old and new store and load the same' : 'timed') + '\n' + table(got.ms));
    if (p.close) await p.close();
    await b.close();
  }
  console.log(fails ? fails + ' FAILED' : 'all save-kit checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
