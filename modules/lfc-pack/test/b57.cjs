// B57 (0.10.31): the wasm template builder gives the same files as the JS templateFrames path (templates: true and auto), including values with byte 1, many-slot templates, Unicode and 0 chars. Copyright (c) 2026 LFC Foundry. MIT License.
'use strict';
const assert = require('assert');
const path = require('path');
const file = path.join(__dirname, '..', 'lfc-pack.js');
function load(on) { delete require.cache[require.resolve(file)]; globalThis.__B57 = on; globalThis.__B57B = on; const L = require(file); delete globalThis.__B57; delete globalThis.__B57B; return L; }
(async () => {
  const W = load(1), J = load(0);
  await W.init(); await J.init();
  let s = 5; const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const many = (n, f) => { const a = []; for (let i = 0; i < n; i++) a.push(f(i)); return a; };
  const sets = {
    logs: many(3000, i => ({ msg: 'GET /api/v1/items/' + Math.floor(r() * 1e5) + ' status ' + (r() < 0.9 ? 200 : 404) + ' in ' + Math.floor(r() * 900) + 'ms' })),
    byte1: many(3000, i => ({ msg: 'user ' + i + (i === 1500 ? ' \u0001 odd' : '') + ' logged in from ' + (i % 250) })),
    unicode: many(2000, i => ({ msg: 'café ' + i + ' — ' + (i % 30) + ' 😀' })),
    zero: many(2000, i => ({ msg: 'a ' + i + (i % 500 === 7 ? '\u0000b' : '') })),
    manySlots: many(40, i => ({ msg: many(4096, k => String((i * 7 + k) % 1000)).join(' ') })),
    mixed: many(3000, i => ({ msg: i % 3 ? 'job ' + i + ' done in ' + (i % 97) + ' s' : 'retry ' + (i % 11) + ' of 5' }))
  };
  let n = 0;
  for (const k in sets) for (const o of [{ templates: true }, {}]) {
    const a = W.packRows(sets[k], o), b = J.packRows(sets[k], o);
    assert.deepStrictEqual(Buffer.from(a), Buffer.from(b), k + ' ' + JSON.stringify(o) + ': wasm and JS template builders give the same file');
    assert.deepStrictEqual(W.unpackRows(a), sets[k], k + ' round trip'); n++;
  }
  console.log('b57: ' + n + ' cases, wasm template builder gives the same files as the JS one');
})().catch(e => { console.error(e); process.exit(1); });
