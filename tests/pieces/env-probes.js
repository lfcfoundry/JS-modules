// Real-browser checks for env-probes, run by tests/pieces-browser.js. Copyright (c) 2026 LFC Foundry. MIT License.
const { check, open, ok } = require('../pieces-browser.js');
check('env-probes', async (b) => {
  const p = await open(b, 'modules/env-probes/demo.html');
  const r = await p.evaluate(() => ({ rep: EnvProbes.report(), why: EnvProbes.explain() }));
  const rep = r.rep;
  ok(rep.inPage === true, 'not seen as a page: ' + JSON.stringify(rep).slice(0, 200));
  ok(rep.canvasReadbackOk === true && rep.storageWorks === true, 'canvas read-back ' + rep.canvasReadbackOk + ', storage ' + rep.storageWorks);
  ok(typeof rep.timerRounded === 'boolean' && typeof rep.reducedMotion === 'boolean' && typeof rep.coarsePointer === 'boolean' && rep.dpr > 0 && /\w/.test(rep.ua), JSON.stringify(rep).slice(0, 300));
  ok(Array.isArray(r.why) && r.why.every(s => typeof s === 'string'), 'explain() gave ' + JSON.stringify(r.why).slice(0, 200));
  ok(!p.errs.length, p.errs[0]);
  return 'the demo page loads; report() sees a page, canvas read-back and storage work (timer rounded: ' + rep.timerRounded + (rep.timerStepMs ? ', step ' + rep.timerStepMs + ' ms' : '') + '); explain() gives ' + r.why.length + ' sentences';
});
