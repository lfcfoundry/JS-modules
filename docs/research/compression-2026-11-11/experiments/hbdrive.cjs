// Copyright (c) 2026 LFC Foundry. MIT License.
// small first block screen: fresh page per (file, mode) per round, alternating order. usage: node hbdrive.cjs browser rounds build file,file mode,mode
const [which, rounds, build] = [process.argv[2], +process.argv[3], process.argv[4]], F = process.argv[5].split(','), M = process.argv[6].split(','), KIT = process.env.QA_KIT, fs = require('fs');
(async () => { let b, ver; const extra = process.env.JSFLAGS ? ['--js-flags=' + process.env.JSFLAGS] : [];
  if (which === 'chromium') { const { chromium } = require('playwright'); b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'].concat(extra) }); ver = 'Chromium ' + b.version(); }
  else if (which === 'firefox') { b = await require(KIT + '/bidi.js').firefox.launch(); ver = 'Firefox 158'; } else { const W = require(KIT + '/webkit.js'); b = await W.webkit.launch(); ver = W.version(); }
  const res = []; for (let r = 0; r < rounds; r++) for (const m of M) for (const f of (r % 2 ? F.slice().reverse() : F)) { const c = await b.newContext(), p = await c.newPage(); await p.goto('http://127.0.0.1:8765/hb2.html#' + build + ':' + f + ':' + m + (process.env.H3 ? ':' + process.env.H3 : '')); await p.waitForFunction(() => !!window.run, null, { timeout: 60000 });
    try { res.push({ r, f, m, t: await p.evaluate(() => run()) }); } catch (e) { res.push({ r, f, m, err: e.message.slice(0, 200) }); } await c.close(); process.stderr.write('.'); }
  fs.writeFileSync(process.env.OUT || `hb-${which}.json`, JSON.stringify({ ver, res })); console.log(ver); await b.close(); process.exit(0); })().catch(e => { console.log('FAIL', e.message); process.exit(1); });
