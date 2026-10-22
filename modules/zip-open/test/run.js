/* Copyright (c) 2026 LFC Foundry. MIT License. Zip and Excel checks for zip-open, including hostile files. Run: node modules/zip-open/test/run.js */
'use strict';
var assert = require('assert'), zlib = require('zlib');
var U = require('../zip-open.js'), Z = require('./zipmake.js');
var n = 0, pending = [], chain = Promise.resolve();
function t(name, fn) { chain = chain.then(function () { return Promise.resolve().then(fn); }).then(function () { n++; }, function (e) { console.log('FAIL', name, '\n  ', e && e.stack || e); process.exitCode = 1; }); pending.push(chain); }
var u8 = function (b) { return new Uint8Array(b.buffer, b.byteOffset, b.length); };
var csv = 'source,target,weight\nA,B,2\nB,C,1\nA,C,3\n';

t('zip of mixed files: each read in its own way and merged', async function () {
  var z = Z.makeZip([
    { name: 'data/edges.csv', data: csv }, { name: 'data/nodes.json', data: JSON.stringify({ nodes: [{ id: 'A', group: 'x' }, { id: 'D' }], edges: [{ from: 'C', to: 'D' }] }) },
    { name: 'notes/readme.txt', data: 'hello' }, { name: 'img/logo.png', data: Buffer.from([137, 80, 78, 71, 0, 1]) }, { name: '__MACOSX/._edges.csv', data: 'junk' }, { name: 'emptydir/', data: '', method: 0 }
  ]);
  var r = await U.expand(u8(z), 'pack.zip');
  assert.deepEqual(r.files.map(function (f) { return f.path; }), ['data/edges.csv', 'data/nodes.json', 'notes/readme.txt']);
  assert.ok(r.notes.some(function (x) { return /png/.test(x); }));
});
t('stored (uncompressed) entries and a zip with junk in front', async function () {
  var z = Z.makeZip([{ name: 'e.csv', data: csv, method: 0 }]);
  var r = await U.expand(u8(Buffer.concat([Buffer.from('MZ junk header '.repeat(10)), z])), 'x.zip');
  assert.equal(r.files[0].text, csv);
});
t('utf-16 and latin-1 text', async function () {
  var u16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(csv, 'utf16le')]);
  var r = await U.expand(u8(Z.makeZip([{ name: 'a.csv', data: u16 }, { name: 'b.csv', data: Buffer.from('source,target\ncaf\xe9,x\n', 'latin1') }])), 'x.zip');
  assert.equal(r.files[0].text, csv); assert.ok(/café/.test(r.files[1].text));
});
t('zip inside a zip, and the depth limit', async function () {
  var inner = Z.makeZip([{ name: 'e.csv', data: csv }]);
  var r = await U.expand(u8(Z.makeZip([{ name: 'in.zip', data: inner }])), 'o.zip');
  assert.equal(r.files.length, 1);
  var deep = inner; for (var i = 0; i < 6; i++) deep = Z.makeZip([{ name: 'z.zip', data: deep }]);
  await assert.rejects(U.expand(u8(deep), 'd.zip'), /no files I can read/);
});
t('path tricks never escape (names only; nothing is written)', async function () {
  var r = await U.expand(u8(Z.makeZip([{ name: '../../etc/x.csv', data: csv }, { name: '/abs/y.csv', data: csv }, { name: 'a\\b\\z.csv', data: csv }])), 'x.zip');
  assert.deepEqual(r.files.map(function (f) { return f.path; }).sort(), ['a/b/z.csv', 'abs/y.csv', 'etc/x.csv']);
});
t('Excel: sheets, text, numbers, dates, booleans, blank rows, sparse columns', async function () {
  var x = Z.makeXlsx([{ name: 'Edges', rows: [['source', 'target', 'weight', 'when'], ['A', 'B', 2.5, { d: 45000 }], [], ['B, "q"', 'C', 1, { d: 45000.5 }], ['C', 'A', null, null, { b: 1 }]] }, { name: 'People', rows: [['id', 'label', 'group'], ['A', 'Ann', 'red'], ['B', 'Bob', { inline: 'blue' }], ['C', 'Cy', 'red']] }]);
  var r = await U.expand(u8(x), 'book.xlsx');
  assert.equal(r.files.length, 2);
  assert.equal(r.files[0].name, 'book - Edges.csv');
  assert.equal(r.files[0].text.split('\n')[1], 'A,B,2.5,2023-03-15');
  assert.equal(r.files[0].text.split('\n')[2], '"B, ""q""",C,1,2023-03-15 12:00:00');
  assert.equal(r.files[0].text.split('\n')[3], 'C,A,,,TRUE');
  var inZip = await U.expand(u8(Z.makeZip([{ name: 'sub/book.xlsx', data: x }, { name: 'old.xls', data: 'x' }])), 'o.zip');
  assert.equal(inZip.files.length, 2); assert.ok(inZip.notes.some(function (q) { return /old Excel/.test(q); }));
});
t('Excel: a cell far off to the right or down does not blow up memory', async function () {
  var sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c><c r="XFD1" t="inlineStr"><is><t>z</t></is></c><c r="ZZZZ1"><v>1</v></c></row><row r="1048576"><c r="B1048576"><v>5</v></c></row></sheetData></worksheet>';
  var x = Z.makeZip([{ name: '[Content_Types].xml', data: '<a/>' }, { name: 'xl/workbook.xml', data: '<workbook><sheets><sheet name="S" r:id="rId1"/></sheets></workbook>' }, { name: 'xl/_rels/workbook.xml.rels', data: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>' }, { name: 'xl/worksheets/sheet1.xml', data: sheet }]);
  var t0 = Date.now(), r = await U.expand(u8(x), 'wide.xlsx');
  assert.ok(Date.now() - t0 < 2000); assert.ok(r.files[0].text.length < 20000, 'size ' + r.files[0].text.length);
});
var bomb300cache; function bomb300() { return bomb300cache || (bomb300cache = zlib.deflateRawSync(Buffer.alloc(300e6))); }   // 300 MB of zeros squeezed once and shared by the two bomb checks (about 0.7 s each time)
t('hostile: bomb that claims to be small', async function () {
  var big = bomb300(), t0 = Date.now();
  var z = Z.makeZip([{ name: 'a.csv', raw: big, data: csv, usize: 100, crc: 0 }, { name: 'b.csv', data: csv }]);
  var r = await U.expand(u8(z), 'bomb.zip');
  assert.deepEqual(r.files.map(function (f) { return f.name; }), ['b.csv']); assert.ok(r.notes.some(function (q) { return /more than it says|damaged/.test(q); }));
  assert.ok(Date.now() - t0 < 5000, 'took ' + (Date.now() - t0));
});
t('hostile: bomb that tells the truth about being huge', async function () {
  var big = bomb300(), z = Z.makeZip([{ name: 'a.csv', raw: big, usize: 300e6, crc: 0 }, { name: 'b.csv', data: csv }]);
  var r = await U.expand(u8(z), 'bomb.zip');
  assert.deepEqual(r.files.map(function (f) { return f.name; }), ['b.csv']); assert.ok(r.notes.some(function (q) { return /too large/.test(q); }));
});
t('hostile: total unpacked budget across many files', async function () {
  var chunk = Buffer.from('a,b\n' + 'x,y\n'.repeat(250000)), files = [];
  for (var i = 0; i < 12; i++) files.push({ name: 'f' + i + '.csv', data: chunk });
  var r = await U.expand(u8(Z.makeZip(files)), 'many.zip', { maxTotalBytes: 5e6 });
  assert.ok(r.files.length >= 1 && r.files.length < 12); assert.ok(r.notes.some(function (q) { return /safety limit/.test(q); }));
});
t('hostile: bad checksum, cut off data, wrong sizes, password flag, odd method, lying offsets', async function () {
  var good = { name: 'ok.csv', data: csv };
  var z = Z.makeZip([good, { name: 'crc.csv', data: csv, crc: 1234 }, { name: 'pw.csv', data: csv, flags: 1 }, { name: 'm.csv', data: csv, method: 14 }, { name: 'off.csv', data: csv, offset: 9999999 }, { name: 'us.csv', data: csv, usize: 3 }]);
  var r = await U.expand(u8(z), 'bad.zip');
  assert.deepEqual(r.files.map(function (f) { return f.name; }), ['ok.csv']);
  ['crc.csv', 'pw.csv', 'm.csv', 'off.csv', 'us.csv'].forEach(function (nm) { assert.ok(r.notes.some(function (q) { return q.indexOf(nm) >= 0; }), nm); });
  var whole = Z.makeZip([good]);
  await assert.rejects(U.expand(u8(whole.subarray(0, whole.length - 10)), 'cut.zip'), /not a zip/);
  await assert.rejects(U.expand(u8(Buffer.from('not a zip at all, just text, long enough to pass a size check')), 'x.zip'), /not a zip/);
  await assert.rejects(U.expand(new Uint8Array(0), 'e.zip'), /not a zip/);
});
t('hostile: huge entry counts and names', async function () {
  var files = []; for (var i = 0; i < 30000; i++) files.push({ name: 'f' + i + '.dat', data: '', method: 0 });
  files.push({ name: 'x'.repeat(60000) + '.csv', data: csv });
  var z = Z.makeZip(files), r;
  try { r = await U.expand(u8(z), 'many.zip'); } catch (e) { r = { err: e.message }; }
  assert.ok(r.err ? /no files I can read/.test(r.err) : true);
  var z2 = Z.makeZip([{ name: 'a.csv', data: csv }]); z2.writeUInt16LE(60000, z2.length - 22 + 10);   // count field lies
  var r2 = await U.expand(u8(z2), 'lie.zip'); assert.equal(r2.files.length, 1);
});
t('fuzz: byte flips and cuts of valid zips never crash or hang', async function () {
  var base = Z.makeZip([{ name: 'a.csv', data: csv }, { name: 'b.json', data: '{"nodes":[{"id":1}],"edges":[]}' }, { name: 'c.txt', data: 'x -> y' }]);
  var x = Z.makeXlsx([{ name: 'S', rows: [['source', 'target'], ['a', 'b'], ['b', 'c']] }]);
  var s = 7, rnd = function () { return (s = (s * 16807) % 2147483647) / 2147483647; }, t0 = Date.now(), ok = 0, rej = 0;
  for (var k = 0; k < 1500; k++) {
    var src = k % 2 ? base : x, b = Buffer.from(src);
    var flips = 1 + Math.floor(rnd() * 6); for (var f = 0; f < flips; f++) b[Math.floor(rnd() * b.length)] = Math.floor(rnd() * 256);
    if (rnd() < 0.3) b = b.subarray(0, Math.floor(rnd() * b.length));
    try { await U.expand(u8(b), 'f.zip'); ok++; } catch (e) { assert.ok(e instanceof Error && typeof e.message === 'string'); rej++; }
  }
  assert.ok(Date.now() - t0 < 60000, 'slow: ' + (Date.now() - t0)); assert.ok(ok > 0 && rej > 0);
});

t('read(): the bytes of any listed entry, checked, and textExt picks which files count as text', async function () {
  var png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]), z = u8(Z.makeZip([{ name: 'img/a.png', data: png }, { name: 'n.dat', data: 'abc' }, { name: 'bad.bin', data: png, crc: 5 }]));
  var toc = U.list(z), by = {}; toc.entries.forEach(function (e) { by[e.path] = e; });
  var got = await U.read(z, by['img/a.png']);
  assert.deepEqual(Array.from(got.bytes), Array.from(png));
  assert.ok(/checksum/.test((await U.read(z, by['bad.bin'])).skip));
  assert.ok(/too large/.test((await U.read(z, by['img/a.png'], 3)).skip));
  assert.equal((await U.expand(z, 'x.zip', { textExt: /\.dat$/ })).files[0].text, 'abc');
});
t('crc32: the standard check value, and the same answer as a plain bit-by-bit CRC for every length and start position', function () {
  assert.equal(U.crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(U.crc32(new Uint8Array(0)), 0);
  var table = new Int32Array(256), i, k, c;
  for (i = 0; i < 256; i++) { c = i; for (k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; table[i] = c; }
  var plain = function (b) { var r = -1; for (var q = 0; q < b.length; q++) r = (r >>> 8) ^ table[(r ^ b[q]) & 255]; return (r ^ -1) >>> 0; };
  var sd = 7, rnd = function () { return (sd = (sd * 16807) % 2147483647) & 255; };
  var buf = new Uint8Array(400); for (i = 0; i < buf.length; i++) buf[i] = rnd();
  var bad = 0, tried = 0;
  for (var off = 0; off < 9; off++) for (var len = 0; len < 90; len++) { var v = buf.subarray(off, off + len); tried++; if (U.crc32(v) !== plain(v)) bad++; }
  var big = new Uint8Array(70001); for (i = 0; i < big.length; i++) big[i] = rnd() ^ (i >> 5);
  tried++; if (U.crc32(big) !== plain(big)) bad++;
  tried++; if (U.crc32(big.subarray(3)) !== plain(big.subarray(3))) bad++;
  tried++; if (U.crc32(Buffer.from(big)) !== plain(big)) bad++;
  tried++; if (U.crc32(Array.prototype.slice.call(buf, 0, 50)) !== plain(buf.subarray(0, 50))) bad++;   // a plain array still works
  if (zlib.crc32) { tried++; if (U.crc32(big) !== zlib.crc32(big)) bad++; }
  assert.equal(bad, 0, bad + ' of ' + tried + ' differ');
});
t('crc32 in WebAssembly (1.2.0): used from 1,024 bytes up, the same answer as the plain loop for every length around the switch, every start position, the 1 MB chunk edges and a big buffer', function () {
  assert.equal(U.wasmAvailable(), true);
  var sd = 11, rnd = function () { return (sd = (sd * 16807) % 2147483647) & 255; }, i, bad = 0, tried = 0;
  var buf = new Uint8Array(4200); for (i = 0; i < buf.length; i++) buf[i] = rnd() ^ (i >> 3);
  var check = function (v) { tried++; if (U.crc32(v) !== U.crc32(v, true)) bad++; };
  for (var off = 0; off < 9; off++) for (var len = 1000; len < 1100; len++) check(buf.subarray(off, off + len));
  for (len = 0; len < 4190; len += 37) check(buf.subarray(3, 3 + len));
  var mb = new Uint8Array((1 << 20) * 3 + 7); for (i = 0; i < mb.length; i += 3) { mb[i] = rnd(); mb[i + 1] = i >> 9; mb[i + 2] = 1; }
  [1 << 20, (1 << 20) - 1, (1 << 20) + 1, 2 << 20, mb.length].forEach(function (L) { check(mb.subarray(0, L)); check(mb.subarray(5, 5 + L - 5)); });
  tried++; if (U.crc32(Buffer.from(mb)) !== (zlib.crc32 ? zlib.crc32(mb) : U.crc32(mb, true))) bad++;
  tried++; if (U.crc32(Buffer.alloc(5000, 255)) !== U.crc32(new Uint8Array(5000).fill(255), true)) bad++;
  tried++; if (U.crc32(Array.prototype.slice.call(mb, 0, 3000)) !== U.crc32(mb.subarray(0, 3000), true)) bad++;   // a plain array still works
  assert.equal(bad, 0, bad + ' of ' + tried + ' differ');
});
t('crc32 in WebAssembly: without WebAssembly, with a module the page refuses, or with a broken Instance, the plain loop gives the same answers', function () {
  var path = require.resolve('../zip-open.js'), saved = globalThis.WebAssembly, data = new Uint8Array(70000).map(function (_, q) { return (q * 31 + (q >> 5)) & 255; }), want = U.crc32(data, true);
  function fresh() { delete require.cache[path]; var m = require(path); delete require.cache[path]; return m; }
  try {
    globalThis.WebAssembly = undefined; var a = fresh(); assert.equal(a.wasmAvailable(), false); assert.equal(a.crc32(data), want);
    globalThis.WebAssembly = { Module: function () { throw new Error('refused by the page policy'); }, Instance: saved.Instance, Memory: saved.Memory }; var b = fresh(); assert.equal(b.wasmAvailable(), false); assert.equal(b.crc32(data), want);
    globalThis.WebAssembly = { Module: saved.Module, Instance: function () { return { exports: { init: function () {}, __heap_base: { value: 1024 }, memory: { buffer: new ArrayBuffer(65536), grow: function () { throw new Error('no memory'); } } } }; }, Memory: saved.Memory };
    var c = fresh(); assert.equal(c.wasmAvailable(), false); assert.equal(c.crc32(data), want);
  } finally { globalThis.WebAssembly = saved; }
  assert.equal(U.wasmAvailable(), true);
});
t('the embedded WebAssembly is what wasm/crc32.c builds (embed.py --check, and build.sh --check when clang is installed)', function () {
  var cp = require('child_process'), dir = require('path').join(__dirname, '..', 'wasm');
  cp.execFileSync('python3', [require('path').join(dir, 'embed.py'), '--check'], { stdio: 'pipe' });
  var has = false; try { cp.execFileSync('clang', ['--version'], { stdio: 'pipe' }); has = true; } catch (e) { /* no clang here: the build proof is skipped */ }
  if (has) cp.execFileSync('sh', [require('path').join(dir, 'build.sh'), '--check'], { stdio: 'pipe' });
});
t('compile early: wasmReady() settles to true and wasmModule() is the compiled module; with no WebAssembly it settles to false and the module is null; the answers do not change', function () {
  var path = require.resolve('../zip-open.js'), saved = globalThis.WebAssembly, data = new Uint8Array(5000).map(function (_, q) { return (q * 7 + 3) & 255; }), want = U.crc32(data, true);
  function fresh() { delete require.cache[path]; var m = require(path); delete require.cache[path]; return m; }
  var a = fresh();
  return a.wasmReady().then(function (v) {
    assert.strictEqual(v, true); assert.ok(a.wasmModule() instanceof WebAssembly.Module); assert.strictEqual(a.crc32(data), want); assert.strictEqual(a.wasmAvailable(), true);
    globalThis.WebAssembly = undefined; var b = fresh();
    return b.wasmReady().then(function (w) { assert.strictEqual(w, false); assert.strictEqual(b.wasmModule(), null); assert.strictEqual(b.crc32(data), want); });
  }).then(function () { globalThis.WebAssembly = saved; }, function (e) { globalThis.WebAssembly = saved; throw e; });
});
chain.then(function () { console.log(process.exitCode ? 'zip-open: FAILED' : 'zip-open: all ' + n + ' checks passed'); });
