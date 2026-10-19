#!/usr/bin/env node
// gif-writer encoder, plain JavaScript against WebAssembly (1.2.0), in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Part 1 (equality): scenes through makePalette and createEncoder with WebAssembly (the default) and with { wasm: false }: every GIF must have the same bytes, for photographs, flat game pictures, noise, animations that change only a
// rectangle, repeated pictures and odd sizes. Part 2 (speed): 30 pictures of 640 x 480 (photo, flat game picture, a small moving block), encoding only, taking turns in rotating order (ms per job, smaller is better), and a first small GIF
// on a fresh page. Part 3: a page whose policy lacks 'wasm-unsafe-eval' must write the same bytes on the plain code.
// Run: node tests/gif-writer-wasm-browser.js <chromium|firefox|webkit|epiphany> [out.json]     Env: REPS (default 5), CHROMIUM=/path, FIREFOX=/path (puppeteer-core on NODE_PATH for those two), MODULE=/path/to/another/gif-writer.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const which = process.argv[2], outFile = process.argv[3], root = path.resolve(__dirname, '..') + '/';
if (!['chromium', 'firefox', 'webkit', 'epiphany'].includes(which)) { console.log('usage: node tests/gif-writer-wasm-browser.js <chromium|firefox|webkit|epiphany> [out.json]'); process.exit(2); }
const REPS = +(process.env.REPS || 5), SRC = fs.readFileSync(process.env.MODULE || root + 'modules/gif-writer/gif-writer.js', 'utf8');
const CSP_WASM = "default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'", CSP_NOWASM = "default-src 'none'; script-src 'self' 'unsafe-inline'";
const CODE = `
var seed = 12345; function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
function scene(kind, w, h, n) {
  var pics = [], f, i, a, x, y, r, g, b, q;
  for (f = 0; f < n; f++) {
    a = new Uint8ClampedArray(w * h * 4);
    for (i = 0; i < w * h; i++) {
      x = i % w; y = (i / w) | 0;
      if (kind === 'lattice') { r = ((rnd() * 16) | 0) * 17; g = ((rnd() * 16) | 0) * 17; b = ((rnd() * 16) | 0) * 17; }
      else if (kind === 'noise') { r = rnd() * 256; g = rnd() * 256; b = rnd() * 256; }
      else if (kind === 'smooth') { r = x * 255 / w + f * 3 + rnd() * 5; g = y * 255 / h + rnd() * 3; b = ((x ^ y) & 255) * 0.5 + rnd() * 6; }
      else if (kind === 'photo') { r = Math.sin(x / 37 + f / 5) * 127 + 128; g = Math.cos(y / 29 - f / 7) * 127 + 128; b = (((r | 0) + (g | 0)) >> 1) ^ ((rnd() * 8) | 0); }
      else if (kind === 'bands') { var bb = (((y + f * 9) / 24) | 0) % 9; r = bb * 28; g = 255 - bb * 25; b = (bb * 61) & 255; }
      else if (kind === 'anim') { var bx = (f * 7) % (w - 20), by = (f * 3) % (h - 20); var inside = x >= bx && x < bx + 20 && y >= by && y < by + 20; r = inside ? 220 : x * 100 / w; g = inside ? 40 + f : y * 100 / h; b = inside ? 30 : 90; }
      else { q = (rnd() * 7) | 0; r = q * 36; g = 255 - q * 31; b = q * 9; }
      a[i * 4] = r; a[i * 4 + 1] = g; a[i * 4 + 2] = b; a[i * 4 + 3] = 255;
    }
    pics.push(a);
  }
  return pics;
}
function encode(G, w, h, pal, pics, wasm) { var e = G.createEncoder(w, h, pal, wasm === false ? { wasm: false } : {}); pics.forEach(function (p, i) { e.add(p, 40 + i); }); return e.finish(); }
function sameBytes(a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
function mode(m) {
  var G = window.GifWriter, i;
  if (m === 'eq') {
    var cases = [['lattice', 90, 70, 3, 255], ['noise', 120, 90, 2, 255], ['smooth', 160, 120, 4, 255], ['smooth', 160, 120, 2, 40], ['few', 64, 48, 2, 255], ['lattice', 50, 40, 2, 3], ['anim', 120, 90, 12, 255], ['anim', 97, 53, 9, 255], ['photo', 200, 150, 3, 255], ['few', 1, 1, 3, 255], ['few', 3, 1, 2, 255], ['few', 1, 5, 2, 255], ['smooth', 33, 17, 3, 255], ['bands', 200, 150, 14, 255], ['bands', 64, 48, 5, 6]], bad = 0, tried = 0, k, c, pics, pal, A, B, names = [];
    for (k = 0; k < cases.length; k++) { c = cases[k]; pics = scene(c[0], c[1], c[2], c[3]); pal = G.makePalette(pics, c[4]); tried++; if (JSON.stringify(pal) !== JSON.stringify(G.makePalette(pics, c[4], { wasm: false }))) { bad++; names.push('palette ' + c[0] + ' ' + c[1] + 'x' + c[2]); } A = encode(G, c[1], c[2], pal, pics, false); B = encode(G, c[1], c[2], pal, pics); if (!sameBytes(A, B)) { bad++; names.push(c[0] + ' ' + c[1] + 'x' + c[2]); } }
    var rep = scene('anim', 80, 60, 6); rep.splice(3, 0, rep[2], rep[2]); pal = G.makePalette(rep, 255); tried++; if (!sameBytes(encode(G, 80, 60, pal, rep, false), encode(G, 80, 60, pal, rep))) { bad++; names.push('repeated pictures'); }
    var ties = []; for (i = 0; i < 60; i++) ties.push([(i * 37) % 256, (i % 5) * 50, (i * 91) % 256]); var tie = scene('lattice', 70, 50, 2); tried++; if (!sameBytes(encode(G, 70, 50, ties, tie, false), encode(G, 70, 50, ties, tie))) { bad++; names.push('ties'); }
    var longer = scene('few', 300, 200, 2); pal = G.makePalette(longer, 255); tried++; if (!sameBytes(encode(G, 300, 200, pal, longer, false), encode(G, 300, 200, pal, longer))) { bad++; names.push('table resets'); }
    return { tried: tried, differing: bad, names: names, available: G.wasmAvailable() };
  }
  if (m === 'speed') {
    var sets = { photo: scene('photo', 640, 480, 30), game: scene('few', 640, 480, 30), 'moving block': scene('anim', 640, 480, 30), 'scrolling bands': scene('bands', 640, 480, 30) }, res = {}, med = function (a) { a = a.slice().sort(function (x, y) { return x - y; }); return a[a.length >> 1]; };
    Object.keys(sets).forEach(function (name) {
      var pics = sets[name], t0, pal = G.makePalette(pics, 255, { wasm: false }), pj = [], pw = [], tj = [], tw = [], rep, ref = encode(G, 640, 480, pal, pics, false);
      for (rep = 0; rep < REPSN + 1; rep++) { var order = rep % 2 ? ['w', 'j'] : ['j', 'w']; for (var o = 0; o < 2; o++) { t0 = performance.now(); var pp = G.makePalette(pics, 255, order[o] === 'w' ? undefined : { wasm: false }); var pdt = performance.now() - t0; if (JSON.stringify(pp) !== JSON.stringify(pal)) throw new Error('palette differs in ' + name); if (rep > 0) (order[o] === 'w' ? pw : pj).push(pdt); t0 = performance.now(); var out = encode(G, 640, 480, pal, pics, order[o] === 'w' ? undefined : false); var dt = performance.now() - t0; if (!sameBytes(out, ref)) throw new Error('bytes differ in ' + name); if (rep > 0) (order[o] === 'w' ? tw : tj).push(dt); } }
      res[name] = { paletteJs: +med(pj).toFixed(1), paletteWasm: +med(pw).toFixed(1), js: +med(tj).toFixed(1), wasm: +med(tw).toFixed(1) };
    });
    return { speed: res, available: G.wasmAvailable() };
  }
  if (m === 'cold-js' || m === 'cold-wasm') {
    var pics2 = scene('smooth', 160, 120, 4), pal2 = G.makePalette(pics2, 255), t1 = performance.now(), out2 = encode(G, 160, 120, pal2, pics2, m === 'cold-js' ? false : undefined); return { first: performance.now() - t1, len: out2.length };
  }
  return { error: 'unknown mode ' + m };
}`.replace('REPSN', String(REPS));
const server = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'); r.setHeader('cache-control', 'no-store');
  if (u.pathname === '/gif-writer.js') { r.setHeader('content-type', 'text/javascript'); return r.end(SRC); }
  if (u.pathname !== '/page.html') { r.writeHead(404); return r.end(); }
  const m = u.searchParams.get('m'), blocked = u.searchParams.get('csp') === 'nowasm';
  r.setHeader('content-type', 'text/html');
  r.end('<!doctype html><meta charset=utf-8><meta http-equiv="Content-Security-Policy" content="' + (blocked ? CSP_NOWASM : CSP_WASM) + '"><title>t</title><link rel="icon" href="data:,"><script src="/gif-writer.js"></script><script>' + CODE + '\ntry{window.__res=mode(' + JSON.stringify(m) + ')}catch(e){window.__res={error:String(e&&e.stack||e)}}</script>');
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
  for (let rep = 0; rep < REPS + 2; rep++) for (const v of rep % 2 ? ['wasm', 'js'] : ['js', 'wasm']) { const r = await run('cold-' + v, ''); if (!r.error) cold[v].push(r.first); }
  const out = { version, reps: REPS, eq, eqBlocked, speed: sp.speed, cold: { jsMs: cold.js.length ? med(cold.js) : null, wasmMs: cold.wasm.length ? med(cold.wasm) : null }, wallSeconds: (Date.now() - t0) / 1000 };
  let pass = !eq.error && !eqBlocked.error && !sp.error && eq.differing === 0 && eqBlocked.differing === 0 && eq.available === true;
  console.log('part 1, same GIF bytes, WebAssembly allowed: ' + (eq.error ? 'ERROR ' + eq.error : eq.tried + ' GIFs, ' + eq.differing + ' differ' + (eq.names && eq.names.length ? ' (' + eq.names.join(', ') + ')' : '') + ', wasm available=' + eq.available));
  console.log('part 3, policy without the wasm word: ' + (eqBlocked.error ? 'ERROR ' + eqBlocked.error : eqBlocked.tried + ' GIFs, ' + eqBlocked.differing + ' differ, wasm available=' + eqBlocked.available));
  if (!webkitFamily && !eqBlocked.error) pass = pass && eqBlocked.available === false;
  if (sp.speed) {
    console.log('part 2, speed, palette search and encoding of 30 pictures of 640 x 480, ms per job, median of ' + REPS + ' rounds in rotating order (smaller is better); times faster = JavaScript / WebAssembly (bigger is better)');
    console.log('pictures'.padEnd(16) + 'palette JS'.padStart(11) + 'palette wasm'.padStart(14) + 'times faster'.padStart(14) + 'encode JS'.padStart(11) + 'encode wasm'.padStart(13) + 'times faster'.padStart(14));
    for (const [k, v] of Object.entries(sp.speed)) console.log(k.padEnd(16) + String(v.paletteJs).padStart(11) + String(v.paletteWasm).padStart(14) + ((v.paletteJs / v.paletteWasm).toFixed(2) + 'x').padStart(14) + String(v.js).padStart(11) + String(v.wasm).padStart(13) + ((v.js / v.wasm).toFixed(2) + 'x').padStart(14));
    console.log('a first small GIF (160 x 120, 4 pictures) on a fresh page (ms, median of ' + (REPS + 2) + '; smaller is better): JavaScript ' + (out.cold.jsMs === null ? '?' : out.cold.jsMs.toFixed(1)) + ', WebAssembly (with its start-up) ' + (out.cold.wasmMs === null ? '?' : out.cold.wasmMs.toFixed(1)));
  }
  console.log(pass ? 'PASS' : 'FAIL');
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  await b.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch((e) => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
