const A = require(process.argv[2]), B = require(process.argv[3]);
(async () => { await A.init(); await B.init(); let bad = 0;
 const base = () => Array.from({ length: 9000 }, (_, i) => ({ id: i, x: i * 0.5, s: 'k' + (i % 9), b: i % 2 === 0, n: i % 5 ? null : i }));
 class C { constructor() { this.id = 1; } }
 const muts = { none: r => r, nested: r => { r[6000].s = { a: 1 }; }, arr: r => { r[8999].x = [1, 2]; }, negz: r => { r[7000].x = -0; }, negzInt: r => { r[7000].id = -0; }, nan: r => { r[5000].x = NaN; }, inf: r => { r[100].x = Infinity; }, undef: r => { r[4000].s = undefined; },
  fn: r => { r[3000].s = () => 1; }, cls: r => { r[6500] = new C(); }, rowArr: r => { r[5000] = [1]; }, rowNull: r => { r[5000] = null; }, nullProto: r => { const o = Object.create(null); o.id = 1; r[5000] = o; }, big: r => { r[5000].id = 10n; }, mixedKind: r => { r[5000].id = 'x'; } };
 for (const [nm, f] of Object.entries(muts)) { let x, y, ea, eb; const r1 = base(); f(r1); const r2 = base(); f(r2);
  try { x = Buffer.from(A.packRows(r1)); } catch (e) { ea = e.message; } try { y = Buffer.from(await B.packRowsParallel(r2, { workers: 2 })); } catch (e) { eb = e.message; }
  const same = ea || eb ? ea === eb : Buffer.compare(x, y) === 0; if (!same) bad++; console.log(nm.padEnd(10), same ? 'same' : 'DIFF', ea || '', eb || ''); }
 console.log('done, diffs', bad); })();
