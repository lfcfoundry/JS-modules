// Per-path strings pick: since 0.4.6 each big nested block judges by itself by default (the same as paths: 'auto'); pack and packParallel agree. Copyright (c) 2026 LFC Foundry. MIT License.
'use strict';
const path = require('path'), L = require(path.join(__dirname, '..', 'lfc-pack.js'));
const W = ['alpha', 'beta', 'gamma', 'delta', 'eps'], rows = [];
for (let i = 0; i < 60000; i++) rows.push(JSON.stringify({ id: i, a: { s: W[i % 5], t: 'k' + (i % 300) }, b: [{ u: 'v' + (i % 41), w: W[(i >> 3) % 5] }], c: { d: { e: 'q' + (i % 7) } } }));
const text = Buffer.from(rows.join('\n') + '\n');
const eq = (x, y) => Buffer.compare(Buffer.from(x), Buffer.from(y)) === 0;
(async () => {
  await L.init(); let bad = 0;
  const want = JSON.stringify(rows.map((r) => JSON.parse(r)));
  for (const bb of [262144, 1 << 20]) {
    const blocks = Math.ceil(text.length / bb), o = { blockBytes: bb, paths: 'auto' };
    const d = L.pack(text, o), p1 = L.pack(text, Object.assign({ _pick: 1 }, o)), p0 = L.pack(text, Object.assign({ _pick: 0 }, o));
    for (const [n, f] of [['default', d], ['pick 1', p1], ['pick 0', p0]]) if (JSON.stringify(L.unpack(f)) !== want) { bad++; console.log('round trip fails', n, bb); }
    if (!eq(d, p1) && !eq(d, p0)) { bad++; console.log('default is neither pick', bb); }
    console.log('blockBytes', bb, 'blocks', blocks, 'sizes default/pick1/pick0', d.length, p1.length, p0.length, eq(d, p1) ? '(follows per-path)' : '(follows plain)');
  }
  { // many paths with few strings each: the plain layout wins, and packParallel (both dispatch modes) writes the bytes pack writes
    const r2 = []; for (let i = 0; i < 60000; i++) { const o = {}; for (let k = 0; k < 6; k++) o['f' + ((i * 31 + k * 7) % 400)] = { c: 'v' + ((i + k) % 17) }; r2.push(JSON.stringify(o)); }
    const t2 = Buffer.from(r2.join('\n') + '\n'), o = { blockBytes: 262144, paths: 'auto' }, d = L.pack(t2, o), p0 = L.pack(t2, Object.assign({ _pick: 0 }, o)), p1 = L.pack(t2, Object.assign({ _pick: 1 }, o));
    if (!eq(d, p0) || !(d.length < p1.length)) { bad++; console.log('plain layout should be picked', d.length, p0.length, p1.length); }
    if (JSON.stringify(L.unpack(d)) !== JSON.stringify(r2.map((r) => JSON.parse(r)))) { bad++; console.log('round trip fails (plain pick)'); }
    for (const dyn of [true, false]) for (const src of [t2, text]) { const pp = await L.packParallel(src, Object.assign({ workers: 3, dynamic: dyn }, o)); if (!eq(pp, L.pack(src, o))) { bad++; console.log('packParallel differs from pack', dyn, src === t2 ? 'plain' : 'per-path'); } }
    const n0 = { blockBytes: 262144 }; if (!eq(L.pack(t2, n0), d)) { bad++; console.log('since 0.4.6 the default is the per-block rule, the same as paths: auto'); }
    for (const dyn of [true, false]) { const pp = await L.packParallel(t2, Object.assign({ workers: 3, dynamic: dyn }, n0)); if (!eq(pp, d)) { bad++; console.log('packParallel without auto differs', dyn); } }
    console.log('plain-pick case: default ' + d.length + ' B, per-path would be ' + p1.length + ' B; packParallel matches pack');
  }
  const short = text.subarray(0, text.indexOf(10, 3 * 262144) + 1), o = { blockBytes: 262144, paths: 'auto' };
  if (!eq(L.pack(short, o), L.pack(short, Object.assign({ _pick: 1 }, o)))) { bad++; console.log('a short input should keep per-path strings'); }
  console.log('pathspick: bad ' + bad); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
