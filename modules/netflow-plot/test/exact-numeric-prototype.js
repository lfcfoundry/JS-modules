/* Copyright (c) 2026 LFC Foundry. MIT License. Isolated numeric prototype; not used by netflow-plot. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetflowExactNumericPrototype = factory();
}(this, function () {
  'use strict';

  var buffer = null, view = null, B = null, ZERO = null, ONE = null, TWO = null, MAX_UNITS = null, TWO_52 = null, TWO_53 = null;

  function needBigInt() {
    if (typeof BigInt !== 'function') throw new Error('This prototype requires the BigInt runtime feature.');
    if (!buffer) {
      B = BigInt;
      ZERO = B(0); ONE = B(1); TWO = B(2);
      TWO_52 = ONE << B(52); TWO_53 = ONE << B(53);
      buffer = new ArrayBuffer(8); view = new DataView(buffer);
      MAX_UNITS = bitsOfFloat(Number.MAX_VALUE);
    }
  }

  /* Exact integer count of 2^-1074 units in a finite IEEE-754 binary64. */
  function bitsOfFloat(x) {
    var hi, lo, e, frac, sig, units;
    view.setFloat64(0, Math.abs(x), false);
    hi = view.getUint32(0, false); lo = view.getUint32(4, false);
    e = (hi >>> 20) & 0x7FF;
    frac = (B(hi & 0xFFFFF) << B(32)) | B(lo);
    if (e === 0) units = frac;
    else { sig = (ONE << B(52)) | frac; units = sig << B(e - 1); }
    return x < 0 ? -units : units;
  }

  function bitLength(n) { return n === ZERO ? 0 : n.toString(2).length; }

  function roundQuotient(n, d) {
    var q = n / d, r = n % d, twice = r << ONE;
    if (twice > d || (twice === d && (q & ONE) === ONE)) q++;
    return q;
  }

  function floorLog2Ratio(n, d) {
    var e = bitLength(n) - bitLength(d);
    if (e >= 0) { if (n < (d << B(e))) e--; }
    else if ((n << B(-e)) < d) e--;
    return e;
  }

  /* Round (n / d) * 2^-1074 to binary64, ties to even. Inputs are nonnegative. */
  function unitsRatioToNumber(n, d) {
    var e, shift, q, magnitude;
    if (n === ZERO) return 0;
    e = floorLog2Ratio(n, d);
    if (e < 52) {
      q = roundQuotient(n, d);
      return Number(q) * Number.MIN_VALUE;
    }
    shift = e - 52;
    q = roundQuotient(n, d << B(shift));
    if (q === TWO_53) { q = q >> ONE; shift++; }
    magnitude = Number(q) * Math.pow(2, shift - 1074);
    return magnitude;
  }

  function numericResult(units, denominator) {
    var negative = units < ZERO, n = negative ? -units : units, d = denominator === undefined ? ONE : B(denominator), value;
    if (n > MAX_UNITS * d) return { status: 'out-of-range', value: null };
    value = unitsRatioToNumber(n, d);
    return { status: 'finite', value: negative ? -value : value };
  }

  function createAccumulator() {
    needBigInt();
    var units = ZERO, count = 0;
    return {
      add: function (value) {
        if (typeof value !== 'number' || !isFinite(value)) throw new TypeError('The prototype accepts finite JavaScript Numbers only.');
        units += bitsOfFloat(value); count++; return this;
      },
      result: function () { return numericResult(units); },
      mean: function () { return count ? numericResult(units, count) : { status: 'empty', value: null }; },
      ratioTo: function (denominator) {
        var d = denominator && typeof denominator._getUnits === 'function' ? denominator._getUnits() : undefined;
        if (d === undefined || d <= ZERO || units < ZERO || units > d) throw new RangeError('A bounded ratio requires 0 <= numerator <= positive denominator.');
        return ratioToNumber(units, d);
      },
      _units: units,
      _getUnits: function () { return units; },
      count: function () { return count; }
    };
  }

  function accumulate(values) {
    var a = createAccumulator(), i;
    for (i = 0; i < values.length; i++) a.add(values[i]);
    return a;
  }

  /* Correctly rounded (numerator / denominator), where both are positive exact integers. */
  function ratioToNumber(n, d) {
    var e, shift, q;
    if (n === ZERO) return 0;
    e = floorLog2Ratio(n, d);
    if (e < -1022) {
      q = roundQuotient(n << B(1074), d);
      return Number(q) * Number.MIN_VALUE;
    }
    shift = 52 - e;
    q = roundQuotient(n << B(shift), d);
    if (q === TWO_53) { q = q >> ONE; e++; }
    return Number(q) * Math.pow(2, e - 52);
  }

  function mean(values) { return accumulate(values).mean(); }

  function medianPair(a, b) {
    if (typeof a !== 'number' || typeof b !== 'number' || !isFinite(a) || !isFinite(b)) throw new TypeError('The prototype accepts finite JavaScript Numbers only.');
    needBigInt();
    return numericResult(bitsOfFloat(a) + bitsOfFloat(b), 2);
  }

  function scaleByPowerOfTwo(value, shift) {
    var out = value, step;
    while (shift > 1023) { step = Math.pow(2, 1023); out *= step; shift -= 1023; }
    while (shift < -1023) { step = Math.pow(2, -1023); out *= step; shift += 1023; }
    return out * Math.pow(2, shift);
  }

  function axisDomain(lo, hi, screenLo, screenHi) {
    var maxAbs, exponent, scaledLo, scaledHi, span;
    if (typeof lo !== 'number' || typeof hi !== 'number' || !isFinite(lo) || !isFinite(hi) || hi < lo) throw new RangeError('Axis endpoints must be finite numbers in ascending order.');
    if (typeof screenLo !== 'number' || typeof screenHi !== 'number' || !isFinite(screenLo) || !isFinite(screenHi)) throw new RangeError('Screen endpoints must be finite numbers.');
    maxAbs = Math.max(Math.abs(lo), Math.abs(hi));
    exponent = maxAbs ? Math.floor(Math.log(maxAbs) / Math.LN2) : 0;
    while (maxAbs && scaleByPowerOfTwo(maxAbs, -exponent) >= 2) exponent++;
    while (maxAbs && scaleByPowerOfTwo(maxAbs, -exponent) < 1) exponent--;
    scaledLo = scaleByPowerOfTwo(lo, -exponent);
    scaledHi = scaleByPowerOfTwo(hi, -exponent);
    span = scaledHi - scaledLo;
    return {
      exponent: exponent,
      scaledLo: scaledLo,
      scaledHi: scaledHi,
      map: function (value) {
        var position, mapped;
        if (typeof value !== 'number' || !isFinite(value)) throw new RangeError('Axis values must be finite numbers.');
        if (hi === lo) return screenLo;
        position = (scaleByPowerOfTwo(value, -exponent) - scaledLo) / span;
        /* Avoid overflowing screenHi-screenLo when the finite range crosses zero. */
        if ((screenLo < 0 && screenHi > 0) || (screenLo > 0 && screenHi < 0)) {
          mapped = screenLo * (1 - position) + screenHi * position;
        } else {
          mapped = screenLo + position * (screenHi - screenLo);
        }
        if (!isFinite(mapped)) throw new RangeError('Mapped axis coordinate is outside the finite Number range.');
        return mapped;
      }
    };
  }

  return {
    available: function () { return typeof BigInt === 'function'; },
    createAccumulator: createAccumulator,
    accumulate: accumulate,
    mean: mean,
    medianPair: medianPair,
    axisDomain: axisDomain
  };
}));
