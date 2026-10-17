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
t('hostile: bomb that claims to be small', async function () {
  var big = zlib.deflateRawSync(Buffer.alloc(300e6)), t0 = Date.now();
  var z = Z.makeZip([{ name: 'a.csv', raw: big, data: csv, usize: 100, crc: 0 }, { name: 'b.csv', data: csv }]);
  var r = await U.expand(u8(z), 'bomb.zip');
  assert.deepEqual(r.files.map(function (f) { return f.name; }), ['b.csv']); assert.ok(r.notes.some(function (q) { return /more than it says|damaged/.test(q); }));
  assert.ok(Date.now() - t0 < 5000, 'took ' + (Date.now() - t0));
});
t('hostile: bomb that tells the truth about being huge', async function () {
  var big = zlib.deflateRawSync(Buffer.alloc(300e6)), z = Z.makeZip([{ name: 'a.csv', raw: big, usize: 300e6, crc: 0 }, { name: 'b.csv', data: csv }]);
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
chain.then(function () { console.log(process.exitCode ? 'zip-open: FAILED' : 'zip-open: all ' + n + ' checks passed'); });
