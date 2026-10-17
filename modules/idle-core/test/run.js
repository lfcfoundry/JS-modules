#!/usr/bin/env node
// idle-core checks (Node only, no browser). Copyright (c) 2026 LFC Foundry. MIT License.
// Run: node modules/idle-core/test/run.js            (checks modules/idle-core/idle-core.js)
//      node modules/idle-core/test/run.js OTHER.js   (checks another copy, for example an older one, to see which defects it has)
// The first block reproduces each defect found in the 2026-10-15 audit; the later blocks cover the new helpers.
var assert = require('assert'), path = require('path');
var I = require(path.resolve(process.argv[2] || path.join(__dirname, '..', 'idle-core.js')));
var pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e && e.message || e).split('\n').slice(0, 2).join('\n       ')); }
}
function ok(n) { return typeof n === 'number' && isFinite(n); }
function rng(seed) { var s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

console.log('prices');
t('upgradeCost(100,10,2) is 121, not 122 (rounding noise)', function () { assert.strictEqual(I.upgradeCost(100, 10, 2), 121); });
t('upgradeCost matches exact integer arithmetic for 10% and 12% growth', function () {
  // base 100 at 10% growth: 100 * 11^k / 10^k is a whole number for k <= 2 and a short decimal after
  [[100, 10, 2, 121], [1000, 10, 3, 1331], [10000, 10, 4, 14641], [100, 12, 2, 126], [10, 10, 1, 11], [200, 10, 2, 242]].forEach(function (c) {
    assert.strictEqual(I.upgradeCost(c[0], c[1], c[2]), c[3], c.join(','));
  });
});
t('upgradeCost keeps the old results (round up, discount)', function () {
  assert.strictEqual(I.upgradeCost(15, 15, 0), 15); assert.strictEqual(I.upgradeCost(15, 15, 1), 18); assert.strictEqual(I.upgradeCost(15, 15, 3), 23);
  assert.strictEqual(I.upgradeCost(100, 10, 2, 0.5), 61); assert.strictEqual(I.upgradeCost(15, 15, 2), 20);
});
t('upgradeCost never returns Infinity or NaN', function () {
  var big = I.upgradeCost(15, 15, 5200);
  assert.ok(ok(big) && big > 1e100, 'overflow gives ' + big);
  assert.strictEqual(I.upgradeCost(15, 15, 5200, 0), 0);                // discount 0 was NaN
  assert.strictEqual(I.upgradeCost(15, 15, 3, 0), 0);
  [NaN, Infinity, -Infinity, 'x', null, undefined, {}].forEach(function (v) {
    [[v, 15, 1, 1], [15, v, 1, 1], [15, 15, v, 1], [15, 15, 1, v]].forEach(function (a) {
      var c = I.upgradeCost.apply(null, a); assert.ok(ok(c) && c >= 0, JSON.stringify(a) + ' -> ' + c);
    });
  });
});
t('safe(n, fallback)', function () {
  assert.strictEqual(I.safe(5), 5); assert.strictEqual(I.safe(NaN), 0); assert.strictEqual(I.safe(Infinity, 7), 7); assert.strictEqual(I.safe('5', 1), 5); assert.strictEqual(I.safe('abc', 1), 1); assert.strictEqual(I.safe('', 1), 1); assert.strictEqual(I.safe(' ', 1), 1); assert.strictEqual(I.safe(true, 1), 1); assert.strictEqual(I.safe(undefined), 0);
});

console.log('buy many / buy max');
function brute(base, rise, owned, n, disc) {                 // the plain loop: add up the exact prices one by one
  var r = 1 + rise / 100, sum = 0, i;
  for (i = 0; i < n; i++) sum += base * Math.pow(r, owned + i) * (disc == null ? 1 : disc);
  return sum;
}
function sumOfSingles(base, rise, owned, n, disc) { var s = 0; for (var i = 0; i < n; i++) s += I.upgradeCost(base, rise, owned + i, disc); return s; }
t('costOfMany(…, 1) equals upgradeCost, 0 copies cost 0', function () {
  [[15, 15, 0], [100, 10, 2], [60, 7, 13], [500, 25, 9]].forEach(function (c) { assert.strictEqual(I.costOfMany(c[0], c[1], c[2], 1), I.upgradeCost(c[0], c[1], c[2])); });
  assert.strictEqual(I.costOfMany(15, 15, 3, 0), 0); assert.strictEqual(I.costOfMany(15, 15, 3, -4), 0); assert.strictEqual(I.costOfMany(15, 15, 3, NaN), 0);
});
t('costOfMany agrees with a brute-force loop (random grid)', function () {
  var R = rng(7), i, worst = 0;
  for (i = 0; i < 600; i++) {
    var base = 1 + Math.floor(R() * 5000), rise = Math.floor(R() * 40) + (R() < 0.3 ? 0 : R()), owned = Math.floor(R() * 120), n = 1 + Math.floor(R() * 150), disc = R() < 0.3 ? 0.5 + R() / 2 : null;
    var exact = brute(base, rise, owned, n, disc), got = I.costOfMany(base, rise, owned, n, disc);
    assert.ok(ok(got), 'finite');
    var rel = Math.max(0, Math.abs(got - exact) - 1) / Math.max(1, exact); if (rel > worst) worst = rel;
    assert.ok(got >= exact * (1 - 1e-9) - 1e-6 && got <= Math.ceil(exact * (1 + 1e-9)) + 1e-6, [base, rise, owned, n, disc, exact, got].join(' '));
    // one round-up for the whole bundle: never more than buying one by one, and at most n cheaper
    var singles = sumOfSingles(base, rise, owned, n, disc);
    assert.ok(got <= singles * (1 + 1e-12) + 1 && got >= singles * (1 - 1e-12) - n - 1, 'singles ' + singles + ' bundle ' + got);
  }
  assert.ok(worst < 1e-9, 'relative error ' + worst);
});
t('costOfMany: zero growth, tiny growth and huge counts', function () {
  assert.strictEqual(I.costOfMany(10, 0, 5, 7), 70);
  var exact = brute(10, 0.001, 0, 500), got = I.costOfMany(10, 0.001, 0, 500);
  assert.ok(Math.abs(got - exact) <= 1.0000001 && got >= exact - 1e-6, exact + ' vs ' + got);
  assert.ok(ok(I.costOfMany(15, 15, 5000, 100000)) && I.costOfMany(15, 15, 5000, 100000) <= I.LIMIT);
  assert.ok(ok(I.costOfMany(15, 15, 0, 1e15)));
});
t('maxAffordable matches a brute-force loop and costOfMany (random grid)', function () {
  var R = rng(11), i;
  for (i = 0; i < 600; i++) {
    var base = 1 + Math.floor(R() * 3000), rise = 1 + Math.floor(R() * 30), owned = Math.floor(R() * 60), disc = R() < 0.3 ? 0.5 + R() / 2 : null;
    var money = Math.floor(Math.pow(10, R() * 12) * (0.5 + R()));
    var n = 0;                                               // brute force: keep buying while the next bundle still fits
    while (n < 5000 && I.costOfMany(base, rise, owned, n + 1, disc) <= money) n++;
    var got = I.maxAffordable(base, rise, owned, money, disc);
    assert.strictEqual(got, n, [base, rise, owned, money, disc].join(' ') + ' brute ' + n + ' got ' + got);
    assert.ok(I.costOfMany(base, rise, owned, got, disc) <= money && I.costOfMany(base, rise, owned, got + 1, disc) > money);
  }
});
t('maxAffordable: exact money, one short, nothing, free, broken', function () {
  var c = I.costOfMany(15, 15, 0, 10); assert.strictEqual(I.maxAffordable(15, 15, 0, c), 10); assert.strictEqual(I.maxAffordable(15, 15, 0, c - 1), 9);
  assert.strictEqual(I.maxAffordable(15, 15, 0, 14), 0); assert.strictEqual(I.maxAffordable(15, 15, 0, 15), 1); assert.strictEqual(I.maxAffordable(15, 15, 0, 0), 0);
  assert.strictEqual(I.maxAffordable(10, 0, 3, 95), 9);
  assert.strictEqual(I.maxAffordable(15, 15, 0, 100, 0), 0);                 // free copies: nothing to "buy max"
  [NaN, Infinity, -5, 'x'].forEach(function (m) { var v = I.maxAffordable(15, 15, 2, m); assert.ok(ok(v) && v >= 0, String(m)); });
  var v = I.maxAffordable(15, 15, 0, 1e300); assert.ok(ok(v) && v > 100 && v < 5000, String(v));
});

console.log('away maths');
t('percent is clamped to 0..100 and a non-number never gives NaN', function () {
  assert.strictEqual(I.awayEarnings(10, 100, { percent: 250 }), 1000); assert.strictEqual(I.awayEarnings(10, 100, { percent: -20 }), 0);
  assert.strictEqual(I.tickEarnings(105, { percent: 250 }), 5 + 100); assert.strictEqual(I.tickEarnings(105, { percent: -5 }), 5);
  ['abc', NaN, {}, [], true].forEach(function (p) {
    assert.strictEqual(I.awayEarnings(10, 100, { percent: p }), 500, 'away ' + String(p)); assert.strictEqual(I.tickEarnings(105, { percent: p }), 5 + 50, 'tick ' + String(p));
  });
  assert.strictEqual(I.awayEarnings(10, 100, { percent: Infinity }), 1000); assert.strictEqual(I.awayEarnings(10, 100, { percent: 0 }), 0);
});
t('away income never returns Infinity or NaN', function () {
  [[Infinity, 100], [1e308, 3600], [10, Infinity], [NaN, 5], [5, NaN], [1e300, 1e300]].forEach(function (a) {
    var v = I.awayEarnings(a[0], a[1]); assert.ok(ok(v) && v >= 0, a + ' -> ' + v);
  });
  assert.ok(ok(I.tickEarnings(Infinity)) && ok(I.tickEarnings(1e300, { capSec: Infinity })));
  assert.ok(ok(I.awayEarnings(1, 100, { capSec: NaN })));
});
t('RateBook never hands out NaN or Infinity', function () {
  var b = I.RateBook(function () { return { pc: NaN, ps: Infinity, name: 'x' }; }); var r = b.get();
  assert.ok(ok(r.pc) && ok(r.ps) && r.name === 'x'); assert.ok(ok(I.RateBook(function () { return NaN; }).get()));
});
t('awayClock: gap, cap, negative and impossible jumps', function () {
  var T = 1e12, c = I.awayClock({ now: function () { return T; } });
  assert.strictEqual(c.show(), 0);                                          // no stamp yet
  assert.strictEqual(c.hide(), T); T += 90 * 1000; assert.strictEqual(c.stamp, 1e12);
  assert.strictEqual(c.show(), 90); assert.strictEqual(c.stamp, 0); assert.strictEqual(c.show(), 0);   // read once
  c.hide(); T += 20 * 3600 * 1000; assert.strictEqual(c.show(), 8 * 3600);   // the 8 h cap
  c.hide(); T -= 5000; assert.strictEqual(c.show(), 0);                      // clock moved back
  c.hide(); T += 400 * 86400 * 1000; assert.strictEqual(c.show(), 0);        // 400 days: impossible, ignored
  assert.strictEqual(c.since(T - 3600 * 1000), 3600); assert.strictEqual(c.since(T + 9999), 0); assert.strictEqual(c.since(NaN), 0); assert.strictEqual(c.since('x'), 0);
  assert.strictEqual(I.awayClock({ capSec: 60, now: function () { return 200000; } }).since(0), 0);
  var c2 = I.awayClock({ capSec: 60, now: function () { return 1e6; } }); assert.strictEqual(c2.since(1e6 - 600000), 60);
  assert.strictEqual(c2.hide(5000), 5000); assert.strictEqual(c2.show(35000), 30);
  c2.stamp = 'junk'; assert.strictEqual(c2.stamp, 0);
  assert.strictEqual(I.awayClock({ now: function () { throw new Error('x'); } }).show(), 0);
  assert.ok(I.awayClock().hide() > 1e12);                                    // default clock is Date.now
});

console.log('BoostQueue');
t('a negative time step does not grow a boost past its maximum', function () {
  var q = I.BoostQueue({ a: { secs: 20, max: 60 } }); q.give('a'); q.give('a'); q.give('a');
  q.tick(-100); assert.strictEqual(q.state.time.a, 60); q.tick(-1e9); assert.ok(q.state.time.a <= 60);
});
t('NaN, undefined and Infinity steps never erase or corrupt a boost', function () {
  var q = I.BoostQueue({ a: { secs: 20, max: 60 } }); q.give('a'); q.tick(NaN); q.tick(undefined); q.tick(null); q.tick({});
  assert.strictEqual(q.state.time.a, 20); assert.strictEqual(q.active, 'a');
  var r = q.tick(Infinity); assert.strictEqual(r.ended, 'a'); assert.strictEqual(q.state.time.a, 0);
});
t('a saved state of {} (or junk) does not throw', function () {
  [{}, { time: null }, { time: 5, active: 7 }, { time: { a: NaN, b: 'x', c: -4, d: Infinity } }, [], 'junk', 42, null].forEach(function (saved) {
    var q = I.BoostQueue({ a: { secs: 20, max: 60 } }, saved);
    assert.strictEqual(q.give('a'), 'start'); q.tick(1); assert.ok(ok(q.state.time.a)); assert.strictEqual(q.active, 'a');
  });
  var s = {}; var q2 = I.BoostQueue({}, s); q2.give('x'); assert.strictEqual(s.time.x, 20);            // the object you passed is the live state
  assert.ok(I.BoostQueue(null, {}).give('z') === 'start');
});
t('a saved state with too much time is cut to the maximum, old saves without "order" still work', function () {
  var q = I.BoostQueue({ a: { secs: 20, max: 60 } }, { time: { a: 500 }, active: 'a' }); assert.strictEqual(q.state.time.a, 60); assert.strictEqual(q.active, 'a');
  var q2 = I.BoostQueue({ a: {}, b: {} }, { time: { a: 0, b: 30 }, active: '' }); assert.strictEqual(q2.tick(1).started, 'b');
});
t('the next boost is the one given first, not the one with the smallest key', function () {
  var q = I.BoostQueue({}); q.give('b'); q.give('a'); q.give('10'); q.give('2');       // 'b' runs; then a, 10, 2 in this order
  assert.strictEqual(q.active, 'b'); var r = q.tick(20); assert.strictEqual(r.ended, 'b'); assert.strictEqual(r.started, 'a');
  r = q.tick(20); assert.strictEqual(r.ended, 'a'); assert.strictEqual(r.started, '10');   // numeric-looking keys sort first in a plain object
  r = q.tick(20); assert.strictEqual(r.started, '2'); r = q.tick(20); assert.strictEqual(r.ended, '2'); assert.strictEqual(q.active, '');
  // the order survives a save and load
  var p = I.BoostQueue({}); p.give('z'); p.give('y'); p.give('x'); var copy = JSON.parse(JSON.stringify(p.state)); var p2 = I.BoostQueue({}, copy);
  assert.strictEqual(p2.tick(20).started, 'y');
});
t('boost behavior kept: one runs, others wait, caps', function () {
  var q = I.BoostQueue({ a: { secs: 20, max: 60 }, b: { secs: 20, max: 60 } });
  assert.strictEqual(q.give('a'), 'start'); assert.strictEqual(q.give('a'), 'more'); assert.strictEqual(q.give('b'), 'next'); assert.strictEqual(q.state.time.a, 40);
  var r = q.tick(40); assert.strictEqual(r.ended, 'a'); assert.strictEqual(r.started, 'b'); r = q.tick(20); assert.strictEqual(r.ended, 'b'); assert.strictEqual(q.active, '');
  for (var i = 0; i < 10; i++) q.give('a'); assert.strictEqual(q.state.time.a, 60);
  assert.strictEqual(I.BoostQueue({ a: { secs: 0 } }).give('a'), '');
  assert.strictEqual(I.BoostQueue({}).give('constructor'), 'start');
});

console.log('stages');
t('stageProgress with equal thresholds is 0 or 1, never NaN', function () {
  assert.strictEqual(I.stageProgress(5, [0, 10, 10, 20], 1), 0); assert.strictEqual(I.stageProgress(10, [0, 10, 10, 20], 1), 1); assert.strictEqual(I.stageProgress(15, [0, 10, 10, 20], 1), 1);
  assert.strictEqual(I.stageProgress(NaN, [0, 10], 0), 0); assert.strictEqual(I.stageProgress(5, [0, 10], 0), 0.5); assert.strictEqual(I.stageProgress(5, [0, 10], 1), 1);
  assert.strictEqual(I.stageProgress(5, null, 0), 1); assert.strictEqual(I.stageIndex(5, null), 0);
});

console.log('formatting');
t('formatBig never prints 1000Sx (or 1000 of any tier)', function () {
  assert.strictEqual(I.formatBig(9.99996e23), '1.00e24'); assert.strictEqual(I.formatBig(9.996e23), '999.6Sx');
  assert.strictEqual(I.formatBig(999999999), '1B'); assert.strictEqual(I.formatBig(1e21), '1Sx');
  var R = rng(3), i; for (i = 0; i < 4000; i++) { var n = Math.pow(10, 6 + R() * 19) * (R() < 0.5 ? 1 : 0.9999999); var s = I.formatBig(n); assert.ok(!/(^|[^0-9.])1000(\.0+)?[A-Za-z]/.test(s) && !/1000[A-Za-z]/.test(s), n + ' -> ' + s); }
});
t('formatBig handles NaN, negatives, Infinity, strings', function () {
  assert.strictEqual(I.formatBig(NaN), '0'); assert.strictEqual(I.formatBig(undefined), '0'); assert.strictEqual(I.formatBig(null), '0'); assert.strictEqual(I.formatBig(Infinity), 'Infinity'); assert.strictEqual(I.formatBig(-Infinity), '-Infinity');
  assert.strictEqual(I.formatBig(-5e6), '-5M'); assert.strictEqual(I.formatBig(-1234), '-1,234'); assert.strictEqual(I.formatBig(-2.5e9), '-2.5B'); assert.strictEqual(I.formatBig(-0.4), '0');
  assert.strictEqual(I.formatBig('1500000'), '1.5M'); assert.strictEqual(I.formatBig({}), '0');
  assert.strictEqual(I.formatBig(1234), '1,234'); assert.strictEqual(I.formatBig(1500000), '1.5M'); assert.strictEqual(I.formatBig(1.234e24), '1.23e24'); assert.strictEqual(I.formatBig(2.5e9), '2.5B');
});
t('formatRate handles NaN and negatives, keeps one decimal (two below 1)', function () {
  assert.strictEqual(I.formatRate(NaN), '0'); assert.strictEqual(I.formatRate(-3e6), '-3M'); assert.strictEqual(I.formatRate(-2.5), '-2.5'); assert.strictEqual(I.formatRate(-0.01), '-0.01'); assert.strictEqual(I.formatRate(-0.004), '0'); assert.strictEqual(I.formatRate(0.04), '0.04'); assert.strictEqual(I.formatRate(0.5), '0.5'); assert.strictEqual(I.formatRate(0.999), '1'); assert.strictEqual(I.formatRate(999999.96), '1M'); assert.strictEqual(I.formatRate(999999.94), '999,999.9');
  assert.strictEqual(I.formatRate(1234.56), '1,234.6'); assert.strictEqual(I.formatRate(9.99996e23), '1.00e24'); assert.strictEqual(I.formatRate(Infinity), 'Infinity');
});
t('formatTime shows days and survives NaN', function () {
  assert.strictEqual(I.formatTime(400000), '4d 15h'); assert.strictEqual(I.formatTime(86400), '1d 0h'); assert.strictEqual(I.formatTime(86399), '23h 59m');
  assert.strictEqual(I.formatTime(NaN), '0 sec'); assert.strictEqual(I.formatTime(-5), '0 sec'); assert.strictEqual(I.formatTime(undefined), '0 sec'); assert.strictEqual(I.formatTime(Infinity), 'Infinity');
  assert.strictEqual(I.formatTime(7980), '2h 13m'); assert.strictEqual(I.formatTime(40), '40 sec'); assert.strictEqual(I.formatTime(125), '2 min'); assert.strictEqual(I.formatTime(0), '0 sec');
});

t('buyPlan: one copy, exact counts and the can flag', function () {
  var one = I.buyPlan(100, 10, 0, 1, 99, 1); assert.deepStrictEqual(one, { n: 1, total: 100, can: false });
  assert.deepStrictEqual(I.buyPlan(100, 10, 0, 1, 100, 1), { n: 1, total: 100, can: true });
  var ten = I.buyPlan(100, 10, 0, 1, 1e9, 10); assert.strictEqual(ten.n, 10); assert.strictEqual(ten.can, true);
  var short = I.buyPlan(100, 10, 0, 1, ten.total - 1, 10); assert.strictEqual(short.n, 10); assert.strictEqual(short.total, ten.total); assert.strictEqual(short.can, false);
});
t('buyPlan totals equal buying one at a time, in every case of a grid (costOfMany does not)', function () {
  var cases = 0, differ = 0;
  [10, 15, 100, 333, 1000].forEach(function (base) { [5, 10, 15, 20].forEach(function (rise) { [1, 0.9, 0.4].forEach(function (disc) { [0, 3, 17].forEach(function (own) { [2, 10, 100].forEach(function (n) {
    var sum = 0, k; for (k = 0; k < n; k++) sum += I.upgradeCost(base, rise, own + k, disc);
    var plan = I.buyPlan(base, rise, own, disc, Infinity, n, 100);
    assert.strictEqual(plan.total, sum, [base, rise, disc, own, n].join(' ')); assert.strictEqual(plan.n, n);
    cases++; if (I.costOfMany(base, rise, own, n, disc) !== sum) differ++;
  }); }); }); }); });
  assert.strictEqual(cases, 540); assert.ok(differ > 0, 'costOfMany rounds the bundle once, so it differs from single purchases in some cases (' + differ + ' of ' + cases + ')');
});
t('buyPlan max: as many as the money covers, capped, never zero copies', function () {
  var R = rng(21), i;
  for (i = 0; i < 300; i++) {
    var base = 1 + Math.floor(R() * 2000), rise = 1 + Math.floor(R() * 25), owned = Math.floor(R() * 40), disc = R() < 0.3 ? 0.5 + R() / 2 : null, money = Math.floor(Math.pow(10, R() * 9));
    var n = 0, total = 0, c; while (n < 100 && total + (c = I.upgradeCost(base, rise, owned + n, disc)) <= money) { total += c; n++; }
    var plan = I.buyPlan(base, rise, owned, disc, money, 'max');
    if (n) assert.deepStrictEqual(plan, { n: n, total: total, can: true }); else assert.deepStrictEqual(plan, { n: 1, total: I.upgradeCost(base, rise, owned, disc), can: false });
    assert.deepStrictEqual(I.buyPlan(base, rise, owned, disc, money, 0), plan);
  }
  assert.strictEqual(I.buyPlan(10, 1, 0, 1, 1e12, 'max').n, 100); assert.strictEqual(I.buyPlan(10, 1, 0, 1, 1e12, 'max', 5).n, 5);
  assert.strictEqual(I.buyPlan(10, 1, 0, 1, 1e12, 'max', 1e9).n, 1000);
});
t('buyPlan: broken numbers do not escape', function () {
  var p = I.buyPlan(NaN, NaN, -3, NaN, NaN, NaN, NaN); assert.ok(isFinite(p.total) && p.n >= 1);
  assert.strictEqual(I.buyPlan(15, 15, 0, 1, NaN, 10).can, false);
  var big = I.buyPlan(15, 50, 5000, 1, 1e300, 100); assert.ok(isFinite(big.total) && big.total <= I.LIMIT);
});

console.log('1.2.0: numbers given as text, copies, carry-over');
t('numbers given as text (from a form or a save) work like numbers', function () {
  assert.deepStrictEqual(I.buyPlan(15, 15, 3, 1, 1e6, '10'), I.buyPlan(15, 15, 3, 1, 1e6, 10));
  assert.deepStrictEqual(I.buyPlan(15, 15, 3, 1, 1e6, 'MAX'), I.buyPlan(15, 15, 3, 1, 1e6, 'max'));
  assert.deepStrictEqual(I.buyPlan(15, 15, 3, 1, 1e6, 'Max', '5'), I.buyPlan(15, 15, 3, 1, 1e6, 'max', 5));
  assert.strictEqual(I.costOfMany(15, 15, 3, '10'), I.costOfMany(15, 15, 3, 10));
  assert.strictEqual(I.maxAffordable(15, 15, 3, '5000'), I.maxAffordable(15, 15, 3, 5000));
  assert.strictEqual(I.upgradeCost(15, 15, '3'), I.upgradeCost(15, 15, 3));
  assert.strictEqual(I.awayEarnings('10', '100'), 500); assert.strictEqual(I.tickEarnings('105'), 5 + 50);
  assert.strictEqual(I.buyPlan(15, 15, 3, 1, 1e6, 'abc').n, 1);                   // text that is not a number still means 1
});
t('RateBook cleans a copy: a frozen result works and your own object is not changed', function () {
  var own = Object.freeze({ a: NaN, b: Infinity, c: 7, d: 'x' }), book = I.RateBook(function () { return own; }), got = book.get();
  assert.strictEqual(got.a, 0); assert.strictEqual(got.b, I.LIMIT); assert.strictEqual(got.c, 7); assert.strictEqual(got.d, 'x'); assert.ok(Number.isNaN(own.a));
  assert.strictEqual(book.get(), got);                                              // still remembered until invalidate()
  var arr = I.RateBook(function () { return [1, NaN, 3]; }).get(); assert.ok(Array.isArray(arr)); assert.deepStrictEqual(arr, [1, 0, 3]);
  assert.strictEqual(I.RateBook(function () { return NaN; }).get(), 0); assert.strictEqual(I.RateBook(function () { return null; }).get(), null);
});
t('a long boost step carries its leftover into the next boost', function () {
  function mk() { var q = I.BoostQueue({ a: { secs: 20, max: 60 }, b: { secs: 20, max: 60 }, c: { secs: 20, max: 60 } }); q.give('a'); q.give('b'); q.give('c'); return q; }
  var q = mk(), r = q.tick(30); assert.strictEqual(q.state.time.b, 10); assert.strictEqual(q.active, 'b');
  assert.strictEqual(r.ended, 'a'); assert.deepStrictEqual(r.endedAll, ['a']); assert.strictEqual(r.started, 'b');
  q = mk(); r = q.tick(50); assert.deepStrictEqual(r.endedAll, ['a', 'b']); assert.strictEqual(r.ended, 'a'); assert.strictEqual(r.started, 'c'); assert.strictEqual(q.state.time.c, 10);
  q = mk(); r = q.tick(1e9); assert.deepStrictEqual(r.endedAll, ['a', 'b', 'c']); assert.strictEqual(r.started, null); assert.strictEqual(q.active, ''); assert.deepStrictEqual(q.state.order, []);
  q = mk(); q.tick(30); q.tick(5); assert.strictEqual(q.state.time.b, 5);            // small steps still count one boost at a time
  var one = I.BoostQueue({ a: { secs: 20 } }); one.give('a'); r = one.tick(25); assert.strictEqual(r.ended, 'a'); assert.strictEqual(r.started, null);
});
console.log('1.2.0: Max and thousands separators against references');
t('buyPlan Max by multiplication equals buying one at a time (count and can), total within 1e-13', function () {
  var r = rng(7), worst = 0, bad = 0, i;
  for (i = 0; i < 3000; i++) {
    var base = Math.floor(r() * 5000) + 1, rise = [1, 5, 7, 10, 15, 25, 100][Math.floor(r() * 7)], owned = Math.floor(r() * 400), disc = r() < 0.3 ? r() + 0.1 : 1, money = Math.pow(10, r() * 15) * base;
    var n = 0, total = 0;
    for (var k = 0; k < 100; k++) { var c = I.upgradeCost(base, rise, owned + k, disc); if (total + c > money) break; total += c; n++; }
    var plan = I.buyPlan(base, rise, owned, disc, money, 'max');
    if (n === 0) { assert.strictEqual(plan.can, false); continue; }
    assert.strictEqual(plan.n, n, [base, rise, owned, disc, money].join()); assert.strictEqual(plan.can, true);
    var rel = Math.abs(plan.total - total) / total; if (rel > worst) worst = rel; if (plan.total !== total) bad++;
  }
  assert.ok(worst < 1e-13, 'worst relative gap ' + worst);
});
t('formatBig and formatRate match Intl.NumberFormat for whole numbers under a million', function () {
  var nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }), nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }), r = rng(11), i, v;
  for (i = 0; i < 20000; i++) { v = Math.floor(r() * 1e6); assert.strictEqual(I.formatBig(v), nf.format(v)); }
  for (i = 0; i < 20000; i++) { v = Math.floor(r() * 1e6 * 10) / 10 + 1; assert.strictEqual(I.formatRate(v), nf1.format(v), String(v)); }
  [0, 1, 12, 999, 1000, 1234, 99999, 100000, 999999].forEach(function (x) { assert.strictEqual(I.formatBig(x), nf.format(x)); });
});

console.log('1.2.0: planning helpers');
t('etaSec and paybackSec', function () {
  assert.strictEqual(I.etaSec(100, 40, 3), 20); assert.strictEqual(I.etaSec(100, 100, 3), 0); assert.strictEqual(I.etaSec(100, 400, 0), 0);
  assert.strictEqual(I.etaSec(100, 40, 0), Infinity); assert.strictEqual(I.etaSec(100, 40, -2), Infinity); assert.strictEqual(I.etaSec(100, 40, '2'), 30);
  assert.strictEqual(I.etaSec(NaN, NaN, NaN), 0);
  assert.strictEqual(I.paybackSec(300, 5), 60); assert.strictEqual(I.paybackSec(300, 0), Infinity); assert.strictEqual(I.paybackSec(300, -1), Infinity); assert.strictEqual(I.paybackSec(-5, 2), 0);
  [NaN, Infinity, 'x', null, undefined].forEach(function (v) { assert.ok(!Number.isNaN(I.etaSec(v, v, v)) && !Number.isNaN(I.paybackSec(v, v))); });
});
t('prestigeGain follows the known curves, and round trips with prestigeNeeded', function () {
  assert.strictEqual(I.prestigeGain(1e12, 1e12, 3), 1); assert.strictEqual(I.prestigeGain(1e15, 1e12, 3), 10);            // Cookie Clicker: the cube root of 1000 is 9.999...
  assert.strictEqual(I.prestigeGain(8e12, 1e12, 3), 2); assert.strictEqual(I.prestigeGain(0, 1e12, 3), 0); assert.strictEqual(I.prestigeGain(-5, 1e12, 3), 0);
  assert.strictEqual(I.prestigeGain(1e15, 1e15, 2, 150), 150); assert.strictEqual(I.prestigeGain(4e15, 1e15, 2, 150), 300);   // AdVenture Capitalist
  assert.strictEqual(I.prestigeGain(1e6, 1e6, 7 / 50), 1);
  var r = rng(3), i;
  for (i = 0; i < 15000; i++) {
    var root = [2, 3, 4, 1 / 0.14][i % 4], scale = Math.pow(10, Math.floor(r() * 12)), mult = i % 5 === 0 ? 150 : 1, pts = 1 + Math.floor(r() * 200000);
    assert.strictEqual(I.prestigeGain(I.prestigeNeeded(pts, scale, root, mult), scale, root, mult), pts, [pts, scale, root, mult].join());
  }
  assert.strictEqual(I.prestigeNeeded(0, 1e12, 3), 0); assert.ok(ok(I.prestigeNeeded(1e300, 1, 9, 1)) && ok(I.prestigeGain(Infinity, 1, 2)));
  [NaN, 'x', null, undefined, -3, 0].forEach(function (v) { assert.ok(ok(I.prestigeGain(1e9, v, v, v)) && ok(I.prestigeNeeded(5, v, v, v))); });
});
t('fastForward runs the game step in chunks and stops at a time budget', function () {
  var calls = 0, total = 0, out = I.fastForward(function (dt) { calls++; total += dt; }, 3600, { chunk: 5 });
  assert.strictEqual(calls, 720); assert.ok(Math.abs(total - 3600) < 1e-6); assert.strictEqual(out.skipped, 0); assert.ok(Math.abs(out.simulated - 3600) < 1e-6);
  calls = 0; total = 0; out = I.fastForward(function (dt) { calls++; total += dt; }, 12, { chunk: 5 }); assert.strictEqual(calls, 3); assert.ok(Math.abs(total - 12) < 1e-9);
  var spin = 0; out = I.fastForward(function () { var t = Date.now(); while (Date.now() - t < 2) spin++; }, 1e6, { chunk: 1, budgetMs: 20 });
  assert.ok(out.skipped > 0 && out.simulated > 0 && out.simulated < 100, 'simulated ' + out.simulated);
  assert.deepStrictEqual(I.fastForward(null, 60), { simulated: 0, skipped: 60 }); assert.deepStrictEqual(I.fastForward(function () {}, NaN), { simulated: 0, skipped: 0 });
  assert.deepStrictEqual(I.fastForward(function () { throw new Error('x'); }, 0), { simulated: 0, skipped: 0 });
});

console.log(fail ? fail + ' FAILED, ' + pass + ' passed' : 'all ' + pass + ' passed');
process.exit(fail ? 1 : 0);
