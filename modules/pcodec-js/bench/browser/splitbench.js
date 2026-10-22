// LIB=path/to/pcodec-js-pack.js ROUNDS=9 [ONLY=8M] node splitbench.js chromium|firefox|webkit|epiphany out.json
// Split files (1.4.0): unpacks a 0.5M, 2M and 8M-number column as a normal file on one worker, as a split file on a default pool of 4 (joined) and as parts only; packs on a pool of 4 as a normal and a split file.
// Wall time on the page and the longest gap between page turns, median of ROUNDS rounds, configurations taking turns. Pools are created fresh for each size.
'use strict';
const fs = require('fs'), http = require('http'), W = '/tmp/claude-0/pcm/work/';
process.env.NFM_PUPPETEER = process.env.NFM_PUPPETEER || '/tmp/esb/node_modules/puppeteer-core';
process.env.NFM_PLAYWRIGHT = process.env.NFM_PLAYWRIGHT || '/tmp/esb/node_modules/playwright-core';
process.env.NFM_FIREFOX = process.env.NFM_FIREFOX || '/home/claude/browsers/firefox/firefox';
process.env.NFM_CHROME = process.env.NFM_CHROME || '/home/claude/browsers/ungoogled-chromium-155.0.8059.39-1-x86_64_linux/chrome';
const drv0 = require('/home/claude/net-flow-map/bench/driver.js');
const open = async (w, o) => { for (let i = 0; ; i++) { try { return await drv0.open(w, o); } catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 4000)); } } };
const man = JSON.parse(fs.readFileSync(W + 'cols.json')), bin = fs.readFileSync(W + 'cols.bin');
const PICK = [/NFM node x, Distances/, /links.to/, /links.weight/, /links.x1/, /events.ts/, /^temperature/, /^price/, /geojson/, /kWh/, /housing median_income/, /quakes Latitude/, /events.user/];
const cols = PICK.map((r) => man.find((m) => r.test(m.name)));
const LIB = fs.readFileSync(process.env.LIB, 'utf8');
const arg = { cols: cols.map((m) => ({ name: m.name, kind: m.kind, n: m.n, b64: bin.subarray(m.off, m.off + m.bytes).toString('base64') })), rounds: +process.env.ROUNDS || 9, rep: +process.env.REP || 1, only: process.env.ONLY || '', sizes: (process.env.SIZES || '1,2,4').split(',').map(Number) };
async function inPage(arg) {
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return +a[a.length >> 1].toFixed(1); };
  const tick = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
  let run = true, last = performance.now(), maxGap = 0;
  (async () => { while (run) { await tick(); const t = performance.now(); maxGap = Math.max(maxGap, t - last); last = t; } })();
  const measure = async (f) => { await tick(); await tick(); maxGap = 0; last = performance.now(); const t0 = performance.now(); const v = await f(); const total = performance.now() - t0; await tick(); return { total, gap: maxGap, v }; };
  const mk = (n) => { const a = new Float64Array(n); for (let i = 0; i < n; i++) a[i] = Math.round((i % 1000 * 3.7 + Math.sin(i / 50) * 100) * 100) / 100; return a; };
  const sets = { '0.5M numbers': mk(500000), '2M numbers': mk(2000000), '8M numbers': mk(8000000) };
  const pc = await PcodecJS.load(), one = await PcodecJS.worker();
  const res = { ok: true, sizes: {}, unpack: {}, freeze: {}, pack: {}, packFreeze: {}, mainUnpack: {} };
  const cfgs = [['1 worker, normal file', null], ['split, pool of 4 (default)', 4, undefined], ['split, pool of 4, parts only (no join)', 4, undefined, { parts: true }]], PS = {};
  async function PCodecPool(sz, lm) { const o = { size: sz }; if (lm !== undefined) o.laneMs = lm; return await PcodecJS.pool(o); }
  for (const key in sets) {
    if (arg.only && key.indexOf(arg.only) < 0) continue;
    for (const [name, sz, lm] of cfgs) if (sz) { PS[name] = name.indexOf('parts only') >= 0 ? PS['split, pool of 4 (default)'] : await PCodecPool(sz, lm); }
    const a = sets[key], plain = pc.pack(a), split = pc.pack(a, { parts: 8 });
    res.sizes[key] = { normal: plain.length, split: split.length, extra: split.length - plain.length };
    // warm every lane once
    await one.unpack(plain); for (const n in PS) await PS[n].unpack(split);
    const R = {}; cfgs.forEach(([n]) => R[n] = { t: [], g: [] }); const M = { normal: [], split: [] }, PK = { '1 worker': { t: [], g: [] }, 'pool of 4, normal file': { t: [], g: [] }, 'pool of 4, split file': { t: [], g: [] } }; const P4 = await PcodecJS.pool({ size: 4 });
    for (let r = 0; r < arg.rounds + 1; r++) {
      const k = r % cfgs.length, order = cfgs.slice(k).concat(cfgs.slice(0, k));
      for (const [name, sz, lm, uo] of order) {
        const m = await measure(() => (sz ? PS[name].unpack(split, uo) : one.unpack(plain)));
        if (r === 0) { if (uo ? (m.v.length !== 8 || m.v[0][0] !== a[0]) : (m.v.length !== a.length || m.v[m.v.length - 1] !== a[a.length - 1] || m.v[12345] !== a[12345])) res.ok = false; } else { R[name].t.push(m.total); R[name].g.push(m.gap); }
      }
      const m1 = await measure(async () => pc.unpack(plain)), m2 = await measure(async () => pc.unpack(split));
      const q1 = await measure(() => one.pack(a)), q2 = await measure(() => P4.pack(a)), q3 = await measure(() => P4.pack(a, { parts: 8 }));
      if (r === 0) { if (q2.v.length !== plain.length || q3.v.length !== split.length) res.ok = false; if (m2.v.length !== a.length) res.ok = false; }
      else { M.normal.push(m1.total); M.split.push(m2.total); PK['1 worker'].t.push(q1.total); PK['1 worker'].g.push(q1.gap); PK['pool of 4, normal file'].t.push(q2.total); PK['pool of 4, normal file'].g.push(q2.gap); PK['pool of 4, split file'].t.push(q3.total); PK['pool of 4, split file'].g.push(q3.gap); }
    }
    res.unpack[key] = {}; res.freeze[key] = {}; cfgs.forEach(([n]) => { res.unpack[key][n] = med(R[n].t); res.freeze[key][n] = med(R[n].g); });
    { const seen = new Set(); for (const n in PS) if (!seen.has(PS[n])) { seen.add(PS[n]); PS[n].terminate(); } } res.mainUnpack[key] = { normal: med(M.normal), split: med(M.split) }; res.pack[key] = {}; res.packFreeze[key] = {}; for (const n in PK) { res.pack[key][n] = med(PK[n].t); res.packFreeze[key][n] = med(PK[n].g); } P4.terminate();
  }
  one.terminate(); run = false; return res;
}
(async () => {
  const srv = http.createServer((q, r) => { if (q.url === '/lib.js') { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(LIB); } r.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src blob:" }); r.end('<!doctype html><meta charset=utf-8><script src="/lib.js"></script><body>x'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const which = process.argv[2], D = await open(which, { timeout: 1800000 }); await D.goto('http://127.0.0.1:' + srv.address().port + '/');
  const t0 = Date.now(); const out = await D.page.evaluate(inPage, arg); const version = D.version; await D.close();
  fs.writeFileSync(process.argv[3], JSON.stringify({ version, wallSeconds: (Date.now() - t0) / 1000, out }, null, 1));
  console.log(which, version, 'wall s', ((Date.now() - t0) / 1000).toFixed(1), JSON.stringify(out));
  process.exit(0);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
