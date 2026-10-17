/* Copyright (c) 2026 LFC Foundry. MIT License.
   Tests for lzma-decode and its optional WebAssembly add-on: compares the decoders with Python's own lzma module (liblzma) on many inputs and settings.
   Run: node modules/lzma-decode/test/run.js   (needs python3 on the PATH; no network, no packages) */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const lzmaDecode = require(path.join(__dirname, '..', 'lzma-decode.js'));
let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) pass++; else { fail++; console.log('FAIL ' + name + (extra ? ' ' + extra : '')); } }

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeData(kind, n, seed) {
  const r = rng(seed), b = new Uint8Array(n);
  if (kind === 'random') for (let i = 0; i < n; i++) b[i] = r() * 256;
  else if (kind === 'zeros') b.fill(0);
  else if (kind === 'text') { const w = ['function', 'return', 'var', 'if', 'else', 'while', 'the', 'banana', ' ', '\n', '{', '}', '(', ')', ';', '0', '1', 'x', 'y']; let s = ''; while (s.length < n) s += w[(r() * w.length) | 0]; for (let i = 0; i < n; i++) b[i] = s.charCodeAt(i); }
  else if (kind === 'runs') { let i = 0; while (i < n) { const v = (r() * 256) | 0, l = 1 + ((r() * 300) | 0); for (let j = 0; j < l && i < n; j++) b[i++] = v; } }
  else if (kind === 'repeat') { const u = Math.max(1, (r() * 40) | 0); const pat = Array.from({ length: u }, () => (r() * 256) | 0); for (let i = 0; i < n; i++) b[i] = pat[i % u]; }
  else if (kind === 'mixed') { for (let i = 0; i < n; i++) b[i] = i % 97 < 60 ? (i * 7) & 255 : (r() * 256) | 0; }
  return b;
}
// python helper: reads JSON jobs on stdin, writes JSON {hex} results (raw stream without the leading zero byte, plus the .lzma file form)
const PY = `
import sys, json, lzma
jobs = json.load(sys.stdin); res = []
for j in jobs:
    data = bytes.fromhex(j['data'])
    f = [{"id": lzma.FILTER_LZMA1, "dict_size": 1 << 20, "lc": j['lc'], "lp": j['lp'], "pb": j['pb'], "preset": 6, "nice_len": 64}]
    z = lzma.compress(data, format=lzma.FORMAT_RAW, filters=f)
    assert z[0] == 0
    # a .lzma "alone" file for the same settings
    fa = lzma.compress(data, format=lzma.FORMAT_ALONE, filters=f)
    res.append({"raw": z[1:].hex(), "alone": fa.hex()})
print(json.dumps(res))
`;
const hex = (u8) => Buffer.from(u8).toString('hex');
const jobs = [];
const kinds = ['random', 'zeros', 'text', 'runs', 'repeat', 'mixed'];
const sizes = [1, 2, 7, 100, 4096, 70000];
const params = [[4, 0, 0], [3, 0, 2], [0, 0, 0], [0, 0, 4], [0, 4, 0], [2, 2, 3], [4, 0, 4], [1, 1, 1]];
let seed = 1;
for (const kind of kinds) for (const n of sizes) { const p = params[(seed++) % params.length]; jobs.push({ kind, n, p, seed, data: makeData(kind, n, seed) }); }
for (const p of params) jobs.push({ kind: 'text', n: 30000, p, seed: 99, data: makeData('text', 30000, 99) });
jobs.push({ kind: 'big-random-ish', n: 1500000, p: [4, 0, 0], seed: 5, data: makeData('mixed', 1500000, 5) });   // a long distance past the 1 MB dictionary tested below via text
const input = JSON.stringify(jobs.map((j) => ({ data: hex(j.data), lc: j.p[0], lp: j.p[1], pb: j.p[2] })));
// The streams come from Python's own xz compressor, which takes about 1 s for the 1.5 MB job. Its answer for a given input never has to change for these checks (any valid
// stream will do), so it is kept in the temp folder under a hash of the script and the input and reused on the next run. NO_FIXTURE_CACHE=1 turns that off.
const crypto = require('crypto'), fs = require('fs'), os = require('os'), cacheFile = require('path').join(os.tmpdir(), 'js-modules-lzma-decode-fixtures-' + crypto.createHash('sha1').update(PY).update(input).digest('hex').slice(0, 16) + '.json');
let out;
try { if (process.env.NO_FIXTURE_CACHE) throw 0; out = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (e) {
  out = JSON.parse(execFileSync('python3', ['-c', PY], { input, maxBuffer: 1 << 29 }).toString());
  try { fs.writeFileSync(cacheFile + '.' + process.pid, JSON.stringify(out)); fs.renameSync(cacheFile + '.' + process.pid, cacheFile); } catch (e2) { /* a read-only temp folder: no cache */ }
}
jobs.forEach((j, i) => {
  const raw = Uint8Array.from(Buffer.from(out[i].raw, 'hex')), label = `${j.kind} n=${j.n} lc=${j.p[0]} lp=${j.p[1]} pb=${j.p[2]}`;
  let got = null, err = '';
  try { got = lzmaDecode(raw, j.n, { lc: j.p[0], lp: j.p[1], pb: j.p[2] }); } catch (e) { err = e.message; }
  check('raw ' + label, got && Buffer.compare(Buffer.from(got), Buffer.from(j.data)) === 0, err);
  let got2 = null; err = '';
  try { const fb = Uint8Array.from(Buffer.from(out[i].alone, 'hex')); got2 = lzmaDecode.file(fb, j.n); check('file without a size is refused ' + label, (() => { try { lzmaDecode.file(fb); return false; } catch (e) { return /pass the size/.test(e.message); } })()); } catch (e) { err = e.message; }
  check('file ' + label, got2 && got2.length === j.n && Buffer.compare(Buffer.from(got2), Buffer.from(j.data)) === 0, err);
});
// the defaults are lc=4 lp=0 pb=0
{ const j = jobs.find((x) => x.p[0] === 4 && x.p[1] === 0 && x.p[2] === 0 && x.n === 4096 || (x.p[0] === 4 && x.p[1] === 0 && x.p[2] === 0 && x.n > 1000)); const i = jobs.indexOf(j); const raw = Uint8Array.from(Buffer.from(out[i].raw, 'hex')); check('defaults are lc=4 lp=0 pb=0', Buffer.compare(Buffer.from(lzmaDecode(raw, j.n)), Buffer.from(j.data)) === 0); }
// bad input is reported, not silently wrong
{ const j = jobs.find((x) => x.kind === 'text' && x.n === 30000 && x.p[0] === 4); const i = jobs.indexOf(j); const raw = Uint8Array.from(Buffer.from(out[i].raw, 'hex'));
  let threw = false; try { lzmaDecode(raw.subarray(0, raw.length >> 1), j.n, { lc: 4, lp: 0, pb: 0 }); } catch (e) { threw = /ended early|before the start/.test(e.message); }
  check('a cut-short stream throws', threw);
  // a cut-short stream that claims a huge result must fail at once, not after decoding 64 MB of nothing
  // (8 zero bytes decode as an endless run of zero literals, so the old end-only check had to fill all 64 MB before it complained)
  { const t1 = Date.now(); let msg = ''; try { lzmaDecode(new Uint8Array(8), 64 << 20, { lc: 4, lp: 0, pb: 0 }); } catch (e) { msg = e.message; }
    const ms1 = Date.now() - t1; check('early truncation check: cut stream with a 64 MB claim fails fast (took ' + ms1 + ' ms)', /ended early/.test(msg) && ms1 < 400, msg); }
  // maxSize ceiling
  { let msg = ''; try { lzmaDecode(raw, j.n, { lc: 4, lp: 0, pb: 0, maxSize: j.n - 1 }); } catch (e) { msg = e.message; } check('maxSize below the size is refused before allocating', /maxSize/.test(msg), msg);
    check('maxSize equal to the size decodes', Buffer.compare(Buffer.from(lzmaDecode(raw, j.n, { lc: 4, lp: 0, pb: 0, maxSize: j.n })), Buffer.from(j.data)) === 0);
    msg = ''; try { lzmaDecode(raw, 4e9, { maxSize: 1 << 20 }); } catch (e) { msg = e.message; } check('a 4 GB claim with maxSize is an Error, not a RangeError or a crash', /maxSize/.test(msg), msg);
    const fi = jobs.findIndex((x) => x.kind === 'text' && x.n === 30000 && x.p[0] === 4); const fb = Uint8Array.from(Buffer.from(out[fi].alone, 'hex')); msg = '';
    try { lzmaDecode.file(fb, 30000, { maxSize: 10 }); } catch (e) { msg = e.message; } check('file(): maxSize is passed through', /maxSize/.test(msg), msg);
    check('file(): maxSize large enough still decodes', lzmaDecode.file(fb, 30000, { maxSize: 30000 }).length === 30000); }
  threw = false; try { lzmaDecode(raw, j.n, { lc: 9 }); } catch (e) { threw = true; } check('lc 9 is refused', threw);
  threw = false; try { lzmaDecode.file(new Uint8Array(5)); } catch (e) { threw = true; } check('a tiny file is refused', threw);
  // speed: decode 1.5 MB in well under 2 seconds
  const k = jobs.findIndex((x) => x.n === 1500000); const raw2 = Uint8Array.from(Buffer.from(out[k].raw, 'hex')); const t0 = Date.now(); lzmaDecode(raw2, 1500000); const ms = Date.now() - t0; check('1.5 MB decodes in under 2 s (took ' + ms + ' ms)', ms < 2000); }

// ---- the optional WebAssembly add-on (lzma-decode-wasm.js): same bytes, same errors, falls back by itself ----
{
  const wasmPath = path.join(__dirname, '..', 'lzma-decode-wasm.js');
  const lzmaWasm = require(wasmPath);
  const same = (a, b) => a && b && a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
  check('wasm add-on found WebAssembly', lzmaWasm.available === true);
  let nWasm = 0, nJs = 0;
  jobs.forEach((j, i) => {
    const raw = Uint8Array.from(Buffer.from(out[i].raw, 'hex')), o = { lc: j.p[0], lp: j.p[1], pb: j.p[2] }, label = `${j.kind} n=${j.n} lc=${j.p[0]} lp=${j.p[1]} pb=${j.p[2]}`;
    let got = null, err = '';
    try { got = lzmaWasm(raw, j.n, o); } catch (e) { err = e.message; }
    check('wasm add-on, raw ' + label, same(got, j.data), err);
    if (lzmaWasm.engine === 'wasm') nWasm++; else nJs++;
    check('wasm add-on engine ' + label, lzmaWasm.engine === (o.lc + o.lp <= 4 ? 'wasm' : 'js'), lzmaWasm.engine);
    const fb = Uint8Array.from(Buffer.from(out[i].alone, 'hex'));
    check('wasm add-on, file ' + label, same(lzmaWasm.file(fb, j.n), j.data));
    { let e1 = '', e2 = ''; try { lzmaDecode.file(fb); } catch (e) { e1 = e.message; } try { lzmaWasm.file(fb); } catch (e) { e2 = e.message; } check('wasm add-on, file without a size is refused with the JS message ' + label, e1 !== '' && e1 === e2, e2); }
  });
  check('wasm add-on took the wasm path for every liblzma job (liblzma itself only makes lc + lp up to 4)', nWasm > 20 && nJs === 0, nWasm + '/' + nJs);
  const own = lzmaWasm(Uint8Array.from(Buffer.from(out[0].raw, 'hex')), jobs[0].n, { lc: jobs[0].p[0], lp: jobs[0].p[1], pb: jobs[0].p[2] });
  check('wasm add-on result stands alone (own buffer of exactly its size)', own.buffer.byteLength === own.length && own.byteOffset === 0);
  // damaged and cut-short streams: both decoders must agree, either the same bytes or the same error
  { const j = jobs.find((x) => x.kind === 'text' && x.n === 30000 && x.p[0] === 4); const i = jobs.indexOf(j); const raw = Uint8Array.from(Buffer.from(out[i].raw, 'hex')), o = { lc: 4, lp: 0, pb: 0 };
    const run = (f, buf, n, oo) => { try { return { v: f(buf, n, oo || o) }; } catch (e) { return { e: e.message }; } };
    let agree = 0, bad = 0, r = rng(7);
    for (let t = 0; t < 400; t++) {
      const buf = raw.slice(); const flips = 1 + ((r() * 3) | 0); for (let k = 0; k < flips; k++) buf[(r() * buf.length) | 0] ^= 1 + ((r() * 255) | 0);
      const cut = t % 4 === 0 ? buf.subarray(0, (r() * buf.length) | 0) : buf, n = t % 7 === 0 ? j.n + 500 : j.n;
      const a = run(lzmaDecode, cut, n), b = run(lzmaWasm, cut, n);
      if ((a.e !== undefined && a.e === b.e) || (a.v && b.v && same(a.v, b.v))) agree++; else { bad++; if (bad < 4) console.log('  differs at trial ' + t + ': JS ' + (a.e || 'ok') + ' / wasm ' + (b.e || 'ok')); }
    }
    check('400 damaged or cut-short streams: wasm add-on and JS decoder agree on the bytes or the error (' + agree + ' agree)', bad === 0);
    let msg = ''; try { lzmaWasm(raw.subarray(0, raw.length >> 1), j.n, o); } catch (e) { msg = e.message; } check('wasm add-on: a cut-short stream throws the JS decoder\'s error', /ended early|before the start/.test(msg), msg);
    const t1 = Date.now(); msg = ''; try { lzmaWasm(new Uint8Array(8), 64 << 20, o); } catch (e) { msg = e.message; } const ms1 = Date.now() - t1;
    check('wasm add-on: cut stream with a 64 MB claim fails fast (took ' + ms1 + ' ms)', /ended early/.test(msg) && ms1 < 800, msg);
    msg = ''; try { lzmaWasm(raw, j.n, { lc: 4, lp: 0, pb: 0, maxSize: j.n - 1 }); } catch (e) { msg = e.message; } check('wasm add-on: maxSize below the size is refused', /maxSize/.test(msg), msg);
    check('wasm add-on: maxSize equal to the size decodes', same(lzmaWasm(raw, j.n, { lc: 4, lp: 0, pb: 0, maxSize: j.n }), j.data));
    msg = ''; try { lzmaWasm(raw, j.n, { lc: 9 }); } catch (e) { msg = e.message; } check('wasm add-on: lc 9 is refused with the JS message', /lc 0-8/.test(msg), msg);
    msg = ''; try { lzmaWasm(raw, 4e9, { maxSize: 1 << 20 }); } catch (e) { msg = e.message; } check('wasm add-on: a 4 GB claim with maxSize is an Error', /maxSize/.test(msg), msg);
    { const o2 = { lc: 3, lp: 2, pb: 1 }, a = run(lzmaDecode, raw, j.n, o2), b = run(lzmaWasm, raw, j.n, o2);     // lc + lp above 4: handed to the JS decoder (liblzma cannot make such a stream, so this is garbage in, same garbage out)
      check('wasm add-on: lc + lp above 4 goes to the JS decoder and agrees', lzmaWasm.engine === 'js' && ((a.e !== undefined && a.e === b.e) || (a.v && b.v && same(a.v, b.v)))); }
    check('wasm add-on: zero-size result', lzmaWasm(raw, 0, o).length === 0);
  }
  // a page that forbids WebAssembly (or an old browser): the add-on loads, says so, and decodes with the JS decoder
  { const saved = globalThis.WebAssembly; delete require.cache[require.resolve(wasmPath)]; globalThis.WebAssembly = undefined;
    let nw; try { nw = require(wasmPath); } finally { globalThis.WebAssembly = saved; delete require.cache[require.resolve(wasmPath)]; }
    const j = jobs.find((x) => x.kind === 'text' && x.n === 30000 && x.p[0] === 4); const raw = Uint8Array.from(Buffer.from(out[jobs.indexOf(j)].raw, 'hex'));
    check('without WebAssembly: available is false', nw.available === false);
    check('without WebAssembly: still decodes (JS decoder)', same(nw(raw, j.n, { lc: 4, lp: 0, pb: 0 }), j.data) && nw.engine === 'js'); }
  // speed (information only): 1.5 MB, warm, median of 5
  { const k = jobs.findIndex((x) => x.n === 1500000), raw2 = Uint8Array.from(Buffer.from(out[k].raw, 'hex')), med = (f) => { const a = []; for (let i = 0; i < 5; i++) { const t = process.hrtime.bigint(); f(); a.push(Number(process.hrtime.bigint() - t) / 1e6); } return a.sort((x, y) => x - y)[2]; };
    const tj = med(() => lzmaDecode(raw2, 1500000)), tw = med(() => lzmaWasm(raw2, 1500000)); console.log(`  info: 1.5 MB warm decode, median of 5: JS ${tj.toFixed(1)} ms, wasm ${tw.toFixed(1)} ms (smaller is better)`); }
}
console.log(`lzma-decode: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
