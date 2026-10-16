/* Node-only tests for fuzz-kit: the engine itself (no browser), the input helpers (against a tiny fake page), the in-page driver, the Puppeteer
   runner's own logic (against a fake page that really runs the engine inside a vm), the test-hook stripper and the after-build check.
   Copyright (c) 2026 LFC Foundry. MIT License.
   Run: node tools/fuzz-kit/test/run.js */
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm'), os = require('os'), cp = require('child_process'), EventEmitter = require('events');
const CORE_PATH = process.env.FUZZ_CORE_UNDER_TEST || path.join(__dirname, '..', 'src', 'fuzz-core.js');   // (the variable lets the same checks run against an older engine, to prove they fail there)
const Fuzzer = require(CORE_PATH);
const strip = require(path.join(__dirname, '..', 'tools', 'strip-test-hooks.js'));
const checkShipped = require(path.join(__dirname, '..', 'tools', 'check-shipped.js'));
const sleep = (ms) => new Promise(res => setTimeout(res, ms));
let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) pass++; else { fail++; console.log('FAIL ' + name + (extra ? ' ' + JSON.stringify(extra) : '')); } }
const S = '/*TEST_HOOK_START*/', E = '/*TEST_HOOK_END*/';

(async () => {
  // a pure-JS counter app with a planted bug: 'spend' with 3 or fewer coins goes below zero
  function makeApp(bug) { const a = { n: 0, state: 'a', stuck: false }; a.add = () => { a.n += 1; }; a.spend = () => { if (a.n >= 4 || (bug && a.n > 0)) a.n -= 4; }; a.reset = () => { a.n = 0; a.state = 'a'; a.stuck = false; }; return a; }
  function cfgFor(app, seed, extra) {
    return Object.assign({ seed, errors: false,
      ops: [{ name: 'add', weight: 5, run: () => app.add() }, { name: 'spend', weight: 3, run: () => app.spend() }, { name: 'noop', weight: 1, run: () => { } }],
      invariants: [() => app.n >= 0 ? '' : 'n is negative: ' + app.n], state: () => app.state, afterFail: () => app.reset() }, extra || {});
  }
  // 1. a clean app passes; a buggy app is caught, with the tail
  let r = await new Fuzzer(cfgFor(makeApp(false), 1)).run(500);
  check('clean app: no findings', r.fails.length === 0 && r.ops === 500, r);
  r = await new Fuzzer(cfgFor(makeApp(true), 1)).run(500);
  check('planted bug is found', r.fails.length > 0 && /negative/.test(r.fails[0].what), r.fails[0]);
  check('a finding carries the tail ending in the op that broke it', r.fails[0].tail[r.fails[0].tail.length - 1] === r.fails[0].op && r.fails[0].tail.length <= 40);
  check('the failing op is spend', r.fails[0].op === 'spend');
  // 2. determinism: the same seed gives exactly the same result; a different seed differs
  const r1 = JSON.stringify(await new Fuzzer(cfgFor(makeApp(true), 5)).run(300)), r2 = JSON.stringify(await new Fuzzer(cfgFor(makeApp(true), 5)).run(300)), r3 = JSON.stringify(await new Fuzzer(cfgFor(makeApp(true), 6)).run(300));
  check('same seed, same result', r1 === r2); check('different seed, different result', r1 !== r3);
  // 3. stopAt rebuilds the state at a failure (the op index is in the finding)
  const f0 = (await new Fuzzer(cfgFor(makeApp(true), 5)).run(300)).fails[0], app2 = makeApp(true);
  await new Fuzzer(cfgFor(app2, 5, { afterFail: () => { } })).run(300, { stopAt: f0.i });
  check('stopAt: the app is in the failing state at that index', app2.n < 0, { i: f0.i, n: app2.n });
  // 4. weights: an op with weight 0 never runs; weights bias the mix
  const seen = {}; await new Fuzzer({ seed: 3, errors: false, ops: [{ name: 'a', weight: 9, run: () => { seen.a = (seen.a || 0) + 1; } }, { name: 'b', weight: 1, run: () => { seen.b = (seen.b || 0) + 1; } }, { name: 'never', weight: 0, run: () => { seen.never = 1; } }] }).run(2000);
  check('weights: a weight-0 op never runs', !seen.never); check('weights: the mix follows the weights', seen.a > seen.b * 5 && seen.b > 100, seen);
  // 5. an op that throws is a finding, not a crash; invariants that throw are findings too; async ops are awaited
  r = await new Fuzzer({ seed: 1, errors: false, ops: [{ name: 'boom', run: () => { throw new Error('kaboom'); } }], maxFails: 2 }).run(10);
  check('a throwing op becomes a finding', r.fails.length === 2 && /kaboom/.test(r.fails[0].what), r);
  r = await new Fuzzer({ seed: 1, errors: false, ops: [{ name: 'x', run: () => { } }], invariants: [() => { throw new Error('inv'); }], maxFails: 1 }).run(5);
  check('a throwing invariant becomes a finding', r.fails.length === 1 && /invariant threw/.test(r.fails[0].what), r);
  let order = []; await new Fuzzer({ seed: 1, errors: false, ops: [{ name: 'slow', run: async () => { await new Promise(res => setTimeout(res, 5)); order.push('done'); } }], invariants: [() => { order.push('inv'); return ''; }] }).run(3);
  check('async ops are awaited before the invariants run', order.join() === 'done,inv,done,inv,done,inv', order);
  // 6. liveness: a stuck app is reported; a moving app is not
  const app3 = makeApp(false); let ticks = 0;
  r = await new Fuzzer({ seed: 2, errors: false, ops: [{ name: 'wedge', run: () => { app3.stuck = true; } }], liveness: { every: 5, tries: 10, signature: () => app3.stuck ? 'stuck' : ++ticks, nudge: () => { } }, maxFails: 1 }).run(20);
  check('liveness: a wedged app is reported', r.fails.length === 1 && r.fails[0].op === 'liveness' && /no progress/.test(r.fails[0].what), r);
  r = await new Fuzzer({ seed: 2, errors: false, ops: [{ name: 'x', run: () => { } }], liveness: { every: 5, tries: 10, signature: () => ticks, nudge: () => { ticks++; } } }).run(20);
  check('liveness: an app that moves on nudges is fine', r.fails.length === 0, r);
  // 7. 'before' captures a value passed to the invariants (for "must only grow" checks)
  let regress = 0; const app4 = { n: 5 };
  r = await new Fuzzer({ seed: 1, errors: false, ops: [{ name: 'down', run: () => { app4.n--; } }], before: () => app4.n, invariants: [(c, pre) => app4.n < pre ? 'went backwards ' + pre + ' -> ' + app4.n : ''], maxFails: 1 }).run(3);
  check("'before' gives invariants the previous value", r.fails.length === 1 && /went backwards 5 -> 4/.test(r.fails[0].what), r);
  // 8. periodic hooks run on schedule, and a throwing one is a finding
  let periodic = 0; await new Fuzzer({ seed: 1, errors: false, ops: [{ name: 'x', run: () => { } }], every: [{ n: 10, run: () => { periodic++; } }] }).run(100);
  check('periodic hooks run every n ops', periodic === 10, periodic);
  // 8b. shrinking: a failing run is cut down to the few operations that matter, and the short script replays to the same failure
  {
    const holder = { app: null };
    const make = () => { holder.app = makeApp(true); return new Fuzzer(cfgFor(holder.app, 11, { afterFail: () => holder.app.reset() })); };
    const rec = await make().run(400, { perOp: true });
    check('perOp: a run records a script as long as the run', rec.script && rec.script.length === rec.ops && rec.fails.length > 0, { ops: rec.ops, n: rec.script && rec.script.length });
    const again = await make().run(0, { script: rec.script });
    check('replaying the whole script finds the same first failure', again.fails[0] && again.fails[0].i === rec.fails[0].i && again.fails[0].what === rec.fails[0].what, [again.fails[0], rec.fails[0]]);
    const sh = await Fuzzer.shrink(make, rec.script);
    check('shrink: a long script is cut to a handful of operations', sh.script.length <= 3 && sh.script.length < sh.from, { from: sh.from, to: sh.script.length, tries: sh.tries });
    check('shrink: the short script still fails the same way', sh.finding && /negative/.test(sh.finding.what) && sh.finding.op === 'spend', sh.finding);
    check('shrink: the short script is add then spend (the least that breaks the planted bug)', sh.script.map(e => e.op).join() === 'add,spend', sh.script.map(e => e.op));
    const sh2 = await Fuzzer.shrink(make, rec.script);
    check('shrink: same input, same output', JSON.stringify(sh.script) === JSON.stringify(sh2.script));
    const clean = await Fuzzer.shrink(() => new Fuzzer(cfgFor(makeApp(false), 11)), rec.script);
    check('shrink: a script that does not fail says so and changes nothing', clean.finding === null && clean.script.length === rec.script.length && /does not fail/.test(clean.note), clean.note);
    const a1 = await new Fuzzer(cfgFor(makeApp(true), 3)).run(300), a2 = await new Fuzzer(cfgFor(makeApp(true), 3)).run(300);
    check('the normal (not perOp) run is unchanged and has no script', !a1.script && JSON.stringify(a1) === JSON.stringify(a2));
  }
  // 9. test hook stripping
  const code = 'a();\n' + S + 'window.__t = 1;' + E + '\nb();' + S + 'x' + E;
  check('hooks are removed, the rest kept', strip(code) === 'a();\n\nb();', strip(code));
  check('no hooks: unchanged', strip('plain') === 'plain');
  const throws = (f) => { try { f(); return false; } catch (e) { return true; } };
  check('missing END is refused', throws(() => strip('a' + S + 'b'))); check('stray END is refused', throws(() => strip('a' + E))); check('nested START is refused', throws(() => strip(S + 'a' + S + 'b' + E + E)));
  // ===== engine fixes from the 2026-10-15 audit. Each section reports a FAIL (instead of crashing the file) if the engine under test cannot do it. =====
  async function section(name, fn) { try { await fn(); } catch (e) { check(name + ': section ran without throwing', false, String(e && e.stack || e).slice(0, 300)); } }

  await section('compat', async () => {
    const ref = (a) => function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    let same = true;
    [0, 1, 7, -3, 123456789, 2 ** 31, 2 ** 40 + 5, 1.9, NaN, null].forEach(sd => { const a = ref(sd), b = Fuzzer.mulberry32(sd); for (let k = 0; k < 300; k++) if (a() !== b()) same = false; });
    check('numeric seeds give exactly the stream they always gave', same);
    const seen = []; await new Fuzzer({ seed: 5, errors: false, ops: [{ name: 'x', run: (c) => { seen.push(c.rand()); } }] }).run(20);
    const rr = ref(5), expect = []; for (let k = 0; k < 20; k++) { rr(); expect.push(rr()); }
    check('a plain run still draws the same numbers (choose, then the op)', JSON.stringify(seen) === JSON.stringify(expect));
    if (Fuzzer._imulPoly) { let eq = true; const ri = () => (Math.random() * 4294967296) | 0; for (let k = 0; k < 3000; k++) { const a = ri(), b = ri(); if (Fuzzer._imulPoly(a, b) !== Math.imul(a, b)) eq = false; } check('the ES5 multiply gives the same answers as Math.imul', eq); }
    else check('the ES5 multiply gives the same answers as Math.imul', false, 'no Fuzzer._imulPoly');
  });

  await section('async hooks', async () => {
    let unhandled = 0; const onU = () => { unhandled++; }; process.on('unhandledRejection', onU);
    let done = 0;
    let r = await new Fuzzer({ seed: 1, errors: false, ops: [{ name: 'x', run: () => { } }], every: [{ n: 5, run: async () => { await sleep(20); done++; } }] }).run(10);
    check('an async periodic hook is awaited before the run ends', done === 2 && r.fails.length === 0, { done, fails: r.fails });
    r = await new Fuzzer({ seed: 1, errors: false, ops: [{ name: 'x', run: () => { } }], every: [{ name: 'save-check', n: 5, run: async () => { await sleep(5); throw new Error('async hook broke'); } }], maxFails: 2 }).run(30);
    await sleep(30);
    check('a throw inside an async hook becomes a finding named after the hook', r.fails.length === 2 && r.fails[0].op === 'save-check' && /async hook broke/.test(r.fails[0].what), r.fails);
    check('...and it is not an unhandled rejection', unhandled === 0, unhandled);
    r = await new Fuzzer({ seed: 1, errors: false, ops: [{ name: 'x', run: () => { } }], every: [{ n: 4, run: () => { throw new Error('sync hook broke'); } }], maxFails: 3 }).run(100);
    check('a sync throwing hook is a finding and the run stops at maxFails', r.fails.length === 3 && r.ops === 12, { n: r.fails.length, ops: r.ops });
    process.off('unhandledRejection', onU);
  });

  await section('record and shrink from a plain failure', async () => {
    const holder = { app: null };
    const make = () => { holder.app = makeApp(true); return new Fuzzer(cfgFor(holder.app, 11, { afterFail: () => holder.app.reset() })); };
    const plain = await make().run(400), rec = await make().run(400, { record: true });
    const noScript = Object.assign({}, rec); delete noScript.script;
    check('record: the run is exactly the plain run (same findings, same count), plus a script', JSON.stringify(noScript) === JSON.stringify(plain) && rec.script && rec.script.length === rec.ops, { plain: plain.ops, rec: rec.ops });
    const again = await make().run(0, { script: rec.script });
    check('record: replaying the script gives the same first finding as the plain run', again.fails[0] && again.fails[0].i === plain.fails[0].i && again.fails[0].what === plain.fails[0].what, [again.fails[0], plain.fails[0]]);
    const sh = await Fuzzer.shrink(make, rec.script);
    check('a failure found by a PLAIN seed shrinks to add, spend', sh.script.map(e => e.op).join() === 'add,spend' && /negative/.test(sh.finding.what), sh.script);
    // operations that draw random numbers (also in hooks and before) replay exactly: the numbers inside the failure message match
    const mk2 = (sd) => { const a = { n: 0 }; return new Fuzzer({ seed: sd, errors: false, maxFails: 1, ops: [{ name: 'roll', weight: 3, run: (c) => { a.n += c.int(7); } }, { name: 'drop', weight: 2, run: (c) => { a.n -= c.int(12); } }],
      every: [{ n: 3, run: (c) => { a.n += c.int(2); } }], invariants: [() => a.n < 0 ? 'n=' + a.n : ''], before: (c) => c.int(100) }); };
    const p2 = await mk2(25).run(300), r2 = await mk2(25).run(300, { record: true }), a2 = await mk2(25).run(0, { script: r2.script });
    check('record + replay is exact even when operations, hooks and before draw random numbers', p2.fails.length === 1 && a2.fails.length === 1 && a2.fails[0].what === p2.fails[0].what && a2.fails[0].i === p2.fails[0].i, [p2.fails[0] && p2.fails[0].what, a2.fails[0] && a2.fails[0].what]);
    const sh2 = await Fuzzer.shrink(() => mk2(25), r2.script);
    check('...so a random-number game shrinks too, and the short script still fails', sh2.finding && /n=-/.test(sh2.finding.what) && sh2.script.length < r2.script.length, { from: r2.script.length, to: sh2.script.length });
    const po = await mk2(25).run(300, { perOp: true });
    check('perOp is a different game from the plain run of the same seed (documented)', po.fails.length > 0 && (po.fails[0].i !== p2.fails[0].i || po.fails[0].what !== p2.fails[0].what), { plain: p2.fails[0].i, perOp: po.fails[0] && po.fails[0].i });
    check('an unknown operation name in a replayed script is counted, not silent', (await mk2(25).run(0, { script: [{ op: 'nope', s: 1 }, { op: 'roll', s: 2 }] })).skipped === 1);
  });

  await section('shrinker matching, options and caps', async () => {
    const PREFIX = 'X'.repeat(90), st = { p: false, err: '' };
    const mk = () => { st.p = false; st.err = ''; return new Fuzzer({ seed: 1, errors: false, ops: [{ name: 'n', run: () => { } }, { name: 'p', run: () => { st.p = true; } }, { name: 'q', run: () => { st.err = PREFIX + (st.p ? ' alpha' : ' beta'); } }], invariants: [() => st.err], afterFail: () => { st.err = ''; } }); };
    const script = [{ op: 'n', s: 1 }, { op: 'p', s: 2 }, { op: 'n', s: 3 }, { op: 'q', s: 4 }];
    let sh = await Fuzzer.shrink(mk, script);
    check('the shrinker keeps the bug it started with (a different bug with a message that starts the same is not accepted)', sh.script.map(e => e.op).join() === 'p,q' && /alpha/.test(sh.finding.what), sh.script.map(e => e.op));
    sh = await Fuzzer.shrink(mk, script, { matchChars: 80 });
    check('matchChars: 80 gives the old cutoff (slides onto the other bug)', sh.script.map(e => e.op).join() === 'q', sh.script.map(e => e.op));
    sh = await Fuzzer.shrink(mk, script, { match: (f) => f.op });
    check('match(finding) lets you choose what "the same failure" means', sh.script.map(e => e.op).join() === 'q', sh.script.map(e => e.op));
    // pieces: true (original ddmin) also ends at the minimum, same result
    const holder = { app: null };
    const make = () => { holder.app = makeApp(true); return new Fuzzer(cfgFor(holder.app, 11, { afterFail: () => holder.app.reset() })); };
    const rec = await make().run(400, { record: true });
    const a = await Fuzzer.shrink(make, rec.script), b = await Fuzzer.shrink(make, rec.script, { pieces: true });
    check('pieces: true ends at the same 1-minimal script', JSON.stringify(a.script) === JSON.stringify(b.script) && b.finding && /negative/.test(b.finding.what), [a.script.length, b.script.length]);
    check('shrink: an uncut shrink reports no cap', a.stopped === undefined, a.stopped);
    // caps
    const capped = await Fuzzer.shrink(make, rec.script, { maxTries: 3 });
    check('maxTries stops the search early and says so', capped.stopped === 'tries' && capped.tries <= 4 && capped.finding && capped.script.length <= rec.script.length, { tries: capped.tries, stopped: capped.stopped });
    const slow = () => { const f = make(), run = f.run.bind(f); f.run = async (n, o) => { await sleep(15); return run(n, o); }; return f; };
    const timed = await Fuzzer.shrink(slow, rec.script, { maxMs: 40, maxTries: 1000 });
    check('maxMs stops the search early and says so', timed.stopped === 'time' && timed.tries < 20, { tries: timed.tries, stopped: timed.stopped });
  });

  await section('errors that used to vanish or abort', async () => {
    let r = await new Fuzzer({ seed: 1, errors: false, ops: [{ name: 'boom', run: () => { throw new Error('op broke'); } }], afterFail: () => { throw new Error('reset failed'); }, maxFails: 4 }).run(10);
    check('afterFail that throws is reported as a finding', r.fails.some(f => f.op === 'afterFail' && /reset failed/.test(f.what)), r.fails.map(f => f.op + ':' + f.what.slice(0, 30)));
    r = await new Fuzzer({ seed: 1, errors: false, ops: [{ name: 'bad', run: () => { } }], invariants: [() => 'rule broken'], maxFails: 10, before: (c) => { if (c.i === 3) throw new Error('before broke'); return 0; } }).run(6);
    check('a throwing before keeps the findings already collected and adds its own', r.fails.length >= 4 && r.fails.some(f => /before threw/.test(f.what)) && r.fails.filter(f => /rule broken/.test(f.what)).length >= 3, r.fails.map(f => f.what.slice(0, 25)));
    r = await new Fuzzer({ seed: 1, errors: false, ops: [{ name: 'bad', run: () => { } }], invariants: [() => 'rule broken'], maxFails: 10, state: (c) => { if (c.i === 2) throw new Error('state broke'); return 'ok'; } }).run(5);
    check('a throwing state callback keeps the findings already collected and adds its own', r.fails.some(f => /state threw/.test(f.what)) && r.fails.filter(f => /rule broken/.test(f.what)).length >= 3, r.fails.map(f => f.what.slice(0, 25)));
    r = await new Fuzzer({ seed: 1, errors: false, ops: [{ name: 'x', run: () => { } }], liveness: { every: 2, signature: () => { throw new Error('sig broke'); }, nudge: () => { } }, maxFails: 1 }).run(4);
    check('a throwing liveness signature is still a finding (unchanged)', r.fails.length === 1 && /liveness threw/.test(r.fails[0].what));
  });

  await section('seeds and weights', async () => {
    const seq = async (sd) => { const out = []; await new Fuzzer({ seed: sd, errors: false, ops: [{ name: 'x', run: (c) => { out.push(c.int(1e9)); } }] }).run(8); return out.join(); };
    const a = await seq('alpha'), b = await seq('beta'), a2 = await seq('alpha'), z = await seq(0);
    check('string seeds give different streams', a !== b && a !== z && b !== z);
    check('a string seed repeats', a === a2);
    let msg = ''; try { new Fuzzer({ ops: [{ name: 'a', weight: 0, run: () => { } }, { name: 'b', weight: 0, run: () => { } }] }); } catch (e) { msg = e.message; }
    check('all-zero weights are a clear error', /weight 0/.test(msg) && /nothing could ever run/.test(msg), msg);
    msg = ''; try { new Fuzzer({ ops: [{ name: 'a', weight: -1, run: () => { } }] }); } catch (e) { msg = e.message; }
    check('a negative weight is a clear error', /bad weight/.test(msg), msg);
    msg = ''; try { new Fuzzer({ ops: [{ name: 'a', weight: NaN, run: () => { } }, { name: 'b', run: () => { } }] }); } catch (e) { msg = e.message; }
    check('a NaN weight is a clear error', /bad weight/.test(msg), msg);
    const calls = []; await new Fuzzer({ seed: 1, errors: false, ops: [{ name: 'x', run: () => { } }] }).run(4, { onOp: (c) => calls.push(c.i + c.op) });
    check('onOp is called before every operation', calls.join() === '0x,1x,2x,3x', calls);
  });

  // ---- a tiny fake page for the input helpers ----
  function withFakeDom(body) {
    const g = globalThis, saved = {}, names = ['document', 'getComputedStyle', 'Element', 'KeyboardEvent', 'PointerEvent', 'innerWidth', 'innerHeight'];
    names.forEach(n => { saved[n] = Object.getOwnPropertyDescriptor(g, n); });
    class FakeElement { }
    FakeElement.prototype.setPointerCapture = function (id) { if (id === 99) throw Object.assign(new Error('weird'), { name: 'WeirdError' }); throw Object.assign(new Error('no such pointer'), { name: 'NotFoundError' }); };
    FakeElement.prototype.releasePointerCapture = FakeElement.prototype.setPointerCapture;
    const win = { got: [] }, doc = { got: [], documentElement: { clientWidth: 400, clientHeight: 800 }, hitFn: null };
    function mk(o) {
      const el = new FakeElement();
      Object.assign(el, { nodeType: 1, tagName: (o.tag || 'div').toUpperCase(), hidden: !!o.hidden, disabled: !!o.disabled, parentElement: o.parent || null, isConnected: true, got: [],
        style: Object.assign({ display: 'block', visibility: 'visible' }, o.style), rect: o.rect || { left: 10, top: 10, width: 50, height: 20 } });
      el.getBoundingClientRect = () => el.rect;
      el.contains = (x) => { for (let e = x; e; e = e.parentElement) if (e === el) return true; return false; };
      el.dispatchEvent = (ev) => { ev.target = el; for (let e = el; e; e = e.parentElement) e.got.push(ev); doc.got.push(ev); win.got.push(ev); return true; };
      return el;
    }
    const body_ = mk({ tag: 'body' }); doc.body = body_; doc.activeElement = body_;
    doc.elementFromPoint = (x, y) => doc.hitFn ? doc.hitFn(x, y) : null;
    doc.querySelectorAll = (sel) => { doc.lastSelector = sel; return doc.list || []; };
    function mkKey(ignoreCodes) {
      return class FakeKeyboardEvent { constructor(type, init) { this.type = type; Object.keys(init).forEach(k => { if (!(ignoreCodes && (k === 'keyCode' || k === 'which'))) this[k] = init[k]; }); } get legacy() { return 0; } };
    }
    Object.defineProperty(g, 'document', { value: doc, configurable: true, writable: true });
    g.getComputedStyle = (el) => el.style; g.Element = FakeElement; g.KeyboardEvent = mkKey(false); g.PointerEvent = class FakePointerEvent { constructor(type, init) { this.type = type; Object.assign(this, init); } };
    g.innerWidth = 400; g.innerHeight = 800;
    const api = { mk, doc, win, body: body_, mkKey, FakeElement };
    return Promise.resolve().then(() => body(api)).then(() => restore(), (e) => { restore(); throw e; });
    function restore() { names.forEach(n => { if (saved[n]) Object.defineProperty(g, n, saved[n]); else delete g[n]; }); }
  }

  await section('input helpers', async () => {
    const I = Fuzzer.Input;
    await withFakeDom(async ({ mk, doc, win, body, mkKey }) => {
      // key: code, keyCode, which, focused target, bubbling to document and window
      const field = mk({ tag: 'input', parent: body }); doc.activeElement = field;
      let ev = I.key('a', true);
      check('Input.key sets key, code and keyCode like a keyboard', ev.key === 'a' && ev.code === 'KeyA' && ev.keyCode === 65 && ev.which === 65 && ev.type === 'keydown', ev);
      check('Input.key goes to the focused element and bubbles up to document and window', ev.target === field && field.got.includes(ev) && doc.got.includes(ev) && win.got.includes(ev) && ev.bubbles === true);
      ev = I.key('ArrowLeft', false); check('Input.key: arrow keys and keyup', ev.code === 'ArrowLeft' && ev.keyCode === 37 && ev.type === 'keyup');
      ev = I.key('Enter', true, true); check('Input.key: Enter and repeat', ev.keyCode === 13 && ev.repeat === true);
      ev = I.key('Space', true); check('Input.key: Space is the space bar (key is a single space, code Space)', ev.key === ' ' && ev.code === 'Space' && ev.keyCode === 32, ev);
      ev = I.key('5', true); check('Input.key: digits', ev.code === 'Digit5' && ev.keyCode === 53);
      ev = I.key('x', true, false, { code: 'KeyZ', keyCode: 90, target: body }); check('Input.key: extra overrides code, keyCode and target', ev.code === 'KeyZ' && ev.keyCode === 90 && ev.target === body);
      doc.activeElement = null; ev = I.key('p', true); check('Input.key: with nothing focused it goes to the body', ev.target === body);
      globalThis.KeyboardEvent = mkKey(true); ev = I.key('p', true);
      check('Input.key: when the engine ignores keyCode in the constructor it is set anyway', ev.keyCode === 80 && ev.which === 80, ev.keyCode);
      globalThis.KeyboardEvent = mkKey(false);

      // pointer capture
      const el = mk({ parent: body });
      let threw = ''; try { el.setPointerCapture(1); } catch (e) { threw = e.name; }
      check('(the fake page throws NotFoundError for a made-up pointer id, like a real browser)', threw === 'NotFoundError');
      const pe = I.pointer(el, 'pointerdown', 5, 5, 'touch');
      check('Input.pointer still builds the event', pe.type === 'pointerdown' && pe.pointerId === 1 && pe.clientX === 5 && pe.bubbles === true);
      threw = ''; try { el.setPointerCapture(1); el.releasePointerCapture(1); } catch (e) { threw = e.name; }
      check('Input.pointer: setPointerCapture on its pointer id no longer throws NotFoundError (no false finding)', threw === '', threw);
      threw = ''; try { el.setPointerCapture(7); } catch (e) { threw = e.name; }
      check('...but an id it did not make up still throws', threw === 'NotFoundError', threw);
      threw = ''; try { el.setPointerCapture(99); } catch (e) { threw = e.name; }
      check('...and other errors are never hidden', threw === 'WeirdError', threw);
      const p5 = I.pointer(el, 'pointerup', 1, 1, 'mouse', { pointerId: 5 });
      threw = ''; try { el.setPointerCapture(5); } catch (e) { threw = e.name; }
      check('opts.pointerId sets the id, and that id is guarded too', p5.pointerId === 5 && threw === '', [p5.pointerId, threw]);
      I.unguardCapture(); threw = ''; try { el.setPointerCapture(1); } catch (e) { threw = e.name; }
      check('unguardCapture puts the browser method back', threw === 'NotFoundError', threw);
      I.pointer(el, 'pointerdown', 1, 1, 'touch', { captureGuard: false }); threw = ''; try { el.setPointerCapture(1); } catch (e) { threw = e.name; }
      check('opts.captureGuard: false leaves the browser method alone', threw === 'NotFoundError', threw);

      // visible and clickables
      const vis = (o, hit) => { const e = mk(Object.assign({ parent: body, tag: 'button' }, o)); doc.hitFn = hit === undefined ? () => e : hit; return I.visible(e); };
      check('visible: a normal button is visible', vis({}) === true);
      check('visible: disabled is not', vis({ disabled: true }) === false);
      check('visible: visibility:hidden is not', vis({ style: { visibility: 'hidden' } }) === false);
      check('visible: visibility:collapse is not', vis({ style: { visibility: 'collapse' } }) === false);
      check('visible: display:none on the element is not', vis({ style: { display: 'none' } }) === false);
      const hiddenParent = mk({ parent: body, style: { display: 'none' } }); check('visible: display:none on a parent is not', vis({ parent: hiddenParent }) === false);
      check('visible: the hidden attribute is not', vis({ hidden: true }) === false);
      check('visible: zero width is not', vis({ rect: { left: 10, top: 10, width: 0, height: 20 } }) === false);
      check('visible: zero height is not', vis({ rect: { left: 10, top: 10, width: 20, height: 0 } }) === false);
      const cover = mk({ parent: body, tag: 'div' });
      check('visible: covered by something else at its center is not', vis({}, () => cover) === false);
      { const e = mk({ parent: body, tag: 'button' }); doc.hitFn = () => cover; check('visible: covering: false skips that test', I.visible(e, { covering: false }) === true); }
      { const e = mk({ parent: body, tag: 'button' }), kid = mk({ parent: e }); doc.hitFn = () => kid; check('visible: its own child at the center counts as itself', I.visible(e) === true); }
      { const e = mk({ parent: body, tag: 'input' }), lab = mk({ parent: body, tag: 'label' }); lab.control = e; doc.hitFn = () => lab; check('visible: an input under its own label counts', I.visible(e) === true); }
      check('visible: a control scrolled out of view is still visible (a person could scroll)', vis({ rect: { left: 10, top: 5000, width: 50, height: 20 } }, () => cover) === true);
      { const e = mk({ parent: body }); e.isConnected = false; check('visible: a detached element is not', I.visible(e) === false); }
      // clickables
      const b1 = mk({ parent: body, tag: 'button' }), link = mk({ parent: body, tag: 'a' }), b2 = mk({ parent: body, tag: 'button', style: { visibility: 'hidden' } });
      doc.list = [b1, link, b2]; doc.hitFn = (x, y) => b1;
      let got = I.clickables(); check('clickables: the default selector has no a[href] (links navigate away)', !/a\[href\]/.test(doc.lastSelector) && /button/.test(doc.lastSelector), doc.lastSelector);
      check('clickables: hidden buttons are left out', got.indexOf(b2) < 0 && got.indexOf(b1) >= 0);
      I.clickables(null, null, { links: true }); check('clickables: { links: true } adds a[href]', /a\[href\]/.test(doc.lastSelector), doc.lastSelector);
      I.clickables('a[href], button'); check('clickables: your own selector is used as given', doc.lastSelector === 'a[href], button');
      doc.hitFn = () => b1; got = I.clickables(null, (e) => e === b1); check('clickables: skip(el) still works', got.indexOf(b1) < 0);
    });
  });

  await section('generic adapter', async () => {
    await withFakeDom(async ({ mk, doc, body }) => {
      const clicks = { n: 0 }; const btn = mk({ parent: body, tag: 'button' }); btn.click = () => { clicks.n++; }; btn.closest = () => null;
      doc.list = [btn]; doc.hitFn = () => btn; doc.title = 'Game'; body.innerText = 'Score 3';
      globalThis.window = globalThis; globalThis.scrollTo = () => { }; globalThis.Fuzzer = Fuzzer;
      try {
        vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'example', 'generic-adapter.js'), 'utf8'));
        let r = await new Fuzzer(globalThis.__fuzzConfig(3)).run(40);
        check('generic adapter: runs on a plain page with no game code and clicks controls', r.fails.length === 0 && r.ops === 40 && clicks.n > 5, { fails: r.fails, clicks: clicks.n });
        body.innerText = 'Score NaN';
        r = await new Fuzzer(globalThis.__fuzzConfig(3)).run(5);
        check('generic adapter: catches NaN in the visible text', r.fails.length > 0 && /NaN/.test(r.fails[0].what), r.fails[0]);
      } finally { delete globalThis.window; delete globalThis.scrollTo; delete globalThis.Fuzzer; delete globalThis.__fuzzConfig; }
    });
  });

  await section('ready-made invariants', async () => {
    const J = Fuzzer.Invariants;
    check('findJunk: clean text is fine', J.findJunk('Score 12 of 30, lives 3') === '');
    check('findJunk: NaN is caught', /NaN/.test(J.findJunk('Score NaN of 30')));
    check('findJunk: undefined is caught', /undefined/.test(J.findJunk('Hello undefined')));
    check('findJunk: [object Object] is caught', /\[object/.test(J.findJunk('Name: [object Object]')));
    check('findJunk: Infinity is not on the default list (a film title is fine)', J.findJunk('Infinity War 2') === '');
    check('findJunk: words: adds your own', /Infinity/.test(J.findJunk('x Infinity y', { words: ['Infinity'] })));
    check('findJunk: whole words only (NaNa, undefinedly are not junk)', J.findJunk('Nana NaNa undefinedly') === '');
    check('findJunk: skip list (string) removes a phrase first', J.findJunk('The undefined behaviour guide', { skip: ['undefined behaviour'] }) === '');
    check('findJunk: skip list (regex) removes a phrase first', J.findJunk('The Undefined Behaviour guide', { skip: [/undefined behaviour/i] }) === '');
    check('findJunk: the skip list does not hide other junk', /NaN/.test(J.findJunk('undefined behaviour and NaN', { skip: ['undefined behaviour'] })));
    check('noJunkText(opts.text) works as an invariant', J.noJunkText({ text: () => 'ok' })() === '' && /NaN/.test(J.noJunkText({ text: () => 'x NaN' })()));
    await withFakeDom(async ({ doc, body }) => { body.innerText = 'Score: NaN'; check('noJunkText reads the visible text of the page body', /NaN/.test(J.noJunkText()())); body.innerText = 'fine'; check('noJunkText: fine text passes', J.noJunkText()() === ''); });
    const r = await new Fuzzer({ seed: 1, errors: false, maxFails: 1, ops: [{ name: 'x', run: () => { } }], invariants: [J.noJunkText({ text: () => 'shows undefined here' })] }).run(3);
    check('noJunkText as an engine invariant produces a finding', r.fails.length === 1 && /undefined/.test(r.fails[0].what), r.fails);
  });

  await section('real input bridge', async () => {
    const R = Fuzzer.Real;
    check('Real.ops() is empty when no runner bridge is there', R.available() === false && R.ops().length === 0);
    let rejected = ''; try { await R.click(1, 2); } catch (e) { rejected = e.message; } check('Real.click rejects with a plain message without the bridge', /--real-input/.test(rejected), rejected);
    const calls = []; globalThis.__fuzzReal = (req) => { calls.push(req); return Promise.resolve(); };
    try {
      const ops = R.ops({ weight: 2 });
      check('Real.ops() gives click, move and key operations when the bridge is there', ops.map(o => o.name).join() === 'real-click,real-move,real-key' && ops.every(o => o.weight === 2), ops.map(o => o.name));
      globalThis.innerWidth = 300; globalThis.innerHeight = 500;
      const r = await new Fuzzer({ seed: 3, errors: false, ops: ops }).run(30);
      check('real operations ask the bridge, inside the window, with plain request shapes', r.fails.length === 0 && calls.length === 30 && calls.every(q => (q.t === 'press' && /^[A-Za-z]+$/.test(q.key)) || (q.t !== 'press' && q.x >= 0 && q.x < 300 && q.y >= 0 && q.y < 500)), calls.slice(0, 3));
    } finally { delete globalThis.__fuzzReal; delete globalThis.innerWidth; delete globalThis.innerHeight; }
  });

  await section('house rules for the library files', async () => {
    const strip5 = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/mg, '$1').replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''");
    ['src/fuzz-core.js', 'runner/page-driver.js', 'tools/strip-test-hooks.js', 'tools/check-shipped.js'].forEach(f => {
      const t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), code = strip5(t);
      const bad = (code.match(/\basync\b|\bawait\b|=>|\bconst\b|\blet\b|`|\bclass\b|\.\.\./g) || []);
      check(f + ': ES5 syntax (no async/await, arrows, const/let, template strings, classes, spread)', bad.length === 0, bad.slice(0, 5));
      check(f + ': keeps the header "Copyright (c) 2026 LFC Foundry. MIT License"', t.indexOf('Copyright (c) 2026 LFC Foundry. MIT License') >= 0);
    });
    ['example/adapter.js', 'example/generic-adapter.js', 'test/run.js', 'test/browser.py', 'test/runner_fakes.py', 'runner/fuzz_playwright.py', 'runner/fuzz_puppeteer.mjs'].forEach(f => {
      let t = ''; try { t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); } catch (e) { }
      check(f + ': keeps the header "Copyright (c) 2026 LFC Foundry. MIT License"', t.indexOf('Copyright (c) 2026 LFC Foundry. MIT License') >= 0);
    });
    const sb = {}; vm.createContext(sb); vm.runInContext(fs.readFileSync(CORE_PATH, 'utf8'), sb);
    check('loaded as a plain page script it defines Fuzzer and nothing else (no leaked globals)', Object.keys(sb).join() === 'Fuzzer' && typeof sb.Fuzzer === 'function', Object.keys(sb));
    const r = await new sb.Fuzzer({ seed: 2, errors: false, ops: [{ name: 'x', run: () => { } }] }).run(5);
    check('...and it runs there', r.ops === 5);
  });

  await section('after-build check and stripper warning', async () => {
    check('check-shipped: clean text passes', checkShipped('function a(){}').length === 0);
    check('check-shipped: finds the test handle', checkShipped('x;window.__app={}').join() === '__app');
    check('check-shipped: finds leftover markers and your own words', checkShipped('/*TEST_HOOK_START*/ __fuzzConfig', ['__fuzzConfig']).join() === '__fuzzConfig,TEST_HOOK_START');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-')), tools = path.join(__dirname, '..', 'tools');
    const dirty = path.join(dir, 'dirty.html'), clean = path.join(dir, 'clean.html'), out = path.join(dir, 'out.js');
    fs.writeFileSync(dirty, 'a();window.__app={};'); fs.writeFileSync(clean, 'a();');
    let r = cp.spawnSync(process.execPath, [path.join(tools, 'check-shipped.js'), dirty]); check('check-shipped CLI: exit 1 and says what shipped', r.status === 1 && /__app/.test(String(r.stderr)), String(r.stderr));
    r = cp.spawnSync(process.execPath, [path.join(tools, 'check-shipped.js'), clean]); check('check-shipped CLI: exit 0 for a clean file', r.status === 0);
    r = cp.spawnSync(process.execPath, [path.join(tools, 'check-shipped.js'), clean, '--word', 'a()']); check('check-shipped CLI: --word adds a word to look for', r.status === 1);
    // a minifier that ran first removes the markers: the stripper then removes nothing, and says so
    r = cp.spawnSync(process.execPath, [path.join(tools, 'strip-test-hooks.js'), dirty, out]);
    check('strip-test-hooks CLI warns when it finds no markers (minifier first?)', r.status === 0 && /no TEST_HOOK markers/.test(String(r.stderr)), String(r.stderr));
    fs.writeFileSync(dirty, 'a();' + S + 'window.__app={};' + E);
    r = cp.spawnSync(process.execPath, [path.join(tools, 'strip-test-hooks.js'), dirty, out]);
    check('strip-test-hooks CLI: no warning when markers were there', r.status === 0 && String(r.stderr) === '' && checkShipped(fs.readFileSync(out, 'utf8')).length === 0, String(r.stderr));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // ---- the in-page driver and the Puppeteer runner, against a fake page that really runs the engine in a vm ----
  const RUNNER = path.join(__dirname, '..', 'runner');
  const toyAdapter = `
    window.__fuzzConfig = function (seed) {
      var app = window.__toy || (window.__toy = { n: 0 }); app.n = 0;
      var ops = [ { name: 'add', weight: 5, run: function () { app.n += 1; } }, { name: 'spend', weight: 3, run: function () { if (app.n > 0) app.n -= 4; } }, { name: 'noop', weight: 1, run: function () {} } ];
      if (window.__extraOps) ops = ops.concat(window.__extraOps(seed));
      return { seed: seed, errors: false, ops: ops, invariants: [ function () { return app.n >= 0 ? '' : 'n is negative: ' + app.n; } ].concat(window.__extraInv ? window.__extraInv() : []) };
    };`;
  function makeFakeBrowser(onPage, seen) {
    const made = { contexts: 0, closed: 0, pages: [] };
    class FakePage extends EventEmitter {
      constructor() {
        super(); this.u = 'file:///game.html'; this.isGone = false; this.calls = []; this.screens = [];
        const page = this;
        this.sb = { console: { debug: (m) => page.emit('console', { type: () => 'debug', text: () => m }), error: (m) => page.emit('console', { type: () => 'error', text: () => m }), log() { } } };
        this.sb.window = this.sb; this.sb.__hostEmit = (name, arg) => { if (name === 'framenavigated') { page.u = arg; page.emit('framenavigated', page.frame); } else page.emit(name, arg); };
        vm.createContext(this.sb); this.frame = { url: () => page.u };
        this.mouse = { click: async (x, y) => { page.calls.push(['click', x, y]); }, move: async (x, y) => { page.calls.push(['move', x, y]); } };
        this.keyboard = { press: async (k) => { page.calls.push(['press', k]); } };
      }
      async setViewport(v) { this.viewport = v; } setDefaultTimeout() { } async evaluateOnNewDocument(src) { this.initScripts = (this.initScripts || []).concat(src); } async emulateCPUThrottling(n) { this.calls.push(['throttle', n]); }
      async goto() { } url() { return this.u; } isClosed() { return this.isGone; } mainFrame() { return this.frame; }
      async evaluate(fn, ...args) { const src = typeof fn === 'string' ? fn : '(' + fn.toString() + ')(' + args.map(a => JSON.stringify(a)).join(',') + ')'; return vm.runInContext(src, this.sb); }
      async waitForFunction(expr, o) {
        const end = Date.now() + o.timeout;
        for (;;) { const v = vm.runInContext(expr, this.sb); if (v) return v; if (Date.now() > end) { const e = new Error('Waiting failed: ' + o.timeout + 'ms exceeded'); e.name = 'TimeoutError'; throw e; } await sleep(5); }
      }
      async screenshot(o) { fs.writeFileSync(o.path, 'png'); }
    }
    return {
      made, async createBrowserContext() { made.contexts++; return { async newPage() { const p = new FakePage(); made.pages.push(p); if (onPage) onPage(p); return p; }, async close() { made.closed++; } }; },
    };
  }

  await section('page driver and runner', async () => {
    const mod = await import(require('url').pathToFileURL(path.join(RUNNER, 'fuzz_puppeteer.mjs')).href);
    const vp = { width: 412, height: 892 }, run = (kw, adapter, seed, ops, hook, seen) => mod.runSeed(makeFakeBrowser(hook, seen), 'file:///game.html', adapter || toyAdapter, seed || 11, ops || 400, vp, null, kw || {});
    // a clean app is green
    let r = await run({}, `window.__fuzzConfig = function (seed) { return { seed: seed, errors: false, ops: [ { name: 'x', run: function () {} } ] }; };`, 1, 50);
    check('runner: a clean app is green, with the operation count', r.fails.length === 0 && r.ops === 50 && r.visited !== undefined, r);
    // plain failure
    r = await run({});
    check('runner: a failing seed reports the finding and no shrink without --shrink', r.fails[0] && /negative/.test(r.fails[0].what) && !r.shrunk, r.fails[0]);
    // --shrink
    r = await run({ shrink: true });
    check('runner --shrink: the failing seed is cut to add, spend (same game, recorded)', r.shrunk && r.shrunk.repeats === true && r.shrunk.ops.join() === 'add,spend' && r.shrunk.from > 2, r.shrunk && { ops: r.shrunk.ops, from: r.shrunk.from });
    const lines = mod.shrinkLines(r.shrunk).join('\n');
    check('runner --shrink: the printed lines give the short replay in plain words', /shrunk \d+ -> 2 operations/.test(lines) && /add, spend/.test(lines) && /run\(0, \{ script \}\): \[\{"op":"add"/.test(lines), lines);
    r = await run({ shrink: true, shrinkTries: 2 });
    check('runner --shrink: the try cap is respected and stated', r.shrunk && r.shrunk.stopped === 'tries' && /stopped at the tries cap/.test(mod.shrinkLines(r.shrunk).join('\n')), r.shrunk && r.shrunk.stopped);
    // a failure that does not repeat on replay is said so plainly
    const flaky = `window.__fuzzConfig = function (seed) { return { seed: seed, errors: false, ops: [ { name: 'x', run: function () { if (!window.__once) { window.__once = 1; window.__bad = 'broke once'; } else window.__bad = ''; } } ], invariants: [ function () { return window.__bad || ''; } ], afterFail: function () { window.__bad = ''; } }; };`;
    r = await run({ shrink: true }, flaky, 1, 10);
    check('runner --shrink: a failure that does not repeat says so and is not shrunk', r.fails[0] && r.shrunk && r.shrunk.repeats === false && /did NOT repeat/.test(mod.shrinkLines(r.shrunk).join(' ')), r.shrunk);
    // hang guard
    const stuckAdapter = `window.__fuzzConfig = function (seed) { return { seed: seed, errors: false, ops: [ { name: 'stuck-op', run: function () { return new Promise(function () {}); } } ] }; };`;
    let t = Date.now(); r = await run({ seedSecs: 0.4, hangTrace: true }, stuckAdapter, 1, 5);
    check('runner: a hung seed is reported as "hung" within the limit, naming the last operation', r.fails[0].op === 'hung' && /stuck-op/.test(r.fails[0].what) && Date.now() - t < 3000, r.fails[0]);
    { const fb = makeFakeBrowser(); await mod.runSeed(fb, 'u', stuckAdapter, 1, 5, vp, null, { seedSecs: 0.3 }); check('runner: the hung seed context was closed (killed)', fb.made.closed === 1, fb.made); }
    r = await run({ seedSecs: 0.3 }, stuckAdapter, 1, 5);
    check('runner: without --hang-trace the hung report says how to find the operation', /--hang-trace/.test(r.fails[0].what), r.fails[0].what);
    // crash / close / popup / navigation guard
    const guardAdapter = (code) => `window.__fuzzConfig = function (seed) { return { seed: seed, errors: false, ops: [ { name: 'x', run: function (c) { if (c.i === 2) { ${code} } } } ] }; };`;
    r = await run({}, guardAdapter(`window.__hostEmit('error');`), 1, 6);
    check('runner: a page crash fails the seed', r.fails.some(f => f.op === 'page-guard' && /crashed/.test(f.what)), r.fails);
    r = await run({}, guardAdapter(`window.__hostEmit('popup', { url: function () { return 'https://elsewhere.test/'; } });`), 1, 6);
    check('runner: a new tab or window fails the seed', r.fails.some(f => f.op === 'page-guard' && /new tab/.test(f.what)), r.fails);
    r = await run({}, guardAdapter(`window.__hostEmit('framenavigated', 'https://elsewhere.test/next');`), 1, 6);
    check('runner: leaving the start page fails the seed', r.fails.some(f => f.op === 'page-guard' && /left the start page/.test(f.what)), r.fails);
    r = await run({ allowNavigation: true }, guardAdapter(`window.__hostEmit('framenavigated', 'https://elsewhere.test/next');`), 1, 6);
    check('runner: --allow-navigation lets a single-page app move', r.fails.length === 0, r.fails);
    r = await run({}, guardAdapter(`window.__hostEmit('framenavigated', 'file:///game.html#level2');`), 1, 6);
    check('runner: a change after # is not leaving the page', r.fails.length === 0, r.fails);
    r = await run({}, guardAdapter(`window.__hostEmit('close');`), 1, 6);
    check('runner: a closed page fails the seed', r.fails.some(f => f.op === 'page-guard' && /closed/.test(f.what)), r.fails);
    r = await run({}, guardAdapter(`window.console.error('x'); `), 1, 6, (p) => { const ev = p.evaluate.bind(p); p.evaluate = async (fn, ...a) => { const out = await ev(fn, ...a); if (typeof fn === 'function' && /__fuzzTake/.test(fn.toString())) p.isGone = true; return out; }; });
    check('runner: a page that is closed by the time the run ends fails the seed (no silent green)', r.fails.some(f => f.op === 'page-guard' && /closed/.test(f.what)), r.fails);
    // console.error handling
    const consoleAdapter = `window.__fuzzConfig = function (seed) { return { seed: seed, errors: false, ops: [ { name: 'x', run: function (c) { if (c.i === 1) console.error('deliberate: the demo error'); } } ] }; };`;
    r = await run({}, consoleAdapter, 1, 4); check('runner: console.error fails a seed by default', r.fails.some(f => f.op === 'pageerror' && /deliberate/.test(f.what)), r.fails);
    r = await run({ ignoreConsole: ['^deliberate'] }, consoleAdapter, 1, 4); check('runner: --ignore-console REGEX lets a deliberate message pass', r.fails.length === 0, r.fails);
    r = await run({ ignoreConsole: ['something else'] }, consoleAdapter, 1, 4); check('runner: an --ignore-console pattern that does not match still fails', r.fails.length === 1, r.fails);
    r = await run({ allowConsoleErrors: true }, consoleAdapter, 1, 4); check('runner: --allow-console-errors lets all pass', r.fails.length === 0, r.fails);
    // junk text
    const junkAdapter = `window.__fuzzConfig = function (seed) { return { seed: seed, errors: false, ops: [ { name: 'x', run: function () {} } ] }; };`;
    r = await run({ junkText: true }, junkAdapter, 1, 3, (p) => { p.sb.document = { body: { innerText: 'Score: NaN of 30' } }; });
    check('runner --junk-text: NaN in the visible text fails the seed', r.fails.length > 0 && /NaN/.test(r.fails[0].what), r.fails[0]);
    r = await run({ junkText: false }, junkAdapter, 1, 3, (p) => { p.sb.document = { body: { innerText: 'Score: NaN of 30' } }; });
    check('runner: without --junk-text the visible text is not checked', r.fails.length === 0, r.fails);
    r = await run({ junkText: true, junkSkip: ['Score: NaN'] }, junkAdapter, 1, 3, (p) => { p.sb.document = { body: { innerText: 'Score: NaN of 30' } }; });
    check('runner --junk-skip: a phrase on the skip list is not junk', r.fails.length === 0, r.fails);
    // real input
    const realAdapter = `window.__fuzzConfig = function (seed) { return { seed: seed, errors: false, ops: [ { name: 'noop', run: function () {} } ].concat(Fuzzer.Real.ops()) }; };`;
    let pg; r = await run({ realInput: true }, realAdapter, 4, 60, (p) => { pg = p; });
    check('runner --real-input: operations reach page.mouse and page.keyboard and the run goes on', r.fails.length === 0 && pg.calls.some(c => c[0] === 'click') && pg.calls.some(c => c[0] === 'press') && r.ops === 60, { calls: pg.calls.length, fails: r.fails });
    check('runner --real-input: coordinates are inside the viewport', pg.calls.filter(c => c[0] !== 'press').every(c => c[1] >= 0 && c[1] < 412 && c[2] >= 0 && c[2] < 892));
    r = await run({}, realAdapter, 4, 60, (p) => { pg = p; });
    check('runner without --real-input: no real calls are made', r.fails.length === 0 && pg.calls.length === 0, pg.calls.length);
    check('realRequest refuses odd requests', mod.realRequest({ t: 'click', x: NaN, y: 1 }, 100, 100) === null && mod.realRequest({ t: 'press', key: 'Enter; rm' }, 100, 100) === null && mod.realRequest({ t: 'evil' }, 1, 1) === null && mod.realRequest(null, 1, 1) === null);
    // throttle
    r = await run({ throttle: 4 }, junkAdapter, 1, 3, (p) => { pg = p; }); check('runner --throttle asks Chrome for CPU slowdown', pg.calls.some(c => c[0] === 'throttle' && c[1] === 4));
    // bundle
    const bdir = fs.mkdtempSync(path.join(os.tmpdir(), 'fkb-'));
    r = await run({ bundle: bdir, shrink: true });
    const files = fs.readdirSync(bdir).sort();
    check('runner --bundle: screenshot, saved-data dump and findings are saved for a failing seed', files.join() === 'seed-11-findings.json,seed-11.png' || files.join() === 'seed-11-findings.json,seed-11-storage.json,seed-11.png', files);
    const saved = JSON.parse(fs.readFileSync(path.join(bdir, 'seed-11-findings.json'), 'utf8'));
    check('runner --bundle: the findings file holds the finding and the shrunk replay', saved.fails.length > 0 && saved.shrunk && saved.shrunk.ops.join() === 'add,spend');
    fs.rmSync(bdir, { recursive: true, force: true });
    const bdir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'fkb-'));
    await run({ bundle: bdir2, seedSecs: 0.3 }, stuckAdapter, 1, 5);
    const hungFiles = fs.readdirSync(bdir2);
    check('runner --bundle: a hung seed still gets its findings file, and the missing dump is explained', hungFiles.includes('seed-1-findings.json') && /no saved-data dump/.test(fs.readFileSync(path.join(bdir2, 'seed-1-findings.json'), 'utf8')));
    fs.rmSync(bdir2, { recursive: true, force: true });
    // no bundle for a green seed
    const bdir3 = path.join(os.tmpdir(), 'fkb-none-' + process.pid);
    await run({ bundle: bdir3 }, junkAdapter, 1, 3); check('runner --bundle: nothing is written for a green seed', !fs.existsSync(bdir3));
    // the browser path
    r = await run({ init: "localStorage.setItem('k','v')", mobile: true }, junkAdapter, 1, 3, (p) => { pg = p; });
    check('runner --init and --mobile reach the page', pg.initScripts && pg.initScripts[0] === "localStorage.setItem('k','v')" && pg.viewport.isMobile === true && pg.viewport.hasTouch === true, [pg.initScripts, pg.viewport]);
    check('Chrome does not get the FIREFOX variable as its executable', mod.pickExecutable('chrome', undefined, { FIREFOX: '/usr/bin/firefox' }) === undefined);
    check('Firefox gets the FIREFOX variable', mod.pickExecutable('firefox', undefined, { FIREFOX: '/usr/bin/firefox', CHROME: '/c' }) === '/usr/bin/firefox');
    check('Chrome gets the CHROME variable, and --executable beats both', mod.pickExecutable('chrome', undefined, { CHROME: '/c' }) === '/c' && mod.pickExecutable('chrome', '/x', { CHROME: '/c' }) === '/x');
    check('consoleIgnored matches regular expressions', mod.consoleIgnored('Failed to load favicon.ico', ['favicon']) && !mod.consoleIgnored('boom', ['favicon']));
    // each seed gets its own context, and contexts are closed
    const fb = makeFakeBrowser(); await mod.runSeed(fb, 'u', junkAdapter, 1, 3, vp, null, {}); await mod.runSeed(fb, 'u', junkAdapter, 2, 3, vp, null, {});
    check('runner: every seed gets a fresh context and it is closed afterwards', fb.made.contexts === 2 && fb.made.closed === 2, fb.made);
  });

  console.log(`fuzz-core: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
