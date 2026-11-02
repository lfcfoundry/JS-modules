/* Copyright (c) 2026 LFC Foundry. MIT License. Isolated aggregation prototype. */
'use strict';

var buffer = new ArrayBuffer(8), view = new DataView(buffer), B = typeof BigInt === 'function' ? BigInt : null;
var ZERO = B ? B(0) : null, ONE = B ? B(1) : null, TWO = B ? B(2) : null;
var TWO52 = B ? ONE << B(52) : null, TWO53 = B ? ONE << B(53) : null;

function needBigInt() { if (!B) throw new Error('BigInt accumulator is unavailable in this runtime.'); }
function bitsOfFloat(x) {
  var hi, lo, e, frac, sig, units;
  view.setFloat64(0, Math.abs(x), false); hi = view.getUint32(0, false); lo = view.getUint32(4, false);
  e = (hi >>> 20) & 2047; frac = (B(hi & 0xfffff) << B(32)) | B(lo);
  if (e === 0) units = frac;
  else { sig = TWO52 | frac; units = sig << B(e - 1); }
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
function ratioToNumber(n, d) {
  var e, shift, q;
  if (n === ZERO) return 0;
  e = floorLog2Ratio(n, d);
  if (e < -1022) { q = roundQuotient(n << B(1074), d); return Number(q) * Number.MIN_VALUE; }
  shift = 52 - e;
  q = shift >= 0 ? roundQuotient(n << B(shift), d) : roundQuotient(n, d << B(-shift));
  if (q === TWO53) { q >>= ONE; e++; }
  return Number(q) * Math.pow(2, e - 52);
}
function unitsRatioToNumber(n, d) {
  var e, shift, q;
  if (n === ZERO) return 0;
  e = floorLog2Ratio(n, d);
  if (e < 52) { q = roundQuotient(n, d); return Number(q) * Number.MIN_VALUE; }
  shift = e - 52; q = roundQuotient(n, d << B(shift));
  if (q === TWO53) { q >>= ONE; shift++; }
  return Number(q) * Math.pow(2, shift - 1074);
}
var MAX_UNITS = null, MAX_RATIO = null;
function initLimits() {
  if (MAX_UNITS !== null) return;
  needBigInt();
  MAX_UNITS = bitsOfFloat(Number.MAX_VALUE);
  MAX_RATIO = ((ONE << B(53)) - ONE) << B(971);
}
function finiteResult(n, denominator) {
  var neg = n < ZERO, mag = neg ? -n : n, d = denominator === undefined ? ONE : B(denominator), val;
  initLimits();
  if (mag > MAX_UNITS * d) return { status: 'out-of-range', value: null };
  val = unitsRatioToNumber(mag, d);
  return { status: 'finite', value: neg ? -val : val };
}

function ExactAccumulator() { needBigInt(); this.units = ZERO; this.count = 0; }
ExactAccumulator.prototype.add = function (value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('Accumulator inputs must be finite JavaScript Numbers.');
  if (this.count >= Number.MAX_SAFE_INTEGER) throw new RangeError('Accumulator count exceeds the exact count range.');
  this.units += bitsOfFloat(value); this.count++; return this;
};
ExactAccumulator.prototype.merge = function (other) {
  if (!(other instanceof ExactAccumulator)) throw new TypeError('Can only merge an exact accumulator of the same kind.');
  if (this.count + other.count > Number.MAX_SAFE_INTEGER) throw new RangeError('Merged count exceeds the exact count range.');
  this.units += other.units; this.count += other.count; return this;
};
ExactAccumulator.prototype.compare = function (other) {
  if (!(other instanceof ExactAccumulator)) throw new TypeError('Can only compare an exact accumulator of the same kind.');
  return this.units < other.units ? -1 : this.units > other.units ? 1 : 0;
};
ExactAccumulator.prototype.toNumber = function () { return finiteResult(this.units); };
ExactAccumulator.prototype.mean = function () { return this.count ? finiteResult(this.units, this.count) : { status: 'empty', value: null }; };
ExactAccumulator.prototype.ratioTo = function (other) {
  var n, d, neg;
  if (!(other instanceof ExactAccumulator)) throw new TypeError('Ratio denominator must be an exact accumulator.');
  if (other.units === ZERO) return { status: 'division-by-zero', value: null };
  n = this.units; d = other.units; neg = (n < ZERO) !== (d < ZERO); n = n < ZERO ? -n : n; d = d < ZERO ? -d : d;
  initLimits();
  if (n > d * MAX_RATIO) return { status: 'out-of-range', value: null };
  return { status: 'finite', value: neg ? -ratioToNumber(n, d) : ratioToNumber(n, d) };
};
ExactAccumulator.prototype.exactUnitsForTest = function () { return this.units; };

/* A conservative online certificate. Any rounded or non-finite addition restarts exact. */
function certifiedSum(values) {
  var s = 0, i, x, t, bb, err, fallback = false;
  for (i = 0; i < values.length; i++) {
    x = values[i];
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new TypeError('Certified inputs must be finite Numbers.');
    t = s + x;
    if (!Number.isFinite(t)) { fallback = true; break; }
    bb = t - s; err = (s - (t - bb)) + (x - bb);
    if (err !== 0) { fallback = true; break; }
    s = t;
  }
  if (fallback) { var exact = new ExactAccumulator(); for (i = 0; i < values.length; i++) exact.add(values[i]); return { result: exact.toNumber(), fallback: true, fastAdds: i }; }
  return { result: { status: 'finite', value: s }, fallback: false, fastAdds: values.length };
}

/* BigInt-free exact accumulator. Separate positive/negative radix limbs make merges simple. */
/* Each float contributes at most two <2^26 fragments to a bin. Carry every
   1024 inputs: a bin is then below 2^37, well inside exact integer Number
   arithmetic. Safe-integer count bounds the largest exact sum to 2151 bits
   (83 limbs); arrays grow only to the highest active exponent. */
var RADIX_BITS = 26, RADIX = Math.pow(2, RADIX_BITS), CARRY_EVERY = 1024;
function cloneLimbs(a) { return a.slice(); }
function trim(a) { while (a.length && a[a.length - 1] === 0) a.pop(); return a; }
function normalize(a) {
  var i, q;
  for (i = 0; i < a.length; i++) { if (a[i] === undefined) a[i] = 0; q = Math.floor(a[i] / RADIX); if (q) { a[i] -= q * RADIX; a[i + 1] = (a[i + 1] || 0) + q; } }
  return trim(a);
}
function addAt(a, i, x) { if (!x) return; a[i] = (a[i] || 0) + x; }
function addMagnitudeFloat(a, value) {
  var hi, lo, e, frac, sig, shift, index, offset, chunks, i, part, scaled, low, high;
  view.setFloat64(0, Math.abs(value), false); hi = view.getUint32(0, false); lo = view.getUint32(4, false);
  e = (hi >>> 20) & 2047; frac = (hi & 0xfffff) * 4294967296 + lo;
  sig = e === 0 ? frac : 4503599627370496 + frac; shift = e === 0 ? 0 : e - 1;
  index = Math.floor(shift / RADIX_BITS); offset = shift % RADIX_BITS;
  chunks = [sig % RADIX, Math.floor(sig / RADIX) % RADIX, Math.floor(sig / (RADIX * RADIX))];
  for (i = 0; i < chunks.length; i++) {
    part = chunks[i]; if (!part) continue;
    scaled = part * Math.pow(2, offset); low = scaled % RADIX; high = Math.floor(scaled / RADIX);
    addAt(a, index + i, low); addAt(a, index + i + 1, high);
  }
}
function compareLimbs(a, b) {
  var i = Math.max(a.length, b.length) - 1;
  for (; i >= 0; i--) { var x = a[i] || 0, y = b[i] || 0; if (x !== y) return x < y ? -1 : 1; }
  return 0;
}
function subtractLimbs(a, b) {
  var out = new Array(a.length), borrow = 0, i, v;
  for (i = 0; i < a.length; i++) { v = (a[i] || 0) - (b[i] || 0) - borrow; if (v < 0) { v += RADIX; borrow = 1; } else borrow = 0; out[i] = v; }
  if (borrow) throw new Error('Internal limb subtraction underflow.');
  return trim(out);
}
function bitLengthLimbs(a) {
  if (!a.length) return 0;
  var x = a[a.length - 1], bits = 0; while (x) { bits++; x = Math.floor(x / 2); }
  return (a.length - 1) * RADIX_BITS + bits;
}
function bitAt(a, bit) { var i = Math.floor(bit / RADIX_BITS), b = bit % RADIX_BITS; return Math.floor((a[i] || 0) / Math.pow(2, b)) % 2; }
function anyBitsBelow(a, endExclusive) {
  var full = Math.floor(endExclusive / RADIX_BITS), i, rem;
  for (i = 0; i < full; i++) if (a[i]) return true;
  rem = endExclusive % RADIX_BITS;
  return rem ? ((a[full] || 0) % Math.pow(2, rem)) !== 0 : false;
}
function shiftLimbs(a, shift) {
  if (shift < 0) throw new RangeError('Limb shift must be nonnegative.');
  if (!a.length || !shift) return cloneLimbs(a);
  var whole = Math.floor(shift / RADIX_BITS), part = shift % RADIX_BITS, out = new Array(a.length + whole + (part ? 1 : 0)), carry = 0, i, v;
  for (i = 0; i < a.length; i++) { v = a[i] * Math.pow(2, part) + carry; out[i + whole] = v % RADIX; carry = Math.floor(v / RADIX); }
  if (carry) out[a.length + whole] = carry;
  for (i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = 0;
  return trim(out);
}
function multiplyLimbs(a, b) {
  var out = new Array(a.length + b.length + 1), i, j, v, carry;
  for (i = 0; i < out.length; i++) out[i] = 0;
  for (i = 0; i < a.length; i++) {
    carry = 0;
    /* Limb products plus carry stay below 2^53, so every intermediate is exact. */
    for (j = 0; j < b.length; j++) { v = out[i + j] + a[i] * b[j] + carry; out[i + j] = v % RADIX; carry = Math.floor(v / RADIX); }
    j = i + b.length;
    while (carry) { v = out[j] + carry; out[j] = v % RADIX; carry = Math.floor(v / RADIX); j++; }
  }
  return trim(out);
}
function divideRounded(a, b) {
  var rem = cloneLimbs(a), q = 0, diff = bitLengthLimbs(rem) - bitLengthLimbs(b), i, shifted, cmp, twice;
  for (i = diff; i >= 0; i--) { shifted = shiftLimbs(b, i); cmp = compareLimbs(rem, shifted); if (cmp >= 0) { rem = subtractLimbs(rem, shifted); q += Math.pow(2, i); } }
  twice = shiftLimbs(rem, 1); cmp = compareLimbs(twice, b);
  if (cmp > 0 || (cmp === 0 && q % 2 === 1)) q++;
  return q;
}
function log2RatioLimbs(a, b) {
  var e = bitLengthLimbs(a) - bitLengthLimbs(b);
  if (e >= 0) { if (compareLimbs(a, shiftLimbs(b, e)) < 0) e--; }
  else if (compareLimbs(shiftLimbs(a, -e), b) < 0) e--;
  return e;
}
function rationalToNumberLimbs(a, b, scale) {
  if (!a.length) return 0;
  var e = log2RatioLimbs(a, b) + scale, q, shift;
  if (e < -1022) { shift = scale + 1074; q = shift >= 0 ? divideRounded(shiftLimbs(a, shift), b) : divideRounded(a, shiftLimbs(b, -shift)); return q * Number.MIN_VALUE; }
  shift = 52 - (e - scale);
  q = shift >= 0 ? divideRounded(shiftLimbs(a, shift), b) : divideRounded(a, shiftLimbs(b, -shift));
  if (q === 9007199254740992) { q /= 2; e++; }
  return q * Math.pow(2, e - 52);
}
function maxUnitsLimbs() { var a = []; addMagnitudeFloat(a, Number.MAX_VALUE); return normalize(a); }
function maxRatioLimbs() { var a = [], mantissa = 9007199254740991, chunks = [mantissa % RADIX, Math.floor(mantissa / RADIX) % RADIX, Math.floor(mantissa / (RADIX * RADIX))]; for (var i=0;i<chunks.length;i++) addAt(a,i,chunks[i]); return normalize(shiftLimbs(a,971)); }
var LIMB_MAX_UNITS = maxUnitsLimbs(), LIMB_MAX_RATIO = maxRatioLimbs();
function signedMagnitude(pos, neg) { var c = compareLimbs(pos, neg); return c >= 0 ? { sign: c ? 1 : 0, mag: subtractLimbs(pos, neg) } : { sign: -1, mag: subtractLimbs(neg, pos) }; }
function LimbAccumulator() { this.pos = []; this.neg = []; this.count = 0; this.pending = 0; }
LimbAccumulator.prototype._carry = function () { normalize(this.pos); normalize(this.neg); this.pending = 0; };
LimbAccumulator.prototype.add = function (value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('Accumulator inputs must be finite JavaScript Numbers.');
  if (this.count >= Number.MAX_SAFE_INTEGER) throw new RangeError('Accumulator count exceeds the exact count range.');
  if (value) addMagnitudeFloat(value < 0 ? this.neg : this.pos, value);
  this.count++; if (++this.pending >= CARRY_EVERY) this._carry(); return this;
};
LimbAccumulator.prototype.merge = function (other) {
  if (!(other instanceof LimbAccumulator)) throw new TypeError('Can only merge a limb accumulator of the same kind.');
  if (this.count + other.count > Number.MAX_SAFE_INTEGER) throw new RangeError('Merged count exceeds the exact count range.');
  this._carry(); other._carry();
  for (var i=0;i<other.pos.length;i++) addAt(this.pos,i,other.pos[i]);
  for (i=0;i<other.neg.length;i++) addAt(this.neg,i,other.neg[i]);
  this.count += other.count; this._carry(); return this;
};
LimbAccumulator.prototype._magnitude = function () { this._carry(); return signedMagnitude(this.pos,this.neg); };
LimbAccumulator.prototype.compare = function (other) {
  if (!(other instanceof LimbAccumulator)) throw new TypeError('Can only compare a limb accumulator of the same kind.');
  var a=this._magnitude(), b=other._magnitude(), c; if (a.sign!==b.sign) return a.sign<b.sign?-1:1; if (!a.sign) return 0; c=compareLimbs(a.mag,b.mag); return c===0?0:a.sign*c;
};
LimbAccumulator.prototype.toNumber = function () {
  var x=this._magnitude(); if (compareLimbs(x.mag,LIMB_MAX_UNITS)>0) return {status:'out-of-range',value:null};
  return {status:'finite',value:x.sign*rationalToNumberLimbs(x.mag,[1],-1074)};
};
LimbAccumulator.prototype.mean = function () { if (!this.count) return {status:'empty',value:null}; var x=this._magnitude(); return {status:'finite',value:x.sign*rationalToNumberLimbs(x.mag,[this.count],-1074)}; };
LimbAccumulator.prototype.ratioTo = function (other) {
  if (!(other instanceof LimbAccumulator)) throw new TypeError('Ratio denominator must be a limb accumulator.');
  var a=this._magnitude(), b=other._magnitude(); if (!b.sign) return {status:'division-by-zero',value:null};
  if (!a.sign) return {status:'finite',value:0};
  var denominatorProduct=multiplyLimbs(b.mag,LIMB_MAX_RATIO);
  if (compareLimbs(a.mag,denominatorProduct)>0) return {status:'out-of-range',value:null};
  var out=rationalToNumberLimbs(a.mag,b.mag,0); return {status:'finite',value:a.sign===b.sign?out:-out};
};
LimbAccumulator.prototype.toDigitsForTest = function () { var x=this._magnitude(); return {sign:x.sign,digits:x.mag.slice()}; };

function GroupAccumulator() { this.sum = new ExactAccumulator(); this.rows = []; }
GroupAccumulator.prototype.addRow = function (rowIndex, value) {
  if (typeof value !== 'number') throw new TypeError('Grouped values must already be numeric.');
  if (value !== value) { this.rows.push(rowIndex); return this; }
  if (!Number.isFinite(value)) throw new TypeError('Grouped non-finite values are rejected.');
  this.sum.add(value); this.rows.push(rowIndex); return this;
};
GroupAccumulator.prototype.merge = function (other) {
  this.sum.merge(other.sum); var merged=[],i=0,j=0;
  while(i<this.rows.length&&j<other.rows.length)merged.push(this.rows[i]<=other.rows[j]?this.rows[i++]:other.rows[j++]);
  while(i<this.rows.length)merged.push(this.rows[i++]);while(j<other.rows.length)merged.push(other.rows[j++]);this.rows=merged;return this;
};

var OTHER = Object.freeze({ label: 'Other' });
function nestedGet(map,a,b) { var sub=map.get(a); return sub&&sub.get(b); }
function nestedSet(map,a,b,value) { var sub=map.get(a); if(!sub){sub=new Map();map.set(a,sub);}sub.set(b,value); }
function mergeInto(map,a,b,group,Factory) { var dest=nestedGet(map,a,b);if(!dest){dest=new Factory();nestedSet(map,a,b,dest);}dest.merge(group); }
function totalByDimension(groups,dimension,order) {
  var out=new Map(); order.forEach(function(k){out.set(k,new ExactAccumulator());});
  groups.forEach(function(sub,a){sub.forEach(function(g,b){var k=dimension==='x'?a:b;if(!out.has(k))out.set(k,new ExactAccumulator());out.get(k).merge(g.sum);});});
  return out;
}
function capped(order,totals,cap,highlight) {
  var sorted=order.slice(),sequence=new Map();order.forEach(function(k,i){sequence.set(k,i);});
  sorted.sort(function(a,b){var c=totals.get(b).compare(totals.get(a));return c||sequence.get(a)-sequence.get(b);});
  if(!cap||sorted.length<=cap)return {list:sorted,other:null};
  var hi=highlight===undefined?-1:sorted.indexOf(highlight),keep=hi>=cap-1,otherKeys=sorted.slice(keep?cap-2:cap-1);
  if(keep)otherKeys.splice(otherKeys.indexOf(highlight),1);
  var list=sorted.slice(0,keep?cap-2:cap-1);if(keep)list.push(highlight);list.push(OTHER);
  return {list:list,other:new Set(otherKeys)};
}
function capKey(cap,key) { return cap.other&&cap.other.has(key)?OTHER:key; }
function groupRows(rows,options) {
  options=options||{};var raw=new Map(),xOrder=[],cOrder=[],i,row,x,c,g;
  for(i=0;i<rows.length;i++){
    row=rows[i];x=row.x;c=options.color?row.color:'';
    if(typeof x!=='string'||typeof c!=='string')throw new TypeError('Prototype categories must be strings.');
    if(!raw.has(x)){raw.set(x,new Map());xOrder.push(x);}if(!raw.get(x).has(c)){raw.get(x).set(c,new GroupAccumulator());if(cOrder.indexOf(c)<0)cOrder.push(c);}
    g=raw.get(x).get(c);g.addRow(i,row.value);
  }
  var xTotals=totalByDimension(raw,'x',xOrder),cTotals=totalByDimension(raw,'c',cOrder);
  var xCap=capped(xOrder,xTotals,options.xCap||0,options.xHighlight),cCap=options.color?capped(cOrder,cTotals,options.colorCap||0,options.colorHighlight):{list:[''],other:null};
  var cells=raw;
  if(xCap.other||cCap.other){cells=new Map();raw.forEach(function(sub,rx){sub.forEach(function(group,rc){mergeInto(cells,capKey(xCap,rx),options.color?capKey(cCap,rc):'',group,GroupAccumulator);});});}
  var finalXTotals=totalByDimension(cells,'x',xCap.list),finalCTotals=totalByDimension(cells,'c',cCap.list);
  return {xCategories:xCap.list,colorCategories:cCap.list,cells:cells,xTotals:finalXTotals,colorTotals:finalCTotals,xOverflow:xCap.other,colorOverflow:cCap.other};
}
function positiveTotal(groups,categoryKeys) { var total=new ExactAccumulator();categoryKeys.forEach(function(k){var a=groups.get(k);if(a&&a.compare(new ExactAccumulator())>0)total.merge(a);});return total; }
function donut(table) {
  var parts=[],total=new ExactAccumulator();table.xCategories.forEach(function(x){var a=table.xTotals.get(x);if(a&&a.compare(new ExactAccumulator())>0){parts.push({category:x,accumulator:a,rows:rowsFor(table,x)});total.merge(a);}});
  return {total:total.toNumber(),parts:parts.map(function(p){return {category:p.category,rows:p.rows,value:p.accumulator.toNumber(),ratio:p.accumulator.ratioTo(total)};})};
}
function rowsFor(table,x) { var rows=[];var sub=table.cells.get(x);if(sub)sub.forEach(function(g){rows=rows.concat(g.rows);});return rows.sort(function(a,b){return a-b;}); }
function marimekko(table) {
  var perX=new Map(),total=new ExactAccumulator();
  table.xCategories.forEach(function(x){var s=new ExactAccumulator(),sub=table.cells.get(x);if(sub)sub.forEach(function(g){if(g.sum.compare(new ExactAccumulator())>0)s.merge(g.sum);});perX.set(x,s);if(s.compare(new ExactAccumulator())>0)total.merge(s);});
  var columns=[];table.xCategories.forEach(function(x){var xt=perX.get(x);if(xt.compare(new ExactAccumulator())<=0)return;var cells=[],sub=table.cells.get(x);if(sub)sub.forEach(function(g,c){if(g.sum.compare(new ExactAccumulator())>0)cells.push({category:c,rows:g.rows.slice(),value:g.sum.toNumber(),ratio:g.sum.ratioTo(xt)});});columns.push({category:x,rows:rowsFor(table,x),value:xt.toNumber(),width:xt.ratioTo(total),cells:cells});});
  return {total:total.toNumber(),columns:columns};
}

module.exports={available:function(){return !!B;},ExactAccumulator:ExactAccumulator,LimbAccumulator:LimbAccumulator,GroupAccumulator:GroupAccumulator,certifiedSum:certifiedSum,groupRows:groupRows,donut:donut,marimekko:marimekko,OTHER:OTHER,_test:{bitsOfFloat:bitsOfFloat,ratioToNumber:ratioToNumber,limbs:{compare:compareLimbs,shift:shiftLimbs,multiply:multiplyLimbs,divideRounded:divideRounded,bitLength:bitLengthLimbs}}};
