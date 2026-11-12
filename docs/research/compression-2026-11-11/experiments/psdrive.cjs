// Copyright (c) 2026 LFC Foundry. MIT License.
const [which] = [process.argv[2]], KIT = process.env.QA_KIT;
(async () => { let b, ver;
  if (which === 'chromium') { const { chromium } = require('playwright'); b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] }); ver = 'Chromium ' + b.version(); }
  else if (which === 'firefox') { b = await require(KIT + '/bidi.js').firefox.launch(); ver = 'Firefox'; } else { const W = require(KIT + '/webkit.js'); b = await W.webkit.launch(); ver = W.version(); }
  const out = []; for (let r = 0; r < 6; r++) { const c = await b.newContext(), p = await c.newPage(); await p.goto('http://127.0.0.1:8765/ps.html#' + (r % 2 ? 'b18' : 'r83')); await p.waitForFunction(() => !!window.LfcPack); out.push([r % 2 ? 'b18' : 'r83', await p.evaluate(() => run(3))]); await c.close(); }
  console.log(ver, JSON.stringify(out)); await b.close(); process.exit(0); })().catch(e => { console.log('FAIL', e.message); process.exit(1); });
