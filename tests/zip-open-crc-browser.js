#!/usr/bin/env node
// zip-open crc32, plain JavaScript against WebAssembly (1.2.0), in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Part 1 (equality): crc32 (WebAssembly from 1,024 bytes up) against a plain byte-by-byte CRC-32 and against crc32(bytes, true) (the plain slicing loop) for every length and start position in a grid and for 1 MB chunk edges.
// Part 2 (speed): the same jobs through the old byte loop (zip-open 1.0.0), the slicing loop (1.1.0) and the WebAssembly loop, taking turns in rotating order (ms per job, smaller is better), and a first checksum of 1 MB on a fresh page.
// Part 3: a page whose policy lacks 'wasm-unsafe-eval' must give the same answers on the plain loop.
// Run: node tests/zip-open-crc-browser.js <chromium|firefox|webkit|epiphany> [out.json]  (no browser named: every browser the environment offers, one at a time)     Env: REPS (default 7), CHROMIUM=/path, FIREFOX=/path (puppeteer-core on NODE_PATH for those two), MODULE=/path/to/another/zip-open.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const which = process.argv[2], outFile = process.argv[3], root = path.resolve(__dirname, '..') + '/';
if (!which) {   // no browser named (tests/kits.js): run every browser the environment offers, one after the other, each in its own process
  const kinds = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], [process.env.WEBKIT === 'epiphany' ? 'epiphany' : 'webkit', process.env.WEBKIT]].filter((x) => x[1]);
  if (!kinds.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1 (WebKitGTK) / WEBKIT=epiphany (GNOME Web)'); process.exit(2); }
  let bad = 0; for (const [k] of kinds) bad += require('child_process').spawnSync(process.execPath, [__filename, k], { stdio: 'inherit' }).status ? 1 : 0;
  process.exit(bad ? 1 : 0);
}
if (!['chromium', 'firefox', 'webkit', 'epiphany'].includes(which)) { console.log('usage: node tests/zip-open-crc-browser.js <chromium|firefox|webkit|epiphany> [out.json]'); process.exit(2); }
const REPS = +(process.env.REPS || 7), SRC = fs.readFileSync(process.env.MODULE || root + 'modules/zip-open/zip-open.js', 'utf8');
const CSP_WASM = "default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'", CSP_NOWASM = "default-src 'none'; script-src 'self' 'unsafe-inline'";
const CODE = `
function table() { var T = new Int32Array(256), i, k, c; for (i = 0; i < 256; i++) { c = i; for (k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; T[i] = c; } return T; }
function mode(m) {
  var Z = window.ZipOpen, T = table(), sd = 7, i;
  var rnd = function () { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd >>> 24; };
  var byteLoop = function (u8) { var r = -1; for (var q = 0, L = u8.length; q < L; q++) r = (r >>> 8) ^ T[(r ^ u8[q]) & 255]; return (r ^ -1) >>> 0; };
  var slicing = function (u8) { return Z.crc32(u8, true); }, wasm = function (u8) { return Z.crc32(u8); };
  if (m === 'eq') {
    var buf = new Uint8Array(4300), bad = 0, tried = 0, off, len, v, ref; for (i = 0; i < buf.length; i++) buf[i] = rnd() ^ (i >> 4);
    for (off = 0; off < 9; off++) for (len = 0; len < 90; len++) { v = buf.subarray(off, off + len); tried++; if (wasm(v) !== byteLoop(v)) bad++; }
    for (off = 0; off < 9; off++) for (len = 1000; len < 1100; len++) { v = buf.subarray(off, off + len); tried++; ref = byteLoop(v); if (wasm(v) !== ref || slicing(v) !== ref) bad++; }
    for (len = 0; len < 4290; len += 31) { v = buf.subarray(2, 2 + len); tried++; if (wasm(v) !== byteLoop(v)) bad++; }
    var mb = new Uint8Array((3 << 20) + 7); for (i = 0; i < mb.length; i += 3) { mb[i] = rnd(); mb[i + 1] = i >> 9; mb[i + 2] = 1; }
    [1 << 20, (1 << 20) - 1, (1 << 20) + 1, 2 << 20, mb.length].forEach(function (L) { [0, 5].forEach(function (o) { v = mb.subarray(o, L); tried++; ref = byteLoop(v); if (wasm(v) !== ref || slicing(v) !== ref) bad++; }); });
    tried++; if (wasm(new Uint8Array([49, 50, 51, 52, 53, 54, 55, 56, 57])) !== 0xcbf43926) bad++;
    return { tried: tried, differing: bad, available: Z.wasmAvailable() };
  }
  if (m === 'speed') {
    var big = new Uint8Array(20 << 20); for (i = 0; i < big.length; i += 4) { big[i] = rnd(); big[i + 1] = i >> 9; big[i + 2] = rnd(); big[i + 3] = 1; }
    var pieces = function (size, count) { return function (f) { var s = 0; for (var q = 0; q < count; q++) s ^= f(big.subarray(q * size, (q + 1) * size)); return s; }; };
    var jobs = { 'one 20 MB buffer': function (f) { return f(big); }, '320 pieces of 64 KB': pieces(65536, 320), '5,000 pieces of 4 KB': pieces(4096, 5000), '50,000 pieces of 256 bytes': pieces(256, 50000) };
    var fns = { byteLoop: byteLoop, slicing: slicing, wasm: wasm }, names = ['byteLoop', 'slicing', 'wasm'], res = {};
    var med = function (a) { a = a.slice().sort(function (x, y) { return x - y; }); return a[a.length >> 1]; };
    Object.keys(jobs).forEach(function (k) {
      var t = { byteLoop: [], slicing: [], wasm: [] }, ref = jobs[k](slicing), rep, j, n, tt, r;
      for (rep = 0; rep < 8; rep++) for (j = 0; j < 3; j++) { n = names[(j + rep) % 3]; tt = performance.now(); r = jobs[k](fns[n]); tt = performance.now() - tt; if (r !== ref) throw new Error('differs: ' + n + ' ' + k); if (rep > 0) t[n].push(tt); }
      res[k] = { byteLoop: +med(t.byteLoop).toFixed(2), slicing: +med(t.slicing).toFixed(2), wasm: +med(t.wasm).toFixed(2) };
    });
    return { speed: res, available: Z.wasmAvailable() };
  }
  if (m === 'cold-js' || m === 'cold-wasm') {
    var one = new Uint8Array(1 << 20); for (i = 0; i < one.length; i++) { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; one[i] = sd >>> 24; }
    var t0 = performance.now(), r0 = m === 'cold-js' ? Z.crc32(one, true) : Z.crc32(one); return { first: performance.now() - t0, r: r0 };
  }
  return { error: 'unknown mode ' + m };
}`;
const server = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'); r.setHeader('cache-control', 'no-store');
  if (u.pathname === '/zip-open.js') { r.setHeader('content-type', 'text/javascript'); return r.end(SRC); }
  if (u.pathname !== '/page.html') { r.writeHead(404); return r.end(); }
  const m = u.searchParams.get('m'), blocked = u.searchParams.get('csp') === 'nowasm';
  r.setHeader('content-type', 'text/html');
  r.end('<!doctype html><meta charset=utf-8><meta http-equiv="Content-Security-Policy" content="' + (blocked ? CSP_NOWASM : CSP_WASM) + '"><title>t</title><link rel="icon" href="data:,"><script src="/zip-open.js"></script><script>' + CODE + '\ntry{window.__res=mode(' + JSON.stringify(m) + ')}catch(e){window.__res={error:String(e&&e.stack||e)}}</script>');
});
const webkitFamily = which === 'webkit' || which === 'epiphany', med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok)); const base = 'http://127.0.0.1:' + server.address().port, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let b;
  if (webkitFamily) { const wd = require(root + 'tests/webkit-shim.js'); b = await wd.launch(which === 'epiphany' ? 'epiphany' : 'webkitgtk'); }
  else { const pup = require('puppeteer-core');
    b = which === 'firefox' ? await pup.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 600000 })
      : await pup.launch({ executablePath: process.env.CHROMIUM, headless: true, protocolTimeout: 600000, args: ['--no-sandbox', '--disable-gpu'] }); }
  const version = await b.version(); console.log(version);
  async function run(m, csp) {
    const p = await b.newPage(); await p.goto(base + '/page.html?m=' + m + (csp ? '&csp=' + csp : ''));
    let res = null; for (let i = 0; i < 1200 && !res; i++) { res = await p.evaluate(() => window.__res || null); if (!res) await sleep(100); }
    if (!webkitFamily) await p.close();
    return res || { error: 'no result in 120 s' };
  }
  const t0 = Date.now(), eq = await run('eq', ''), eqBlocked = await run('eq', 'nowasm'), sp = await run('speed', '');
  const cold = { js: [], wasm: [] };
  for (let rep = 0; rep < REPS; rep++) for (const v of rep % 2 ? ['wasm', 'js'] : ['js', 'wasm']) { const r = await run('cold-' + v, ''); if (!r.error) cold[v].push(r.first); }
  const out = { version, reps: REPS, eq, eqBlocked, speed: sp.speed, cold: { jsMs: cold.js.length ? med(cold.js) : null, wasmMs: cold.wasm.length ? med(cold.wasm) : null }, wallSeconds: (Date.now() - t0) / 1000 };
  let pass = !eq.error && !eqBlocked.error && !sp.error && eq.differing === 0 && eqBlocked.differing === 0 && eq.available === true;
  console.log('part 1, same checksums, WebAssembly allowed: ' + (eq.error ? 'ERROR ' + eq.error : eq.tried + ' checksums, ' + eq.differing + ' differ, wasm available=' + eq.available));
  console.log('part 3, policy without the wasm word: ' + (eqBlocked.error ? 'ERROR ' + eqBlocked.error : eqBlocked.tried + ' checksums, ' + eqBlocked.differing + ' differ, wasm available=' + eqBlocked.available));
  if (!webkitFamily && !eqBlocked.error) pass = pass && eqBlocked.available === false;
  if (sp.speed) {
    console.log('part 2, speed, ms per job, median of 7 rounds in rotating order (smaller is better); times faster = slicing loop / WebAssembly (bigger is better)');
    console.log('job'.padEnd(30) + 'byte loop'.padStart(11) + 'slicing JS'.padStart(12) + 'WebAssembly'.padStart(13) + 'times faster'.padStart(14));
    for (const [k, v] of Object.entries(sp.speed)) console.log(k.padEnd(30) + String(v.byteLoop).padStart(11) + String(v.slicing).padStart(12) + String(v.wasm).padStart(13) + ((v.slicing / v.wasm).toFixed(2) + 'x').padStart(14));
    console.log('first checksum of 1 MB on a fresh page (ms, median of ' + REPS + '; smaller is better): slicing JS ' + (out.cold.jsMs === null ? '?' : out.cold.jsMs.toFixed(1)) + ', WebAssembly (with its start-up) ' + (out.cold.wasmMs === null ? '?' : out.cold.wasmMs.toFixed(1)));
  }
  console.log(pass ? 'PASS' : 'FAIL');
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  await b.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch((e) => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
