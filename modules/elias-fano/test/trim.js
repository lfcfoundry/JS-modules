// Copyright (c) 2026 LFC Foundry. MIT License. trim() gives WebAssembly memory back and keeps every answer the same: compacted lists are moved to the fresh memory,
// lists that keep their bytes copy themselves in again, freed lists' space comes back; a list that got its bytes back and was compacted again is still moved; autoTrim queues a trim.
const EF = require('../elias-fano.js'), assert = require('assert');
let seed = 9; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
function sorted(n, gap) { const a = new Uint32Array(n); let v = Math.floor(r() * 50); for (let i = 0; i < n; i++) { v += 1 + Math.floor(r() * gap); a[i] = v; } return a; }
const xsOf = (vals) => { const xs = []; for (let q = 0; q < 400; q++) xs.push(Math.floor(r() * (vals[vals.length - 1] + 10))); return xs; };
function answers(L, xs) { const n = L.length, idx = xs.map(x => x % Math.max(1, n)); return JSON.stringify([idx.map(i => L.get(i)), xs.map(x => L.nextGEQ(x)), Array.from(L.getMany(idx)), Array.from(L.slice(n >> 2, (n >> 2) + 300)), L.toArray().length]); }
const MB = (b) => (b / 1048576).toFixed(1) + ' MB';
(async () => {
  await EF.ready(); assert.ok(EF.accelerated(), 'needs WebAssembly');
  EF.autoTrim(false);   // on by default; the steps below trim by hand first
  const out = [];
  // 1: twelve compacted lists (flat and partitioned), free ten, trim: the two kept ones move, answers stay
  const sets = [], lists = [], want = [];
  for (let i = 0; i < 12; i++) { const v = sorted(1000000, 40), part = i % 2 === 1; sets.push(v); const L = (part ? EF.openPartitioned(EF.buildPartitioned(v)) : EF.open(EF.build(v))); L.get(0); assert.strictEqual(L.compact(), true); lists.push(L); want.push(null); }
  const xs = sets.map(xsOf); lists.forEach((L, i) => { want[i] = answers(L, xs[i]); });
  const full = EF._memBytes(); for (let i = 2; i < 12; i++) lists[i].free();
  assert.strictEqual(EF._memBytes(), full, 'memory only grows');
  let t = EF.trim(); assert.strictEqual(t.moved, 2); assert.ok(t.after < full / 4, 'trim gave memory back: ' + MB(full) + ' -> ' + MB(t.after));
  for (let i = 0; i < 2; i++) assert.strictEqual(answers(lists[i], xs[i]), want[i], 'moved list ' + i);
  out.push('12 compacted, free 10: ' + MB(full) + ' -> ' + MB(t.after));
  // 2: a moved list gets its bytes back (plain JavaScript reader), then is compacted again: the next trim still moves it
  EF.setBackend('js'); assert.strictEqual(answers(lists[0], xs[0]), want[0]); EF.setBackend('auto');
  assert.ok(lists[0].bytes, 'bytes came back'); EF.trim(); assert.strictEqual(answers(lists[0], xs[0]), want[0], 'kept bytes, copied in again');
  assert.strictEqual(lists[0].compact(), true); t = EF.trim(); assert.ok(t.moved >= 1, 'compacted again, moved again'); assert.strictEqual(answers(lists[0], xs[0]), want[0]);
  assert.strictEqual(answers(lists[1], xs[1]), want[1]);
  // 3: lists that keep their bytes: trim lets the memory go, the next query copies them in again
  const keep = [], kw = []; for (let i = 0; i < 4; i++) { const v = sorted(300000, 20); const L = EF.open(EF.build(v)); kw.push([xsOf(v)]); kw[i].push(answers(L, kw[i][0])); keep.push(L); }
  EF.trim(); keep.forEach((L, i) => assert.strictEqual(answers(L, kw[i][0]), kw[i][1], 'kept list ' + i));
  // 4: one big build leaves scratch space behind; trim gives it back
  const big = sorted(5000000, 8); const before = EF._memBytes(); const B = EF.build(big); const grown = EF._memBytes(); t = EF.trim();
  out.push('build 5M ids: ' + MB(before) + ' -> ' + MB(grown) + ', trim -> ' + MB(t.after));
  assert.ok(t.after < grown, 'build scratch given back');
  const BL = EF.open(B), bx = xsOf(big); assert.strictEqual(BL.get(4999999), big[4999999]); assert.strictEqual(BL.nextGEQ(bx[0]), EF.open(B).nextGEQ(bx[0]));
  for (let i = 0; i < 2; i++) assert.strictEqual(answers(lists[i], xs[i]), want[i], 'moved list after more trims ' + i);
  // 5: list sets (offsets and chunks are lists) compacted, then trimmed
  const ls = []; for (let i = 0; i < 3000; i++) ls.push(Array.from(sorted(Math.floor(r() * 30), 50)));
  const S = EF.openLists(EF.buildLists(ls)), ids = Array.from({ length: 2000 }, () => Math.floor(r() * 3000));
  const look = () => JSON.stringify(ids.map(i => Array.from(S.get(i) || [])));
  const sw = look(); S.compact(); EF.trim(); assert.strictEqual(look(), sw, 'list set after compact + trim');
  // 6: autoTrim: a big build with nothing kept is given back one tick later
  EF.autoTrim(true); BL.free(); keep.forEach((L) => L.free()); EF.build(sorted(5000000, 8)); const peak = EF._memBytes();
  await new Promise((ok) => setTimeout(ok, 5));
  out.push('autoTrim: ' + MB(peak) + ' -> ' + MB(EF._memBytes()) + ' one tick later');
  assert.ok(EF._memBytes() < peak / 4, 'autoTrim gave memory back');
  for (let i = 0; i < 2; i++) assert.strictEqual(answers(lists[i], xs[i]), want[i], 'moved list after autoTrim ' + i);
  assert.strictEqual(look(), sw);
  console.log('elias-fano trim: all checks passed; ' + out.join('; '));
})().catch((e) => { console.error(e); process.exit(1); });
