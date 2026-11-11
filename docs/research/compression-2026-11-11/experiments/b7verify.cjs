// Copyright (c) 2026 LFC Foundry. MIT License.
// pass/fail + byte identity: B3b build vs lfc-pack 0.8.1 on mixed-kind keys, research sets and real corpus files (no times)
const fs = require('fs'), assert = require('assert');
const A = require(process.argv[2]), B = require(process.argv[3]);
let seed = 9; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const pools = {
  nullnum: () => r() < 0.05 ? null : Math.round(r() * 1e5) / 1e3,           // 3 decimals then null: the cfd-3 trap
  nullstr: () => r() < 0.05 ? null : 'name ' + ((r() * 50) | 0),
  strnum: () => r() < 0.5 ? 'v' + ((r() * 9) | 0) : (r() * 100) | 0,
  escuni: () => [null, 'café "q"\n', '日本', 'x\\y', 12, true, 'tab\there', '😀 ok'][(r() * 8) | 0],
  boolnum: () => r() < 0.5 ? r() < 0.5 : (r() * 3) | 0,
  longmix: () => [r(), null, -0, 1e300, 'n/a', 7][(r() * 6) | 0],
  latenull: null };
function set(kind, n) { const o = []; for (let i = 0; i < n; i++) { const x = { id: i, t: 1760000000 + i };
  x.v = kind === 'latenull' ? (i > n * 0.9 && i % 7 === 0 ? null : Math.round(r() * 1e4) / 100) : pools[kind]();
  if (i % 11 === 3) delete x.v; o.push(JSON.stringify(x)); } return Buffer.from(o.join('\n') + '\n'); }
(async () => {
  await A.init(); await B.init(); let all = 0, same = 0; const J = '/mnt/project-files/json-format/';
  const sets = [];
  for (const k of Object.keys(pools)) for (const n of [50, 3000, 70000]) sets.push([k + '-' + n, set(k, n)]);
  for (const f of fs.readdirSync('www').filter(f => f.endsWith('.ndjson')).sort()) sets.push([f, fs.readFileSync('www/' + f)]);
  for (const f of ['test-data/fhir-21mb.ndjson', 'optional-keys/gen-sets/nd_gen_logs.ndjson', 'optional-keys/gen-sets/nd_gen_config.ndjson', 'optional-keys/gen-sets/nd_gen_sparse.ndjson', 'columns-v2/row-objects/nd_dense_1x.ndjson', 'scale/events-10x.ndjson']) { let b = fs.readFileSync(J + f); if (b.length > 13e6) b = b.subarray(0, b.indexOf(10, 13e6) + 1); sets.push([f.split('/').pop(), b]); }
  for (const [f, b] of sets) {
    const want = b.toString().split('\n').filter(Boolean).map(l => JSON.parse(l));
    const pa = Buffer.from(A.pack(b)), pb = Buffer.from(B.pack(b));
    const rb = B.unpack(pb); assert.deepStrictEqual(rb, want, f); assert.deepStrictEqual(A.unpack(pb), want, f + ' old reader');
    for (let i = 0; i < want.length; i++) if (Object.is(want[i].v, -0) && !Object.is(rb[i].v, -0)) throw new Error('-0 lost ' + f);
    all++; if (pa.equals(pb)) same++; else console.log('DIFF', f, pa.length, pb.length);
  }
  console.log('sets', all, 'byte-identical', same);
})();
