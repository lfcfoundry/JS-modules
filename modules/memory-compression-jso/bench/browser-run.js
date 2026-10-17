'use strict';
// Copyright (c) 2026 LFC Foundry. MIT License.
// Runs bench/jso-bench.html in ONE browser from the `browsers` branch and prints markdown tables with the real browser version on line 1.
// Usage: node bench/browser-run.js firefox|chromium|webkit [quick|full] [dataset-regex] [contender-regex]
// Needs: /tmp/fp-deps (puppeteer-core), FIREFOX= and CHROMIUM= paths from install.sh, tools/webkit-driver from JS-modules.
var fs = require('fs'), path = require('path'), which = process.argv[2], mode = process.argv[3] || 'quick', dsRe = process.argv[4] || '', cRe = process.argv[5] || '', url = 'file://' + path.join(__dirname, 'jso-bench.html');
var FIREFOX = process.env.FIREFOX || '/home/claude/browsers/firefox/firefox', CHROMIUM = process.env.CHROMIUM || '/home/claude/browsers/ungoogled-chromium-155.0.8059.39-1-x86_64_linux/chrome';
function report(version, res) {
  console.log('BROWSER ' + version + '\nUA ' + res.ua + '\nwasm accelerated: ' + res.accelerated + ', cores: ' + res.cores + ', mode: ' + res.mode);
  var sets = [], by = {}; res.rows.forEach(function (r) { if (!by[r.set]) { by[r.set] = []; sets.push(r.set); } by[r.set].push(r); });
  sets.forEach(function (s) {
    var rs = by[s]; console.log('\n### ' + s + ' (' + rs[0].n + ' items' + ', JSON text ' + (rs[0].json / 1e6).toFixed(2) + ' MB) in ' + version + '\n| contender | size | % of JSON | pack ms | unpack ms | pack+unpack MB/s of JSON | round trip |\n|---|---:|---:|---:|---:|---:|---|');
    rs.forEach(function (r) {
      if (r.fail) console.log('| ' + r.id + ' | | | | | | failed: ' + r.fail + ' |');
      else console.log('| ' + r.id + (r.capped ? ' (first ' + r.n + ' items only)' : '') + ' | ' + (r.size / 1e6).toFixed(3) + ' MB | ' + (r.size / r.json * 100).toFixed(1) + '% | ' + r.enc.toFixed(1) + ' | ' + r.dec.toFixed(1) + ' | ' + (r.json / 1e6 / ((r.enc + r.dec) / 1000)).toFixed(0) + ' | ' + r.exact + ' |');
    });
  });
  if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify({ version: version, res: res }));
}
(async function () {
  var t0 = Date.now();
  if (which === 'webkit') {
    var WD = require(process.env.WEBKIT_DRIVER || path.join(__dirname, '../../../tools/webkit-driver/webkit-driver.js')), b = await WD.launch({ width: 1280, height: 1024, timeout: 3000000, browser: process.env.WEBKIT_KIND || 'webkitgtk' }), p = b.page, errs = [];
    p.on('pageerror', function (e) { errs.push(e.message); }); await p.goto(url);
    await p.waitForFunction(function () { return window.benchReady; }, null, { timeout: 60000 });
    var res = await p.evaluate(function (a) { return window.runBench(a[0], a[1], a[2]); }, [mode, dsRe, cRe]);
    report((process.env.WEBKIT_KIND === 'epiphany' ? 'GNOME Web (Epiphany) ' : 'WebKitGTK ') + b.version, res); if (errs.length) console.log('page errors: ' + errs.join(' | ')); await b.close();
  } else {
    var pp = require((process.env.FP_DEPS || '/tmp/fp-deps/node_modules/') + 'puppeteer-core'), br = which === 'firefox'
      ? await pp.launch({ browser: 'firefox', executablePath: FIREFOX, headless: true, protocol: 'webDriverBiDi', extraPrefsFirefox: { 'privacy.reduceTimerPrecision': false }, protocolTimeout: 3000000 })
      : await pp.launch({ executablePath: CHROMIUM, headless: 'new', args: ['--no-sandbox', '--disable-gpu'], protocolTimeout: 3000000 });
    var ver = await br.version(), pg = await br.newPage(), perrs = []; pg.on('pageerror', function (e) { perrs.push(String(e && e.message || e)); });
    await pg.goto(url); await pg.waitForFunction('window.benchReady', { timeout: 60000 });
    var r2 = await pg.evaluate(function (m, d, c) { return window.runBench(m, d, c); }, mode, dsRe, cRe);
    report((which === 'firefox' ? 'Firefox ' : 'ungoogled Chromium ') + ver, r2); if (perrs.length) console.log('page errors: ' + perrs.join(' | ')); await br.close();
  }
  console.log('wall time ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
})().catch(function (e) { console.error('FAILED', e && e.stack || e); process.exit(1); });
