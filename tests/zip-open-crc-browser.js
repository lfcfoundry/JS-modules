#!/usr/bin/env node
// zip-open crc32 "same checksums" and speed check. Copyright (c) 2026 LFC Foundry. MIT License.
// Runs the same checksum jobs in Node and in each real browser: zip-open's crc32 against a plain byte-by-byte CRC-32 (the loop version 1.0.0 used) for every
// length and start position in a grid and for a large buffer, then times both on 20 MB (milliseconds per MB, smaller is better).
// Run one browser at a time: CHROMIUM=/path/to/chrome node tests/zip-open-crc-browser.js   (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK, WEBKIT=epiphany for GNOME Web)
// Needs puppeteer-core for Chromium and Firefox; WebKitGTK goes through tests/webkit-shim.js and tools/webkit-driver. Exit 2 (skipped) when nothing can run.
'use strict';
const path = require('path'), fs = require('fs');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const root = path.resolve(__dirname, '..') + '/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }
const SRC = fs.readFileSync(root + 'modules/zip-open/zip-open.js', 'utf8');

// Runs unchanged in Node and in a page. Returns { bad, tried, ms: { old, new } }.
function battery(src) {
  var m = { exports: {} }; new Function('module', src)(m); var crc = m.exports.crc32, T = new Int32Array(256), i, k, c;
  for (i = 0; i < 256; i++) { c = i; for (k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; T[i] = c; }
  var plain = function (u8) { var r = -1; for (var q = 0, L = u8.length; q < L; q++) r = (r >>> 8) ^ T[(r ^ u8[q]) & 255]; return (r ^ -1) >>> 0; };
  var sd = 7, rnd = function () { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd >>> 24; };
  var buf = new Uint8Array(400), bad = 0, tried = 0, off, len, v; for (i = 0; i < buf.length; i++) buf[i] = rnd();
  for (off = 0; off < 9; off++) for (len = 0; len < 90; len++) { v = buf.subarray(off, off + len); tried++; if (crc(v) !== plain(v)) bad++; }
  var mb = new Uint8Array(1 << 20); for (i = 0; i < mb.length; i++) mb[i] = rnd() ^ (i >> 7);
  tried++; if (crc(mb) !== plain(mb)) bad++; tried++; if (crc(mb.subarray(5)) !== plain(mb.subarray(5))) bad++;
  tried++; if (crc(new Uint8Array(0)) !== 0 || crc(new Uint8Array([49, 50, 51, 52, 53, 54, 55, 56, 57])) !== 0xcbf43926) bad++;
  var big = new Uint8Array(20 << 20); for (i = 0; i < big.length; i += 4) { big[i] = rnd(); big[i + 1] = i >> 9; big[i + 2] = rnd(); big[i + 3] = 1; }
  var best = { old: 1e9, new: 1e9 }, rep, t, ref = plain(big);
  for (rep = 0; rep < 3; rep++) {
    t = performance.now(); if (plain(big) !== ref) bad++; best.old = Math.min(best.old, performance.now() - t);
    t = performance.now(); if (crc(big) !== ref) bad++; best.new = Math.min(best.new, performance.now() - t);
  }
  return { bad: bad, tried: tried + 1, ms: { old: +(best.old / 20).toFixed(2), new: +(best.new / 20).toFixed(2) } };
}
const line = (r) => r.tried + ' checksums, ' + r.bad + ' different; per MB (smaller is better): old ' + r.ms.old + ' ms, new ' + r.ms.new + ' ms = ' + (r.ms.old / r.ms.new).toFixed(2) + 'x faster (higher is better)';
const ref = battery(SRC);
console.log('Node ' + process.version + ': ' + line(ref));
(async () => {
  let fails = ref.bad ? 1 : 0;
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await wd.launch(exe === 'epiphany' ? 'epiphany' : 'webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' })
      : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    console.log('Browser: ' + await b.version());
    const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e && e.message || e)));
    await p.goto('about:blank');
    const got = await p.evaluate(battery, SRC);
    if (got.bad || errs.length) { fails++; console.log('  FAIL: ' + line(got) + (errs.length ? '; page error: ' + errs[0] : '')); }
    else console.log('  ok   ' + line(got));
    if (p.close) await p.close();
    await b.close();
  }
  console.log(fails ? fails + ' FAILED' : 'all checksum checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
