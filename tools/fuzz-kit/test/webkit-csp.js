/* Copyright (c) 2026 LFC Foundry. MIT License. fuzz-kit on a page with a strict policy (no 'unsafe-eval') in WebKitGTK or GNOME Web, through runner/webkit_browser.js.
 *   node test/webkit-csp.js [webkitgtk|epiphany]      Skips with a note when WebKitWebDriver is not installed. Never run it while another browser is running. */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..'), kind = process.argv[2] || 'webkitgtk';
let fails = 0;
const ok = (c, t, x) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + t + (!c && x ? ' ' + JSON.stringify(x).slice(0, 400) : '')); };
(async () => {
  const mod = await import(pathToFileURL(path.join(ROOT, 'runner', 'fuzz_puppeteer.mjs')).href), { launchWebkit } = require(path.join(ROOT, 'runner', 'webkit_browser.js'));
  let b; try { b = await launchWebkit({ browser: kind }); } catch (e) { console.log('note skipped: ' + e.message); process.exit(0); }
  try {
    console.log('browser: ' + await b.version());
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fuzz-csp-')), page = path.join(dir, 'csp.html');
    const html = fs.readFileSync(path.join(ROOT, 'example', 'app.html'), 'utf8').replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:">');
    if (!/Content-Security-Policy/.test(html)) throw new Error('the policy was not added to the page');
    fs.writeFileSync(page, html);
    const adapter = fs.readFileSync(path.join(ROOT, 'example', 'adapter.js'), 'utf8');
    const r = await mod.runSeed(b, pathToFileURL(page).href, adapter, 1, 150, undefined, null, { seedSecs: 60 });
    ok(!r.fails.length && r.ops === 150, 'a page with a strict policy (no unsafe-eval) runs all 150 operations in ' + kind, { fails: r.fails.slice(0, 1), ops: r.ops });
    const bug = await mod.runSeed(b, pathToFileURL(page).href + '#bug', adapter, 1, 400, undefined, null, { seedSecs: 60 });
    ok(bug.fails.length > 0 && /coins went negative/.test(JSON.stringify(bug.fails[0])), 'the planted bug is found on the strict-policy page too', bug.fails.slice(0, 1));
    const hang = adapter.replace("{ name: 'tap', weight: 6, run: function () { app.tap(); } },", "{ name: 'tap', weight: 6, run: function () { app.tap(); } }, { name: 'freeze', weight: 1, run: function () { for (;;); } },");
    const t0 = Date.now(), h = await mod.runSeed(b, pathToFileURL(page).href, hang, 1, 200, undefined, null, { seedSecs: 4, hangTrace: true });
    ok(h.fails.length && h.fails[0].op === 'hung' && Date.now() - t0 < 60000, 'a frozen page is still reported as hung (WebKit cannot name the operation: its console messages only arrive when a call returns)', h.fails.slice(0, 1));
  } catch (e) { ok(false, 'ran: ' + e.message); }
  try { await b.close(); } catch (e) { }
  console.log(fails ? 'fuzz-kit webkit-csp: ' + fails + ' failed' : 'fuzz-kit webkit-csp: all passed'); process.exit(fails ? 1 : 0);
})();
