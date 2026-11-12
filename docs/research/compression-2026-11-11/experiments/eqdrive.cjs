// Copyright (c) 2026 LFC Foundry. MIT License.
// research B19 driver: fresh page per mode per round, alternating order. usage: node eqdrive.cjs browser rounds file,... build mode,... (a mode may be build@mode, to mix builds in one alternating run)
const [which, rounds] = [process.argv[2], +process.argv[3]], F = process.argv[4].split(','), B = process.argv[5], M = process.argv[6].split(','), KIT = process.env.QA_KIT, fs = require('fs');
(async () => { let b, ver;
  if (which === 'chromium') { const { chromium } = require('playwright'); b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] }); ver = 'Chromium ' + b.version(); }
  else if (which === 'firefox') { b = await require(KIT + '/bidi.js').firefox.launch(); ver = 'Firefox 158'; } else { const W = require(KIT + '/webkit.js'); b = await W.webkit.launch(); ver = W.version(); }
  const res = []; for (const f of F) for (let r = 0; r < rounds; r++) for (const m of (r % 2 ? M.slice().reverse() : M)) { const c = await b.newContext(), p = await c.newPage(); await p.goto('http://127.0.0.1:8765/eq.html#' + (m.includes('@') ? m.split('@')[0] + ':' + f + ':' + m.split('@')[1] : B + ':' + f + ':' + m)); await p.waitForFunction(() => !!window.LfcPack); res.push({ f, m: m, t: await p.evaluate(() => run()) }); await c.close(); process.stderr.write('.'); }
  fs.writeFileSync(process.env.OUT || `eq-${which}.json`, JSON.stringify({ ver, res })); console.log(ver); await b.close(); process.exit(0); })().catch(e => { console.log('FAIL', e.message); process.exit(1); });
