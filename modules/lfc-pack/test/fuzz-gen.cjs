// Copyright (c) 2026 LFC Foundry. MIT License.
// Fuzz, part 1: makes seeded random NDJSON sources, packs each in several ways, checks the JavaScript reader against JSON.parse, and writes the files for the other readers.
// node test/fuzz-gen.cjs OUTDIR [cases=200] [seed=1]   writes OUTDIR/NAME.lfc, NAME.src (the NDJSON bytes) and NAME.mode (JSON options). Mismatches in the JavaScript round trip are listed and make the exit code 1.
'use strict';
const fs = require('fs'), path = require('path'), JF = require('../lfc-pack.js');
const out = process.argv[2], N = +process.argv[3] || 200, SEED = +process.argv[4] || 1;
fs.mkdirSync(out, { recursive: true });
let sd = SEED >>> 0; const R = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296), I = (n) => Math.floor(R() * n), P = (a) => a[I(a.length)];
const WORDS = ['info', 'warn', 'error', 'alpha', 'beta', 'gamma', 'x', '', 'café', '日本語', '😀 smile', 'a"b', 'back\\slash', 'line\nbreak', 'tab\there', 'nul\u0000x', '\ud800lone', 'lone\udc00', 'GET /a/1 took 5 ms', '__proto__', 'constructor', '0', '1', '007'];
const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[I(16)]).join('');
let WALK = 20;
function scalar(kind) {
  switch (kind) {
    case 0: return I(100); case 1: return I(2 ** 31) - 2 ** 30; case 2: return Math.round(R() * 1e6) / 100; case 3: return R() * 1e6 - 5e5;
    case 4: return P([0, -0, 1e21, 5e-324, 1.7976931348623157e308, 2 ** 53, 2 ** 53 - 1, -(2 ** 40), 4294967295, 4294967296, 0.1, 100.01]);
    case 5: return R() < 0.5; case 6: return null; case 7: return P(WORDS);
    case 8: return hex(16); case 9: return hex(8) + '-' + hex(4) + '-' + hex(4) + '-' + hex(4) + '-' + hex(12);
    case 10: return I(256) + '.' + I(256) + '.' + I(256) + '.' + I(256);
    case 11: return 'GET /item/' + I(1000) + ' took ' + I(90) + ' ms id=' + hex(10); case 12: return 'w' + I(40); case 13: return 'x'.repeat(I(300));
    case 14: return Math.round(R() * 1e7) / 1e4; case 15: return I(1e6) / 1e9;
    case 16: WALK = Math.round((WALK + (R() - 0.5) * 0.01) * 1e3) / 1e3; return WALK;
    default: return I(10);
  }
}
const intList = () => { const n = I(6), a = []; let v = I(50); for (let i = 0; i < n; i++) { v += R() < 0.8 ? I(20) : -I(30); if (v < 0) v = 0; a.push(v); } return a; };
function tree(d) {
  const t = R();
  if (d > 5 || t < 0.5) return scalar(I(17));
  if (t < 0.75) { const o = {}, n = I(5); for (let i = 0; i < n; i++) o[P(['a', 'b', 'c', 'k1', '1', '0', 'é', '😀', '__proto__', 'x y'])] = tree(d + 1); return o; }
  const a = [], n = I(5); for (let i = 0; i < n; i++) a.push(tree(d + 1)); return a;
}
function makeRows() {
  const n = P([1, 2, 5, 20, 60, 300, 1500]), mode = I(5), rows = [];
  if (mode === 0 || mode === 1) {   // flat objects; every key has a favorite kind and sometimes a stray value
    const keys = Array.from({ length: 1 + I(12) }, (_, i) => P(['id', 'ts', 'name', 'k' + i, 'é' + i, '5', 'level', 'msg', 'ip', 'tags']) + i), kind = keys.map(() => I(17)), sparse = mode === 1 ? 0.5 : 0;
    for (let r = 0; r < n; r++) { const o = {}; const order = R() < 0.2 ? keys.slice().reverse() : keys; for (const k of order) { if (R() < sparse) continue; const j = keys.indexOf(k); o[k] = R() < 0.05 ? scalar(I(17)) : kind[j] === 14 ? intList() : scalar(kind[j]); } if (R() < 0.1) o.list = intList(); rows.push(o); }
  } else if (mode === 2) { const shapes = Array.from({ length: 1 + I(4) }, () => tree(0)); for (let r = 0; r < n; r++) rows.push(R() < 0.7 ? JSON.parse(JSON.stringify(P(shapes))) : tree(0)); }
  else if (mode === 3) for (let r = 0; r < n; r++) rows.push(tree(0));
  else for (let r = 0; r < n; r++) rows.push(R() < 0.5 ? intList() : scalar(I(17)));
  return rows;
}
const canon = (v) => v === null || typeof v !== 'object' ? (Object.is(v, -0) ? '-0' : JSON.stringify(v)) : Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
const MODES = [{}, { block: 'flat' }, { block: 'nested' }, { exact: true }, { exact: true, block: 'flat' }, { check: 'xxh64' }, { check: 'xxh64', block: 'flat' }, { check: 'xxh64', block: 'nested' }, { share: true, blockBytes: 3000 }, { share: true, block: 'nested', blockBytes: 2500 }, { access: 'random' }, { paths: 'only' }, { paths: false, block: 'nested' }, { paths: true, block: 'nested', blockBytes: 2500 }, { share: true, paths: 'only', blockBytes: 3000 }, { access: 'random', paths: true }];
(async () => {
  await JF.init(); let bad = 0, files = 0, bytes = 0; const t0 = Date.now();
  for (let c = 0; c < N; c++) {
    const rows = makeRows(); let lines = rows.map((r) => JSON.stringify(r)); if (R() < 0.3) lines = lines.map((l) => (R() < 0.3 && l[0] === '{' ? '{ ' + l.slice(1) : l));
    const src = Buffer.from(lines.join('\n') + (R() < 0.15 ? '' : '\n')), want = lines.map((l) => canon(JSON.parse(l)));
    for (let m = 0; m < MODES.length; m++) {
      if (R() < 0.4) continue; const name = 'c' + String(c).padStart(4, '0') + 'm' + m, o = Object.assign({}, MODES[m], R() < 0.15 ? { blockBytes: 4000 + I(20000) } : {});
      let f; try { f = JF.pack(src, o); } catch (e) { console.log('PACK FAIL', name, e.message); bad++; continue; }
      let got; try { got = JF.unpack(f).map(canon); if (o.exact && !Buffer.from(JF.unpackText(f)).equals(src)) throw new Error('byte-exact text differs'); } catch (e) { console.log('READ FAIL', name, e.message); bad++; continue; }
      if (got.length !== want.length || got.some((g, i) => g !== want[i])) { const i = got.findIndex((g, j) => g !== want[j]); console.log('MISMATCH', name, 'row', i, String(got[i]).slice(0, 100), 'want', String(want[i]).slice(0, 100)); bad++; }
      fs.writeFileSync(path.join(out, name + '.lfc'), f); fs.writeFileSync(path.join(out, name + '.src'), src); fs.writeFileSync(path.join(out, name + '.mode'), JSON.stringify(o)); files++; bytes += f.length;
    }
  }
  console.log('fuzz-gen: ' + N + ' sources, ' + files + ' files (' + bytes + ' bytes), ' + bad + ' problems, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  process.exit(bad ? 1 : 0);
})();
