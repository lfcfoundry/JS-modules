// Copyright (c) 2026 LFC Foundry. MIT License.
// Pool byte accounting, backpressure and cancellation (since 0.9.0). Node worker_threads; pass/fail plus byte counts (no timings).
// A "stall" holds every message the pool posts to a helper (the helper never sees it) until released, so a slow or stuck consumer is
// simulated exactly, without timers. Run: node modules/lfc-pack/test/pool-budget.cjs [--json]   (also used by the handoff evidence script)
'use strict';
const assert = require('assert'), crypto = require('crypto');
const { Worker } = require('worker_threads');
const JF = require(process.env.LFC_PACK_FILE || '../lfc-pack.js');
const real = Worker.prototype.postMessage;
let held = null;   // null: pass through; array: hold
Worker.prototype.postMessage = function (m, t) { if (held && m && m.buf) { held.push([this, m, t, m.buf.byteLength]); return; } return real.call(this, m, t); };
const stall = () => { held = []; };
let postError = null;
const release = () => { const h = held || []; held = null; for (const [w, m, t] of h) { try { real.call(w, m, t); } catch (e) { postError = String(e.message); } } return h.length; };
const heldBytes = () => (held || []).reduce((a, x) => a + x[3], 0);
const tick = () => new Promise((r) => setImmediate(r));
function fixture(blocks, perBlock, seed) {   // poorly compressible rows, so compressed blocks stay near perBlock bytes
  let s = '', i = 0; const h = crypto.createHash('sha256').update(String(seed));
  while (s.length < blocks * perBlock) s += JSON.stringify({ i: i++, r: crypto.createHash('sha256').update(h.copy().update(String(i)).digest()).digest('base64') + crypto.createHash('sha256').update(String(-i)).digest('hex') }) + '\n';
  return JF.pack(s, { blockBytes: perBlock });
}
(async () => {
  await JF.init();
  const json = process.argv.includes('--json'), report = {};
  const file = fixture(40, 131072, 1), info = JF.info(file), want = JF.unpack(file);
  const blockBytes = JSON.parse(JSON.stringify(info.blocks));
  report.fixture = { fileBytes: file.length, blocks: blockBytes, rows: want.length };
  const probe = await JF.pool({ workers: 1 }), hasStats = typeof probe.stats === 'function'; probe.close();
  async function scenario(name, popts, uopts, input) {
    const pool = await JF.pool(Object.assign({ workers: 2 }, popts)); global.gc && global.gc();
    const ab0 = process.memoryUsage().arrayBuffers;
    stall();
    const callInput = input === 'buffer' ? Buffer.from(file) : Uint8Array.from(file);
    const before = Buffer.from(callInput);
    const p = pool.unpack(callInput, uopts); p.catch(() => {});
    await tick(); await tick();
    global.gc && global.gc();
    const r = { name, input, postedWhileStalled: (held || []).length, postedBytesWhileStalled: heldBytes(), arrayBufferGrowthWhileStalled: process.memoryUsage().arrayBuffers - ab0 - callInput.byteLength - before.byteLength };
    if (hasStats) Object.assign(r, { stats: pool.stats() });
    postError = null; release();
    if (postError) { r.error = postError; if (hasStats) throw new Error(postError); pool.close(); report[name] = r; return r; }
    try {
      const rows = await p;
      assert.deepStrictEqual(rows, want, name + ': rows');
      assert.deepStrictEqual(Buffer.from(callInput), before, name + ': caller bytes intact');
    } catch (e) { if (hasStats) throw e; r.error = String(e.message).split('\n')[0]; pool.close(); report[name] = r; return r; }
    if (hasStats) { const s = pool.stats(); r.after = { queuedJobs: s.queuedJobs, inflightJobs: s.inflightJobs, inflightBytes: s.inflightBytes, heldCopyBytes: s.heldCopyBytes, peakInflightBytes: s.peakInflightBytes, peakHeldCopyBytes: s.peakHeldCopyBytes, copiedBytes: s.copiedBytes }; }
    pool.close(); report[name] = r; if (process.env.DBG) console.error('done', name); return r;
  }
  const compressed = info.bodyEnd || file.length;
  await scenario('default (copy at call)', {}, {}, 'uint8array');
  await scenario('default, Buffer input', {}, {}, 'buffer');
  if (!hasStats) { console.log(json ? JSON.stringify(report) : 'baseline: no stats(); measured ' + JSON.stringify(report)); return; }

  const d = report['default (copy at call)'];
  assert.ok(d.stats.heldCopyBytes > 0.9 * d.stats.queuedBytes, 'default: every queued block already holds its private copy');
  assert.strictEqual(d.postedWhileStalled, 4, 'two helpers take two jobs each');

  const s = await scenario('stable (copy at send)', {}, { stable: true }, 'uint8array');
  assert.ok(s.stats.queuedCopyBytes === 0 && s.stats.heldCopyBytes === s.stats.inflightBytes, 'stable: queued blocks hold no copy');
  assert.strictEqual(s.stats.heldCopyBytes, s.postedBytesWhileStalled, 'stable: held copies are exactly the posted blocks');
  assert.ok(s.stats.heldCopyBytes < d.stats.heldCopyBytes / 5, 'stable: at most 4 of 40 blocks copied while the consumer is stalled');

  const one = blockSize(file, JF);
  const b = await scenario('stable + maxInflightBytes = 1.5 blocks', { maxInflightBytes: Math.floor(one * 1.5) }, { stable: true }, 'buffer');
  assert.strictEqual(b.postedWhileStalled, 1, 'budget: one block in flight when two would pass the limit');
  assert.ok(b.after.peakInflightBytes <= Math.floor(one * 1.5) + one * 0.2, 'budget: posted bytes stay under the limit (+ block size spread)');

  const ov = await scenario('maxInflightBytes below one block (runs alone)', { maxInflightBytes: 100 }, { stable: true }, 'uint8array');
  assert.strictEqual(ov.postedWhileStalled, 1, 'oversize: a block larger than the limit still runs, alone');

  {   // bursty producer: six calls at once on one pool, consumer stalled
    const pool = await JF.pool({ workers: 2, maxInflightBytes: one * 2 });
    stall();
    const ps = []; for (let k = 0; k < 6; k++) ps.push(pool.unpack(Uint8Array.from(file), { stable: true }));
    await tick();
    const st = pool.stats();
    report.bursty = { calls: 6, queuedJobs: st.queuedJobs, queuedBytes: st.queuedBytes, heldCopyBytes: st.heldCopyBytes, postedWhileStalled: held.length };
    assert.ok(st.heldCopyBytes <= one * 2.2 && st.queuedCopyBytes === 0, 'bursty: held copies bounded by the byte limit across calls');
    release();
    for (const p of ps) assert.deepStrictEqual(await p, want, 'bursty: rows');
    const s2 = pool.stats(); assert.ok(s2.queuedJobs === 0 && s2.inflightJobs === 0 && s2.inflightBytes === 0 && s2.heldCopyBytes === 0, 'bursty: everything released');
    report.bursty.peakHeldCopyBytes = s2.peakHeldCopyBytes; pool.close();
  }
  for (const stable of [false, true]) {   // cancellation and recovery, consumer stalled
    const pool = await JF.pool({ workers: 2 });
    const ac = new AbortController();
    stall();
    const p = pool.unpack(Uint8Array.from(file), { signal: ac.signal, stable });
    await tick();
    const mid = pool.stats();
    ac.abort();
    let err = null; try { await p; } catch (e) { err = e; }
    assert.ok(err && err.name === 'AbortError', 'cancel: the call rejects with AbortError');
    const afterAbort = pool.stats();
    assert.strictEqual(afterAbort.queuedJobs, 0, 'cancel: queued jobs dropped at once');
    assert.strictEqual(afterAbort.queuedCopyBytes, 0, 'cancel: queued copies released at once');
    assert.strictEqual(afterAbort.inflightJobs, mid.inflightJobs, 'cancel: posted jobs stay counted until their helper answers');
    release();
    // helpers answer on their own schedule (a slow machine took longer than the old fixed 200 ms): poll until every posted job is released, 5 s at most, so a leak still fails
    const t0 = Date.now(); let settled = pool.stats();
    while ((settled.inflightJobs !== 0 || settled.inflightBytes !== 0 || settled.heldCopyBytes !== 0) && Date.now() - t0 < 5000) { await new Promise((r) => setTimeout(r, 20)); settled = pool.stats(); }
    assert.ok(settled.inflightJobs === 0 && settled.inflightBytes === 0 && settled.heldCopyBytes === 0, 'cancel: posted jobs released when answered');
    assert.deepStrictEqual(await pool.unpack(Uint8Array.from(file), { stable }), want, 'recovery: the same pool reads the next call correctly');
    const pre = new AbortController(); pre.abort();
    let e2 = null; try { await pool.unpack(file, { signal: pre.signal }); } catch (e) { e2 = e; }
    assert.ok(e2 && e2.name === 'AbortError', 'cancel: an already-aborted signal rejects at once');
    report['cancel ' + (stable ? 'stable' : 'default')] = { cancelledJobs: settled.cancelledJobs, queuedBeforeAbort: mid.queuedJobs, inflightBeforeAbort: mid.inflightJobs };
    pool.close();
  }
  {   // an abort after the call finished changes nothing
    const pool = await JF.pool({ workers: 2 }), ac = new AbortController();
    assert.deepStrictEqual(await pool.unpack(file, { signal: ac.signal }), want); ac.abort();
    assert.strictEqual(pool.stats().inflightJobs, 0); pool.close();
  }
  process.exitCode = 0;
  console.log(json ? JSON.stringify(report) : 'pool budget: ok ' + JSON.stringify({ default: d.stats.heldCopyBytes, stable: s.stats.heldCopyBytes, budget: b.stats.heldCopyBytes, bursty: report.bursty.heldCopyBytes }));
})().catch((e) => { console.log('FAIL', e); process.exit(1); });
function blockSize(file, JF) { const f = JF.info(file); return Math.round(file.length / Math.max(1, f.blocks)); }
