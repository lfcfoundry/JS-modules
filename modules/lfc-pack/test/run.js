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
  step('deflated wasm: zlib and JS inflater', 'node', ['inflate.cjs']);
  step('packParallel dispatch', 'node', ['dispatch.cjs']);
  step('overlapping helper calls', 'node', ['overlap.cjs']);
  step('frame arena', 'node', ['arena.cjs']);
  step('byte-exact switch', 'node', ['exact.cjs']);
  step('per-path strings pick', 'node', ['pathspick.cjs']);
  step('key and range reads', 'node', ['query.cjs']);
  step('equality reads (B19)', 'node', ['equalsread.cjs']);
  step('equality reads in stored bytes (P13, P14)', 'node', ['eqbytes.cjs']);
  step('column reads (B20)', 'node', ['b20cols.cjs']);
  step('delta saves (prototype)', 'node', ['delta.cjs']);
  step('lazy rows (opt-in)', 'node', ['lazyrows.cjs']);
  step('helper workers', 'node', ['pool.cjs']);
  step('helper workers: byte limits, cancel', 'node', ['--expose-gc', 'pool-budget.cjs']);
  step('block-parallel pack', 'node', ['parallel.cjs']);
  step('packBlock + pushPacked (workers)', 'node', ['packblock.cjs']);
  step('packParallelStream', 'node', ['pstream.cjs']);
  step('keys option on nested blocks', 'node', ['nestedkeys.cjs']);
  step('uuid columns and sampled layout choice', 'node', ['sampled.cjs']);
  step('long, exponent and -0 numbers', 'node', ['longnums.cjs']);
  step('mixed-kind keys', 'node', ['mixedkinds.cjs']);
  step('uuid columns from wasm', 'node', ['uuidcols.cjs']);
  step('range reads build matching rows only', 'node', ['rangesel.cjs']);
  step('null plane (column type N)', 'node', ['nullplane.cjs'])
  step('non-ASCII text in the flat path (SIMD and not)', 'node', ['nonascii.cjs']);
  step('variable-length string round trip (Workbench probe)', 'node', ['varlen-roundtrip.cjs']);
  step('decoder-only build', 'node', ['readonly.cjs']);
  step('trim (fresh wasm memory)', 'node', ['trim.cjs']);
  step('many number paths', 'node', ['manypaths.cjs']);
  step('negative first value', 'node', ['negfirst.cjs']);
  step('tables and plain values', 'node', ['tables.cjs']);
  step('empty strings kept (flat writer)', 'node', ['emptystr.cjs']);
  step('warm() opt-in warm-up', 'node', ['warm.cjs']);
  step('one huge JSON document', 'node', ['bigdoc.cjs']);
  step('open(): block-at-a-time reads from a Blob or read()', 'node', ['open.cjs']);
  step('first block of a big save is small (B22)', 'node', ['headblock.cjs']);
  step('open().readAhead()', 'node', ['readahead.cjs']);
  step('number kernel and folded row check (B25 + B26)', 'node', ['numkernel.cjs']);
  step('python reader', 'python3', ['-I', 'pycases.py', dir]);
  step('python writer', 'python3', ['-I', 'pywriter.py', dir]);
  step('python writer files in JS', 'node', ['pywriter.cjs', dir]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(fail ? fail + ' step(s) failed' : 'all lfc-pack checks passed'); process.exit(fail ? 1 : 0);
})();
