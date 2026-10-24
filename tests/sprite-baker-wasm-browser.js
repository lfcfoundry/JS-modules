#!/usr/bin/env node
// sprite-baker 1.6.0 WebAssembly fill, in one real browser at a time. Copyright (c) 2026 LFC Foundry. MIT License.
// Part 1 (equality): the battery of modules/sprite-baker/test/wasm-battery.js (26 mesh scenes, 800 random scenes, the over-the-limit and two-surface cases) runs inside the browser and
// compares color and depth bytes of the plain JavaScript with the wasm fill. Part 2 (speed): 48 pictures of 140 x 140 pixels for four things (Fancy's face, the gold coin, a rod, the glove),
// each drawn with SpriteBaker.drawMesh, with the add-on's drawMesh and with the add-on's drawMesh plus rast.release() (which skips the copy that keeps an older Rast correct), the three taking turns in rotating order, one warm-up round and then the best of REPS rounds (smaller is better);
// the time to start the add-on (decode, compile, instantiate) is printed too. Part 3: a page whose policy lacks 'wasm-unsafe-eval' must still draw the same bytes (on the plain code where the browser refuses WebAssembly).
// Run: node tests/sprite-baker-wasm-browser.js <chromium|firefox|webkit> [out.json]
// Env: REPS (default 7), ADDON=/path/to/another/sprite-baker-wasm.js to try a variant, CHROMIUM=/path, FIREFOX=/path (puppeteer-core on NODE_PATH for those two). Node is not used for speed numbers.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const which = process.argv[2], outFile = process.argv[3], root = path.resolve(__dirname, '..') + '/';
if (!['chromium', 'firefox', 'webkit'].includes(which)) { console.log('usage: node tests/sprite-baker-wasm-browser.js <chromium|firefox|webkit> [out.json]'); process.exit(2); }
const REPS = +(process.env.REPS || 7), dir = root + 'modules/sprite-baker/';
const FILES = { '/sprite-baker.js': dir + 'sprite-baker.js', '/sprite-baker-wasm.js': process.env.ADDON || dir + 'sprite-baker-wasm.js', '/wasm-battery.js': dir + 'test/wasm-battery.js' };
const REF = '(function(){var module={exports:{}};' + fs.readFileSync(dir + 'test/reference-tri.js', 'utf8') + '\n;window.__F=module.exports;})();';
const TIMING = `
function timing(SB, F, W, reps, pics) {
  var seed = 7; function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  var tex = new Uint8ClampedArray(256 * 256 * 4), i, x, y, k;
  for (y = 0; y < 256; y++) for (x = 0; x < 256; x++) { i = (y * 256 + x) * 4; k = ((x >> 5) * 7 + (y >> 5) * 13) % 6; tex[i] = rnd() * 256; tex[i + 1] = rnd() * 256; tex[i + 2] = rnd() * 256; tex[i + 3] = k === 0 ? 0 : k === 2 ? 0 : 255; }
  var TEXM = { w: 256, h: 256, data: tex }, RIDGE = { 0: { freq: 5, dark: -0.86, darkScale: 0.93 }, 5: { freq: 5, dark: -0.86, darkScale: 0.78, lit: 0.9, litAdd: 0.06 } };
  function own(m, t) { var o = { lut: F.lut()[m], specular: 1, bounce: 1, pool: 1, rimLight: 1, edge: m === 1 ? 0.5 : 0.88 }; if (RIDGE[m]) o.ridge = RIDGE[m]; if (t) o.texture = TEXM; return o; }
  var ball = SB.mesh(SB.sphere(44), 40, 64), rod = SB.mesh(SB.rod([-40, -10, 0], [40, 10, 10], 9, 6), 24, 20), glove = SB.mesh(SB.sphere([38, 30, 32]), 30, 40);
  var spin = function (p) { var c = Math.cos(0.6), s = Math.sin(0.6); return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c, nx: p.nx * c + p.nz * s, ny: p.ny, nz: -p.nx * s + p.nz * c }; };
  var view = function (phi) { return { scale: 1, ox: 70, oy: 70, rot: SB.rotationMatrix([1, 0, 0], phi), center: [0, 0, 0] }; };
  var cases = [['Fancy face (picture + ridge lines)', ball, 0, true, null], ['gold coin (ridge lines, spin pose)', ball, 5, false, spin], ['plain rod', rod, 2, false, null], ['glove', glove, 1, false, null]];
  var res = {}, c, rep, best = {};
  function one(E, cs, n, rel) { var R = new E.Rast(140, 140); E.drawMesh(R, cs[1], own(cs[2], cs[3]), view(n * 0.5), cs[4] ? { pose: cs[4] } : undefined); if (rel) R.release(); }
  function round(E, cs, rel) { var t0 = performance.now(), n; for (n = 0; n < pics; n++) one(E, cs, n, rel); return performance.now() - t0; }
  for (c = 0; c < cases.length; c++) {
    var cs = cases[c], nm = cs[0]; best[nm] = { js: 1e9, wasm: 1e9, wasmRelease: 1e9 };
    for (rep = 0; rep <= reps; rep++) {
      var order = [['js', 'wasm', 'wasmRelease'], ['wasmRelease', 'wasm', 'js'], ['wasm', 'js', 'wasmRelease']][rep % 3], j;
      for (j = 0; j < 3; j++) { var t = round(order[j] === 'js' ? { Rast: SB.Rast, drawMesh: SB.drawMesh } : W, cs, order[j] === 'wasmRelease'); if (rep > 0 && t < best[nm][order[j]]) best[nm][order[j]] = t; }
    }
    res[nm] = { js: Math.round(best[nm].js * 10) / 10, wasm: Math.round(best[nm].wasm * 10) / 10, wasmRelease: Math.round(best[nm].wasmRelease * 10) / 10 };
  }
  return res;
}`;
const CSP_WASM = "default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'", CSP_NOWASM = "default-src 'none'; script-src 'self' 'unsafe-inline'";
const server = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x'); r.setHeader('cache-control', 'no-store');
  if (FILES[u.pathname]) { r.setHeader('content-type', 'text/javascript'); return r.end(fs.readFileSync(FILES[u.pathname])); }
  if (u.pathname === '/ref.js') { r.setHeader('content-type', 'text/javascript'); return r.end(REF); }
  if (u.pathname !== '/page.html') { r.writeHead(404); return r.end(); }
  const blocked = u.searchParams.get('csp') === 'nowasm', timed = !blocked;
  r.setHeader('content-type', 'text/html');
  r.end('<!doctype html><meta charset=utf-8><meta http-equiv="Content-Security-Policy" content="' + (blocked ? CSP_NOWASM : CSP_WASM) + '"><title>t</title><link rel="icon" href="data:,">' +
    '<script src="/sprite-baker.js"></script><script>window.__PO=SpriteBaker.outline</script><script src="/ref.js"></script><script src="/wasm-battery.js"></script><script src="/sprite-baker-wasm.js"></script>' +
    '<script>' + TIMING + '\ntry{var t0=performance.now(),W=SpriteBaker.wasm(),startMs=performance.now()-t0,b=spriteBakerWasmBattery(SpriteBaker,window.__F,W,window.__PO),res={startMs:startMs,available:W.available,engine:W.engine,scenes:b.scenes,differing:b.differing,names:b.names,extra:b.extra,stats:W.stats};' +
    (timed ? 'res.timing=timing(SpriteBaker,window.__F,W,' + REPS + ',48);' : '') + 'window.__res=res}catch(e){window.__res={error:String(e&&e.stack||e)}}</script>');
});
const webkitFamily = which === 'webkit';
(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok)); const base = 'http://127.0.0.1:' + server.address().port, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let b;
  if (webkitFamily) { const wd = require(root + 'tests/webkit-shim.js'); b = await wd.launch('webkitgtk'); }
  else { const pup = require('puppeteer-core');
    b = which === 'firefox' ? await pup.launch({ browser: 'firefox', executablePath: process.env.FIREFOX, headless: true, protocol: 'webDriverBiDi', protocolTimeout: 600000 })
      : await pup.launch({ executablePath: process.env.CHROMIUM, headless: true, protocolTimeout: 600000, args: ['--no-sandbox', '--disable-gpu'] }); }
  const version = await b.version(); console.log(version);
  async function run(csp) {
    const p = await b.newPage(); await p.goto(base + '/page.html' + (csp ? '?csp=' + csp : ''));
    let res = null; for (let i = 0; i < 1200 && !res; i++) { res = await p.evaluate(() => window.__res || null); if (!res) await sleep(100); }
    if (!webkitFamily) await p.close();
    return res || { error: 'no result in 120 s' };
  }
  const t0 = Date.now(), ok = await run(''), bl = await run('nowasm'), out = { version, reps: REPS, allowed: ok, blocked: bl, wallSeconds: (Date.now() - t0) / 1000 };
  let pass = !ok.error && !bl.error && ok.differing === 0 && bl.differing === 0 && ok.available === true && ok.engine === 'wasm' && Object.values(ok.extra).every(Boolean) && Object.values(bl.extra).every(Boolean);
  console.log('part 1, equality, WebAssembly allowed: ' + (ok.error ? 'ERROR ' + ok.error : ok.scenes + ' scenes, ' + ok.differing + ' differ, wasm calls ' + ok.stats.wasm + ', plain-code calls ' + ok.stats.js + ', add-on start ' + ok.startMs.toFixed(1) + ' ms'));
  console.log('part 3, policy without the wasm word: ' + (bl.error ? 'ERROR ' + bl.error : bl.scenes + ' scenes, ' + bl.differing + ' differ, add-on available=' + bl.available + ' engine=' + bl.engine + (webkitFamily ? ' (this browser does not refuse WebAssembly without the word)' : '')));
  if (!webkitFamily && !bl.error) pass = pass && bl.available === false && bl.engine === 'js';
  if (ok.timing) { console.log('part 2, speed (ms for 48 pictures of 140 x 140, smaller is better; faster = plain JS time / wasm time, bigger is better; the last two columns call rast.release() after each picture)'); console.log('picture'.padEnd(38) + 'plain JS'.padStart(10) + 'wasm'.padStart(10) + 'faster'.padStart(9) + 'wasm+release()'.padStart(16) + 'faster'.padStart(9));
    for (const [k, v] of Object.entries(ok.timing)) console.log(k.padEnd(38) + String(v.js).padStart(10) + String(v.wasm).padStart(10) + ((v.js / v.wasm).toFixed(2) + 'x').padStart(9) + String(v.wasmRelease).padStart(16) + ((v.js / v.wasmRelease).toFixed(2) + 'x').padStart(9)); }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  await b.close(); server.close(); console.log(pass ? 'PASS' : 'FAIL'); process.exit(pass ? 0 : 1);
})().catch((e) => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
