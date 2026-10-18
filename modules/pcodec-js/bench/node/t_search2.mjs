import fs from 'fs'; import { newWasm } from './contenders.mjs';
const man = JSON.parse(fs.readFileSync('../cols.json')), bin = fs.readFileSync('../cols.bin');
const c = await newWasm('full', '../wasm/full-core-z.wasm'), ex = c.ex, KB = { f64: 6, i32: 3 };
const enc = (kind, arr, mode, arg, delta, order, level = 8) => { const src = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), p = ex.alloc(src.length); new Uint8Array(ex.memory.buffer, p, src.length).set(src); const n = ex.compress_cfg(KB[kind], p, arr.length, level, mode, arg, delta, order); ex.release(p, src.length); if (n < 0) return -1; ex.out_release(); return n; };
const CANDS = { f64: [[0,0,0,0],[0,0,3,0],[0,0,2,1],[2,0.001,0,0],[2,1e-4,0,0],[2,0.01,0,0],[1,0,0,0]], i32: [[0,0,0,0],[0,0,3,0],[0,0,2,1],[1,0,0,0]] };
const SAMPLE = +process.argv[2] || 0;
let tAuto = 0, tBest = 0, tms = 0, t1 = 0;
for (const m of man) {
  const T = m.kind === 'f64' ? Float64Array : Int32Array, arr = new T(bin.buffer.slice(bin.byteOffset + m.off, bin.byteOffset + m.off + m.bytes));
  let t0 = process.hrtime.bigint(); const auto = enc(m.kind, arr, 0, 0, 0, 0); t1 += Number(process.hrtime.bigint() - t0) / 1e6;
  t0 = process.hrtime.bigint(); let best = 1e18, bi = 0;
  const smp = SAMPLE && arr.length > SAMPLE * 2 ? (() => { const k = 4, L = SAMPLE / k, parts = []; for (let i = 0; i < k; i++) { const s = Math.floor((arr.length - L) * i / (k - 1)); parts.push(arr.subarray(s, s + L)); } const o = new T(SAMPLE); parts.forEach((p, i) => o.set(p, i * L)); return o; })() : arr;
  CANDS[m.kind].forEach((cd, i) => { const s = enc(m.kind, smp, ...cd); if (s > 0 && s < best) { best = s; bi = i; } });
  const size = smp === arr ? best : enc(m.kind, arr, ...CANDS[m.kind][bi]);
  tms += Number(process.hrtime.bigint() - t0) / 1e6; tAuto += auto; tBest += Math.min(size, auto);
}
console.log('sample', SAMPLE || 'full', 'auto', tAuto, 'search', tBest, ((tBest / tAuto - 1) * 100).toFixed(2) + '%', 'auto ms', t1.toFixed(0), 'search ms', tms.toFixed(0), 'x', (tms / t1).toFixed(1));
