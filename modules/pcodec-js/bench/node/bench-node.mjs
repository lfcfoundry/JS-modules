// Node benchmark of the contenders over the 39 columns. usage: node bench-node.mjs [reps]
import fs from 'fs'; import zlib from 'zlib'; import { rawWasm, numcodecs, newWasm } from './contenders.mjs';
const man = JSON.parse(fs.readFileSync('../cols.json')), bin = fs.readFileSync('../cols.bin'), REPS = +process.argv[2] || 5;
const arrs = man.map((c) => { const T = c.kind === 'f64' ? Float64Array : Int32Array; return new T(bin.buffer.slice(bin.byteOffset + c.off, bin.byteOffset + c.off + c.bytes)); });
const W = (f) => '../wasm/' + f + '.wasm';
const list = [];
const only = (process.env.ONLY || '').split(',').filter(Boolean);
const add = async (fn) => { try { const c = await fn(); if (!only.length || only.some((o) => c.name.includes(o))) list.push(c); } catch (e) { console.error('skip', e.message); } };
await add(() => rawWasm('A ours today (1.0, 327 KB, size-tuned)', W('ours-1.0')));
await add(() => numcodecs());
for (const f of (process.env.NEW || '').split(',').filter(Boolean)) { await add(() => newWasm('N ' + f, W(f))); await add(async () => { const c = await newWasm('N ' + f + ' (view)', W(f), 'view'); return c; }); }
const best = (f, k) => { let b = 1e18, r; for (let i = 0; i < k; i++) { const t = process.hrtime.bigint(); r = f(); const d = Number(process.hrtime.bigint() - t) / 1e6; if (d < b) b = d; } return { ms: b, r }; };
const out = [];
for (const c of list) {
  let enc = 0, dec = 0, size = 0, bad = 0, nEnc = 0, ref = null;
  const per = [];
  for (let i = 0; i < man.length; i++) {
    const m = man[i], a = arrs[i];
    let packed;
    if (c.hasEncode !== false && !c.noEncode) { const e = best(() => c.compress(m.kind, a, 8), 2); enc += e.ms; packed = e.r; size += packed.length; nEnc++; }
    else { packed = null; }
    per.push({ i, packed });
  }
  out.push({ name: c.name, wasmBytes: c.wasmBytes, extraBytes: c.extraBytes, encMs: enc, size, per });
  c.__per = per;
}
// decode everyone from the reference pco bytes of contender A (numcodecs adds a header, so it decodes its own)
const A = out[0];
for (const [ci, c] of list.entries()) {
  const o = out[ci]; let dec = 0, bad = 0, mem = 0;
  for (let i = 0; i < man.length; i++) {
    const m = man[i], src = (c.name.startsWith('numcodecs') || /^N .*view/.test(c.name) === false && c.name.startsWith('numcodecs')) ? o.per[i].packed : A.per[i].packed;
    const input = c.name.startsWith('numcodecs') ? o.per[i].packed : A.per[i].packed;
    const d = best(() => { const r = c.decompress(m.kind, input, m.n); return r; }, REPS);
    dec += d.ms;
    const r = d.r; const same = Buffer.compare(Buffer.from(r.buffer, r.byteOffset, r.byteLength), Buffer.from(arrs[i].buffer)) === 0; if (!same) bad++;
    if (c.free) c.free();
  }
  o.decMs = dec; o.bad = bad; o.mem = c.memBytes();
}
const tot = man.reduce((s, m) => s + m.n, 0);
console.log('| contender | wasm bytes | glue bytes | packed total (smaller better) | pack ms (lower better) | unpack ms (lower better) | unpack ns/value | wrong columns | wasm memory after (MB) |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const o of out) console.log(`| ${o.name} | ${o.wasmBytes.toLocaleString('en-US')} | ${o.extraBytes.toLocaleString('en-US')} | ${o.size.toLocaleString('en-US')} | ${o.encMs.toFixed(0)} | ${o.decMs.toFixed(1)} | ${(o.decMs * 1e6 / tot).toFixed(2)} | ${o.bad} | ${(o.mem / 1048576).toFixed(0)} |`);
