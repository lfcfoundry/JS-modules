#!/usr/bin/env node
// netflow-scene in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Loads netflow-engine and netflow-scene as page scripts (no Node), builds a 1,500 item network and checks: the flat link lists equal a styled build link for link, the look cache
// works out every look once and then none, and eachCurveView reads the links without waking the list. Pass/fail only (no timing).
// Run: node tests/netflow-scene-browser.js <chromium|firefox|webkit> [out.json]     Env: CHROMIUM=/path, FIREFOX=/path  (or through: node tools/test-runner/cli.js all tests/netflow-scene-browser.js)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', rd = (f) => fs.readFileSync(root + f, 'utf8');
const files = { '/engine.js': rd('netflow-engine/netflow-engine.js'), '/scene.js': rd('netflow-scene/netflow-scene.js'), '/fixture.js': 'window.bigNetwork=(function(){var module={};' + rd('netflow-scene/test/fixture.js') + ';return module.exports})();' };
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/engine.js': files['/engine.js'], '/scene.js': files['/scene.js'], '/fixture.js': files['/fixture.js'],
    '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/engine.js"></script><script src="/scene.js"></script><script src="/fixture.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  const r = await p.evaluate(() => {
    const out = []; const ok = (c, m) => { if (!c) throw new Error(m); };
    try {
      const E = NetflowEngine, SC = NetflowScene, L = E.build(bigNetwork(1500, 4, 7), { view: 'network', arrange: 'circle', colorBy: 'group' }), base = { colorBy: 'group', theme: 'light' };
      const flat = SC.make(L, base), objs = SC.make(L, Object.assign({ linkStyle: () => null }, base)), n = flat.curveCount();
      ok(n > 2000 && n === objs.curveCount() && flat.curvesPacked() && !objs.curvesPacked(), 'flat build is packed');
      let seen = 0; flat.eachCurveView(() => { seen++; }); ok(seen === n && flat.curvesPacked(), 'eachCurveView keeps the list packed');
      const snap = (S) => S.curves.map((c) => JSON.stringify([c.P, c.w, c.color, c.arrow, c.line, c.edge, c.from, c.to, c.dash || 0], (k, v) => typeof v === 'number' ? Math.fround(v) : v));
      const fs_ = snap(flat), os_ = snap(objs); for (let i = 0; i < n; i++) ok(fs_[i] === os_[i], 'link ' + i + ' differs');
      let calls = 0; const o = () => ({ colorBy: 'group', theme: 'light', linkStyle: () => { calls++; return null; } }), plan = {};
      SC.make(L, o()); const base0 = calls; calls = 0; SC.make(L, Object.assign(o(), { lookPlan: plan })); const first = calls; calls = 0; SC.make(L, Object.assign(o(), { lookPlan: plan }));
      ok(base0 > 500 && first === base0 && calls === 0, 'look plan: ' + base0 + '/' + first + '/' + calls);
      out.push('flat ' + n + ' links equal; look plan ' + base0 + ' looks then 0');
    } catch (e) { out.push('FAIL ' + e.message); }
    return out;
  });
  srv.close(); console.log(r.join('\n'));
  const pass = r.length === 1 && !/^FAIL/.test(r[0]); if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, pass, r })); return pass;
});
