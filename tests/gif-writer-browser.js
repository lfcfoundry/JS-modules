#!/usr/bin/env node
// gif-writer "same bytes" and speed check. Copyright (c) 2026 LFC Foundry. MIT License.
// Runs one fixed set of scenes through makePalette and createEncoder in Node and in each real browser and compares a short fingerprint of every palette and every
// GIF it wrote, then prints how long the palette search and the encoder took in that browser. With OLD=/path/to/an/older/gif-writer.js it also runs that copy
// beside the new one (alternating, so noise hits both) and says whether both wrote the same bytes and how much faster the new one is.
// Run one browser at a time: CHROMIUM=/path/to/chrome node tests/gif-writer-browser.js   (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK, WEBKIT=epiphany for GNOME Web)
// Needs puppeteer-core for Chromium and Firefox; WebKitGTK goes through tests/webkit-shim.js and tools/webkit-driver. Exit 2 (skipped) when nothing can run.
'use strict';
const path = require('path'), fs = require('fs');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const root = path.resolve(__dirname, '..') + '/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }
const SRC = fs.readFileSync(root + 'modules/gif-writer/gif-writer.js', 'utf8');
const OLD = process.env.OLD ? fs.readFileSync(process.env.OLD, 'utf8') : '';

// Runs unchanged in Node and in a page. `src` / `oldSrc` are the module texts; returns fingerprints (`out`) and timings in milliseconds (`ms`, smaller is better).
function battery(src, oldSrc) {
  var load = function (text) { var m = { exports: {} }; new Function('module', text)(m); return m.exports; };
  var G = load(src), O = oldSrc ? load(oldSrc) : null, out = {}, ms = {}, seed = 12345;
  function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  function fp(x) { var h = 2166136261, i; if (typeof x === 'string') { for (i = 0; i < x.length; i++) h = Math.imul(h ^ x.charCodeAt(i), 16777619) >>> 0; } else { for (i = 0; i < x.length; i++) h = Math.imul(h ^ x[i], 16777619) >>> 0; } return h.toString(16) + ':' + x.length; }
  function scene(kind, w, h, n) {
    var pics = [], f, i, a, x, y, r, g, b, q;
    for (f = 0; f < n; f++) {
      a = new Uint8ClampedArray(w * h * 4);
      for (i = 0; i < w * h; i++) {
        x = i % w; y = (i / w) | 0;
        if (kind === 'lattice') { r = ((rnd() * 16) | 0) * 17; g = ((rnd() * 16) | 0) * 17; b = ((rnd() * 16) | 0) * 17; }   // 4096 colors, all equally common: many ties
        else if (kind === 'noise') { r = rnd() * 256; g = rnd() * 256; b = rnd() * 256; }
        else if (kind === 'smooth') { r = x * 255 / w + f * 3 + rnd() * 5; g = y * 255 / h + rnd() * 3; b = ((x ^ y) & 255) * 0.5 + rnd() * 6; }
        else if (kind === 'photo') { r = Math.sin(x / 37 + f / 5) * 127 + 128; g = Math.cos(y / 29 - f / 7) * 127 + 128; b = (((r | 0) + (g | 0)) >> 1) ^ ((rnd() * 8) | 0); }
        else { q = (rnd() * 7) | 0; r = q * 36; g = 255 - q * 31; b = q * 9; }
        a[i * 4] = r; a[i * 4 + 1] = g; a[i * 4 + 2] = b; a[i * 4 + 3] = 255;
      }
      pics.push(a);
    }
    return pics;
  }
  function encode(M, w, h, pal, pics) { var e = M.createEncoder(w, h, pal, {}); pics.forEach(function (p, i) { e.add(p, 40 + i); }); return e.finish(); }
  var cases = [['lattice', 90, 70, 3, 255], ['noise', 120, 90, 2, 255], ['smooth', 160, 120, 4, 255], ['smooth', 160, 120, 2, 40], ['few', 64, 48, 2, 255], ['lattice', 50, 40, 2, 3]], c, k, bytes;
  for (k = 0; k < cases.length; k++) {
    c = cases[k]; var pics = scene(c[0], c[1], c[2], c[3]), pal = G.makePalette(pics, c[4]);
    out['palette ' + k + ' ' + c[0]] = fp(JSON.stringify(pal));
    bytes = encode(G, c[1], c[2], pal, pics); out['gif ' + k + ' ' + c[0]] = fp(bytes);
    if (O) { out['palette ' + k + ' ' + c[0] + ' [old]'] = fp(JSON.stringify(O.makePalette(pics, c[4]))); out['gif ' + k + ' ' + c[0] + ' [old]'] = fp(encode(O, c[1], c[2], pal, pics)); }
  }
  var tp = [], i2; for (i2 = 0; i2 < 60; i2++) tp.push([(i2 * 37) % 256, (i2 % 5) * 50, (i2 * 91) % 256]);   // equal greens and equal distances: the nearest-color tie rule decides
  var tie = scene('lattice', 70, 50, 2); out['gif ties'] = fp(encode(G, 70, 50, tp, tie)); if (O) out['gif ties [old]'] = fp(encode(O, 70, 50, tp, tie));
  /* timings: 30 pictures of 640 x 480, palette search then encoding, new and old taking turns */
  var big = { photo: scene('photo', 640, 480, 30), game: scene('few', 640, 480, 30) }, name, rep, t0, best;
  var timeIt = function (fn) { var t = performance.now(); fn(); return performance.now() - t; };
  for (name in big) {
    var pals = {}; ['new', 'old'].forEach(function (v) { if (v === 'old' && !O) return; var M = v === 'new' ? G : O; best = { p: 1e9, e: 1e9 };
      for (rep = 0; rep < (O ? 3 : 1); rep++) {   // best of 3 when two versions are compared (OLD=...); one run when only the new file is timed (the timings are only for reading)

        t0 = timeIt(function () { pals[v] = M.makePalette(big[name], 255); }); if (t0 < best.p) best.p = t0;
        t0 = timeIt(function () { encode(M, 640, 480, pals[v], big[name]); }); if (t0 < best.e) best.e = t0;
        if (O) { var M2 = v === 'new' ? O : G; M2.makePalette(big[name], 255); }   // the other version runs in between, so neither always goes first
      }
      ms[name + ' palette ' + v] = Math.round(best.p); ms[name + ' encode ' + v] = Math.round(best.e);
    });
    out['big ' + name + ' palette'] = fp(JSON.stringify(pals['new']));
    if (O) out['big ' + name + ' palette [old]'] = fp(JSON.stringify(pals.old));
  }
  return { out: out, ms: ms };
}

const same = (o) => Object.keys(o).filter(k => / \[old\]$/.test(k) && o[k] !== o[k.slice(0, -6)]);
const table = (ms) => { const rows = []; for (const k of Object.keys(ms)) if (/ new$/.test(k)) { const base = k.slice(0, -4), o = ms[base + ' old']; rows.push('    ' + base + ': ' + ms[k] + ' ms' + (o !== undefined ? ' (old ' + o + ' ms, ' + (o / ms[k]).toFixed(2) + 'x faster; higher is better)' : '')); } return rows.join('\n'); };
const ref = battery(SRC, OLD);
let fails = same(ref.out).length;
console.log('Node ' + process.version + ': ' + Object.keys(ref.out).length + ' fingerprints' + (OLD ? '; old and new write the same bytes: ' + (fails === 0) : '') + '\n' + table(ref.ms));

(async () => {
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await wd.launch(exe === 'epiphany' ? 'epiphany' : 'webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' })
      : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    console.log('Browser: ' + await b.version());
    const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e && e.message || e)));
    await p.goto('about:blank');
    const got = await p.evaluate(battery, SRC, OLD);
    const bad = Object.keys(ref.out).filter(k => got.out[k] !== ref.out[k]).concat(same(got.out));
    if (bad.length || errs.length) { fails++; console.log('  FAIL: differs from Node in ' + (bad.join('; ') || 'nothing') + (errs.length ? '; page error: ' + errs[0] : '')); }
    else console.log('  ok   all ' + Object.keys(ref.out).length + ' fingerprints equal Node' + (OLD ? ' and old = new' : '') + '\n' + table(got.ms));
    if (p.close) await p.close();
    await b.close();
  }
  console.log(fails ? fails + ' FAILED' : 'all same-bytes checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
