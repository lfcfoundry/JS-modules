// Copyright (c) 2026 LFC Foundry. MIT License.
// Equality reads (B19): unpack(file, { equals: { key, value } }) gives exactly unpack(file).filter(r => r[key] === value), same values and key order, in every mode (read-then-filter, tested column, dictionary codes, cache), at several block sizes, with and without keys; the cache stays under its limit and clearCache() empties it.
const JF = require('../lfc-pack.js'), assert = require('assert');
(async () => {
  await JF.init();
  let seed = 5; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const words = ['alpha', 'beta', 'gamma', 'café', '漢字', '😀', '', 'delta'];
  const mk = n => { const o = []; for (let i = 0; i < n; i++) {
    const x = { id: i, lv: words[Math.floor(r() * words.length)], code: Math.floor(r() * 6), ok: r() < 0.3, ts: 1700000000 + i * 2 };
    if (r() < 0.15) x.opt = Math.floor(r() * 4); if (r() < 0.1) x.nul = null; else x.nul = r() < 0.5 ? 'a' : 'b'; if (r() < 0.2) x.cnt = null; else x.cnt = Math.floor(r() * 5) / 2;
    o.push(x); } return o; };
  const queries = [['lv', 'alpha'], ['lv', 'café'], ['lv', '漢字'], ['lv', '😀'], ['lv', ''], ['lv', 'nope'], ['lv', 3], ['code', 3], ['code', '3'], ['code', 99], ['ok', true], ['ok', false], ['nul', null], ['nul', 'a'], ['opt', 2], ['opt', null], ['cnt', null], ['cnt', 1.5], ['missing', null], ['id', 77]];
  for (const n of [300, 6000, 25000]) {
    const rows = mk(n), text = new TextEncoder().encode(rows.map(x => JSON.stringify(x)).join('\n') + '\n');
    for (const bb of [undefined, 32768]) {
      const b = JF.pack(text, bb ? { blockBytes: bb } : undefined), full = JF.unpack(b), flat = full.length === 1 && Array.isArray(full[0]) ? full[0] : full;
      for (const [k, v] of queries) for (const keys of [undefined, ['id']]) {
        const want = JSON.stringify(flat.filter(x => x[k] === v).map(x => keys ? { id: x.id } : x));
        for (const o of [{ _eq: 'off' }, { _eq: 'plain' }, {}, { cache: true }, { cache: true }]) {
          const got = JSON.stringify(JF.unpack(b, Object.assign({ equals: { key: k, value: v }, keys }, o)));
          assert.strictEqual(got, want, 'n ' + n + ' bb ' + bb + ' ' + k + '=' + JSON.stringify(v) + ' keys ' + keys + ' ' + JSON.stringify(o));
        }
      }
    }
  }
  // the cache: counted, limited, cleared
  const rows = mk(30000), b = JF.pack(new TextEncoder().encode(rows.map(x => JSON.stringify(x)).join('\n') + '\n'), { blockBytes: 65536 });
  JF.clearCache(); assert.strictEqual(JF.cacheBytes(), 0);
  JF.unpack(b, { equals: { key: 'lv', value: 'alpha' }, cache: true });
  const used = JF.cacheBytes(); assert(used > 0, 'cache holds something');
  JF.unpack(b, { equals: { key: 'code', value: 2 }, cache: true });
  JF.cacheLimit(used >> 2);
  assert(JF.cacheBytes() <= (used >> 2), 'limit applied: ' + JF.cacheBytes() + ' > ' + (used >> 2));
  const again = JSON.stringify(JF.unpack(b, { equals: { key: 'lv', value: 'beta' }, cache: true })), plain = JSON.stringify(JF.unpack(b, { equals: { key: 'lv', value: 'beta' } }));
  assert.strictEqual(again, plain, 'after eviction'); assert(JF.cacheBytes() <= (used >> 2), 'limit holds while querying');
  JF.cacheLimit(0); assert.strictEqual(JF.cacheBytes(), 0, 'limit 0 keeps nothing');
  JF.cacheLimit(64 * 1048576); JF.unpack(b, { equals: { key: 'lv', value: 'alpha' }, cache: true }); assert(JF.cacheBytes() > 0); JF.clearCache(); assert.strictEqual(JF.cacheBytes(), 0, 'clearCache');
  console.log('ok equality reads (B19): ' + queries.length + ' queries x 3 sizes x 2 block sizes x 5 modes');
})().catch(e => { console.error(e); process.exit(1); });
