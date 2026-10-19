#!/usr/bin/env node
/* Copyright (c) 2026 LFC Foundry. MIT License. Command line of the test runner.
     node tools/test-runner/cli.js warm start [chromium firefox webkit epiphany]   keep browsers open (all four when none are named)
     node tools/test-runner/cli.js warm status | stop
     node tools/test-runner/cli.js all <check.js> [args...]                        run one browser check in the four browsers, one at a time, and print one summary */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), R = require('./runner.js');
const [cmd, sub, ...rest] = process.argv.slice(2), dir = R.warmDir();
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
  if (cmd === 'all') {
    const script = sub; if (!script) { console.log('usage: cli.js all <check.js> [args...]'); return 2; }
    const t0 = Date.now(), rows = []; let bad = 0;
    for (const b of R.BROWSERS) {
      const t1 = Date.now(), r = cp.spawnSync(process.execPath, [script, b, ...rest], { encoding: 'utf8', env: process.env, maxBuffer: 1 << 26 });
      process.stdout.write(r.stdout || ''); if (r.status !== 0) { bad++; process.stdout.write(r.stderr || ''); }
      rows.push({ browser: b, status: r.status === 0 ? 'pass' : r.status === 2 ? 'skipped' : 'FAIL', seconds: ((Date.now() - t1) / 1000).toFixed(1) });
    }
    console.log('\n' + R.table(rows, [{ key: 'browser', title: 'browser', align: 'left' }, { key: 'status', title: 'result', align: 'left' }, { key: 'seconds', title: 'seconds' }]) + '\ntotal ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s' + (R.BROWSERS.some((b) => R.warmInfo(b)) ? '' : '  (no warm browsers; `warm start` saves the start-up of each)'));
    return bad ? 1 : 0;
  }
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 5).join('\n').replace(/^\/\* Copyright[^.]*\. MIT License\. /, ''));
  return 2;
}
main().then((c) => process.exit(c), (e) => { console.log(e && e.stack || e); process.exit(1); });
