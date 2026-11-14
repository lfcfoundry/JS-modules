// Copyright (c) 2026 LFC Foundry. MIT License.
// B28: packRowsParallel gives the same bytes as packRows (text-size rule, helper bail, helper error, overlapping calls, three calls in a row). Pass/fail only. Run: node modules/lfc-pack/test/b28.cjs
'use strict';
globalThis.__B28TEXT = 0.01; globalThis.__B28AUTO = 0;   // test knobs: take the helper path on small tables; start helpers at once
const J = require('../lfc-pack.js');
(async () => {
  await J.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
  const eq = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
  const base = (len) => Array.from({ length: len || 20000 }, (_, i) => ({ id: i, x: i * 0.5, y: (i * 7919) % 1001 / 3, s: 'k' + (i % 9), b: i % 2 === 0, n: i % 5 ? null : i }));
  const run = async (name, mut, len) => { const r1 = base(len), r2 = base(len); if (mut) { mut(r1); mut(r2); } let a, b, ea, eb; try { a = J.packRows(r1); } catch (e) { ea = e.message; } try { b = await J.packRowsParallel(r2, { workers: 2 }); } catch (e) { eb = e.message; } ok(ea || eb ? ea === eb : eq(a, b), name + ' same bytes as packRows'); if (!ea && b) ok(J.unpackRows(b).length === r1.length, name + ' rows count'); };
  for (let k = 0; k < 3; k++) await run('plain call ' + (k + 1), null);
  await run('small table (under 4096 rows)', null, 3000);
  await run('negative zero in a big column', (r) => { r[15000].x = -0; });
  await run('NaN in a big column', (r) => { r[15000].y = NaN; });
  await run('Infinity', (r) => { r[100].x = Infinity; });
  await run('nested value', (r) => { r[16000].s = { a: 1 }; });
  await run('mixed kind', (r) => { r[12000].id = 'x'; });
  await run('undefined value', (r) => { r[9000].x = undefined; });
  const a1 = base(), a2 = base(30000);
  const [p, q] = await Promise.all([J.packRowsParallel(a1, { workers: 2 }), J.packRowsParallel(a2, { workers: 2 })]);
  ok(eq(p, J.packRows(base())) && eq(q, J.packRows(base(30000))), 'two overlapping calls');
  const r = base(); r[5000].x = 1.5; const b0 = J.packRows(r); ok(eq(await J.packRowsParallel(r, { workers: 1 }), b0), 'one helper');
  ok(eq(await J.packRowsParallel(base(), { workers: 4, level: 3 }), J.packRows(base(), { level: 3 })), 'level option');
  // B31: the writer yields between blocks; small blocks force several of them
  for (const [nm, mut] of [['several blocks', null], ['bail in a late block', (r) => { r[19000].x = -0; }], ['nested in a late block', (r) => { r[18500].s = { a: 1 }; }]]) {
    const r1 = base(), r2 = base(); if (mut) { mut(r1); mut(r2); } const o = { workers: 2, blockBytes: 300000 }; let a, b, ea, eb; try { a = J.packRows(r1, o); } catch (e) { ea = e.message; } try { b = await J.packRowsParallel(r2, o); } catch (e) { eb = e.message; } ok(ea || eb ? ea === eb : eq(a, b), nm + ' (yielding writer) same bytes as packRows');
  }
  { const o = { workers: 2, blockBytes: 300000 }, [p, q] = await Promise.all([J.packRowsParallel(base(), o), J.packRowsParallel(base(25000), o)]); ok(eq(p, J.packRows(base(), o)) && eq(q, J.packRows(base(25000), o)), 'two overlapping calls, several blocks each'); }
  { const cp = require('child_process'), code = "globalThis.__B28TEXT=0.01;globalThis.__B28AUTO=0;const J=require(" + JSON.stringify(require('path').resolve(__dirname, '../lfc-pack.js')) + ");(async()=>{await J.init();await J.packRowsParallel(Array.from({length:20000},(_,i)=>({id:i,x:i*.5})),{workers:2,blockBytes:100000});console.log('call done')})();", out = cp.spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', timeout: 60000 }); ok(/call done/.test(out.stdout), 'a plain script waits for the yielding writer and then ends on its own'); }
  { // P13i: label tables (many repeated short strings, above 4 MiB of text) take the row path with the head block; the helper path cuts the same blocks
    const lab = (len) => Array.from({ length: len }, (_, i) => { const o = { id: i, v: i * 0.25 }; for (let k = 0; k < 24; k++) o['label' + k] = 'value-' + ((i * (k + 3)) % 7) + '-' + 'abcdefgh'.slice(0, 1 + (k % 8)); return o; });
    const a = lab(30000), b = lab(30000); ok(JSON.stringify(a).length > 4 << 20, 'label table is above 4 MiB of text');
    ok(eq(J.packRows(a), await J.packRowsParallel(b, { workers: 2 })), 'label table: packRowsParallel same bytes as packRows (head block)'); }
  J.trim && J.trim();
  console.log(bad ? 'b28: ' + bad + ' bad of ' + n : 'b28 ok, ' + n + ' checks'); process.exit(bad ? 1 : 0);
})();
