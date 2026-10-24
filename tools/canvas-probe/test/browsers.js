/* Copyright (c) 2026 LFC Foundry. MIT License. canvas-probe on a real canvas in any test browser (Firefox, ungoogled Chromium, WebKitGTK): runs the same three in-page scripts as browser.py and repeats its checks.
   Run: node tools/canvas-probe/test/browsers.js firefox|chromium|webkit   (the browser's real version prints first). Counts only: no timing. */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const T = require('../../test-runner/runner.js');
const py = fs.readFileSync(path.join(__dirname, 'browser.py'), 'utf8');
const bodies = [...py.matchAll(/pg\.evaluate\("\"\"([\s\S]*?)\"\"\"\)/g)].map((m) => m[1]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cprobe-'));
fs.writeFileSync(path.join(dir, 'page.html'), '<canvas id=c width=200 height=100></canvas><script>window.origFill = CanvasRenderingContext2D.prototype.fillRect;window.origStyle = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "fillStyle").set;</script><script>' + fs.readFileSync(path.join(__dirname, '..', 'src', 'canvas-probe.js'), 'utf8') + '</script>');
T.main(async (b, which) => {
  const p = await b.newPage(), errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(dir, 'page.html'));
  if (bodies.length !== 3) throw new Error('browser.py no longer has the three in-page scripts this file reads');
  const run = async (i) => p.evaluate('(' + bodies[i].trim() + ')()');
  const a = await run(0), c = await run(1), d = await run(2), rep = a.rep; let fails = 0;
  const ck = (n, ok, x) => { console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : ' ' + JSON.stringify(x).slice(0, 300))); if (!ok) fails++; };
  ck('pixels drawn', a.px[0] === 255 && a.px[1] === 0 && a.blue[2] === 255, [a.px, a.blue]);
  ck('fillRect and drawImage counted twice per frame', rep.calls.fillRect.median === 2 && rep.calls.drawImage.median === 2, rep.calls);
  ck('overhang found, below half size counted', rep.drawImage.sourceOverhangBothAxes >= 1 && rep.drawImage.belowHalfSize.max >= 1, rep.drawImage);
  ck('planted leak reported', rep.saveRestore.leakFrames === 1 && rep.saveRestore.openContextsNow === 1 && /leak/.test(a.text), rep.saveRestore);
  ck('uninstall restores', a.restored === true, a.restored);
  ck('reset and resize empty save stack', c.afterReset.openContextsNow === 0 && c.afterReset.leakFrames === 0 && c.afterResize.openContextsNow === 0 && c.afterResize.leakFrames === 0, [c.afterReset, c.afterResize]);
  ck('readback flag and painted area', c.readback.getImageDataWithoutWillReadFrequently === 1 && c.area.median === 1, [c.readback, c.area]);
  ck('deep off gives no numbers, deep on counts', d.offCostly == null && d.costly.withFilter.median === 1 && d.costly.withShadow.median === 1 && d.costly.withBlendMode.median === 1 && /Deep mode is on/.test(d.text), d);
  ck('check() passes within limits and fails over', d.pass.ok && !d.fail.ok && d.restored === true, [d.pass, d.fail]);
  ck('no page errors', errs.length === 0, errs);
  return fails === 0;
});
