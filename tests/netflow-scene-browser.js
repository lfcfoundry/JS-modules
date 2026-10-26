#!/usr/bin/env node
// netflow-scene in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Loads netflow-engine and netflow-scene as page scripts (no Node), builds a 1,500 item network and checks: the flat link lists equal a styled build link for link, the look cache
// works out every look once and then none, and eachCurveView reads the links without waking the list. Pass/fail only (no timing).
// Run: node tests/netflow-scene-browser.js <chromium|firefox|webkit> [out.json]     Env: CHROMIUM=/path, FIREFOX=/path  (or through: node tools/test-runner/cli.js all tests/netflow-scene-browser.js)
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const root = path.resolve(__dirname, '..') + '/modules/', rd = (f) => fs.readFileSync(root + f, 'utf8');
const files = { '/engine.js': rd('netflow-engine/netflow-engine.js'), '/scene.js': rd('netflow-scene/netflow-scene.js'), '/look.js': rd('netflow-scene/netflow-scene-look.js'), '/fixture.js': 'window.bigNetwork=(function(){var module={};' + rd('netflow-scene/test/fixture.js') + ';return module.exports})();' };
T.main(async (b, which, outFile) => {
  const srv = await T.serve({ '/engine.js': files['/engine.js'], '/scene.js': files['/scene.js'], '/look.js': files['/look.js'], '/fixture.js': files['/fixture.js'],
    '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script src="/engine.js"></script><script src="/scene.js"></script><script src="/look.js"></script><script src="/fixture.js"></script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html');
  const r = await p.evaluate(() => {
    const out = []; const ok = (c, m) => { if (!c) throw new Error(m); };
    try {
      const E = NetflowEngine, SC = NetflowScene, L = E.build(bigNetwork(1500, 4, 7), { view: 'network', arrange: 'circle', colorBy: 'group' }), base = { colorBy: 'group', theme: 'light' };
      const flat = SC.make(L, base), objs = SC.make(L, Object.assign({ flat: false }, base)), n = flat.curveCount();
      ok(n > 2000 && n === objs.curveCount() && flat.curvesPacked() && !objs.curvesPacked(), 'flat build is packed');
      let seen = 0; flat.eachCurveView(() => { seen++; }); ok(seen === n && flat.curvesPacked(), 'eachCurveView keeps the list packed');
      const snap = (S) => S.curves.map((c) => JSON.stringify([c.P, c.w, c.color, c.arrow, c.line, c.edge, c.from, c.to, c.dash || 0], (k, v) => typeof v === 'number' ? Math.fround(v) : v));
      const fs_ = snap(flat), os_ = snap(objs); for (let i = 0; i < n; i++) ok(fs_[i] === os_[i], 'link ' + i + ' differs');
      let calls = 0; const o = () => ({ colorBy: 'group', theme: 'light', linkStyle: () => { calls++; return null; } }), plan = {};
      SC.make(L, o()); const base0 = calls; calls = 0; SC.make(L, Object.assign(o(), { lookPlan: plan })); const first = calls; calls = 0; SC.make(L, Object.assign(o(), { lookPlan: plan }));
      ok(base0 > 500 && first === base0 && calls === 0, 'look plan: ' + base0 + '/' + first + '/' + calls);
      const rules = (e, ei) => ei % 11 === 0 ? { color: '#d33', w: 3, dash: 'dot' } : ei % 7 === 0 ? { arrow: true } : ei % 5 === 0 ? { bend: 0.2, opacity: 0.4 } : ei % 13 === 0 ? { hide: true } : null;
      const snap2 = (S) => S.curves.map((c) => JSON.stringify([c.P, c.w, c.color, c.arrow, c.line, c.tip, c.edge, c.from, c.to, c.dash || 0, c.a], (k, v) => typeof v === 'number' ? Math.fround(v) : v));
      const fr = SC.make(L, Object.assign({ linkStyle: rules, curve: 0.1 }, base)), orr = SC.make(L, Object.assign({ linkStyle: rules, curve: 0.1, flat: false }, base)); ok(fr.curvesPacked() && !orr.curvesPacked(), 'rules build is packed');
      const a2 = snap2(fr), b2 = snap2(orr); ok(a2.length === b2.length, 'rules count'); for (let i = 0; i < a2.length; i++) ok(a2[i] === b2[i], 'rules link ' + i + ' differs');
      const K = NetflowSceneLook, lk = K.clean({ base: 'dark', slots: { bg: '#102030' }, nodeScale: 1.4 }), nm = K.register(SC, lk, 'light'), SL = SC.make(L, { theme: nm.theme, palette: nm.palette, ramp: nm.ramp });
      ok(/^look:/.test(nm.theme) && SC.THEMES[nm.theme] && SC.THEMES[nm.theme].bg === '#102030' && SL.curveCount() === n, 'look settings register and build'); ok(K.register(SC, lk, 'light').theme === nm.theme, 'the same look gets the same name');
      out.push('flat ' + n + ' links equal; look plan ' + base0 + ' looks then 0; look settings register');
    } catch (e) { out.push('FAIL ' + e.message); }
    return out;
  });
  srv.close(); console.log(r.join('\n'));
  const pass = r.length === 1 && !/^FAIL/.test(r[0]); if (outFile) fs.writeFileSync(outFile, JSON.stringify({ which, pass, r })); return pass;
});
