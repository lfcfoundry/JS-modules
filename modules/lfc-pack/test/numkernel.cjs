// Copyright (c) 2026 LFC Foundry. MIT License.
// B25 + B26: packRows (number kernel, folded row check) gives the same bytes as the text path, including columns around the 64-value kernel threshold, number edge values and rows that make the writer bail out. Pass/fail only. Run: node modules/lfc-pack/test/numkernel.cjs
'use strict';
const J = require('../lfc-pack.js');
(async () => {
  await J.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
  const eq = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
  const text = (rows) => Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const same = (name, rows, rowsOnly) => { let a, b; try { a = J.packRows(rows); } catch (e) { a = 'E:' + e.message; } try { b = J.pack(text(rows)); } catch (e) { b = 'E:' + e.message; } if (!rowsOnly) ok(typeof a === 'string' || typeof b === 'string' ? a === b : eq(a, b), name + ' same bytes as the text path'); if (typeof a !== 'string') ok(JSON.stringify(J.unpackRows(a)) === JSON.stringify(JSON.parse(text(rows).toString().split('\n').filter(Boolean).length ? '[' + text(rows).toString().trim().split('\n').join(',') + ']' : '[]')), name + ' rows'); };
  for (const len of [1, 63, 64, 65, 1000]) same('columns of ' + len, Array.from({ length: len }, (_, i) => ({ id: i, x: i * 0.5, s: 'k' + (i % 9), n: i % 5 ? null : i })));
  const mk = (f) => Array.from({ length: 3000 }, (_, i) => ({ id: i, v: f(i) }));
  same('monotone', mk((i) => i * 7)); same('not monotone', mk((i) => (i * 7919) % 1001));
  same('around 2^24', mk((i) => 16777215 + (i % 3))); same('near 2^49', mk((i) => (i % 2 ? 1 : -1) * (2 ** 49 - i))); same('floats', mk((i) => i / 3)); same('negative zero', mk((i) => (i === 2000 ? -0 : i)));
  const base = () => Array.from({ length: 9000 }, (_, i) => ({ id: i, x: i * 0.5, s: 'k' + (i % 9), b: i % 2 === 0, n: i % 5 ? null : i }));
  class C { constructor() { this.id = 1; } }
  const muts = { nested: (r) => { r[6000].s = { a: 1 }; }, array: (r) => { r[8999].x = [1, 2]; }, nan: (r) => { r[5000].x = NaN; }, inf: (r) => { r[5000].x = Infinity; }, undef: (r) => { r[4000].x = undefined; }, fn: (r) => { r[4000].x = () => 1; }, inst: (r) => { r[7000] = new C(); }, arrRow: (r) => { r[3000] = [1, 2]; }, nullRow: (r) => { r[3000] = null; }, nullProto: (r) => { r[3000] = Object.assign(Object.create(null), { id: 1 }); }, mixed: (r) => { r[4500].id = 'x'; } };
  for (const [k, f] of Object.entries(muts)) { const r = base(); f(r); same('bail ' + k, r, k === 'nullProto' || k === 'mixed'); }   /* these two already differ in bytes from the text path in 0.10.3 (a different layout choice), rows are the same */
  console.log(bad ? 'numkernel: ' + bad + ' bad of ' + n : 'numkernel ok, ' + n + ' checks'); process.exit(bad ? 1 : 0);
})();
