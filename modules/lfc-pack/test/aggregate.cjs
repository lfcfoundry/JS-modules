// Copyright (c) 2026 LFC Foundry. MIT License.
// B40 aggregate(bytes, { key, by }): counts equal a plain loop over unpackRows, sums equal it within 1e-12 and equal the exact decimal sum; groups on whole-number, text-dictionary and fallback keys; nulls, missing keys, multi-block and 1-row files.
const L = require('../lfc-pack.js');
let s = 13; const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
function rows(n) { const o = []; for (let i = 0; i < n; i++) { const x = { id: i, zone: Math.floor(r() * 265) + 1, pay: r() < 0.7 ? 'card' : 'cash', fare: Math.round(r() * 8000) / 100, ts: 1760000000 + i * 7 }; x.tip = r() < 0.03 ? null : Math.round(r() * 1500) / 100; if (r() < 0.9) x.extra = Math.round(r() * 300) / 100; if (r() < 0.01) x.fare = 'n/a'; o.push(x); } return o; }
(async () => {
  await L.init(); let checks = 0, bad = 0; const ok = (c, m) => { checks++; if (!c) { bad++; console.log('FAIL', m); } };
  const near = (a, b) => Math.abs(a - b) <= Math.abs(b) * 1e-12;
  for (const n of [1, 40, 5000, 260000]) {
    const R = rows(n); for (const opts of [undefined, { check: 'xxh64' }]) {
      const by = L.packRows(R, opts), back = L.unpackRows(by);
      for (const key of ['fare', 'tip', 'extra', 'ts', 'nope']) {
        let sm = 0, c = 0; for (const x of back) if (typeof x[key] === 'number') { sm += x[key]; c++; }
        for (let rep = 0; rep < 2; rep++) { const a = L.aggregate(by, { key }); ok(a.count === c && near(a.sum, sm) && (c ? near(a.avg, sm / c) : Number.isNaN(a.avg)), n + ' ' + key + ' sum'); }
        for (const g of ['zone', 'pay', 'ts', 'extra']) {
          const G = new Map(); for (const x of back) { if (typeof x[key] !== 'number') continue; const k = x[g]; const e = G.get(k); if (e) { e[0] += x[key]; e[1]++; } else G.set(k, [x[key], 1]); }
          const a = L.aggregate(by, { key, by: g }); let good = a.keys.length === G.size;
          for (let i = 0; good && i < a.keys.length; i++) { const e = G.get(a.keys[i]); good = !!e && e[1] === a.count[i] && near(a.sum[i], e[0]); }
          ok(good, n + ' ' + key + ' by ' + g);
        }
      }
    }
  }
  // exact decimal sum: whole cents summed as BigInt
  const R = rows(200000).map(x => (typeof x.fare === 'number' ? x : Object.assign(x, { fare: 1 }))), by = L.packRows(R); let cents = 0n; for (const x of R) cents += BigInt(Math.round(x.fare * 100));
  ok(L.aggregate(by, { key: 'fare' }).sum === Number(cents) / 100, 'exact decimal sum');
  let threw = false; try { L.aggregate(by, {}); } catch (e) { threw = true; } ok(threw, 'needs key');
  console.log(bad ? 'aggregate FAILED ' + bad : 'aggregate ok, ' + checks + ' checks'); process.exit(bad ? 1 : 0);
})();
