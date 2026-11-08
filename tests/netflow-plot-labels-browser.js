#!/usr/bin/env node
// netflow-plot labels in a real browser. Copyright (c) 2026 LFC Foundry. MIT License.
// Draws a fixed set of charts (long bar names, many lines with names at the ends, years before 1800, a single line with its high and low,
// a scatter with a key, sideways top-10 bars, a 20-name dot plot also at 300 x 200, a three-name key at 300 x 220, light and dark, two sizes) and fails when any two flat labels touch: the browser's own text width, and 1.2 times the font size
// as the height. Tilted labels are left out (their boxes are not tilted, so they would give false hits). Also checks that each SVG is the same text as in Node.
// Run one browser at a time: CHROMIUM=/path/to/chrome node tests/netflow-plot-labels-browser.js   (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK)
// Needs puppeteer-core for Chromium and Firefox; WebKitGTK goes through tests/webkit-shim.js and tools/webkit-driver. Exit 2 (skipped) when nothing can run.
'use strict';
const path = require('path');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const root = path.resolve(__dirname, '..') + '/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }

// the charts, built the same way in Node and in the page
function charts(P) {
  var bac = ['Aerobacter aerogenes', 'Klebsiella pneumoniae', 'Pseudomonas aeruginosa', 'Mycobacterium tuberculosis', 'Escherichia coli', 'Salmonella schottmuelleri', 'Proteus vulgaris', 'Brucella abortus', 'Streptococcus fecalis', 'Staphylococcus aureus', 'Staphylococcus albus', 'Bacillus anthracis', 'Diplococcus pneumoniae', 'Streptococcus viridans'];
  var bars = bac.map(function (b, i) { return { Bacteria: b, Penicillin: i < 4 ? 870 - i * 20 : Math.pow(10, 2 - i / 3) }; });
  var lines = []; ['Construction', 'Wholesale and retail trade', 'Manufacturing', 'Leisure and hospitality', 'Business services', 'Other', 'Education and health', 'Government', 'Self-employed', 'Finance', 'Transportation and utilities'].forEach(function (s, k) { for (var y = 2000; y <= 2010; y++) lines.push({ year: y, series: s, count: 1200 + k * 300 + (y === 2009 ? 9000 - k * 600 : (y % 4) * 150) - (y === 2010 ? 2000 : 0) }); });
  var wheat = []; for (var y = 1565; y <= 1820; y += 5) wheat.push({ year: y, wheat: 30 + ((y * 7) % 41) + (y > 1790 ? 40 : 0) });
  var one = []; for (var d = 0; d < 120; d++) one.push({ date: '2012-' + String(1 + (d >> 4)).padStart(2, '0') + '-' + String(1 + (d % 16)).padStart(2, '0'), precipitation: d % 9 ? (d * 37) % 23 : 0 });
  var pts = []; for (var i = 0; i < 200; i++) pts.push({ Total_Receipts: (i * 977) % 34000, Total_Disbursements: (i * 613) % 39000, Incumbent_Challenger_Status: 'COIX'.charAt(i % 4) });
  var dots = []; ['veg', 'hawaiian', 'indian', 'pizza', 'bakeries', 'seafood', 'mideastern', 'bubbletea', 'drinks', 'chinese', 'thai', 'american', 'burgers', 'japanese', 'korean', 'latin', 'coffee', 'breakfast', 'vietnamese', 'tea'].forEach(function (n, k) { dots.push({ type: n, lat: 47.658 + k * 0.00047 }); });
  var states = []; for (var j = 0; j < 50; j++) states.push({ name: 'State number ' + j, total: 1000 + ((j * 7919) % 120) * 1e6 });
  var list = [];
  ['light', 'dark'].forEach(function (th) {
    [[640, 400], [400, 260]].forEach(function (sz) {
      var o = { theme: th, width: sz[0], height: sz[1] };
      list.push(P.auto(bars, o).svg, P.toSvg(lines, Object.assign({ type: 'line', x: 'year', y: 'count', color: 'series' }, o)), P.toSvg(wheat, Object.assign({ type: 'line', x: 'year', y: 'wheat' }, o)),
        P.toSvg(one, Object.assign({ type: 'line', x: 'date', y: 'precipitation' }, o)), P.toSvg(pts, Object.assign({ type: 'scatter', x: 'Total_Receipts', y: 'Total_Disbursements', color: 'Incumbent_Challenger_Status' }, o)), P.auto(states, o).svg,
        P.toSvg(dots, Object.assign({ type: 'dotplot', x: 'type', y: 'lat' }, o)), P.toSvg(dots, Object.assign({ type: 'dotplot', x: 'type', y: 'lat' }, o, { width: 300, height: 200 })),
        P.toSvg(pts.map(function (r, i) { return { a: r.Total_Receipts, b: r.Total_Disbursements, Species: ['Adelie', 'Chinstrap', 'Gentoo'][i % 3] }; }), Object.assign({ type: 'scatter', x: 'a', y: 'b', color: 'Species' }, o, { width: 300, height: 220 })));   /* three names, all in the key (plot 2.15.0) */
    });
  });
  return list;
}
function touching() {   // runs in the page: flat text boxes that overlap by more than half a pixel
  var out = [];
  document.querySelectorAll('svg').forEach(function (s, si) {
    var vb = s.viewBox && s.viewBox.baseVal, k = vb && vb.width ? s.getBoundingClientRect().width / vb.width : 1;
    // the box of the letters: the browser's width, and 1.2 times the font size (one line) as the height around the box's middle (browsers pad text boxes differently: Firefox adds about 4 px)
    var t = Array.prototype.slice.call(s.querySelectorAll('text')).filter(function (e) { return !/rotate/.test(e.getAttribute('transform') || ''); }).map(function (e) { var r = e.getBoundingClientRect(), h = (parseFloat(e.getAttribute('font-size')) || 11) * k * 1.2, m = (r.top + r.bottom) / 2; return { r: { left: r.left, right: r.right, top: m - h / 2, bottom: m + h / 2, width: r.width }, s: e.textContent }; }).filter(function (x) { return x.r.width > 0; });
    for (var a = 0; a < t.length; a++) for (var b = a + 1; b < t.length; b++) { var A = t[a].r, B = t[b].r; if (A.left < B.right - 0.5 && B.left < A.right - 0.5 && A.top < B.bottom - 0.5 && B.top < A.bottom - 0.5) out.push('chart ' + si + ': "' + t[a].s + '" / "' + t[b].s + '"'); }
  });
  return out;
}

(async () => {
  global.NetflowScene = require(root + 'modules/netflow-scene/netflow-scene.js');
  const node = charts(require(root + 'modules/netflow-plot/netflow-plot.js'));
  let fail = 0;
  for (const [name, exe] of exes) {
    const br = name === 'webkit' ? await wd.launch() : await pp.launch(name === 'firefox' ? { browser: 'firefox', executablePath: exe, headless: true } : { executablePath: exe, headless: true, args: ['--no-sandbox'] });
    const p = await br.newPage();
    await p.goto('file://' + root + 'modules/netflow-plot/index.html');
    await p.evaluate((a) => new Promise((res, rej) => { let n = 0; a.forEach((src) => { const s = document.createElement('script'); s.src = src; s.async = false; s.onload = () => { if (++n === a.length) res(); }; s.onerror = rej; document.head.appendChild(s); }); }), ['file://' + root + 'modules/netflow-scene/netflow-scene.js', 'file://' + root + 'modules/netflow-plot/netflow-plot.js']);
    const svgs = await p.evaluate('(' + charts.toString() + ')(window.NetflowPlot)');
    const same = svgs.length === node.length && svgs.every((s, i) => s === node[i]);
    await p.evaluate((list) => { document.body.innerHTML = list.map((s) => '<div>' + s + '</div>').join(''); }, svgs);
    const hits = await p.evaluate('(' + touching.toString() + ')()');
    console.log(name + ': ' + svgs.length + ' charts, same SVG as Node: ' + (same ? 'yes' : 'NO') + ', touching labels: ' + hits.length + (hits.length ? '\n  ' + hits.slice(0, 10).join('\n  ') : ''));
    if (!same || hits.length) fail++;
    await br.close();
  }
  console.log(fail ? 'FAILED' : 'all good');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
