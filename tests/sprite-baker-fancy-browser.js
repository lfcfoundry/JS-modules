#!/usr/bin/env node
// sprite-baker 1.5.0 "same pixels as Fancy Banana's filler" and speed check. Copyright (c) 2026 LFC Foundry. MIT License.
// In Node and in each real browser: draws a textured, ridged sphere, the gold coin with a spin pose, a rod and the glove through Fancy's own filler
// (modules/sprite-baker/test/reference-tri.js) and through sprite-baker, compares color and depth byte for byte inside that browser, compares a
// fingerprint of each picture with Node's, then times the fill (best of 5 alternating runs, smaller is better). With OLD=/path/to/an/older/sprite-baker.js it
// also times the plain (no texture, no ridge) sphere with that copy beside the new one, to show the plain path did not slow down.
// Run one browser at a time: CHROMIUM=/path/to/chrome node tests/sprite-baker-fancy-browser.js   (FIREFOX=... for Firefox, WEBKIT=1 for WebKitGTK, WEBKIT=epiphany for GNOME Web)
// With LEAN=1 the drawing (Rast, tri, drawMesh) is done by the lean build Fancy would ship (modules/sprite-baker/lean.py without ramps, mesh, rotation, shapes, baking and sheets,
// no comments); the meshes and the rotation come from the full file. The lean build is compared with the reference in the same way and timed beside the full file.
// Needs puppeteer-core for Chromium and Firefox; WebKitGTK goes through tests/webkit-shim.js and tools/webkit-driver. Exit 2 (skipped) when nothing can run.
'use strict';
const path = require('path'), fs = require('fs');
const pp = (() => { try { return require('puppeteer-core'); } catch (e) { return null; } })();
const wd = require('./webkit-shim.js');
const root = path.resolve(__dirname, '..') + '/';
const exes = [['chromium', process.env.CHROMIUM], ['firefox', process.env.FIREFOX], ['webkit', process.env.WEBKIT]].filter(x => x[1] && (pp || x[0] === 'webkit'));
if (!exes.length) { console.log('skipped: needs CHROMIUM, FIREFOX (with puppeteer-core) or WEBKIT=1'); process.exit(2); }
const SRC = fs.readFileSync(root + 'modules/sprite-baker/sprite-baker.js', 'utf8') + '\nmodule.exports = SpriteBaker;';
const REF = fs.readFileSync(root + 'modules/sprite-baker/test/reference-tri.js', 'utf8');
const LEAN = process.env.LEAN ? (() => {
  const tmp = fs.mkdtempSync(require('os').tmpdir() + '/sbl-'), f = tmp + '/lean.js', r = require('child_process').spawnSync('python3', [root + 'modules/sprite-baker/lean.py', '--without', 'ramps,mesh,rotation,shapes,baking,sheets', '--no-comments', '-o', f], { encoding: 'utf8' });
  if (r.status !== 0) { console.log('lean.py failed: ' + r.stderr); process.exit(1); }
  const t = fs.readFileSync(f, 'utf8') + '\nmodule.exports = SpriteBaker;'; fs.rmSync(tmp, { recursive: true, force: true }); return t;
})() : '';
const OLD = process.env.OLD ? fs.readFileSync(process.env.OLD, 'utf8') + '\nmodule.exports = SpriteBaker;' : '';

// Runs unchanged in Node and in a page. Returns `out` (fingerprints and in-page equality), `ms` (milliseconds, smaller is better).
function battery(src, refSrc, oldSrc, leanSrc) {
  var load = function (text) { var m = { exports: {} }; new Function('module', text)(m); return m.exports; };
  var SB = load(src), F = load(refSrc), O = oldSrc ? load(oldSrc) : null, L = leanSrc ? load(leanSrc) : SB, out = {}, ms = {}, seed = 20261017, PI2 = Math.PI * 2;
  function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  function fp(a) { var h = 2166136261, i; for (i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 16777619) >>> 0; return h.toString(16); }
  var d = new Uint8ClampedArray(256 * 256 * 4), x, y, i, k;
  for (y = 0; y < 256; y++) for (x = 0; x < 256; x++) { i = (y * 256 + x) * 4; k = ((x >> 5) * 7 + (y >> 5) * 13) % 6; d[i] = rnd() * 256; d[i + 1] = rnd() * 256; d[i + 2] = rnd() * 256; d[i + 3] = k === 0 || k === 2 ? 0 : k === 1 ? 1 + rnd() * 254 : 255; if (k === 3) { d[i] = 201 + rnd() * 54; d[i + 1] = rnd() * 89; } }
  var texRef = { d: d }, RIDGE = { 0: { freq: 5, dark: -0.86, darkScale: 0.93 }, 5: { freq: 5, dark: -0.86, darkScale: 0.78, lit: 0.9, litAdd: 0.06 } };
  function own(m, tex) { var o = { lut: F.lut()[m], specular: 1, bounce: 1, pool: 1, rimLight: 1, edge: m === 1 ? 0.5 : 0.88 }; if (RIDGE[m]) o.ridge = RIDGE[m]; if (tex) o.texture = { w: 256, h: 256, data: d }; return o; }
  function refMesh(R, m, mi, tex, view, pose) {
    var s = view.scale, rot = view.rot, cols = m.nv + 1, n = cols * (m.nu + 1), V = new Array(n), kk, X, Y, Z, nx, ny, nz, a, b, c, e, j;
    for (kk = 0; kk < n; kk++) {
      X = m.pos[kk * 3]; Y = m.pos[kk * 3 + 1]; Z = m.pos[kk * 3 + 2]; nx = m.nrm[kk * 3]; ny = m.nrm[kk * 3 + 1]; nz = m.nrm[kk * 3 + 2];
      var rx = rot[0] * X + rot[1] * Y + rot[2] * Z, ry = rot[3] * X + rot[4] * Y + rot[5] * Z, rz = rot[6] * X + rot[7] * Y + rot[8] * Z, qx = rot[0] * nx + rot[1] * ny + rot[2] * nz, qy = rot[3] * nx + rot[4] * ny + rot[5] * nz, qz = rot[6] * nx + rot[7] * ny + rot[8] * nz;
      var p = { x: rx, y: ry, z: rz, nx: qx, ny: qy, nz: qz }; if (pose) p = pose(p);
      V[kk] = F.V(p, s, s, view.ox, view.oy, ((kk / cols) | 0) / m.nu, ((kk % cols) / m.nv) * PI2);
    }
    for (i = 0; i < m.nu; i++) for (j = 0; j < m.nv; j++) { a = V[i * cols + j]; b = V[(i + 1) * cols + j]; c = V[(i + 1) * cols + j + 1]; e = V[i * cols + j + 1]; F.tri(R, a, b, c, mi, tex ? texRef : null); F.tri(R, a, c, e, mi, tex ? texRef : null); }
  }
  var spin = function (p) { var c = Math.cos(0.6), s = Math.sin(0.6); return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c, nx: p.nx * c + p.nz * s, ny: p.ny, nz: -p.nx * s + p.nz * c }; };
  var view = function (phi) { return { scale: 1, ox: 70, oy: 70, rot: SB.rotationMatrix([1, 0, 0], phi), center: [0, 0, 0] }; };
  var ball = SB.mesh(SB.sphere(44), 40, 64), rod = SB.mesh(SB.rod([-40, -10, 0], [40, 10, 10], 9, 6), 24, 20), glove = SB.mesh(SB.sphere([38, 30, 32]), 30, 40);
  var cases = [['face sphere', ball, 0, true, null], ['coin pose', ball, 5, false, spin], ['coin pose picture', ball, 5, true, spin], ['rod', rod, 2, false, null], ['glove', glove, 1, false, null]], c, same, j;
  for (c = 0; c < cases.length; c++) {
    same = true; var h = '';
    for (j = 0; j < 4; j++) {
      var R = new F.Rast(140, 140), Q = new L.Rast(140, 140), v = view(j * 1.3);
      refMesh(R, cases[c][1], cases[c][2], cases[c][3], v, cases[c][4]);
      L.drawMesh(Q, cases[c][1], own(cases[c][2], cases[c][3]), v, cases[c][4] ? { pose: cases[c][4] } : undefined);
      for (i = 0; i < R.px.length && same; i++) if (R.px[i] !== Q.px[i]) same = false;
      for (i = 0; i < R.z.length && same; i++) if (R.z[i] !== Q.z[i]) same = false;
      h += fp(Q.px) + ',';
    }
    out[cases[c][0] + ' same as the reference in this page'] = String(same);
    out[cases[c][0] + ' fingerprint'] = h;
  }
  /* timings: 48 pictures of the sphere, best of 5, the contenders taking turns in alternating order */
  function scene(fnDraw) { var t = performance.now(), n; for (n = 0; n < 48; n++) fnDraw(n); return performance.now() - t; }
  var best = {}, rep, names;
  var runs = {
    'textured face sphere, Fancy filler': function (n) { var R = new F.Rast(140, 140); refMesh(R, ball, 0, true, view(n * 0.5), null); },
    'textured face sphere, sprite-baker': function (n) { var Q = new SB.Rast(140, 140); SB.drawMesh(Q, ball, own(0, true), view(n * 0.5)); },
    'plain sphere, sprite-baker': function (n) { var Q = new SB.Rast(140, 140); SB.drawMesh(Q, ball, own(2, false), view(n * 0.5)); }
  };
  if (leanSrc) runs['textured face sphere, lean build'] = function (n) { var Q = new L.Rast(140, 140); L.drawMesh(Q, ball, own(0, true), view(n * 0.5)); };
  if (O) runs['plain sphere, older sprite-baker'] = function (n) { var Q = new O.Rast(140, 140); O.drawMesh(Q, ball, own(2, false), view(n * 0.5)); };
  names = Object.keys(runs);
  for (rep = 0; rep < 6; rep++) (rep % 2 ? names.slice().reverse() : names).forEach(function (nm) { var t = scene(runs[nm]); if (rep > 0 && (best[nm] === undefined || t < best[nm])) best[nm] = t; });   // the first round warms up
  names.forEach(function (nm) { ms[nm] = Math.round(best[nm] * 10) / 10; });
  return { out: out, ms: ms };
}

const ref = battery(SRC, REF, OLD, LEAN);
const bad = (o) => Object.keys(o).filter(k => / same as the reference/.test(k) && o[k] !== 'true');
const table = (ms) => Object.keys(ms).map(k => '    ' + k.padEnd(38) + ms[k] + ' ms (48 pictures; smaller is better)').join('\n');
let fails = bad(ref.out).length;
console.log('Node ' + process.version + ': ' + (fails ? 'DIFFERS from the reference in ' + bad(ref.out).join('; ') : 'all 5 cases equal the reference') + '\n' + table(ref.ms));

(async () => {
  for (const [kind, exe] of exes) {
    const b = kind === 'webkit' ? await wd.launch(exe === 'epiphany' ? 'epiphany' : 'webkitgtk') : kind === 'firefox' ? await pp.launch({ browser: 'firefox', executablePath: exe, headless: true, protocol: 'webDriverBiDi' })
      : await pp.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    console.log('Browser: ' + await b.version());
    const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e && e.message || e)));
    await p.goto('about:blank');
    const got = await p.evaluate(battery, SRC, REF, OLD, LEAN);
    const diff = bad(got.out);
    const other = Object.keys(ref.out).filter(k => / fingerprint$/.test(k) && got.out[k] !== ref.out[k]);   // a browser's Math.pow or Math.cos may differ from Node's in the last digit
    if (diff.length || errs.length) { fails++; console.log('  FAIL: differs from the reference in ' + (diff.join('; ') || 'nothing') + (errs.length ? '; page error: ' + errs[0] : '')); }
    else console.log('  ok   all 5 cases equal the reference in this browser' + (other.length ? ' (note: ' + other.length + ' fingerprints differ from Node: ' + other.join(', ') + ')' : ' and in Node') + '\n' + table(got.ms));
    if (p.close) await p.close();
    await b.close();
  }
  console.log(fails ? fails + ' FAILED' : 'all same-pixel checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('could not run: ' + (e && e.stack || e)); process.exit(1); });
