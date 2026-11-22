// Copyright (c) 2026 LFC Foundry. MIT License.
// geo preset (since 0.20.0): Hilbert-sorted saves with a hidden key column, a 256 x 256 heat grid, and box reads that touch only the blocks they need and equal a full scan.
'use strict';
const J = require('../lfc-pack.js');
(async () => {
  await J.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } else if (process.env.V) console.log('ok', m); };
  let a = 5; const r = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const N = 120000, lon = new Float64Array(N), lat = new Float64Array(N), id = new Int32Array(N), kind = new Array(N);
  const C = [[-73.98, 40.75], [-0.12, 51.5], [139.7, 35.68], [2.35, 48.85], [-122.4, 37.77]];
  for (let i = 0; i < N; i++) { const c = C[(r() * r() * 5) | 0], g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); id[i] = i; kind[i] = 'k' + (i % 7);
    if (i % 997 === 0) { lon[i] = NaN; lat[i] = 10; } else { lon[i] = c[0] + g() * 0.3; lat[i] = c[1] + g() * 0.2; } }
  const table = () => ({ id, lon, lat, kind });
  const f = await J.packColumnsParallel(table(), { geo: { x: 'lon', y: 'lat' }, blockBytes: 65536 }), G = J.geo(f), R = await J.open(f), S = J.summary(f);
  ok(G && G.x === 'lon' && G.cells === 256 && G.heat.length === 65536 && G.heat.reduce((s, v) => s + v, 0) === N - Math.ceil(N / 997), 'geo(): heat counts every row with both coordinates');
  ok(S.sortedBy === '$hilbert' && Array.isArray(S.hidden) && S.hidden[0] === '$hilbert' && !S.cols.some((c) => c.key === '$hilbert'), 'section 20: sorted by the hidden key');
  const u = J.unpack(f); ok(u.length === N && !('$hilbert' in u[0]) && Object.keys(u[0]).join() === 'id,lon,lat,kind', 'reads leave $hilbert out');
  ok(!('$hilbert' in J.unpack(f, { keys: ['id', '$hilbert'] })[0]) && G.key === null, 'no key column stored (since 0.23.0)');
  const uc = J.unpackColumns(f); ok(!uc.some((b) => '$hilbert' in b.cols), 'unpackColumns leaves it out');
  const pc = await J.unpackColumnsParallel(f); ok(!('$hilbert' in pc) && pc.id.length === N, 'unpackColumnsParallel leaves it out');
  const pr = await J.unpackRowsParallel(f); ok(pr.length === N && !('$hilbert' in pr[0]), 'unpackRowsParallel leaves it out');
  ok(R.info.blocks >= 10, 'small blocks (' + R.info.blocks + ')');
  // block key ranges (since 0.23.0): one per block, rising and not overlapping, null only for the blocks of rows with a missing coordinate (last)
  const Z = G.zones, kc = J.unpack(f, { keys: ['lon', 'lat'] }), b = G.bounds; let rise = Z && Z.length === R.info.blocks, seenNull = false;
  for (let i = 0; rise && i < Z.length; i++) { if (Z[i] === null) { seenNull = true; continue; } if (seenNull || Z[i][0] > Z[i][1] || (i && Z[i - 1] && Z[i - 1][1] > Z[i][0])) rise = false; }
  ok(rise, 'zones: one per block, rising');
  ok(kc.slice(-Math.ceil(N / 997)).every((x) => x.lon === null), 'rows with a missing coordinate go last');
  const boxes = [[-74.1, 40.6, -73.8, 40.9], [-0.2, 51.45, -0.05, 51.55], [100, -10, 150, 60], [-180, -90, 180, 90], [5, 5, 6, 6], [-73.99, 40.74, -73.97, 40.76], [b[0], b[1], b[0], b[1]]];
  for (const bx of boxes) {
    const got = await R.bbox(bx[0], bx[1], bx[2], bx[3]), want = [];
    for (let i = 0; i < N; i++) if (lon[i] >= bx[0] && lon[i] <= bx[2] && lat[i] >= bx[1] && lat[i] <= bx[3]) want.push(i);
    const gi = got.map((x) => x.id).sort((p, q) => p - q);
    ok(gi.length === want.length && gi.every((v, i) => v === want[i]), 'box ' + bx.join(',') + ': ' + got.length + ' rows equal a full scan, ' + got.blocksRead + ' of ' + R.info.blocks + ' blocks');
    ok(!got.length || !('$hilbert' in got[0]) && got[0].kind !== undefined, 'box rows: all keys, no $hilbert');
  }
  const small = await R.bbox(-74.1, 40.6, -73.8, 40.9); ok(small.blocksRead < R.info.blocks / 2, 'a city box reads under half the blocks (' + small.blocksRead + ' of ' + R.info.blocks + ')');
  const kk = await R.bbox(-74.1, 40.6, -73.8, 40.9, { keys: ['id'] }); ok(kk.length === small.length && Object.keys(kk[0]).join() === 'id', 'bbox keys');
  { // given bounds: points outside clamp to the edge and are still found
    const fb = await J.packColumnsParallel(table(), { geo: { x: 'lon', y: 'lat', bounds: [-80, 30, 10, 60] } }), Rb = await J.open(fb), got = await Rb.bbox(130, 30, 150, 40);
    let w = 0; for (let i = 0; i < N; i++) if (lon[i] >= 130 && lon[i] <= 150 && lat[i] >= 30 && lat[i] <= 40) w++;
    ok(got.length === w && w > 0, 'outside the given bounds: clamped, still found (' + w + ')');
  }
  { // keepOrder with geo; summary: false
    const fk = await J.packColumnsParallel(table(), { geo: { x: 'lon', y: 'lat' }, keepOrder: true }), o = J.unpackRows(fk, { original: true });
    ok(o.every((x, i) => x.id === i && !('$hilbert' in x) && !('$row' in x)), 'keepOrder: original order back, both hidden');
    const fs = await J.packColumnsParallel(table(), { geo: { x: 'lon', y: 'lat' }, summary: false }), us = J.unpack(fs);
    ok(us.length === N && !('$hilbert' in us[0]) && J.summary(fs).hidden[0] === '$hilbert', 'summary: false still hides the key');
  }
  { // errors
    const bad1 = async (o, re, m) => { let e = null; try { await J.packColumnsParallel(table(), o); } catch (x) { e = x; } ok(e && re.test(e.message), m); };
    await bad1({ geo: { x: 'lon', y: 'nope' } }, /geo/, 'unknown column'); await bad1({ geo: { x: 'lon', y: 'lat' }, sortBy: 'id' }, /sortBy/, 'with sortBy');
    await bad1({ geo: { x: 'lon', y: 'lat' }, scramble: true }, /scramble/, 'with scramble'); await bad1({ geo: { x: 'lon', y: 'lat', bounds: [1, 2, 0, 3] } }, /bounds/, 'bad bounds');
    let e = null; try { await (await J.open(await J.packColumnsParallel(table(), {}))).bbox(0, 0, 1, 1); } catch (x) { e = x; } ok(e && /geo/.test(e.message), 'bbox on a plain file');
    ok(J.geo(await J.packColumnsParallel(table(), {})) === null, 'geo() on a plain file is null');
  }
  console.log(bad ? bad + ' of ' + n + ' geo checks FAILED' : 'geo: all ' + n + ' checks pass');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
