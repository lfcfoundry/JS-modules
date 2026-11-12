// Copyright (c) 2026 LFC Foundry. MIT License.
// Delta saves v2 (prototype): packTables(x, { base }) writes only the changed rows; unpackTables(file, { base }) gives the same tables; wrong or missing base refused.
const JF = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await JF.init();
  let seed = 9; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const hex = (n) => { let s = ''; for (let i = 0; i < n; i++) s += '0123456789abcdef'[(r() * 16) | 0]; return s; };
  const mkNodes = (n) => Array.from({ length: n }, (_, i) => ({ id: i, name: 'node ' + i, x: Math.round(r() * 1e4) / 10, uid: hex(12), attrs: { color: ['red', 'green', 'blue'][i % 3], tags: ['a', 'b', i % 5 ? 'c' : 'd'], pos: { lat: r(), lon: r() } }, ...(i % 7 ? {} : { note: null }) }));
  const mkLinks = (n, m) => Array.from({ length: m }, (_, i) => ({ id: i, a: i % n, b: (i * 7 + 3) % n, bw: Math.round(r() * 1000) / 10 }));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  const same = (a, b, m) => assert.deepStrictEqual(canon(a), canon(b), m);
  const base0 = { title: 'map', nodes: mkNodes(3000), links: mkLinks(3000, 4500) }, baseBytes = JF.packTables(base0);
  const edit = (t, k) => { const x = clone(t); for (let e = 0; e < k; e++) { const q = Math.floor(r() * x.nodes.length), w = e % 4; if (w === 0) x.nodes[q].attrs.color = 'violet'; else if (w === 1) x.nodes[q].name = 'renamed ' + e; else if (w === 2) x.links[Math.floor(r() * x.links.length)].bw = Math.round(r() * 1000) / 10; else x.nodes[q].attrs.pos.lat = r(); } return x; };
  // edits in place, one row at a time and in runs
  for (const k of [0, 1, 20, 200]) {
    const next = edit(base0, k), full = JF.packTables(next), delta = JF.packTables(next, { base: baseBytes });
    same(JF.unpackTables(delta, { base: baseBytes }), JF.unpackTables(full), k + ' edits');
    if (k <= 20) assert(delta.length < full.length * 0.2, k + ' edits under a fifth of a full save: ' + delta.length + ' / ' + full.length);
    console.log(k, 'edits: full', full.length, 'delta', delta.length, (100 * delta.length / full.length).toFixed(1) + '%');
  }
  // rows added at the end, in the middle, removed, moved; a table dropped, a table added, a value table
  const t1 = clone(base0); t1.nodes.push(...mkNodes(5).map((n, i) => (n.id = 9000 + i, n))); t1.nodes.splice(1000, 3); t1.nodes.splice(500, 0, { id: 'new', name: 'inserted' }); t1.links.reverse(); t1.title = 'renamed map'; t1.extra = [{ a: 1 }, { a: 2 }]; delete t1.links; t1.links2 = t1.nodes.slice(0, 5);
  same(JF.unpackTables(JF.packTables(t1, { base: baseBytes }), { base: baseBytes }), JF.unpackTables(JF.packTables(t1)), 'structural edits');
  // no change at all: tiny
  const d0 = JF.packTables(base0, { base: baseBytes }); assert(d0.length < baseBytes.length * 0.05, 'unchanged map: ' + d0.length);
  // a base with other tables, empty tables, null rows and values
  const odd = { a: [], b: [{ x: null }, { x: 1 }], c: 5 }, ob = JF.packTables(odd), od = { a: [{ y: 1 }], b: [{ x: null }, { x: 2 }, { x: 3 }], c: 5, d: null };
  same(JF.unpackTables(JF.packTables(od, { base: ob }), { base: ob }), JF.unpackTables(JF.packTables(od)), 'odd tables');
  // a second save against the same base reuses its row texts and gives the same bytes
  const nx = edit(base0, 10); assert.deepStrictEqual(Buffer.from(JF.packTables(nx, { base: baseBytes })), Buffer.from(JF.packTables(nx, { base: baseBytes })), 'repeatable');
  const dd = JF.packTables(nx, { base: baseBytes });
  // dirty row numbers: only those rows are compared; the result is the same as a full compare when every edit is listed
  { const x = clone(base0), ed = []; for (let e = 0; e < 15; e++) { const q = Math.floor(r() * x.nodes.length); x.nodes[q].attrs.color = 'teal'; ed.push(q); }
    const dd2 = JF.packTables(x, { base: baseBytes, dirty: { nodes: ed, links: [] } });
    same(JF.unpackTables(dd2, { base: baseBytes }), JF.unpackTables(JF.packTables(x)), 'dirty rows');
    assert.strictEqual(Buffer.compare(Buffer.from(dd2), Buffer.from(JF.packTables(x, { base: baseBytes }))), 0, 'dirty and full compare give the same bytes');
    const y = clone(x); y.nodes.push({ id: 'added' }); same(JF.unpackTables(JF.packTables(y, { base: baseBytes, dirty: { nodes: [] } }), { base: baseBytes }), JF.unpackTables(JF.packTables(y)), 'dirty list ignored when the row count changed'); }
  // refusals: no base, another base, a delta as base, a delta as plain input to unpack
  assert.throws(() => JF.unpackTables(dd), /delta/); assert.throws(() => JF.unpack(dd), /delta/);
  assert.throws(() => JF.unpackTables(dd, { base: JF.packTables(edit(base0, 3)) }), /different base/);
  assert.throws(() => JF.packTables(nx, { base: dd }), /full save/);
  // unpack(delta, { base }) gives the rows of the tables in order
  same(JF.unpack(dd, { base: baseBytes }), [].concat(...Object.values(JF.unpackTables(JF.packTables(nx))).filter(Array.isArray)), 'unpack rows');
  // clearing the kept base changes nothing but speed
  JF.trim(); same(JF.unpackTables(JF.packTables(nx, { base: baseBytes }), { base: baseBytes }), JF.unpackTables(JF.packTables(nx)), 'after trim');
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
