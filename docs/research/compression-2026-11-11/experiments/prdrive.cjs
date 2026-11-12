// Copyright (c) 2026 LFC Foundry. MIT License.
// research B18b stack screen: fresh page per variant per round, alternating order. usage: node prdrive.cjs browser rounds files variant,... (variant = name=build[:optsJSON])
const [which, rounds] = [process.argv[2], +process.argv[3]], F = process.argv[4].split(','), V = process.argv[5].split(',').map(s => { const [n, r] = s.split('='); return { n, r }; }), KIT = process.env.QA_KIT, fs = require('fs');
(async () => { let b, ver;
  if (which === 'chromium') { const { chromium } = require('playwright'); b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] }); ver = 'Chromium ' + b.version(); }
  else if (which === 'firefox') { b = await require(KIT + '/bidi.js').firefox.launch(); ver = 'Firefox 158'; } else { const W = require(KIT + '/webkit.js'); b = await W.webkit.launch(); ver = W.version(); }
  const res = []; for (const f of F) for (let r = 0; r < rounds; r++) for (const v of (r % 2 ? V.slice().reverse() : V)) { const [bd, op] = v.r.split(':'); const c = await b.newContext(), p = await c.newPage(); await p.goto('http://127.0.0.1:8765/pr.html#' + bd + ':' + f + (op ? ':' + op : '')); await p.waitForFunction(() => !!window.LfcPack); res.push({ f, v: v.n, t: await p.evaluate(() => run(3)) }); await c.close(); process.stderr.write('.'); }
  fs.writeFileSync(process.env.OUT || `pr-${which}.json`, JSON.stringify({ ver, res })); console.log(ver); await b.close(); process.exit(0); })().catch(e => { console.log('FAIL', e.message); process.exit(1); });
