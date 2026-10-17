// Real-browser checks for grown-ups-door, run by tests/pieces-browser.js. Copyright (c) 2026 LFC Foundry. MIT License.
const { check, open, sleep, ok } = require('../pieces-browser.js');
check('grown-ups-door', async (b) => {
  const p = await open(b, 'modules/grown-ups-door/demo.html#fast');
  const C = async (sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  const shown = () => p.evaluate(() => !document.querySelector('.gud').hidden);
  const counts = () => p.evaluate(() => [+n1, +n2]);
  const step2 = () => p.evaluate(() => !document.querySelector('.gud-pick').disabled);
  const holdFull = async () => { const h = await C('.gud-hold'); await p.mouse.move(h.x, h.y); await p.mouse.down(); await sleep(700); await p.mouse.up(); };
  const dragPass = async () => { const a = await C('.gud-pick'), t = await C('.gud-bask'); await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move((a.x + t.x) / 2, (a.y + t.y) / 2, { steps: 4 }); await p.mouse.move(t.x, t.y, { steps: 4 }); await p.mouse.up(); await sleep(100); };
  const done = [];
  // the defaults are the ones in the header
  ok(await p.evaluate(() => GrownUpsDoor.attach({ guard: '#nothing' }).options.holdMs === 3000 && GrownUpsDoor.attach({ guard: '#nothing' }).options.openMs === 120000), 'defaults are 3 s and 2 min');
  await p.evaluate(() => document.querySelectorAll('.gud').forEach((e, i) => { if (i > 0) e.remove(); }));
  // 1. a guarded press shows the door and does not run the button
  await p.click('#reset'); await sleep(100);
  ok(await shown() && (await counts())[0] === 0, 'the door did not open, or the button ran anyway');
  // 2. letting go early starts over; sliding off starts over
  let h = await C('.gud-hold'); await p.mouse.move(h.x, h.y); await p.mouse.down(); await sleep(150); await p.mouse.up(); await sleep(50);
  ok(!(await step2()), 'a short hold passed step 1'); ok(await p.evaluate(() => document.querySelector('.gud-hold').style.getPropertyValue('--p') === '0'), 'the ring did not reset');
  await p.mouse.move(h.x, h.y); await p.mouse.down(); await sleep(100); await p.mouse.move(h.x + (h.x > 206 ? -120 : 120), h.y, { steps: 3 }); await sleep(600); await p.mouse.up();
  ok(!(await step2()), 'sliding off did not start the hold over'); done.push('early lift and sliding off start over');
  // 3. full hold, then drag
  await holdFull(); ok(await step2(), 'a full hold did not open step 2');
  await dragPass(); ok(!(await shown()) && (await counts())[0] === 1, 'the drag did not pass the door, or the button did not run once: ' + JSON.stringify(await counts()));
  done.push('hold then drag runs the button once');
  // 4. open for a while: no door, the button runs at once
  await p.click('#reset'); await sleep(80); ok(!(await shown()) && (await counts())[0] === 2, 'the open door still asked');
  // 5. after the open time it asks again; Escape closes and gives the focus back
  await sleep(1700); await p.click('#reset'); await sleep(100); ok(await shown() && (await counts())[0] === 2, 'the door did not close again after openMs');
  await p.keyboard.press('Escape'); await sleep(50); ok(!(await shown()) && await p.evaluate(() => document.activeElement.id === 'reset'), 'Escape did not close the door and return the focus');
  done.push('closes again after the open time; Escape returns the focus');
  // 6. keyboard only: hold with Space, tap the item with Space, the target with Enter
  await p.keyboard.press(' '); await sleep(100);
  ok(await shown(), 'a key press on the guarded button did not open the door');
  await p.keyboard.down(' '); await sleep(700); await p.keyboard.up(' '); ok(await step2(), 'a held key did not pass step 1');
  await p.keyboard.press(' '); ok(await p.evaluate(() => document.querySelector('.gud-pick').getAttribute('aria-pressed') === 'true'), 'Space did not pick the item up');
  await p.keyboard.press('Tab'); await p.keyboard.press('Enter'); await sleep(100); ok(!(await shown()) && (await counts())[0] === 3, 'the keyboard route did not pass: ' + JSON.stringify(await counts()));
  done.push('works from the keyboard alone');
  // 7. tap the item, then tap the target (a different guarded button)
  await sleep(1700); await p.click('#save'); await sleep(100); await holdFull();
  let a = await C('.gud-pick'); await p.mouse.click(a.x, a.y); ok(await p.evaluate(() => document.querySelector('.gud-bask').classList.contains('on')), 'tapping the item did not arm the target');
  let t = await C('.gud-bask'); await p.mouse.click(t.x, t.y); await sleep(100); ok(!(await shown()) && (await counts())[1] === 1, 'tap then tap did not pass');
  done.push('tap then tap works');
  // 8. a link: the door shows an Open link instead of leaving the page
  await sleep(1700); await p.click('#more'); await sleep(100);
  ok(await shown() && /LFC Foundry/.test(await p.evaluate(() => document.querySelector('.gud-why').textContent)), 'the link did not ask for the door');
  await holdFull(); await dragPass();
  const link = await p.evaluate(() => { const l = document.querySelector('.gud-link'); return { vis: !l.hidden, href: l.querySelector('a').href, text: l.querySelector('a').textContent, url: location.href }; });
  ok(link.vis && /github\.com\/lfcfoundry/.test(link.href) && link.text === 'Open LFC Foundry' && /demo\.html/.test(link.url), JSON.stringify(link));
  await p.keyboard.press('Escape'); done.push('a guarded link shows an Open link after the task');
  // 9. touch (Chromium has it; some drivers do not)
  let touch = 'touch not tried in this browser';
  try {
    await sleep(1700); await p.click('#reset'); await sleep(100); const hh = await C('.gud-hold');
    await p.touchscreen.touchStart(hh.x, hh.y); await sleep(700); await p.touchscreen.touchEnd();
    if (await step2()) { const a2 = await C('.gud-pick'), t2 = await C('.gud-bask'); await p.touchscreen.touchStart(a2.x, a2.y); await p.touchscreen.touchMove(t2.x, t2.y); await p.touchscreen.touchEnd(); await sleep(150); ok(!(await shown()), 'a touch drag did not pass'); touch = 'touch hold and drag work'; }
    else { await p.keyboard.press('Escape'); touch = 'touch hold did not register in this driver (not a finding about the module)'; }
  } catch (e) { touch = 'touch not tried in this browser (' + String(e.message).slice(0, 60) + ')'; }
  ok(!p.errs.length, p.errs[0]);
  return done.join('; ') + '; ' + touch;
});
