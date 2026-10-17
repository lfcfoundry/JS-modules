#!/usr/bin/env node
// walker-sim "same answers" and speed check. Copyright (c) 2026 LFC Foundry. MIT License.
// Runs one fixed set of walks and exact solves in Node and in each real browser and compares the answers, for walker-sim.js and walker-sim.min.js, and prints
// how long the main jobs took in that browser. Run one browser at a time: CHROMIUM=/path/to/chrome node tests/walker-sim-browser.js   (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK)
// Needs puppeteer-core for Chromium and Firefox; WebKitGTK goes through tests/webkit-shim.js and tools/webkit-driver. Exit 2 (skipped) when nothing can run.
const path = require('path');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const root = path.resolve(__dirname, '..') + '/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }

// The battery runs against the global WalkerSim. It returns plain numbers and short text, so it can run unchanged in Node and in a page. Timings go in `ms`.
function battery() {
  var S = WalkerSim, out = {}, ms = {}, s = 5;
  function rnd() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }
  function net() {   // 199 items, about 560 links, 23 ends, a few loops (the README's made-up network)
    var links = [], L = 4, Wd = 44, K = 23, i, l;
    function id(l, i) { return l < 0 ? 'start' : l === L ? 'end' + i : 'l' + l + '_' + i; }
    function size(l) { return l < 0 ? 1 : l === L ? K : Wd; }
    for (l = -1; l < L; l++) for (i = 0; i < size(l); i++) {
      var deg = l === -1 ? 20 : 3 + (rnd() < 0.2 ? 1 : 0) - (rnd() < 0.05 ? 1 : 0), seen = {}, d;
      for (d = 0; d < deg; d++) { var j = Math.floor(rnd() * size(l + 1)); if (seen[j]) continue; seen[j] = 1; links.push({ from: id(l, i), to: id(l + 1, j), weight: 1 + Math.floor(rnd() * 5) }); }
      if (l >= 1 && rnd() < 0.24) links.push({ from: id(l, i), to: id(Math.floor(rnd() * l), Math.floor(rnd() * Wd)), weight: 1 + Math.floor(rnd() * 5) });
    }
    return S.graph({ links: links, start: 'start' });
  }
  function counts(r) { return r.endpoints.map(function (e) { return e.count; }).join(','); }
  function time(name, fn) { var t = performance.now(), v = fn(); ms[name] = Math.round((performance.now() - t) * 10) / 10; return v; }
  var P = net(), cfg = { seed: 7, trials: 10000, rule: 'weights', weights: P.w, arrivals: { dist: 'fixed', a: 100 } }, sim;
  time('1M walkers', function () { sim = S.create(P, cfg); sim.run(1e9, 1e9); });
  var r = time('snapshot', function () { return sim.snapshot(); });
  out.items = P.n + '/' + P.m; out.counts = counts(r); out.steps = r.stepStats.mean + '|' + r.stepStats.p50 + '|' + r.steps.bins.join(','); out.stuck = r.stuck;
  var ex = time('exact', function () { return S.exactEndpoints(P, { rule: 'weights', weights: P.w }); });
  out.exact = Array.prototype.slice.call(ex.p); out.meanSteps = ex.meanSteps; out.converged = ex.converged;
  var sw = time('sweep items 40', function () { return S.sweep(P, { rule: 'weights', weights: P.w }, { what: 'items', top: 40 }); });
  out.sweep = sw.rows.map(function (x) { return x.id + ':' + x.shift; });
  var sl = time('sweep links 40', function () { return S.sweep(P, { rule: 'weights', weights: P.w }, { what: 'links', top: 40 }); });
  out.sweepLinks = sl.rows.map(function (x) { return x.from + '>' + x.to + ':' + x.shift; });
  var a = S.create(P, Object.assign({}, cfg, { trials: 5000 })), b = S.create(P, Object.assign({}, cfg, { firstTrial: 5000 })); a.run(1e9, 1e9); b.run(1e9, 1e9);
  out.merged = counts(S.merge(P, cfg, [b.export(), a.export()]).snapshot());
  var pr = S.create(P, Object.assign({}, cfg, { trials: 100000, precision: 0.005 })); pr.run(1e9, 1e9); out.precision = pr.snapshot().trials + '|' + pr.snapshot().stoppedEarly;
  var loop = S.graph({ links: [{ from: 's', to: 'a', weight: 1 }, { from: 'a', to: 's', weight: 9999 }, { from: 'a', to: 'e', weight: 1 }], start: 's' }), le = S.exactEndpoints(loop, { rule: 'weights', weights: loop.w });
  out.loop = le.p[0] + '|' + le.method;
  var cc = S.create(P, Object.assign({}, cfg, { trials: 300, linkCost: { dist: 'lognormal', a: 5, b: 2 }, dwell: { dist: 'exponential', a: 3 } })); cc.run(1e9, 1e9);
  var cr = cc.snapshot(); out.costCounts = counts(cr); out.costMean = cr.cost.mean; out.costExact = S.exactEndpoints(P, Object.assign({}, cfg, { linkCost: { dist: 'lognormal', a: 5, b: 2 }, dwell: { dist: 'exponential', a: 3 } })).meanCost;
  out.menu = typeof WalkerSim.DISTS === 'undefined' ? 'none' : WalkerSim.DISTS.length;
  return { out: out, ms: ms };
}

function nodeBattery(file, withMenu) { global.WalkerSim = require(path.resolve(file)); if (withMenu) require(path.resolve(root + 'modules/walker-sim/walker-sim-menu.js')); return battery(); }
const golden = nodeBattery(root + 'modules/walker-sim/walker-sim.js', true), goldenMin = nodeBattery(root + 'modules/walker-sim/walker-sim.min.js', false);
// Integers and counts must agree exactly. Floating-point answers (exact odds, shifts, averages) may differ in the last digits between engines (Math.exp and Math.log are not bit-identical).
function compare(g, got) {
  const bad = [], note = [];
  const close = (x, y) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x));
  for (const k of Object.keys(g)) {
    const a = g[k], b = got[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (k === 'exact' && a.length === b.length && a.every((x, i) => close(x, b[i]))) continue;
    if ((k === 'meanSteps' || k === 'costExact' || k === 'costMean') && close(a, b)) continue;
    if ((k === 'sweep' || k === 'sweepLinks' || k === 'loop') && String(a).length === String(b).length && a.length === b.length) {   // same items in the same order, shifts equal to 1e-9
      const A = [].concat(a).map(s => String(s).split(':')), B = [].concat(b).map(s => String(s).split(':'));
      if (A.every((x, i) => x[0] === B[i][0] && close(+x[1], +B[i][1]))) continue;
    }
    if (k === 'loop' && a.split('|')[1] === b.split('|')[1] && close(+a.split('|')[0], +b.split('|')[0])) continue;
    bad.push(k + ' (node ' + String(a).slice(0, 60) + ', browser ' + String(b).slice(0, 60) + ')');
  }
  return bad;
}
const nodeSame = JSON.stringify(golden.out.counts) === JSON.stringify(goldenMin.out.counts) && compare(golden.out, Object.assign({}, goldenMin.out, { menu: golden.out.menu })).length === 0;
console.log('Node ' + process.version + ': readable and minified give the same answers: ' + nodeSame + '; timings (ms): ' + JSON.stringify(golden.ms));

(async () => {
  let fails = nodeSame ? 0 : 1;
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await wd.launch(exe === 'epiphany' ? 'epiphany' : 'webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' })
      : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    console.log('Browser: ' + await b.version());
    for (const q of ['', '?min']) {
      const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e && e.message || e)));
      await p.goto('file://' + root + 'modules/walker-sim/test/page.html' + q);
      const got = await p.evaluate(battery), bad = compare(golden.out, got.out);
      if (bad.length || errs.length) { fails++; console.log('  FAIL ' + (q ? 'minified' : 'readable') + ': differs in ' + (bad.join('; ') || 'nothing') + (errs.length ? '; page error: ' + errs[0] : '')); }
      else console.log('  ok   ' + (q ? 'minified' : 'readable') + ': all ' + Object.keys(golden.out).length + ' answers equal Node; timings (ms): ' + JSON.stringify(got.ms));
      if (p.close) await p.close();
    }
    await b.close();
  }
  console.log(fails ? fails + ' FAILED' : 'all same-answer checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
