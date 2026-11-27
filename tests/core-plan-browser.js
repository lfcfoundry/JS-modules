#!/usr/bin/env node
// core-plan in real browsers. Copyright (c) 2026 LFC Foundry. MIT License.
// Opens modules/core-plan/test/page.html over a local server in each browser: the plan reads the browser's own thread count, lastRun works with
// sessionStorage, and the file loads inside a worker (where there is no sessionStorage). CHROMIUM=/path, FIREFOX=/path (puppeteer-core), WEBKIT=1.
const path = require('path'), fs = require('fs'), http = require('http');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const root = path.resolve(__dirname, '..');
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!f.startsWith(root + path.sep + 'modules' + path.sep + 'core-plan') || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html' : 'text/javascript' }); r.end(fs.readFileSync(f)); });
(async () => {
  await new Promise(o => srv.listen(0, '127.0.0.1', o)); const url = 'http://127.0.0.1:' + srv.address().port + '/modules/core-plan/test/page.html';
  let fails = 0;
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await wd.launch('webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' })
      : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    const p = await b.newPage(); await p.goto(url);
    let res = null; const t0 = Date.now(); while (!res && Date.now() - t0 < 20000) { res = await p.evaluate(() => window.__res || null); if (!res) await new Promise(r => setTimeout(r, 100)); }
    if (!res || !res.ok) { fails++; console.log('  FAIL ' + (await b.version()) + ': ' + (res ? res.out.filter(x => /^FAIL/.test(x)).join('; ') : 'no answer')); }
    else console.log('  ok   ' + (await b.version()) + ': ' + res.out.length + ' checks; ' + res.label);
    await b.close();
  }
  srv.close(); console.log(fails ? fails + ' FAILED' : 'all core-plan browser checks passed'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
