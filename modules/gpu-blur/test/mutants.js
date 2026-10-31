/* gpu-blur: do the checks catch a broken copy? Each mutant below is gpu-blur.js with one deliberate bug; test/run.js must fail on every one of them.
 * Copyright (c) 2026 LFC Foundry. MIT License. Run: node modules/gpu-blur/test/mutants.js   (the wasm mutant needs clang; it is skipped without it) */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
var root = path.join(__dirname, '..'), src = fs.readFileSync(path.join(root, 'gpu-blur.js'), 'utf8'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gpu-blur-mut-'));
function once(s, a, b) { if (s.split(a).length !== 2) throw new Error('mutation target not found exactly once: ' + a); return s.replace(a, function () { return b; }); }
var mutants = [
  ['JavaScript box divides by 2b instead of 2b+1', function (s) { return once(s, 'var inv = 1 / (2 * b + 1);', 'var inv = 1 / (2 * b);'); }],
  ['JavaScript box does not clamp the right edge', function (s) { return once(s, 'a = x + b + 1; if (a > n - 1) a = n - 1;', 'a = x + b + 1;'); }],
  ['JavaScript box truncates instead of rounding', function (s) { return once(s, '((sum + b + 0.5) * inv) | 0', '(sum * inv) | 0'); }],
  ['the last partial column strip is skipped', function (s) { return once(s, 'Math.ceil(w / STRIP), STRIP * h', 'Math.floor(w / STRIP), STRIP * h'); }],
  ['route js is ignored (wasm always tried first)', function (s) { return once(s, "if (forced === 'js') return ['js'];", "if (forced === 'js') return ['wasm', 'js'];"); }],
  ['the slicer never yields (runs the whole job in one block)', function (s) { return once(s, 'if (pi < phases.length && now() - t0 + dt >= budget) break;', ''); }]
];
var haveClang = cp.spawnSync('clang', ['--version']).status === 0;
if (haveClang) mutants.push(['the wasm kernel starts each box with b instead of b+1 copies of the first pixel', function (s) {
  var c = once(fs.readFileSync(path.join(root, 'wasm', 'blur.c'), 'utf8'), 'wasm_i16x8_mul(ldpair(r0, r1), wasm_i16x8_splat(b + 1));', 'wasm_i16x8_mul(ldpair(r0, r1), wasm_i16x8_splat(b));');
  var cf = path.join(tmp, 'blur.c'), wf = path.join(tmp, 'blur.wasm'); fs.writeFileSync(cf, c);
  var flags = fs.readFileSync(path.join(root, 'wasm', 'build.sh'), 'utf8').match(/FLAGS="([^"]*)"/)[1].split(' ');
  var r = cp.spawnSync('clang', flags.concat(['-o', wf, cf])); if (r.status !== 0) throw new Error('mutant build failed: ' + r.stderr);
  var m = s.match(/\/\*WASM:BEGIN\*\/'([^']*)'/); return s.replace(m[1], fs.readFileSync(wf).toString('base64'));
}]);
var survived = 0;
mutants.forEach(function (m, i) {
  var f = path.join(tmp, 'mut' + i + '.js'); fs.writeFileSync(f, m[1](src));
  var r = cp.spawnSync(process.execPath, [path.join(__dirname, 'run.js')], { env: Object.assign({}, process.env, { GPU_BLUR_FILE: f }), encoding: 'utf8' });
  var failed = (r.stdout.match(/^FAIL /gm) || []).length, line = r.stdout.split('\n').filter(function (l) { return /^gpu-blur:/.test(l); })[0] || ('exit ' + r.status);
  var caught = r.status !== 0;
  if (!caught) survived++;
  console.log((caught ? 'caught   ' : 'SURVIVED ') + m[0] + ' (' + (failed ? failed + ' checks failed' : line) + ')');
});
fs.rmSync(tmp, { recursive: true, force: true });
console.log('gpu-blur mutants: ' + (mutants.length - survived) + ' of ' + mutants.length + ' caught' + (haveClang ? '' : ' (wasm mutant skipped: no clang)'));
process.exit(survived ? 1 : 0);
