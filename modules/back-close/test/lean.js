#!/usr/bin/env node
/* Checks the lean builds of back-close. Copyright (c) 2026 LFC Foundry. MIT License.
 * lean.py writes each build; Node loads it with a fake CloseWatcher; then the situation table in tests/small-lean-battery.js (panel opens, closes by its own button, back swipe closes the
 * newest panel and the other stays closable, no CloseWatcher) must pass on: the full file, Fancy Banana's set of cuts (all four parts), each part cut on its own, and the set with comments removed.
 * Run: node modules/back-close/test/lean.js   (needs python3; about 1 s) */
'use strict';
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const dir = path.join(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backclose-lean-'));
const S = require('../../../tests/small-lean-battery.js');
const PARTS = ['history', 'element', 'closeRoute', 'supported'];
const py = (...a) => cp.spawnSync('python3', [path.join(dir, 'lean.py'), ...a], { encoding: 'utf8' });
let bad = 0, cases = 0, n = 0;
const note = (ok, what, why) => { cases++; if (!ok) bad++; console.log((ok ? 'ok   ' : 'FAIL ') + what + (ok ? '' : '\n       ' + why)); };
const build = (without, nc) => { const out = path.join(tmp, 'bc-' + (++n) + '.js'), r = py('--without', without.join(','), '-o', out, ...(nc ? ['--no-comments'] : [])); assert.strictEqual(r.status, 0, r.stderr); cp.execFileSync(process.execPath, ['--check', out]); return require(out); };
(async () => {
  const t0 = Date.now(), l = py('--list').stdout.split('\n').filter(Boolean).map(s => s.split(/\s+/)[0]);
  note(JSON.stringify(l) === JSON.stringify(PARTS), 'the parts are ' + PARTS.join(', '), l.join(','));
  const u = py('--without', 'nope', '-o', path.join(tmp, 'x.js'));
  note(u.status !== 0 && /unknown part/.test(u.stderr), 'an unknown part name is refused', u.stderr);
  const variants = [['the full file', require('../back-close.js')], ["Fancy's set (all four parts cut)", build(PARTS, false)], ["Fancy's set, no comments", build(PARTS, true)]].concat(PARTS.map(p => ['without ' + p, build([p], false)]));
  for (const [name, M] of variants) {
    const rows = await S.backCloseRows(M, S.nodeEnv(global));
    note(rows.length === 4 && rows.every(r => r.result === 'ok'), name + ': ' + rows.map(r => r.result).join(', ') + ' (4 situations)', rows.filter(r => r.result !== 'ok').map(r => r.situation + ': ' + r.note).join('; '));
  }
  // with no CloseWatcher at all, the three that need one say so
  const none = await S.backCloseRows(build(PARTS, false), S.nodeEnv(global, false));
  note(none[0].result === 'ok' && none.slice(1).every(r => r.result === 'not available'), 'a browser without CloseWatcher: the no-CloseWatcher row passes and the other three say "not available"', none.map(r => r.result).join(','));
  // the surface of the cuts
  const full = require('../back-close.js'), fancy = build(PARTS, false);
  note(typeof fancy.watchWhen === 'function' && fancy.watch === undefined && fancy.supported === undefined && full.watch && full.supported !== undefined, "Fancy's set keeps watchWhen only; the full file has watch and supported", Object.keys(fancy).join(','));
  const h = fancy.watchWhen(() => false, () => {});
  note(h.close() === false && typeof h.sync === 'function' && typeof h.destroy === 'function' && h.supported === (typeof CloseWatcher === 'function'), 'handle.sync, destroy and supported are kept; close() does nothing and returns false', JSON.stringify(Object.keys(h)));
  console.log('back-close lean builds: ' + (cases - bad) + ' of ' + cases + ' pass, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(bad ? 1 : 0);
})();
