#!/usr/bin/env node
// frame-kit in a real browser. Copyright (c) 2026 LFC Foundry. MIT License.
// (1) Runs modules/frame-kit/test/run.js itself (all 64 checks, fake clock) inside the page, with small stand-ins for require, fs, path, vm and process, so the four files are
// held to the same checks in each browser. (2) Feeds real animation frames (requestAnimationFrame, about 1.5 s) to FrameMeter, EvenDt and QualityGovernor: the frames must come,
// the meter must report a frame rate, EvenDt must learn a period and nothing may throw. Frame counts depend on the headless browser's timing; this part only checks that it works.
// Run one browser at a time: CHROMIUM=/path/to/chrome node tests/frame-kit-browser.js   (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK, WEBKIT=epiphany for GNOME Web)
// Needs puppeteer-core for Chromium and Firefox; WebKitGTK goes through tests/webkit-shim.js and tools/webkit-driver. Exit 2 (skipped) when nothing can run.
'use strict';
const path = require('path'), fs = require('fs');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const root = path.resolve(__dirname, '..') + '/', dir = root + 'modules/frame-kit/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }
const FILES = ['even-dt.js', 'quality-governor.js', 'job-pump.js', 'frame-meter.js'], SRC = {};
FILES.forEach(f => SRC[f] = fs.readFileSync(dir + f, 'utf8'));
const RUN = fs.readFileSync(dir + 'test/run.js', 'utf8');

async function battery(files, runText) {
  var lines = [], code = null, mods = {};
  Object.keys(files).forEach(function (f) { var m = { exports: {} }; new Function('module', files[f])(m); mods[f] = m.exports; });
  var fakeRequire = function (name) {
    if (name === 'path') return { join: function () { return Array.prototype.slice.call(arguments).join('/').replace(/[^/]*\/\.\.\/?/g, ''); } };
    if (name === 'fs') return { readFileSync: function (p) { return files[String(p).split('/').pop()]; } };
    if (name === 'vm') return { createContext: function (c) { return c; }, runInContext: function (src, ctx) { (0, eval)(src); ['EvenDt', 'QualityGovernor', 'JobPump', 'FrameMeter', '__top'].forEach(function (k) { ctx[k] = window[k]; }); } };
    return mods[String(name).split('/').pop()];
  };
  // run.js pretends the page is hidden with `global.document = { hidden: true }`; here that becomes a temporary override of document.hidden on the real document
  var glob = new Proxy({}, {
    set: function (t, k, v) { if (k === 'document') Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return v.hidden; } }); else t[k] = v; return true; },
    deleteProperty: function (t, k) { if (k === 'document') delete document.hidden; else delete t[k]; return true; }
  });
  var con = { log: function () { lines.push(Array.prototype.slice.call(arguments).join(' ')); } };
  var proc = { env: {}, exit: function (c) { code = c; throw new Error('exit'); } };
  try { new Function('require', 'process', 'console', '__dirname', 'global', runText)(fakeRequire, proc, con, '/x/test', glob); } catch (e) { if (code === null) lines.push('runner error: ' + (e && e.message)); }
  var last = lines.filter(function (l) { return /\d+ passed, \d+ failed/.test(l); }).pop() || '';
  last = last.trim();
  var fails = lines.filter(function (l) { return /^\s+FAIL/.test(l); });
  // real frames
  var M = mods['frame-meter.js'], E = mods['even-dt.js'], Q = mods['quality-governor.js'], real = { frames: 0, errors: [] };
  try {
    var meter = new M(), ev = new E(), gov = new Q({ levels: 3 }), prev = 0, t0 = performance.now(), first = true;
    await new Promise(function (done) {
      function tick(t) {
        try { meter.frame(t); if (!first) { ev.next(t - prev); gov.frame(t - prev, t); } first = false; prev = t; real.frames++; } catch (e) { real.errors.push(String(e && e.message)); }
        if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else done();
      }
      requestAnimationFrame(tick); setTimeout(done, 4000);
    });
    real.fps = Math.round(meter.fps); real.period = Math.round(ev.period * 100) / 100;
  } catch (e) { real.errors.push(String(e && e.message)); }
  return { last: last, fails: fails, code: code, real: real };
}

(async () => {
  let bad = 0;
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await wd.launch(exe === 'epiphany' ? 'epiphany' : 'webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' })
      : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    console.log('Browser: ' + await b.version());
    const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e && e.message || e)));
    await p.goto('about:blank');
    const r = await p.evaluate(battery, SRC, RUN);
    const ok = r.code === 0 && /\b0 failed/.test(r.last) && !errs.length;
    if (!ok) bad++;
    console.log((ok ? '  ok   ' : '  FAIL ') + 'run.js in this page: ' + (r.last || 'no result') + (r.fails.length ? '\n       ' + r.fails.slice(0, 4).join('\n       ') : '') + (errs.length ? '; page error: ' + errs[0] : ''));
    const re = r.real, realOk = re.frames > 10 && re.errors.length === 0;
    console.log((realOk ? '  ok   ' : '  FAIL ') + 'real frames: ' + re.frames + ' animation frames in about 1.5 s, meter ' + re.fps + ' fps, learned period ' + re.period + ' ms' + (re.errors.length ? '; errors: ' + re.errors[0] : ''));
    if (!realOk) bad++;
    if (p.close) await p.close();
    await b.close();
  }
  console.log(bad ? bad + ' FAILED' : 'frame-kit browser checks passed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
