const { check, open, sleep, ok } = require('../pieces-browser.js');
check('spotlight-tour', async (b) => {
  const p = await open(b, 'modules/spotlight-tour/demo.html');
  const clr = () => p.evaluate(() => { localStorage.removeItem('spotlight-tour-demo'); localStorage.removeItem('spotlight-tour-demo-gift'); });
  await clr(); await p.reload(); await sleep(300);
  const shown = () => p.evaluate(() => !document.querySelector('.stt').hidden);
  const txt = (s) => p.evaluate((q) => document.querySelector(q).textContent, s);
  const done = [];
  // 1. a new visitor sees it once, and it is not "seen" until it is closed
  ok(await shown(), 'the tour did not open for a new visitor'); ok(!(await p.evaluate(() => tour.seen())), 'marked seen too early');
  ok((await txt('.stt-n')) === 'Welcome' && (await p.evaluate(() => document.querySelector('.stt-back').hidden)), 'welcome step wrong');
  await p.click('.stt-next'); await sleep(350);
  ok((await txt('.stt-n')) === 'Step 1 of 5' && (await p.evaluate(() => document.querySelector('.stt-back').hidden)), 'step 1 of 5 / Back should be hidden');
  // the bright window sits over the target
  const geo = await p.evaluate(() => { const h = document.querySelector('.stt-hole').getBoundingClientRect(), t = document.querySelector('#big').getBoundingClientRect(), c = document.querySelector('.stt-card').getBoundingClientRect(); return { h: [h.left, h.top, h.right, h.bottom], t: [t.left, t.top, t.right, t.bottom], c: [c.left, c.top, c.right, c.bottom] }; });
  ok(geo.h[0] <= geo.t[0] + 1 && geo.h[1] <= geo.t[1] + 1 && geo.h[2] >= geo.t[2] - 1 && geo.h[3] >= geo.t[3] - 1, 'the window does not cover the part ' + JSON.stringify(geo));
  ok(geo.c[1] >= geo.h[3] - 1 || geo.c[3] <= geo.h[1] + 1, 'the card covers the window ' + JSON.stringify(geo));
  await p.click('.stt-next'); await sleep(350); ok(!(await p.evaluate(() => document.querySelector('.stt-back').hidden)), 'Back should show from step 2');
  await p.click('.stt-back'); await sleep(300); ok((await txt('.stt-n')) === 'Step 1 of 5', 'Back did not go back');
  done.push('opens for a new visitor, window over the part, Back from step 2');
  // 2. skipping remembers, gives no gift, and the tour does not come back by itself
  await p.click('.stt-skip'); await sleep(900);
  ok(!(await shown()) && await p.evaluate(() => tour.seen() && !tour.giftGiven() && gifts === 0), 'skip should remember and give no gift');
  ok(!(await p.evaluate(() => tour.maybeStart())), 'it came back by itself'); done.push('skip: remembered, no gift');
  // 3. #tour forces it; Escape skips; Tab stays on the card
  await p.evaluate(() => { location.hash = '#tour'; }); ok(await p.evaluate(() => tour.maybeStart()), '#tour did not force the tour');
  await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
  ok(await p.evaluate(() => document.querySelector('.stt').contains(document.activeElement)), 'Tab left the card');
  await p.keyboard.press('Escape'); await sleep(100); ok(!(await shown()), 'Escape did not close it'); await p.evaluate(() => { location.hash = ''; });
  // 4. finishing gives the gift once, after the delay
  await p.evaluate(() => tour.start());
  for (let k = 0; k < 6; k++) { await p.click('.stt-next'); await sleep(120); }
  ok(!(await shown()), 'finishing did not close the tour'); await sleep(600);
  ok(await p.evaluate(() => gifts === 1 && tour.giftGiven()), 'the gift did not arrive once: ' + await p.evaluate(() => gifts));
  await p.evaluate(() => tour.start()); for (let k = 0; k < 6; k++) { await p.click('.stt-next'); await sleep(120); }
  await sleep(600); ok(await p.evaluate(() => gifts === 1), 'the gift was given twice'); done.push('finish gives the gift once; a second finish does not');
  // 5. the last parts: a far-down target scrolls into view and is inside the window
  await p.evaluate(() => tour.start()); await p.evaluate(() => tour.goTo(4)); await sleep(400);
  const far = await p.evaluate(() => { const t = document.querySelector('#bottom').getBoundingClientRect(), h = document.querySelector('.stt-hole').getBoundingClientRect(); return { top: t.top, bottom: t.bottom, vh: innerHeight, hTop: h.top, hBottom: h.bottom }; });
  ok(far.top >= 0 && far.bottom <= far.vh && far.hTop <= far.top + 1 && far.hBottom >= far.bottom - 1, 'the far part is not in view and covered: ' + JSON.stringify(far));
  await p.evaluate(() => tour.close()); done.push('scrolls to a far-down part');
  // 6. a storage that throws does not break it
  const safe = await p.evaluate(() => { const t = SpotlightTour.create({ steps: [{ title: 'a', text: 'b' }], storage: { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }, key: 'k' }); const r = t.maybeStart(); t.close(); t.destroy(); return r; });
  ok(safe === true, 'blocked storage broke the tour');
  await clr();
  ok(!p.errs.length, p.errs[0]);
  return done.join('; ');
});
