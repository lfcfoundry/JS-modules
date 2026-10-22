// Copyright (c) 2026 LFC Foundry. MIT License. Research runner behind the pcodec-js 1.5.1 numbers; it needs the test browsers installed.
'use strict';
const fs = require('fs'), http = require('http'), W = '/tmp/claude-0/pcm/work/';
process.env.NFM_PUPPETEER = '/tmp/esb/node_modules/puppeteer-core'; process.env.NFM_PLAYWRIGHT = '/tmp/esb/node_modules/playwright-core';
process.env.NFM_FIREFOX = '/home/claude/browsers/firefox/firefox'; process.env.NFM_CHROME = '/home/claude/browsers/ungoogled-chromium-155.0.8059.39-1-x86_64_linux/chrome';
const drv0 = require('/home/claude/net-flow-map/bench/driver.js'); const LIB = fs.readFileSync(process.env.LIB, 'utf8');
const man = JSON.parse(fs.readFileSync(W + 'cols.json')), bin = fs.readFileSync(W + 'cols.bin');
const PICK = [/NFM node x, Distances/, /links.to/, /links.weight/, /links.x1/, /events.ts/, /^temperature/, /^price/, /geojson/, /kWh/, /housing median_income/, /quakes Latitude/, /events.user/];
const cols = PICK.map((r) => man.find((m) => r.test(m.name)));
const arg = cols.map((m) => ({ name: m.name, kind: m.kind, n: m.n, b64: bin.subarray(m.off, m.off + m.bytes).toString('base64') }));
async function inPage(cols) {
  const T = { f64: Float64Array, i32: Int32Array, f32: Float32Array, u32: Uint32Array, i16: Int16Array, u16: Uint16Array };
  const pc = await PcodecJS.load(), res = [];
  for (const c of cols) { const s = atob(c.b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); const a = new T[c.kind](u.buffer); const f = pc.pack(a); const t = []; for (let r = 0; r < 41; r++) { const t0 = performance.now(); pc.unpack(f, { view: true }); t.push(performance.now() - t0); } t.sort((x, y) => x - y); res.push([c.name, c.kind, c.n, +(t[20] * 1e6 / c.n).toFixed(2), f.length]); }
  return res;
}
(async () => {
  const srv = http.createServer((q, r) => { if (q.url === '/lib.js') { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(LIB); } r.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'" }); r.end('<!doctype html><script src="/lib.js"></script>'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const D = await drv0.open(process.argv[2], { timeout: 300000 }); await D.goto('http://127.0.0.1:' + srv.address().port + '/');
  const out = await D.page.evaluate(inPage, arg); console.log(D.version); out.forEach((r) => console.log(r.join('\t'))); await D.close(); process.exit(0);
})();
