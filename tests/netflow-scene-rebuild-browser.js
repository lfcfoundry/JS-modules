#!/usr/bin/env node
// netflow-scene rebuild after a move, in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// What Netflow Map does after a drop: the scene of a 30,000 item network is built once, then rebuilt (same lookPlan) several times. An OLD copy and the current copy each run in a FRESH page (cold JIT), taking turns;
// the median rebuild time of each (ms, lower is better) is printed with old/new (above 1 = the new copy is faster). With LINKRULES=1 the map also has link rules, arrowheads and bent links.
// Run: OLD=/path/to/old/netflow-scene.js node tests/netflow-scene-rebuild-browser.js <chromium|firefox|webkit> [out.json]    Env: ITEMS (30000), PAIRS (8), REBUILDS (5), LINKRULES
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', rd = (f) => fs.readFileSync(root + f, 'utf8');
const ITEMS = +(process.env.ITEMS || 30000), PAIRS = +(process.env.PAIRS || 8), RB = +(process.env.REBUILDS || 5), RULES = !!process.env.LINKRULES;
if (!process.env.OLD) { console.log('set OLD=/path/to/the/old/netflow-scene.js'); process.exit(2); }
const files = { old: fs.readFileSync(process.env.OLD, 'utf8'), new: process.env.NEW ? fs.readFileSync(process.env.NEW, 'utf8') : rd('netflow-scene/netflow-scene.js') };
T.main(async (b, which, outFile) => {
  const page = (v) => '<!doctype html><meta charset=utf-8><title>t</title><script src="/engine.js"></script><script src="/' + v + '.js"></script><script src="/fixture.js"></script>';
  const srv = await T.serve({ '/engine.js': rd('netflow-engine/netflow-engine.js'), '/old.js': files.old, '/new.js': files.new, '/fixture.js': 'window.bigNetwork=(function(){var module={};' + rd('netflow-scene/test/fixture.js') + ';return module.exports})();', '/old.html': page('old'), '/new.html': page('new') });
  const once = async (v) => {
    const p = await b.newPage(); await p.goto(srv.base + '/' + v + '.html');
    const r = await p.evaluate((n, rb, rules) => {
      const L = NetflowEngine.build(bigNetwork(n, 4, 7), { view: 'network', arrange: 'circle', colorBy: 'group' });
      const rl = (e, ei) => ei % 11 === 0 ? { color: '#d33', w: 3, dash: 'dot' } : ei % 7 === 0 ? { arrow: true } : ei % 5 === 0 ? { bend: 0.2 } : null;
      const plan = {}, o = () => Object.assign({ colorBy: 'group', theme: 'light', lookPlan: plan }, rules ? { linkStyle: rl } : {});
      NetflowScene.make(L, o()); const ms = [];
      for (let i = 0; i < rb; i++) { const t0 = performance.now(); NetflowScene.make(L, o()); ms.push(performance.now() - t0); }
      ms.sort((a, c) => a - c); return ms[ms.length >> 1];
    }, ITEMS, RB, RULES);
    if (which !== 'webkit') await p.close(); return r;
  };
  const a = [], c = [];
  for (let i = 0; i < PAIRS; i++) for (const v of (i % 2 ? ['new', 'old'] : ['old', 'new'])) (v === 'old' ? a : c).push(await once(v));
  srv.close(); const m = T.median(a), n = T.median(c), ratio = m / n;
  console.log(ITEMS + ' items' + (RULES ? ' with link rules' : '') + ': old ' + m.toFixed(0) + ' ms, new ' + n.toFixed(0) + ' ms, old/new ' + ratio.toFixed(2) + ' (median of ' + PAIRS + ' fresh pages each, lower ms is better)');
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, old: a, new: c, ratio }));
  return ratio >= 0.95;
});
