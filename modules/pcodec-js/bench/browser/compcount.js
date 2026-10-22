// Counts WebAssembly compiles on the page while the library loads, a worker starts and a pool of 4 opens a split file. Workers get the compiled program, whose text is a stub ('AAAA'), so they cannot compile.
'use strict';
const fs = require('fs'), http = require('http');
process.env.NFM_PUPPETEER = '/tmp/esb/node_modules/puppeteer-core'; process.env.NFM_PLAYWRIGHT = '/tmp/esb/node_modules/playwright-core';
process.env.NFM_FIREFOX = '/home/claude/browsers/firefox/firefox'; process.env.NFM_CHROME = '/home/claude/browsers/ungoogled-chromium-155.0.8059.39-1-x86_64_linux/chrome';
const drv0 = require('/home/claude/net-flow-map/bench/driver.js'); const LIB = fs.readFileSync(process.env.LIB, 'utf8');
const PRE = `window.__c = { compile: 0, module: 0, instantiate: 0, stream: 0 }; (function () { var W = WebAssembly, oc = W.compile, oi = W.instantiate; W.compile = function () { __c.compile++; return oc.apply(W, arguments); }; W.instantiate = function (x) { __c[x instanceof W.Module ? 'instantiate' : 'compile']++; return oi.apply(W, arguments); }; if (W.compileStreaming) { var os = W.compileStreaming; W.compileStreaming = function () { __c.stream++; return os.apply(W, arguments); }; } var OM = W.Module; W.Module = function (b) { __c.module++; return new OM(b); }; W.Module.prototype = OM.prototype; W.Module.imports = OM.imports; W.Module.exports = OM.exports; W.Module.customSections = OM.customSections; })();`;
async function inPage() {
  const snap = () => JSON.stringify(window.__c);
  const res = { afterScript: snap() };
  const pc = await PcodecJS.load(); res.afterLoad = snap();
  const a = new Float64Array(3000000); for (let i = 0; i < a.length; i++) a[i] = Math.round(Math.sin(i / 50) * 1e4) / 100;
  const split = pc.pack(a, { parts: 8 }); res.afterPack = snap();
  const t0 = performance.now(); const w = await PcodecJS.worker(); res.workerStartMs = +(performance.now() - t0).toFixed(1); res.afterWorker = snap();
  const t1 = performance.now(); const P = await PcodecJS.pool({ size: 4, laneMs: 0 }); await P.unpack(split); res.poolFirstUnpackMs = +(performance.now() - t1).toFixed(1); res.afterPool = snap();
  const t2 = performance.now(); const P2 = await PcodecJS.pool({ size: 4, laneMs: 0 }); await P2.unpack(split); res.secondPoolMs = +(performance.now() - t2).toFixed(1); res.afterPool2 = snap();
  w.terminate(); P.terminate(); P2.terminate(); return res;
}
(async () => {
  const srv = http.createServer((q, r) => { if (q.url === '/lib.js') { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(LIB); } if (q.url === '/pre.js') { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(PRE); } r.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src blob:" }); r.end('<!doctype html><meta charset=utf-8><script src="/pre.js"></script><script src="/lib.js"></script><body>x'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const D = await drv0.open(process.argv[2], { timeout: 300000 }); await D.goto('http://127.0.0.1:' + srv.address().port + '/');
  const out = await D.page.evaluate(inPage); console.log(D.version); for (const k in out) console.log('  ', k, out[k]); await D.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
