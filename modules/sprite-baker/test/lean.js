#!/usr/bin/env node
/* Checks the lean builds of sprite-baker. Copyright (c) 2026 LFC Foundry. MIT License.
 * lean.py writes each build, Node loads it, and then: the exports are the full list minus the cut parts; every part that is kept gives the same
 * answers as the full module; the 266 Fancy Banana scenes (test/fancy-scenes.js) draw byte for byte the same buffers through the lean Rast, tri and
 * drawMesh; a build made with --no-comments does the same. Builds: every part cut on its own, Fancy the Banana's set, the same plus the checks,
 * and everything cut at once. Run: node modules/sprite-baker/test/lean.js     (needs python3; builds in the system temp folder; about 3 s) */
'use strict';
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const dir = path.join(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spritebaker-lean-'));
const FULL = require('../sprite-baker.js');
const py = (...a) => cp.spawnSync('python3', [path.join(dir, 'lean.py'), ...a], { encoding: 'utf8' });
const parts = py('--list').stdout.trim().split('\n').map(l => l.split(/\s+/)[0]);
const EXPORTS = { ramps: ['material', 'bakeRamp'], mesh: ['mesh'], rotation: ['rotationMatrix', 'rotateAxis', 'rotateX'], shapes: ['sphere', 'rod', 'capsule', 'torus'],
  baking: ['downsample', 'outline', 'bakeSprite', 'bakeRoll', 'baker', 'toImageData', 'toCanvas', 'DEFAULT_MAX_PIXELS'], sheets: ['alphaMask', 'hit', 'toSheet'], checks: [] };
const NEEDS = { baking: ['mesh', 'rotation'], sheets: ['baking'] };
const closure = set => { set = new Set(set); for (let again = true; again;) { again = false; for (const p in NEEDS) if (!set.has(p) && NEEDS[p].some(u => set.has(u))) { set.add(p); again = true; } } return set; };
const FANCY = ['ramps', 'mesh', 'rotation', 'shapes', 'baking', 'sheets'];
const sets = parts.map(p => [p]).concat([FANCY, parts.slice()]);

const m1 = FULL.material([[0, 10, 20, 30], [0.5, 120, 140, 160], [1, 250, 240, 230]]), m2 = FULL.material([[0, 90, 40, 20], [1, 255, 230, 160]], { edge: 0.5 });
const ball = FULL.mesh(FULL.sphere(12, [0, 0, 0]), 14, 20);
const pic = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y), i = (y * w + x) * 4; d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = v[3]; } return { width: w, height: h, data: d }; };
const A = pic(9, 7, (x, y) => (x + y) % 3 ? [x * 20, y * 30, 5, 255] : [0, 0, 0, 0]);
const same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a, (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v)), JSON.parse(JSON.stringify(b, (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v)));

function battery(L, cut, label) {   // the kept parts answer like the full module; returns the number of comparisons made
  let n = 0;
  const has = p => !cut.has(p), eq = (a, b) => { same(a, b); n++; };
  const exp = new Set(Object.keys(FULL)); for (const p of cut) for (const k of EXPORTS[p]) exp.delete(k);
  assert.deepStrictEqual(Object.keys(L).sort(), Array.from(exp).sort(), label + ': exports'); n++;
  for (const p of cut) for (const k of EXPORTS[p]) assert.strictEqual(L[k], undefined, label + ': ' + k + ' should be missing'); 
  if (has('ramps')) { eq(L.bakeRamp([[0, 1, 2, 3], [1, 200, 100, 50]]), FULL.bakeRamp([[0, 1, 2, 3], [1, 200, 100, 50]])); eq(L.material([[0, 5, 6, 7]], { edge: 0.7 }), FULL.material([[0, 5, 6, 7]], { edge: 0.7 }));
    const r1 = new L.Rast(30, 30), r2 = new FULL.Rast(30, 30), raw = [[0, 10, 20, 30], [1, 250, 240, 230]];
    L.tri(r1, [3, 3, 0, 0, 0, 1], [27, 5, 0, 0, 0, 1], [6, 26, 0, 0, 0, 1], raw); FULL.tri(r2, [3, 3, 0, 0, 0, 1], [27, 5, 0, 0, 0, 1], [6, 26, 0, 0, 0, 1], raw); eq(r1.px, r2.px);   // raw stops
  } else assert.throws(() => L.tri(new L.Rast(8, 8), [1, 1, 0, 0, 0, 1], [7, 1, 0, 0, 0, 1], [1, 7, 0, 0, 0, 1], [[0, 1, 2, 3]]), label + ': raw stops need ramps'), n++;
  if (has('mesh')) { const fn = FULL.sphere([5, 6, 7], [1, 2, 3]); eq(L.mesh(fn, 6, 9), FULL.mesh(fn, 6, 9)); eq(L.mesh(fn, 6, 9, { flip: true }), FULL.mesh(fn, 6, 9, { flip: true })); }
  if (has('rotation')) { eq(L.rotationMatrix([1, 2, 3], 0.7), FULL.rotationMatrix([1, 2, 3], 0.7)); eq(L.rotateAxis([1, 2, 3, 0, 0, 1], [0, 1, 0], 1.1, [1, 1, 1]), FULL.rotateAxis([1, 2, 3, 0, 0, 1], [0, 1, 0], 1.1, [1, 1, 1])); eq(L.rotateX([1, 2, 3], 0.4, 2), FULL.rotateX([1, 2, 3], 0.4, 2)); }
  if (has('shapes')) for (const [u, v] of [[0.3, 0.4], [0, 0], [1, 0.9]]) { eq(L.sphere(2)(u, v), FULL.sphere(2)(u, v)); eq(L.rod([0, 0, 0], [1, 2, 3], 1, 0.5)(u, v), FULL.rod([0, 0, 0], [1, 2, 3], 1, 0.5)(u, v)); eq(L.capsule([0, 0, 0], [3, 0, 0], 1)(u, v), FULL.capsule([0, 0, 0], [3, 0, 0], 1)(u, v)); eq(L.torus(3, 1)(u, v), FULL.torus(3, 1)(u, v)); }
  if (has('baking')) {
    const scene = [{ fn: FULL.sphere(1.2), nu: 12, nv: 18, material: m1 }, { fn: FULL.rod([-1.5, 0, 0], [1.5, 0.3, 0], 0.3, 0.2), nu: 8, nv: 10, material: m2 }];
    eq(L.bakeSprite(scene, 40, { ss: 2, outline: { radius: 1, color: [0, 0, 0] } }), FULL.bakeSprite(scene, 40, { ss: 2, outline: { radius: 1, color: [0, 0, 0] } }));
    eq(L.bakeRoll(scene, 3, [40, 30], { ss: 2 }), FULL.bakeRoll(scene, 3, [40, 30], { ss: 2 }));
    const b = L.baker(scene, 30, { ss: 1 }); eq(b.frame(1), FULL.baker(scene, 30, { ss: 1 }).frame(1));
    const R = new FULL.Rast(20, 20); FULL.drawMesh(R, ball, m1, { scale: 1, ox: 10, oy: 10 }); eq(L.downsample(R, 2), FULL.downsample(R, 2)); eq(L.outline(A, 1, [9, 9, 9]), FULL.outline(A, 1, [9, 9, 9]));
    eq(L.toImageData(A), FULL.toImageData(A)); eq(L.DEFAULT_MAX_PIXELS, FULL.DEFAULT_MAX_PIXELS); assert.strictEqual(L.toCanvas(A), null); n++;
  }
  if (has('sheets')) { eq(L.alphaMask(A, { threshold: 10 }), FULL.alphaMask(A, { threshold: 10 })); eq(L.hit(A, 1, 1), FULL.hit(A, 1, 1)); eq(L.hit(A, 99, 1), FULL.hit(A, 99, 1)); const fr = [A, A, A]; const s1 = L.toSheet(fr, { padding: 1 }), s2 = FULL.toSheet(fr, { padding: 1 }); eq(s1 && s1.image, s2 && s2.image); }
  { const r1 = new L.Rast(40, 40), r2 = new FULL.Rast(40, 40), V = (x, y, z) => [x, y, z, x / 40 - 0.5, y / 40 - 0.5, 0.8 - z / 30];   // the fill itself, on every build
    for (const t of [[V(3, 3, 1), V(35, 6, 5), V(8, 36, 9)], [V(30, 30, 20), V(2, 28, 0), V(25, 4, 3)]]) { L.tri(r1, t[0], t[1], t[2], m1); FULL.tri(r2, t[0], t[1], t[2], m1); }
    L.drawMesh(r1, ball, m2, { scale: 1, ox: 20, oy: 20 }); FULL.drawMesh(r2, ball, m2, { scale: 1, ox: 20, oy: 20 }); eq(r1.px, r2.px); eq(r1.z, r2.z); }
  if (has('checks')) assert.throws(() => L.tri(new L.Rast(8, 8), [1, 1, 0, 0, 0, 1], [7, 1, 0, 0, 0, 1], [1, 7, 0, 0, 0, 1], 'bogus'), label + ': a bad material is refused'), n++;
  return n;
}

let bad = 0, cases = 0, compared = 0;
const t0 = Date.now();
const note = (ok, what, why) => { cases++; if (!ok) bad++; console.log((ok ? 'ok   ' : 'FAIL ') + what + (ok ? '' : '\n       ' + why)); };
const bu = py('--without', 'nope', '-o', path.join(tmp, 'x.js'));
note(bu.status !== 0 && /unknown part/.test(bu.stderr), 'an unknown part name is refused', bu.stderr + bu.stdout);
const lst = py('--list').stdout.split('\n').filter(Boolean).map(l => l.split(/\s+/)[0]);
note(JSON.stringify(lst) === JSON.stringify(Object.keys(EXPORTS)), 'the list of parts is ' + Object.keys(EXPORTS).join(', '), lst.join(','));
const sizeOf = {};
sets.forEach((set, i) => {
  for (const nc of [false, true]) {
    if (nc && set.length === 1) continue;   // comment stripping is tried on the three big sets
    const file = path.join(tmp, 'lean' + i + (nc ? 'nc' : '') + '.js'), cut = closure(set); let scenes = '';
    const label = (set.length > 3 ? set.length + ' parts cut' : 'without ' + set.join(',')) + (nc ? ', no comments' : '');
    try {
      const b = py('--without', set.join(','), '-o', file).status === 0 && (!nc || py('--without', set.join(','), '--no-comments', '-o', file).status === 0);
      assert(b, 'lean.py failed');
      new (require('vm').Script)(fs.readFileSync(file, 'utf8'), { filename: file });
      const L = require(file), got = battery(L, cut, label); compared += got;
      const stub = []; const chk = (name, ok, d) => { if (!ok) stub.push(name + (d ? ' (' + d + ')' : '')); };
      if (set.length > 1) { require('./fancy-scenes.js')(FULL, L, chk); assert(stub.length === 0, 'Fancy scenes: ' + stub.join('; ')); scenes = ', 266 Fancy scenes identical'; }   // the 266 scenes through the lean Rast, tri and drawMesh
      if (nc) { const text = fs.readFileSync(file, 'utf8'); assert(text.split('/*').length === 2 && !/^\s*\/\//m.test(text) && text.startsWith('/* sprite-baker ' + FULL.version), 'comments remain or the header is wrong'); }
      sizeOf[label] = fs.statSync(file).size;
      note(true, label + (cut.size > set.length ? ' (also cut: ' + Array.from(cut).filter(p => !set.includes(p)).join(',') + ')' : '') + ': ' + got + ' comparisons' + scenes);
    } catch (e) { note(false, label, String(e.stack || e).slice(0, 700)); }
  }
});
const full = fs.statSync(path.join(dir, 'sprite-baker.js')).size;
const nc = Object.keys(sizeOf).filter(k => /no comments/.test(k)).map(k => sizeOf[k]);
note(nc.length >= 2 && nc.every(s => s < full), 'builds without comments are smaller than the full file (' + nc.join(', ') + ' vs ' + full + ' bytes)');
console.log('sprite-baker lean builds: ' + (cases - bad) + ' of ' + cases + ' pass, ' + compared + ' comparisons, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
