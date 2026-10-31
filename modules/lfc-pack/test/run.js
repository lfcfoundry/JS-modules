// Copyright (c) 2026 LFC Foundry. MIT License.
// lfc-pack checks, pass/fail only (Node 22): value-exact and byte-exact round trips, key and range reads, helper workers, and the Python reader on files this build wrote.
// Uses made-up data only. Run: node modules/lfc-pack/test/run.js
'use strict';
const { spawnSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const JF = require('../lfc-pack.js'), cases = require('./cases.js');
let fail = 0;
const step = (name, cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: __dirname }); const out = (r.stdout + r.stderr).trim().split('\n').slice(-3).join(' | '); console.log((r.status === 0 ? 'ok   ' : 'FAIL ') + name + ': ' + out.slice(0, 200)); if (r.status !== 0) fail++; };
(async () => {
  await JF.init();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jf-py-')); let i = 0;
  for (const [, t] of cases) for (const block of [undefined, 'flat', 'nested']) for (const ex of [false, true]) { const nm = (i++) + (ex ? 'x' : ''); fs.writeFileSync(path.join(dir, nm + '.lfc'), JF.pack(t, { block, exact: ex })); fs.writeFileSync(path.join(dir, nm + '.src'), t); }
  const canonicalText = '{"b":0,"١":1,"2":2}\n';
  fs.writeFileSync(path.join(dir, 'canonical.lfc'), JF.pack(canonicalText));
  fs.writeFileSync(path.join(dir, 'canonical.src'), canonicalText);
  step('round trips (auto, nested, flat)', 'node', ['roundtrip.cjs']);
  step('metadata section', 'node', ['meta.cjs']);
  step('xxh64 block checks', 'node', ['xxh.cjs']);
  step('packParallel dispatch', 'node', ['dispatch.cjs']);
  step('byte-exact switch', 'node', ['exact.cjs']);
  step('key and range reads', 'node', ['query.cjs']);
  step('helper workers', 'node', ['pool.cjs']);
  step('block-parallel pack', 'node', ['parallel.cjs']);
  step('decoder-only build', 'node', ['readonly.cjs']);
  step('trim (fresh wasm memory)', 'node', ['trim.cjs']);
  step('many number paths', 'node', ['manypaths.cjs']);
  step('negative first value', 'node', ['negfirst.cjs']);
  step('tables and plain values', 'node', ['tables.cjs']);
  step('python reader', 'python3', ['-I', 'pycases.py', dir]);
  step('python writer', 'python3', ['-I', 'pywriter.py', dir]);
  step('python writer files in JS', 'node', ['pywriter.cjs', dir]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(fail ? fail + ' step(s) failed' : 'all lfc-pack checks passed'); process.exit(fail ? 1 : 0);
})();
