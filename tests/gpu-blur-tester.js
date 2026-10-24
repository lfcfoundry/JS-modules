#!/usr/bin/env node
// gpu-blur device-test page check (pass or fail; no speed numbers kept). Copyright (c) 2026 LFC Foundry. MIT License.
// Loads modules/gpu-blur/tester/gpu-blur-device-test.html in a real browser with #quick&auto, waits for the report, and checks: it ran end to end, every way and size is in the
// report, the copy text names the device by class and browser only (no user agent, no device model, no graphics name), the buttons work, the page uses no network, and the
// inlined gpu-blur.js is byte for byte the shipped file. In Chromium it also runs with a user agent that names a phone model and checks the model is not in the text.
// Run: CHROMIUM=/path/to/chrome node tests/gpu-blur-tester.js   (FIREFOX=... [FIREFOX_GL=1 under xvfb-run], WEBKIT=1
'use strict';
const path = require('path'), fs = require('fs'), http = require('http'), cp = require('child_process');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const root = path.resolve(__dirname, '..') + '/', PAGE = path.join(root, 'modules/gpu-blur/tester/gpu-blur-device-test.html');
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
let fails = 0; const ok = (k, c, extra) => { console.log((c ? '  ok   ' : '  FAIL ') + k + (extra ? ' (' + extra + ')' : '')); if (!c) fails++; };
const MODEL = /Pixel|SM-[A-Z]\d|Galaxy|OnePlus|Redmi|Xiaomi|Huawei|Nexus|ThinkPad|MacBook|iPhone|iPad|XPS|Surface|Latitude|Inspiron|Spectre|Zenbook|Build\/|Android \d+;|Windows NT|X11|Linux (x86|aarch)|Intel Mac|Mozilla\/5\.0/i;

// static checks that need no browser
{
  const html = fs.readFileSync(PAGE, 'utf8'), after = html.slice(html.indexOf('/*GPU_BLUR:END*/')), tester = after.slice(after.indexOf('<script>'));
  const b = cp.spawnSync('python3', [path.join(root, 'modules/gpu-blur/tester/build.py'), '--check'], { encoding: 'utf8' });
  ok('the inlined gpu-blur.js is the shipped file, byte for byte', b.status === 0, (b.stdout || '').trim());
  ok('the page has no network call (no fetch, XMLHttpRequest, WebSocket, sendBeacon, link, src or address)', !/fetch\(|XMLHttpRequest|WebSocket|sendBeacon|https?:\/\/|<link|<img|src=/.test(tester.replace(/\/\/[^\n]*/g, '')));
  ok('the page text names no device model', !/Pixel|SM-[A-Z]\d|Galaxy|OnePlus|ThinkPad|MacBook/.test(html.replace(/\/\*GPU_BLUR:BEGIN\*\/[\s\S]*\/\*GPU_BLUR:END\*\//, '')));
  ok('the report text is built without the raw user agent or the graphics name', !/\bT\.push\([^;]*navigator\.userAgent\b/.test(tester) && !/\bT\.push\([^;]*gi\.raw/.test(tester));
}
if (!exes.length) { console.log('browser part skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(fails ? 1 : 2); }

(async () => {
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); r.end(fs.readFileSync(PAGE)); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await wd.launch('webkitgtk') : kind === 'firefox' ? await pp.launch(Object.assign({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 0 }, process.env.FIREFOX_GL ? { headless: false, env: Object.assign({}, process.env, { LIBGL_ALWAYS_SOFTWARE: '1' }), extraPrefsFirefox: { 'webgl.force-enabled': true, 'webgl2.force-enabled': true, 'webgl.enable-webgl2': true } } : {})) : await pp.launch({ executablePath: exe, headless: true, protocolTimeout: 0, args: ['--no-sandbox'] });
    console.log('Browser: ' + await b.version());
    const variants = kind === 'chromium' ? [['plain', null], ['phone user agent', 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro Build/AP2A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36']] : [['plain', null]];
    for (const [vn, ua] of variants) {
      const page = await b.newPage(); if (ua) await page.setUserAgent(ua);
      await page.goto('http://127.0.0.1:' + port + '/#quick&auto');
      const t0 = Date.now(); let res = null;
      while (Date.now() - t0 < 420000) { try { res = await page.evaluate(() => window.__gpuBlurTest || null); } catch (e) { res = null; } if (res && res.done) break; await new Promise(r => setTimeout(r, 1000)); }
      const tag = '[' + vn + '] ';
      if (!res || !res.done) { ok(tag + 'the page finished', false); await page.close(); continue; }
      ok(tag + 'the page ran end to end with no error', !res.error, res.error || Math.round((Date.now() - t0) / 1000) + ' s');
      const T = res.text || '';
      ok(tag + 'the report has the build stamp, device class, browser name and version', /^gpu-blur device test, build \d{4}\.\d\d\.\d\d\.\d{4}/.test(T) && /Device class: (phone|laptop)\./.test(T) && /Browser: (Chrome|Firefox|Safari|GNOME Web|Edge) [\d.]+\./.test(T));
      ok(tag + 'every size and every way is in the report', /480 x 270, radius 12/.test(T) && /1920 x 1080, radius 12/.test(T) && /3840 x 2160/.test(T) && /WebAssembly\s+\d+/.test(T) && /plain JavaScript\s+\d+/.test(T) && /auto \(what the module picks\)\s+\d+/.test(T) && /WebGL 2 \(the card way\)\s+(\d+|no result)/.test(T));
      ok(tag + 'median, 25%-75% and page task are shown, with the direction', /median\s+25%-75%\s+page task med\/max/.test(T) && /lower is better/.test(T));
      ok(tag + 'the probe values and the route auto picks are in the report', /probe on the card way/.test(T) && /Drawn pictures by: (webgl2|wasm|js)/.test(T));
      ok(tag + 'the picture match is in the report and the ways agree (at least 99.5%)', /Same picture/.test(T) && /WebAssembly 100\.0000%/.test(T) && /JavaScript 100\.0000%/.test(T) && !/do NOT all draw/.test(T));
      ok(tag + 'a plain-words verdict is in the report', /Verdict:/.test(T) && /(The module picks|did not run here)/.test(T));
      ok(tag + 'the copy text has no user agent, device model or system name', !MODEL.test(T), (T.match(MODEL) || [''])[0]);
      ok(tag + 'the copy text does not contain the graphics name shown on screen', !res.rawGraphics || !T.includes(res.rawGraphics), res.rawGraphics ? 'screen shows: ' + res.rawGraphics : 'no graphics name');
      if (ua) ok(tag + 'a phone user agent gives class phone and Chrome 155 and no model', /Device class: phone\./.test(T) && /Browser: Chrome 155\./.test(T) && !/Pixel|7 Pro|AP2A/.test(T));
      const ui = await page.evaluate(() => ({ rep: document.getElementById('rep').value, copy: !document.getElementById('copy').disabled, save: !document.getElementById('save').disabled, verdict: !document.getElementById('verdict').hidden, screen: document.getElementById('onscreen').textContent }));
      ok(tag + 'the text box holds the report and Copy, Save and the verdict are on', ui.rep === T && ui.copy && ui.save && ui.verdict);
      await page.close();
    }
    await b.close();
  }
  srv.close(); console.log(fails ? fails + ' check(s) failed' : 'all checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
