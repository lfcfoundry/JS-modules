// Copyright (c) 2026 LFC Foundry. MIT License.
// small files: JSON under gzip -9, Brotli (research wasm of Brotli 1.1.0, quality 5/9/11), zstd 3/19 (lfc-pack's own wasm), against LFC-pack 0.8.3. usage: node brsize.cjs brotli.wasm file...
const fs = require('fs'), zl = require('zlib'); globalThis.__H = { c() {}, d() {} };
const L = require('./inst83s.js'), X = new WebAssembly.Instance(new WebAssembly.Module(fs.readFileSync(process.argv[2])), {}).exports;
function br(src, q) { const p = X.malloc(src.length), cap = X.bound(src.length), d = X.malloc(cap); new Uint8Array(X.memory.buffer, p, src.length).set(src); const n = X.compress(d, cap, p, src.length, q, 0); X.free(d); X.free(p); return n; }
L.init().then(() => { console.log('file               json   gzip9   br5   br9  br11  zstd3 zstd19 | lfc-pack  lfc/br11');
  for (const f of process.argv.slice(3)) { const raw = fs.readFileSync(f), t = f.endsWith('.json'), txt = t ? Buffer.from(JSON.stringify(JSON.parse(raw))) : raw; const p = t ? L.packTables(JSON.parse(raw)) : L.pack(raw);
    const z = q => globalThis.__ZC(txt, q).length, b11 = br(txt, 11);
    console.log(f.padEnd(17), String(txt.length).padStart(7), String(zl.gzipSync(txt, { level: 9 }).length).padStart(6), String(br(txt, 5)).padStart(5), String(br(txt, 9)).padStart(5), String(b11).padStart(5), String(z(3)).padStart(6), String(z(19)).padStart(6), '|', String(p.length).padStart(8), (p.length / b11).toFixed(2).padStart(8)); } });
