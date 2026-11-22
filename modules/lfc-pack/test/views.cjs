// Copyright (c) 2026 LFC Foundry. MIT License.
// two-way views (section 22, since 0.22.0): counts and number totals for pairs of label columns, answered from the footer; they equal a decode-and-group of the same file.
'use strict';
const J = require('../lfc-pack.js');
(async () => {
  await J.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL', m); } };
  let a = 9; const r = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const N = 50000, zone = new Array(N), pay = new Array(N), hour = new Int8Array(N), fare = new Float64Array(N), dist = new Float64Array(N), id = new Float64Array(N), te = new TextEncoder();
  const Z = []; for (let k = 0; k < 40; k++) Z.push('z' + k); const PAY = ['card', 'cash', null, 'app'];
  const labs = ['north', 'south', 'east']; const lb = labs.map((s) => te.encode(s)), LB = new Uint8Array(lb.reduce((s, x) => s + x.length, 0)), ls = new Int32Array(3), le = new Int32Array(3); { let d = 0; lb.forEach((x, i) => { ls[i] = d; LB.set(x, d); d += x.length; le[i] = d; }); }
  const reg = new Uint8Array(N);
  for (let i = 0; i < N; i++) { zone[i] = Z[(r() * r() * 40) | 0]; pay[i] = PAY[(r() * 4) | 0]; hour[i] = (r() * 24) | 0; fare[i] = +(3 + r() * 40).toFixed(2); dist[i] = r() < 0.05 ? NaN : +(r() * 12).toFixed(2); id[i] = i + 0.5; reg[i] = (r() * 3) | 0; }
  const table = () => ({ zone, pay, hour, fare, dist, id, region: { kind: 'dict', ids: reg, labels: { bytes: LB, start: ls, end: le } } });
  const f = await J.packColumnsParallel(table(), { views: true }), V = J.views(f);
  ok(V.length >= 4 && V.some((p) => p.join() === 'zone,pay') && V.some((p) => p.join() === 'pay,hour') && !V.some((p) => p.indexOf('fare') >= 0 || p.indexOf('id') >= 0), 'views: true picks label pairs (' + V.map((p) => p.join('x')).join(' ') + ')');
  const exact = (ka, kb, va, vb) => { const m = new Map(); for (let i = 0; i < N; i++) { const k = JSON.stringify([va(i), vb(i)]); let e = m.get(k); if (!e) { e = { count: 0, fare: [0, 0, Infinity, -Infinity], dist: [0, 0, Infinity, -Infinity] }; m.set(k, e); } e.count++;
    for (const [nm, arr] of [['fare', fare], ['dist', dist]]) { const v = arr[i]; if (v !== v) continue; const q = e[nm]; q[0]++; q[1] += v; if (v < q[2]) q[2] = v; if (v > q[3]) q[3] = v; } } return m; };
  const get = { zone: (i) => zone[i], pay: (i) => pay[i], hour: (i) => hour[i], region: (i) => labs[reg[i]] };
  for (const [ka, kb] of [['zone', 'pay'], ['pay', 'zone'], ['pay', 'hour'], ['region', 'pay']]) {
    const v = J.view(f, ka, kb), m = exact(ka, kb, get[ka], get[kb]);
    let good = v && v.cells.length === m.size && v.a === ka && v.b === kb;
    if (good) for (const c of v.cells) { const e = m.get(JSON.stringify([c.a, c.b])); if (!e || e.count !== c.count) { good = false; break; }
      for (const nm of ['fare', 'dist']) { const q = e[nm], cc = c.cols[nm]; if (cc.n !== q[0] || Math.abs(cc.sum - q[1]) > 1e-6 || (q[0] ? cc.min !== q[2] || cc.max !== q[3] || Math.abs(cc.mean - q[1] / q[0]) > 1e-9 : cc.min !== null)) { good = false; break; } } }
    ok(good, 'view ' + ka + ' x ' + kb + ' equals a group-by of the rows');
  }
  ok(J.view(f, 'zone', 'fare') === null && J.view(f, 'nope', 'pay') === null, 'no view -> null');
  const R = await J.open(f); ok(JSON.stringify(R.view('pay', 'hour')) === JSON.stringify(J.view(f, 'pay', 'hour')) && R.views().length === V.length, 'open().view and views');
  const u = J.unpack(f); ok(u.length === N && Object.keys(u[0]).join() === 'zone,pay,hour,fare,dist,id,region', 'rows unchanged');
  const fl = await J.packColumnsParallel(table(), { views: [['zone', 'region']] }); ok(J.views(fl).length === 1 && J.view(fl, 'region', 'zone').cells.reduce((s, c) => s + c.count, 0) === N, 'a list names the pairs');
  ok(J.views(await J.packColumnsParallel(table(), {})).length === 0, 'off by default');
  const fg = await J.packColumnsParallel(table(), { views: [['pay', 'hour']], sortBy: 'fare' }); ok(J.view(fg, 'pay', 'hour').cells.reduce((s, c) => s + c.count, 0) === N, 'with sortBy');
  { // hidden columns are never measures; summary: false still writes views
    const lon = Float64Array.from({ length: N }, (_, i) => (i * 7919 % 1000) / 10), lat = Float64Array.from({ length: N }, (_, i) => (i * 104729 % 900) / 10);
    const fgeo = await J.packColumnsParallel(Object.assign(table(), { lon, lat }), { views: [['pay', 'hour']], geo: { x: 'lon', y: 'lat' } }), vg = J.view(fgeo, 'pay', 'hour');
    ok(vg && !('$hilbert' in vg.cells[0].cols) && 'lon' in vg.cells[0].cols && vg.cells.reduce((s, c) => s + c.count, 0) === N, 'with geo: $hilbert is not a measure');
    const fk = await J.packColumnsParallel(table(), { views: [['pay', 'hour']], sortBy: 'fare', keepOrder: true }), vk = J.view(fk, 'pay', 'hour');
    ok(vk && !('$row' in vk.cells[0].cols), 'with keepOrder: $row is not a measure');
    const fs = await J.packColumnsParallel(table(), { views: [['pay', 'hour']], summary: false }); ok(J.views(fs).length === 1 && J.summary(fs) === null, 'summary: false still writes views');
    const fr = await J.packColumnsParallel(table(), { views: [['zone', 'pay']], scramble: true }); ok(JSON.stringify(J.view(fr, 'zone', 'pay').cells.map((c) => [c.a, c.b, c.count]).sort()) === JSON.stringify(J.view(f, 'zone', 'pay').cells.map((c) => [c.a, c.b, c.count]).sort()), 'with scramble: same counts');
  }
  { const bad1 = async (o, re, m) => { let e = null; try { await J.packColumnsParallel(table(), o); } catch (x) { e = x; } ok(e && re.test(e.message), m); };
    await bad1({ views: [['fare', 'pay']] }, /different values/, 'not a label column'); await bad1({ views: [['zone', 'zone']] }, /views/, 'same column twice'); await bad1({ views: 'x' }, /views/, 'bad option'); }
  console.log(bad ? bad + ' of ' + n + ' views checks FAILED' : 'views: all ' + n + ' checks pass');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
