// netflow-plot tiny donut wedges in a real browser raster (2.17.0). Copyright (c) 2026 LFC Foundry. MIT License.
// Each chart's SVG is drawn by the browser into a canvas at 1 device pixel per SVG unit. For every wedge (a run of paths with one fill), the same SVG is
// drawn again with only that wedge painted pure magenta; the pixels that change by more than 60 (sum of R, G, B differences) are that wedge's visible pixels.
// Fails when any positive wedge has 0 visible pixels. LIB=path tests another build (for example the 2.16.1 parent, to show the old failure).
// Run: node tests/netflow-plot-wedges-raster-browser.js <chromium|firefox|webkit> [out.json]
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const scene = fs.readFileSync(path.resolve(__dirname, '../modules/netflow-scene/netflow-scene.js'), 'utf8');
const src = fs.readFileSync(process.env.LIB || path.resolve(__dirname, '../modules/netflow-plot/netflow-plot.js'), 'utf8');
async function pageWork() {
  const P = window.NetflowPlot, out = { bad: [], rows: [] };
  const sets = [];
  const one = (big, n, v) => { const r = [{ cat: 'Big', v: big }]; for (let i = 0; i < n; i++) r.push({ cat: 'tiny ' + i, v: v }); return r; };
  sets.push(['1,000,000 and five 1s, 400 x 300', one(1e6, 5, 1), 400, 300]);
  sets.push(['1,000,000 and five 1s, 200 x 150', one(1e6, 5, 1), 200, 150]);
  sets.push(['10,000,000 and two 1s, 160 x 120', one(1e7, 2, 1), 160, 120]);
  const geo = []; for (let i = 0; i < 12; i++) geo.push({ cat: 'g' + i, v: Math.pow(10, 6 - i / 2) });
  sets.push(['12 wedges, each about 3x smaller, 300 x 220', geo, 300, 220]);
  const dark = one(1e6, 3, 2);
  sets.push(['dark theme, 1,000,000 and three 2s, 300 x 220', dark, 300, 220, 'dark']);
  const raster = (svg, w, h) => new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url); res(x.getImageData(0, 0, w, h).data); };
    img.onerror = () => rej(new Error('svg did not load')); img.src = url;
  });
  for (let [name, rows, w, h, theme] of sets) {
    const svg = P.toSvg(rows, { type: 'donut', x: 'cat', y: 'v', width: w, height: h, theme: theme || 'light' });
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml'), paths = [...doc.querySelectorAll('path[fill]')];
    const runs = []; paths.forEach((p, i) => { const f = p.getAttribute('fill'); if (i && paths[i - 1].getAttribute('fill') === f && runs.length) runs[runs.length - 1].push(p); else runs.push([p]); });
    const wedges = runs.filter((r) => /^rgba?\(|^#/.test(r[0].getAttribute('fill')) && r[0].getAttribute('d') && /Z/.test(r[0].getAttribute('d')));
    w = +doc.documentElement.getAttribute('width'); h = +doc.documentElement.getAttribute('height'); const base = await raster(svg, w, h); const counts = [];
    for (const run of wedges) {
      const keep = run.map((p) => p.getAttribute('fill')); run.forEach((p) => p.setAttribute('fill', '#ff00ff'));
      const v = await raster(new XMLSerializer().serializeToString(doc), w, h); run.forEach((p, k) => p.setAttribute('fill', keep[k]));
      let n = 0; for (let i = 0; i < v.length; i += 4) if (Math.abs(v[i] - base[i]) + Math.abs(v[i + 1] - base[i + 1]) + Math.abs(v[i + 2] - base[i + 2]) > 60) n++;
      counts.push(n);
    }
    const minN = Math.min(...counts), zero = counts.filter((n) => n === 0).length;
    out.rows.push(name + ': ' + wedges.length + ' wedges, fewest visible pixels ' + minN + (zero ? ', ' + zero + ' wedges with none' : ''));
    if (wedges.length < rows.length) out.bad.push(name + ': only ' + wedges.length + ' of ' + rows.length + ' wedges written');
    if (zero) out.bad.push(name + ': ' + zero + ' wedges have no visible pixels');
  }
  return out;
}
T.main(async (b) => {
  const srv = await T.serve({ '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script>' + scene + '</script><script>' + src + '</script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html'); let r; try { r = await p.evaluate('(' + pageWork.toString() + ')()'); } finally { await p.close().catch(() => {}); srv.close(); }
  r.rows.forEach((l) => console.log(l));
  if (r.bad.length) { console.log('FAIL ' + r.bad.join('; ')); return false; }
  console.log('every donut wedge has visible pixels'); return true;
});
