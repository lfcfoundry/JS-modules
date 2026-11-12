// Copyright (c) 2026 LFC Foundry. MIT License.
// paired fresh-page A/B of range reads; usage: node rdabdrive.cjs browser rounds reps variants set:rangeKey:otherKey,...
const [which, rounds, reps] = [process.argv[2], +process.argv[3], +process.argv[4]], V = process.argv[5].split(','), F = process.argv[6].split(','), KIT = process.env.QA_KIT, fs = require('fs');
(async () => {
  let b, ver; const res = [];
  if (which === 'chromium') { const { chromium } = require('playwright'); b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] }); ver = 'ungoogled Chromium ' + b.version(); }
  else if (which === 'firefox') { b = await require(KIT + '/bidi.js').firefox.launch(); }
  else { const W = require(KIT + '/webkit.js'); b = await W.webkit.launch(); ver = W.version(); }
  for (let r = 0; r < rounds; r++) for (const s of F) { const [f, rk, k2] = s.split(':');
    const order = r % 2 ? V.slice().reverse() : V;
    for (const v of order) { const ctx = await b.newContext(), page = await ctx.newPage(); await page.goto('http://127.0.0.1:8765/rdab.html#' + v); await page.waitForFunction(() => !!window.LfcPack);
      if (!ver) ver = await page.evaluate(() => navigator.userAgent);
      res.push({ r, f, v, t: await page.evaluate(([f, n, a, c, o]) => run(f + '.ndjson', n, a, c, o), [f, reps, rk, k2, process.env.ONLY ? process.env.ONLY.split(',') : null]) }); await ctx.close(); }
    process.stderr.write('.'); }
  fs.writeFileSync(`rdab-${which}${process.env.TAG || ''}.json`, JSON.stringify({ ver, res })); console.log(ver); await b.close(); process.exit(0);
})().catch(e => { console.log('FAIL', e.message.slice(0, 400)); process.exit(1); });
