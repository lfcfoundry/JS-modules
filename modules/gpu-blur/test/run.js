/* gpu-blur Node checks (pass or fail only; no timing). Copyright (c) 2026 LFC Foundry. MIT License.
 * Run: node modules/gpu-blur/test/run.js        GPU_BLUR_FILE=/path/to/other-copy.js runs the same checks on another copy (test/mutants.js uses this).
 * Node has no WebGL 2, so the card route is checked in the browsers (tests/gpu-blur-browser.js); here the wasm kernel, the JavaScript twin,
 * the slicing, the route fallbacks and the plain-words rules are checked against an independent brute-force version of the definition. */
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process');
var FILE = process.env.GPU_BLUR_FILE || path.join(__dirname, '..', 'gpu-blur.js');
var pass = 0, fail = 0, skipped = 0;
function ok(c, name) { if (c) { pass++; } else { fail++; console.log('FAIL ' + name); } }
function load(file, noWasm) {
  delete require.cache[require.resolve(file || FILE)];
  return require(file || FILE);
}
var G = load();

function rng(seed) { var s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function picture(w, h, seed, mode) {
  var r = rng(seed), u = new Uint8Array(w * h * 4), i;
  for (i = 0; i < u.length; i += 4) {
    if (mode === 'noise') { u[i] = r() * 256; u[i + 1] = r() * 256; u[i + 2] = r() * 256; u[i + 3] = r() * 256; }
    else { var x = (i / 4) % w, y = ((i / 4) / w) | 0, e = ((x >> 3) + (y >> 3)) & 1; u[i] = x * 255 / w; u[i + 1] = e ? 220 : 40; u[i + 2] = y * 255 / h; u[i + 3] = 160 + ((r() * 90) | 0); }
  }
  return u;
}
function same(a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
function firstDiff(a, b) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return i; return -1; }

// The definition, written the slow plain way: three box passes along x, then three along y, edges repeat the border, whole-number sums, round half up.
function oracle(px, w, h, radius) {
  var b = G.boxHalf(radius), n = 2 * b + 1, cur = new Uint8Array(px.subarray(0, w * h * 4)), k;
  function pass(src, horiz) {
    var out = new Uint8Array(src.length), x, y, c, t;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) for (c = 0; c < 4; c++) {
      var sum = 0;
      for (t = -b; t <= b; t++) {
        var xx = horiz ? Math.min(w - 1, Math.max(0, x + t)) : x, yy = horiz ? y : Math.min(h - 1, Math.max(0, y + t));
        sum += src[(yy * w + xx) * 4 + c];
      }
      out[(y * w + x) * 4 + c] = Math.floor((sum + b) / n);
    }
    return out;
  }
  for (k = 0; k < 3; k++) cur = pass(cur, true);
  for (k = 0; k < 3; k++) cur = pass(cur, false);
  return cur;
}

(async function () {
  var info = await G.ready();
  ok(info.wasm === true && info.wasmState === 'ready', 'wasm compiles and passes its own self-test');
  ok(info.webgl2 === false && info.canvasRoute === 'wasm' && info.pixelsRoute === 'wasm', 'no card in Node: drawn pictures and pixels both take wasm');

  // ---- boxHalf
  ok(G.boxHalf(0) === 0 && G.boxHalf(-3) === 0 && G.boxHalf(NaN) === 0, 'radius 0, negative or NaN means no blur');
  ok(G.boxHalf(12) === 6 && G.boxHalf(1) === 1 && G.boxHalf(100) === 50 && G.boxHalf(1000) === 50, 'box half widths: 12 -> 6, 1 -> 1, 100 -> 50, larger radii stop at 100');

  // ---- wasm = JavaScript twin = brute-force definition, byte for byte
  var sizes = [[1, 1], [1, 9], [9, 1], [2, 2], [5, 7], [16, 16], [17, 3], [33, 18], [40, 25], [64, 48], [37, 21], [129, 70], [300, 7]], radii = [0, 1, 2, 3, 5, 8, 12, 25, 60, 100], bad = 0, n = 0;
  sizes.forEach(function (sz, si) {
    radii.forEach(function (r, ri) {
      var px = picture(sz[0], sz[1], 100 + si * 17 + ri, (si + ri) % 3 === 0 ? 'noise' : 'art');
      var ref = oracle(px, sz[0], sz[1], r), js = G.blurSync(px, sz[0], sz[1], r, { out: 'pixels', route: 'js' }), wa = G.blurSync(px, sz[0], sz[1], r, { out: 'pixels', route: 'wasm' });
      n++;
      if (js.route !== 'js' || wa.route !== 'wasm' || !same(ref, js.pixels) || !same(ref, wa.pixels)) { bad++; if (bad < 4) console.log('  differs at ' + sz + ' radius ' + r + ' js@' + firstDiff(ref, js.pixels) + ' wasm@' + firstDiff(ref, wa.pixels) + ' routes ' + js.route + '/' + wa.route); }
    });
  });
  ok(bad === 0, 'wasm and JavaScript both equal the brute-force definition in ' + n + ' size and radius cases (' + bad + ' differ)');

  // ---- larger pictures: twin test on 640 x 360 at three radii, sync and sliced
  var big = picture(640, 360, 5, 'art'), bigOk = true;
  for (var rr of [4, 12, 40]) {
    var a = G.blurSync(big, 640, 360, rr, { out: 'pixels', route: 'js' }).pixels, b = G.blurSync(big, 640, 360, rr, { out: 'pixels', route: 'wasm' }).pixels;
    var c = (await G.blur(big, 640, 360, rr, { out: 'pixels', route: 'wasm', budget: 0.05 })).pixels, d = (await G.blur(big, 640, 360, rr, { out: 'pixels', route: 'js', budget: 0.05 })).pixels;
    if (!same(a, b) || !same(a, c) || !same(a, d)) bigOk = false;
  }
  ok(bigOk, '640 x 360 at radius 4, 12 and 40: wasm, JavaScript, sliced wasm and sliced JavaScript give the same bytes');

  // ---- properties
  var flat = new Uint8Array(50 * 30 * 4).fill(123), fl = G.blurSync(flat, 50, 30, 20, { out: 'pixels' }).pixels;
  ok(fl.every(function (v) { return v === 123; }), 'a flat picture stays flat (edges repeat the border, nothing darkens)');
  var pic = picture(40, 30, 9, 'noise'), id = G.blurSync(pic, 40, 30, 0, { out: 'pixels' }).pixels;
  ok(same(id, pic), 'radius 0 returns the picture unchanged');
  var imp = new Uint8Array(41 * 41 * 4); imp[(20 * 41 + 20) * 4] = 255; imp[(20 * 41 + 20) * 4 + 3] = 255;
  var ib = G.blurSync(imp, 41, 41, 8, { out: 'pixels' }).pixels, symOk = true, mid = ib[(20 * 41 + 20) * 4], x, y;
  for (y = 0; y < 41; y++) for (x = 0; x < 41; x++) if (ib[(y * 41 + x) * 4] !== ib[(y * 41 + (40 - x)) * 4] || ib[(y * 41 + x) * 4] !== ib[((40 - y) * 41 + x) * 4]) symOk = false;
  ok(symOk && mid > 0 && mid < 255 && ib[(20 * 41 + 20) * 4] >= ib[(20 * 41 + 24) * 4], 'a single bright dot spreads into a symmetric bell, brightest in the middle');
  var ch = picture(30, 20, 3, 'noise'); var ch2 = new Uint8Array(ch); for (var i = 3; i < ch2.length; i += 4) ch2[i] = 0;
  var b1 = G.blurSync(ch, 30, 20, 6, { out: 'pixels' }).pixels, b2 = G.blurSync(ch2, 30, 20, 6, { out: 'pixels' }).pixels, indep = true;
  for (i = 0; i < b1.length; i++) if ((i & 3) !== 3 && b1[i] !== b2[i]) indep = false;
  ok(indep, 'the four channels are blurred separately (changing alpha does not change red, green or blue)');

  // ---- how close to a true Gaussian (25 taps, sigma = radius / 2, the lab's picture): mean difference stays near the measured 1.7 of 255
  (function () {
    var w = 240, h = 135, px = new Uint8Array(w * h * 4), r = 12, rg = rng(3), s = r / 2, k = [], sum = 0, t;
    for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) { var ii = (yy * w + xx) * 4, edge = ((xx >> 5) + (yy >> 5)) & 1; px[ii] = xx * 255 / w; px[ii + 1] = edge ? 220 : 40; px[ii + 2] = yy * 255 / h; px[ii + 3] = 160 + ((rg() * 90) | 0); }
    for (t = -r; t <= r; t++) { k.push(Math.exp(-t * t / (2 * s * s))); sum += k[k.length - 1]; } k = k.map(function (v) { return v / sum; });
    var tmp = new Uint8Array(px.length), out = new Uint8Array(px.length), x, y, c;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) for (c = 0; c < 4; c++) { var a = 0; for (t = -r; t <= r; t++) a += px[(y * w + Math.min(w - 1, Math.max(0, x + t))) * 4 + c] * k[t + r]; tmp[(y * w + x) * 4 + c] = a + 0.5; }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) for (c = 0; c < 4; c++) { var a2 = 0; for (t = -r; t <= r; t++) a2 += tmp[(Math.min(h - 1, Math.max(0, y + t)) * w + x) * 4 + c] * k[t + r]; out[(y * w + x) * 4 + c] = a2 + 0.5; }
    var got = G.blurSync(px, w, h, r, { out: 'pixels' }).pixels, d = 0, mx = 0;
    for (var q = 0; q < got.length; q++) { var e = Math.abs(got[q] - out[q]); d += e; if (e > mx) mx = e; }
    var mean = d / got.length;
    console.log('  info: against the 25-tap Gaussian on a ' + w + ' x ' + h + ' test picture, radius 12: mean difference ' + mean.toFixed(2) + ' of 255, largest ' + mx);
    ok(mean < 2.5 && mx < 20, 'the box blur stays a close Gaussian on the lab picture (mean difference ' + mean.toFixed(2) + ' of 255)');
  })();

  // ---- input kinds and errors
  var cl = new Uint8ClampedArray(picture(20, 10, 1, 'art')), r1 = G.blurSync(cl, 20, 10, 4, { out: 'pixels' }).pixels, r2 = G.blurSync(new Uint8Array(cl), 20, 10, 4, { out: 'pixels' }).pixels;
  ok(same(r1, r2) && r1 instanceof Uint8ClampedArray, 'Uint8ClampedArray and Uint8Array give the same bytes; pixels come back as a Uint8ClampedArray');
  var sub = new Uint8Array(new ArrayBuffer(20 * 10 * 4 + 40), 40, 20 * 10 * 4); sub.set(cl);
  ok(same(G.blurSync(sub, 20, 10, 4, { out: 'pixels' }).pixels, r2), 'a view with an offset into a larger buffer works');
  var rejected = 0, tests = [
    function () { return G.blur(new Uint8Array(10), 4, 4, 3); }, function () { return G.blur(null, 4, 4, 3); }, function () { return G.blur(new Uint8Array(64), 0, 4, 3); },
    function () { return G.blur(new Uint8Array(64), 4.5, 4, 3); }, function () { return G.blur(new Uint8Array(64), 4, 4, 3, { out: 'banana' }); }, function () { return G.blur(new Uint8Array(64), 4, 4, 3, { out: 'texture' }); },
    function () { return G.blur({ width: 8, height: 8 }, 4, 4, 3); }];
  for (var ti = 0; ti < tests.length; ti++) { try { await tests[ti](); } catch (e) { rejected++; } }
  ok(rejected === tests.length, 'bad input is rejected with an error, never a wrong picture (' + rejected + ' of ' + tests.length + ')');
  var syncThrew = 0; try { G.blurSync(new Uint8Array(10), 4, 4, 3); } catch (e) { syncThrew++; } try { G.blurSync(new Uint8Array(64), 4, 4, 3, { out: 'texture' }); } catch (e) { syncThrew++; }
  ok(syncThrew === 2, 'blurSync throws on bad input');
  var tooBig = 0; try { G.blurSync(new Uint8Array(16), 8193, 4097, 3); } catch (e) { tooBig++; }
  ok(tooBig === 1, 'a picture over 33,554,432 pixels is refused before anything is allocated');

  // ---- route fallbacks: an unavailable route gives way to the next one and result.route says which one ran
  var f1 = G.blurSync(pic, 40, 30, 5, { out: 'pixels', route: 'webgl2' }), f2 = await G.blur(pic, 40, 30, 5, { out: 'canvas', route: 'webgl2', into: null }).then(function (r) { return r; }, function (e) { return { err: e }; });
  ok(f1.route === 'wasm' && same(f1.pixels, G.blurSync(pic, 40, 30, 5, { out: 'pixels', route: 'js' }).pixels), 'route webgl2 with no card gives way to wasm, same bytes');
  ok(f2.err && /canvas/.test(f2.err.message) || f2.route === 'wasm' || f2.route === 'js', 'a drawn-canvas request with nothing to draw into says so instead of returning nothing');
  var savedWA = global.WebAssembly; global.WebAssembly = undefined;       // a browser without WebAssembly
  var Gno = load(), infoNo = await Gno.ready();
  var rNo = await Gno.blur(pic, 40, 30, 5, { out: 'pixels' }), rNoSync = Gno.blurSync(pic, 40, 30, 5, { out: 'pixels' });
  global.WebAssembly = savedWA;
  ok(infoNo.wasm === false && infoNo.wasmState === 'failed' && rNo.route === 'js' && rNoSync.route === 'js' && same(rNo.pixels, G.blurSync(pic, 40, 30, 5, { out: 'pixels', route: 'js' }).pixels), 'with no WebAssembly the plain JavaScript route runs and gives the same bytes');
  var Gjs = load(), rjs = await Gjs.blur(pic, 40, 30, 5, { out: 'pixels', route: 'js' });
  ok(rjs.route === 'js', 'route js is honored when wasm is available');
  // a corrupted wasm copy must not be trusted: the module compiles it, the self-test sees different bytes and the route falls back to JavaScript
  var src = fs.readFileSync(FILE, 'utf8'), m = src.match(/\/\*WASM:BEGIN\*\/'([^']*)'\/\*WASM:END\*\//);
  if (m) {
    var wb = Buffer.from(m[1], 'base64'), off = wb.indexOf(Buffer.from([0x20, 0x0b])) >= 0 ? wb.length - 40 : wb.length - 40; wb[off] ^= 0x55;
    var tmpf = path.join(require('os').tmpdir(), 'gpu-blur-corrupt-' + process.pid + '.js');
    fs.writeFileSync(tmpf, src.replace(m[1], wb.toString('base64')));
    var Gc = load(tmpf), ic = await Gc.ready(), rc = await Gc.blur(pic, 40, 30, 5, { out: 'pixels' });
    ok(ic.wasm === false && rc.route === 'js' && same(rc.pixels, G.blurSync(pic, 40, 30, 5, { out: 'pixels', route: 'js' }).pixels), 'a damaged wasm file is refused by the self-test and the JavaScript route answers with the right bytes');
    fs.unlinkSync(tmpf);
  } else { ok(false, 'the wasm base64 markers are in the file'); }

  // ---- slicing: a big job must be cut into many short tasks, not run in one block
  var realSI = global.setImmediate, turns = 0;
  global.setImmediate = function (f) { turns++; return realSI(f); };
  var mid1 = picture(400, 300, 2, 'art'), sl = await Gjs.blur(mid1, 400, 300, 12, { out: 'pixels', route: 'wasm', budget: 0.05 });
  var turnsWasm = turns; turns = 0;
  var sl2 = await Gjs.blur(mid1, 400, 300, 12, { out: 'pixels', route: 'js', budget: 0.05 });
  var turnsJs = turns; turns = 0;
  global.setImmediate = realSI;
  ok(turnsWasm >= 10 && turnsJs >= 10 && same(sl.pixels, sl2.pixels), 'a 400 x 300 job is cut into many tasks (wasm ' + turnsWasm + ' yields, JavaScript ' + turnsJs + ') and the bytes do not change');

  // ---- two jobs in flight at once do not share memory
  var pa = picture(120, 90, 11, 'noise'), pb = picture(120, 90, 12, 'art');
  var both = await Promise.all([Gjs.blur(pa, 120, 90, 9, { out: 'pixels', route: 'wasm', budget: 0.05 }), Gjs.blur(pb, 120, 90, 3, { out: 'pixels', route: 'wasm', budget: 0.05 }), Gjs.blur(pa, 120, 90, 9, { out: 'pixels', route: 'wasm' })]);
  ok(same(both[0].pixels, G.blurSync(pa, 120, 90, 9, { out: 'pixels', route: 'js' }).pixels) && same(both[1].pixels, G.blurSync(pb, 120, 90, 3, { out: 'pixels', route: 'js' }).pixels) && same(both[2].pixels, both[0].pixels), 'three wasm jobs in flight at once each get their own right answer');

  // ---- reference() and release()
  ok(same(G.reference(pic, 40, 30, 5), G.blurSync(pic, 40, 30, 5, { out: 'pixels', route: 'js' }).pixels), 'reference() is the plain JavaScript result');
  G.release(); var after = await G.blur(pic, 40, 30, 5, { out: 'pixels' });
  ok(after.route === 'wasm' && same(after.pixels, G.reference(pic, 40, 30, 5)), 'after release() the next call starts again by itself');

  // ---- the page-policy rules: nothing here needs eval, a blob address or a worker
  var code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
  ok(!/\beval\s*\(|new\s+Function|createObjectURL|\bBlob\b|\bWorker\b|importScripts|import\s*\(/.test(code), 'no eval, new Function, blob address, Blob or Worker in the code (only wasm-unsafe-eval is needed)');
  ok(!/\bsetInterval\b|document\.write|innerHTML|localStorage|fetch\s*\(|XMLHttpRequest/.test(code), 'no timers left running, no storage, no network');
  ok(!/navigator\.(userAgent|vendor|platform)|userAgent|\bsafari\b|\bchrome\b|\bfirefox\b/i.test(code), 'the code never looks at a browser name');
  ok(/Version 1\.0\.0 \(API 1\)/.test(src.slice(0, 1800)) && /var VERSION = '1\.0\.0'/.test(src), 'the header and the code say the same version');

  // ---- the wasm source rebuilds to the shipped bytes (needs clang with the wasm32 target; skipped, and counted as skipped, where it is missing)
  var have = cp.spawnSync('clang', ['--version']);
  if (!process.env.GPU_BLUR_FILE && have.status === 0) {
    var chk = cp.spawnSync('sh', [path.join(__dirname, '..', 'wasm', 'build.sh'), '--check']);
    ok(chk.status === 0, 'wasm/build.sh --check: blur.wasm is byte for byte what blur.c builds');
    var emb = cp.spawnSync('python3', [path.join(__dirname, '..', 'wasm', 'embed.py'), '--check']);
    ok(emb.status === 0, 'wasm/embed.py --check: gpu-blur.js carries the current blur.wasm');
  } else { skipped += 2; console.log('  skipped: rebuild check (' + (process.env.GPU_BLUR_FILE ? 'checking another copy' : 'no clang') + ')'); }

  console.log('gpu-blur: ' + pass + ' passed, ' + fail + ' failed' + (skipped ? ', ' + skipped + ' skipped' : ''));
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
