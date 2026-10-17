#!/usr/bin/env node
/* Checks the lean builds of wake-keeper. Copyright (c) 2026 LFC Foundry. MIT License.
 * lean.py writes each build; Node loads it with a fake navigator, document and clock; then the situation table in tests/small-lean-battery.js (run starts, tab hidden, tab back, run ends,
 * request refused with an 8 s wait, lock released by the browser, no wake lock) must pass on: the full file, Fancy Banana's set of cuts (all four parts), each part cut on its own,
 * and the set with comments removed. Also: the parts that were cut are really gone from the surface, and Fancy's set has no timer at all.
 * Run: node modules/wake-keeper/test/lean.js   (needs python3; about 3 s) */
'use strict';
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const dir = path.join(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wakekeeper-lean-'));
const S = require('../../../tests/small-lean-battery.js');
const PARTS = ['idle', 'status', 'callbacks', 'inject'];
const py = (...a) => cp.spawnSync('python3', [path.join(dir, 'lean.py'), ...a], { encoding: 'utf8' });
let bad = 0, cases = 0, n = 0;
const note = (ok, what, why) => { cases++; if (!ok) bad++; console.log((ok ? 'ok   ' : 'FAIL ') + what + (ok ? '' : '\n       ' + why)); };
const build = (without, nc) => { const out = path.join(tmp, 'wk-' + (++n) + '.js'), r = py('--without', without.join(','), '-o', out, ...(nc ? ['--no-comments'] : [])); assert.strictEqual(r.status, 0, r.stderr); new (require('vm').Script)(fs.readFileSync(out, 'utf8'), { filename: out }); return require(out); };
(async () => {
  const t0 = Date.now(), l = py('--list').stdout.split('\n').filter(Boolean).map(s => s.split(/\s+/)[0]);
  note(JSON.stringify(l) === JSON.stringify(PARTS), 'the parts are ' + PARTS.join(', '), l.join(','));
  const u = py('--without', 'nope', '-o', path.join(tmp, 'x.js'));
  note(u.status !== 0 && /unknown part/.test(u.stderr), 'an unknown part name is refused', u.stderr);
  const variants = [['the full file', require('../wake-keeper.js')], ["Fancy's set (all four parts cut)", build(PARTS, false)], ["Fancy's set, no comments", build(PARTS, true)]].concat(PARTS.map(p => ['without ' + p, build([p], false)]));
  for (const [name, M] of variants) {
    const rows = await S.wakeKeeperRows(M, S.nodeEnv(global));
    note(rows.length === 7 && rows.every(r => r.result === 'ok'), name + ': ' + rows.map(r => r.result).join(', ') + ' (7 situations)', rows.filter(r => r.result !== 'ok').map(r => r.situation + ': ' + r.note).join('; '));
  }
  // surface of the cuts
  const k = (parts, o) => build(parts, false).create(o || {});
  const has = (obj, ...ks) => ks.map(x => x in obj);
  note(has(k(['idle']), 'poke', 'watchInput', 'idle').every(x => !x) && has(k(['status']), 'held', 'refusals').every(x => !x), 'without idle: poke, watchInput and idle are gone; without status: held and refusals are gone', 'surface');
  note(has(k([]), 'poke', 'watchInput', 'idle', 'held', 'refusals').every(x => x) && has(k(PARTS), 'want', 'destroy', 'supported').every(x => x) && has(k(PARTS), 'poke', 'held').every(x => !x), 'the full surface is there with nothing cut; Fancy\'s set keeps want, destroy and supported only', 'surface');
  // callbacks cut: a refusal does not call onRefused; callbacks kept: it does
  const wk = (parts) => new Promise(res => {
    const seen = [], old = Object.getOwnPropertyDescriptor(global, 'navigator');
    const nav = { wakeLock: { request: () => Promise.reject(new Error('no')) } };
    Object.defineProperty(global, 'navigator', { configurable: true, writable: true, value: nav });
    const doc = Object.getOwnPropertyDescriptor(global, 'document'); global.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
    const x = build(parts, false).create(parts.includes('inject') ? {} : { nav, doc: global.document, onRefused: () => seen.push(1) });
    x.want(true);
    setTimeout(() => { x.destroy(); if (old) Object.defineProperty(global, 'navigator', old); else delete global.navigator; delete global.document; res(seen.length); }, 30);
  });
  note((await wk(['callbacks'])) === 0 && (await wk(['status'])) === 1, 'without callbacks, onRefused is not called; with it kept, it is called once', 'callbacks');
  console.log('wake-keeper lean builds: ' + (cases - bad) + ' of ' + cases + ' pass, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(bad ? 1 : 0);
})();
