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
t('an EOCD signature in a ZIP comment does not replace the real directory', async function () {
  var z = Z.makeZip([{ name: 'ok.csv', data: csv }]), eocd = z.length - 22, comment = Buffer.alloc(40);
  comment.writeUInt32LE(0x06054b50, 0);
  var withComment = Buffer.concat([z, comment]);
  withComment.writeUInt16LE(comment.length, eocd + 20);
  var toc = U.list(u8(withComment));
  assert.deepEqual(toc.entries.map(function (e) { return e.path; }), ['ok.csv']);
  var r = await U.expand(u8(withComment), 'comment.zip');
  assert.deepEqual(r.files.map(function (f) { return f.name; }), ['ok.csv']);
});
t('a zip with bytes after the end record still opens', async function () {
  var z = Z.makeZip([{ name: 'ok.csv', data: csv }]);
  [Buffer.from('JUNK1234'), Buffer.alloc(512)].forEach(function (tail) {
    assert.deepEqual(U.list(u8(Buffer.concat([z, tail]))).entries.map(function (e) { return e.path; }), ['ok.csv']);
  });
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

// ---- 1.4.0: streaming from a Blob must give the very same answers (files, notes, errors) as the in-memory path ----
var WT = require('worker_threads');
function spawn(code) {   // Node worker threads standing in for Web Workers
  var w = new WT.Worker("const {parentPort}=require('worker_threads');global.self=global;global.postMessage=(m)=>parentPort.postMessage(m);parentPort.on('message',d=>{if(global.onmessage)global.onmessage({data:d});});" + code, { eval: true }), o = { onmessage: null, onerror: null, postMessage: function (m) { w.postMessage(m); }, terminate: function () { w.terminate(); } };
  w.on('message', function (d) { if (o.onmessage) o.onmessage({ data: d }); }); w.on('error', function (e) { if (o.onerror) o.onerror(e); }); return o;
}
var helperRuns = 0;
async function both(buf, name, opts) {
  var a, b, c;
  try { a = await U.expand(u8(buf), name, opts); } catch (e) { a = { err: e.message }; }
  try { b = await U.expandBlob(new Blob([buf]), name, opts); } catch (e) { b = { err: e.message }; }
  try { c = await U.expandBlob(new Blob([buf]), name, Object.assign({ workers: 3, spawn: spawn, helperMinBytes: 0 }, opts)); helperRuns++; } catch (e) { c = { err: e.message }; }
  var p; try { p = await U.expandBlob(new Blob([buf]), name, Object.assign({ _wholeMax: 0 }, opts)); } catch (e) { p = { err: e.message }; }
  if (JSON.stringify(p) !== JSON.stringify(b)) throw new Error(name + ': read in pieces differs from read in one go');
  assert.deepStrictEqual(c, a, 'with helpers: ' + name);
  return [a, b];
}
t('streaming: expandBlob gives the same files and notes as expand for ordinary, odd and hostile zips', async function () {
  var good = { name: 'ok.csv', data: csv }, big = Buffer.from('a,b\n' + 'x,y\n'.repeat(400000));
  var zips = {
    mixed: Z.makeZip([{ name: 'data/edges.csv', data: csv }, { name: 'data/nodes.json', data: '{"nodes":[{"id":"A"}],"edges":[]}' }, { name: 'img/logo.png', data: Buffer.from([137, 80, 78, 71, 0, 1]) }, { name: '__MACOSX/._e.csv', data: 'junk' }, { name: 'd/', data: '', method: 0 }]),
    stored: Z.makeZip([{ name: 'e.csv', data: csv, method: 0 }]),
    junkFront: Buffer.concat([Buffer.from('MZ junk header '.repeat(10)), Z.makeZip([{ name: 'e.csv', data: csv, method: 0 }, good])]),
    utf16: Z.makeZip([{ name: 'a.csv', data: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(csv, 'utf16le')]) }, { name: 'b.csv', data: Buffer.from('s,t\ncaf\xe9,x\n', 'latin1') }]),
    nested: Z.makeZip([{ name: 'in.zip', data: Z.makeZip([{ name: 'e.csv', data: csv }]) }, { name: 'book.xlsx', data: Z.makeXlsx([{ name: 'S', rows: [['a', 'b'], ['1', '2']] }]) }]),
    xlsx: Z.makeXlsx([{ name: 'One', rows: [['source', 'target'], ['a', 'b']] }, { name: 'Two', rows: [['x', 'y'], [1, 2.5], [{ d: 44000 }, { b: true }]] }]),
    commentSig: (function () { var z = Z.makeZip([good]); var c = Buffer.concat([z, Buffer.from('xx')]); return c; })(),
    bad: Z.makeZip([good, { name: 'crc.csv', data: csv, crc: 1234 }, { name: 'pw.csv', data: csv, flags: 1 }, { name: 'm.csv', data: csv, method: 14 }, { name: 'off.csv', data: csv, offset: 9999999 }, { name: 'us.csv', data: csv, usize: 3 }]),
    bombSmall: Z.makeZip([{ name: 'a.csv', raw: bomb300(), data: csv, usize: 100, crc: 0 }, { name: 'b.csv', data: csv }]),
    bombHuge: Z.makeZip([{ name: 'a.csv', raw: bomb300(), usize: 300e6, crc: 0 }, { name: 'b.csv', data: csv }]),
    big: Z.makeZip([{ name: 'big.csv', data: big }, good]),
    cut: Z.makeZip([good]).subarray(0, 40), text: Buffer.from('not a zip at all, just text, long enough to pass a size check'), empty: Buffer.alloc(0)
  };
  var names = Object.keys(zips);
  for (var i = 0; i < names.length; i++) { var r = await both(zips[names[i]], names[i] + '.zip'); assert.deepStrictEqual(r[1], r[0], names[i]); }
  var lim = await both(zips.big, 'big.zip', { maxEntryBytes: 1e6 }); assert.deepStrictEqual(lim[1], lim[0], 'entry limit');
  var tot = await both(zips.big, 'big.zip', { maxTotalBytes: 2e6 }); assert.deepStrictEqual(tot[1], tot[0], 'total limit');
  var z2 = Z.makeZip([good]); z2.writeUInt16LE(60000, z2.length - 22 + 10);   // count field lies
  var lie = await both(z2, 'lie.zip'); assert.deepStrictEqual(lie[1], lie[0], 'count lies');
});
t('streaming: listBlob matches list, readBlob matches read for every entry', async function () {
  var z = Z.makeZip([{ name: 'a.csv', data: csv }, { name: 'b.bin', data: Buffer.from([1, 2, 3, 0, 255]), method: 0 }, { name: 'c.csv', data: csv, crc: 5 }, { name: 'd.csv', data: Buffer.from('q\n'.repeat(70000)) }]);
  var blob = new Blob([z]), L1 = U.list(u8(z)), L2 = await U.listBlob(blob);
  assert.deepStrictEqual(L2, L1);
  for (var i = 0; i < L1.entries.length; i++) {
    var a = await U.read(u8(z), L1.entries[i]), b = await U.readBlob(blob, L1.entries[i], U.LIMITS.maxEntryBytes);
    assert.deepStrictEqual(b.bytes ? Buffer.from(b.bytes) : b, a.bytes ? Buffer.from(a.bytes) : a, L1.entries[i].path);
  }
});
t('streaming: byte flips and cuts give the same answer from a Blob as from memory', async function () {
  var base = Z.makeZip([{ name: 'a.csv', data: csv }, { name: 'b.json', data: '{"nodes":[{"id":1}],"edges":[]}' }, { name: 'c.txt', data: 'x -> y' }]);
  var x = Z.makeXlsx([{ name: 'S', rows: [['source', 'target'], ['a', 'b'], ['b', 'c']] }]);
  var s = 11, rnd = function () { return (s = (s * 16807) % 2147483647) / 2147483647; }, same = 0;
  for (var k = 0; k < 700; k++) {
    var b = Buffer.from(k % 2 ? base : x), flips = 1 + Math.floor(rnd() * 6);
    for (var f = 0; f < flips; f++) b[Math.floor(rnd() * b.length)] = Math.floor(rnd() * 256);
    if (rnd() < 0.3) b = b.subarray(0, Math.floor(rnd() * b.length));
    var r = await both(b, 'f.zip'); assert.deepStrictEqual(r[1], r[0], 'case ' + k); same++;
  }
  assert.ok(same === 700);
});
t('streaming: an entry with a long extra field in its local header (more than the one-read window) still opens from a Blob', async function () {
  var z = Z.makeZip([{ name: 'a.csv', data: csv }, { name: 'b.csv', data: csv }]), extra = 5000;
  var nl = z.readUInt16LE(26), at = 30 + nl, body = z.subarray(at, z.length), out = Buffer.concat([z.subarray(0, at), Buffer.alloc(extra), body]);
  out.writeUInt16LE(extra, 28);
  var eo = out.length - 22; out.writeUInt32LE(out.readUInt32LE(eo + 16) + extra, eo + 16);                 // directory moved
  var cd = out.readUInt32LE(eo + 16), q = cd, n = out.readUInt16LE(eo + 10);
  for (var i = 0; i < n; i++) { if (i > 0) out.writeUInt32LE(out.readUInt32LE(q + 42) + extra, q + 42); q += 46 + out.readUInt16LE(q + 28) + out.readUInt16LE(q + 30) + out.readUInt16LE(q + 32); }
  var r = await both(out, 'extra.zip'); assert.deepStrictEqual(r[1], r[0]); assert.equal(r[0].files.length, 2);
});
t('inflate in WebAssembly (1.5.0): same files and notes as the browser stream on valid, stored, fixed-table, damaged and cut entries', async function () {
  var s = 3, rnd = function () { return (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }, same = 0;
  for (var k = 0; k < 400; k++) {
    var len = Math.floor(rnd() * rnd() * 30000), txt = Buffer.alloc(len);
    for (var i = 0; i < len; i++) txt[i] = k % 3 === 0 ? 97 + Math.floor(rnd() * 5) : k % 3 === 1 ? 32 + Math.floor(rnd() * 90) : (rnd() < 0.9 ? 44 : 10);
    var lvl = [0, 1, 6, 9][k % 4], body = zlib.deflateRawSync(txt, { level: lvl, strategy: k % 5 === 0 ? zlib.constants.Z_FIXED : 0 });
    if (k % 2) { body = Buffer.from(body); if (body.length) body[Math.floor(rnd() * body.length)] ^= 1 << Math.floor(rnd() * 8); }
    if (k % 7 === 0) body = body.subarray(0, Math.max(0, body.length - 1 - Math.floor(rnd() * 4)));
    var z = Z.makeZip([{ name: 'a.csv', raw: body, data: txt, method: 8 }, { name: 'b.csv', data: csv }]), a, b;
    U._inflateMax(4096); try { a = await U.expand(u8(z), 'x.zip'); } catch (e) { a = { err: e.message }; }
    U._inflateMax(-1); try { b = await U.expand(u8(z), 'x.zip'); } catch (e) { b = { err: e.message }; }
    U._inflateMax(4096);
    [a, b].forEach(function (x) { if (x.notes) x.notes = x.notes.map(function (q) { return q.replace('unpacks to more than it says it does', 'looks damaged'); }); });   // damaged data that also runs past its size: either wording is right
    assert.deepStrictEqual(a, b, 'case ' + k); same++;
  }
  assert.equal(same, 400);
});
t('shared output buffer (1.6.0): two opens at the same time, and repeated opens, never mix up their files', async function () {
  var mk = function (tag) { var f = []; for (var i = 0; i < 6; i++) f.push({ name: tag + i + '.csv', data: 'a,b\n' + (tag + i + ',x\n').repeat(3000 + i * 500) }); return f; };
  var za = Z.makeZip(mk('A')), zb = Z.makeZip(mk('B'));
  for (var round = 0; round < 3; round++) {
    var r = await Promise.all([U.expand(u8(za), 'a.zip'), U.expandBlob(new Blob([zb]), 'b.zip'), U.expand(u8(zb), 'b.zip'), U.expandBlob(new Blob([za]), 'a.zip')]);
    [[r[0], 'A'], [r[1], 'B'], [r[2], 'B'], [r[3], 'A']].forEach(function (p) { assert.equal(p[0].files.length, 6); p[0].files.forEach(function (f, i) { assert.ok(f.text.startsWith('a,b\n' + p[1] + i + ',x\n') && f.text.length === 4 + (p[1] + i + ',x\n').length * (3000 + i * 500), 'file ' + f.name); }); });
  }
});
// ---- 1.7.0: the faster XML scanner must give the very same events (and errors) as the one it replaced ----
var refScan = (function () {
  var BAD_KEYS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 }, XML_MAX_DEPTH = 2000;
  var ATTR = /([^\s=\/"'<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, TAGEND = /[^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/y;
  function xmlDecode(s) {
    if (s.indexOf('&') < 0) return s;
    return s.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|lt|gt|amp|quot|apos);/gi, function (m, e) {
      var c = e.toLowerCase();
      if (c === 'lt') return '<'; if (c === 'gt') return '>'; if (c === 'amp') return '&'; if (c === 'quot') return '"'; if (c === 'apos') return "'";
      var cp = c.charAt(1) === 'x' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '\ufffd';
    });
  }

  function xmlScan(text, h) {
    var i = 0, n = text.length, depth = 0, lt, e;
    while (i < n) {
      lt = text.indexOf('<', i);
      if (lt < 0) { if (h.text && i < n) h.text(xmlDecode(text.slice(i))); break; }
      if (lt > i && h.text) h.text(xmlDecode(text.slice(i, lt)));
      if (text.charCodeAt(lt + 1) === 33) {                       // <!
        if ((text.charCodeAt(lt + 2) === 45 && text.charCodeAt(lt + 3) === 45)) { e = text.indexOf('-->', lt + 4); if (e < 0) throw new Error('The XML is cut off.'); i = e + 3; continue; }
        if (text.startsWith('<![CDATA[', lt)) { e = text.indexOf(']]>', lt + 9); if (e < 0) throw new Error('The XML is cut off.'); if (h.text) h.text(text.slice(lt + 9, e)); i = e + 3; continue; }
        e = text.indexOf('>', lt); var br = text.indexOf('[', lt);   // DOCTYPE, possibly with an inner subset that we skip unread
        if (br >= 0 && (e < 0 || br < e)) { var close = text.indexOf(']', br); e = close < 0 ? -1 : text.indexOf('>', close); }
        if (e < 0) throw new Error('The XML is cut off.');
        i = e + 1; continue;
      }
      if (text.charCodeAt(lt + 1) === 63) { e = text.indexOf('?>', lt + 2); if (e < 0) throw new Error('The XML is cut off.'); i = e + 2; continue; }
      TAGEND.lastIndex = lt + 1;
      var m = TAGEND.exec(text);
      if (!m) throw new Error('The XML is cut off.');
      i = lt + 1 + m[0].length;
      var body = m[0].slice(0, -1);
      if (body.charCodeAt(0) === 47) {                            // </name>
        depth--;
        var cn = body.slice(1).trim(), cc = cn.indexOf(':');
        if (h.close) h.close(cc >= 0 ? cn.slice(cc + 1) : cn);
        continue;
      }
      var self = body.charCodeAt(body.length - 1) === 47;
      if (self) body = body.slice(0, -1);
      var sp = body.search(/[\s]/), nm = sp < 0 ? body : body.slice(0, sp), col = nm.indexOf(':');
      var attrs = {};
      if (sp >= 0) {
        ATTR.lastIndex = 0;
        var am;
        while ((am = ATTR.exec(body.slice(sp)))) {
          var v = xmlDecode(am[2] !== undefined ? am[2] : am[3]), an = am[1], ac = an.indexOf(':');
          if (BAD_KEYS[an]) continue;
          attrs[an] = v;
          if (ac >= 0 && !(an.slice(ac + 1) in attrs) && !BAD_KEYS[an.slice(ac + 1)]) attrs[an.slice(ac + 1)] = v;
        }
      }
      var local = col >= 0 ? nm.slice(col + 1) : nm;
      if (h.open) h.open(local, attrs, self);
      if (self) { if (h.close) h.close(local); } else if (++depth > XML_MAX_DEPTH) throw new Error('The XML is nested too deeply to be real data.');
    }
  }

  return xmlScan;
})();
t('xml scanner: same events and errors as the previous scanner on 20,000 random pieces of XML', function () {
  var s = 99, rnd = function () { return (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }, pick = function (a) { return a[Math.floor(rnd() * a.length)]; };
  var frags = ['<a>', '</a>', '<b x="1" y=\'2\'>', '<c r="A1" t="s"/>', '<v>', '</v>', '<x:y z:k="v">', '</x:y>', '<a b="c>d">', "<a b='c>d'>", '<!-- note -->', '<![CDATA[ <raw> ]]>', '<?xml version="1.0"?>', '<!DOCTYPE a [ <!ENTITY e "x"> ]>', 'text', ' &amp; ', '&#65;&lt;&#x41;', '\u00a0', '<a\u00a0k="v">', '<a\tk="v"\n/>', '<a k=v>', '"', "'", '<', '>', '<a b="unclosed', '<__proto__ __proto__="p">', '<a  b = "1"  c="2" />', '</', '<!', '<!-', '<a/b>'];
  for (var k = 0; k < 20000; k++) {
    var xml = '', n = 1 + Math.floor(rnd() * 12); for (var i = 0; i < n; i++) xml += pick(frags);
    var ev1 = [], ev2 = [], e1 = null, e2 = null;
    var mk = function (log) { return { open: function (t, a, sf) { log.push(['o', t, JSON.stringify(Object.keys(a).sort().map(function (q) { return [q, a[q]]; })), !!sf]); }, close: function (t) { log.push(['c', t]); }, text: function (x) { log.push(['t', x]); } }; };
    try { refScan(xml, mk(ev1)); } catch (e) { e1 = e.message; }
    try { U._xmlScan(xml, mk(ev2)); } catch (e) { e2 = e.message; }
    assert.deepStrictEqual([ev2, e2], [ev1, e1], JSON.stringify(xml));
  }
});
t('streaming: helpers (workers) really ran, and many text files come out in order with limits applied the same way', async function () {
  var files = []; for (var i = 0; i < 40; i++) files.push({ name: 'd/f' + String(i).padStart(2, '0') + '.csv', data: 'a,b\n' + (i + ',x\n').repeat(2000 + i * 37) });
  var z = Z.makeZip(files), r = await both(z, 'many.zip'), r2 = await both(z, 'many.zip', { maxTotalBytes: 300000 }), r3 = await both(z, 'many.zip', { maxFiles: 7 }), r4 = await both(z, 'many.zip', { maxEntryBytes: 20000 });
  assert.equal(r[0].files.length, 40); assert.deepStrictEqual(r[0].files.map(function (f) { return f.path; }), files.map(function (f) { return f.name; }));
  assert.ok(r2[0].notes.some(function (q) { return /safety limit/.test(q); })); assert.equal(r3[0].files.length, 7); assert.ok(helperRuns > 20, 'helpers used ' + helperRuns);
  U.closeHelpers();
});
chain.then(function () { console.log(process.exitCode ? 'zip-open: FAILED' : 'zip-open: all ' + n + ' checks passed'); process.exit(process.exitCode || 0); });
