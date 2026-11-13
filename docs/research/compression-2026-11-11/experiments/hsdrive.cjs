// Copyright (c) 2026 LFC Foundry. MIT License.
// small first block stack screen: fresh page per variant per round, alternating order. usage: node hsdrive.cjs browser rounds build:file,build:file,...
const [which, rounds] = [process.argv[2], +process.argv[3]], V = process.argv[4].split(','), KIT = process.env.QA_KIT, fs = require('fs');
(async () => { let b, ver;
  if (which === 'chromium') { const { chromium } = require('playwright'); b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] }); ver = 'Chromium ' + b.version(); }
  else if (which === 'firefox') { b = await require(KIT + '/bidi.js').firefox.launch(); ver = 'Firefox 158'; } else { const W = require(KIT + '/webkit.js'); b = await W.webkit.launch(); ver = W.version(); }
  const res = []; for (let r = 0; r < rounds; r++) for (const v of (r % 2 ? V.slice().reverse() : V)) { const c = await b.newContext(), p = await c.newPage(); await p.goto('http://127.0.0.1:8765/hs.html#' + v); await p.waitForFunction(() => !!window.run, null, { timeout: 60000 });
    try { res.push({ r, v, t: await p.evaluate(() => run()) }); } catch (e) { res.push({ r, v, err: e.message.slice(0, 200) }); } await c.close(); process.stderr.write('.'); }
  fs.writeFileSync(process.env.OUT || `hs-${which}.json`, JSON.stringify({ ver, res })); console.log(ver); await b.close(); process.exit(0); })().catch(e => { console.log('FAIL', e.message); process.exit(1); });
