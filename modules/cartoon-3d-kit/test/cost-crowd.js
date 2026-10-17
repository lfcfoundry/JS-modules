/* Copyright (c) 2026 LFC Foundry. MIT License
   How much work the browser does per second to show a crowd, live page copies against the baked canvas of crowd-demo.html (guide, section 3.11).
   Not part of the quick checks (about 1 minute per crowd size). Needs playwright-core and the test browser:
     CHROMIUM=<ungoogled chromium path> NODE_PATH=<folder with playwright-core> node modules/cartoon-3d-kit/test/cost-crowd.js [N=12] [REPEATS=3]
   Method: Chromium's tracing records every main-thread task for 5 seconds after a 1.2 s settle; the number is milliseconds of task time per second (lower is better); the median of the repeats is printed with the lowest and highest. */
'use strict';
var pw = require('playwright-core'), path = require('path');
var URL = 'file://' + path.resolve(__dirname, '..', 'crowd-demo.html');
var N = +process.argv[2] || 12, REPEATS = +process.argv[3] || 3, SECS = 5;
var MODES = [['live page copies', 'mode=live'], ['baked canvas 60/s', 'mode=baked&fps=60'], ['baked canvas 30/s', 'mode=baked&fps=30']];
if (!process.env.CHROMIUM) { console.log('skipped: set CHROMIUM to the test browser'); process.exit(2); }
(async function () {
  var b = await pw.chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
  console.log('QA browser: Chromium ' + b.version() + '  N=' + N + ' heroes, ' + REPEATS + ' repeats of ' + SECS + ' s');
  var rows = [];
  for (var rep = 0; rep < REPEATS; rep++) for (var m of MODES) {
    var ctx = await b.newContext({ viewport: { width: 412, height: 892 } }), p = await ctx.newPage();
    await p.goto(URL + '#' + m[1] + '&n=' + N);
    await p.waitForFunction(function () { return document.querySelector('#crowd canvas,#crowd .live') && /Baked|Live/.test(document.getElementById('note').textContent); }, null, { polling: 25 });
    await new Promise(function (r) { setTimeout(r, 1200); });
    var cdp = await ctx.newCDPSession(p), ev = [];
    cdp.on('Tracing.dataCollected', function (d) { ev.push.apply(ev, d.value); });
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,cc,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
    await new Promise(function (r) { setTimeout(r, SECS * 1000); });
    var done = new Promise(function (r) { cdp.once('Tracing.tracingComplete', r); });
    await cdp.send('Tracing.end'); await done;
    var ms = 0; ev.forEach(function (e) { if (e.ph === 'X' && e.dur && e.name === 'RunTask') ms += e.dur / 1000; });
    rows.push([m[0], ms / SECS]); await ctx.close();
  }
  var med = function (a) { a = a.slice().sort(function (x, y) { return x - y; }); return a[a.length >> 1]; };
  console.log('variant'.padEnd(22) + 'ms of work per second: median (lowest-highest)');
  var base;
  MODES.forEach(function (m) {
    var t = rows.filter(function (r) { return r[0] === m[0]; }).map(function (r) { return r[1]; }), md = med(t);
    if (!base) base = md;
    console.log(m[0].padEnd(22) + md.toFixed(0) + ' (' + Math.min.apply(null, t).toFixed(0) + '-' + Math.max.apply(null, t).toFixed(0) + ')' + (md === base ? '' : '  ' + ((md / base - 1) * 100).toFixed(0) + '% vs live'));
  });
  await b.close();
})().catch(function (e) { console.error('FAILED', e && e.stack || e); process.exit(1); });
