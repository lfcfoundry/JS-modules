#!/usr/bin/env node
// memory-compression (the one-file module) in a real browser. Copyright (c) 2026 LFC Foundry. MIT License.
// Runs modules/memory-compression/test/run.js (the object layer) and test/router.js (the one entry point) themselves (all of its checks: every kind of value, every data set in every mode, damaged input, the number chooser, the keeper) inside the page,
// with small stand-ins for require, path, assert and process, so the one file is held to the same checks in each browser, with the WebAssembly helper on (the page's default) and,
// with JSONLY=1, the plain-JavaScript path only. One browser at a time: CHROMIUM=/path/to/chrome node tests/memory-compression-browser.js   (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK,
// WEBKIT=epiphany for GNOME Web). Needs puppeteer-core for Chromium and Firefox; WebKitGTK goes through tests/webkit-shim.js. Exit 2 (skipped) when nothing can run.
'use strict';
const path = require('path'), fs = require('fs');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const dir = path.resolve(__dirname, '..', 'modules', 'memory-compression') + '/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }
const SRC = { module: fs.readFileSync(dir + 'memory-compression.js', 'utf8'), data: fs.readFileSync(dir + 'test/data.js', 'utf8'), run: fs.readFileSync(dir + 'test/run.js', 'utf8'), router: fs.readFileSync(dir + 'test/router.js', 'utf8') };
const JSONLY = !!process.env.JSONLY, FULLFUZZ = !!process.env.FULL;

async function battery(src, jsOnly, full) {
  const lines = []; let code = null, done; const finished = new Promise(r => { done = r; });
  function eq(a, b) {   // deep strict equality for plain data, typed arrays, Date, Map/Set are not used by the checks
    if (Object.is(a, b)) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || !a || !b || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
    if (ArrayBuffer.isView(a)) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false; return true; }
    const ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false;
    for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !eq(a[k], b[k])) return false;
    return true;
  }
  const fail = (m, d) => { const e = new Error(m || d); e.name = 'AssertionError'; throw e; };
  const assert = function (v, m) { if (!v) fail(m, 'assertion failed'); };
  assert.strictEqual = (a, b, m) => { if (!Object.is(a, b)) fail(m, 'expected ' + String(b) + ' got ' + String(a)); };
  assert.notStrictEqual = (a, b, m) => { if (Object.is(a, b)) fail(m, 'did not expect ' + String(a)); };
  assert.deepStrictEqual = (a, b, m) => { if (!eq(a, b)) fail(m, 'not deeply equal'); };
  assert.fail = (m) => fail(m, 'failed');
  assert.throws = (fn, re, m) => { try { fn(); } catch (e) { if (re && !re.test(String(e && e.message))) fail(m, 'threw the wrong error: ' + (e && e.message)); return; } fail(m, 'did not throw'); };
  const mods = {};
  const load = (name, text) => { const m = { exports: {} }; new Function('module', 'exports', text)(m, m.exports); mods[name] = m.exports; };
  load('data', src.data); load('module', src.module);
  const fakePath = { join: (...a) => a.join('/'), resolve: (...a) => a.join('/') };
  const fakeRequire = (n) => { if (n === 'vm' || n === 'fs') throw new Error('no ' + n); return n === 'assert' ? assert : n === 'path' ? fakePath : /data\.js$/.test(n) ? mods.data : mods.module; };
  class B extends Uint8Array { toString() { return new TextDecoder().decode(this); } }   // the few Buffer calls the checks make: Buffer.from(text), (text, 'base64') and (bytes), and .toString()
  const Buf = { from: (x, enc) => { if (typeof x === 'string') { if (enc === 'base64') { const bin = atob(x); const u = new B(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; } const e = new TextEncoder().encode(x); const u = new B(e.length); u.set(e); return u; } const u = new B(x.length); u.set(x); return u; } };
  const proc = { argv: ['node', 'run.js'].concat(jsOnly ? ['--js-only'] : []), env: full ? { FULL: '1' } : {}, exit: (c) => { code = c; done(); } };
  const con = { log: (...a) => lines.push(a.join(' ')) };
  const t0 = performance.now();
  try { new Function('require', 'process', 'console', '__dirname', 'Buffer', src.run)(fakeRequire, proc, con, '/x/test', Buf); } catch (e) { lines.push('runner error: ' + (e && e.message)); done(); }
  await Promise.race([finished, new Promise(r => setTimeout(r, 170000))]);
  const rlines = [], rcon = { log: (...a) => rlines.push(a.join(' ')) };   // the router checks (which layer packs, which opens, the old formats) run after the module's own, in the same page
  try { new Function('require', 'process', 'console', '__dirname', 'Buffer', src.router)(fakeRequire, { argv: ['node', 'router.js'], env: {}, exit: () => {} }, rcon, '/x/test', Buf); } catch (e) { rlines.push('router error: ' + (e && e.message)); }
  for (let w = 0; w < 100 && !rlines.some(l => /checks passed|error/.test(l)); w++) await new Promise(r => setTimeout(r, 200));   // the router's last checks finish a moment after the first ones
  const rlast = (rlines.filter(l => /checks passed|error/.test(l)).pop() || '').trim();
  const last = (lines.filter(l => /checks passed|failed/.test(l)).pop() || '').trim();
  return { rtail: rlines.slice(-4).join(' | '), rlast, rfails: rlines.filter(l => /error|FAIL/.test(l)), globals: typeof self !== 'undefined' && typeof MemoryCompression, last, fails: lines.filter(l => /^\s*FAIL/.test(l)), head: lines[0] || '', code, ms: Math.round(performance.now() - t0), tail: lines.slice(-3) };
}

(async () => {
  let bad = 0;
  for (const [kind, exe] of exes) {
    const t0 = Date.now();
    const b = kind === 'webkit' ? await wd.launch(exe === 'epiphany' ? 'epiphany' : 'webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' })
      : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    const version = await b.version(); console.log('Browser: ' + version);
    const p = await b.newPage(); const errs = []; p.on && p.on('pageerror', e => errs.push(String(e && e.message || e)));
    await p.goto('about:blank');
    const r = await p.evaluate(battery, SRC, JSONLY, FULLFUZZ);
    const ok = r.code === 0 && /\bchecks passed/.test(r.last) && !r.fails.length && /^\d+ checks passed/.test(r.rlast) && !r.rfails.length && !errs.length;
    if (!ok) bad++;
    if (!ok && !/^\d+ checks passed/.test(r.rlast)) console.log('  router lines: ' + r.rtail);
    console.log('  ' + r.head);
    console.log((ok ? '  ok   ' : '  FAIL ') + 'router checks: ' + (r.rlast || 'no result') + '\n  ' + (ok ? 'ok   ' : 'FAIL ') + 'test/run.js in this page: ' + (r.last || 'no result') + ' (' + (r.ms / 1000).toFixed(1) + ' s)' + (r.fails.length ? '\n       ' + r.fails.slice(0, 4).join('\n       ') : '') + (errs.length ? '; page error: ' + errs[0] : '') + (!r.last ? ' ' + r.tail.join(' | ') : ''));
    console.log('  ' + version + ': ' + (ok ? 'passed' : 'FAILED') + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
    if (p.close) await p.close();
    await b.close();
  }
  console.log(bad ? bad + ' FAILED' : 'memory-compression browser checks passed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
