// Copyright (c) 2026 LFC Foundry. MIT License.
// B34: packColumnsParallel({ key: array }) reads back exactly, gives the packRows bytes on numeric tables and on every fallback (-0, NaN, undefined, nested, strings among numbers, small tables), takes typed columns, and rejects bad input. Pass/fail only. Run: node modules/lfc-pack/test/b34.cjs
'use strict';
globalThis.__B28TEXT = 0.01; globalThis.__B28AUTO = 0;   // test knobs: take the helper path on small tables; start helpers at once
const J = require('../lfc-pack.js');
(async () => {
  await J.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
  const eq = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
  const colsOf = (rows, typed) => { const o = {}; for (const k of Object.keys(rows[0])) { const a = rows.map((r) => r[k]); o[k] = typed && a.every((x) => typeof x === 'number') ? Float64Array.from(a) : a; } return o; };
  const same = JSON.stringify;
  const run = async (name, rows, bytesToo, typed) => {
    const want = J.packRows(rows); let got, err = null;
    try { got = await J.packColumnsParallel(colsOf(rows, typed)); } catch (e) { err = e; }
    ok(!err, name + ' no error ' + (err && err.message)); if (err) return;
    if (bytesToo) ok(eq(want, got), name + ' same bytes as packRows');
    ok(same(J.unpackRows(got)) === same(J.unpackRows(want)), name + ' rows read back exactly');
  };
  const num = (len) => Array.from({ length: len }, (_, i) => ({ id: i, x: i * 0.5, y: (i * 7919) % 1001 / 3, n: i % 5 ? null : i }));
  const txt = (len) => Array.from({ length: len }, (_, i) => ({ id: i, x: i * 0.5, s: 'k' + (i % 9), b: i % 2 === 0, n: i % 5 ? null : i }));
  for (const typed of [true, false]) for (let rep = 0; rep < 2; rep++) { await run('numeric table ' + (typed ? 'typed' : 'plain') + rep, num(20000), true, typed); await run('text columns ' + (typed ? 'typed' : 'plain') + rep, txt(20000), false, typed); }
  await run('small table', txt(70), true, false);
  const odd = { 'negative zero': (r) => { r[15000].x = -0; }, NaN: (r) => { r[15000].x = NaN; }, undefined: (r) => { r[100].s = undefined; }, nested: (r) => { r[50].s = { a: 1 }; }, 'string among numbers': (r) => { r[8000].x = '9'; } };
  for (const [nm, f] of Object.entries(odd)) for (const typed of [true, false]) { const r = txt(20000); f(r); await run(nm + (typed ? ' typed' : ' plain'), r, true, typed); }
  { const r = num(20000), c = colsOf(r, true); c.id = Int32Array.from(r.map((x) => x.id)); const got = await J.packColumnsParallel(c); ok(eq(got, J.packRows(r)), 'Int32Array column'); }
  for (const [nm, arg] of [['length mismatch', { a: [1, 2], b: [1] }], ['not an array', { a: 5 }], ['BigInt column', { a: new BigInt64Array(3) }]]) { let e = null; try { await J.packColumnsParallel(arg); } catch (x) { e = x; } ok(e !== null, nm + ' is rejected'); }
  { const got = await J.packColumnsParallel({}); ok(same(J.unpackRows(got)) === same(J.unpackRows(J.packRows([]))), 'empty object'); }
  J.trim && J.trim();
  console.log(bad ? 'b34: ' + bad + ' bad of ' + n : 'b34 ok, ' + n + ' checks'); process.exit(bad ? 1 : 0);
})();
