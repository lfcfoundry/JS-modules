#!/usr/bin/env node
// test-runner warm browsers, in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Times the same tiny job (open a page, run one line, close) started cold (a new browser each time) and warm (a browser kept open by `cli.js warm start`), taking turns, and checks that the warm browser
// survives a client letting go, that a second client waits its turn, and that the version printed on line 1 is the same either way.
// Run: node tests/test-runner-browser.js <chromium|firefox|webkit|epiphany> [out.json]     Env: CHROMIUM=/path, FIREFOX=/path, REPS (default 3)
'use strict';
const path = require('path'), cp = require('child_process'), os = require('os'), fs = require('fs');
process.env.TEST_RUNNER_WARM = fs.mkdtempSync(path.join(os.tmpdir(), 'trb-'));
const T = require('../tools/test-runner/runner.js'), cli = path.resolve(__dirname, '..', 'tools', 'test-runner', 'cli.js'), REPS = +(process.env.REPS || 3);
T.main(async (_b, which, outFile) => {
  await _b.close();   // main() launched one to print line 1; this check wants to control launches itself
  const job = async (cold) => {
    const t0 = Date.now(), b = await T.launch(which, { cold }), v = await b.version(), p = await b.newPage();
    await p.goto('data:text/html,<title>t</title>'); const n = await p.evaluate(() => 40 + 2); await b.close();
    return { ms: Date.now() - t0, v, warm: b.warm, n };
  };
  const started = Date.now(), r = cp.spawnSync(process.execPath, [cli, 'warm', 'start', which], { encoding: 'utf8', env: process.env }); const startMs = Date.now() - started;
  console.log(r.stdout.trim().split('\n')[0]);
  let pass = T.warmInfo(which) !== null;
  const cold = [], warm = []; let versions = new Set(), allWarm = true, answered = true;
  for (let i = 0; i < REPS + 1; i++) for (const mode of i % 2 ? ['warm', 'cold'] : ['cold', 'warm']) {
    const x = await job(mode === 'cold'); versions.add(String(x.v).replace(/\s*\(warm\)/, '')); answered = answered && x.n === 42;
    if (mode === 'warm') allWarm = allWarm && x.warm; if (i > 0) (mode === 'cold' ? cold : warm).push(x.ms);
  }
  const survives = T.warmInfo(which) !== null, one = await T.launch(which), two = T.launch(which, { lockWaitMs: 60000 });
  await T.sleep(500); let waited = true; const raced = await Promise.race([two.then(() => 'got it'), T.sleep(300).then(() => 'waiting')]); waited = raced === 'waiting';
  await one.close(); const second = await two; await second.close();
  const stop = cp.spawnSync(process.execPath, [cli, 'warm', 'stop'], { encoding: 'utf8', env: process.env });
  pass = pass && allWarm && answered && versions.size === 1 && survives && waited && T.warmInfo(which) === null;
  const out = { which, startMs, coldMs: T.median(cold), warmMs: T.median(warm), versions: [...versions], allWarm, survives, waited };
  console.log('warm start of ' + which + ': ' + (startMs / 1000).toFixed(1) + ' s once. One tiny job (open a page, run one line, close), median of ' + REPS + ', taking turns (ms, smaller is better):');
  console.log('  cold ' + out.coldMs + '   warm ' + out.warmMs + '   times faster (bigger is better) ' + (out.coldMs / out.warmMs).toFixed(1) + 'x   saved per job ' + (out.coldMs - out.warmMs) + ' ms');
  console.log('  same version either way: ' + (versions.size === 1) + '; warm browser still there after a client let go: ' + survives + '; a second client waited for the first: ' + waited + '; stopped cleanly: ' + (T.warmInfo(which) === null));
  console.log(pass ? 'PASS' : 'FAIL'); if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  return pass;
});
