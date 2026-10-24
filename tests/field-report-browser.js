#!/usr/bin/env node
// field-report 1.0.0 in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Serves a page under a strict policy (script-src 'self', no inline script, no inline style), starts the module first, makes it raise one of every kind of error (uncaught error, rejected promise,
// image that fails to load, a blocked inline script, console.error), runs a canvas animation, then taps the hidden corner five times with the real mouse and checks: the panel opens, both
// buttons save through onSave, the error log lists every kind, the speed report has a verdict and real frame numbers, and the page made no request beyond its own files (no network from the module).
// Run: node tests/field-report-browser.js <chromium|firefox|webkit> [out.json]     Env: CHROMIUM=/path, FIREFOX=/path (puppeteer-core on NODE_PATH); WebKit browsers need xvfb-run as in AGENTS.md.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const which = process.argv[2], outFile = process.argv[3], root = path.resolve(__dirname, '..') + '/';
if (!['chromium', 'firefox', 'webkit'].includes(which)) { console.log('usage: node tests/field-report-browser.js <chromium|firefox|webkit> [out.json]'); process.exit(2); }
const MOD = fs.readFileSync(process.env.MODULE || root + 'modules/field-report/field-report.js', 'utf8');
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'";
const HTML = '<!doctype html><meta charset="utf-8"><title>field-report check</title><body style="margin:0"><canvas id="c" width="300" height="300"></canvas><script src="/field-report.js"></script><script src="/page.js"></script>';
const PAGE = `
var saved = [];
var fr = FieldReport.start({ name: 'check-page', version: '2026.10.22.0000', onSave: function (text, file, kind) { saved.push({ text: text, file: file, kind: kind }); } });
window.__fr = fr; window.__saved = saved;
var cv = document.getElementById('c'), cx = cv.getContext('2d'), n = 0;
(function loop() { n++; cx.fillStyle = 'hsl(' + (n * 3 % 360) + ',70%,50%)'; cx.fillRect(0, 0, 300, 300); requestAnimationFrame(loop); })();
fr.mark('first-screen');
var im = document.createElement('img'); im.src = '/missing.png'; document.body.appendChild(im);
fr.task('busy-work', function () { var t = performance.now(); while (performance.now() - t < 30) {} });
setTimeout(function () { throw new TypeError('planted uncaught'); }, 50);
Promise.reject(new Error('planted rejection'));
console.error('planted console error', 42);
var s = document.createElement('script'); s.textContent = 'window.__inline = 1'; document.head.appendChild(s);
`;
const reqs = [];
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0]; reqs.push(u);
  if (u === '/' || u === '/page.html') { r.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': CSP }); r.end(HTML); }
  else if (u === '/field-report.js') { r.writeHead(200, { 'content-type': 'text/javascript' }); r.end(MOD); }
  else if (u === '/page.js') { r.writeHead(200, { 'content-type': 'text/javascript' }); r.end(PAGE); }
  else { r.writeHead(404); r.end(); }
});
async function open() {
  if (which === 'chromium') { const pp = require('puppeteer-core'); const b = await pp.launch({ executablePath: process.env.CHROMIUM, headless: true, args: ['--no-sandbox'] }); const page = await b.newPage(); await page.setViewport({ width: 400, height: 700 }); return { page, v: await b.version(), close: () => b.close() }; }
  if (which === 'firefox') { const pp = require('puppeteer-core'); const b = await pp.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true }); const page = await b.newPage(); await page.setViewport({ width: 400, height: 700 }); return { page, v: await b.version(), close: () => b.close() }; }
  const S = require('./webkit-shim.js'); const b = await S.launch(which); return { page: await b.newPage(), v: await b.version(), close: () => b.close() };
}
let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 400) : '')); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const B = await open(), P = B.page; console.log(B.v);
  await P.goto('http://127.0.0.1:' + srv.address().port + '/');
  await sleep(1500);
  const w = await P.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  check('page loaded under the strict policy and the module started', await P.evaluate(() => typeof window.FieldReport === 'object' && !!window.__fr), w);
  const open0 = await P.evaluate(() => window.__fr.isOpen());
  for (let i = 0; i < 4; i++) { await P.mouse.click(12, 12); await sleep(40); }
  check('four real taps in the corner do not open the panel', !open0 && !(await P.evaluate(() => window.__fr.isOpen())));
  await P.mouse.click(12, 12); await sleep(150);
  check('the fifth real tap opens the panel', await P.evaluate(() => window.__fr.isOpen() && !!document.querySelector('[data-field-report=speed]')));
  const vis = await P.evaluate(() => { const b = document.querySelector('[data-field-report=speed]').getBoundingClientRect(), c = getComputedStyle(document.querySelector('[data-field-report=panel]')); return { w: b.width, h: b.height, pos: c.position }; });
  check('the panel is drawn although the page policy forbids inline styles (buttons 44 px tall or more)', vis.h >= 44 && vis.w > 100 && vis.pos === 'fixed', vis);
  await P.evaluate(() => { document.querySelector('[data-field-report=speed]').click(); document.querySelector('[data-field-report=errors]').click(); });
  const s = await P.evaluate(() => window.__saved);
  check('both buttons save through onSave with dated .md names', s.length === 2 && /^check-page-speed-\d{8}-\d{4}\.md$/.test(s[0].file) && /^check-page-errors-\d{8}-\d{4}\.md$/.test(s[1].file), s.map(x => x.file));
  const errs = (s[1] || {}).text || '';
  ['planted uncaught', 'planted rejection', 'planted console error 42', '/missing.png'].forEach(k => check('error log lists: ' + k, errs.indexOf(k) >= 0, errs.slice(0, 300)));
  const csp = /page policy block/.test(errs);
  check('error log lists the blocked inline script (page policy block)', csp, errs.slice(0, 500));
  const sp = (s[0] || {}).text || '';
  const m = /Frames recorded \| (\d+) \|/.exec(sp), f = /Average \(FPS, higher is better\) \| ([\d.]+)/.exec(sp);
  check('speed report: frames were recorded and the average FPS is a real number', m && +m[1] > 30 && f && +f[1] > 5, [m && m[1], f && f[1]]);
  check('speed report: verdict, first-screen mark and the 30 ms task are listed', /## Verdict/.test(sp) && /first-screen/.test(sp) && /busy-work \| \d/.test(sp), sp.slice(sp.indexOf('## Verdict'), sp.indexOf('## Verdict') + 1500));
  const lt = await P.evaluate(() => typeof PerformanceObserver === 'function' && PerformanceObserver.supportedEntryTypes && PerformanceObserver.supportedEntryTypes.indexOf('longtask') >= 0);
  console.log('  info long tasks reported by this browser: ' + lt + '; first paint line: ' + ((/First paint \| ([^|]+)\|/.exec(sp) || [])[1] || '').trim());
  console.log('  info average FPS ' + (f && f[1]) + ', verdict: ' + ((/## Verdict\s+([^\n]+)/.exec(sp) || [])[1] || '').slice(0, 200));
  await P.evaluate(() => document.querySelector('[data-field-report=close]').click());
  check('Close removes the panel', !(await P.evaluate(() => window.__fr.isOpen() || !!document.querySelector('[data-field-report=panel]'))));
  const own = reqs.filter(u => !['/', '/page.html', '/field-report.js', '/page.js', '/missing.png', '/favicon.ico'].includes(u));
  check('the module made no request beyond the page files (no network)', own.length === 0, own);
  await P.evaluate(() => window.__fr.stop());
  const ce = await P.evaluate(() => { var c0 = console.error === console.error; return typeof console.error; });
  check('stop() leaves the page working', ce === 'function');
  console.log(`${which} ${B.v}: ${pass} passed, ${fail} failed`);
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ browser: B.v, pass, fail, fps: f && f[1] }));
  await B.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
