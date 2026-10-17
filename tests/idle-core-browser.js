#!/usr/bin/env node
// idle-core "same answers" check. Copyright (c) 2026 LFC Foundry. MIT License.
// Runs one fixed battery of calls (prices, Max, formatting, prestige, boosts) in Node and in each real browser and compares fingerprints, so a
// difference in Math.pow, rounding or number-to-text between engines shows up. Also checks the same battery on idle-core.min.js.
// Run one browser at a time: CHROMIUM=/path/to/chrome node tests/idle-core-browser.js   (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK)
// Needs puppeteer-core for Chromium and Firefox; WebKitGTK goes through tests/webkit-shim.js and tools/webkit-driver. Exit 2 (skipped) when nothing can run.
const path = require('path'), fs = require('fs');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const root = path.resolve(__dirname, '..') + '/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }

// The battery. It uses the global IdleCore and returns plain numbers and short text, so it can run unchanged in Node and in a page.
function battery() {
  var I = IdleCore, out = {}, s = 12345;
  function rnd() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }
  function fnv(str) { var h = 2166136261, i; for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); }
  var i, parts, v;
  parts = []; for (i = 0; i < 3000; i++) { v = Math.floor(Math.pow(10, rnd() * 24)); parts.push(I.formatBig(v), I.formatRate(v / 7)); } out.format = fnv(parts.join('|'));
  parts = []; for (i = 0; i < 3000; i++) { v = Math.pow(10, rnd() * 4 - 2); parts.push(I.formatRate(v), I.formatRate(-v)); } out.formatSmall = fnv(parts.join('|'));
  parts = []; for (i = 0; i < 2000; i++) parts.push(I.upgradeCost(Math.floor(rnd() * 5000) + 1, [1, 5, 10, 15, 25, 100][i % 6], Math.floor(rnd() * 600), i % 3 ? 1 : 0.5));
  out.cost = parts;
  parts = []; var maxes = []; for (i = 0; i < 2000; i++) { parts.push(I.costOfMany(15, 15, Math.floor(rnd() * 500), Math.floor(rnd() * 300) + 1)); maxes.push(I.maxAffordable(15, 15, Math.floor(rnd() * 500), Math.pow(10, rnd() * 30))); }
  out.many = parts; out.maxN = maxes;
  parts = []; for (i = 0; i < 3000; i++) { v = I.buyPlan(Math.floor(rnd() * 5000) + 1, [1, 5, 7, 10, 15, 25, 100][i % 7], Math.floor(rnd() * 400), i % 4 ? 1 : 0.7, Math.pow(10, rnd() * 22), i % 5 ? 'max' : [1, 10, 25][i % 3], i % 2 ? 100 : 1000); parts.push(v.n + ':' + v.total + ':' + v.can); }
  out.buyPlanCounts = fnv(parts.map(function (p) { return p.split(':')[0] + p.split(':')[2]; }).join(','));
  out.buyPlanTotals = parts.map(function (p) { return +p.split(':')[1]; });   // totals: past 9e15 the last digit may differ between engines (Math.pow is not bit-identical)
  parts = []; for (i = 0; i < 4000; i++) { var root = [2, 3, 4][i % 3], sc = Math.pow(10, i % 13), pts = 1 + Math.floor(rnd() * 100000); parts.push(I.prestigeGain(I.prestigeNeeded(pts, sc, root, 1), sc, root, 1) - pts); }
  out.prestigeRoundTrip = parts.reduce(function (a, b) { return a + Math.abs(b); }, 0);   // 0 when every round trip is exact
  out.cookie1e15 = I.prestigeGain(1e15, 1e12, 3);
  var q = I.BoostQueue({ a: { secs: 20, max: 60 }, b: { secs: 20, max: 60 } }); q.give('a'); q.give('b'); var r = q.tick(30);
  out.boost = r.ended + '|' + r.started + '|' + q.state.time.b;
  var f = Object.freeze({ a: NaN, c: 3 }), rb = I.RateBook(function () { return f; }).get(); out.frozen = rb.a + '|' + rb.c;
  out.strings = [I.buyPlan(15, 15, 3, 1, 1e6, '10').n, I.costOfMany(15, 15, 3, '10') > 0, I.maxAffordable(15, 15, 3, '5000') > 0].join('|');
  var calls = 0; I.fastForward(function () { calls++; }, 600, { chunk: 5 }); out.ff = calls;
  out.eta = I.etaSec(100, 40, 3) + '|' + I.paybackSec(300, 5);
  if (typeof Intl !== 'undefined') { var nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }), bad = 0; for (i = 0; i < 20000; i++) { v = Math.floor(rnd() * 1e6); if (I.formatBig(v) !== nf.format(v)) bad++; } out.intlMismatch = bad; }
  return out;
}

function nodeBattery(file) { global.IdleCore = require(path.resolve(file)); return battery(); }
const golden = nodeBattery(root + 'modules/idle-core/idle-core.js');
const goldenMin = nodeBattery(root + 'modules/idle-core/idle-core.min.js');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Compare two batteries. Text, counts and fingerprints must be equal. Number lists must be equal below 1e9. From 1e9 up the last coin depend on
// the engine's Math.pow, expm1 and log1p (measured: Node, Chromium 155 and Firefox 158 are within 3e-16 of exact; WebKitGTK 2.52.6 up to 3e-14), so a gap
// of one coin or 1e-13 of the price is allowed there; the worst gap seen is printed. Counts (how many copies Max buys) never get any slack, except
// maxAffordable, which may be one off when the money lands on a price to within rounding.
function compare(g, got) {
  const bad = [], note = [];
  for (const k of Object.keys(g)) {
    if (Array.isArray(g[k])) {
      let loose = 0, wrong = 0, first = '', worst = 0;
      g[k].forEach((v, i) => {
        const w = got[k] && got[k][i]; if (v === w) return;
        const gap = Math.abs(v - w), rel = gap / Math.max(1, Math.abs(v));
        if ((v >= 1e9 || k === 'maxN') && gap <= Math.max(1, 1e-13 * Math.abs(v))) { loose++; if (rel > worst) worst = rel; }
        else { if (!wrong) first = ' e.g. #' + i + ': node ' + v + ', browser ' + w; wrong++; }
      });
      if (wrong) bad.push(k + ' (' + wrong + ' of ' + g[k].length + ' differ' + first + ')');
      else if (loose) note.push(k + ': ' + loose + ' of ' + g[k].length + ' differ in the last coins, worst gap ' + worst.toExponential(1) + ' of the price');
    } else if (g[k] !== got[k]) bad.push(k + ' (node ' + g[k] + ', browser ' + got[k] + ')');
  }
  return { bad, note };
}
console.log('Node ' + process.version + ': readable and minified give the same answers: ' + same(golden, goldenMin));

(async () => {
  let fails = same(golden, goldenMin) ? 0 : 1;
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await wd.launch(exe === 'epiphany' ? 'epiphany' : 'webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' })
      : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    console.log('Browser: ' + await b.version());
    for (const q of ['', '?min']) {
      const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e && e.message || e)));
      await p.goto('file://' + root + 'modules/idle-core/test/page.html' + q);
      const t0 = Date.now(); const got = await p.evaluate(battery); const ms = Date.now() - t0;
      const cmp = compare(golden, got), keys = cmp.bad;
      const label = q ? 'minified' : 'readable';
      if (keys.length || errs.length) { fails++; console.log('  FAIL ' + label + ': differs in ' + (keys.join('; ') || 'nothing') + (errs.length ? '; page error: ' + errs[0] : '')); }
      else console.log('  ok   ' + label + ': all ' + Object.keys(golden).length + ' fingerprints equal Node (' + ms + ' ms)' + (cmp.note.length ? '; ' + cmp.note.join('; ') : ''));
      if (p.close) await p.close();
    }
    await b.close();
  }
  console.log(fails ? fails + ' FAILED' : 'all same-answer checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
