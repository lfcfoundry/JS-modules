// node mem-one.mjs CONTENDER MODE   (one fresh process per run): decodes a 4,000,000-number file and prints the process memory it needed.
import fs from 'fs'; import { createRequire } from 'module'; import { rawWasm, numcodecs } from './contenders.mjs';
const require = createRequire(import.meta.url), [, , which, mode] = process.argv, N = 4000000;
const arr = new Float64Array(N); let v = 100, s = 1; for (let i = 0; i < N; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; v += Math.round(((s / 4294967296) - 0.5) * 20) / 100; arr[i] = v; }
const refPath = '/tmp/claude-0/pcm/work/mem4m.pco';
if (!fs.existsSync(refPath)) { const K = require('/tmp/claude-0/pcm/mod/pcodec-js-pack.js'); const pk = await K.load(); fs.writeFileSync(refPath, pk.pack(arr)); }
const packed = new Uint8Array(fs.readFileSync(refPath)); global.gc && gc();
const base = process.memoryUsage();
let wasmMem = 0, ok = false, t = performance.now(), peak0 = process.resourceUsage().maxRSS;
if (which === 'ours') { const A = await rawWasm('ours', '/tmp/claude-0/pcm/work/wasm/ours-1.0.wasm'); t = performance.now(); const r = A.decompress('f64', packed, N); ok = r[N - 1] === arr[N - 1]; wasmMem = A.memBytes(); }
else if (which === 'nc') { const B = await numcodecs(), f = '/tmp/claude-0/pcm/work/mem4m.nc'; if (!fs.existsSync(f)) { fs.writeFileSync(f, B.compress('f64', arr, 8)); console.log('wrote nc file; run again'); process.exit(0); } const nb = new Uint8Array(fs.readFileSync(f)); t = performance.now(); const r = B.decompress('f64', nb, N); ok = r[N - 1] === arr[N - 1]; }
else { const R = require('/tmp/claude-0/pcm/mod/pcodec-js.js'), pc = await R.load({ program: 'fast' }); t = performance.now();
  if (mode === 'stream') { let n = 0, last = 0; for (const part of pc.stream(packed)) { n += part.length; last = part[part.length - 1]; } ok = n === N && last === arr[N - 1]; }
  else { const r = pc.unpack(packed, mode === 'view' ? { view: true } : mode === 'into' ? { into: new Float64Array(N) } : {}); ok = r[N - 1] === arr[N - 1]; }
  wasmMem = pc.memoryBytes(); }
const ms = performance.now() - t, ru = process.resourceUsage().maxRSS;
console.log(JSON.stringify({ which, mode: mode || '', ok, ms: +ms.toFixed(1), wasmMemMB: +(wasmMem / 1048576).toFixed(1), peakRssMB: +(ru / 1024).toFixed(0), rssBeforeMB: +(peak0 / 1024).toFixed(0), extraPeakMB: +((ru - peak0) / 1024).toFixed(0), packedKB: +(packed.length / 1024).toFixed(0) }));
