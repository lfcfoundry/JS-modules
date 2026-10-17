'use strict';
// Copyright (c) 2026 LFC Foundry. MIT License.
// Opens demo.html in ONE browser, runs the 30,000 and 100,000 link sizes, and checks that every row says "yes, every value" and the page has no errors.
// Usage: node bench/demo-check.js firefox|chromium|webkit|epiphany   (FIREFOX=, CHROMIUM=, FP_DEPS=, WEBKIT_DRIVER= as in browser-run.js)
var path = require('path'), which = process.argv[2], url = 'file://' + path.join(__dirname, '..', 'demo.html');
var FIREFOX = process.env.FIREFOX || (process.env.HOME + '/browsers/firefox/firefox'), CHROMIUM = process.env.CHROMIUM || (process.env.HOME + '/browsers/ungoogled-chromium-155.0.8059.39-1-x86_64_linux/chrome');
function judge(version, res, errs) {
  var ok = res.every(function (r) { return r.rows === 3 && r.good === 3 && /1,000 links read/.test(r.one); }) && !errs.length;
  console.log('BROWSER ' + version); res.forEach(function (r) { console.log('  ' + r.n + ' links: ' + r.rows + ' rows, ' + r.good + ' exact | ' + r.cells.join(' | ') + ' | ' + r.one.slice(0, 90)); });
  if (errs.length) console.log('  page errors: ' + errs.join(' | ')); console.log(ok ? 'PASS' : 'FAIL'); if (!ok) process.exitCode = 1;
}
var STEP = function (n) { return new Promise(function (resolve) { var b = document.querySelector('button[data-n="' + n + '"]'); var t = document.getElementById('t'); t.hidden = true; b.click(); (function wait() { if (!t.hidden) { var rows = t.tBodies[0].rows; resolve({ n: n, rows: rows.length, good: Array.prototype.filter.call(rows, function (r) { return /yes, every value/.test(r.cells[4].textContent); }).length, cells: Array.prototype.map.call(rows, function (r) { return r.cells[0].textContent.replace(/memory-compression-jso, /, 'jso ').slice(0, 14) + ' ' + r.cells[1].textContent.replace(/ \(.*/, '') + ' ' + r.cells[2].textContent + '/' + r.cells[3].textContent; }), one: document.getElementById('one').textContent }); } else setTimeout(wait, 100); })(); }); };
(async function () {
  var errs = [], res = [], n;
  if (which === 'webkit' || which === 'epiphany') {
    var WD = require(process.env.WEBKIT_DRIVER || path.join(__dirname, '../../../tools/webkit-driver/webkit-driver.js')), b = await WD.launch({ browser: which === 'epiphany' ? 'epiphany' : 'webkitgtk', width: 1100, height: 800, timeout: 600000 }), p = b.page;
    p.on('pageerror', function (e) { errs.push(e.message); }); await p.goto(url);
    await p.waitForFunction(function () { return !document.getElementById('t').hidden; }, null, { timeout: 120000 });
    for (n of [30000, 100000]) res.push(await p.evaluate(STEP, n));
    judge((which === 'epiphany' ? 'GNOME Web ' : 'WebKitGTK ') + b.version, res, errs); await b.close();
  } else {
    var pp = require((process.env.FP_DEPS || '/tmp/fp-deps/node_modules/') + 'puppeteer-core'), br = which === 'firefox'
      ? await pp.launch({ browser: 'firefox', executablePath: FIREFOX, headless: true, protocol: 'webDriverBiDi' })
      : await pp.launch({ executablePath: CHROMIUM, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
    var pg = await br.newPage(); pg.on('pageerror', function (e) { errs.push(String(e && e.message || e)); }); await pg.goto(url);
    await pg.waitForFunction("!document.getElementById('t').hidden", { timeout: 120000 });
    for (n of [30000, 100000]) res.push(await pg.evaluate(STEP, n));
    judge((which === 'firefox' ? 'Firefox ' : 'ungoogled Chromium ') + await br.version(), res, errs); await br.close();
  }
})().catch(function (e) { console.error('FAILED', e && e.stack || e); process.exit(1); });
