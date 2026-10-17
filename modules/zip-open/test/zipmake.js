/* Copyright (c) 2026 LFC Foundry. MIT License. Tiny zip and xlsx writers for tests (Node only). */
'use strict';
var zlib = require('zlib');
function crc(b) { return zlib.crc32 ? zlib.crc32(b) >>> 0 : require('../zip-open.js').crc32(b); }
/** files: [{ name, data (Buffer|string), method: 0|8, flags, crc, usize, csize, raw (already-compressed Buffer) }] */
function makeZip(files, o) {
  o = o || {};
  var parts = [], cd = [], off = 0;
  files.forEach(function (f) {
    var name = Buffer.from(f.name, 'utf8'), data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data === undefined ? '' : f.data, 'utf8');
    var method = f.method === undefined ? 8 : f.method, body = f.raw || (method === 8 ? zlib.deflateRawSync(data) : data);
    var c = f.crc === undefined ? crc(data) : f.crc, us = f.usize === undefined ? data.length : f.usize, cs = f.csize === undefined ? body.length : f.csize, flags = (f.flags || 0) | 0x800;
    var lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(flags, 6); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(c, 14); lh.writeUInt32LE(cs, 18); lh.writeUInt32LE(us, 22); lh.writeUInt16LE(name.length, 26);
    parts.push(lh, name, body);
    var ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(flags, 8); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(c, 16); ch.writeUInt32LE(cs, 20); ch.writeUInt32LE(us, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(f.offset === undefined ? off : f.offset, 42);
    cd.push(ch, name);
    off += 30 + name.length + body.length;
  });
  var cdb = Buffer.concat(cd), eo = Buffer.alloc(22);
  eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(files.length, 8); eo.writeUInt16LE(files.length, 10); eo.writeUInt32LE(cdb.length, 12); eo.writeUInt32LE(off, 16);
  return Buffer.concat(parts.concat([cdb, eo]));
}
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
/** sheets: [{ name, rows: [[cell...]] }]; a cell is a string, a number, or { d: serial } for a date. */
function makeXlsx(sheets) {
  var sst = [], sidx = new Map();
  var si = function (s) { if (!sidx.has(s)) { sidx.set(s, sst.length); sst.push(s); } return sidx.get(s); };
  var col = function (i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  var files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map(function (s, i) { return '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="x" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') + '</Relationships>' },
    { name: 'xl/styles.xml', data: '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>' }
  ];
  sheets.forEach(function (s, i) {
    var rows = s.rows.map(function (r, ri) {
      return '<row r="' + (ri + 1) + '">' + r.map(function (c, ci) {
        if (c === null || c === undefined || c === '') return '';
        var ref = col(ci) + (ri + 1);
        if (typeof c === 'number') return '<c r="' + ref + '"><v>' + c + '</v></c>';
        if (c && c.d !== undefined) return '<c r="' + ref + '" s="1"><v>' + c.d + '</v></c>';
        if (c && c.b !== undefined) return '<c r="' + ref + '" t="b"><v>' + (c.b ? 1 : 0) + '</v></c>';
        if (c && c.inline !== undefined) return '<c r="' + ref + '" t="inlineStr"><is><t>' + esc(c.inline) + '</t></is></c>';
        return '<c r="' + ref + '" t="s"><v>' + si(String(c)) + '</v></c>';
      }).join('') + '</row>';
    }).join('');
    files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + rows + '</sheetData></worksheet>' });
  });
  files.push({ name: 'xl/sharedStrings.xml', data: '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + sst.map(function (s) { return '<si><t xml:space="preserve">' + esc(s) + '</t></si>'; }).join('') + '</sst>' });
  return makeZip(files);
}
module.exports = { makeZip: makeZip, makeXlsx: makeXlsx, crc: crc };
