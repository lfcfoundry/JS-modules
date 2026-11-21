// Copyright (c) 2026 LFC Foundry. MIT License.
// sortBy and keepOrder (since 0.16.0): rows stably sorted by one column before blocks are cut, section 20 says so, keepOrder's row-position column is hidden by default and gives the saved order back.
'use strict';
const J = require('../lfc-pack.js');
(async () => {
  await J.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
  const te = new TextEncoder();
  const N = 30000, id = new Int32Array(N), num = new Float64Array(N), ints = new Int32Array(N), txt = new Array(N), mixed = new Array(N), dt = new Array(N), tsv = new Float64Array(N);
  const words = ['pear', 'apple', 'Zed', 'zeta', 'apples', 'a', '', 'béta', 'beta', 'applesauce', 'ap'];
  for (let i = 0; i < N; i++) {
    id[i] = i; num[i] = i % 9 === 0 ? NaN : ((i * 7919) % 2003) / 7 - 100; ints[i] = (i * 31) % 97 - 40;
    txt[i] = i % 13 === 0 ? null : words[(i * 17) % words.length] + ((i * 3) % 5);
    mixed[i] = i % 5 === 0 ? 'w' + (i % 7) : i % 5 === 1 ? i % 3 : i % 5 === 2 ? (i % 2 === 0) : i % 5 === 3 ? null : -i % 11;
    dt[i] = new Date(1.7e12 + ((i * 7919) % 5000) * 3600e3).toISOString().slice(0, 19);
    tsv[i] = i % 17 === 0 ? NaN : 1.7e12 + ((i * 104729) % 9000) * 1000;
  }
  // text as bytes and as a dictionary
  const parts = txt.map((s) => te.encode(s === null ? '' : s)), tot = parts.reduce((a, p) => a + p.length, 0), bytes = new Uint8Array(tot), st = new Int32Array(N), en = new Int32Array(N);
  { let d = 0; for (let i = 0; i < N; i++) { st[i] = d; bytes.set(parts[i], d); d += parts[i].length; en[i] = d; } }
  const labs = words.map((w) => te.encode(w)), lb = new Uint8Array(labs.reduce((a, p) => a + p.length, 0)), ls = new Int32Array(labs.length), le = new Int32Array(labs.length);
  { let d = 0; for (let i = 0; i < labs.length; i++) { ls[i] = d; lb.set(labs[i], d); d += labs[i].length; le[i] = d; } }
  const ids = new Uint16Array(N); for (let i = 0; i < N; i++) ids[i] = (i * 7) % words.length;
  const table = () => ({ id, num, ints, txt, mixed, dt, ts: { kind: 'ts', unit: 'ms', values: tsv }, bc: { bytes, start: st, end: en }, dc: { kind: 'dict', ids, labels: { bytes: lb, start: ls, end: le } } });
  const valueOf = { num: (i) => (num[i] === num[i] ? num[i] : null), ints: (i) => ints[i], txt: (i) => txt[i], mixed: (i) => mixed[i], dt: (i) => dt[i], ts: (i) => (tsv[i] === tsv[i] ? tsv[i] : null), bc: (i) => txt[i] === null ? '' : txt[i], dc: (i) => words[ids[i]] };
  const rank = (x) => typeof x === 'boolean' ? 0 : typeof x === 'number' ? 1 : typeof x === 'string' ? 2 : 3;
  const u8 = (s) => te.encode(s);
  const cmpBytes = (a, b) => { const x = u8(a), y = u8(b), m = Math.min(x.length, y.length); for (let i = 0; i < m; i++) if (x[i] !== y[i]) return x[i] - y[i]; return x.length - y.length; };
  const cmpOf = (key) => (a, b) => { if (key === 'bc' || key === 'dc') return cmpBytes(a, b); const ra = rank(a), rb = rank(b); if (ra !== rb) return ra - rb; return a < b ? -1 : a > b ? 1 : 0; };
  // the expected order: stable, missing last in both directions
  const expect = (key, desc) => { const c = cmpOf(key), I = Array.from({ length: N }, (_, i) => i), miss = (i) => { const v = valueOf[key](i); return v === null || v === undefined; };
    const have = I.filter((i) => !miss(i)), none = I.filter(miss); have.sort((a, b) => (desc ? -1 : 1) * c(valueOf[key](a), valueOf[key](b))); return have.concat(none); };
  for (const key of ['num', 'ints', 'txt', 'mixed', 'dt', 'ts', 'bc', 'dc']) for (const desc of [false, true]) {
    const f = await J.packColumnsParallel(table(), { sortBy: desc ? [key, 'desc'] : key, keepOrder: true, blockBytes: 60000 }), want = expect(key, desc);
    const blocks = J.unpackColumns(f, { keys: ['id', '$row'] }), got = [], rows = [];
    blocks.forEach((b) => { for (let i = 0; i < b.n; i++) { got.push(b.cols.id[i]); rows.push(b.cols.$row[i]); } });
    ok(got.length === N && got.every((v, i) => v === want[i]), key + (desc ? ' desc' : ' asc') + ': stable order');
    ok(rows.every((v, i) => v === got[i]), key + ': $row is the saved position');
    const S = J.summary(f), c = S.cols.find((x) => x.key === key);
    ok(S.sortedBy === key && S.rowIndex === '$row' && c && c.sorted === (desc ? 'desc' : 'asc') && !S.cols.some((x) => x.key === '$row'), key + ': section 20');
    const r = J.unpack(f), uc = J.unpackColumns(f);
    ok(r.length === N && !('$row' in r[0]) && !uc.some((b) => '$row' in b.cols), key + ': $row hidden from unpack and unpackColumns');
    const o = J.unpackRows(f, { original: true });
    ok(o.length === N && o.every((x, i) => x.id === i && !('$row' in x)), key + ': original order back');
    const o2 = J.unpack(f, { original: true, keys: ['id', 'num'] });
    ok(o2.every((x, i) => x.id === i && Object.keys(x).length <= 2), key + ': original with keys');
  }
  { // sorted number column: zone maps let a range read skip blocks; summary false still writes the sort
    const f = await J.packColumnsParallel(table(), { sortBy: 'num', blockBytes: 30000 }), f2 = await J.packColumnsParallel(table(), { sortBy: 'num', summary: false, blockBytes: 30000 });
    const S2 = J.summary(f2); ok(S2 && S2.sortedBy === 'num' && S2.rowIndex === undefined && S2.cols.length === 0, 'summary false: sortedBy only');
    const a = J.unpack(f, { range: { key: 'num', min: 0, max: 10 } }), b = J.unpack(f2, { range: { key: 'num', min: 0, max: 10 } });
    ok(a.length > 0 && a.length === b.length && a.every((x) => x.num >= 0 && x.num <= 10), 'range read on a sorted file');
    ok(J.unpack(f).length === N && '$row' in J.unpack(f)[0] === false, 'no keepOrder: no $row');
    const f3 = await J.packColumnsParallel(table(), { sortBy: 'txt', keepOrder: true, summary: false, blockBytes: 30000 }), S3 = J.summary(f3);
    ok(S3.rowIndex === '$row' && Array.isArray(S3.keys) && S3.keys.indexOf('$row') < 0, 'summary false + keepOrder: keys listed');
    ok(!('$row' in J.unpack(f3)[0]) && J.unpackRows(f3, { original: true })[7].id === 7, 'summary false + keepOrder: hidden and original');
    const pc = await J.unpackColumnsParallel(f3); ok(!('$row' in pc) && pc.id.length === N, 'unpackColumnsParallel hides $row');
    const pr = await J.unpackRowsParallel(f3); ok(pr.length === N && !('$row' in pr[0]), 'unpackRowsParallel hides $row');
    const pr2 = await J.unpackRowsParallel(f3, { original: true }); ok(pr2[123].id === 123, 'unpackRowsParallel original');
    const rr = J.unpackRows(f3, { from: 100, count: 50 }), whole = J.unpack(f3); ok(rr.length === 50 && rr.every((x, i) => x.id === whole[100 + i].id && !('$row' in x)), 'unpackRows from/count on a keepOrder file');
  }
  { // row arrays
    const R = []; for (let i = 0; i < 12000; i++) R.push(i % 10 === 3 ? { id: i, s: 'x' + (i % 50) } : { id: i, a: (i * 37) % 101, s: 'x' + (i % 50) });
    for (const fn of ['packRows', 'packRowsParallel']) {
      const f = await J[fn](R, { sortBy: ['a', 'desc'], keepOrder: true }), u = J.unpack(f), w = R.map((r, i) => i).filter((i) => R[i].a !== undefined).sort((x, y) => R[y].a - R[x].a || x - y).concat(R.map((r, i) => i).filter((i) => R[i].a === undefined));
      ok(u.length === R.length && u.every((x, i) => x.id === w[i] && !('$row' in x)), fn + ': sorted rows, missing key last, $row hidden');
      const o = J.unpackRows(f, { original: true }); ok(o.every((x, i) => JSON.stringify(x) === JSON.stringify(R[i])), fn + ': original rows equal the input');
      ok(R[0].$row === undefined, fn + ': input rows not changed');
    }
  }
  { // errors
    const bad1 = async (o, m) => { let e = null; try { await J.packColumnsParallel(table(), o); } catch (x) { e = x; } ok(e && /sortBy|keepOrder/.test(e.message), m); };
    await bad1({ sortBy: 'nope' }, 'unknown column'); await bad1({ sortBy: ['num', 'up'] }, 'bad direction'); await bad1({ keepOrder: true }, 'keepOrder alone');
    await bad1({ sortBy: 'num', exact: true }, 'with exact'); await bad1({ sortBy: 5 }, 'not a name');
    let e = null; try { await J.packColumnsParallel(Object.assign(table(), { $row: id }), { sortBy: 'num', keepOrder: true }); } catch (x) { e = x; } ok(e && /\$row/.test(e.message), 'table already has $row');
    const t0 = table(), n0 = t0.num.slice(); await J.packColumnsParallel(t0, { sortBy: 'num' }); ok(t0.num.every((v, i) => Object.is(v, n0[i])), 'caller columns not changed');
  }
  console.log(bad ? bad + ' of ' + n + ' sortBy checks FAILED' : 'sortBy: all ' + n + ' checks pass');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
