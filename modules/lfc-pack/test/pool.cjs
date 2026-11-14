// Copyright (c) 2026 LFC Foundry. MIT License.
// Helper-worker reads give the same rows as the plain read (Node worker_threads here; the browser check uses real Web Workers).
const JF = require('../lfc-pack.js'), assert = require('assert'), gen = require('./gen.cjs');
(async () => {
  await JF.init(); const pool = await JF.pool({ workers: 3 });
  for (const [f, text] of [['made-up logs', gen.logs(30000)], ['made-up events', gen.events(8000)]]) {
    const b = Buffer.from(text), p = JF.pack(b, { blockBytes: 300000 }), want = JF.unpack(p);
    let t = performance.now(); const got = await pool.unpack(p); const tp = performance.now() - t; t = performance.now(); JF.unpack(p); const t1 = performance.now() - t;
    assert.deepStrictEqual(got, want);
    const keys = Object.keys(want[0]).slice(0, 2); assert.deepStrictEqual(await pool.unpack(p, { keys }), JF.unpack(p, { keys }));
    const bad = Uint8Array.from(p); bad[40] ^= 1; let err = null; try { await pool.unpack(bad); } catch (e) { err = e; } assert.ok(err, 'damaged block must be refused');
    console.log(f, 'blocks', JF.info(p).blocks, 'pool', tp.toFixed(0), 'ms, single', t1.toFixed(0), 'ms (Node, not for publishing), ok');
  }
  const archive = JF.pack(Buffer.from('{"n":1}\n{"n":2}\n{"n":3}\n'), { blockBytes: 32 });
  const expected = JF.unpack(archive);
  const pooled = Buffer.from(archive);
  const padded = Buffer.concat([Buffer.from([9, 8]), Buffer.from(archive), Buffer.from([7, 6])]);
  const offset = padded.subarray(2, 2 + archive.length);
  const overlapping = padded.subarray(1, 3 + archive.length);
  assert.ok(pooled.buffer.byteLength > pooled.byteLength, 'fixture must use a pooled backing slab');
  assert.ok(offset.byteOffset > 0, 'fixture must exercise a nonzero view offset');
  const overlappingBefore = Buffer.from(overlapping);
  const shared = new SharedArrayBuffer(archive.length + 4);
  const sharedBuffer = Buffer.from(shared, 2, archive.length);
  sharedBuffer.set(archive);
  for (const input of [pooled, offset, offset.slice(), sharedBuffer]) {
    const before = Buffer.from(input);
    assert.deepStrictEqual(await pool.unpack(input), expected);
    assert.deepStrictEqual(Buffer.from(input), before, 'caller Buffer remains intact');
    assert.deepStrictEqual(await pool.unpack(input), expected, 'same Buffer can be reused');
  }
  assert.equal(overlapping.length, archive.length + 2, 'overlapping view remains attached');
  assert.deepStrictEqual(Buffer.from(overlapping), overlappingBefore, 'overlapping view contents remain intact');
  assert.equal(padded.length, archive.length + 4, 'backing Buffer remains attached');
  const pending = Buffer.alloc(archive.length);
  pending.set(archive);
  const queued = pool.unpack(pending);
  pending.fill(0);
  assert.deepStrictEqual(await queued, expected, 'queued worker receives the pre-mutation bytes');
  // P13l: equality reads (equals, anyOf, rows, exact) go through the pool with the same rows as unpack, never every row
  { const rows = []; for (let i = 0; i < 6000; i++) rows.push({ id: i, kind: 'k' + (i % 7), n: i % 50 });
    const eb = JF.pack(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n')), { blockBytes: 20000 });
    for (const o of [{ equals: { key: 'kind', value: 'k3' } }, { equals: { key: 'kind', value: 'k3' }, anyOf: ['k5'] }, { equals: { key: 'kind', value: 'nope' } }, { equals: { key: 'n', value: 7 }, keys: ['id'] }, { equals: { key: 'kind', value: 'k2' }, rows: 'lazy' }, { equals: { key: 'kind', value: 'k2' }, exact: true }]) {
      const a = await pool.unpack(eb, o), w = JF.unpack(eb, o);
      assert.equal(a.length, w.length, 'pool equals row count ' + JSON.stringify(o)); assert.ok(w.length < 6000);
      assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(w)));
    }
    const ac = new AbortController(); ac.abort(); let ae = null; try { await pool.unpack(eb, { equals: { key: 'kind', value: 'k3' }, signal: ac.signal }); } catch (e) { ae = e; } assert.ok(ae, 'aborted equals read rejects'); }
  pool.close();
})().catch((e) => { console.log('FAIL', e); process.exit(1); });
