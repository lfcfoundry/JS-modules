// Copyright (c) 2026 LFC Foundry. MIT License.
// Loads with raw fields skip the deep copy when the text cannot hold a dangerous key (since 1.3.1). This check loads the same stored text with the
// version before that change (git show OLD_REF, default the 1.3.0 merge) and with this file, and requires the same clean state, own keys and
// prototypes included: poisoned keys, 40-deep nesting, a broken main slot, migrate and afterValidate. OLD_REF=none skips it.
'use strict';
const path = require('path'), cp = require('child_process');
const B = require('../save-kit.js'), OLD_REF = process.env.OLD_REF || '7667bcd81d8efdf1fd528e28c1c2b96538e397c9';
let A = null;
if (OLD_REF !== 'none') { try { const src = cp.execFileSync('git', ['-C', path.join(__dirname, '..', '..', '..'), 'show', OLD_REF + ':modules/save-kit/save-kit.js'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); const m = { exports: {} }; new Function('module', 'exports', 'self', src)(m, m.exports, undefined); A = m.exports; } catch (e) { A = null; } }
if (!A || typeof A.create !== 'function') { console.log('save-kit raw equivalence: old file not available, skipped'); process.exit(0); }
const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, m }; };
let bad = 0, n = 0;
function cmp(name, txt, schema, defaults, extra) {
  n++; const outs = [A, B].map((M) => { const st = mem(); st.m.k = txt; const kit = M.create(Object.assign({ key: 'k', schema, defaults, storage: st }, extra || {})); return kit.load(); });
  const s = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.assign({}, v, { __own: Object.getPrototypeOf(v) === null ? 'null' : 'obj' }) : v));
  if (s(outs[0]) !== s(outs[1])) { bad++; console.log('DIFF', name, s(outs[0]).slice(0, 120), '|', s(outs[1]).slice(0, 120)); }
}
const sc = { score: 'num', world: 'raw', c: { type: 'counts' } }, df = { score: 0, world: {}, c: {} };
cmp('plain', JSON.stringify({ score: 3, world: { a: [1, { b: 2 }] }, c: { x: 2 } }), sc, df);
cmp('proto key', '{"score":3,"world":{"__proto__":{"x":1},"a":1}}', sc, df);
cmp('constructor key', '{"score":3,"world":{"constructor":{"prototype":{"y":1}}}}', sc, df);
let deep = {}, cur = deep; for (let i = 0; i < 40; i++) { cur.n = {}; cur = cur.n; } cmp('deep40', JSON.stringify({ score: 1, world: deep }), sc, df);
let d2 = {}; cur = d2; for (let i = 0; i < 30; i++) { cur.n = {}; cur = cur.n; } cmp('deep30', JSON.stringify({ score: 1, world: d2 }), sc, df);
cmp('arrays deep', '{"score":1,"world":' + '['.repeat(40) + ']'.repeat(40) + '}', sc, df);
cmp('missing world', '{"score":2}', sc, df);
cmp('broken main', '{"score":-1,"world":{"a":1}}', sc, df);
cmp('migrate', JSON.stringify({ score: 1, world: { a: 1 }, v: 1 }), sc, df, { version: 2, migrate: (st) => { st.world.b = 2; return st; } });
cmp('after hook', JSON.stringify({ score: 1, world: { a: 1 } }), sc, df, { afterValidate: (c) => { c.world.z = 9; return c; } });
console.log('save-kit raw equivalence: ' + n + ' cases, ' + bad + ' different');
process.exit(bad ? 1 : 0);
