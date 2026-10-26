// Copyright (c) 2026 LFC Foundry. MIT License.
// Helper-worker reads give the same rows as the plain read (Node worker_threads here; the browser check uses real Web Workers).
const JF = require('../json-format.js'), assert = require('assert'), gen = require('./gen.cjs');
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
  pool.close();
})().catch((e) => { console.log('FAIL', e); process.exit(1); });
