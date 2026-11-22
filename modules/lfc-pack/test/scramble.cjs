// Copyright (c) 2026 LFC Foundry. MIT License.
// scramble (since 0.18.0): rows saved in a seeded random order (every block a uniform sample), saved-order column hidden, original order back; open().progressive gives running totals.
'use strict';
const J = require('../lfc-pack.js');
(async () => {
  await J.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
  const N = 60000, id = new Int32Array(N), val = new Float64Array(N), grp = new Array(N), txt = new Array(N);
  for (let i = 0; i < N; i++) { id[i] = i; grp[i] = 'g' + (i * 12 / N | 0); val[i] = i % 11 === 0 ? NaN : (i * 12 / N | 0) * 10 + ((i * 7919) % 101) / 10; txt[i] = 'w' + (i % 37); }
  const table = () => ({ id, val, grp, txt });
  const f = await J.packColumnsParallel(table(), { scramble: true, blockBytes: 40000 }), f2 = await J.packColumnsParallel(table(), { scramble: true, blockBytes: 40000 }), f3 = await J.packColumnsParallel(table(), { scramble: 7, blockBytes: 40000 });
  const ids = (file) => { const o = []; J.unpackColumns(file, { keys: ['id'] }).forEach((b) => { for (let i = 0; i < b.n; i++) o.push(b.cols.id[i]); }); return o; };
  const a = ids(f), a3 = ids(f3);
  ok(a.length === N && new Set(a).size === N && a.some((v, i) => v !== i), 'scrambled: every row once, not in input order');
  ok(f.length === f2.length && f.every((x, i) => x === f2[i]), 'same seed: same file');
  ok(a3.some((v, i) => v !== a[i]), 'another seed: another order');
  const S = J.summary(f), S0 = J.summary(await J.packColumnsParallel(table(), { blockBytes: 40000 }));
  ok(S.scrambled && S.scrambled.seed === 0x2545F491 && S.rowIndex === undefined && S.sortedBy === undefined && !S.cols.some((c) => c.key === '$row' || c.sorted), 'section 20: scrambled, no stored row column, nothing marked sorted');
  ok(J.summary(f3).scrambled.seed === 7, 'seed stored');
  const sv = S.cols.find((c) => c.key === 'val'), sv0 = S0.cols.find((c) => c.key === 'val');
  ok(sv.min === sv0.min && sv.max === sv0.max && sv.nulls === sv0.nulls, 'summary min, max, nulls as unscrambled');
  const u = J.unpack(f); ok(u.length === N && !('$row' in u[0]), '$row hidden');
  const pk = J.unpack(f, { original: true, keys: ['id', 'grp'] }); ok(pk.every((x, i) => x.id === i && x.grp === grp[i] && Object.keys(x).length === 2), 'original with keys');
  const po = await J.unpackRowsParallel(f, { original: true }); ok(po.length === N && po[777].id === 777, 'unpackRowsParallel original');
  const o = J.unpackRows(f, { original: true }); ok(o.every((x, i) => x.id === i && x.grp === grp[i] && x.txt === txt[i] && (x.val === null ? val[i] !== val[i] : x.val === val[i])), 'original order back, values equal');
  // blocks are samples: every block holds about the same share of each group
  const bl = J.unpackColumns(f, { keys: ['grp'] }); let worst = 0; bl.forEach((b) => { const c = {}; for (let i = 0; i < b.n; i++) c[b.cols.grp[i]] = (c[b.cols.grp[i]] || 0) + 1; for (const k in c) worst = Math.max(worst, Math.abs(c[k] / b.n - 1 / 12)); });
  ok(bl.length > 3 && worst < 0.05, 'every block is a sample (worst group share off by ' + worst.toFixed(3) + ')');
  { // summary: false still writes the section
    const fs = await J.packColumnsParallel(table(), { scramble: 3, summary: false }), Ss = J.summary(fs);
    ok(Ss.scrambled.seed === 3 && !('$row' in J.unpack(fs)[0]) && J.unpackRows(fs, { original: true })[99].id === 99 && J.unpackRows(fs, { original: true, from: 5, count: 3 }).map((x) => x.id).join() === '5,6,7', 'summary false: scrambled section, original, from/count');
  }
  { // row arrays
    const R = []; for (let i = 0; i < 9000; i++) R.push({ id: i, s: 'x' + (i % 50), v: i % 3 ? i : null });
    for (const fn of ['packRows', 'packRowsParallel']) {
      const fr = await J[fn](R, { scramble: 11 }), ur = J.unpack(fr), or = J.unpackRows(fr, { original: true });
      ok(ur.length === R.length && ur.some((x, i) => x.id !== i) && !('$row' in ur[0]) && J.summary(fr).scrambled.seed === 11, fn + ': scrambled, hidden');
      ok(or.every((x, i) => JSON.stringify(x) === JSON.stringify(R[i])), fn + ': original rows equal the input');
    }
  }
  { // errors
    const bad1 = async (o, re, m) => { let e = null; try { await J.packColumnsParallel(table(), o); } catch (x) { e = x; } ok(e && re.test(e.message), m); };
    await bad1({ scramble: true, sortBy: 'id' }, /scramble.*sortBy/, 'with sortBy'); await bad1({ scramble: true, exact: true }, /scramble/, 'with exact');
    await bad1({ scramble: -1 }, /scramble must/, 'bad seed'); await bad1({ scramble: 'x' }, /scramble must/, 'seed not a number');
    await bad1({ scramble: true, keepOrder: true }, /keepOrder/, 'with keepOrder');
  }
  { // progressive: exact at the end, fair estimates early, stop early
    const R = await J.open(f), steps = [];
    const last = await R.progressive(['val'], (s) => { steps.push({ rows: s.rows, est: s.cols.val.estSum, mean: s.cols.val.mean, g: new Map(Array.from(s.groups, ([k, v]) => [k, v.cols.val.mean])) }); }, { by: 'grp' });
    let sum = 0, cnt = 0, gs = {}; for (let i = 0; i < N; i++) if (val[i] === val[i]) { sum += val[i]; cnt++; const g = grp[i]; (gs[g] = gs[g] || [0, 0]); gs[g][0] += val[i]; gs[g][1]++; }
    ok(last.rows === N && last.share === 1 && Math.abs(last.cols.val.sum - sum) < 1e-6 && last.cols.val.n === cnt && steps.length === R.info.blocks, 'last step exact; one step per block');
    ok(Array.from(last.groups).every(([k, v]) => Math.abs(v.cols.val.sum - gs[k][0]) < 1e-6 && v.cols.val.n === gs[k][1]), 'groups exact at the end');
    const first = steps[0]; let gw = 0; first.g.forEach((m, k) => { gw = Math.max(gw, Math.abs(m - gs[k][0] / gs[k][1]) / (gs[k][0] / gs[k][1])); });
    ok(Math.abs(first.est - sum) / sum < 0.05 && gw < 0.1, 'first block: total within 5% (' + (Math.abs(first.est - sum) / sum * 100).toFixed(2) + '%), worst group mean within 10% (' + (gw * 100).toFixed(2) + '%)');
    const R0 = await J.open(await J.packColumnsParallel(table(), { blockBytes: 40000 })); let e0; await R0.progressive('val', (s) => { e0 = s.cols.val.estSum; return false; });
    ok(Math.abs(e0 - sum) / sum > 0.3, 'unscrambled file: first block is not a fair sample (as documented)');
    let k = 0; const st = await R.progressive('val', () => ++k < 2); ok(k === 2 && st.block === 1, 'onStep false stops early');
    let er = null; try { await R.progressive([], () => {}); } catch (x) { er = x; } ok(er && /keys/.test(er.message), 'progressive needs keys');
  }
  console.log(bad ? bad + ' of ' + n + ' scramble checks FAILED' : 'scramble: all ' + n + ' checks pass');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
