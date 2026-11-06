#!/usr/bin/env node
// sprite-baker against three.js (WebGL): time to make one 96 px picture of a lit sphere as pixels in memory, and one 12-frame roll. Copyright (c) 2026 LFC Foundry. MIT License.
// Run one browser at a time: LIBS=<folder with node_modules holding puppeteer-core, esbuild and three> CHROMIUM=... | FIREFOX=... | WEBKIT=1 [R=5 rounds] node tests/compare/sprite-baker-compare-browser.js
// The library is only measured here, never copied into this repository. One library per page, order swapped every round. Exit 2 when it cannot run.
// Same sphere (radius 11 in 96 px, orthographic, one light) but not the same shading: sprite-baker uses a toon ramp and supersamples 2 by 2 by default (shown with ss 2 and ss 1); three.js uses MeshLambertMaterial. three.js is timed from render() to pixels in a Uint8Array (readPixels), the same end point as bakeSprite. The first call (context creation, shader compile) is reported separately as "first".
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), zlib = require('zlib');
if (!process.env.LIBS || !(process.env.CHROMIUM || process.env.FIREFOX || process.env.WEBKIT)) { console.log('skipped: needs LIBS and CHROMIUM, FIREFOX or WEBKIT'); process.exit(2); }
const NM = fs.existsSync(path.join(process.env.LIBS, 'node_modules')) ? path.join(process.env.LIBS, 'node_modules') : process.env.LIBS;
const pp = require(path.join(NM, 'puppeteer-core')), es = require(path.join(NM, 'esbuild'));
const out = path.join(require('os').tmpdir(), 'lfc-compare-dist'); fs.mkdirSync(out, { recursive: true });
const entry = path.join(out, 'three-entry.js');
fs.writeFileSync(entry, "import { Scene, OrthographicCamera, Mesh, SphereGeometry, MeshLambertMaterial, DirectionalLight, AmbientLight, WebGLRenderer } from " + JSON.stringify(path.join(NM, 'three')) + "; window.T = { Scene, OrthographicCamera, Mesh, SphereGeometry, MeshLambertMaterial, DirectionalLight, AmbientLight, WebGLRenderer };");
es.buildSync({ entryPoints: [entry], bundle: true, minify: true, outfile: path.join(out, 'three-min.js'), logLevel: 'error' });
const SRC = { 'sprite-baker': fs.readFileSync(path.resolve(__dirname, '../../modules/sprite-baker/sprite-baker.js'), 'utf8'), 'three.js': fs.readFileSync(path.join(out, 'three-min.js'), 'utf8') };
// Runs inside the page. Returns { first, one: [ms per sprite for each variant], roll: [ms per 12-frame roll], cover }.
function bench(which, src) {
  (0, eval)(src);
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  let ones, rolls, cover = (x) => { const d = x && x.data; let n = 0; if (d) for (let i = 0; i < d.length; i += 4) if (d[i + 3]) n++; return n; }, first, firstT0 = performance.now();
  if (which === 'sprite-baker') {
    const scene = [{ fn: SpriteBaker.sphere(11), nu: 12, nv: 18, material: SpriteBaker.material([[0, 60, 20, 90], [1, 245, 210, 255]]) }];
    const vs = [{ ss: 2 }, { ss: 1 }, { edge: true }];   // default, one sample a pixel, and edge-only supersampling (1.8.0)
    ones = vs.map(o => () => SpriteBaker.bakeSprite(scene, 96, o));
    rolls = vs.map(o => () => SpriteBaker.bakeRoll(scene, 12, 96, o));
  } else {
    const mk = (aa) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 96;
      const r = new T.WebGLRenderer({ canvas: cv, alpha: true, antialias: aa, preserveDrawingBuffer: true }); r.setSize(96, 96, false);
      const cam = new T.OrthographicCamera(-12.5, 12.5, 12.5, -12.5, 1, 100); cam.position.z = 50;
      const sc = new T.Scene(), mesh = new T.Mesh(new T.SphereGeometry(11, 18, 12), new T.MeshLambertMaterial({ color: 0xf0c8ff })); sc.add(mesh);
      const l = new T.DirectionalLight(0xffffff, 3); l.position.set(-1, 1, 1); sc.add(l); sc.add(new T.AmbientLight(0x303030));
      const gl = r.getContext(), buf = new Uint8Array(96 * 96 * 4);
      const px = () => { gl.readPixels(0, 0, 96, 96, gl.RGBA, gl.UNSIGNED_BYTE, buf); return { data: buf }; };
      return { one: () => { r.render(sc, cam); return px(); }, roll: () => { for (let i = 0; i < 12; i++) { mesh.rotation.x = i / 12 * Math.PI * 2; r.render(sc, cam); px(); } } };
    };
    const plain = mk(false), smooth = mk(true);
    ones = [plain.one, smooth.one]; rolls = [plain.roll, smooth.roll];
  }
  first = (ones[0](), performance.now() - firstT0);   // for three.js this includes the first of the two contexts only
  const cov = ones.map(f => cover(f()));
  const t = (f, n) => { for (let i = 0; i < 3; i++) f(); const r = []; for (let k = 0; k < 7; k++) { const t0 = performance.now(); for (let i = 0; i < n; i++) f(); r.push((performance.now() - t0) / n); } return med(r); };
  return { first, one: ones.map(f => t(f, 20)), roll: rolls.map(f => t(f, 3)), cover: cov };
}
(async () => {
  const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><title>x</title><body>'); }); await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const url = 'http://127.0.0.1:' + srv.address().port + '/';
  const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1]);
  const R = +process.env.R || 5, med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  const gz = (s) => zlib.gzipSync(Buffer.from(s), { level: 9 }).length;
  console.log('size: three.js sphere scene, tree-shaken, minified ' + SRC['three.js'].length + ' B (' + gz(SRC['three.js']) + ' gzipped)');
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await require('../webkit-shim.js').launch('webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' }) : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    console.log('Browser: ' + await b.version());
    const names = Object.keys(SRC), got = {};
    for (let k = 0; k < R; k++) for (const n of (k % 2 ? names.slice().reverse() : names)) {
      const p = await b.newPage(); await p.goto(url);
      try { (got[n] = got[n] || []).push(await p.evaluate(bench, n, SRC[n])); } catch (e) { console.log('  ' + n + ' failed: ' + String(e.message).split('\n')[0]); }
      if (p.close) await p.close();
    }
    const ok = (n) => got[n] && got[n].length;
    const f = (n, key, i) => ok(n) ? med(got[n].map(x => i === undefined ? x[key] : x[key][i])).toFixed(2) : 'n/a';
    console.log('  one 96 px sphere, ms: sprite-baker (ss 2) ' + f('sprite-baker', 'one', 0) + ' | sprite-baker (ss 1) ' + f('sprite-baker', 'one', 1) + ' | sprite-baker (edge) ' + f('sprite-baker', 'one', 2) + ' | three.js ' + f('three.js', 'one', 0) + ' | three.js smooth edges (4x multisample) ' + f('three.js', 'one', 1));
    console.log('  12-frame roll, ms:    sprite-baker (ss 2) ' + f('sprite-baker', 'roll', 0) + ' | sprite-baker (ss 1) ' + f('sprite-baker', 'roll', 1) + ' | sprite-baker (edge) ' + f('sprite-baker', 'roll', 2) + ' | three.js ' + f('three.js', 'roll', 0) + ' | three.js smooth ' + f('three.js', 'roll', 1));
    console.log('  first picture incl. start-up, ms: sprite-baker ' + f('sprite-baker', 'first') + ' | three.js ' + f('three.js', 'first') + '   pixels drawn: ' + (ok('sprite-baker') ? got['sprite-baker'][0].cover.join('/') : '?') + ' | ' + (ok('three.js') ? got['three.js'][0].cover.join('/') : 'n/a (no WebGL context)'));
    await b.close();
  }
  srv.close(); process.exit(0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
