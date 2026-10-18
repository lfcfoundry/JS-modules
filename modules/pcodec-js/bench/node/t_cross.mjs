import fs from 'fs'; import { createRequire } from 'module'; import { rawWasm, numcodecs } from './contenders.mjs';
const require = createRequire(import.meta.url), K = require('/tmp/claude-0/pcm/mod/out/pcodec-js-pack.js'), R = require('/tmp/claude-0/pcm/mod/out/pcodec-js.js');
const man = JSON.parse(fs.readFileSync('../cols.json')), bin = fs.readFileSync('../cols.bin');
const A = await rawWasm('ours', '../wasm/ours-1.0.wasm'), B = await numcodecs(), pk = await K.load(), rd = await R.load();
const same = (a, b) => Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
let ident = 0, n = 0, newReadsOurs = 0, newReadsNC = 0, ourOldReadsNew = 0, ncReadsNew = 0, ncReadsSmallest = 0, smallestOk = 0, tot = { auto: 0, smallest: 0 }, tNew = 0, tSm = 0;
for (const c of man) {
  const T = c.kind === 'f64' ? Float64Array : Int32Array, arr = new T(bin.buffer.slice(bin.byteOffset + c.off, bin.byteOffset + c.off + c.bytes)); n++;
  const a = A.compress(c.kind, arr, 8), b = B.compress(c.kind, arr, 8);
  let t = performance.now(); const x = pk.pack(arr); tNew += performance.now() - t; t = performance.now(); const s = pk.pack(arr, { smallest: true }); tSm += performance.now() - t;
  tot.auto += x.length; tot.smallest += s.length;
  if (Buffer.compare(Buffer.from(x), Buffer.from(a)) === 0) ident++;                               // same bytes as the older module (Pcodec 1.0.4 both)
  if (same(rd.unpack(a), arr)) newReadsOurs++;                                                       // new reader opens old-module files
  const hdr = b.length - 0; // numcodecs file = header + pco payload; find the payload start by trying the header sizes seen (10 or 11)
  let okNC = false; for (const h of [10, 11, 12]) { try { const r = rd.unpack(b.subarray(h), { count: c.n }); if (same(r, arr)) { okNC = true; break; } } catch (e) {} } if (okNC) newReadsNC++;
  try { if (same(A.decompress(c.kind, x, c.n), arr)) ourOldReadsNew++; } catch (e) {}                 // old module opens new packer files
  // numcodecs opens ours: header from its own encoding of the same column, payload from ours
  const h = b.length - a.length > 0 ? 0 : 0;
  const mkNC = (payload) => { let hs = 0; for (const hh of [10, 11, 12]) { if (b.length - hh > 0 && Buffer.compare(Buffer.from(b.subarray(hh, hh + 4)), Buffer.from(a.subarray(0, 4))) === 0) { hs = hh; break; } } const o = new Uint8Array(hs + payload.length); o.set(b.subarray(0, hs)); o.set(payload, hs); return o; };
  try { const r = B.decompress(c.kind, mkNC(x), c.n); if (same(r, arr)) ncReadsNew++; } catch (e) { console.log('nc failed on new', c.name, e.message); }
  try { const r = B.decompress(c.kind, mkNC(s), c.n); if (same(r, arr)) ncReadsSmallest++; } catch (e) { console.log('nc failed on smallest', c.name, e.message); }
  if (same(rd.unpack(s), arr)) smallestOk++;
}
console.log({ columns: n, newPackerSameBytesAsOldModule: ident, newReaderOpensOldModuleFiles: newReadsOurs, newReaderOpensNumcodecsFiles: newReadsNC, oldModuleOpensNewPackerFiles: ourOldReadsNew, numcodecsOpensNewPackerFiles: ncReadsNew, numcodecsOpensSmallestFiles: ncReadsSmallest, newReaderOpensSmallest: smallestOk });
console.log('packed totals: pack() ' + tot.auto + ', pack({smallest}) ' + tot.smallest + ' (' + ((tot.smallest / tot.auto - 1) * 100).toFixed(2) + '%); time ms: ' + tNew.toFixed(0) + ' vs ' + tSm.toFixed(0) + ' (x' + (tSm / tNew).toFixed(2) + ')');
