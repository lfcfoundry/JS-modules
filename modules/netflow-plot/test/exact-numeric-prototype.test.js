/* Copyright (c) 2026 LFC Foundry. MIT License. Focused checks for the isolated exact numeric prototype. */
'use strict';

const assert = require('assert');
const Exact = require('./exact-numeric-prototype.js');

assert.strictEqual(Exact.available(), true, 'this runtime exposes BigInt');

function exact(values) { return Exact.accumulate(values).result(); }
function close(actual, expected, tolerance, message) {
  assert.ok(Number.isFinite(actual), message + ': result must be finite');
  assert.ok(Math.abs(actual - expected) <= tolerance, message + ': got ' + actual + ', expected ' + expected);
}

/* Exact sums do not depend on input order, including cancellation. */
assert.deepStrictEqual(exact([1e308, 1, -1e308]), { status: 'finite', value: 1 });
assert.deepStrictEqual(exact([1e308, -1e308, 1]), { status: 'finite', value: 1 });
assert.deepStrictEqual(exact([Number.MAX_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE]), { status: 'finite', value: Number.MAX_VALUE });
assert.deepStrictEqual(exact([Number.MAX_VALUE, -Number.MAX_VALUE]), { status: 'finite', value: 0 });
assert.deepStrictEqual(exact([-Number.MAX_VALUE, -Number.MAX_VALUE]), { status: 'out-of-range', value: null });
assert.deepStrictEqual(exact([1e308, -1e308, Number.MAX_VALUE, -Number.MAX_VALUE, 7]), { status: 'finite', value: 7 });

/* A true overflow is represented as a status, never as Infinity or NaN. */
const tooLarge = Exact.accumulate([1e308, 1e308]).result();
assert.deepStrictEqual(tooLarge, { status: 'out-of-range', value: null });
assert.ok(tooLarge.value === null || Number.isFinite(tooLarge.value));

/* Representable conversion and ordinary decimal compatibility. */
assert.deepStrictEqual(exact([Number.MAX_VALUE]), { status: 'finite', value: Number.MAX_VALUE });
assert.deepStrictEqual(exact([Number.MIN_VALUE]), { status: 'finite', value: Number.MIN_VALUE });
assert.deepStrictEqual(exact([0.1, 0.2]), { status: 'finite', value: 0.30000000000000004 });
assert.deepStrictEqual(exact([12, -2.5, 0.25]), { status: 'finite', value: 9.75 });

/* Mean divides the extended sum before conversion; even median avoids b-a overflow. */
assert.deepStrictEqual(Exact.mean([1e308, 1e308]), { status: 'finite', value: 1e308 });
assert.deepStrictEqual(Exact.mean([Number.MAX_VALUE, Number.MAX_VALUE]), { status: 'finite', value: Number.MAX_VALUE });
assert.deepStrictEqual(Exact.mean([1e308, 1, -1e308]), { status: 'finite', value: 1 / 3 });
assert.deepStrictEqual(Exact.medianPair(-1e308, 1e308), { status: 'finite', value: 0 });
assert.deepStrictEqual(Exact.medianPair(2, 4), { status: 'finite', value: 3 });

/* Bounded ratios can be computed from exact totals beyond Number.MAX_VALUE. */
const huge = Exact.accumulate([1e308, 1e308]);
const half = Exact.accumulate([1e308]);
assert.strictEqual(half.ratioTo(huge), 0.5);
const thirds = Exact.accumulate([1]).ratioTo(Exact.accumulate([3]));
close(thirds, 1 / 3, 1e-16, 'one third ratio');

/* The common power-of-two scale makes an overflowing finite domain safe to map. */
const extremeAxis = Exact.axisDomain(-1e308, 1e308, 10, 510);
assert.ok(Number.isFinite(extremeAxis.scaledLo) && Number.isFinite(extremeAxis.scaledHi));
assert.ok(Number.isFinite(extremeAxis.map(-1e308)) && Number.isFinite(extremeAxis.map(0)) && Number.isFinite(extremeAxis.map(1e308)));
close(extremeAxis.map(-1e308), 10, 1e-12, 'extreme low endpoint');
close(extremeAxis.map(0), 260, 1e-12, 'extreme midpoint');
close(extremeAxis.map(1e308), 510, 1e-12, 'extreme high endpoint');
const extremeScreenAxis = Exact.axisDomain(-1, 1, -Number.MAX_VALUE, Number.MAX_VALUE);
assert.ok(Number.isFinite(extremeScreenAxis.map(0)), 'opposite finite screen endpoints map without overflow');
const subnormalAxis = Exact.axisDomain(Number.MIN_VALUE, Number.MIN_VALUE * 2, 0, 100);
close(subnormalAxis.map(Number.MIN_VALUE), 0, 1e-12, 'subnormal low endpoint');
close(subnormalAxis.map(Number.MIN_VALUE * 2), 100, 1e-12, 'subnormal high endpoint');

/* Ordinary finite domains match the existing linear mapping within rounding noise. */
const ordinary = Exact.axisDomain(-20, 80, 5, 305);
[-20, -7, 0, 13.25, 80].forEach((v) => {
  const legacy = 5 + (v - -20) * ((305 - 5) / (80 - -20));
  close(ordinary.map(v), legacy, 1e-12, 'ordinary axis value ' + v);
});
assert.strictEqual(Exact.axisDomain(7, 7, 5, 305).map(99), 5, 'constant domain keeps existing linear behavior');
assert.throws(() => Exact.axisDomain(-Infinity, 1, 0, 1), /finite numbers/);
assert.throws(() => Exact.accumulate([1, Infinity]), /finite JavaScript Numbers/);

console.log('exact numeric prototype: 36 assertions passed');

if (process.argv.indexOf('--bench') >= 0) {
  function nativeSum(values) { let s = 0; for (let i = 0; i < values.length; i++) s += values[i]; return s; }
  function exactSum(values) { return Exact.accumulate(values).result().value; }
  function median(a) { a.sort((x, y) => x - y); return a[a.length >> 1]; }
  function timed(fn, values, rounds) {
    const samples = []; let sink = 0;
    for (let warm = 0; warm < 2; warm++) sink += fn(values);
    for (let r = 0; r < 7; r++) {
      const start = process.hrtime.bigint();
      for (let k = 0; k < rounds; k++) sink += fn(values) || 0;
      samples.push(Number(process.hrtime.bigint() - start) / 1e6 / rounds);
    }
    return { medianMs: +median(samples).toFixed(4), sink: sink };
  }
  [[32, 500], [4096, 30], [50000, 4]].forEach(([size, rounds]) => {
    const values = Array.from({ length: size }, (_, i) => ((i % 29) - 14) / 7);
    const native = timed(nativeSum, values, rounds), exactResult = timed(exactSum, values, rounds);
    console.log(JSON.stringify({ size: size, roundsPerSample: rounds, nativeMedianMs: native.medianMs, exactMedianMs: exactResult.medianMs, slowdown: +(exactResult.medianMs / native.medianMs).toFixed(2) }));
  });
}
