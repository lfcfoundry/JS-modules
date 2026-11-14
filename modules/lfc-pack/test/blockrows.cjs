// Copyright (c) 2026 LFC Foundry. MIT License.
// open().block(i, { rows, keys }) (0.10.26): the chosen rows of a block are the same objects, with the same key order, as block(i) holds at those positions, in the order asked,
// for every column layout (numbers, nulls, text, labels, templates, UUID / hex / IP, booleans, nested values, missing keys), nested and raw blocks, and the keys option. Pass/fail only. Run: node modules/lfc-pack/test/blockrows.cjs
'use strict';
const JF = require('../lfc-pack.js'), G = require('./gen.cjs');
(async () => {
  await JF.init(); let bad = 0, n = 0;
  const ok = (c, m) => { n++; if (!c) { bad++; if (bad < 20) console.log('FAIL', m); } };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let seed = 5; const r = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const hex = (k) => Array.from({ length: k }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join('');
  const N = 20000;
  const shapes = {
    workbench: (i) => ({ id: i, name: 'Name ' + (i % 97), score: i % 9 === 0 ? '' : (((i * 37) % 10000) / 100).toFixed(2), when: '2026-11-' + String(1 + (i % 28)).padStart(2, '0'), note: 'note ' + i }),
    typed: (i) => ({ id: i, score: i % 9 === 0 ? null : ((i * 37) % 10000) / 100, big: i * 1e9 + 0.25, f: r() * 1e6, neg: -i, ok: i % 3 === 0 }),
    sparse: (i) => { const o = { id: i }; if (i % 2) o.a = 'x' + (i % 13); if (i % 3) o.b = i * 1.5; if (i % 5 === 0) o.c = null; if (i % 7 === 0) o.d = true; return o; },
    ids: (i) => ({ u: [hex(8), hex(4), '4' + hex(3), 'a' + hex(3), hex(12)].join('-'), h: hex(40), ip: Math.floor(r() * 256) + '.' + (i % 256) + '.1.' + (i % 7), t: 'x' + hex(3) }),
    deep: (i) => ({ id: i, arr: [i % 7, i % 3], o: i % 4 ? { x: i, y: 'q' } : null, mix: i % 3 === 0 ? 'str' : i % 3 === 1 ? i : null }),
    wide: (i) => { const o = {}; for (let k = 0; k < 24; k++) if ((i + k) % 3) o['k' + k] = k % 2 ? i + k : 'v' + ((i * k) % 50); return o; },
    unicode: (i) => ({ s: 'é' + (i % 50) + '😀', n: i })
  };
  const files = [];
  for (const [name, f] of Object.entries(shapes)) {
    const text = Buffer.from(Array.from({ length: N }, (_, i) => JSON.stringify(f(i))).join('\n') + '\n');
    files.push([name, JF.pack(text, { blockBytes: 262144 })]);
    if (name === 'workbench') { files.push([name + ' templates', JF.pack(text, { blockBytes: 262144, templates: true })]); files.push([name + ' nested', JF.pack(text, { blockBytes: 262144, block: 'nested' })]); files.push([name + ' exact', JF.pack(text, { blockBytes: 262144, exact: true })]); files.push([name + ' xxh64', JF.pack(text, { blockBytes: 262144, check: 'xxh64' })]); }
  }
  files.push(['logs', JF.pack(Buffer.from(G.logs(20000)), { blockBytes: 262144 })]);
  files.push(['events', JF.pack(Buffer.from(G.events(20000)), { blockBytes: 262144 })]);
  for (const [name, bytes] of files) {
    const R = await JF.open(new Blob([bytes]));
    for (let b = 0; b < R.blocks.length; b += Math.max(1, Math.floor(R.blocks.length / 3))) {
      const all = await R.block(b), m = all.length, keys0 = Object.keys(all[0] || {});
      const picks = [[0], [m - 1], [3, 1, 2], [5, 5, 0], Array.from({ length: 50 }, () => Math.floor(r() * m)), Array.from({ length: Math.floor(m / 3) }, () => Math.floor(r() * m)), Array.from({ length: m }, (_, k) => m - 1 - k), []];
      for (const p of picks) {
        const got = await R.block(b, { rows: p });
        ok(got.length === p.length && same(got, p.map((k) => all[k])), name + ' block ' + b + ': ' + p.length + ' rows');
        ok(p.length < 2 || p[0] !== p[1] || got[0] === got[1], name + ': a repeated row is the same object');
      }
      const ks = keys0.slice(0, 2), p = [7 % m, 1, Math.floor(m / 2)], want = await R.block(b, { rows: p, keys: ks });
      ok(same(want, p.map((k) => { const o = {}; for (const key of Object.keys(all[k])) if (ks.includes(key)) o[key] = all[k][key]; return o; })), name + ' block ' + b + ': keys');
      for (const badPos of [[-1], [m], [1.5], ['2']]) { let threw = false; try { await R.block(b, { rows: badPos }); } catch (e) { threw = e instanceof RangeError; } ok(threw, name + ': bad row ' + JSON.stringify(badPos) + ' throws a RangeError'); }
    }
    const R2 = await JF.open(bytes); ok(same(await R2.block(0, { rows: [2, 0] }), (await R2.block(0)).filter((_, k) => k === 0 || k === 2).reverse()), name + ': bytes source');
  }
  { let threw = false; try { const R = await JF.open(files[0][1]); await R.block(0, { rows: 'abc' }); } catch (e) { threw = e instanceof TypeError; } ok(threw, 'rows must be a list'); }
  console.log(bad ? bad + ' of ' + n + ' FAILED' : 'all ' + n + ' passed');
  process.exit(bad ? 1 : 0);
})();
