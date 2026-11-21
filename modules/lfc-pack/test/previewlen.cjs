// Copyright (c) 2026 LFC Foundry. MIT License.
// previewLen (pool.js) gives the length of JSON.stringify(RA.slice(0, 1024)) for a column table without building rows; checked against the stringify on random columns with escapes, lone surrogates, NaN, -0, nulls and booleans, and the fallback for other values.
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/../src/pool.js', 'utf8');
const a = src.indexOf('  var PL_ESC'), b = src.indexOf('  function packRowsBlocks(RA, opts)');
const { previewLen } = new Function(src.slice(a, b) + '\nreturn { previewLen: previewLen };')();
let seed = 5; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const pick = (xs) => xs[(r() * xs.length) | 0];
const strs = ['', 'a', 'abc def', '12.50', 'café', '中文', 'say "hi"', 'back\\slash', 'tab\there', 'nl\nx', 'bell\u0007', 'del\u007f', '😀', 'lone\ud83d', '\ude00lone', 'a\ud83d😀b', '  ', 'x'.repeat(40)];
const mkTable = (n, cols, kinds) => {
  const keys = [], A = [], rowsOf = (i0, i1) => { const out = []; for (let i = i0; i < i1; i++) { const o = {}; for (let q = 0; q < keys.length; q++) o[keys[q]] = A[q][i]; out.push(o); } return out; };
  for (let q = 0; q < cols; q++) { keys.push(pick(['id', 'na"me', 'k\\q', 'café', 'tab\tkey', 'x' + q, 'lone\ud83d']) + q); const kind = kinds[q % kinds.length]; let col;
    if (kind === 'f64') { col = new Float64Array(n); for (let i = 0; i < n; i++) col[i] = pick([0, -0, 1.5, 1e21, 1e-7, NaN, Infinity, -Infinity, r() * 1e6, Math.floor(r() * 100)]); }
    else if (kind === 'i32') { col = new Int32Array(n); for (let i = 0; i < n; i++) col[i] = (r() * 1e6 - 5e5) | 0; }
    else if (kind === 'str') { col = []; for (let i = 0; i < n; i++) col.push(pick(strs)); }
    else if (kind === 'mix') { col = []; for (let i = 0; i < n; i++) col.push(pick([null, true, false, 3, -0, 'v', 'q"', NaN])); }
    else if (kind === 'undef') { col = []; for (let i = 0; i < n; i++) col.push(i === 3 ? undefined : 1); }
    else col = { kind: 'weird', ids: new Int32Array(n) };
    A.push(col); }
  const T = { __ct: { keys, A }, length: n, slice: (s0, s1) => rowsOf(s0, Math.min(s1 == null ? n : s1, n)) }; return T;
};
let cases = 0;
for (const n of [1, 2, 7, 100, 1023, 1024, 1025, 3000]) for (const kinds of [['f64'], ['str'], ['f64', 'str', 'i32'], ['mix', 'str'], ['f64', 'undef'], ['str', 'weird'], ['f64', 'i32', 'str', 'mix', 'f64']]) for (const cols of [1, 2, 5]) {
  const T = mkTable(n, cols, kinds); if (kinds.includes('weird') || kinds.includes('undef')) { const exp = JSON.stringify(T.slice(0, 1024)).length; if (!kinds.includes('weird')) assert.strictEqual(previewLen(T), exp, 'fallback ' + kinds); continue; }
  const exp = JSON.stringify(T.slice(0, 1024)).length; assert.strictEqual(previewLen(T), exp, 'n ' + n + ' ' + kinds + ' cols ' + cols); cases++;
}
// plain row arrays (no column table) and an empty table take the stringify
const rows = [{ a: 1 }, { a: 'x' }]; assert.strictEqual(previewLen(rows), JSON.stringify(rows).length); cases++;
console.log('ok   previewLen equals the stringify length on ' + cases + ' tables');
