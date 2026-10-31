// Copyright (c) 2026 LFC Foundry. MIT License.
// Frame arena (main-thread reads reuse one buffer for decompressed frames): rows, text and row ranges are the same as with fresh copies,
// and rows read earlier stay intact when later reads overwrite the buffer.
const L = require('../lfc-pack.js'), assert = require('assert'), gen = require('./gen.cjs');
(async () => {
  await L.init();
  const files = [['logs', L.pack(Buffer.from(gen.logs(40000)), { blockBytes: 200000 })], ['events', L.pack(Buffer.from(gen.events(8000)), { blockBytes: 150000 })],
    ['logs exact', L.pack(Buffer.from(gen.logs(20000)), { exact: true, blockBytes: 120000 })], ['events paths off', L.pack(Buffer.from(gen.events(6000)), { paths: false, blockBytes: 100000 })]];
  const want = files.map(([, f]) => { L._arena(false); const k = Object.keys(L.unpack(f)[0]).slice(0, 2); return { rows: JSON.stringify(L.unpack(f)), text: Buffer.from(L.unpackText(f)), part: JSON.stringify(L.unpackRows(f, { from: 7, count: 900 })), keys: k, some: JSON.stringify(L.unpack(f, { keys: k })) }; });
  L._arena(true); const kept = [];
  files.forEach(([name, f], i) => {
    const rows = L.unpack(f); kept.push([name, rows, i]);
    assert.strictEqual(JSON.stringify(rows), want[i].rows, name + ': rows');
    assert.ok(Buffer.compare(Buffer.from(L.unpackText(f)), want[i].text) === 0, name + ': text');
    assert.strictEqual(JSON.stringify(L.unpackRows(f, { from: 7, count: 900 })), want[i].part, name + ': row range');
    assert.strictEqual(JSON.stringify(L.unpack(f, { keys: want[i].keys })), want[i].some, name + ': some keys');
  });
  kept.forEach(([name, rows, i]) => assert.strictEqual(JSON.stringify(rows), want[i].rows, name + ': rows changed after later reads'));
  assert.ok(L._arenaBytes() > 0, 'arena kept'); L.trim(); assert.strictEqual(L._arenaBytes(), 0, 'trim drops the arena');
  L._arena(true, 30); L.unpack(files[0][1]); await new Promise((r) => setTimeout(r, 80)); assert.strictEqual(L._arenaBytes(), 0, 'dropped after the idle time');
  console.log('ok   frame arena: same rows, text and ranges; earlier rows intact; dropped by trim and after idle'); process.exit(0);
})().catch((e) => { console.log('FAIL', e && e.message || e); process.exit(1); });
