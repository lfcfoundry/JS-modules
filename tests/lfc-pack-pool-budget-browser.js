// lfc-pack pool byte limits, backpressure and cancellation (0.9.0) with real Web Workers, one browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// The page holds every block the pool posts to a helper (Worker.prototype.postMessage is wrapped) until released, so a stalled consumer is exact and needs no timers.
// Pass/fail plus byte counts from pool.stats(); no timings. Same checks as modules/lfc-pack/test/pool-budget.cjs (Node).
// Run: node tests/lfc-pack-pool-budget-browser.js <chromium|firefox|webkit> [out.json]
'use strict';
const fs = require('fs'), path = require('path'), T = require('../tools/test-runner/runner.js');
const src = fs.readFileSync(path.resolve(__dirname, '../modules/lfc-pack/lfc-pack.js'), 'utf8');
async function pageWork() {
  const J = window.LfcPack; await J.init(); const out = { bad: [], rows: [] }, bad = (c, m) => { if (!c) out.bad.push(m); };
  const real = Worker.prototype.postMessage; let held = null;
  Worker.prototype.postMessage = function (m, t) { if (held && m && m.buf) { held.push([this, m, t, m.buf.byteLength]); return; } return real.call(this, m, t); };
  const stall = () => { held = []; }, release = () => { const h = held || []; held = null; h.forEach((x) => real.call(x[0], x[1], x[2])); return h.length; };
  const heldBytes = () => (held || []).reduce((a, x) => a + x[3], 0), tick = () => new Promise((r) => setTimeout(r, 0));
  let seed = 1; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0).toString(36);
  let s = '', i = 0; while (s.length < 40 * 131072) s += JSON.stringify({ i: i++, r: rnd() + rnd() + rnd() + rnd() + rnd() + rnd() + rnd() + rnd() }) + '\n';
  const file = J.pack(s, { blockBytes: 131072 }), info = J.info(file), want = JSON.stringify(J.unpack(file)), one = Math.round(file.length / Math.max(1, info.blocks));
  out.rows.push('fixture: ' + file.length + ' bytes, ' + info.blocks + ' blocks');
  const same = (rows) => JSON.stringify(rows) === want;
  async function scenario(name, popts, uopts) {
    const pool = await J.pool(Object.assign({ workers: 2 }, popts)); stall();
    const input = Uint8Array.from(file), p = pool.unpack(input, uopts); p.catch(() => {});
    await tick(); await tick();
    const r = { posted: held.length, postedBytes: heldBytes(), stats: pool.stats() }; release();
    bad(same(await p), name + ': rows'); bad(input.every((x, k) => x === file[k]), name + ': caller bytes intact');
    r.after = pool.stats(); pool.close();
    out.rows.push(name + ': posted ' + r.posted + ' blocks, held copies ' + r.stats.heldCopyBytes + ' bytes while stalled');
    return r;
  }
  const d = await scenario('default (copy at call)', {}, {});
  bad(d.stats.heldCopyBytes > 0.9 * d.stats.queuedBytes, 'default: every queued block holds its copy'); bad(d.posted === 4, 'default: two helpers take two jobs each (got ' + d.posted + ')');
  const st = await scenario('stable (copy at send)', {}, { stable: true });
  bad(st.stats.queuedCopyBytes === 0 && st.stats.heldCopyBytes === st.stats.inflightBytes, 'stable: queued blocks hold no copy');
  bad(st.stats.heldCopyBytes === st.postedBytes, 'stable: held copies are exactly the posted blocks');
  bad(st.stats.heldCopyBytes < d.stats.heldCopyBytes / 5, 'stable: at most 4 of 40 blocks copied while stalled');
  const b = await scenario('stable + maxInflightBytes 1.5 blocks', { maxInflightBytes: Math.floor(one * 1.5) }, { stable: true });
  bad(b.posted === 1, 'budget: one block in flight (got ' + b.posted + ')'); bad(b.after.peakInflightBytes <= Math.floor(one * 1.5) + one * 0.2, 'budget: posted bytes under the limit');
  const ov = await scenario('maxInflightBytes below one block', { maxInflightBytes: 100 }, { stable: true });
  bad(ov.posted === 1, 'oversize: a block larger than the limit runs alone');
  {
    const pool = await J.pool({ workers: 2, maxInflightBytes: one * 2 }); stall();
    const ps = []; for (let k = 0; k < 6; k++) ps.push(pool.unpack(Uint8Array.from(file), { stable: true }));
    await tick(); const x = pool.stats();
    bad(x.heldCopyBytes <= one * 2.2 && x.queuedCopyBytes === 0, 'bursty: held copies bounded across calls');
    out.rows.push('bursty, 6 calls: held copies ' + x.heldCopyBytes + ' bytes while stalled');
    release(); for (const p of ps) bad(same(await p), 'bursty: rows');
    const y = pool.stats(); bad(y.queuedJobs === 0 && y.inflightJobs === 0 && y.inflightBytes === 0 && y.heldCopyBytes === 0, 'bursty: everything released'); pool.close();
  }
  for (const stable of [false, true]) {
    const pool = await J.pool({ workers: 2 }), ac = new AbortController(); stall();
    const p = pool.unpack(Uint8Array.from(file), { signal: ac.signal, stable }); await tick();
    const mid = pool.stats(); ac.abort();
    let err = null; try { await p; } catch (e) { err = e; }
    const tag = 'cancel ' + (stable ? 'stable' : 'default') + ': ';
    bad(err && err.name === 'AbortError', tag + 'rejects with AbortError');
    const aa = pool.stats(); bad(aa.queuedJobs === 0 && aa.queuedCopyBytes === 0, tag + 'queued jobs and copies dropped at once'); bad(aa.inflightJobs === mid.inflightJobs, tag + 'posted jobs counted until answered');
    release(); for (let k = 0; k < 100 && pool.stats().inflightJobs; k++) await new Promise((r) => setTimeout(r, 20));
    const z = pool.stats(); bad(z.inflightJobs === 0 && z.inflightBytes === 0 && z.heldCopyBytes === 0, tag + 'posted jobs released when answered');
    bad(same(await pool.unpack(Uint8Array.from(file), { stable })), tag + 'recovery read correct');
    const pre = new AbortController(); pre.abort(); let e2 = null; try { await pool.unpack(file, { signal: pre.signal }); } catch (e) { e2 = e; }
    bad(e2 && e2.name === 'AbortError', tag + 'already-aborted signal rejects at once');
    out.rows.push(tag + 'dropped ' + z.cancelledJobs + ' queued jobs, ' + mid.inflightJobs + ' posted released');
    pool.close();
  }
  Worker.prototype.postMessage = real;
  return out;
}
T.main(async (b) => {
  const srv = await T.serve({ '/page.html': '<!doctype html><meta charset=utf-8><title>t</title><script>' + src + '</script>' });
  const p = await b.newPage(); await p.goto(srv.base + '/page.html'); let r; try { r = await p.evaluate('(' + pageWork.toString() + ')()'); } finally { await p.close().catch(() => {}); srv.close(); }
  r.rows.forEach((l) => console.log(l));
  if (r.bad.length) { console.log('FAIL ' + r.bad.join('; ')); return false; }
  console.log('pool byte limits, backpressure and cancel: ok'); return true;
});
