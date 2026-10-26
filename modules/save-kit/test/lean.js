#!/usr/bin/env node
/* Checks the lean builds of save-kit: every part cut on its own, a set like Fancy the Banana's and one like Apple Press's, and everything cut at once. Copyright (c) 2026 LFC Foundry. MIT License.
 * For each build, lean.py writes the file, Node checks its syntax, and test/run.js runs against it with the checks that need a cut part skipped.
 * Run: node modules/save-kit/test/lean.js     (needs python3; builds in the system temp folder, one at a time to keep timer checks steady) */
'use strict';
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const dir = path.join(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'savekit-lean-'));
const parts = cp.execFileSync('python3', [path.join(dir, 'lean.py'), '--list'], { encoding: 'utf8' }).trim().split('\n').map(l => l.split(/\s+/)[0]);
const sets = parts.map(p => [p]).concat([
  ['autosave', 'twoTap', 'persist', 'stageImport', 'migrate', 'skipUnchanged', 'compact', 'raw', 'nativeBase64', 'streamLimit'],   // what Fancy the Banana asked for: keeps codes and onOtherTab
  ['autosave', 'twoTap', 'persist', 'onOtherTab', 'migrate', 'skipUnchanged', 'compact', 'raw', 'nativeBase64'],                      // what Apple Press asked for: keeps codes and stageImport
  parts.slice(),                                                                                                                       // everything cut: the core only
]);
const run = (cmd, args, env) => new Promise(res => cp.execFile(cmd, args, { env: Object.assign({}, process.env, env), encoding: 'utf8' }, (err, out, errout) => res({ ok: !err, out: String(out) + String(errout) })));
(async () => {
  let bad = 0;
  const results = [];
  for (let i = 0; i < sets.length; i++) {
    const set = sets[i];
    const file = path.join(tmp, 'lean' + i + '.js');
    const b = await run('python3', [path.join(dir, 'lean.py'), '--without', set.join(','), '-o', file]);
    if (!b.ok) { results.push({ set, ok: false, why: 'lean.py failed: ' + b.out }); continue; }
    const c = await run(process.execPath, ['--check', file]);
    if (!c.ok) { results.push({ set, ok: false, why: 'syntax: ' + c.out.slice(0, 200) }); continue; }
    const t = await run(process.execPath, [path.join(__dirname, 'run.js')], { SAVEKIT_FILE: file, SAVEKIT_WITHOUT: set.join(','), OLD_REF: 'none' });
    const last = t.out.trim().split('\n').pop();
    results.push({ set, ok: t.ok, why: t.ok ? '' : t.out.slice(-600), last, bytes: fs.statSync(file).size });
  }
  for (const r of results) { if (!r.ok) bad++; console.log((r.ok ? 'ok   ' : 'FAIL ') + (r.set.length > 3 ? r.set.length + ' parts cut: ' + r.set.join(',') : 'without ' + r.set.join(',')) + (r.ok ? '' : '\n       ' + r.why)); }
  console.log('save-kit lean builds: ' + (results.length - bad) + ' of ' + results.length + ' pass');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(bad ? 1 : 0);
})();
