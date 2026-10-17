const { check, open, sleep, ok } = require('../pieces-browser.js');
check('speed-lab', async (b) => {
  const done = [];
  // 1. a normal run, with a card left open that the test has to close
  let p = await open(b, 'tools/speed-lab/demo.html#fast');
  await p.click('#showcard'); await p.click('[data-speed-lab-panel] [data-go]');
  await p.waitForFunction(() => !document.querySelector('[data-speed-lab-panel] [data-out]').hidden, { timeout: 60000 });
  const r = await p.evaluate(() => { const x = lab.result(); return { ids: x.steps.map(s => s.id).join(''), n: x.steps.map(s => s.n), vis: x.steps.map(s => s.vis), bad: x.steps.map(s => s.bad), tries: x.steps.map(s => s.tries), closed: x.closed, verdict: x.verdict.map(v => v.text), text: x.text, cardHidden: document.getElementById('card').hidden, hasStyle: !!document.querySelector('style[data-speed-lab]'), btn: document.querySelector('[data-go]').textContent, out: document.querySelector('[data-out]').innerText }; });
  ok(r.ids === 'ABCDZ', 'steps ' + r.ids); ok(r.n.every(n => n >= 8), 'frames per step ' + r.n); ok(r.vis.every(v => v >= 30), 'the scene was not in view: ' + r.vis); ok(r.bad.every(x => !x), 'steps disturbed: ' + r.bad);
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
  const unexpected = p.errs.filter(Boolean); ok(!unexpected.length, unexpected[0]);
  return done.join('; ');
});
