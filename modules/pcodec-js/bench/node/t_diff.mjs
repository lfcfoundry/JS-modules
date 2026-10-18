import fs from 'fs'; import { rawWasm, numcodecs } from './contenders.mjs';
const man = JSON.parse(fs.readFileSync('../cols.json')), bin = fs.readFileSync('../cols.bin');
const A = await rawWasm('ours', '../wasm/ours-1.0.wasm'), B = await numcodecs();
for (const c of man) {
  const T = c.kind === 'f64' ? Float64Array : Int32Array, arr = new T(bin.buffer.slice(bin.byteOffset + c.off, bin.byteOffset + c.off + c.bytes));
  const a = A.compress(c.kind, arr, 8), b = B.compress(c.kind, arr, 8);
  const k = b.length - a.length; const same = k > 0 && Buffer.compare(Buffer.from(b.buffer, b.byteOffset + k, a.length), Buffer.from(a)) === 0;
  console.log(c.kind, c.n, String(a.length).padStart(8), String(b.length).padStart(8), (b.length - a.length).toString().padStart(7), same ? 'payload identical' : 'DIFFERENT', c.name.slice(0, 40));
}
