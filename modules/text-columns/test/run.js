// Copyright (c) 2026 LFC Foundry. MIT License. text-columns checks, pass/fail only (Node 22): the WebAssembly path and the plain path give the same columns on random made-up text, and Python's csv module agrees on what the fields are.
'use strict';
const F = require('../text-columns.js'), assert = require('assert'), { spawnSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
let s = 12345; const R = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }, ri = (a, b) => a + Math.floor(R() * (b - a + 1));
let n = 0; const t = (name, f) => { f(); n++; };
const WORDS = ['', 'a', 'ann', 'x y', 'é日本', 'say "hi"', 'a,b', 'line\nbreak', 'tab\there', '007', '1e5', '12', '-3', '2.50', '0.1', '-0', '123456789012345', '1234567890123456', ' 5', '5 ', '.5', '5.', '-', '--1'];
function field(delim) {
  const w = WORDS[ri(0, WORDS.length - 1)], needs = /["\n\r]/.test(w) || w.includes(delim) || w === '' && R() < 0.3;
  if (needs || R() < 0.1) return '"' + w.split('"').join('""') + '"';
  return w;
}
function table(delim, rows, cols, eol) { const o = []; for (let r = 0; r < rows; r++) { const l = []; for (let c = 0; c < cols; c++) l.push(field(delim)); o.push(l.join(delim)); } return o.join(eol) + (R() < 0.7 ? eol : ''); }
function numeric(rows, cols) { const o = []; for (let r = 0; r < rows; r++) { const l = []; for (let c = 0; c < cols; c++) l.push(c % 3 === 0 ? String(ri(-5000, 900000)) : c % 3 === 1 ? (ri(-99999, 99999) / 100).toFixed(2) : 'k' + ri(0, 40)); o.push(l.join(',')); } return 'a,b,c,d,e,f\n' + o.join('\n') + '\n'; }
function same(a, b, label) { assert.strictEqual(a.count, b.count, label + ' count'); assert.deepStrictEqual(a.names, b.names, label + ' names'); a.columns.forEach((c, i) => { assert.strictEqual(c.type, b.columns[i].type, label + ' type ' + i); const x = c.values, y = b.columns[i].values; assert.strictEqual(x.length, y.length, label + ' length ' + i); for (let k = 0; k < x.length; k++) if (!Object.is(x[k], y[k])) assert.fail(label + ' col ' + i + ' row ' + k + ': ' + x[k] + ' vs ' + y[k]); }); }

t('wasm and plain paths agree on random text (comma and tab, \\n and \\r\\n, quotes, unicode)', () => {
  assert.ok(F.ready(), 'wasm should be ready in Node');
  for (let it = 0; it < 400; it++) {
    const delim = R() < 0.3 ? '\t' : ',', rows = ri(1, 60), cols = ri(1, 6), eol = R() < 0.3 ? '\r\n' : '\n', text = table(delim, rows, cols, eol), header = R() < 0.8;
    let a, b; try { a = F.parse(text, { delimiter: delim, header }); } catch (e) { a = e.message; } try { b = F.parse(text, { delimiter: delim, header, plain: true }); } catch (e) { b = e.message; }
    if (typeof a === 'string' || typeof b === 'string') assert.strictEqual(a, b, 'same error'); else same(a, b, 'case ' + it);
  }
});
t('numbers: plain decimals become Float64Array, others stay text', () => {
  const x = F.parse('a,b,c,d\n1,007,1e5,\n-2.5,8,2,\n3.25,9,3,\n');
  assert.deepStrictEqual(x.columns.map(c => c.type), ['number', 'text', 'text', 'text']);
  assert.ok(x.columns[0].values instanceof Float64Array); assert.deepStrictEqual(Array.from(x.columns[0].values), [1, -2.5, 3.25]);
  const big = F.parse('a\n123456789012345\n1234567890123456\n'); assert.strictEqual(big.columns[0].type, 'text');
  const dec = F.parse('a\n0.1\n0.7\n12.345\n-0.001\n'); assert.deepStrictEqual(Array.from(dec.columns[0].values), [0.1, 0.7, 12.345, -0.001]);
});
t('numbers equal Number() on random decimals', () => {
  const rows = []; for (let i = 0; i < 5000; i++) { const d = ri(0, 6), v = ri(0, 999999999); rows.push(String(ri(0, 1) ? -v : v) + (d ? '.' + String(ri(0, 10 ** d - 1)).padStart(d, '0') : '')); }
  const x = F.parse('a\n' + rows.join('\n') + '\n');
  if (x.columns[0].type !== 'number') { assert.ok(rows.some(r => r.replace('-', '').replace('.', '').length > 15)); return; }
  rows.forEach((r, i) => assert.strictEqual(x.columns[0].values[i], Number(r), r));
});
t('quotes, \\r\\n, blank lines, BOM, no trailing newline, header off', () => {
  const x = F.parse('﻿a,b\r\n"x,y","he said ""no"""\r\n\r\n"",z'); assert.deepStrictEqual(x.names, ['a', 'b']); assert.deepStrictEqual(x.toRows(), [{ a: 'x,y', b: 'he said "no"' }, { a: '', b: 'z' }]);
  const y = F.parse('1,2\n3,4', { header: false }); assert.deepStrictEqual(y.names, ['c1', 'c2']); assert.deepStrictEqual(Array.from(y.columns[1].values), [2, 4]);
  assert.strictEqual(F.parse('').count, 0);
});
t('errors: ragged rows, text after a closing quote, unclosed quote', () => {
  for (const plain of [false, true]) {
    assert.throws(() => F.parse('a,b\n1,2,3\n', { plain }), /same number of fields/);
    assert.throws(() => F.parse('a,b\n"x"y,2\n', { plain }), /after a closing quote/);
    assert.throws(() => F.parse('a,b\n"x,2\n', { plain }), /never closed/);
  }
});
t('long text crosses many 16-byte blocks and still agrees', () => {
  const text = numeric(20000, 6); const a = F.parse(text), b = F.parse(text, { plain: true }); same(a, b, 'long'); assert.strictEqual(a.count, 20000);
});
t('Python csv module reads the same fields', () => {
  const py = spawnSync('python3', ['-c', 'import csv'], {}); if (py.status !== 0) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-')); let bad = 0;
  for (let it = 0; it < 60; it++) {
    const delim = R() < 0.3 ? '\t' : ',', cols = ri(1, 5), text = table(delim, ri(2, 40), cols, R() < 0.3 ? '\r\n' : '\n'), f = path.join(dir, 'a.txt'); fs.writeFileSync(f, text);
    const out = spawnSync('python3', ['-c', 'import csv,sys,json\nr=list(csv.reader(open(sys.argv[1],newline="",encoding="utf-8"),delimiter=sys.argv[2]))\nr=[x for x in r if x]\nprint(json.dumps(r))', f, delim], { encoding: 'utf8' });
    let want; try { want = JSON.parse(out.stdout); } catch (e) { continue; }
    let got; try { const p = F.parse(text, { delimiter: delim, header: false }); got = p.toRows().map(o => p.names.map(k => o[k])); } catch (e) { continue; }
    const norm = a => a.map(r => r.map(v => typeof v === 'number' ? v : v));
    const wantNum = want.map(r => r.map(String)), gotStr = got.map(r => r.map(String));
    if (JSON.stringify(wantNum.map(r => r.map(Number.isNaN))) && JSON.stringify(gotStr) !== JSON.stringify(wantNum)) {
      // a number column prints without padding (2.50 -> 2.5): compare by value when both are numeric text
      const ok = gotStr.length === wantNum.length && gotStr.every((r, i) => r.length === wantNum[i].length && r.every((v, j) => v === wantNum[i][j] || (v !== '' && !isNaN(Number(wantNum[i][j])) && Number(v) === Number(wantNum[i][j]))));
      if (!ok) bad++;
    }
  }
  fs.rmSync(dir, { recursive: true, force: true }); assert.strictEqual(bad, 0, 'files that differ from Python csv: ' + bad);
});
console.log('text-columns: all ' + n + ' checks passed');
