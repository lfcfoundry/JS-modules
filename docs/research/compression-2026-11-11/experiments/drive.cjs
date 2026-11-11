// Copyright (c) 2026 LFC Foundry. MIT License.
// one fresh browser page per data set; usage: node drive.cjs chromium|firefox|webkit reps set-n,...
const which = process.argv[2], reps = +process.argv[3], files = process.argv[4].split(','), KIT = process.env.QA_KIT;
const fs = require('fs'); const url = 'http://127.0.0.1:8765/index.html';
(async () => {
  let b, ver, res = {};
  if (which === 'chromium') { const { chromium } = require('playwright'); b = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] }); ver = 'ungoogled Chromium ' + b.version(); }
  else if (which === 'firefox') { b = await require(KIT + '/bidi.js').firefox.launch(); ver = 'Firefox'; }
  else { const W = require(KIT + '/webkit.js'); b = await W.webkit.launch(); ver = W.version(); }
  for (const f of files) {
    const ctx = await b.newContext(), page = await ctx.newPage(); await page.goto(url);
    if (which === 'firefox' && ver === 'Firefox') ver = await page.evaluate(() => navigator.userAgent);
    res[f] = await page.evaluate(([f, r]) => run(f + '.ndjson', r), [f, reps]);
    await ctx.close(); process.stderr.write(f + ' ');
  }
  fs.writeFileSync(`t-${which}.json`, JSON.stringify({ ver, res })); console.log('\n' + ver); await b.close(); process.exit(0);
})().catch(e => { console.log('FAIL', e.message.slice(0, 400)); process.exit(1); });
