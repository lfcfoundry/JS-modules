#!/usr/bin/env node
// Browser checks for test-isolation, slow-note, grown-ups-door, spotlight-tour and speed-lab. Copyright (c) 2026 LFC Foundry. MIT License.
// Opens each piece in a real browser, one browser at a time. Needs puppeteer-core.
// Run: CHROMIUM=/path/to/chrome FIREFOX=/path/to/firefox node tests/pieces-browser.js   (either one or both), or WEBKIT=1 node tests/pieces-browser.js for WebKitGTK
// (WEBKIT=epiphany for GNOME Web) through WebDriver (tests/webdriver-browser.js). Exit code 2 (skipped) when nothing can run.
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const root = require('path').resolve(__dirname, '..') + '/';
const wd = require('./webdriver-browser.js');
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (process.env.WEBKIT) wd.ensureDisplay();
if (!exes.length) { console.log('skipped: needs puppeteer-core and CHROMIUM and/or FIREFOX set to a browser path'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ok = (c, m) => { if (!c) throw new Error(m || 'check failed'); };
const only = process.argv[2] || '';
const checks = [];
const check = (name, fn) => { if (!only || name.indexOf(only) === 0) checks.push([name, fn]); };

/* ---- test-isolation ---- */
check('test-isolation', async (b) => {
  const p = await open(b, 'tools/test-isolation/test/page.html');
  const r = await p.evaluate(() => {
    const res = { installed: window.__r.ok };
    localStorage.setItem('save', 'TEST'); localStorage.setItem('a', '1'); sessionStorage.setItem('s', 'T');
    res.real = window.__real.getItem('save'); res.prefixed = window.__real.getItem('speedtest:save');
    res.len = localStorage.length; res.keys = [localStorage.key(0), localStorage.key(1), localStorage.key(2)].map(String).sort().join(',');   // (browsers do not promise an order)
    localStorage.clear(); res.realAfterClear = window.__real.getItem('save'); res.lenAfter = localStorage.length;
    window.__r.restore(); res.restored = localStorage === window.__real;
    window.__real.removeItem('speedtest:save'); window.__real.removeItem('speedtest:a'); window.__real.removeItem('save'); sessionStorage.clear();
    return res;
  });
  ok(r.installed && r.real === 'REAL' && r.prefixed === 'TEST', JSON.stringify(r));
  ok(r.len === 2 && r.keys === 'a,null,save' && r.realAfterClear === 'REAL' && r.lenAfter === 0 && r.restored, JSON.stringify(r));
  ok(!p.errs.length, p.errs[0]);
  return 'the real save stayed "REAL" while the page wrote "TEST" under the prefix; clear touched only its own keys';
});

/* ---- runner ---- */
async function open(b, rel, w, h) {
  const p = await b.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(String(e && e.message || e)));
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console: ' + m.text()); });
  await p.setViewport({ width: w || 412, height: h || 800 });
  await p.goto('file://' + root + rel);
  return p;
}
module.exports = { check, open, sleep, ok, root };
(async () => {
  try { for (const f of ['slow-note', 'grown-ups-door', 'spotlight-tour', 'speed-lab']) { const q = root + 'tests/pieces/' + f + '.js'; if (require('fs').existsSync(q)) require(q); } } catch (e) { console.log('could not load a check file: ' + e.message); process.exit(1); }
  let allFails = 0;
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await wd.launch(exe === 'epiphany' ? 'epiphany' : 'webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' })
      : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    console.log('Browser: ' + await b.version());
    let fails = 0;
    for (const [name, fn] of checks) {
      try { const r = await fn(b); console.log('  ok   ' + name + (r ? ': ' + r : '')); }
      catch (e) { fails++; console.log('  FAIL ' + name + ': ' + String(e && e.message || e).split('\n')[0]); }
    }
    await b.close(); console.log(fails ? fails + ' FAILED' : 'all browser checks passed'); allFails += fails;
  }
  process.exit(allFails ? 1 : 0);
})();
