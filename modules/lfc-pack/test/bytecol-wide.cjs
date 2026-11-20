// Copyright (c) 2026 LFC Foundry. MIT License.
// Wide text columns (average value 24 bytes or more) take the 16-byte scan, 8-byte hash and memory.copy join; the packed bytes must equal the byte-loop path (globalThis.__BK = 0 turns the kernels off) for every case.
const crypto = require('crypto'), { execFileSync } = require('child_process');
const mode = process.argv[2];
if (mode === 'bk0') globalThis.__BK = 0;
const JF = require('../lfc-pack.js'), enc = new TextEncoder();
let seed = 11; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const col = (parts) => { let tot = 0; for (const p of parts) tot += p.length; const bytes = new Uint8Array(tot), start = new Int32Array(parts.length), end = new Int32Array(parts.length); let q = 0; parts.forEach((p, i) => { start[i] = q; bytes.set(p, q); q += p.length; end[i] = q; }); return { bytes, start, end }; };
const word = () => { let s = ''; const n = 3 + Math.floor(r() * 8); for (let i = 0; i < n; i++) s += String.fromCharCode(97 + Math.floor(r() * 26)); return s; };
const text = (len) => { let s = ''; while (s.length < len) s += word() + ' '; return s.slice(0, len); };
const cases = {};
for (const L of [10, 15, 16, 17, 23, 24, 25, 31, 32, 33, 47, 64, 140]) cases['uniform' + L] = Array.from({ length: 3000 }, () => enc.encode(text(L)));
cases.mixed = Array.from({ length: 4000 }, () => enc.encode(text(1 + Math.floor(r() * 200))));
cases.repeat140 = (() => { const pool = Array.from({ length: 300 }, () => enc.encode(text(100 + Math.floor(r() * 80)))); return Array.from({ length: 8000 }, () => pool[Math.floor(r() * 300)]); })();
cases.dupTail = (() => { const base = text(60); return Array.from({ length: 3000 }, (_, i) => enc.encode(base + (i % 7))); })();
cases.dupHead = (() => { const base = text(60); return Array.from({ length: 3000 }, (_, i) => enc.encode((i % 7) + base)); })();
cases.nonAscii = Array.from({ length: 3000 }, () => enc.encode(text(20) + 'é中文' + text(12)));
cases.nulMid = Array.from({ length: 3000 }, (_, i) => (i === 1700 ? new Uint8Array([...enc.encode(text(40)), 0, 65]) : enc.encode(text(40))));
cases.nulLate = Array.from({ length: 3000 }, (_, i) => { const b = enc.encode(text(50)); if (i === 2999) b[49] = 0; return b; });
cases.empties = Array.from({ length: 3000 }, (_, i) => (i % 5 ? enc.encode(text(40)) : new Uint8Array(0)));
cases.badUtf8 = Array.from({ length: 3000 }, (_, i) => (i === 900 ? new Uint8Array([...enc.encode(text(30)), 0xff, 0xfe]) : enc.encode(text(40))));
(async () => {
  await JF.init();
  const out = {}, o = { level: 3, blockBytes: 2097152, share: false };
  for (const k of Object.keys(cases)) { let h; try { h = crypto.createHash('sha256').update(await JF.packBlock({ k: col(cases[k]) }, o)).digest('hex').slice(0, 16); } catch (e) { h = 'ERR ' + e.message; } out[k] = h; }
  if (mode) { console.log(JSON.stringify(out)); return; }
  const ref = JSON.parse(execFileSync(process.execPath, [__filename, 'bk0']).toString());
  let bad = 0; for (const k of Object.keys(out)) if (out[k] !== ref[k]) { bad++; console.error('DIFF', k, out[k], ref[k]); }
  if (bad) process.exit(1);
  console.log('bytecol wide ok, ' + Object.keys(out).length + ' cases, same bytes with kernels on and off');
})().catch((e) => { console.error(e); process.exit(1); });
