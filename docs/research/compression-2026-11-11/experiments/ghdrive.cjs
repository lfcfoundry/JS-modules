// Copyright (c) 2026 LFC Foundry. MIT License.
// B17 browser timing: one fresh page per round, gh.html run(reps). usage: node zpdrive.cjs browser rounds reps
const [which, rounds, reps] = [process.argv[2], +process.argv[3], +process.argv[4]], KIT = process.env.QA_KIT, fs = require('fs');
(async () => {
  let b, ver; const res = [];
  if (which === 'chromium') { const { chromium } = require('playwright'); b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] }); ver = 'ungoogled Chromium ' + b.version(); }
  else if (which === 'firefox') { b = await require(KIT + '/bidi.js').firefox.launch(); }
  else { const W = require(KIT + '/webkit.js'); b = await W.webkit.launch(); ver = W.version(); }
  for (let r = 0; r < rounds; r++) { const ctx = await b.newContext(), page = await ctx.newPage(); await page.goto('http://127.0.0.1:8765/gh.html'); await page.waitForFunction(() => !!window.LfcPack);
    if (!ver) ver = await page.evaluate(() => navigator.userAgent);
    res.push(await page.evaluate(n => run(n), reps)); await ctx.close(); process.stderr.write('.'); }
  fs.writeFileSync(`gh-${which}.json`, JSON.stringify({ ver, res })); console.log(ver); await b.close(); process.exit(0);
})().catch(e => { console.log('FAIL', e.message.slice(0, 400)); process.exit(1); });
