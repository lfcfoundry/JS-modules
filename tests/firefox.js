#!/usr/bin/env node
// Firefox checks for JS-modules. Copyright (c) 2026 LFC Foundry. MIT License.
// Playwright cannot drive a stock Firefox, so this uses puppeteer-core over WebDriver BiDi (works with the Firefox you download from mozilla.org).
// Run: npm i puppeteer-core && FIREFOX=/path/to/firefox node tests/firefox.js       (FIREFOX optional if "firefox" is on the PATH)
// What it does: opens every demo page and the storage-probe page, reports page errors, then a few quick behavior checks that Firefox is the
// stress test for (reduced timer precision, canvas read-back, the curtains and the press-and-hold helper). Plain words at the end.
const path = require('path'), root = path.resolve(__dirname, '..'), fs = require('fs');
let pass = 0, fail = 0; const notes = [];
async function t(name, fn) { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e && e.message || e).split('\n')[0]); } }
const ok = (c, m) => { if (!c) throw new Error(m || 'check failed'); };
(async () => {
  let pp; try { pp = require('puppeteer-core'); } catch (e) { console.error('puppeteer-core is not installed. Run:  npm install puppeteer-core'); process.exit(2); }
  const exe = process.env.FIREFOX || 'firefox';
  let browser; try { browser = await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' }); }
  catch (e) { console.error('Could not start Firefox (' + exe + '): ' + e.message + '\nSet FIREFOX=/path/to/firefox'); process.exit(2); }
  console.log('Firefox ' + (await browser.version()));
  const mods = JSON.parse(fs.readFileSync(path.join(root, 'modules.json'), 'utf8'));
  const pages = mods.modules.filter(m => m.demo).map(m => [m.id, m.demo]).concat([['storage-probe', 'tools/storage-probe/storage-probe.html']]);
  const open = async (rel) => { const p = await browser.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e && e.message || e))); await p.setViewport({ width: 412, height: 800 }); await p.goto('file://' + path.join(root, rel), { waitUntil: 'load' }); return p; };
  await t('every demo page loads without errors', async () => {
    const bad = [];
    for (const [id, rel] of pages) { const p = await open(rel); await new Promise(r => setTimeout(r, 400)); if (p.errs.length) bad.push(id + ': ' + p.errs[0]); await p.close(); }
    ok(!bad.length, bad.join(' | '));
  });
  await t('env-probes: canvas read-back and storage work; reports the timer', async () => {
    const p = await open('modules/env-probes/demo.html'); const r = await p.evaluate(() => EnvProbes.report());
    notes.push('Firefox timer rounding reported by env-probes: ' + r.timerRounded + (r.timerStepMs ? ' (step ' + r.timerStepMs + ' ms)' : ''));
    ok(r.canvasReadbackOk === true, 'canvas read-back'); ok(r.storageWorks === true, 'storage'); await p.close();
  });
  await t('stage-curtains: close puts both halves in place, open removes the curtain', async () => {
    const p = await open('modules/stage-curtains/demo.html');
    const r = await p.evaluate(async () => { const c = StageCurtains.create({ container: document.body, color: '#b3202a' }); await c.prepare({ hurry: true }); await c.close();
      const halves = [...c.element.children].slice(0, 2).map(e => e.style.transform); const inDom = document.body.contains(c.element); await c.open(); return { halves, inDom, after: document.body.contains(c.element) }; });
    ok(r.halves.join() === 'translateX(0px),translateX(0px)' && r.inDom && !r.after, JSON.stringify(r)); await p.close();
  });
  await t('hold-press: tap is one click, hold repeats, release adds no click', async () => {
    const p = await open('modules/hold-press/demo.html'); const bb = await p.evaluate(() => { const r = document.getElementById('b').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await p.mouse.click(bb[0], bb[1]); await new Promise(r => setTimeout(r, 100)); let v = await p.evaluate(() => [t, h]); ok(v[0] === 1 && v[1] === 0, 'tap ' + v);
    await p.mouse.move(bb[0], bb[1]); await p.mouse.down(); await new Promise(r => setTimeout(r, 1500)); await p.mouse.up(); await new Promise(r => setTimeout(r, 150));
    v = await p.evaluate(() => [t, h]); ok(v[0] === 1 && v[1] >= 4 && v[1] <= 8, 'hold ' + v); await p.close();
  });
  await t('sprite-baker: alphaMask and toSheet work in Firefox', async () => {
    const p = await open('modules/sprite-baker/demo.html');
    const r = await p.evaluate(() => { const a = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]) }; const m = SpriteBaker.alphaMask(a); const s = SpriteBaker.toSheet([a, a]); return { m: m && [m.width, m.height, m.data[3], m.data[7]], f: s && s.frames.length }; });
    ok(r.m && r.m[2] === 255 && r.m[3] === 0 && r.f === 2, JSON.stringify(r)); await p.close();
  });
  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); notes.forEach(n => console.log('note: ' + n));
  console.log(fail ? 'VERDICT: something failed in Firefox. See the FAIL lines above.' : 'VERDICT: all Firefox checks passed.'); process.exit(fail ? 1 : 0);
})();
