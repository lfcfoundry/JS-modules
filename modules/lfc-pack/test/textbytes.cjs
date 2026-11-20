// Copyright (c) 2026 LFC Foundry. MIT License.
// Reading text as bytes (since 0.14.0): unpackColumns(bytes, { text: 'bytes' }) and open().columns(i, { text: 'bytes' }) give plain text columns as { bytes, start, end } and dictionary columns as { kind: 'dict', labels, ids }; every value decodes to the same string the default read gives; other layouts stay strings. Run: node modules/lfc-pack/test/textbytes.cjs
'use strict';
const JF = require('../lfc-pack.js'), td = new TextDecoder();
let seed = 17; const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const word = () => { let s = ''; const n = 1 + Math.floor(r() * 9); for (let i = 0; i < n; i++) s += String.fromCharCode(97 + Math.floor(r() * 26)); return s; };
const cell = (x, i) => td.decode(x.bytes.subarray(x.start[i], x.end[i]));
const same = (name, plain, got, bad) => {
  let ok = true, n = plain.length;
  if (Array.isArray(got)) ok = got.length === n && got.every((v, i) => v === plain[i]);
  else if (got && got.kind === 'dict') { ok = got.ids.length === n; for (let i = 0; ok && i < n; i++) ok = cell(got.labels, got.ids[i]) === plain[i]; }
  else if (got && got.bytes) { ok = got.start.length === n && got.end.length === n; for (let i = 0; ok && i < n; i++) ok = cell(got, i) === plain[i]; }
  else if (ArrayBuffer.isView(got)) ok = got.length === n && Array.from(got).every((v, i) => Object.is(v, plain[i]));
  else ok = false;
  if (!ok) { bad.push(name); }
};
(async () => {
  await JF.init(); let bad = [], cases = 0, shapes = {};
  const N = 12000, o = { level: 3, blockBytes: 65536, share: false };
  const cols = {
    plain: Array.from({ length: N }, () => word() + word() + Math.floor(r() * 1e9)),
    dict: Array.from({ length: N }, () => ['alpha', 'beta', 'gamma', 'delta'][Math.floor(r() * 4)]),
    dictWide: Array.from({ length: N }, () => 'w' + Math.floor(r() * 280)),
    dictBig: Array.from({ length: N }, () => 'b' + Math.floor(r() * 3000 % 700)),
    unicode: Array.from({ length: N }, () => word() + 'é中文' + word()),
    empties: Array.from({ length: N }, (_, i) => (i % 4 ? word() + i : '')),
    allEmpty: Array.from({ length: N }, () => ''),
    nullable: Array.from({ length: N }, (_, i) => (i % 7 ? word() + i : null)),
    hex: Array.from({ length: N }, () => Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join('')),
    ts: Array.from({ length: N }, (_, i) => '2024-01-01 10:00:' + String(i % 60).padStart(2, '0')),
    num: Float64Array.from({ length: N }, (_, i) => i * 1.5),
    int: Float64Array.from({ length: N }, (_, i) => i),
  };
  const file = await JF.packBlock(cols, o);
  const plainR = JF.unpackColumns(file, {}), byteR = JF.unpackColumns(file, { text: 'bytes' });
  if (plainR.length !== byteR.length) bad.push('block count');
  for (let b = 0; b < plainR.length; b++) for (const k of Object.keys(plainR[b].cols)) { cases++; same(k + '#' + b, plainR[b].cols[k], byteR[b].cols[k], bad); const g = byteR[b].cols[k]; shapes[k] = Array.isArray(g) ? 'array' : ArrayBuffer.isView(g) ? 'typed' : g.kind === 'dict' ? 'dict' : 'bytes'; }
  const R = JF.open(file); const rd = await R; const st = JF.stats(file);
  for (let i = 0; i < st.length; i++) { const a = await rd.columns(i, {}), c = await rd.columns(i, { text: 'bytes' }); for (const k of Object.keys(a.cols)) { cases++; same('open ' + k + '#' + i, a.cols[k], c.cols[k], bad); } }
  let msg = ''; try { JF.unpackColumns(file, { text: 'strings' }); } catch (e) { msg = e.message; } if (!/text must be/.test(msg)) bad.push('bad option accepted');
  let pmsg = ''; try { await JF.unpackColumnsParallel(file, { text: 'bytes' }); } catch (e) { pmsg = e.message; } if (!/not supported/.test(pmsg)) bad.push('parallel accepted');
  const keep = JF.unpackColumns(file, {}); if (!Array.isArray(keep[0].cols.plain)) bad.push('default read changed');   // the option is scoped to its own call
  const want = { plain: 'bytes', dict: 'dict', dictWide: 'dict', dictBig: 'dict', unicode: 'bytes', empties: 'bytes', allEmpty: 'dict', hex: 'array', ts: 'dict', nullable: 'array', num: 'typed', int: 'typed' };
  for (const k of Object.keys(want)) if (shapes[k] !== want[k]) console.log('note: ' + k + ' comes back as ' + shapes[k] + ' (expected ' + want[k] + ')');
  console.log((bad.length ? 'FAIL ' + bad.slice(0, 6).join(',') : 'ok  ') + ' text as bytes: ' + cases + ' column reads, bad ' + bad.length + '; shapes ' + JSON.stringify(shapes));
  process.exitCode = bad.length ? 1 : 0; if (JF.close) JF.close();
})().catch((e) => { console.error(e); process.exit(1); });
