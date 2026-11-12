// Copyright (c) 2026 LFC Foundry. MIT License.
// read-path time split (zstd decode vs the rest), one fresh page per set; usage: node rddrive.cjs browser reps set:k1:k2:rangeKey,...
const which = process.argv[2], reps = +process.argv[3], sets = process.argv[4].split(','), KIT = process.env.QA_KIT, fs = require('fs');
(async () => {
  let b, ver; const res = {};
  if (which === 'chromium') { const { chromium } = require('playwright'); b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] }); ver = 'ungoogled Chromium ' + b.version(); }
  else if (which === 'firefox') { b = await require(KIT + '/bidi.js').firefox.launch(); }
  else { const W = require(KIT + '/webkit.js'); b = await W.webkit.launch(); ver = W.version(); }
  for (const s of sets) { const [f, k1, k2, rk, bb] = s.split(':'); const ctx = await b.newContext(), page = await ctx.newPage(); await page.goto('http://127.0.0.1:8765/rd.html'); await page.waitForFunction(() => !!window.LfcPack);
    if (!ver) ver = await page.evaluate(() => navigator.userAgent);
    res[f + (bb ? '@' + bb : '')] = await page.evaluate(([f, r, a, c, d, e, o]) => run(f + '.ndjson', r, a, c, d, e, o), [f, reps, k1, k2, rk, bb ? +bb : 0, process.env.ONLY ? process.env.ONLY.split(',') : null]); await ctx.close(); process.stderr.write('.'); }
  fs.writeFileSync(`rd-${which}${process.env.TAG || ''}.json`, JSON.stringify({ ver, res })); console.log(ver); await b.close(); process.exit(0);
})().catch(e => { console.log('FAIL', e.message.slice(0, 400)); process.exit(1); });
