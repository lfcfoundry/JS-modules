/* Node-only tests for fuzz-kit: the engine itself (no browser) and the test-hook stripper.
   Run: node fuzz-kit/test/run.js */
'use strict';
const path = require('path');
const Fuzzer = require(path.join(__dirname, '..', 'src', 'fuzz-core.js'));
const strip = require(path.join(__dirname, '..', 'tools', 'strip-test-hooks.js'));
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
  console.log(`fuzz-core: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
