// Copyright (c) 2026 LFC Foundry. MIT License. Research runner behind the pcodec-js 1.2.0 numbers; it needs the test browsers installed (see the repository QA notes).
// node poolbench.js chromium|firefox|webkit|epiphany out.json
// Packs and unpacks the 12 columns with 1, 2 and 4 background workers (columns shared out largest-first), wall time on the page, median of ROUNDS rounds.
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
const arg = { cols: cols.map((m) => ({ name: m.name, kind: m.kind, n: m.n, b64: bin.subarray(m.off, m.off + m.bytes).toString('base64') })), rounds: +process.env.ROUNDS || 9, rep: +process.env.REP || 1, sizes: (process.env.SIZES || '1,2,4').split(',').map(Number) };
async function inPage(arg) {
  const T = { f64: Float64Array, i32: Int32Array, f32: Float32Array, u32: Uint32Array, i16: Int16Array, u16: Uint16Array };
  const data0 = arg.cols.map((c) => { const s = atob(c.b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new T[c.kind](u.buffer); });
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return +a[a.length >> 1].toFixed(1); };
  const tick = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
  let run = true, last = performance.now(), maxGap = 0;
  (async () => { while (run) { await tick(); const t = performance.now(); maxGap = Math.max(maxGap, t - last); last = t; } })();
  const measure = async (f) => { await tick(); await tick(); maxGap = 0; last = performance.now(); const t0 = performance.now(); const v = await f(); const total = performance.now() - t0; await tick(); return { total, gap: maxGap, v }; };
  const same = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
  const big = new Float64Array(2000000); for (let i = 0; i < big.length; i++) big[i] = Math.round((i % 1000 * 3.7 + Math.sin(i / 50) * 100) * 100) / 100;
  const many = []; for (let k = 0; k < 8; k++) data0.forEach((a) => many.push(a));
  const pc = await PcodecJS.load();
  const refBig = pc.pack(big), refList = data0.map((a) => pc.pack(a)), refMany = many.map((a, i) => refList[i % 12]);
  const res = { rounds: arg.rounds, ok: true, single: {}, list12: {}, unpack96: {}, unpack12: {}, startup: {} };
  const one = await PcodecJS.worker();
  const cfgs = [['1 worker', null], ['pool 2', { size: 2 }], ['pool 4', { size: 4 }]], PS = {}, RS = {};
  for (const [name, o] of cfgs) {   // start every setup once, timing its first job (which starts the workers it needs)
    const P = o ? await PcodecJS.pool(o) : one; PS[name] = P;
    const first = o ? await measure(() => P.pack(data0)) : await measure(() => Promise.all(data0.map((a) => one.pack(a))));
    res.startup[name] = +(first.total).toFixed(1); RS[name] = { s: [], sg: [], l: [], lg: [], u96: [], u12: [] };
    if (o) { await P.unpack(refList); await P.unpack(refMany); }   // warm the unpack lanes too
  }
  for (let r = 0; r < arg.rounds + 1; r++) {
    const k = r % cfgs.length, order = cfgs.slice(k).concat(cfgs.slice(0, k));   // every setup takes every place in the order
    for (const [name, o] of order) {
      const P = PS[name];
      const a = await measure(() => (o ? P.pack(big) : one.pack(big)));
      const b = await measure(() => (o ? P.pack(data0) : Promise.all(data0.map((x) => one.pack(x)))));
      const c = await measure(() => (o ? P.unpack(refMany) : Promise.all(refMany.map((x) => one.unpack(x)))));
      const d = await measure(() => (o ? P.unpack(refList) : Promise.all(refList.map((x) => one.unpack(x)))));
      if (r === 0) { if (!same(a.v, refBig)) res.ok = false; if (!b.v.every((v, i) => same(v, refList[i]))) res.ok = false; if (!c.v.every((v, i) => v.length === many[i].length && v[v.length - 1] === many[i][many[i].length - 1])) res.ok = false; if (!d.v.every((v, i) => v.length === data0[i].length)) res.ok = false; }
      else { const q = RS[name]; q.s.push(a.total); q.sg.push(a.gap); q.l.push(b.total); q.lg.push(b.gap); q.u96.push(c.total); q.u12.push(d.total); }
    }
  }
  for (const [name, o] of cfgs) { const q = RS[name]; res.single[name] = { ms: med(q.s), longestFreezeMs: med(q.sg) }; res.list12[name] = { ms: med(q.l), longestFreezeMs: med(q.lg) }; res.unpack96[name] = med(q.u96); res.unpack12[name] = med(q.u12); if (o) PS[name].terminate(); }
  one.terminate(); run = false; res.inWorker = one.inWorker; return res;
}
(async () => {
  const srv = http.createServer((q, r) => { if (q.url === '/lib.js') { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(LIB); } r.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src blob:" }); r.end('<!doctype html><meta charset=utf-8><script src="/lib.js"></script><body>x'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const which = process.argv[2], D = await open(which, { timeout: 1800000 }); await D.goto('http://127.0.0.1:' + srv.address().port + '/');
  const t0 = Date.now(); const out = await D.page.evaluate(inPage, arg); const version = D.version; await D.close();
  fs.writeFileSync(process.argv[3], JSON.stringify({ version, wallSeconds: (Date.now() - t0) / 1000, out }, null, 1));
  console.log(which, version, 'wall s', ((Date.now() - t0) / 1000).toFixed(1), JSON.stringify({ single: out.single, list12: out.list12, unpack96: out.unpack96, unpack12: out.unpack12, startup: out.startup, ok: out.ok, inWorker: out.inWorker }));
  process.exit(0);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
