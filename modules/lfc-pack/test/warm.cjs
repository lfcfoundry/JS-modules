// warm() (since 0.6.1): opt-in; resolves true once, gives the same promise again, and leaves later saves and opens byte-identical. The read-only file resolves false.
'use strict';
const assert = require('assert');
const path = require('path');
(async () => {
  const L = require(path.join(__dirname, '..', 'lfc-pack.js'));
  const doc = { meta: { name: 'm' }, nodes: [{ id: 'a', x: 1.5, tags: ['t'] }, { id: 'b', x: 2, tags: [] }], links: [{ source: 'a', target: 'b', value: 3 }] };
  await L.init();
  const before = L.packTables(doc);
  const p = L.warm();
  assert.strictEqual(L.warm(), p, 'same promise');
  assert.strictEqual(await p, true, 'warm() resolves true');
  const after = L.packTables(doc);
  assert.deepStrictEqual(Buffer.from(after), Buffer.from(before), 'same bytes after warm()');
  assert.deepStrictEqual(L.unpackTables(after), L.unpackTables(before));
  const R = require(path.join(__dirname, '..', 'lfc-pack-read.js'));
  const r = await Promise.race([R.warm(), new Promise(res => setTimeout(() => res('timeout'), 5000))]);
  assert.strictEqual(r, false, 'read-only file: warm() resolves false');
  console.log('warm: 5 checks passed');
})().catch(e => { console.error(e); process.exit(1); });
