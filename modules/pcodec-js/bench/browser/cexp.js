'use strict';
const http = require('http'), fs = require('fs'); const drv0 = require('/home/claude/net-flow-map/bench/driver.js');
const drv = { open: async (w, o) => { for (let i = 0; ; i++) { try { return await drv0.open(w, o); } catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 4000)); } } } };
const which = process.argv[2], WASM = fs.readFileSync('/tmp/claude-0/pcm/t3/wasm/read-speed.opt.wasm');
const srv = http.createServer((q, r) => { if (q.url === '/m.wasm') { r.writeHead(200, { 'content-type': 'application/wasm' }); return r.end(WASM); } r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><title>x</title>x'); });
async function step(arg) {
  const out = {}; try {
    const c = await caches.open('pcm'); let r = await c.match('/m.wasm'); out.had = !!r;
    if (!r) { const b = await (await fetch('/m.wasm')).arrayBuffer(); const t0 = performance.now(); await WebAssembly.compile(b); out.coldCompileMs = +(performance.now() - t0).toFixed(2); await c.put('/m.wasm', new Response(b, { headers: { 'content-type': 'application/wasm' } })); }
    else { const t0 = performance.now(); await WebAssembly.compileStreaming(r); out.streamMs = +(performance.now() - t0).toFixed(2); }
  } catch (e) { out.err = String(e && e.message || e); } return out;
}
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const D = await drv.open(which, { timeout: 300000 }); const res = [];
  for (let i = 0; i < 6; i++) { await D.goto(base + '/p' + i + '.html'); res.push(await D.page.evaluate(step)); }
  console.log(which, D.version, JSON.stringify(res)); await D.close(); srv.close(); process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
