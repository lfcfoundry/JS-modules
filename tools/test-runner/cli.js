#!/usr/bin/env node
/* Copyright (c) 2026 LFC Foundry. MIT License. Command line of the test runner.
     node tools/test-runner/cli.js warm start [chromium firefox webkit]   keep browsers open (all three when none are named)
     node tools/test-runner/cli.js warm status | stop
     node tools/test-runner/cli.js all [--fresh] <check.js> [args...]              run one browser check in the three browsers, one at a time, and print one summary;
                                                                                   cells that already passed for this build are skipped (a rerun after a crash or a machine restart resumes), --fresh runs them all again
     node tools/test-runner/cli.js calibrate [--save] [browsers]                    the noise guard: 1.5 s fixed loop per browser vs the quiet baseline (--save on a quiet machine sets it)
     node tools/test-runner/cli.js status [check.js [args...]]                     ALIVE, FINISHED or DEAD (also: all --status [check.js [args...]]) */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), R = require('./runner.js'), L = require('./ledger.js');
const argv = process.argv.slice(2), wantStatus = argv.includes('--status'), fresh = argv.includes('--fresh');
const [cmd, sub, ...rest] = argv.filter((a) => a !== '--status' && a !== '--fresh'), dir = R.warmDir();
const runChild = (script, args) => new Promise((ok) => {      // like spawnSync, but the heartbeat keeps beating while the check runs
  const c = cp.spawn(process.execPath, [script, ...args], { env: process.env }), out = [], err = []; let n = 0;
  c.stdout.on('data', (d) => { if ((n += d.length) < (1 << 26)) out.push(d); }); c.stderr.on('data', (d) => { if (n < (1 << 26)) err.push(d); });
  c.on('close', (status) => ok({ status, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') }));
  c.on('error', (e) => ok({ status: 1, stdout: '', stderr: String(e) }));
});
function printStatus(script, args) {
  const runs = L.status(script ? L.suiteId(script, args) : undefined);
  if (!runs.length) { console.log('no run recorded' + (script ? ' for ' + script : '') + ' (state kept in ' + L.dirOf() + ')'); return 1; }
  let worst = 0;
  for (const j of runs) {
    console.log(j.verdict + '  ' + j.suite + ': ' + j.reason);
    if (j.hb) console.log(R.table(j.cells.map((c) => ({ browser: c.browser, status: c.status, seconds: c.seconds === undefined ? '' : c.seconds })), [{ key: 'browser', title: 'browser', align: 'left' }, { key: 'status', title: 'result', align: 'left' }, { key: 'seconds', title: 'seconds' }]).replace(/^/gm, '  '));
    if (j.verdict === 'DEAD') worst = Math.max(worst, 2); else if (j.verdict === 'FINISHED' && j.hb.failed) worst = Math.max(worst, 1);
  }
  return worst;
}
const names = (a) => (a.length ? a : R.BROWSERS).filter((b) => R.BROWSERS.includes(b));
async function main() {
  if (cmd === 'warm' && sub === 'start') {
    const want = names(rest), live = want.filter((b) => R.warmInfo(b));
    if (live.length === want.length) { console.log('already warm: ' + live.join(', ')); return 0; }
    fs.mkdirSync(dir, { recursive: true }); try { fs.unlinkSync(path.join(dir, 'READY')); } catch (e) { /* none */ }
    const t0 = Date.now(), d = cp.spawn(process.execPath, [path.join(__dirname, 'warmd.js'), ...want.filter((b) => !live.includes(b))], { detached: true, stdio: 'ignore', env: process.env }); d.unref();
    for (let i = 0; i < 600 && !fs.existsSync(path.join(dir, 'READY')); i++) await R.sleep(200);
    for (const b of want) { const i = R.warmInfo(b); console.log(b.padEnd(9) + (i ? 'warm   ' + i.version : 'FAILED ' + (fs.existsSync(path.join(dir, b + '.error')) ? fs.readFileSync(path.join(dir, b + '.error'), 'utf8').split('\n')[0] : 'no answer'))); }
    console.log('started in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s; stop with: node tools/test-runner/cli.js warm stop');
    return 0;
  }
  if (cmd === 'warm' && sub === 'status') { let up = 0; for (const b of R.BROWSERS) { const i = R.warmInfo(b); if (i) up++; console.log(b.padEnd(9) + (i ? 'warm   ' + i.version + '  (pid ' + i.pid + ')' : 'not running')); } return up ? 0 : 1; }
  if (cmd === 'warm' && sub === 'stop') {
    const pids = new Set(); for (const b of R.BROWSERS) { const i = R.warmInfo(b); if (i) pids.add(i.pid); }
    for (const p of pids) { try { process.kill(p, 'SIGTERM'); } catch (e) { /* gone */ } }
    const until = Date.now() + 8000; while (Date.now() < until && [...pids].some((p) => { try { process.kill(p, 0); return true; } catch (e) { return false; } })) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) { if (/\.(error|lock)$|^READY$/.test(f)) try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* gone */ } }
    console.log(pids.size ? 'stopped' : 'nothing was running'); return 0;
  }
  if (cmd === 'calibrate') {                                    // calibrate <browser...> [--save]: show how quiet the machine is; --save keeps the median of 5 as the quiet baseline
    const save = process.argv.includes('--save'), N = R.noise;
    for (const w of names(rest.concat(sub && sub !== '--save' ? [sub] : []).filter((a) => a !== '--save'))) {
      const b = await R.launch(w); try {
        const n = save ? 5 : 1, rates = []; for (let i = 0; i < n; i++) rates.push((await N.calibrate(b)).rate);
        const m = R.median(rates), j = N.judge(m, (N.baselineFor(w) || {}).rate);
        console.log(w.padEnd(9) + m.toFixed(1) + ' M/s  ' + j.note + (j.noisy ? '  NOISY' : '') + (save ? '  (saved as the quiet baseline; spread ' + (Math.min(...rates)).toFixed(1) + '-' + Math.max(...rates).toFixed(1) + ')' : ''));
        if (save) N.saveBaseline(w, m);
      } finally { await b.close(); }
    }
    return 0;
  }
  if (cmd === 'status' || (cmd === 'all' && wantStatus)) return printStatus(sub, rest);
  if (cmd === 'all') {
    const script = sub; if (!script) { console.log('usage: cli.js all [--fresh] <check.js> [args...]'); return 2; }
    const t0 = Date.now(), rows = [], suite = L.suiteId(script, rest), build = L.buildId(); let bad = 0, kept = 0;
    const hb = L.heartbeat(suite, { script, args: rest, build, total: R.BROWSERS.length }), tick = hb.timer(5000);
    for (const b of R.BROWSERS) {
      const prior = fresh ? null : L.done(build, suite, b);
      if (prior) {
        kept++; console.log(b + ': finished earlier for this build (' + prior.status + ', ' + prior.seconds + ' s); not run again (--fresh runs it)');
        rows.push({ browser: b, status: prior.status + ' (kept)', seconds: prior.seconds }); hb.beat({ cells: Object.assign(hb.state.cells, { [b]: { status: prior.status, seconds: prior.seconds, kept: true } }) });
        continue;
      }
      hb.beat({ current: b });
      const t1 = Date.now(), r = await runChild(script, [b, ...rest]);
      process.stdout.write(r.stdout || ''); if (r.status !== 0) { bad++; process.stdout.write(r.stderr || ''); }
      const status = r.status === 0 ? 'pass' : r.status === 2 ? 'skipped' : 'FAIL', seconds = ((Date.now() - t1) / 1000).toFixed(1);
      rows.push({ browser: b, status, seconds }); L.record(build, suite, b, { status, seconds, exit: r.status });
      hb.beat({ current: null, cells: Object.assign(hb.state.cells, { [b]: { status, seconds } }) });
    }
    clearInterval(tick); hb.beat({ state: 'finished', current: null, failed: bad, finishedAt: Date.now() });
    console.log('\n' + R.table(rows, [{ key: 'browser', title: 'browser', align: 'left' }, { key: 'status', title: 'result', align: 'left' }, { key: 'seconds', title: 'seconds' }]) + '\ntotal ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s' + (R.BROWSERS.some((b) => R.warmInfo(b)) ? '' : '  (no warm browsers; `warm start` saves the start-up of each)') + (kept ? '  (' + kept + ' kept from an earlier run of this build)' : ''));
    return bad ? 1 : 0;
  }
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 5).join('\n').replace(/^\/\* Copyright[^.]*\. MIT License\. /, ''));
  return 2;
}
main().then((c) => process.exit(c), (e) => { console.log(e && e.stack || e); process.exit(1); });
