#!/usr/bin/env node
/* Checks the lean builds of even-dt and quality-governor. Copyright (c) 2026 LFC Foundry. MIT License.
 * lean.py writes each build; Node loads it; then (1) Fancy Banana's set of cuts must give EXACTLY the answers of Fancy's own code (test/reference-frame.js) on all 26 series of test/series.js:
 * 0 different frame steps and 0 different level changes; (2) every part cut on its own leaves a working file: the surface is what is left, and the cuts that do not change a rule give the full file's answers;
 * (3) the full files are compared with Fancy's code too, and the differences are printed, so nobody is surprised by them.
 * Run: node modules/frame-kit/test/lean.js     (needs python3; about 2 s) */
'use strict';
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const dir = path.join(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'framekit-lean-'));
const F = require('./reference-frame.js'), compare = require('./lean-compare.js'), series = require('./series.js')();
const py = (...a) => cp.spawnSync('python3', [path.join(dir, 'lean.py'), ...a], { encoding: 'utf8' });
const load = file => require(file);
const PARTS = { 'even-dt': ['options', 'stats', 'refreshRule'], 'quality-governor': ['options', 'control', 'errors', 'flipGuard', 'stats', 'stallRules', 'graceStart'] };
const FULL = { 'even-dt': require('../even-dt.js'), 'quality-governor': require('../quality-governor.js') };
let bad = 0, cases = 0, n = 0;
const note = (ok, what, why) => { cases++; if (!ok) bad++; console.log((ok ? 'ok   ' : 'FAIL ') + what + (ok ? '' : '\n       ' + why)); };
const build = (file, without, nc) => { const out = path.join(tmp, file + '-' + (++n) + '.js'), r = py('--file', file, '--without', without.join(','), '-o', out, ...(nc ? ['--no-comments'] : [])); assert.strictEqual(r.status, 0, r.stderr); cp.execFileSync(process.execPath, ['--check', out]); return load(out); };
const t0 = Date.now();

for (const file of Object.keys(PARTS)) {
  const l = py('--file', file, '--list').stdout.split('\n').filter(Boolean).map(s => s.split(/\s+/)[0]);
  note(JSON.stringify(l) === JSON.stringify(PARTS[file]), file + ': the parts are ' + PARTS[file].join(', '), l.join(','));
  const u = py('--file', file, '--without', 'nope', '-o', path.join(tmp, 'x.js'));
  note(u.status !== 0 && /unknown part/.test(u.stderr), file + ': an unknown part name is refused', u.stderr);
}

// (1) Fancy's set against Fancy's code, with and without comments
for (const nc of [false, true]) {
  try {
    const E = build('even-dt', PARTS['even-dt'], nc), Q = build('quality-governor', PARTS['quality-governor'], nc), r = compare(F, E, Q, series);
    note(r.evenDiffs === 0 && r.govDiffs === 0, 'Fancy\'s set' + (nc ? ' (no comments)' : '') + ': ' + r.evenFrames + ' frame steps and ' + r.govRuns + ' governor runs (' + r.govChanges + ' level changes) on ' + series.length + ' series: ' + r.evenDiffs + ' different steps, ' + r.govDiffs + ' different runs', r.differing.slice(0, 4).join('; '));
  } catch (e) { note(false, 'Fancy\'s set' + (nc ? ' (no comments)' : ''), e.stack.slice(0, 500)); }
}

// (2) every part on its own
for (const file of Object.keys(PARTS)) for (const part of PARTS[file]) {
  try {
    const L = build(file, [part], false), E = file === 'even-dt' ? L : null, Q = file === 'quality-governor' ? L : null;
    const r = compare(F, E, Q, series), full = compare(F, E ? FULL['even-dt'] : null, Q ? FULL['quality-governor'] : null, series);
    // a cut that keeps a rule gives the full file's answers; a cut that swaps in Fancy's rule gives Fancy's answers where the full file differed
    const swaps = ['refreshRule', 'stallRules', 'graceStart'].includes(part);
    let ok, what;
    if (!swaps) { ok = r.evenDiffs === full.evenDiffs && r.govDiffs === full.govDiffs && r.evenSeriesDiffering === full.evenSeriesDiffering; what = 'same answers as the full file'; }
    else if (part === 'refreshRule') { ok = r.evenDiffs === 0; what = 'Fancy\'s answers on all ' + r.evenFrames + ' frames'; }
    else { ok = r.govDiffs <= full.govDiffs; what = r.govDiffs + ' different runs against ' + full.govDiffs + ' for the full file'; }
    note(ok, file + ' without ' + part + ': ' + what, 'diffs ' + JSON.stringify([r.evenDiffs, r.govDiffs]) + ' against full ' + JSON.stringify([full.evenDiffs, full.govDiffs]));
    if (file === 'even-dt') { const e = new L(); note((part === 'stats') === (e.reset === undefined) && (part === 'stats') === (e.period === undefined), 'even-dt without ' + part + ': period, drift and reset() are ' + (part === 'stats' ? 'gone' : 'still there'), 'surface'); }
    else { const g = new L({ levels: 5 }); const gone = { control: ['lock', 'force'], flipGuard: ['resetGuard'], stats: [] }[part] || []; note(gone.every(k => g[k] === undefined) && (part === 'stats' ? g.average === undefined : true) && (['control', 'flipGuard', 'stats'].includes(part) || typeof g.lock === 'function'), 'quality-governor without ' + part + ': the surface is what is left', JSON.stringify(Object.getOwnPropertyNames(L.prototype))); }
  } catch (e) { note(false, file + ' without ' + part, e.stack.slice(0, 500)); }
}

// (3) what the full files do differently from Fancy's code, on these series (information; the lean builds above remove the differences)
{
  const r = compare(F, FULL['even-dt'], FULL['quality-governor'], series);
  note(true, 'for the record, the FULL files against Fancy\'s code: even-dt differs on ' + r.evenDiffs + ' of ' + r.evenFrames + ' frame steps (' + r.evenSeriesDiffering + ' of ' + series.length + ' series; mostly by tiny fractions of a millisecond, from re-taking the median every 8th frame instead of every frame); the governor differs in ' + r.govDiffs + ' of ' + r.govRuns + ' runs');
}
console.log('frame-kit lean builds: ' + (cases - bad) + ' of ' + cases + ' pass, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
