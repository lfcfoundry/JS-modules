/* gpu-blur fuzz round: random calls through tools/fuzz-kit's seeded engine, every answer compared with a brute-force version of the definition.
 * Copyright (c) 2026 LFC Foundry. MIT License. Run: node modules/gpu-blur/test/fuzz.js [seeds=24] [ops=120]
 * Operations: a blur through a random way / source kind / result kind / slice budget, three blurs in flight at once, blurSync, release() between calls, bad arguments.
 * A throw or a wrong byte is a finding; a failing seed is cut down by the engine's shrinker and printed. Node has no WebGL 2, so route 'webgl2' must give way to wasm. */
'use strict';
var path = require('path');
var Fuzzer = require(path.join(__dirname, '..', '..', '..', 'tools', 'fuzz-kit', 'src', 'fuzz-core.js'));
var G = require(path.join(__dirname, '..', 'gpu-blur.js'));
var nSeeds = +process.argv[2] || 24, nOps = +process.argv[3] || 120;

function oracle(px, w, h, radius) {
  var b = G.boxHalf(radius), n = 2 * b + 1, cur = new Uint8Array(px.subarray(0, w * h * 4)), k;
  function pass(src, horiz) {
    var out = new Uint8Array(src.length), x, y, c, t;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) for (c = 0; c < 4; c++) {
      var sum = 0;
      for (t = -b; t <= b; t++) { var xx = horiz ? Math.min(w - 1, Math.max(0, x + t)) : x, yy = horiz ? y : Math.min(h - 1, Math.max(0, y + t)); sum += src[(yy * w + xx) * 4 + c]; }
      out[(y * w + x) * 4 + c] = Math.floor((sum + b) / n);
    }
    return out;
  }
  for (k = 0; k < 3; k++) cur = pass(cur, true);
  for (k = 0; k < 3; k++) cur = pass(cur, false);
  return cur;
}
function params(c) {
  var w = 1 + c.int(c.chance(0.15) ? 70 : 28), h = 1 + c.int(c.chance(0.15) ? 70 : 28), px = new Uint8Array(w * h * 4), i, flat = c.chance(0.15);
  for (i = 0; i < px.length; i++) px[i] = flat ? 200 : c.int(256);
  var kind = c.pick(['bytes', 'clamped', 'view', 'imageData']), src = px;
  if (kind === 'clamped') src = new Uint8ClampedArray(px);
  if (kind === 'view') { var big = new Uint8Array(px.length + 64); big.set(px, 32); src = big.subarray(32, 32 + px.length); }
  if (kind === 'imageData' && typeof ImageData !== 'undefined') src = new ImageData(new Uint8ClampedArray(px), w, h);
  var radius = c.pick([0, 1, 2, 3, 5, 8, 12, 25, 40, 100, 150, 0.4, 2.5, 7.9]);
  return { w: w, h: h, px: px, src: src, radius: radius, opts: { out: 'pixels', route: c.pick(['auto', 'auto', 'wasm', 'js', 'webgl2']), budget: c.pick([undefined, 0.01, 0.5, 3, 50]) } };
}
function same(a, b, what) { if (a.length !== b.length) throw new Error(what + ': length ' + a.length + ' against ' + b.length); for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) throw new Error(what + ': byte ' + i + ' is ' + a[i] + ', expected ' + b[i]); }
function pre(p) { return p.w * p.h <= 2500 ? oracle(p.px, p.w, p.h, p.radius) : G.reference(p.px, p.w, p.h, p.radius); }

function cfgFor(seed) {
  return {
    seed: seed,
    ops: [
      { name: 'blur', weight: 6, run: function (c) { var p = params(c), r = await_(G.blur(p.src, p.w, p.h, p.radius, p.opts)); return r.then(function (res) { if (res.route === 'webgl2') throw new Error('Node has no WebGL 2 but the route says webgl2'); if (p.opts.route === 'js' && res.route !== 'js') throw new Error('route js was not honored'); same(res.pixels, pre(p), 'blur ' + p.w + 'x' + p.h + ' r' + p.radius + ' ' + JSON.stringify(p.opts) + ' via ' + res.route); }); } },
      { name: 'three in flight', weight: 3, run: function (c) { var ps = [params(c), params(c), params(c)]; return Promise.all(ps.map(function (p) { return G.blur(p.src, p.w, p.h, p.radius, p.opts); })).then(function (rs) { rs.forEach(function (res, i) { same(res.pixels, pre(ps[i]), 'in flight #' + i + ' via ' + res.route); }); }); } },
      { name: 'blurSync', weight: 3, run: function (c) { var p = params(c), res = G.blurSync(p.src, p.w, p.h, p.radius, p.opts); same(res.pixels, pre(p), 'blurSync ' + p.w + 'x' + p.h + ' r' + p.radius + ' via ' + res.route); } },
      { name: 'release', weight: 1, run: function () { G.release(); } },
      { name: 'ready', weight: 1, run: function () { return G.ready().then(function (i) { if (i.webgl2) throw new Error('Node has no WebGL 2'); }); } },
      { name: 'bad input', weight: 2, run: function (c) {
        var bad = c.pick([function () { return G.blur(new Uint8Array(c.int(30)), 4, 4, 3); }, function () { return G.blur(null, 4, 4, 3); }, function () { return G.blur(new Uint8Array(64), -1, 4, 3); }, function () { return G.blur(new Uint8Array(64), 4, 4, 3, { out: 'nope' }); }, function () { return G.blur('picture', 4, 4, 3); }]);
        return bad().then(function () { throw new Error('bad input was accepted'); }, function () { /* rejected: right */ });
      } },
      { name: 'reference', weight: 1, run: function (c) { var p = params(c); same(G.reference(p.px, p.w, p.h, p.radius), pre(p), 'reference'); } }
    ],
    invariants: [function () { var i = G.info(); return i.webgl2 ? 'Node reports a card' : ''; }],
    errors: false
  };
}
function await_(x) { return x; }

(async function () {
  var failed = 0, total = 0;
  for (var seed = 1; seed <= nSeeds; seed++) {
    var f = new Fuzzer(cfgFor(seed)), r = await f.run(nOps, { record: true });
    total += r.ops;
    if (r.fails.length) {
      failed++;
      console.log('seed ' + seed + ' FAILED: ' + r.fails.map(function (x) { return x.op + ': ' + x.what; }).join(' | '));
      var s = await Fuzzer.shrink(function () { return new Fuzzer(cfgFor(seed)); }, r.script, { maxTries: 150, maxMs: 15000 });
      console.log('  shortest script: ' + JSON.stringify(s.script) + ' -> ' + (s.finding && (s.finding.what || s.finding)));
    }
  }
  console.log('gpu-blur fuzz: ' + nSeeds + ' seeds, ' + total + ' operations, ' + failed + ' failing seeds');
  process.exit(failed ? 1 : 0);
})().catch(function (e) { console.log('CRASH ' + (e && e.stack || e)); process.exit(2); });
