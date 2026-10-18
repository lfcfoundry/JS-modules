#!/usr/bin/env node
// pcodec-js in a real browser. Copyright (c) 2026 LFC Foundry. MIT License.
// Opens modules/pcodec-js/test.html (all 8 number types, round trips, damaged files, the three files) and modules/pcodec-js/demo.html?auto in the browser and reads each page's window.__result.
// One browser at a time: CHROMIUM=/path/to/chrome node tests/pcodec-js-browser.js   (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK, WEBKIT=epiphany for GNOME Web).
// Needs puppeteer-core for Chromium and Firefox; WebKitGTK goes through tests/webkit-shim.js. Exit 2 (skipped) when nothing can run.
'use strict';
const path = require('path');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const dir = path.resolve(__dirname, '..', 'modules', 'pcodec-js') + '/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(b, page) {
  const p = await b.newPage();
  try {
    await p.goto('file://' + dir + page);
    for (let i = 0; i < 1200; i++) { const r = await p.evaluate(() => window.__result === undefined ? null : window.__result); if (r) return r; await sleep(50); }
    return null;
  } finally { if (p.close) await p.close(); }
}

(async () => {
  let bad = 0;
  for (const [kind, exe] of exes) {
    const t0 = Date.now();
    const b = kind === 'webkit' ? await wd.launch(exe === 'epiphany' ? 'epiphany' : 'webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' })
      : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    const version = await b.version(); console.log('Browser: ' + version);
    const t = await open(b, 'test.html'), okT = !!t && t.fail === 0 && t.pass > 400;
    console.log((okT ? '  ok   ' : '  FAIL ') + 'test.html: ' + (t ? t.pass + ' checks passed, ' + t.fail + ' failed' : 'did not finish') + (t && t.fail ? '\n       ' + t.lines.filter(l => /^(FAIL|ERROR)/.test(l)).slice(0, 5).join('\n       ') : ''));
    const d = await open(b, 'demo.html?auto'), okD = !!d && d.ok === true;
    console.log((okD ? '  ok   ' : '  FAIL ') + 'demo.html: ' + (d ? (d.ok ? 'a million numbers back exactly, packed to ' + d.bytes + ' bytes' : 'failed ' + (d.error || '')) : 'did not finish'));
    if (!okT || !okD) bad++;
    console.log('  ' + version + ': ' + (okT && okD ? 'passed' : 'FAILED') + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
    await b.close();
  }
  console.log(bad ? bad + ' FAILED' : 'pcodec-js browser checks passed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
