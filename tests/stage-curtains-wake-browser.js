#!/usr/bin/env node
// stage-curtains with worker: true: time until prepare() resolves, 1.4.0's way (copy the arrived pixels, notice them at the next slice) against no copy, wake on arrival, and both (1.4.1).
// Same pixels: tests/stage-curtains-worker-browser.js. Run: node tests/stage-curtains-wake-browser.js <chromium|firefox|webkit> [out.json]     Env: REPS (default 15)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', REPS = +(process.env.REPS || 15);
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/sc.js': fs.readFileSync(root + 'stage-curtains/stage-curtains.js', 'utf8'), '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><body style="margin:0"><div id=box style="position:relative;width:1920px;height:1080px"></div><script src="/sc.js"></script>' });
  const p = await b.newPage(); await p.setViewport({ width: 1920, height: 1080 }).catch(() => {}); await p.goto(srv.base + '/page.html');
  const MODES = { '1.4.0 way': { copy: true, noWake: true }, 'no copy': { noWake: true }, 'wake on arrival': { copy: true }, 'both (1.4.1)': {} };
  const rows = [];
  for (const [w, h] of [[1920, 1080], [1280, 720]]) {
    const names = Object.keys(MODES), ms = {}; for (const k of names) ms[k] = [];
    for (let r = 0; r < REPS + 1; r++) for (const k of (r % 2 ? names.slice().reverse() : names)) {
      const v = await p.evaluate(async (o, w, h, seed) => {
        const box = document.getElementById('box'); box.style.width = w + 'px'; box.style.height = h + 'px';
        Object.keys(StageCurtains._test).forEach((x) => delete StageCurtains._test[x]); Object.assign(StageCurtains._test, o);
        const c = StageCurtains.create({ container: box, width: w, height: h, worker: true, seed });
        const t0 = performance.now(); await c.prepare(); const dt = performance.now() - t0; if (c.destroy) c.destroy(); return dt;
      }, MODES[k], w, h, 5 + r);
      if (r) ms[k].push(v);
    }
    const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
    for (const k of names) rows.push({ size: w + 'x' + h, mode: k, ms: med(ms[k]).toFixed(1), vs: (med(ms['1.4.0 way']) / med(ms[k])).toFixed(2) });
  }
  srv.close();
  console.log(T.table(rows, [{ key: 'size', title: 'page', align: 'left' }, { key: 'mode', title: 'mode', align: 'left' }, { key: 'ms', title: 'ms until prepare() resolves' }, { key: 'vs', title: 'x sooner than 1.4.0' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, rows }));
  return true;
});
