// Copyright (c) 2026 LFC Foundry. MIT License. Research runner behind the pcodec-js 1.1.0 numbers; it needs the test browsers installed (see the repository QA notes).
'use strict';
const http = require('http'), fs = require('fs'); const drv0 = require('/home/claude/net-flow-map/bench/driver.js');
const drv = { open: async (w, o) => { for (let i = 0; ; i++) { try { return await drv0.open(w, o); } catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 4000)); } } } };
const which = process.argv[2], W = fs.readFileSync('/tmp/claude-0/pcm/t3/wasm/read-speed.opt.wasm'), B64 = W.toString('base64');
const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><title>x</title>x'); });
async function f(arg) {
  const T = (fn) => { const t = performance.now(); const v = fn(); return [performance.now() - t, v]; };
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return +a[a.length >> 1].toFixed(2); };
  const dec1 = (s) => { s = atob(s); const n = s.length, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = s.charCodeAt(i); return u; };
  const hasFrom = typeof Uint8Array.fromBase64 === 'function';
  const out = { hasFromBase64: hasFrom, loopDecodeMs: [], nativeDecodeMs: [], compileMs: [], instMs: [], firstCallMs: [] };
  for (let k = 0; k < 7; k++) {
    out.loopDecodeMs.push(T(() => dec1(arg.b64))[0]);
    if (hasFrom) out.nativeDecodeMs.push(T(() => Uint8Array.fromBase64(arg.b64))[0]);
  }
  const bytes = dec1(arg.b64);
  // compile times only mean something the first time in a page (the engine remembers); one fresh compile per page, so report that one
  const t0 = performance.now(); const m = await WebAssembly.compile(bytes); out.compileMs.push(performance.now() - t0);
  const t1 = performance.now(); const ins = new WebAssembly.Instance(m, {}); out.instMs.push(performance.now() - t1);
  const x = ins.exports; const n = 100000; const t2 = performance.now(); const p = x.alloc(16); x.release(p, 16); out.firstCallMs.push(performance.now() - t2);
  for (const k of ['loopDecodeMs', 'nativeDecodeMs', 'compileMs', 'instMs', 'firstCallMs']) out[k] = out[k].length ? med(out[k]) : null;
  return out;
}
(async () => { await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port; const res = []; for (let i = 0; i < 3; i++) { const D = await drv.open(which, { timeout: 300000 }); await D.goto(base + '/a.html'); res.push(await D.page.evaluate(f, { b64: B64 })); if (i === 2) console.log(which, D.version); await D.close(); } console.log(JSON.stringify(res)); srv.close(); process.exit(0); })().catch((e) => { console.error('ERR', e.message); process.exit(1); });
