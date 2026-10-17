// Real-browser checks for speed-lab, run by tests/pieces-browser.js. Copyright (c) 2026 LFC Foundry. MIT License.
const { check, open, sleep, ok } = require('../pieces-browser.js');
// WebKitGTK 2.52.6 and GNOME Web 46.5 draw this page at 15 to 28 frames a second from about 2 to 5 seconds after it loads, even with nothing else running (seen with no driver call pending);
// wait for that to pass (and for the page to reach 55 frames a second) so only the planted or real slowness is measured.
const calm = p => p.evaluate(() => new Promise(done => { let tries = 0; (function probe() { const d = []; let last = 0; const t0 = performance.now(); (function f(t) { if (last) d.push(t - last); last = t; if (t - t0 < 500) requestAnimationFrame(f); else if (((performance.now() > 7000 || !/AppleWebKit/.test(navigator.userAgent) || /Chrome/.test(navigator.userAgent)) && d.length && 1000 * d.length / d.reduce((a, c) => a + c) >= 55) || ++tries > 30) done(); else probe(); })(t0); })(); }));
check('speed-lab', async (b) => {
  const done = [];
  // 1. a normal run, with a card left open that the test has to close
  let p = await open(b, 'tools/speed-lab/demo.html#fast');
  await p.click('#showcard'); await p.click('[data-speed-lab-panel] [data-go]');
  await p.waitForFunction(() => !document.querySelector('[data-speed-lab-panel] [data-out]').hidden, { timeout: 60000 });
  const r = await p.evaluate(() => { const x = lab.result(); return { ids: x.steps.map(s => s.id).join(''), n: x.steps.map(s => s.n), vis: x.steps.map(s => s.vis), bad: x.steps.map(s => s.bad), tries: x.steps.map(s => s.tries), closed: x.closed, verdict: x.verdict.map(v => v.text), text: x.text, cardHidden: document.getElementById('card').hidden, hasStyle: !!document.querySelector('style[data-speed-lab]'), btn: document.querySelector('[data-go]').textContent, out: document.querySelector('[data-out]').innerText }; });
  ok(r.ids === 'ABCDZ', 'steps ' + r.ids); ok(r.n.every(n => n >= 5), 'frames per step ' + r.n);   // 5 is the least speed-lab counts as a measurement (WebKitGTK and GNOME Web draw only 6 to 12 frames in the first 0.4 s after the page changes) ok(r.vis.every(v => v >= 30), 'the scene was not in view: ' + r.vis); ok(r.bad.every(x => !x), 'steps disturbed: ' + r.bad);
  ok(r.closed['the demo card'] >= 1 && r.cardHidden, 'the card was not closed: ' + JSON.stringify(r.closed));
  ok(r.verdict.length >= 2 && /the demo card/.test(r.verdict.join(' ')) && /speed-lab demo \|/.test(r.text) && /step \| fps/.test(r.text), r.verdict.join(' / '));
  ok(!r.hasStyle && r.btn === 'Run again' && /Nothing moving/.test(r.out), 'cleanup or panel text wrong'); done.push('five steps measured with the scene in view, the covering card closed and reported, the injected style removed');
  const copied = await p.evaluate(() => { document.querySelector('[data-copy]').click(); return new Promise(res => setTimeout(() => res(document.querySelector('[data-copy]').textContent), 400)); });
  ok(/Copied|Select the text/.test(copied), 'copy button said ' + copied); done.push('copy button answers');
  await p.close();
  // 2. a card that cannot be closed: every step is marked disturbed after three tries, and the answer says so
  p = await open(b, 'tools/speed-lab/demo.html#fast,stubborn');
  await p.click('#showcard'); await p.click('[data-speed-lab-panel] [data-go]');
  await p.waitForFunction(() => !document.querySelector('[data-speed-lab-panel] [data-out]').hidden, { timeout: 90000 });
  const s = await p.evaluate(() => { const x = lab.result(); return { bad: x.steps.map(s => s.bad), tries: x.steps.map(s => s.tries), v: x.verdict[0].text }; });
  ok(s.bad.every(x => /the demo card was on screen/.test(x)) && s.tries.every(t => t === 3) && /5 steps were disturbed/.test(s.v), JSON.stringify(s)); done.push('an unclosable card marks steps disturbed after 3 tries');
  await p.close();
  // 3. a page that draws no frames (a stalled or hidden page): the run still ends, every step says why, and the answer refuses to compare
  p = await open(b, 'tools/speed-lab/demo.html#fast');
  const q = await p.evaluate(() => { window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = function () { return 0; }; return SpeedLab.run({ scene: '#scene', bar: '#bar', stepMs: 200, warmMs: 50, settleMs: 20, tries: 1, steps: [{ id: 'A', role: 'baseline', label: 'Idle' }, { id: 'B', role: 'load', label: 'Busy' }] }).then(x => { window.requestAnimationFrame = window.__raf; return { bad: x.steps.map(s => s.bad), v: x.verdict.map(l => l.text).join(' ') }; }); });
  ok(q.bad.every(x => /drew almost no frames/.test(x)) && /No comparison was possible/.test(q.v) && !/stutter in the test|DID make/.test(q.v), JSON.stringify(q)); done.push('a page with no frames ends the run, marks each step, and gives no comparison');
  const h = await p.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); return SpeedLab.run({ scene: '#scene', bar: '#bar', stepMs: 200, warmMs: 50, settleMs: 20, tries: 1, steps: [{ id: 'A', role: 'baseline', label: 'Idle' }, { id: 'B', role: 'load', label: 'Busy' }] }).then(x => { delete document.hidden; return x.steps.map(s => s.bad); }); });
  ok(h.every(x => /hidden or in the background/.test(x)), JSON.stringify(h)); done.push('a hidden page marks the steps disturbed');
  // 4. a cold first step (slow only the first time it is measured): it is measured again, and the answer says so
  await calm(p);
  const c = await p.evaluate(() => { var calls = 0; window.__burn = false; (function spin() { if (window.__burn) { var t = performance.now(); while (performance.now() - t < 30); } requestAnimationFrame(spin); })();
    return SpeedLab.run({ scene: '#scene', bar: '#bar', stepMs: 700, warmMs: 100, settleMs: 30, steps: [{ id: 'A', role: 'baseline', label: 'Idle', setup: () => { window.__burn = calls++ === 0; return () => { window.__burn = false; }; } }, { id: 'B', role: 'load', label: 'Busy' }, { id: 'Z', role: 'heat', label: 'Idle again' }] }).then(x => ({ again: x.steps[0].again, calls, fps: x.steps.map(s => Math.round(s.fps)), v: x.verdict.map(l => l.text).join(' ') })); });
  ok(c.again === true && c.calls === 2 && c.fps[0] > 45 && /second time|too hopeful/.test(c.v), JSON.stringify(c)); done.push('a slow first baseline is measured again and the answer says so');
  // 5. a load that is slow only the first time (a one-off): measured again, not blamed; a load that is slow every time: measured twice, still blamed
  const o = await p.evaluate(() => { var calls = 0; const mk = (b) => ({ scene: '#scene', bar: '#bar', stepMs: 700, warmMs: 100, settleMs: 30, steps: [{ id: 'A', role: 'baseline', label: 'Idle' }, { id: 'B', role: 'load', label: 'Busy', setup: () => { window.__burn = b(); return () => { window.__burn = false; }; } }, { id: 'Z', role: 'heat', label: 'Idle again' }] });
    return SpeedLab.run(mk(() => calls++ === 0)).then(x => ({ calls, again: x.steps[1].again, first: Math.round(x.steps[1].first.fps), fps: Math.round(x.steps[1].fps), v: x.verdict.map(l => l.text).join(' ') })).then(one => SpeedLab.run(mk(() => true)).then(x => ({ one, always: { again: x.steps[1].again, fps: Math.round(x.steps[1].fps), v: x.verdict.map(l => l.text).join(' ') } }))); });
  ok(o.one.again && o.one.calls === 2 && o.one.first < 45 && o.one.fps > 50 && /one-off slowdown/.test(o.one.v) && /did not make this device stutter/.test(o.one.v), JSON.stringify(o.one));
  ok(o.always.again && o.always.fps < 45 && /slow both times/.test(o.always.v) && /DID make this device stutter/.test(o.always.v), JSON.stringify(o.always)); done.push('a one-off slow load step is measured again and not blamed; a load that is slow every time still is');
  const unexpected = p.errs.filter(Boolean); ok(!unexpected.length, unexpected[0]);
  return done.join('; ');
});
