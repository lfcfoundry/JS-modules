// Real-browser checks for slow-note, run by tests/pieces-browser.js. Copyright (c) 2026 LFC Foundry. MIT License.
const { check, open, sleep, ok } = require('../pieces-browser.js');
check('slow-note', async (b) => {
  const p = await open(b, 'modules/slow-note/demo.html');
  await p.evaluate(() => { try { localStorage.removeItem('slow-note-demo'); } catch (e) {} });
  await p.reload(); await sleep(1700);
  const sup = await p.evaluate(() => note.supports);
  await p.click('#err'); await sleep(200);
  let n = await p.evaluate(() => note.count()); ok(n === 1, 'the error was not noted: ' + n);
  await sleep(1100); await p.click('#rej'); await sleep(200);
  const e = await p.evaluate(() => note.entries().map(x => x[1] + ' | ' + x[2]));
  const webkit = await p.evaluate(() => /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Firefox/.test(navigator.userAgent));   // WebKit hides the text of errors on pages opened from file:// ("Script error."); over http it says "demo error"
  ok(e.length === 2 && (webkit ? /^error \| Script error/ : /^error \| .*demo error/).test(e[0]) && /\[demo\]$/.test(e[0]), JSON.stringify(e));
  ok(/^error \| promise: demo rejection/.test(e[1]), JSON.stringify(e));
  let said = 'errors and rejections noted';
  if (sup['slow tap'] || sup['slow frame']) {
    await sleep(1100); await p.click('#slow'); await sleep(900);
    const kinds = await p.evaluate(() => note.entries().map(x => x[1]));
    ok(!sup['slow tap'] || kinds.includes('slow tap'), 'the slow tap was not noted: ' + kinds);
    said += ', slow ' + [sup['slow tap'] ? 'tap' : '', sup['slow frame'] ? 'frame' : ''].filter(Boolean).join(' and ') + ' seen';
  } else said += '; this browser reports no slow taps or frames (nothing to check)';
  const before = await p.evaluate(() => note.count());
  await p.reload(); await sleep(300);
  const after = await p.evaluate(() => note.count()); ok(after === before, 'the note did not survive a reload: ' + before + ' then ' + after);
  const txt = await p.evaluate(() => note.text()); ok(/slow-note demo \|/.test(txt) && /Start-up:/.test(txt) && /demo rejection/.test(txt), txt.slice(0, 200));
  const copied = await p.evaluate(() => note.copy().then(v => typeof v));
  ok(copied === 'boolean', 'copy did not answer true or false');
  await p.evaluate(() => note.clear()); n = await p.evaluate(() => note.count()); ok(n === 0, 'clear left ' + n);
  await p.evaluate(() => localStorage.removeItem('slow-note-demo'));
  const unexpected = p.errs.filter(x => !/demo error|demo rejection|Script error/.test(x)); ok(!unexpected.length, unexpected[0]);
  return said + '; kept across a reload';
});
