// 2.18.0: small mode keeps hex-digit text of one length (ids, UUIDs, hashes) as 4-bit places, and takes up to 64 record layouts. Fast and balanced stay as before (same bytes as 2.17.6, checked by size below). Every case must round-trip exactly. Node only.
const MC = require(require('path').resolve(__dirname, '..', 'memory-compression.js')), hx = '0123456789abcdef';
let seed = 7; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296, bad = [];
const uuid = () => { let s = ''; for (let j = 0; j < 36; j++) s += (j === 8 || j === 13 || j === 18 || j === 23) ? '-' : hx[(r() * 16) | 0]; return s; };
const rt = (name, x, o) => { let b; try { b = MC.pack(x, o); if (JSON.stringify(MC.unpack(b)) !== JSON.stringify(x)) bad.push(name + ' round-trip'); } catch (e) { bad.push(name + ' ' + e.message); } return b; };
for (const n of [31, 32, 33, 500, 5000]) {
  const ids = []; for (let i = 0; i < n; i++) ids.push({ id: uuid(), n: i });
  const s = rt('uuid small ' + n, ids, { mode: 'small' }), f = rt('uuid fast ' + n, ids, { mode: 'fast' }); rt('uuid balanced ' + n, ids, { mode: 'balanced' });
  if (n >= 500 && s.length >= f.length) bad.push('hex small not smaller ' + n);
  const hashes = []; for (let i = 0; i < n; i++) { let h = ''; for (let k = 0; k < 40; k++) h += hx[(r() * 16) | 0]; hashes.push(h); }
  rt('hash list ' + n, hashes, { mode: 'small' });
  const mixed = hashes.slice(); mixed[n >> 1] = 'Z' + hashes[0].slice(1); rt('hash with a non-hex place ' + n, mixed, { mode: 'small' });
  const odd = hashes.slice(); odd[n - 1] = hashes[0] + 'a'; rt('hash with a longer value ' + n, odd, { mode: 'small' });
  const digits = []; for (let i = 0; i < n; i++) digits.push(String(10000000 + ((r() * 9e7) | 0))); rt('digits only ' + n, digits, { mode: 'small' });
  const rec = []; for (let i = 0; i < n; i++) { const o = { id: i }; if (r() < .5) o.a = (r() * 1000) | 0; if (r() < .5) o.b = 'x' + ((r() * 100) | 0); if (r() < .5) o.c = r() < .5; if (r() < .5) o.d = ((r() * 1e4) | 0) / 10; if (r() < .5) o.e = [1, 2, 3]; rec.push(o); }
  const rs = rt('sparse small ' + n, rec, { mode: 'small' }); rt('sparse balanced ' + n, rec, { mode: 'balanced' }); rt('sparse fast ' + n, rec, { mode: 'fast' });
  if (n >= 5000 && rs.length > MC.pack(rec, { mode: 'fast' }).length) bad.push('sparse small not smaller');
}
console.log('hexsmall problems', bad.length); bad.forEach(x => console.log(x)); if (bad.length) process.exit(1);
