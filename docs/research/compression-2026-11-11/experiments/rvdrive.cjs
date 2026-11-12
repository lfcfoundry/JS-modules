// Copyright (c) 2026 LFC Foundry. MIT License.
// rival readers: one fresh page per library per round, alternating order. usage: node rvdrive.cjs browser rounds reps lib,lib,...
const [which, rounds, reps] = [process.argv[2], +process.argv[3], +process.argv[4]], V = process.argv[5].split(','), KIT = process.env.QA_KIT, fs = require('fs');
(async () => {
  let b, ver; const res = [];
  if (which === 'chromium') { const { chromium } = require('playwright'); b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] }); ver = 'ungoogled Chromium ' + b.version(); }
  else if (which === 'firefox') { b = await require(KIT + '/bidi.js').firefox.launch(); }
  else { const W = require(KIT + '/webkit.js'); b = await W.webkit.launch(); ver = W.version(); }
  for (let r = 0; r < rounds; r++) for (const v of (r % 2 ? V.slice().reverse() : V)) { const ctx = await b.newContext(), page = await ctx.newPage(); await page.goto('http://127.0.0.1:8765/rv.html#' + v); await page.waitForFunction(() => !!window.run, null, { timeout: 60000 });
    if (!ver) ver = await page.evaluate(() => navigator.userAgent);
    try { res.push({ r, v, t: await page.evaluate(([v, n]) => run(v, n), [v, reps]) }); } catch (e) { res.push({ r, v, err: e.message.slice(0, 200) }); }
    await ctx.close(); process.stderr.write('.'); }
  fs.writeFileSync(`rv-${which}${process.env.TAG || ''}.json`, JSON.stringify({ ver, res })); console.log(ver); await b.close(); process.exit(0);
})().catch(e => { console.log('FAIL', e.message.slice(0, 400)); process.exit(1); });
