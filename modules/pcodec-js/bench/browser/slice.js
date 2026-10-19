'use strict';
const http = require('http'), fs = require('fs'); const drv0 = require('/home/claude/net-flow-map/bench/driver.js');
const drv = { open: async (w, o) => { for (let i = 0; ; i++) { try { return await drv0.open(w, o); } catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 4000)); } } } };
const which = process.argv[2];
const srv = http.createServer((q, r) => { if (q.url === '/lib.js') { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(fs.readFileSync('/tmp/claude-0/pcm/t3/pcodec-js-pack.js')); } r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><script src="/lib.js"></script>x'); });
async function f(arg) {
  const tick = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
  let run = true, last = performance.now(), max = 0; (async () => { while (run) { await tick(); const t = performance.now(); max = Math.max(max, t - last); last = t; } })();
  const pc = await PcodecJS.load(), N = 2000000, a = new Float64Array(N); for (let i = 0; i < N; i++) a[i] = Math.round((i % 1000 * 3.7 + Math.sin(i / 50) * 100) * 100) / 100;
  const b = pc.pack(a), res = {};
  for (const s of arg.slices) { const T = [], G = []; for (let k = 0; k < 8; k++) { await tick(); await tick(); max = 0; last = performance.now(); const t0 = performance.now(); await pc.unpackAsync(b, { sliceMs: s }); T.push(performance.now() - t0); await tick(); G.push(max); } const m = (x) => { x = x.slice(1).sort((p, q) => p - q); return +x[x.length >> 1].toFixed(1); }; res[s] = { totalMs: m(T), longestBlockMs: m(G), worstBlockMs: +Math.max.apply(null, G.slice(1)).toFixed(1) }; }
  run = false; return res;
}
(async () => { await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port; const D = await drv.open(which, { timeout: 300000 }); await D.goto(base + '/a.html'); const r = await D.page.evaluate(f, { slices: [1, 2, 3, 4, 6] }); console.log(which, D.version, JSON.stringify(r)); await D.close(); srv.close(); process.exit(0); })().catch((e) => { console.error('ERR', e.message); process.exit(1); });
