#!/usr/bin/env node
// JS-modules tests. Copyright (c) 2026 LFC Foundry, MIT License.
// Run: npm i playwright-core && CHROMIUM=/path/to/chrome node tests/run.js      (CHROMIUM optional if Playwright finds a browser)
const assert = require('assert'), path = require('path');
const root = path.resolve(__dirname, '..'), M = (m, f) => path.join(root, 'modules', m, f);
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n       ')); } }

(async () => {
  console.log('idle-core (node)');
  const I = require(M('idle-core', 'idle-core.js'));
  await t('upgradeCost grows and rounds up', () => { assert.strictEqual(I.upgradeCost(15, 15, 0), 15); assert.strictEqual(I.upgradeCost(15, 15, 1), 18); assert.strictEqual(I.upgradeCost(100, 10, 2, 0.5), 61); });
  await t('milestones double at 10/25/50', () => { assert.strictEqual(I.milestoneMult(9), 1); assert.strictEqual(I.milestoneMult(10), 2); assert.strictEqual(I.milestoneMult(25), 4); assert.strictEqual(I.milestoneMult(50), 8); assert.strictEqual(I.milestoneLeft(7), 3); assert.strictEqual(I.milestoneLeft(60), 0); });
  await t('tickEarnings: long gaps count as away time, capped', () => {
    assert.strictEqual(I.tickEarnings(0.1), 0.1); assert.strictEqual(I.tickEarnings(5), 5);
    assert.strictEqual(I.tickEarnings(105, { percent: 50 }), 5 + 50);
    assert.strictEqual(I.tickEarnings(100 * 3600, { percent: 50 }), 5 + 8 * 3600 * 0.5);
    assert.strictEqual(I.tickEarnings(-3), 0); assert.strictEqual(I.tickEarnings(NaN), 0);
  });
  await t('awayEarnings caps at 8 hours', () => { assert.strictEqual(I.awayEarnings(10, 3600, { percent: 50 }), 18000); assert.strictEqual(I.awayEarnings(10, 99 * 3600), 10 * 8 * 3600 * 0.5); assert.strictEqual(I.awayEarnings(0, 100), 0); });
  await t('RateBook memoizes until invalidated', () => { let n = 0; const b = I.RateBook(() => ({ v: ++n })); b.get(); b.get(); assert.strictEqual(n, 1); b.invalidate(); assert.strictEqual(b.get().v, 2); });
  await t('BoostQueue: one runs, others wait, then take over', () => {
    const q = I.BoostQueue({ a: { secs: 20, max: 60 }, b: { secs: 20, max: 60 } });
    assert.strictEqual(q.give('a'), 'start'); assert.strictEqual(q.give('a'), 'more'); assert.strictEqual(q.give('b'), 'next');
    assert.strictEqual(q.state.time.a, 40); assert.strictEqual(q.active, 'a');
    let r = q.tick(40); assert.strictEqual(r.ended, 'a'); assert.strictEqual(r.started, 'b'); assert.strictEqual(q.active, 'b');
    r = q.tick(20); assert.strictEqual(r.ended, 'b'); assert.strictEqual(q.active, '');
    for (let i = 0; i < 10; i++) q.give('a'); assert.strictEqual(q.state.time.a, 60);
  });
  await t('stageIndex / stageProgress', () => { const th = [0, 100, 1000]; assert.strictEqual(I.stageIndex(99, th), 0); assert.strictEqual(I.stageIndex(100, th), 1); assert.strictEqual(I.stageIndex(1e9, th), 2); assert.strictEqual(I.stageProgress(550, th, 1), 0.5); assert.strictEqual(I.stageProgress(5, th, 2), 1); });
  await t('formatBig never prints 1000M, handles huge and broken numbers', () => {
    assert.strictEqual(I.formatBig(1234), '1,234'); assert.strictEqual(I.formatBig(1500000), '1.5M'); assert.strictEqual(I.formatBig(999999999), '1B');
    assert.strictEqual(I.formatBig(2.5e9), '2.5B'); assert.strictEqual(I.formatBig(1e21), '1Sx'); assert.strictEqual(I.formatBig(1.234e24), '1.23e24'); assert.strictEqual(I.formatBig(Infinity), 'Infinity');
    assert.strictEqual(I.formatTime(7980), '2h 13m'); assert.strictEqual(I.formatTime(40), '40 sec');
  });

  console.log('save-kit (node)');
  const S = require(M('save-kit', 'save-kit.js'));
  const mem = () => { const d = {}; return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: k => { delete d[k]; }, _d: d }; };
  const schema = { score: 'num', level: 'int:9', flag: 'flag', name: 'str:5', owned: 'counts' };
  await t('validate: each field falls back on its own; bad keys dropped', () => {
    const o = JSON.parse('{"score":-5,"level":99,"flag":7,"name":"toolongname","owned":{"__proto__":3,"a":2.9,"b":-1,"c":"x"}}');
    const v = S.validate(schema, { score: 3, name: 'n' }, o);
    assert.strictEqual(v.score, 3); assert.strictEqual(v.level, 9); assert.strictEqual(v.flag, 0); assert.strictEqual(v.name, 'n');
    assert.deepStrictEqual(Object.keys(v.owned), ['a']); assert.strictEqual(v.owned.a, 2);
    assert.strictEqual(Object.getPrototypeOf(v.owned), null);
  });
  await t('save refuses broken numbers and keeps the last good save', () => {
    const st = mem(), k = S.create({ key: 'g', schema, storage: st });
    assert.strictEqual(k.save({ score: 5 }), true); assert.strictEqual(k.save({ score: NaN }), false); assert.strictEqual(k.save({ score: -1 }), false);
    assert.strictEqual(k.load().score, 5);
  });
  await t('load falls back to the backup slot', () => {
    const st = mem(), k = S.create({ key: 'g', schema, storage: st });
    k.save({ score: 7 }); st.setItem('g', '{broken'); assert.strictEqual(k.load().score, 7);
  });
  await t('backup is written at most once per interval', () => {
    const st = mem(), k = S.create({ key: 'g', schema, storage: st, backupEveryMs: 60000 });
    k.save({ score: 1 }); k.save({ score: 2 }); assert.strictEqual(JSON.parse(st._d['g-backup']).score, 1);
    k.forceBackupNext(); k.save({ score: 3 }); assert.strictEqual(JSON.parse(st._d['g-backup']).score, 3);
  });
  await t('save code round trip, plain and truncated', async () => {
    const k = S.create({ key: 'g', schema, storage: mem(), prefix: 'GM1' });
    const code = await k.exportCode({ score: 12.5, name: 'Ann', owned: { x: 3 } });
    assert.ok(/^GM1[zp]\.[A-Za-z0-9_-]+\.[0-9a-z]+$/.test(code));
    const back = await k.importCode('my code:\n ' + code.slice(0, 20) + '\n' + code.slice(20) + ' thanks');
    assert.strictEqual(back.score, 12.5); assert.strictEqual(back.owned.x, 3);
    await assert.rejects(k.importCode(code.slice(0, code.length - 6)), /not complete|damaged/);
    await assert.rejects(k.importCode('hello'), /not a save code/);
  });
  await t('stageImport pauses saving and keeps the old game', () => {
    const st = mem(), k = S.create({ key: 'g', schema, storage: st });
    k.save({ score: 1 }); assert.strictEqual(k.stageImport({ score: 99 }, { score: 1 }), true);
    assert.strictEqual(k.save({ score: 2 }), false); assert.strictEqual(JSON.parse(st._d['g']).score, 99); assert.strictEqual(JSON.parse(st._d['g-before-load']).score, 1);
  });
  await t('twoTap arms then fires', () => { let n = 0, armed = 0; const f = S.twoTap(() => n++, 1000, () => armed++); f(); assert.strictEqual(n, 0); f(); assert.strictEqual(n, 1); assert.strictEqual(armed, 1); });

  console.log('sticker-text (node)');
  const ST = require(M('sticker-text', 'sticker-text.js'));
  await t('ringShadow makes 48 zero-blur offsets', () => { const s = ST.ringShadow('#fff7e3'); assert.strictEqual(s.split(',').length, 48); assert.ok(/ 0 #fff7e3/.test(s)); });

  console.log('browser modules (Chromium)');
  let chromium;
  try { chromium = require('playwright-core').chromium; } catch (e) { console.error('\nplaywright-core is not installed. Run:  npm install   (then re-run; set CHROMIUM=/path/to/chrome if Playwright cannot find a browser).\nThe tests for frame-kit, sprite-baker, lzma-decode and fuzz-kit need no npm packages:  npm run test:kits'); process.exit(2); }
  let browser;
  try { browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}); }
  catch (e) { console.error('\nNo browser found for Playwright. Either run:  npx playwright-core install chromium\nor point to one you already have:  CHROMIUM=/path/to/chrome node tests/run.js\n(' + pass + ' Node checks passed, ' + fail + ' failed; the browser checks were skipped.)'); process.exit(2); }
  const open = async (m, w = 412, h = 800) => { const ctx = await browser.newContext({ viewport: { width: w, height: h } }), p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto('file://' + M(m, 'demo.html')); await p.waitForTimeout(300); return p; };

  await t('every demo page loads without errors', async () => {
    for (const m of ['stage-curtains', 'save-kit', 'hold-press', 'env-probes', 'fx-governor', 'fly-to-mini', 'sticker-text', 'idle-core', 'cartoon-3d-kit']) { const p = await open(m); assert.deepStrictEqual(p.errs, [], m + ': ' + p.errs.join('; ')); await p.context().close(); }
  });
  await t('env-probes reports sane values in Chromium', async () => {
    const p = await open('env-probes'); const r = await p.evaluate(() => EnvProbes.report());
    assert.strictEqual(r.timerRounded, false); assert.strictEqual(r.canvasReadbackOk, true); assert.strictEqual(r.storageWorks, true); await p.context().close();
  });
  await t('stage-curtains: close puts both halves in place, open removes the curtain', async () => {
    const p = await open('stage-curtains');
    const r = await p.evaluate(async () => {
      const c = StageCurtains.create({ container: document.body, color: '#b3202a' });
      await c.prepare({ hurry: true }); await c.close();
      const halves = [...c.element.children].slice(0, 2).map(e => e.style.transform);
      const inDom = document.body.contains(c.element); await c.open(); return { halves, inDom, after: document.body.contains(c.element), closed: c.isClosed };
    });
    assert.deepStrictEqual(r.halves, ['translateX(0px)', 'translateX(0px)']); assert.ok(r.inDom); assert.strictEqual(r.after, false); assert.strictEqual(r.closed, false); await p.context().close();
  });
  await t('stage-curtains: a stalled half (animation cancelled) still ends in place', async () => {
    const p = await open('stage-curtains');
    const r = await p.evaluate(async () => {
      const c = StageCurtains.create({ container: document.body, color: '#2a6fb3' });
      await c.prepare({ hurry: true });
      const pr = c.close();
      await new Promise(f => setTimeout(f, 200));
      document.getAnimations().forEach(a => { const t = a.effect && a.effect.target; if (t && t.tagName === 'CANVAS' && t.style.right === '0px') a.cancel(); });
      await pr; return [...c.element.children].slice(0, 2).map(e => e.style.transform);
    });
    assert.deepStrictEqual(r, ['translateX(0px)', 'translateX(0px)']); await p.context().close();
  });
  await t('hold-press: tap is one click; hold repeats; release adds no extra click', async () => {
    const p = await open('hold-press'); const bb = await p.evaluate(() => { const r = document.getElementById('b').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await p.mouse.click(bb[0], bb[1]); await p.waitForTimeout(100);
    let v = await p.evaluate(() => [t, h]); assert.deepStrictEqual(v, [1, 0]);
    await p.mouse.move(bb[0], bb[1]); await p.mouse.down(); await p.waitForTimeout(1500); await p.mouse.up(); await p.waitForTimeout(150);
    v = await p.evaluate(() => [t, h]); assert.strictEqual(v[0], 1, 'no click after the hold'); assert.ok(v[1] >= 4 && v[1] <= 8, 'hold presses ' + v[1]);
    await p.mouse.click(bb[0], bb[1]); await p.waitForTimeout(900);
    v = await p.evaluate(() => [t, h]); assert.strictEqual(v[0], 2, 'the next tap works normally'); await p.context().close();
  });
  await t('hold-press: sliding away before the hold starts cancels it', async () => {
    const p = await open('hold-press'); const bb = await p.evaluate(() => { const r = document.getElementById('b').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await p.mouse.move(bb[0], bb[1]); await p.mouse.down(); await p.mouse.move(bb[0] + 60, bb[1] + 60, { steps: 4 }); await p.waitForTimeout(900); await p.mouse.up();
    assert.strictEqual(await p.evaluate(() => h), 0); await p.context().close();
  });
  await t('fx-governor steps down after slow windows, ignores pauses, obeys the player', async () => {
    const p = await open('env-probes');
    await p.addScriptTag({ path: M('fx-governor', 'fx-governor.js') });
    const r = await p.evaluate(() => {
      const out = {}; let lvls = [];
      let g = FxGovernor.create({ onChange: (l) => lvls.push(l) });
      for (let t = 1000; t < 12000; t += 50) g.frame(t);           // 20 fps
      out.slow = lvls.slice();
      lvls = []; g = FxGovernor.create({ onChange: (l) => lvls.push(l) });
      for (let t = 1000; t < 12000; t += 16) g.frame(t);           // 60 fps
      out.fast = lvls.slice();
      lvls = []; g = FxGovernor.create({ onChange: (l) => lvls.push(l) });
      let t = 1000; for (let i = 0; i < 160; i++) { g.frame(t); t += (i % 40 === 39) ? 600 : 50; }   // slow frames cut by long pauses
      out.paused = lvls.slice();
      lvls = []; g = FxGovernor.create({ onChange: (l) => lvls.push(l) }); g.choose('full');
      for (let t2 = 1000; t2 < 12000; t2 += 50) g.frame(t2);
      out.chosen = lvls.slice();
      return out;
    });
    assert.deepStrictEqual(r.slow, ['lite']); assert.deepStrictEqual(r.fast, []); assert.deepStrictEqual(r.paused, []); assert.deepStrictEqual(r.chosen, []); await p.context().close();
  });
  await t('fly-to-mini: mini appears after scrolling away, disappears when back', async () => {
    const p = await open('fly-to-mini');
    const cls = () => p.evaluate(() => document.getElementById('bar').classList.contains('mini-on'));
    assert.strictEqual(await cls(), false);
    await p.evaluate(() => window.scrollTo(0, 900)); await p.waitForTimeout(900); assert.strictEqual(await cls(), true);
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(900); assert.strictEqual(await cls(), false);
    assert.strictEqual(await p.evaluate(() => document.querySelectorAll('.mini-fly').length), 0, 'no flying copy left behind'); await p.context().close();
  });
  await t('fly-to-mini: a flight cut short by scrolling back ends cleanly', async () => {
    const p = await open('fly-to-mini');
    await p.evaluate(() => window.scrollTo(0, 900)); await p.waitForTimeout(150); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(1200);
    assert.strictEqual(await p.evaluate(() => document.getElementById('bar').classList.contains('mini-on')), false);
    assert.strictEqual(await p.evaluate(() => document.querySelectorAll('.mini-fly').length), 0); await p.context().close();
  });
  await t('sticker-text applies a ring and the data attribute', async () => {
    const p = await open('sticker-text'); const r = await p.evaluate(() => { const a = document.getElementById('a'); return [a.getAttribute('data-t'), a.style.getPropertyValue('--st-ring').split(',').length, getComputedStyle(a, '::before').textShadow.split('rgb').length - 1]; });
    assert.strictEqual(r[0], 'Bloop'); assert.strictEqual(r[1], 48); assert.ok(r[2] >= 40); await p.context().close();
  });
  await t('idle-core demo runs a tick and buys an upgrade', async () => {
    const p = await open('idle-core'); await p.evaluate(() => { s.count = 100; draw(); }); await p.click('#shop button'); await p.waitForTimeout(250);
    assert.ok(await p.evaluate(() => s.owned.Helper === 1)); assert.deepStrictEqual(p.errs, []); await p.context().close();
  });
  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
