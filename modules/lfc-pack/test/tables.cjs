// Copyright (c) 2026 LFC Foundry. MIT License.
// packRows and packTables: a map-shaped object (tables of rows plus plain values) comes back value-exact, also with exact: true and through the helper workers.
const JF = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await JF.init();
  const nodes = Array.from({ length: 5000 }, (_, i) => ({ id: i, name: 'node-' + (i % 50), x: i * 1.5, y: 0 - i, tags: i % 3 ? ['a', 'b'] : [], pos: { lat: 40 + i / 1000, lon: -70 } }));
  const links = Array.from({ length: 9000 }, (_, i) => ({ s: i % 5000, t: (i * 7) % 5000, w: i % 11, color: i % 2 ? '#ff0000' : '#00ff00' }));
  const map = { nodes, links, states: [{ t: 0, on: true }, { t: 5, on: false }], view: { zoom: 2.5, center: [10, -3], mode: 'sankey', flags: { a: true, b: null } }, title: 'Test map', empty: [], n: 42 };
  for (const o of [{}, { exact: true }, { block: 'flat' }, { blockBytes: 50000 }]) {
    const bytes = JF.packTables(map, o), back = JF.unpackTables(bytes);
    assert.deepStrictEqual(back, map); assert.deepStrictEqual(Object.keys(back), Object.keys(map));
    assert.deepStrictEqual(JF.unpackTables(bytes, { keys: ['id'] }).nodes, nodes.map((r) => ({ id: r.id })));
    assert.strictEqual(JF.info(bytes).rows, nodes.length + links.length + 2 + 1 + 1 + 0 + 1);
  }
  assert.deepStrictEqual(JF.unpack(JF.packRows(nodes)), nodes);
  const pool = await JF.pool({ workers: 2 }); const bytes = JF.packTables(map, { blockBytes: 50000 });
  assert.deepStrictEqual(await pool.unpack(bytes, { table: 1 }), links); pool.close();
  // link lists: sorted, unsorted, empty, large ids, and a list that is not whole numbers (falls back to JSON text)
  const lists = Array.from({ length: 300 }, (_, i) => ({ id: i, a: i % 7 ? [i, i + 3, i + 3, 4294967295] : [], b: i % 2 ? [9, 2, 5] : [1.5], c: [0, i] }));
  for (const o of [{}, { exact: true }, { block: 'flat' }]) assert.deepStrictEqual(JF.unpack(JF.pack(lists.map((x) => JSON.stringify(x)).join('\n'), o)), lists);
  console.log('tables ok, map file', JF.packTables(map).length, 'bytes for', JSON.stringify(map).length, 'bytes of JSON');
})().catch((e) => { console.log('FAIL', e); process.exit(1); });
