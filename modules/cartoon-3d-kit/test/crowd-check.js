/* Copyright (c) 2026 LFC Foundry. MIT License
   Opens crowd-demo.html in ONE real browser and checks it works: no page errors; the baked canvas really has pictures on it (not blank) and hero pixels change over time (it animates);
   live mode shows the same number of heroes; the controls switch modes.
     NODE_PATH=<folder with puppeteer-core> CHROMIUM=<path> node modules/cartoon-3d-kit/test/crowd-check.js chromium
     NODE_PATH=... FIREFOX=<path> node modules/cartoon-3d-kit/test/crowd-check.js firefox
     xvfb-run + dbus-run-session ... node modules/cartoon-3d-kit/test/crowd-check.js webkit   (WebKitGTK through tools/webkit-driver; epiphany is still accepted if named) */
'use strict';
var path = require('path'), which = process.argv[2] || 'chromium', url = 'file://' + path.resolve(__dirname, '..', 'crowd-demo.html');
var bad = 0;
function t(name, ok, extra) { if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); }
var PIXELS = function () {
  var cs = document.querySelectorAll('#crowd canvas'); if (cs.length < 2) return null;
  var c = cs[1], d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, n = 0, sum = 0;
  for (var i = 3; i < d.length; i += 4) { if (d[i] > 0) n++; sum += d[i] * ((i >> 2) % 251 + 1); }
  return { opaque: n, total: d.length / 4, fingerprint: sum };
};
(async function () {
  var errs = [], page, close, version;
  if (which === 'webkit' || which === 'epiphany') {
    var WD = require(path.resolve(__dirname, '../../../tools/webkit-driver/webkit-driver.js')), b = await WD.launch({ browser: which === 'epiphany' ? 'epiphany' : 'webkitgtk', width: 900, height: 1000, timeout: 600000 });
    page = b.page; version = (which === 'epiphany' ? 'GNOME Web ' : 'WebKitGTK ') + b.version; close = function () { return b.close(); };
    page.on('pageerror', function (e) { errs.push(e.message); });
  } else {
    var pp = require('puppeteer-core'), br;
    if (which === 'firefox') br = await pp.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true, protocol: 'webDriverBiDi' });
    else br = await pp.launch({ executablePath: process.env.CHROMIUM, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
    if (!(which === 'firefox' ? process.env.FIREFOX : process.env.CHROMIUM)) { console.log('skipped: set FIREFOX or CHROMIUM to the test browser'); process.exit(2); }
    version = (which === 'firefox' ? 'Firefox ' : 'ungoogled Chromium ') + await br.version(); page = await br.newPage(); close = function () { return br.close(); };
    page.on('pageerror', function (e) { errs.push(e.message); });
  }
  console.log('QA browser: ' + version);
  await page.goto(url);
  var wait = function (fn) { return page.waitForFunction(fn, { timeout: 30000 }, null); };
  await wait(function () { return /Baked canvas:/.test(document.getElementById('note').textContent) && document.querySelectorAll('#crowd canvas').length === 2; });
  var a = await page.evaluate(PIXELS);
  t('baked mode draws heroes on the canvas (not blank)', a && a.opaque > a.total * 0.08, a && Math.round(100 * a.opaque / a.total) + '% of the pixels are painted');
  var b2 = null, moved = false;
  for (var i = 0; i < 80 && !moved; i++) { await new Promise(function (r) { setTimeout(r, 100); }); b2 = await page.evaluate(PIXELS); moved = b2.fingerprint !== a.fingerprint; }
  t('baked heroes move (the picture changes within 8 s)', moved);
  await page.evaluate(function () { document.querySelector('button[data-mode="live"]').click(); });
  await wait(function () { return /Live page copies/.test(document.getElementById('note').textContent); });
  var cells = await page.evaluate(function () { return document.querySelectorAll('#crowd .cell').length; });
  t('live mode shows 12 heroes', cells === 12, String(cells));
  await page.evaluate(function () { document.querySelector('button[data-n="48"]').click(); });
  cells = await page.evaluate(function () { return document.querySelectorAll('#crowd .cell').length; });
  t('48 live heroes', cells === 48, String(cells));
  await page.evaluate(function () { document.querySelector('button[data-mode="baked"]').click(); });
  await wait(function () { return /Baked canvas:/.test(document.getElementById('note').textContent) && /48 heroes/.test(document.getElementById('note').textContent) && document.querySelectorAll('#crowd canvas').length === 2; });
  a = await page.evaluate(PIXELS);
  t('48 baked heroes are painted', a && a.opaque > a.total * 0.08);
  await page.goto(url + '?pause#mode=live&n=96&pause=1');
  await wait(function () { return /paused while out of view/.test(document.getElementById('note').textContent); });
  await new Promise(function (r) { setTimeout(r, 600); });
  var ps = await page.evaluate(function () {
    var c = [].slice.call(document.querySelectorAll('#crowd .cell')), inView = c.filter(function (x) { var r = x.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
    return { cells: c.length, off: c.filter(function (x) { return x.classList.contains('off'); }).length, inViewOff: inView.filter(function (x) { return x.classList.contains('off'); }).length, inView: inView.length,
      paused: getComputedStyle(c[c.length - 1].querySelector('.bob')).animationPlayState, playing: getComputedStyle(c[0].querySelector('.bob')).animationPlayState };
  });
  t('pause=1: cells out of view are paused, cells in view keep playing', ps.cells === 96 && ps.off > 0 && ps.inViewOff === 0 && ps.paused === 'paused' && ps.playing === 'running', JSON.stringify(ps));
  t('no page errors', !errs.length, errs.join('; '));
  console.log(bad ? 'FAILED' : 'all passed');
  await close();
  process.exit(bad ? 1 : 0);
})().catch(function (e) { console.error('FAILED', e && e.stack || e); process.exit(1); });
