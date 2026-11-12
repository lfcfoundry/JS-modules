// Copyright (c) 2026 LFC Foundry. MIT License.
// Delta saves (prototype): pack/packTables with { base } write frames against the base's frames; unpack with { base } gives the same rows; a wrong or missing base is refused.
const JF = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await JF.init();
  let seed = 9; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const hex = (n) => { let s = ''; for (let i = 0; i < n; i++) s += '0123456789abcdef'[(r() * 16) | 0]; return s; };
  const mkNodes = (n) => Array.from({ length: n }, (_, i) => ({ id: i, name: 'node ' + i + ' ' + ['alpha', 'beta', 'gamma', 'delta'][i % 4], x: Math.round(r() * 1e4) / 10, y: Math.round(r() * 1e4) / 10, w: +(r() * 5).toFixed(2), grp: ['a', 'b', 'c'][i % 3], on: i % 5 !== 0, uid: hex(8) + '-' + hex(4) + '-4' + hex(3) + '-a' + hex(3) + '-' + hex(12), ip: '10.0.' + (i % 200) + '.' + (i % 250), tags: (i % 7) + ',' + ((i * 3) % 11), note: 'n' + i, free: i % 4 === 0 ? 5 : 7 }));
  const mkLinks = (n, m) => Array.from({ length: m }, (_, i) => ({ id: i, a: i % n, b: (i * 7 + 3) % n, bw: Math.round(r() * 1000) / 10, state: ['up', 'down'][i % 2] }));
  const edit = (tabs, k) => { const t = JSON.parse(JSON.stringify(tabs)); for (let e = 0; e < k; e++) { const q = Math.floor(r() * t.nodes.length); const w = e % 3; if (w === 0) t.nodes[q].name = 'renamed ' + e; else if (w === 1) t.nodes[q].w = +(r() * 5).toFixed(2); else t.links[Math.floor(r() * t.links.length)].bw = Math.round(r() * 1000) / 10; } t.nodes.push({ id: t.nodes.length, name: 'new node', x: 1, y: 2, w: 1, grp: 'a', on: true, uid: hex(8) + '-' + hex(4) + '-4' + hex(3) + '-a' + hex(3) + '-' + hex(12), ip: '10.1.1.1', tags: '1,2', note: 'new', free: 7 }); return t; };
  const base0 = { nodes: mkNodes(2000), links: mkLinks(2000, 3000) };
  const baseBytes = JF.packTables(base0, { check: 'xxh64' });
  const plain = JF.packTables(base0, { check: 'xxh64' });
  assert.deepStrictEqual(Buffer.from(baseBytes), Buffer.from(plain), 'without base the bytes are the usual ones');
  let prev = 0;
  for (const k of [1, 20, 100, 500]) {
    const next = edit(base0, k), full = JF.packTables(next, { check: 'xxh64' }), delta = JF.packTables(next, { check: 'xxh64', base: baseBytes });
    assert(delta.length < full.length, 'delta smaller: ' + k + ' edits ' + delta.length + ' vs ' + full.length);
    assert.deepStrictEqual(JF.unpackTables ? JF.unpack(delta, { base: baseBytes }) : null, JF.unpack(full), 'same rows ' + k);
    if (k === 1) assert(delta.length < full.length * 0.5, 'one edit is well under half a full save: ' + delta.length + '/' + full.length);
        // no base: refused; wrong base: refused
    assert.throws(() => JF.unpack(delta), /delta/);
    assert.throws(() => JF.unpack(delta, { base: JF.packTables(edit(base0, 3), { check: 'xxh64' }) }), /different base/);
    // frames that cannot be decoded without the right prefix: a flipped base byte is caught by the checksum before any row is built
    console.log(k, 'edits: full', full.length, 'delta', delta.length, (100 * delta.length / full.length).toFixed(0) + '%');
  }
  // a base with other columns and fewer blocks: the delta still reads back
  const other = { nodes: mkNodes(300).map((n) => { delete n.ip; n.extra = 1; return n; }), links: [] };
  const ob = JF.packTables(other), nx = edit(base0, 10), d2 = JF.packTables(nx, { base: ob });
  assert.deepStrictEqual(JF.unpack(d2, { base: ob }), JF.unpack(JF.packTables(nx)), 'other columns');
  // a nested file has no flat blocks to share: the result is the full file and reads with or without the base
  const ev = Buffer.from(Array.from({ length: 400 }, (_, i) => JSON.stringify({ a: { b: [i, { c: 'x' + (i % 5) }] } })).join('\n') + '\n'), eb = JF.pack(ev), ed = JF.pack(ev, { base: eb });
  assert.deepStrictEqual(JF.unpack(ed, { base: eb }), JF.unpack(eb)); assert.deepStrictEqual(Buffer.from(ed), Buffer.from(JF.pack(ev)));
  // a delta is not a base
  const dd = JF.packTables(edit(base0, 5), { base: baseBytes }); assert.throws(() => JF.packTables(edit(base0, 5), { base: dd }), /full save/);
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
