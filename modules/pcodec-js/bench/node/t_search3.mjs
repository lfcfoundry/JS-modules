import fs from 'fs'; import { newWasm } from './contenders.mjs';
const man = JSON.parse(fs.readFileSync('../cols.json')), bin = fs.readFileSync('../cols.bin');
const c = await newWasm('full', '../wasm/full-core-z.wasm'), ex = c.ex, KB = { f64: 6, i32: 3 };
const enc = (kind, arr, mode, arg, delta, order, level = 8) => { const src = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), p = ex.alloc(src.length); new Uint8Array(ex.memory.buffer, p, src.length).set(src); const n = ex.compress_cfg(KB[kind], p, arr.length, level, mode, arg, delta, order); ex.release(p, src.length); if (n < 0) return -1; ex.out_release(); return n; };
function decimals(s) { for (let d = 0; d <= 8; d++) { const m = Math.pow(10, d); let ok = true; for (let i = 0; i < s.length; i++) { const v = s[i] * m; if (!isFinite(v)) { ok = false; break; } if (Math.abs(v - Math.round(v)) > 1e-7 * Math.max(1, Math.abs(v))) { ok = false; break; } } if (ok) return d; } return -1; }
function sample(a, S) { if (a.length <= S * 2) return a; const k = 4, L = S / k, o = new a.constructor(S); for (let i = 0; i < k; i++) { const s = Math.floor((a.length - L) * i / (k - 1)); o.set(a.subarray(s, s + L), i * L); } return o; }
const S = +process.argv[2] || 20000, FM = process.argv[3] !== 'nofm';
let tAuto = 0, tBest = 0, tms = 0, t1 = 0;
for (const m of man) {
  const T = m.kind === 'f64' ? Float64Array : Int32Array, arr = new T(bin.buffer.slice(bin.byteOffset + m.off, bin.byteOffset + m.off + m.bytes));
  let t0 = process.hrtime.bigint(); const auto = enc(m.kind, arr, 0, 0, 0, 0); t1 += Number(process.hrtime.bigint() - t0) / 1e6;
  t0 = process.hrtime.bigint(); const smp = sample(arr, S); const cands = [[0, 0, 0, 0], [0, 0, 3, 0], [0, 0, 2, 1], [1, 0, 0, 0]];
  if (m.kind === 'f64' && FM) { const d = decimals(smp); if (d > 0) cands.push([2, Math.pow(10, -d), 0, 0], [2, Math.pow(10, -d), 3, 0]); }
  let best = 1e18, bi = 0; cands.forEach((cd, i) => { const s = enc(m.kind, smp, ...cd); if (s > 0 && s < best) { best = s; bi = i; } });
  let size = auto; if (bi !== 0) size = Math.min(auto, enc(m.kind, arr, ...cands[bi]));
  tms += Number(process.hrtime.bigint() - t0) / 1e6; tAuto += auto; tBest += size;
}
console.log('sample', S, 'auto', tAuto, 'smart', tBest, ((tBest / tAuto - 1) * 100).toFixed(2) + '%', 'auto ms', t1.toFixed(0), 'extra ms', tms.toFixed(0), '= x', (1 + tms / t1).toFixed(2), 'of one auto pack');
