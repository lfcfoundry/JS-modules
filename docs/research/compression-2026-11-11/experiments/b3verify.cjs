// Copyright (c) 2026 LFC Foundry. MIT License.
// pass/fail + byte identity: B3 build vs lfc-pack 0.8.1 on research sets and number edge cases (no times)
const fs = require('fs'), assert = require('assert');
const A = require(process.argv[2]), B = require(process.argv[3]);
let seed = 5; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
function edge(n, mode) { const o = []; for (let i = 0; i < n; i++) { const x = {}; x.a = i; const k = (r() * 8) | 0;
  x.v = mode === 'late' && i < n / 2 ? Math.round(r() * 1000) / 100 : [r(), -r() * 1e-7, 1e21 * r(), -0, 123456789012345680000, 0.1 + 0.2, Math.round(r() * 1e6) / 1e3, 5e-324][k];
  if (mode === 'mix') x.w = r() < 0.5 ? r() * 1e300 : (r() * 100) | 0;
  o.push(JSON.stringify(x).replace('"v":0,', i % 3 ? '"v":0,' : '"v":-0,').replace(/"v":(\d+)\.(\d+)e\+?(\d+)/, (m, a, b, c) => i % 2 ? `"v":${a}.${b}E${c}` : m)); }
  return Buffer.from(o.join('\n') + '\n'); }
(async () => {
  await A.init(); await B.init(); let all = 0, same = 0;
  const sets = fs.readdirSync('www').filter(f => f.endsWith('.ndjson')).sort().map(f => [f, fs.readFileSync('www/' + f)]);
  for (const m of ['plain', 'late', 'mix']) for (const n of [100, 5000, 60000]) sets.push([`edge-${m}-${n}`, edge(n, m)]);
  for (const [f, b] of sets) {
    const want = b.toString().split('\n').filter(Boolean).map(l => JSON.parse(l));
    const pa = Buffer.from(A.pack(b)), pb = Buffer.from(B.pack(b));
    const ra = B.unpack(pb); assert.deepStrictEqual(ra, want, f); assert.deepStrictEqual(A.unpack(pb), want, f + ' old reader');
    for (let i = 0; i < want.length; i++) if (Object.is(want[i].v, -0) && !Object.is(ra[i].v, -0)) throw new Error('-0 lost ' + f);
    all++; if (pa.equals(pb)) same++; else console.log('DIFF', f, pa.length, pb.length);
  }
  console.log('sets', all, 'byte-identical', same);
})();
