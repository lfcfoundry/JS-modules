#!/usr/bin/env node
/* tab-guard checks that need no browser. Plain Node (18+), no packages. Copyright (c) 2026 LFC Foundry. MIT License.
 * Run:  node modules/tab-guard/test/run.js          (exit code 1 on any failure)
 *
 * A small fake navigator.locks stands in for the browser: request(name, [options], callback) with ifAvailable, steal and
 * signal (abort of a waiting request), a queue per name, callbacks run asynchronously, and a stolen lock rejects its request
 * with an AbortError. It is a model of the spec, not the real thing: the real-browser checks are in test/run.py (Chromium
 * and Firefox). "Regression" checks pass on the current file and, when git can show the version from before the fixes, must
 * FAIL on it. Set OLD_REF to compare with another commit, or OLD_REF=none to skip.
 */
'use strict';
const assert = require('assert'), path = require('path'), cp = require('child_process');
const TG = require('../tab-guard.js');

const OLD_REF = process.env.OLD_REF || '4271ecb28a068f29d6e0dec43ee92f3b87ced050';
let OLD = null;
if (OLD_REF !== 'none') {
  try {
    const repo = path.resolve(__dirname, '..', '..', '..');
    const src = cp.execFileSync('git', ['-C', repo, 'show', OLD_REF + ':modules/tab-guard/tab-guard.js'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = { exports: {} };
    new Function('module', src)(m);
    OLD = m.exports;
    if (typeof OLD.start !== 'function') OLD = null;
  } catch (e) { OLD = null; }
}

let pass = 0, fail = 0, caught = 0, oldTried = 0;
async function test(name, fn) {
  try { await fn(TG); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n       ')); }
}
async function regress(name, fn) {
  try { await fn(TG); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n       ')); return; }
  if (!OLD) { pass++; console.log('  ok   ' + name + '   (old file not available, so not compared)'); return; }
  oldTried++;
  let oldFailed = false;
  try { await fn(OLD); } catch (e) { oldFailed = true; }
  if (oldFailed) { pass++; caught++; console.log('  ok   ' + name + '   (fails on the old file, as it should)'); }
  else { fail++; console.log('  FAIL ' + name + '\n       the check also passes on the old file, so it does not catch the defect'); }
}
const settle = (ms) => new Promise((r) => setTimeout(r, ms || 30));
const err = (name, msg) => { const e = new Error(msg || name); e.name = name; return e; };

// ---- a fake navigator.locks -------------------------------------------------------------------------------------------------
function makeLocks() {
  const held = new Map(), queues = new Map();
  const w = { steals: 0, requests: 0, rejectAll: null, throwAll: null,
    isHeld: (n) => held.has(n || 'g'), waiting: (n) => (queues.get(n || 'g') || []).length,
    forceEnd(n) { const h = held.get(n || 'g'); if (h) { h.state = 'done'; held.delete(h.name); h.resolve(); pump(h.name); } },   // lock ends without its holder asking
    request };
  function pump(name) { if (held.has(name)) return; const q = queues.get(name) || []; const next = q.shift(); if (next) grant(next); }
  function release(req) { if (held.get(req.name) === req) { held.delete(req.name); req.state = 'done'; pump(req.name); } }
  function grant(req) {
    held.set(req.name, req); req.state = 'held';
    Promise.resolve().then(() => {
      if (req.state !== 'held') return;                       // stolen before the callback ran
      let result;
      try { result = req.cb({ name: req.name, mode: 'exclusive' }); } catch (e) { release(req); req.reject(e); return; }
      Promise.resolve(result).then((v) => { release(req); req.resolve(v); }, (e) => { release(req); req.reject(e); });
    });
  }
  function request(name, a, b) {
    w.requests++;
    if (w.throwAll) throw w.throwAll;
    const opts = typeof a === 'function' ? {} : (a || {}), cb = typeof a === 'function' ? a : b;
    return new Promise((resolve, reject) => {
      if (w.rejectAll) { Promise.resolve().then(() => reject(w.rejectAll)); return; }
      const req = { name, cb, resolve, reject, state: 'pending' };
      if (opts.signal && opts.signal.aborted) { reject(err('AbortError')); return; }
      const q = queues.get(name) || (queues.set(name, []), queues.get(name));
      if (opts.steal) {
        w.steals++;
        const h = held.get(name);
        if (h) { h.state = 'stolen'; held.delete(name); h.reject(err('AbortError', 'stolen')); }
        grant(req);
      } else if (!held.has(name) && !q.length) grant(req);
      else if (opts.ifAvailable) Promise.resolve().then(() => { try { resolve(cb(null)); } catch (e) { reject(e); } });
      else {
        q.push(req);
        if (opts.signal) opts.signal.addEventListener('abort', () => { const i = q.indexOf(req); if (i >= 0) { q.splice(i, 1); req.state = 'aborted'; reject(err('AbortError')); } });
      }
    });
  }
  return w;
}
const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), secDesc = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext');
function setNav(v) { Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true, writable: true }); }
function restore() {
  if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc); else delete globalThis.navigator;
  if (secDesc) Object.defineProperty(globalThis, 'isSecureContext', secDesc); else delete globalThis.isSecureContext;
}
// A "copy" of the page: its own event log around TabGuard.start, all sharing one fake lock manager.
function copy(K, extra) {
  const c = { log: [] };
  const o = { name: 'g', retryMs: 15,
    onClaimed() { c.log.push('claimed'); }, onTwin() { c.log.push('twin'); }, onTakeOver() { c.log.push('takeover'); },
    onFree() { c.log.push('free'); }, onUnavailable(e) { c.log.push('unavailable:' + (e && e.name)); } };
  Object.assign(o, extra || {});
  c.g = K.start(o);
  return c;
}
const count = (c, what) => c.log.filter((x) => x === what).length;

(async () => {
  console.log('tab-guard (node, fake navigator.locks)' + (OLD ? '   [old file for comparison: ' + OLD_REF.slice(0, 8) + ']' : '   [no old file for comparison]'));

  // ---------- the original behavior still works ----------
  await test('first copy claims, second becomes a twin after the retry, first hears nothing', async (K) => {
    setNav({ locks: makeLocks() });
    const a = copy(K); await settle(10);
    assert.deepStrictEqual(a.log, ['claimed']); assert.ok(a.g.holding && !a.g.twin && a.g.supported);
    const b = copy(K); await settle(8);
    assert.deepStrictEqual(b.log, [], 'not yet: the retry has not run');
    await settle(40);
    assert.deepStrictEqual(b.log, ['twin']); assert.ok(!b.g.holding && b.g.twin);
    assert.deepStrictEqual(a.log, ['claimed']);
  });
  await test('a different name is guarded separately', async (K) => {
    setNav({ locks: makeLocks() });
    const a = copy(K, { name: 'one' }), b = copy(K, { name: 'two' }); await settle(40);
    assert.deepStrictEqual(a.log, ['claimed']); assert.deepStrictEqual(b.log, ['claimed']);
  });
  await test('takeOver steals: the new copy hears onTakeOver, the old one hears onTwin once', async (K) => {
    setNav({ locks: makeLocks() });
    const a = copy(K); await settle(10); const b = copy(K); await settle(40);
    b.g.takeOver(); await settle(20);
    assert.deepStrictEqual(b.log, ['twin', 'takeover']); assert.ok(b.g.holding && !b.g.twin);
    assert.deepStrictEqual(a.log, ['claimed', 'twin']); assert.ok(!a.g.holding && a.g.twin);
  });
  await test('stop() gives the lock back, so a fresh copy claims at once', async (K) => {
    const w = makeLocks(); setNav({ locks: w });
    const a = copy(K); await settle(10); a.g.stop(); await settle(10);
    assert.ok(!w.isHeld());
    const b = copy(K); await settle(10); assert.deepStrictEqual(b.log, ['claimed']);
  });
  await test('a callback that throws does not break the guard', async (K) => {
    setNav({ locks: makeLocks() });
    const a = copy(K, { onClaimed() { throw new Error('page bug'); } }); await settle(10);
    assert.ok(a.g.holding);
    const b = copy(K, { onTwin() { throw new Error('page bug'); } }); await settle(40);
    assert.ok(b.g.twin);
  });
  await test('no Web Locks: supported is false, the reason says why, and nothing is called', async (K) => {
    setNav({}); delete globalThis.isSecureContext;
    let a = copy(K); await settle(10);
    assert.strictEqual(a.g.supported, false); assert.strictEqual(a.g.reason, 'no-web-locks'); assert.deepStrictEqual(a.log, []);
    assert.doesNotThrow(() => { a.g.takeOver(); a.g.stop(); });
    Object.defineProperty(globalThis, 'isSecureContext', { value: false, configurable: true, writable: true });   // plain http on a home network
    a = copy(K); assert.strictEqual(a.g.reason, 'insecure-context'); assert.strictEqual(a.g.supported, false);
    setNav(undefined); a = copy(K); assert.strictEqual(a.g.supported, false);
    restore();
  });

  // ---------- 1. only a real steal is a twin ----------
  await regress('a SecurityError or InvalidStateError is not a twin: the guard is unavailable and saving can go on', async (K) => {
    for (const name of ['SecurityError', 'InvalidStateError', 'NotSupportedError']) {
      const w = makeLocks(); w.rejectAll = err(name); setNav({ locks: w });
      const calls = [];
      const a = copy(K, { onUnavailable(e) { calls.push(e.name); } }); await settle(40);
      assert.strictEqual(count(a, 'twin'), 0, name + ': onTwin must not fire');
      assert.deepStrictEqual(calls, [name]);
      assert.strictEqual(a.g.supported, false); assert.strictEqual(a.g.reason, name); assert.strictEqual(a.g.twin, false);
    }
  });
  await regress('request() that throws at once also reports the guard as unavailable', async (K) => {
    const w = makeLocks(); w.throwAll = err('SecurityError'); setNav({ locks: w });
    const a = copy(K); await settle(40);
    assert.strictEqual(count(a, 'twin'), 0); assert.deepStrictEqual(a.log, ['unavailable:SecurityError']); assert.strictEqual(a.g.supported, false);
  });
  await test('after the guard is unavailable, takeOver() and stop() are harmless and nothing else is called', async (K) => {
    const w = makeLocks(); w.rejectAll = err('SecurityError'); setNav({ locks: w });
    const a = copy(K); await settle(40); const n = w.requests;
    a.g.takeOver(); a.g.stop(); await settle(20);
    assert.strictEqual(w.requests, n); assert.deepStrictEqual(a.log, ['unavailable:SecurityError']);
  });
  await test('a steal that really happens (AbortError) is still a twin', async (K) => {
    setNav({ locks: makeLocks() });
    const a = copy(K); await settle(10); const b = copy(K); await settle(40); b.g.takeOver(); await settle(20);
    assert.strictEqual(count(a, 'twin'), 1); assert.strictEqual(a.log.some((x) => /unavailable/.test(x)), false);
  });
  await test('a lock that ends without its holder asking (and without an error) counts as taken', async (K) => {
    const w = makeLocks(); setNav({ locks: w });
    const a = copy(K); await settle(10); w.forceEnd(); await settle(20);
    assert.deepStrictEqual(a.log, ['claimed', 'twin', 'free']);   // it was taken, and the lock is already free again
    assert.ok(!a.g.holding && a.g.twin);
  });

  // ---------- 2. takeOver() on the copy already in charge ----------
  await regress('takeOver() on the copy that is already in charge does nothing', async (K) => {
    const w = makeLocks(); setNav({ locks: w });
    const a = copy(K); await settle(10);
    a.g.takeOver(); a.g.takeOver(); await settle(20);
    assert.strictEqual(w.steals, 0, 'no steal request should be sent');
    assert.deepStrictEqual(a.log, ['claimed']); assert.ok(a.g.holding && !a.g.twin);
  });
  await regress('two takeOver() calls in a row send one steal and do not knock the new copy out', async (K) => {
    const w = makeLocks(); setNav({ locks: w });
    const a = copy(K); await settle(10); const b = copy(K); await settle(40);
    b.g.takeOver(); b.g.takeOver(); await settle(20);
    b.g.takeOver(); await settle(20);                       // and once more after it won
    assert.strictEqual(w.steals, 1);
    assert.deepStrictEqual(b.log, ['twin', 'takeover']); assert.ok(b.g.holding && !b.g.twin);
  });

  // ---------- 3. onFree ----------
  await regress('onFree: the copy that lost is told when the other copy closes', async (K) => {
    const w = makeLocks(); setNav({ locks: w });
    const a = copy(K); await settle(10); const b = copy(K); await settle(40);
    assert.strictEqual(count(b, 'free'), 0, 'not while the other copy is still there');
    a.g.stop(); await settle(20);
    assert.strictEqual(count(b, 'free'), 1); assert.strictEqual(b.g.free, true);
    assert.ok(b.g.twin && !b.g.holding, 'it is told, but not put in charge by itself');
  });
  await test('onFree hands the lock back, so a freshly opened copy can still claim it', async (K) => {
    const w = makeLocks(); setNav({ locks: w });
    const a = copy(K); await settle(10); const b = copy(K); await settle(40);
    a.g.stop(); await settle(20);
    assert.ok(!w.isHeld(), 'the waiting request must not keep the lock');
    const c = copy(K); await settle(10); assert.deepStrictEqual(c.log, ['claimed']);
  });
  await test('after onFree the player can say yes: takeOver() puts this copy in charge', async (K) => {
    const w = makeLocks(); setNav({ locks: w });
    const a = copy(K); await settle(10); const b = copy(K); await settle(40);
    a.g.stop(); await settle(20); b.g.takeOver(); await settle(20);
    assert.deepStrictEqual(b.log, ['twin', 'free', 'takeover']); assert.ok(b.g.holding && !b.g.twin && !b.g.free);
  });
  await test('onFree also works for a copy that was pushed out by a takeOver', async (K) => {
    const w = makeLocks(); setNav({ locks: w });
    const a = copy(K); await settle(10); const b = copy(K); await settle(40);
    b.g.takeOver(); await settle(20);
    assert.deepStrictEqual(a.log, ['claimed', 'twin']);
    b.g.stop(); await settle(20);
    assert.deepStrictEqual(a.log, ['claimed', 'twin', 'free']);
  });
  await test('only one waiting request per copy, even after losing twice; onFree fires once per loss', async (K) => {
    const w = makeLocks(); setNav({ locks: w });
    const a = copy(K); await settle(10); const b = copy(K); await settle(40);
    assert.strictEqual(w.waiting(), 1);
    b.g.takeOver(); await settle(20);
    assert.strictEqual(w.waiting(), 1, 'a (pushed out) waits; b\'s own waiting request was cancelled');
    a.g.takeOver(); await settle(20);
    assert.strictEqual(w.waiting(), 1);
    assert.deepStrictEqual(a.log, ['claimed', 'twin', 'takeover']); assert.deepStrictEqual(b.log, ['twin', 'takeover', 'twin']);
    a.g.stop(); await settle(20);
    assert.strictEqual(count(b, 'free'), 1); assert.strictEqual(count(a, 'free'), 0);
  });
  await test('a copy that took over is not told "free" when it later closes (its waiting request was cancelled)', async (K) => {
    const w = makeLocks(); setNav({ locks: w });
    const a = copy(K); await settle(10); const b = copy(K); await settle(40);
    b.g.takeOver(); await settle(20); b.g.stop(); await settle(20);
    assert.strictEqual(count(b, 'free'), 0);
  });
  await test('stop() cancels the waiting request: no onFree after stop()', async (K) => {
    const w = makeLocks(); setNav({ locks: w });
    const a = copy(K); await settle(10); const b = copy(K); await settle(40);
    b.g.stop(); assert.strictEqual(w.waiting(), 0);
    a.g.stop(); await settle(20);
    assert.strictEqual(count(b, 'free'), 0); assert.ok(!w.isHeld());
  });
  await test('stop() during the start-up retry means no later onTwin and no timer left running', async (K) => {
    const w = makeLocks(); setNav({ locks: w });
    const a = copy(K); await settle(10); const b = copy(K); await settle(3);
    b.g.stop(); await settle(50);
    assert.deepStrictEqual(b.log, []); assert.strictEqual(w.waiting(), 0);
  });
  await test('without onFree set, losing and being freed is harmless', async (K) => {
    const w = makeLocks(); setNav({ locks: w });
    const a = copy(K); await settle(10); const b = copy(K, { onFree: undefined }); await settle(40);
    a.g.stop(); await settle(20); assert.strictEqual(b.g.free, true);
  });

  restore();
  const extra = OLD ? '; the old file was caught by ' + caught + ' of ' + oldTried + ' regression checks' : '; old file not available for comparison';
  console.log('tab-guard: ' + pass + ' passed, ' + fail + ' failed' + extra);
  process.exit(fail ? 1 : 0);
})().catch((e) => { restore(); console.log('tab-guard: crashed: ' + (e && e.stack || e)); process.exit(1); });
