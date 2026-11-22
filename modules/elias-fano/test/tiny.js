// Copyright (c) 2026 LFC Foundry. MIT License. Tiny lists (since 2.2.0) and the reusable query scratch: every read agrees with the input value by value,
// hostile blobs are refused, intersect over tiny, flat, partitioned and block lists in any mix equals a plain answer, and batch calls give the same answers
// before and after trim() and after the memory grew, in WebAssembly and in plain JavaScript.
const EF = require('../elias-fano.js'), assert = require('assert');
let seed = 77; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const lb = (v, x) => { let e = 0; while (e < v.length && v[e] < x) e++; return e; };
function randList(n) {
  const span = Math.pow(2, Math.floor(r() * 33)), v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.min(4294967295, Math.floor(r() * span));
  if (n && r() < 0.1) v[n - 1] = 4294967295; if (n && r() < 0.1) v[0] = 0; if (n > 3 && r() < 0.2) v[2] = v[1];
  return v.sort();
}
let checks = 0; const eq = (a, b, m) => { checks++; assert.strictEqual(a, b, m); };
(async () => {
  await EF.ready();
  const kinds = { 0x74: 0, 0x75: 0 };
  // 1: random lists, 0 to 63 values, every reader against the input
  for (let t = 0; t < 4000; t++) {
    const n = t < 4 ? [0, 1, 2, 63][t] : Math.floor(r() * 64), v = randList(n), b = EF.buildTiny(v), L = EF.openTiny(b);
    kinds[b[0]]++; eq(L.length, n, 'length');
    const a = L.toArray(); for (let i = 0; i < n; i++) { eq(a[i], v[i], 'toArray ' + t + ' ' + i); eq(L.get(i), v[i], 'get'); }
    eq(L.get(n), undefined, 'get past the end');
    const xs = [0, 1, n ? v[0] : 5, n ? v[n - 1] : 9, n ? v[n - 1] + 1 : 10, 4294967295, 4294967296, -3, 2.5, NaN]; for (let q = 0; q < 6; q++) xs.push(Math.floor(r() * 4294967296));
    const ng = L.nextGEQMany(xs.filter(x => x >= 0 && x <= 4294967295 && x % 1 === 0)), cm = L.containsMany(xs), rm = L.rankMany(xs); let qi = 0;
    xs.forEach((x, j) => {
      const xx = x !== x || x < 0 ? 0 : Math.ceil(x), e = x > 4294967295 ? n : lb(v, xx);
      eq(L.nextGEQ(x), e, 'nextGEQ ' + x); if (x >= 0 && x <= 4294967295 && x % 1 === 0) eq(ng[qi++], e, 'nextGEQMany');
      const has = n > 0 && lb(v, x) < n && v[lb(v, x)] === x; eq(L.contains(x), has, 'contains ' + x); eq(cm[j], has ? 1 : 0, 'containsMany');
      const rk = x !== x || x < 0 ? 0 : x >= 4294967295 ? n : lb(v, Math.floor(x) + 1); eq(L.rank(x), rk, 'rank ' + x); eq(rm[j], rk, 'rankMany');
    });
    if (n) { const idx = Array.from({ length: 8 }, () => Math.floor(r() * n)), gm = L.getMany(idx); idx.forEach((i, j) => eq(gm[j], v[i], 'getMany')); const s = L.slice(1, n - 1); for (let i = 1; i < n - 1; i++) eq(s[i - 1], v[i], 'slice'); }
    const o = new Uint32Array(n); eq(L.toArray(o), o, 'toArray(out) fills out');
  }
  assert.ok(kinds[0x74] > 100 && kinds[0x75] > 100, 'both layouts used: ' + JSON.stringify(kinds));
  // edge cases: l = 0, l = 31, the top value, 64 refused, bad input refused
  eq(EF.openTiny(EF.buildTiny([0, 1, 2, 3])).toArray().join(), '0,1,2,3', 'l = 0');
  { const v = [0, 4294967295], b = EF.buildTiny(v); eq(Array.from(EF.openTiny(b).toArray()).join(), v.join(), 'top value'); }
  { const v = [2147483648, 4294967295], b = EF.buildTiny([5, 4294967295]); eq(EF.openTiny(b).get(1), 4294967295, 'large gap'); eq(EF.openTiny(EF.buildTiny(v)).get(0), 2147483648, 'l near 31'); }
  assert.throws(() => EF.buildTiny(new Uint32Array(64)), RangeError, '64 values refused'); checks++;
  assert.throws(() => EF.buildTiny([3, 2]), RangeError, 'going down refused'); checks++;
  assert.throws(() => EF.buildTiny([4294967296]), RangeError, 'past 32 bits refused'); checks++;
  // 2: hostile blobs: every truncation, flipped bytes and junk are refused or give a valid sorted list (never a read past the end)
  let refused = 0, flips = 0;
  for (let t = 0; t < 600; t++) {
    const v = randList(1 + Math.floor(r() * 63)), b = EF.buildTiny(v);
    for (let c = 0; c < b.length; c++) { try { EF.openTiny(b.subarray(0, c)); assert.fail('truncated blob opened'); } catch (e) { assert.ok(e instanceof RangeError, String(e)); refused++; } }
    const x = b.slice(); x[Math.floor(r() * x.length)] ^= 1 << Math.floor(r() * 8);
    try { const L = EF.openTiny(x), a = L.toArray(); for (let i = 1; i < a.length; i++) assert.ok(a[i] >= a[i - 1], 'flipped blob decodes sorted'); } catch (e) { assert.ok(e instanceof RangeError, String(e)); flips++; }
  }
  assert.throws(() => EF.openTiny(new Uint8Array([0x75, 3, 9, 1, 0, 0])), RangeError); assert.throws(() => EF.openTiny(new Uint8Array([0x74, 64])), RangeError); checks += 2;
  // 3: buildAuto / openAuto
  eq(EF.openAuto(EF.buildAuto([1, 2, 3])).stats().tiny !== undefined, true, 'auto: 3 values tiny');
  { const v = Uint32Array.from({ length: 64 }, (_, i) => i * 7), b = EF.buildAuto(v); eq(EF.openAuto(b).stats().tiny, undefined, 'auto: 64 values flat'); eq(EF.openAuto(b).get(63), 441); }
  { const v = Uint32Array.from({ length: 5000 }, (_, i) => i * 3); eq(EF.openAuto(EF.buildPartitioned(v)).get(4999), 14997, 'openAuto partitioned'); eq(EF.openAuto(EF.buildBlocks(v)).get(10), 30, 'openAuto blocks'); }
  // 4: intersect over every mix
  const mk = (kind, v) => kind === 0 ? EF.openTiny(EF.buildTiny(v)) : kind === 1 ? EF.open(EF.build(v)) : kind === 2 ? EF.openPartitioned(EF.buildPartitioned(v)) : EF.openBlocks(EF.buildBlocks(v));
  for (let t = 0; t < 600; t++) {
    const k = 2 + Math.floor(r() * 3), sets = [], ls = [], top = 1 + Math.floor(r() * 3000);
    for (let i = 0; i < k; i++) { const kind = i === 0 ? 0 : Math.floor(r() * 4), n = kind === 0 ? Math.floor(r() * 64) : Math.floor(r() * 2000); const v = new Uint32Array(n); for (let j = 0; j < n; j++) v[j] = Math.floor(r() * top); v.sort(); sets.push(v); ls.push(mk(kind, v)); }
    const want = Array.from(new Set(sets[0])).filter(x => sets.every(s => s.includes(x)));
    eq(Array.from(EF.intersect(ls)).join(), want.join(), 'intersect mix ' + t);
  }
  // 5: query scratch: batches agree before and after trim() and after the memory grew, WebAssembly and JavaScript
  for (const backend of ['auto', 'js']) {
    EF.setBackend(backend);
    const v = Uint32Array.from({ length: 200000 }, (_, i) => i * 5 + (i & 3)), F = EF.open(EF.build(v)), Pl = EF.openPartitioned(EF.buildPartitioned(v)), B = EF.openBlocks(EF.buildBlocks(v));
    const xs = Uint32Array.from({ length: 50 }, () => Math.floor(r() * 1000000)), big = Uint32Array.from({ length: 300000 }, () => Math.floor(r() * 1000000)), idx = Array.from({ length: 50 }, () => Math.floor(r() * 200000));
    const ans = () => JSON.stringify([F.nextGEQMany(xs), Pl.nextGEQMany(xs), F.getMany(idx), Pl.getMany(idx), F.rankMany(xs), Pl.rankMany(xs), B.containsMany(xs), F.nextGEQMany(Array.from(xs)), F.slice(10, 400)].map(a => Array.from(a)));
    const before = ans(), sumBig = (a) => { let s = 0; for (let i = 0; i < a.length; i += 997) s += a[i]; return s; }, bigWant = sumBig(F.nextGEQMany(big));
    eq(ans(), before, backend + ': repeat');
    EF.trim(); eq(ans(), before, backend + ': after trim'); eq(sumBig(F.nextGEQMany(big)), bigWant, backend + ': big batch (own memory)');
    const G = EF.open(EF.build(Uint32Array.from({ length: 3000000 }, (_, i) => i * 2))); G.toArray(); eq(ans(), before, backend + ': after the memory grew');
    EF.trim(); eq(ans(), before, backend + ': after a second trim');
    eq(Array.from(EF.intersect([F, Pl])).length, 200000, backend + ': intersect after trim'); G.free(); F.free(); Pl.free(); B.free();
  }
  EF.setBackend('auto');
  // 6: pin (off by default): pinned lists of 64 to 1,023 values answer exactly as unpinned ones; outside that range pin() says false; pin(false) and free() undo it
  let pins = 0;
  for (const backend of ['auto', 'js']) {
    EF.setBackend(backend);
    for (let t = 0; t < 300; t++) {
      const n = 1 + Math.floor(r() * 1100), v = randList(n), part = t % 2 === 1, b = part ? EF.buildPartitioned(v) : EF.build(v), U = part ? EF.openPartitioned(b) : EF.open(b), Pn = part ? EF.openPartitioned(b, { pin: true }) : EF.open(b, { pin: true });
      eq(U.pinned(), false, 'off by default'); eq(Pn.pinned(), n >= 64 && n <= 1023, 'pinned only for 64 to 1,023 values (' + n + ')'); if (Pn.pinned()) pins++;
      const xs = [0, v[0], v[n - 1], v[n - 1] + 1, 4294967295, 4294967296, -1, 1.5, NaN]; for (let q = 0; q < 30; q++) xs.push(Math.floor(r() * (v[n - 1] + 2)));
      const idx = Array.from({ length: 20 }, () => Math.floor(r() * n)), ints = xs.filter(x => x >= 0 && x <= 4294967295 && x % 1 === 0);
      const sig = (L) => JSON.stringify([xs.map(x => [L.nextGEQ(x), L.rank(x), L.contains(x), L.get(x)]), Array.from(L.nextGEQMany(ints)), Array.from(L.rankMany(xs)), Array.from(L.getMany(idx)), Array.from(L.toArray()), Array.from(L.slice(3, n - 2)), L.count(5, 900), L.nextValue(v[n >> 1])]);
      eq(sig(Pn), sig(U), 'pinned answers ' + t);
      if (Pn.pinned()) { eq(Array.from(EF.intersect([Pn, U])).join(), Array.from(new Set(v)).join(), 'intersect with a pinned list'); eq(Pn.pin(false), false, 'unpin'); eq(Pn.pinned(), false); eq(sig(Pn), sig(U), 'unpinned answers'); Pn.pin(); Pn.free(); eq(Pn.pinned(), false, 'free unpins'); }
      U.free(); Pn.free();
    }
  }
  assert.ok(pins > 100, 'pinned lists tested: ' + pins);
  EF.setBackend('auto');
  console.log('ok   elias-fano tiny: ' + checks + ' checks (4000 random lists, both layouts ' + JSON.stringify(kinds) + ', ' + refused + ' truncations refused, ' + flips + ' of 600 flipped blobs refused, 600 mixed intersects, scratch around trim and ' + pins + ' pinned lists in WebAssembly and JavaScript)');
})().catch((e) => { console.error(e); process.exit(1); });
