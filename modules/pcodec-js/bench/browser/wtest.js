// usage: node wtest.js chromium|firefox|webkit|epiphany out.json   (one browser; all pages from a tiny local server)
'use strict';
const http = require('http'), fs = require('fs'), LIB = process.env.LIBDIR || '/tmp/claude-0/pcm/t3';
const drv0 = require('/home/claude/net-flow-map/bench/driver.js'); const drv = { open: async (w, o) => { for (let i = 0; ; i++) { try { return await drv0.open(w, o); } catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 4000)); } } } };
const which = process.argv[2], out = { which, cache: [], limits: {} };
const page = (title) => '<!doctype html><meta charset=utf-8><title>' + title + '</title><script src="/lib.js"></script><body>x';
const srv = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u === '/lib.js') { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(fs.readFileSync(LIB + '/pcodec-js-pack.js')); }
  const h = { 'content-type': 'text/html' };
  if (u === '/csp-none.html') h['content-security-policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'";
  if (u === '/csp-blob.html') h['content-security-policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src blob:";
  r.writeHead(200, h); r.end(page(u));
});
const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
// ---- in-page functions (serialised by the driver) ----
async function blocking(arg) {
  const P = PcodecJS, N = arg.n, tick = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
  let run = true, last = performance.now(), max = 0;
  (async () => { while (run) { await tick(); const t = performance.now(); max = Math.max(max, t - last); last = t; } })();
  const measure = async (f) => { await tick(); await tick(); max = 0; last = performance.now(); const t0 = performance.now(); const v = await f(); const total = performance.now() - t0; await tick(); return { total, gap: max, v }; };
  const same = (x, y) => { if (x.length !== y.length) return false; for (let i = 0; i < x.length; i += 997) if (x[i] !== y[i]) return false; return x[x.length - 1] === y[y.length - 1]; };
  const pc = await P.load(); const a = new Float64Array(N); for (let i = 0; i < N; i++) a[i] = Math.round((i % 1000 * 3.7 + Math.sin(i / 50) * 100) * 100) / 100;
  const b = pc.pack(a);
  const w = await P.worker(); const res = { n: N, inWorker: w.inWorker, packedBytes: b.length };
  const R = { syncUnpack: [], asyncUnpack: [], workerUnpack: [], workerUnpackT: [], syncPack: [], workerPack: [], workerPackT: [] }, ok = { u: true, p: true };
  for (let k = 0; k < 8; k++) {
    const s1 = await measure(async () => pc.unpack(b)); const s2 = await measure(() => pc.unpackAsync(b)); const s3 = await measure(() => w.unpack(b));
    const bc = b.slice(); const s4 = await measure(() => w.unpack(bc, { transfer: true })); const p1 = await measure(async () => pc.pack(a)); const p2 = await measure(() => w.pack(a)); const ac = a.slice(); const p3 = await measure(() => w.pack(ac, { transfer: true }));
    if (!(same(s1.v, a) && same(s2.v, a) && same(s3.v, a))) ok.u = false; if (p1.v.length !== p2.v.length) ok.p = false;
    if (k > 0) { R.syncUnpack.push(s1); R.asyncUnpack.push(s2); R.workerUnpack.push(s3); R.workerUnpackT.push(s4); R.syncPack.push(p1); R.workerPack.push(p2); R.workerPackT.push(p3); }   // first round is warm-up
  }
  run = false; w.terminate();
  const m = (arr, f) => { const v = arr.map(f).sort((x, y) => x - y); return +v[v.length >> 1].toFixed(1); };
  for (const k in R) res[k] = { totalMs: m(R[k], (x) => x.total), longestBlockMs: m(R[k], (x) => x.gap) };
  res.correct = ok; return res;
}
async function csp() { const w = await PcodecJS.worker(); const a = new Int32Array(5000).map((_, i) => i * 3 % 77); const pc = await PcodecJS.load(); const b = pc.pack(a); const u = await w.unpack(b); w.terminate(); return { inWorker: w.inWorker, ok: u.length === 5000 && u[100] === a[100] }; }
async function cacheLoad(arg) { const t0 = performance.now(); const pc = await PcodecJS.load({ cache: arg.cache }); const t = performance.now() - t0; await new Promise((r) => setTimeout(r, 400)); return { ms: +t.toFixed(2), first: pc.cacheState, after: pc.cacheState, version: navigator.userAgent }; }
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const t00 = Date.now();
  let D = await drv.open(which, { timeout: 600000 }); out.version = D.version;
  await D.goto(base + '/csp-blob.html'); out.limits.blocking = await D.page.evaluate(blocking, { n: +process.env.N || 2000000 });
  console.log(which, D.version, 'blocking', JSON.stringify(out.limits.blocking)); fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
  await D.goto(base + '/csp-blob.html'); out.limits.cspBlob = await D.page.evaluate(csp);
  await D.goto(base + '/csp-none.html'); out.limits.cspNone = await D.page.evaluate(csp);
  console.log(which, 'worker with worker-src blob:', JSON.stringify(out.limits.cspBlob), '| worker blocked by policy:', JSON.stringify(out.limits.cspNone));
  await D.close();
  fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1)); srv.close(); process.exit(0);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
