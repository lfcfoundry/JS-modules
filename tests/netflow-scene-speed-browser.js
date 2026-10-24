#!/usr/bin/env node
// netflow-scene speed in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Builds the scene of a 30,000 item network three ways (link rules + arrowheads, bent links, plain as the control) with an OLD copy of netflow-scene and the current one, taking turns, and prints the median make() time of each (ms, lower is better).
// Run: OLD=/path/to/old/netflow-scene.js node tests/netflow-scene-speed-browser.js <chromium|firefox|webkit> [out.json]     (or through tools/test-runner/cli.js all)     Env: ITEMS (default 30000), REPS (default 7)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', rd = (f) => fs.readFileSync(root + f, 'utf8');
const ITEMS = +(process.env.ITEMS || 30000), REPS = +(process.env.REPS || 7);
if (!process.env.OLD) { console.log('set OLD=/path/to/the/old/netflow-scene.js'); process.exit(2); }
const old = fs.readFileSync(process.env.OLD, 'utf8').replace('root.NetflowScene = factory()', 'root.NetflowSceneOld = factory()');
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/engine.js': rd('netflow-engine/netflow-engine.js'), '/old.js': old, '/new.js': rd('netflow-scene/netflow-scene.js'),
    '/fixture.js': 'window.bigNetwork=(function(){var module={};' + rd('netflow-scene/test/fixture.js') + ';return module.exports})();',
    '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/engine.js"></script><script src="/old.js"></script><script src="/new.js"></script><script src="/fixture.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  await p.evaluate((n) => {
    window.SCL = NetflowEngine.build(bigNetwork(n, 6, 7), { view: 'network', arrange: 'circle', colorBy: 'group' });
    const rules = (e, ei) => ei % 11 === 0 ? { color: '#d33', w: 3, dash: 'dot' } : ei % 7 === 0 ? { arrow: true } : ei % 5 === 0 ? { bend: 0.2, opacity: 0.4 } : ei % 13 === 0 ? { hide: true } : null;
    window.CASES = { 'rules+arrows': { linkStyle: rules }, 'bent': { curve: 0.25 }, 'plain (control)': {} };
    window.run = (which, c) => { const S = which === 'old' ? NetflowSceneOld : NetflowScene, o = Object.assign({ colorBy: 'group', theme: 'light' }, CASES[c]); const t0 = performance.now(); const sc = S.make(SCL, o); const ms = performance.now() - t0; window.last = sc.curveCount(); return ms; };
  }, ITEMS);
  const rows = [];
  for (const c of ['rules+arrows', 'bent', 'plain (control)']) {
    const ms = await T.rotate(['old', 'new'], REPS, (n) => p.evaluate((w, cc) => run(w, cc), n, c));
    const links = await p.evaluate(() => last); rows.push({ name: c, links, before: Math.round(ms.old), after: Math.round(ms.new) });
  }
  srv.close();
  const g = T.speedGuard(rows);
  console.log(T.table(g.map((r) => Object.assign({}, r, { ratio: r.ratio.toFixed(2) })), [{ key: 'name', title: ITEMS + ' items', align: 'left' }, { key: 'links', title: 'links' }, { key: 'before', title: 'old ms' }, { key: 'after', title: 'new ms' }, { key: 'ratio', title: 'times faster' }, { key: 'verdict', title: 'verdict', align: 'left' }]));
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, rows: g }));
  return !g.some((r) => r.slower);
});
