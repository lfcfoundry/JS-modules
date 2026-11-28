// Builds the two smaller files next to memory-compression.js. Copyright (c) 2026 LFC Foundry. MIT License.
//   memory-compression.min.js       the full file, minified (same API, same bytes)
//   memory-compression-read.min.js  opens packed data only (unpack, unpackAsync, view); every part the decoding never runs is replaced by a throw
// Run after every change to memory-compression.js (test/min.js fails when the files carry an older version):
//   node modules/memory-compression/min/build.js
// Needs clang (wasm32 target) with wasm-ld, esbuild, terser and acorn; found through NODE_PATH or MC_MIN_ESBUILD (the esbuild program), MC_MIN_TERSER (the terser program) and MC_MIN_ACORN (the acorn folder). They are used only here, never shipped.
// About 3 to 4 minutes: it packs a broad corpus, records which functions decoding it runs (V8 coverage, with and without WebAssembly), strips the rest, swaps in WebAssembly with only the decoding functions, then runs held-out checks.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const dir = path.resolve(__dirname, '..'), here = __dirname;
const reg = JSON.parse(fs.readFileSync(path.resolve(dir, '../../modules.json'), 'utf8')), entry = (reg.modules || reg).filter((m) => m.id === 'memory-compression')[0];
const V = entry.version, API = entry.api;
function find(name, envName) {
  if (process.env[envName]) return process.env[envName];
  try { return path.dirname(require.resolve(name + '/package.json')); } catch (e) { console.error('min/build.js needs ' + name + ' (npm i ' + name + ', then NODE_PATH=... or ' + envName + '=...)'); process.exit(2); }
}
const esbuild = process.env.MC_MIN_ESBUILD || path.join(find('esbuild', 'MC_MIN_ESBUILD_DIR'), 'bin', 'esbuild'), acorn = find('acorn', 'MC_MIN_ACORN');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-min-'));
const env = Object.assign({}, process.env, { MC_MIN_TMP: tmp, MC_MIN_ACORN: acorn });
const run = (args) => { const r = cp.spawnSync(process.execPath, args, { cwd: here, env, encoding: 'utf8', maxBuffer: 1 << 26 }); if (r.status !== 0) { console.error((r.stdout || '') + (r.stderr || '')); process.exit(1); } return (r.stdout + r.stderr).trim(); };
const terser = process.env.MC_MIN_TERSER || path.join(find('terser', 'MC_MIN_TERSER_DIR'), 'bin', 'terser');
// esbuild, then one light terser pass with exactly these settings: stronger ones (passes=2, inlining) made Chromium's warm open up to 1.29x slower. ascii_only is required (without it terser writes characters above U+00FF literally)
const TERSER = ['-c', 'passes=1,inline=false,reduce_funcs=false,reduce_vars=false,collapse_vars=false', '-m', '--format', 'ascii_only=true', '--comments', '/Copyright|License|Version|sha256/i'];
const mini = (file) => {
  const e = cp.execFileSync(esbuild, [file, '--minify', '--target=es2017', '--legal-comments=none', '--charset=ascii', '--log-level=warning'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return cp.execFileSync(process.execPath, [terser].concat(TERSER), { input: e, encoding: 'utf8', maxBuffer: 1 << 26 }).replace(/\n$/, '') + '\n';
};
const t0 = Date.now();
// 1. the full file, minified
const src = fs.readFileSync(path.join(dir, 'memory-compression.js'), 'utf8'), srcId = require('crypto').createHash('sha256').update(src).digest('hex').slice(0, 16);   // test/min.js compares this with the readable file, so a stale build fails
const fullMin = '/*! memory-compression.js, minified. Version ' + V + ' (API ' + API + '). Keep big data packed in memory and bring it back exactly. Part of JS-modules, https://github.com/lfcfoundry/JS-modules. Copyright (c) 2026 LFC Foundry. MIT License. Readable source with the full guide: memory-compression.js (same version). Source ' + srcId + '. */\n' + mini(path.join(dir, 'memory-compression.js'));
// 2-4. the read-only file: no generated code, corpus, coverage, strip
const a = "  var CAN_EVAL = (function () { if (evalForbidden()) return false; try { return new Function('return 1')() === 1; } catch (e) { return false; } })();";
if (src.indexOf(a) < 0) { console.error('min/build.js: the CAN_EVAL line changed; update the line in min/build.js'); process.exit(1); }
fs.writeFileSync(path.join(tmp, 'lib.js'), src.replace(a, '  var CAN_EVAL = false;'));
console.log(run(['pack.js'])); run(['work2.js', 'wasm']); run(['work2.js', 'nowasm']); console.log(run(['strip3.js']));
// 5. smaller WebAssembly for the read-only file: the same C sources with only the decoding functions exported (same flags as wasm/build.sh and wasm/jso/build.sh)
const clang = process.env.MC_MIN_CLANG || 'clang', W = path.join(dir, 'wasm');
const cc = (args) => { const r = cp.spawnSync(clang, args, { encoding: 'utf8' }); if (r.status !== 0) { console.error('min/build.js needs clang with the wasm32 target and wasm-ld (MC_MIN_CLANG=...): ' + (r.stderr || r.error)); process.exit(2); } };
const ex = (names) => names.map((n) => '-Wl,--export=' + n);
cc(['--target=wasm32', '-O3', '-msimd128', '-mbulk-memory', '-nostdlib', '-fno-builtin-memcpy', '-ffreestanding', '-Wl,--no-entry'].concat(ex(['__heap_base', 'lz4_decode', 'unshuffle', 'undelta_planes', 'inflate_raw']), ['-Wl,--initial-memory=4194304', '-Wl,--max-memory=2147483648', '-Wl,-z,stack-size=8192', '-Wl,--strip-all', '-Wl,--global-base=1024', '-o', path.join(tmp, 'core-read.wasm'), path.join(W, 'memory-compression.c')]));
cc(['--target=wasm32', '-O3', '-nostdlib', '-ffreestanding', '-fno-builtin', '-ffp-contract=off', '-Wl,--no-entry'].concat(ex(['__heap_base', 'fsst_tbl', 'fsst_init', 'fsst_decode_col', 'rans_dec', 'planes_join', 'bp_unpack', 'delta_dec']), ['-Wl,--initial-memory=1048576', '-Wl,--max-memory=1073741824', '-Wl,-z,stack-size=4096', '-Wl,--strip-all', '-Wl,--global-base=1024', '-o', path.join(tmp, 'jso-read.wasm'), path.join(W, 'jso', 'jso-kernels.c')]));
let ro = fs.readFileSync(path.join(tmp, 'ro.js'), 'utf8');
for (const [full, small] of [[path.join(W, 'memory-compression.wasm'), 'core-read.wasm'], [path.join(W, 'jso', 'jso-kernels.wasm'), 'jso-read.wasm']]) {
  const a64 = fs.readFileSync(full).toString('base64'), b64 = fs.readFileSync(path.join(tmp, small)).toString('base64');
  if (ro.split(a64).length !== 2) { console.error('min/build.js: the embedded ' + path.basename(full) + ' is not in memory-compression.js exactly once (rebuild the wasm and the module first)'); process.exit(1); }
  ro = ro.replace(a64, b64);
}
fs.writeFileSync(path.join(tmp, 'ro.js'), ro);
const roMin = '/*! memory-compression read-only build, minified. Version ' + V + ' (API ' + API + '). Opens packed data (unpack, unpackAsync, view); it cannot pack. Needs no generated code. Part of JS-modules, https://github.com/lfcfoundry/JS-modules. Copyright (c) 2026 LFC Foundry. MIT License. Full file: memory-compression.js (same version). Source ' + srcId + '. */\n' + mini(path.join(tmp, 'ro.js'));
fs.writeFileSync(path.join(tmp, 'ro.min.js'), roMin);
// 6. held-out checks on the read-only file, with generated code allowed and forbidden
for (const m of ['eval', 'noeval']) { const out = run(['verify.js', m]), j = JSON.parse(out.split('\n').pop()); if (j.bad) { console.error('held-out checks failed (' + m + '): ' + out); process.exit(1); } console.log('held-out checks (' + m + '): ' + j.ok + ' passed'); }
fs.writeFileSync(path.join(dir, 'memory-compression.min.js'), fullMin);
fs.writeFileSync(path.join(dir, 'memory-compression-read.min.js'), roMin);
fs.rmSync(tmp, { recursive: true, force: true });
const gz = (t) => require('zlib').gzipSync(t, { level: 9 }).length;
console.log('memory-compression ' + V + ': readable ' + src.length + ' B (' + gz(src) + ' gzipped), min ' + fullMin.length + ' B (' + gz(fullMin) + '), read-only ' + roMin.length + ' B (' + gz(roMin) + '), ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
