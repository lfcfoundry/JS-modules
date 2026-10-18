// Makes src/warm.json: three tiny Pcodec files the warm-up unpacks (decimals with a running total, whole numbers with a running total, plain noisy floats).
// usage: node src/make-warm.js   (needs pcodec-js-pack.js built once with an empty warm.json; then run python3 build.py again)
'use strict';
const fs = require('fs'), path = require('path');
const K = require(path.join(__dirname, '..', 'pcodec-js-pack.js'));
let seed = 20261018; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const kinds = { f64: 6, i32: 3 };
(async () => {
  const pk = await K.load(), out = [];
  const a = new Float64Array(1024); let v = 40.12345; for (let i = 0; i < a.length; i++) { v += (rnd() - 0.5) * 0.002; a[i] = Math.round(v * 1e5) / 1e5; }
  const b = new Int32Array(1024); let u = 1000; for (let i = 0; i < b.length; i++) { u += Math.floor(rnd() * 40) - 10; b[i] = u; }
  const c = new Float64Array(256); for (let i = 0; i < c.length; i++) c[i] = (rnd() - 0.5) * 3 + Math.sin(i / 7);
  for (const [arr, k] of [[a, 'f64'], [b, 'i32'], [c, 'f64']]) { const bytes = pk.pack(arr); out.push([kinds[k], arr.length, Buffer.from(bytes).toString('base64')]); console.log(k, arr.length, bytes.length, 'B'); }
  fs.writeFileSync(path.join(__dirname, 'warm.json'), JSON.stringify(out));
})();
