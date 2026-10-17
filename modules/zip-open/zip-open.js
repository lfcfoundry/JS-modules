/*!
 * zip-open.js: open .zip and .xlsx files safely in the browser or in Node. No dependencies.
 * Reads the zip table of contents once and trusts nothing the bytes cannot back up. Every limit is counted on what is really unpacked,
 * so a zip bomb stops at the limit. Text files come out as strings; every Excel sheet comes out as CSV text; problems are plain-words notes.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.0 (API 1)
 *
 *   var r = await ZipOpen.expand(bytes, "data.zip");     // bytes: Uint8Array. r.files = [{ name, path, text }], r.notes = [plain words]
 *   var toc = ZipOpen.list(bytes);                         // every entry, without unpacking anything
 *   var got = await ZipOpen.read(bytes, toc.entries[0]);   // { bytes } or { skip: "why" }, for files that are not text
 *   Needs async functions and, in a browser, DecompressionStream("deflate-raw"); in Node it uses zlib.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZipOpen = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var BAD_KEYS = { '__proto__': 1, 'constructor': 1, 'prototype': 1 };
  var XML_MAX_DEPTH = 2000;
  function xmlDecode(s) {
    if (s.indexOf('&') < 0) return s;
    return s.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|lt|gt|amp|quot|apos);/gi, function (m, e) {
      var c = e.toLowerCase();
      if (c === 'lt') return '<'; if (c === 'gt') return '>'; if (c === 'amp') return '&'; if (c === 'quot') return '"'; if (c === 'apos') return "'";
      var cp = c.charAt(1) === 'x' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '\ufffd';
    });
  }
  var ATTR = /([^\s=\/"'<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  var TAGEND = /[^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/y;
  /** Walks XML text. h.open(name, attrs, selfClosing), h.close(name), h.text(string). Names lose their prefix (x:y -> y); attrs keep both forms. */
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

  /* ------------------------------------------------------------ Excel: sheets of an .xlsx become tables */
  var XL_COLS = 16384;
  function colIndex(ref) { var m = /^([A-Za-z]{1,3})/.exec(ref || ''); if (!m) return -1; var s = m[1].toUpperCase(), n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64; return n - 1; }
  var XL_BUILTIN_DATES = { 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1, 21: 1, 22: 1, 45: 1, 46: 1, 47: 1 };
  function isDateFormat(code) { var c = String(code).replace(/"[^"]*"|\\.|\[[^\]]*\]|_.|\*./g, ''); return /[ymdhs]/i.test(c) && !/^(general|0|#)/i.test(c) || /[dy]{2}|m{1,2}[\/\-.]|[hH]:|:[sS]/.test(c) && /[ymdhs]/i.test(c); }
  function xlDate(serial, d1904) {
    if (!isFinite(serial) || serial < 0 || serial > 2958465) return null;
    var ms = Math.round((serial - (d1904 ? 24107 : 25569)) * 86400000), d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    var iso = d.toISOString();
    return serial % 1 === 0 ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ');
  }
  function csvCell(v) { return /[",\r\n]/.test(v) || /^\s|\s$/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  /** parts: { 'xl/workbook.xml': text, ... } (only the ones that exist). Returns [{ sheet, csv, rows }]. */
  function xlsxSheets(parts, opts) {
    opts = opts || {};
    var maxRows = opts.maxRows || 2000000, sst = [], dateXf = {}, d1904 = false, sheets = [], rels = {};
    if (parts['xl/sharedStrings.xml']) {
      var cur = null, inT = false;
      xmlScan(parts['xl/sharedStrings.xml'], {
        open: function (t, a) { if (t === 'si') cur = ''; else if (t === 't' && cur !== null) inT = true; else if ((t === 'rPh' || t === 'phoneticPr') && cur !== null) inT = false; },
        text: function (s) { if (inT && cur !== null && cur.length < 40000) cur += s; },
        close: function (t) { if (t === 't') inT = false; else if (t === 'si') { sst.push(cur || ''); cur = null; if (sst.length > 5000000) throw new Error('This workbook has too many distinct text values.'); } }
      });
    }
    if (parts['xl/styles.xml']) {
      var fmts = {}, inXfs = false, xi = 0;
      xmlScan(parts['xl/styles.xml'], {
        open: function (t, a) {
          if (t === 'numFmt') fmts[a.numFmtId] = a.formatCode || '';
          else if (t === 'cellXfs') { inXfs = true; xi = 0; }
          else if (t === 'xf' && inXfs) { var id = Number(a.numFmtId); if (XL_BUILTIN_DATES[id] || (fmts[id] !== undefined && isDateFormat(fmts[id]))) dateXf[xi] = 1; xi++; }
        },
        close: function (t) { if (t === 'cellXfs') inXfs = false; }
      });
    }
    if (parts['xl/workbook.xml']) xmlScan(parts['xl/workbook.xml'], { open: function (t, a) { if (t === 'sheet') sheets.push({ name: a.name || 'Sheet' + (sheets.length + 1), rid: a['r:id'] || a.id }); else if (t === 'workbookPr' && /^(1|true)$/i.test(a.date1904 || '')) d1904 = true; } });
    if (parts['xl/_rels/workbook.xml.rels']) xmlScan(parts['xl/_rels/workbook.xml.rels'], { open: function (t, a) { if (t === 'Relationship' && a.Id) rels[a.Id] = a.Target || ''; } });
    var out = [];
    sheets.forEach(function (sh, si) {
      var target = rels[sh.rid] || 'worksheets/sheet' + (si + 1) + '.xml';
      target = target.replace(/^\/?(xl\/)?/, '').replace(/^\.\//, '');
      var xml = parts['xl/' + target];
      if (!xml) return;
      var lines = [], row = null, rowHas = false, c = null, cell = null, inV = false, inIs = false, rowCount = 0, lastCol = -1, truncated = false;
      var flushRow = function () {
        if (!row) return;
        if (rowHas) {
          var end = row.length; while (end > 0 && (row[end - 1] === undefined || row[end - 1] === '')) end--;
          var s = new Array(end);
          for (var q = 0; q < end; q++) s[q] = row[q] === undefined ? '' : csvCell(row[q]);
          lines.push(s.join(','));
          if (++rowCount >= maxRows) truncated = true;
        }
        row = null; rowHas = false;
      };
      xmlScan(xml, {
        open: function (t, a, self) {
          if (truncated) return;
          if (t === 'row') { flushRow(); row = []; lastCol = -1; }
          else if (t === 'c') {
            cell = { type: a.t || 'n', xf: Number(a.s) || 0, v: '' };
            var ci = colIndex(a.r); if (ci < 0) ci = lastCol + 1;
            if (ci >= XL_COLS) { cell = null; return; }
            cell.col = ci; lastCol = ci;
            if (self) cell = null;
          }
          else if (t === 'v' && cell) inV = true;
          else if (t === 'is' && cell) inIs = true;
          else if (t === 't' && cell && inIs) inV = true;
        },
        text: function (s) { if (cell && inV && cell.v.length < 40000) cell.v += s; },
        close: function (t) {
          if (t === 'v' || (t === 't' && inIs)) inV = false;
          else if (t === 'is') inIs = false;
          else if (t === 'c' && cell) {
            var v = cell.v;
            if (cell.type === 's') v = sst[Number(v)] !== undefined ? sst[Number(v)] : '';
            else if (cell.type === 'b') v = v === '1' ? 'TRUE' : 'FALSE';
            else if (cell.type === 'n' || cell.type === '') { if (v !== '' && dateXf[cell.xf]) { var dt = xlDate(Number(v), d1904); if (dt) v = dt; } else if (v !== '' && isFinite(Number(v))) v = String(Number(v)); }
            if (v !== '' && row) { if (!row) row = []; row[cell.col] = v; rowHas = true; }
            cell = null;
          }
          else if (t === 'row') flushRow();
        }
      });
      flushRow();
      if (lines.length) out.push({ sheet: sh.name, csv: lines.join('\n'), rows: lines.length, truncated: truncated });
    });
    return out;
  }

  var LIMITS = {
    maxEntries: 20000,          // files listed inside one zip
    maxFiles: 5000,             // text files handed to the importers
    maxEntryBytes: 60000000,    // one text file
    maxPartBytes: 150000000,    // one spreadsheet sheet (XML is wordy)
    maxTotalBytes: 400000000,   // everything unpacked from one drop, all zips together
    maxDepth: 3                 // zips inside zips
  };
  var TEXT_EXT = /\.(md|markdown|txt|text|csv|tsv|tab|psv|dsv|prn|json|jsonl|ndjson|canvas|dot|gv|gml|graphml|gexf|xml)$/i;
  var JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini|\.git|\.obsidian|node_modules)(\/|$)|(^|\/)\._/i;

  function u16(d, o) { return d.getUint16(o, true); }
  function u32(d, o) { return d.getUint32(o, true); }
  function u64(d, o) { var lo = d.getUint32(o, true), hi = d.getUint32(o + 4, true); return hi > 0x1fffff ? Infinity : lo + hi * 4294967296; }

  var CRC_T = null;
  function crc32(u8) {
    if (!CRC_T) { CRC_T = new Int32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; CRC_T[n] = c; } }
    var crc = -1, t = CRC_T;
    for (var i = 0, L = u8.length; i < L; i++) crc = (crc >>> 8) ^ t[(crc ^ u8[i]) & 255];
    return (crc ^ -1) >>> 0;
  }
  function isZip(u8) { return u8 && u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b && (u8[2] === 3 || u8[2] === 5) && (u8[3] === 4 || u8[3] === 6); }

  function cleanPath(p) {
    var out = [];
    String(p).replace(/\\/g, '/').split('/').forEach(function (s) { s = s.replace(/[\u0000-\u001f]/g, '').trim(); if (s && s !== '.' && s !== '..') out.push(s); });
    return out.join('/').slice(0, 300);
  }
  function decodeName(u8, utf8) {
    if (utf8) { try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { /* fall through */ } }
    var ok = true; for (var i = 0; i < u8.length; i++) if (u8[i] > 127) { ok = false; break; }
    if (ok) return String.fromCharCode.apply(null, u8);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { return new TextDecoder('windows-1252').decode(u8); }
  }

  /** Reads the table of contents. Returns { entries: [{ path, method, flags, crc, csize, usize, start, dir }], notes: [] }. Throws a plain-words Error when it isn't a zip. */
  function list(u8, lim) {
    lim = lim || LIMITS;
    var bad = function () { return new Error('This is not a zip file I can read (it may be cut off or damaged).'); };
    if (!u8 || u8.length < 22) throw bad();
    var d = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), eocd = -1, lo = Math.max(0, u8.length - 22 - 65535);
    for (var p = u8.length - 22; p >= lo; p--) if (u8[p] === 0x50 && u8[p + 1] === 0x4b && u8[p + 2] === 5 && u8[p + 3] === 6) { eocd = p; break; }
    if (eocd < 0) throw bad();
    var count = u16(d, eocd + 10), cdSize = u32(d, eocd + 12), cdOff = u32(d, eocd + 16);
    if ((count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) && eocd >= 20 && u32(d, eocd - 20) === 0x07064b50) {
      var z = u64(d, eocd - 20 + 8);
      if (z + 56 <= u8.length && u32(d, z) === 0x06064b50) { count = u64(d, z + 32); cdSize = u64(d, z + 40); cdOff = u64(d, z + 48); }
    }
    if (!isFinite(count) || !isFinite(cdSize) || !isFinite(cdOff)) throw bad();
    var shift = 0;                                              // zips with something in front (self-extracting, email) keep offsets relative to the zip's own start
    if (cdOff + cdSize > eocd || u32(d, cdOff) !== 0x02014b50) { shift = eocd - cdSize - cdOff; if (shift < 0 || u32(d, cdOff + shift) !== 0x02014b50) { if (count) throw bad(); } }
    var entries = [], notes = [], q = cdOff + shift, seen = 0, truncated = false;
    while (seen < count && q + 46 <= u8.length && u32(d, q) === 0x02014b50) {
      if (entries.length >= lim.maxEntries) { truncated = true; break; }
      var flags = u16(d, q + 8), method = u16(d, q + 10), crc = u32(d, q + 16), csize = u32(d, q + 20), usize = u32(d, q + 24);
      var nl = u16(d, q + 28), el = u16(d, q + 30), cl = u16(d, q + 32), off = u32(d, q + 42);
      if (q + 46 + nl + el + cl > u8.length) break;
      var name = decodeName(u8.subarray(q + 46, q + 46 + nl), (flags & 0x800) !== 0);
      if (csize === 0xffffffff || usize === 0xffffffff || off === 0xffffffff) {   // zip64 extra field: only the fields that were maxed out appear, in this order
        var ep = q + 46 + nl, end = ep + el;
        while (ep + 4 <= end) {
          var id = u16(d, ep), sz = u16(d, ep + 2), fp = ep + 4;
          if (id === 1) {
            if (usize === 0xffffffff && fp + 8 <= end) { usize = u64(d, fp); fp += 8; }
            if (csize === 0xffffffff && fp + 8 <= end) { csize = u64(d, fp); fp += 8; }
            if (off === 0xffffffff && fp + 8 <= end) { off = u64(d, fp); fp += 8; }
            break;
          }
          ep += 4 + sz;
        }
      }
      var path = cleanPath(name), isDir = /\/$/.test(name.replace(/\\/g, '/'));
      entries.push({ path: path, rawName: name, method: method, flags: flags, crc: crc, csize: csize, usize: usize, start: off + shift, dir: isDir });
      q += 46 + nl + el + cl; seen++;
    }
    if (truncated) notes.push('This zip lists more than ' + lim.maxEntries + ' files; only the first ' + lim.maxEntries + ' were looked at.');
    else if (seen < count) notes.push('The zip\'s table of contents is shorter than it says; ' + seen + ' of ' + count + ' files could be found.');
    return { entries: entries, notes: notes };
  }

  function noop() {}
  /** Raw deflate -> bytes, never more than `limit` bytes. */
  async function inflateRaw(src, limit) {
    if (typeof DecompressionStream === 'function') {
      var ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(), rd = ds.readable.getReader(), chunks = [], total = 0;
      var feeding = w.write(src).then(function () { return w.close(); }).catch(function () { /* the read side reports it */ });
      try {
        for (;;) {
          var r = await rd.read();
          if (r.done) break;
          total += r.value.length;
          if (total > limit) { var tooBig = new Error('TOOBIG'); throw tooBig; }
          chunks.push(r.value);
        }
      } catch (e) {
        try { rd.cancel().catch(noop); } catch (e2) { /* already closed */ }
        try { w.abort().catch(noop); } catch (e3) { /* already closed */ }
        throw e;
      }
      await feeding;
      var out = new Uint8Array(total), at = 0;
      for (var i = 0; i < chunks.length; i++) { out.set(chunks[i], at); at += chunks[i].length; }
      return out;
    }
    var zlib = require('zlib');
    try { var b = zlib.inflateRawSync(src, { maxOutputLength: limit }); return new Uint8Array(b.buffer, b.byteOffset, b.length); }
    catch (e) { if (e && (e.code === 'ERR_BUFFER_TOO_LARGE' || /larger than|maxOutputLength/i.test(e.message))) throw new Error('TOOBIG'); throw e; }
  }

  /** Bytes of one entry, or { skip: 'plain-words reason' }. Verifies size and checksum against what the file promised. */
  async function readEntry(u8, e, limit) {
    if (e.flags & 1) return { skip: 'is password-protected' };
    if (e.method !== 0 && e.method !== 8) return { skip: 'uses a compression method I can\'t open' };
    if (e.usize > limit) return { skip: 'is too large to open (over ' + Math.round(limit / 1e6) + ' MB)' };
    var d = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (e.start + 30 > u8.length || u32(d, e.start) !== 0x04034b50) return { skip: 'looks damaged' };
    var data = e.start + 30 + u16(d, e.start + 26) + u16(d, e.start + 28);
    if (data + e.csize > u8.length) return { skip: 'looks damaged (cut off)' };
    var body = u8.subarray(data, data + e.csize), out;
    if (e.method === 0) { if (e.csize > limit) return { skip: 'is too large to open (over ' + Math.round(limit / 1e6) + ' MB)' }; out = body; }
    else {
      try { out = await inflateRaw(body, Math.min(limit, e.usize + 1)); }
      catch (err) { return { skip: err && err.message === 'TOOBIG' ? 'unpacks to more than it says it does' : 'looks damaged' }; }
    }
    if (out.length !== e.usize) return { skip: 'looks damaged (its size is not what the zip says)' };
    if (crc32(out) !== e.crc) return { skip: 'looks damaged (its checksum does not match)' };
    return { bytes: out };
  }

  function decodeText(u8) {
    if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
    if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
    var n = Math.min(u8.length, 8192);
    for (var i = 0; i < n; i++) if (u8[i] === 0) return null;      // binary
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { return new TextDecoder('windows-1252').decode(u8); }
  }

  function extOf(p) { var m = /\.([a-z0-9]+)$/i.exec(p); return m ? m[1].toLowerCase() : ''; }
  function baseOf(p) { return p.split('/').pop(); }
  function dirOf(p) { var i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i + 1); }

  /**
   * bytes: Uint8Array of a .zip or .xlsx. Returns { files: [{ name, path, text }], notes: [plain words] }.
   * Never throws for a bad inner file (it is skipped with a note); throws for a bad outer file or when nothing readable is inside.
   */
  async function expand(bytes, fileName, opts) {
    var lim = Object.assign({}, LIMITS, opts || {}), ctx = { lim: lim, files: [], notes: [], total: 0, other: {}, stopped: false };
    var label = baseOf(fileName || 'archive');
    await openArchive(bytes, label, '', ctx, 0, /\.(xlsx|xlsm)$/i.test(label));
    var otherN = 0, otherExt = [];
    Object.keys(ctx.other).forEach(function (k) { otherN += ctx.other[k]; otherExt.push(k ? '.' + k : 'no extension'); });
    if (otherN) ctx.notes.push(otherN + ' file' + (otherN === 1 ? '' : 's') + ' of other kinds (' + otherExt.slice(0, 6).join(', ') + (otherExt.length > 6 ? ', …' : '') + ') ' + (otherN === 1 ? 'was' : 'were') + ' left alone.');
    if (!ctx.files.length) throw new Error('There were no files I can read inside ' + label + '. I read zips of text files (such as CSV, TSV, JSON, Markdown and XML) and Excel (.xlsx).' + (ctx.notes.length ? ' ' + ctx.notes.slice(0, 3).join(' ') : ''));
    return { files: ctx.files, notes: ctx.notes };
  }

  async function openArchive(bytes, label, prefix, ctx, depth, asBook) {
    var lim = ctx.lim, toc;
    try { toc = list(bytes, lim); } catch (e) { if (depth === 0) throw e; ctx.notes.push('"' + label + '" is not a zip I can open; skipped.'); return; }
    toc.notes.forEach(function (n) { ctx.notes.push(n); });
    var entries = toc.entries.filter(function (e) { return !e.dir && e.path && !JUNK.test(e.path); });
    // a workbook is a zip too: gather its parts, then turn each sheet into a table
    var isBook = asBook || entries.some(function (e) { return e.path === 'xl/workbook.xml'; }) && entries.some(function (e) { return e.path === '[Content_Types].xml'; });
    if (isBook) return openBook(bytes, entries, label, prefix, ctx);
    entries.sort(function (a, b) { return a.path < b.path ? -1 : a.path > b.path ? 1 : 0; });
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i], ext = extOf(e.path), shown = prefix + e.path;
      if (ctx.stopped) break;
      if (ext === 'xls' || ext === 'ods' || ext === 'numbers') { ctx.notes.push('"' + shown + '" is a spreadsheet kind I can\'t open' + (ext === 'xls' ? ' (the old Excel format). In Excel, choose Save As and pick .xlsx or CSV.' : '. Export it as .xlsx or CSV.')); continue; }
      var kind = ext === 'zip' ? 'zip' : ext === 'xlsx' || ext === 'xlsm' ? 'book' : (lim.textExt || TEXT_EXT).test(e.path) ? 'text' : null;
      if (!kind) { ctx.other[ext] = (ctx.other[ext] || 0) + 1; continue; }
      if (kind === 'text' && ctx.files.length >= lim.maxFiles) { if (!ctx.capNoted) { ctx.capNoted = true; ctx.notes.push('Only the first ' + lim.maxFiles + ' files were read.'); } continue; }
      if (kind === 'zip' && depth + 1 >= lim.maxDepth) { ctx.notes.push('"' + shown + '" is a zip inside zips inside zips; skipped.'); continue; }
      var left = lim.maxTotalBytes - ctx.total, room = Math.min(kind === 'text' ? lim.maxEntryBytes : lim.maxTotalBytes, left);
      if (room <= 0 || (e.usize > left && e.usize <= (kind === 'text' ? lim.maxEntryBytes : Infinity))) { ctx.stopped = true; ctx.notes.push('Stopped opening files after ' + Math.round(lim.maxTotalBytes / 1e6) + ' MB of unpacked data (a safety limit).'); break; }
      var got = await readEntry(bytes, e, kind === 'text' ? Math.min(lim.maxEntryBytes, room) : room);
      if (got.skip) { ctx.notes.push('"' + shown + '" ' + got.skip + '; skipped.'); continue; }
      ctx.total += got.bytes.length;
      if (kind === 'text') {
        var text = decodeText(got.bytes);
        if (text === null) { ctx.notes.push('"' + shown + '" looks like a binary file, not text; skipped.'); continue; }
        ctx.files.push({ name: baseOf(e.path), path: shown, text: text });
      } else await openArchive(got.bytes, baseOf(e.path), shown + '!/', ctx, depth + 1, kind === 'book');
    }
  }

  async function openBook(bytes, entries, label, prefix, ctx) {
    var lim = ctx.lim, wanted = /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^\/]+\.xml)$/i, parts = {};
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!wanted.test(e.path)) continue;
      var room = Math.min(lim.maxPartBytes, lim.maxTotalBytes - ctx.total);
      if (room <= 0) { ctx.stopped = true; ctx.notes.push('Stopped opening the workbook after ' + Math.round(lim.maxTotalBytes / 1e6) + ' MB of unpacked data (a safety limit).'); break; }
      var got = await readEntry(bytes, e, room);
      if (got.skip) { ctx.notes.push('Part "' + e.path + '" of "' + label + '" ' + got.skip + '; skipped.'); continue; }
      ctx.total += got.bytes.length;
      parts[e.path.replace(/^xl\/worksheets\//i, 'xl/worksheets/')] = decodeText(got.bytes) || '';
    }
    if (!parts['xl/workbook.xml']) { ctx.notes.push('"' + label + '" does not look like an Excel workbook; skipped.'); return; }
    var sheets;
    try { sheets = xlsxSheets(parts, {}); } catch (err) { ctx.notes.push('"' + label + '" could not be read as a workbook (' + String(err && err.message || err).replace(/\.$/, '') + '); skipped.'); return; }
    if (!sheets.length) { ctx.notes.push('"' + label + '" has no cells with data.'); return; }
    var stem = label.replace(/\.(xlsx|xlsm)$/i, '');
    sheets.forEach(function (sh) {
      if (ctx.files.length >= lim.maxFiles) return;
      var nm = (sheets.length > 1 ? stem + ' - ' + sh.sheet : stem).replace(/[\/\\:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) + '.csv';
      ctx.files.push({ name: nm, path: prefix + nm, text: sh.csv });
      if (sh.truncated) ctx.notes.push('Sheet "' + sh.sheet + '" is very long; only its first rows were read.');
    });
    if (sheets.length > 1) ctx.notes.push('"' + label + '" has ' + sheets.length + ' sheets; each was read as its own table and they were merged by name.');
  }

  /** Quick check on the first bytes of a dropped file. */
  function looksLikeArchive(u8, fileName) { return isZip(u8) || /\.(zip|xlsx|xlsm)$/i.test(fileName || ''); }

  /** Bytes of one listed entry, checked against the size and checksum the zip promised: { bytes } or { skip: 'plain-words reason' }. */
  function read(bytes, entry, limit) { return readEntry(bytes, entry, limit === undefined ? LIMITS.maxEntryBytes : limit); }

  return { expand: expand, list: list, read: read, isZip: isZip, looksLikeArchive: looksLikeArchive, decodeText: decodeText, crc32: crc32, LIMITS: LIMITS };
}));
