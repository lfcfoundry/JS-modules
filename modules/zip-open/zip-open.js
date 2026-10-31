/*!
 * zip-open.js: open .zip and .xlsx files safely in the browser or in Node. No dependencies.
 * Reads the zip table of contents once and trusts nothing the bytes cannot back up. Every limit is counted on what is really unpacked,
 * so a zip bomb stops at the limit. Text files come out as strings; every Excel sheet comes out as CSV text; problems are plain-words notes.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.5.2 (API 1)
 *
 *   var r = await ZipOpen.expand(bytes, "data.zip");     // bytes: Uint8Array. r.files = [{ name, path, text }], r.notes = [plain words]
 *   var toc = ZipOpen.list(bytes);                         // every entry, without unpacking anything
 *   var got = await ZipOpen.read(bytes, toc.entries[0]);   // { bytes } or { skip: "why" }, for files that are not text
 *   Needs async functions and, in a browser, DecompressionStream("deflate-raw"); in Node it uses zlib.
 */

(function (root, factory) {
  var api = factory(factory.toString());
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ZipOpen = api;
}(typeof self !== 'undefined' ? self : this, function (SELF_SRC) {
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

  var CRC_T = null, LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  /** CRC-32 (the zip checksum). "Slicing by 8": eight table lookups handle eight bytes at once, and where the bytes sit on a 4-byte boundary they are read as whole words. */
  function crc32js(u8) { return (crcJsRun(u8, -1) ^ -1) >>> 0; }
  function crcJsRun(u8, crc) {   // from the running state `crc` (start with -1), returns the new running state; the final answer is state ^ -1
    var t = CRC_T, n, c, k, i;
    if (!t) {   // table 0 is the classic one; table j holds the effect of a byte followed by j zero bytes
      t = CRC_T = new Int32Array(2048);
      for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; t[n] = c; }
      for (n = 0; n < 256; n++) { c = t[n]; for (k = 1; k < 8; k++) { c = t[c & 255] ^ (c >>> 8); t[k * 256 + n] = c; } }
    }
    var L = u8.length, hi;
    i = 0;
    if (LE && L >= 8 && typeof u8.byteOffset === 'number' && (u8.byteOffset & 3) === 0) {
      var w = new Int32Array(u8.buffer, u8.byteOffset, L >> 2), j = 0, e = (L >> 3) << 1;
      for (; j < e; j += 2) {
        crc ^= w[j]; hi = w[j + 1];
        crc = t[1792 + (crc & 255)] ^ t[1536 + ((crc >>> 8) & 255)] ^ t[1280 + ((crc >>> 16) & 255)] ^ t[1024 + (crc >>> 24)] ^ t[768 + (hi & 255)] ^ t[512 + ((hi >>> 8) & 255)] ^ t[256 + ((hi >>> 16) & 255)] ^ t[hi >>> 24];
      }
      i = j << 2;
    } else {
      for (var e2 = L - 7; i < e2; i += 8) {
        crc ^= u8[i] | u8[i + 1] << 8 | u8[i + 2] << 16 | u8[i + 3] << 24;
        crc = t[1792 + (crc & 255)] ^ t[1536 + ((crc >>> 8) & 255)] ^ t[1280 + ((crc >>> 16) & 255)] ^ t[1024 + (crc >>> 24)] ^ t[768 + u8[i + 4]] ^ t[512 + u8[i + 5]] ^ t[256 + u8[i + 6]] ^ t[u8[i + 7]];
      }
    }
    for (; i < L; i++) crc = (crc >>> 8) ^ t[(crc ^ u8[i]) & 255];
    return crc;
  }
  /* The same checksum in WebAssembly ("slicing by 16", 1.2.0): 1.3 to 1.8 times as fast on big buffers in the four test browsers. It is used from 1,024 bytes up; shorter pieces use the plain loop above,
     which is as fast there. If the browser refuses WebAssembly (a page policy without 'wasm-unsafe-eval'), or anything goes wrong, crc32js gives the same answer. Source: wasm/crc32.c. */
  var WASM_B64 = /*WASM:BEGIN*/'AGFzbQEAAAABCwJgAABgA39/fwF/AwMCAAEFAwEAAQYPAn8BQYCoAQt/AEGAqAELByUEBm1lbW9yeQIABGluaXQAAANjcmMAAQtfX2hlYXBfYmFzZQMBCuoKAsAGAQR/QQAhAEGAiICAACEBA0AgASAAQQF2IgJBoIbi7X5zIAIgAEEBcRsiAkEBdiIDQaCG4u1+cyADIAJBAXEbIgJBAXYiA0GghuLtfnMgAyACQQFxGyICQQF2IgNBoIbi7X5zIAMgAkEBcRsiAkEBdiIDQaCG4u1+cyADIAJBAXEbIgJBAXYiA0GghuLtfnMgAyACQQFxGyICQQF2IgNBoIbi7X5zIAMgAkEBcRsiAkEBdiIDQaCG4u1+cyADIAJBAXEbNgIAIAFBBGohASAAQQFqIgBBgAJHDQALQYB4IQADQCAAQYCYgIAAaiAAQYCQgIAAaigCACIBQf8BcUECdEGAiICAAGooAgAgAUEIdnMiATYCACAAQYCggIAAaiABQf8BcUECdEGAiICAAGooAgAgAUEIdnMiATYCACAAQYCogIAAaiABQf8BcUECdEGAiICAAGooAgAgAUEIdnMiATYCACAAQYCwgIAAaiABQf8BcUECdEGAiICAAGooAgAgAUEIdnMiATYCACAAQYC4gIAAaiABQf8BcUECdEGAiICAAGooAgAgAUEIdnMiATYCACAAQYDAgIAAaiABQf8BcUECdEGAiICAAGooAgAgAUEIdnMiATYCACAAQYDIgIAAaiABQf8BcUECdEGAiICAAGooAgAgAUEIdnMiATYCACAAQYDQgIAAaiABQf8BcUECdEGAiICAAGooAgAgAUEIdnMiATYCACAAQYDYgIAAaiABQf8BcUECdEGAiICAAGooAgAgAUEIdnMiATYCACAAQYDggIAAaiABQf8BcUECdEGAiICAAGooAgAgAUEIdnMiATYCACAAQYDogIAAaiABQf8BcUECdEGAiICAAGooAgAgAUEIdnMiATYCACAAQYDwgIAAaiABQf8BcUECdEGAiICAAGooAgAgAUEIdnMiATYCACAAQYD4gIAAaiABQf8BcUECdEGAiICAAGooAgAgAUEIdnMiATYCACAAQYCAgYAAaiABQf8BcUECdEGAiICAAGooAgAgAUEIdnMiATYCACAAQYCIgYAAaiABQf8BcUECdEGAiICAAGooAgAgAUEIdnM2AgAgAEEEaiIADQALC6UEAQF/AkAgAUEQSQ0AA0AgACgCACACcyICQQZ2QfwHcUGA+ICAAGooAgAgAkH/AXFBAnRBgICBgABqKAIAcyACQQ52QfwHcUGA8ICAAGooAgBzIAJBFnZB/AdxQYDogIAAaigCAHMgACgCBCICQf8BcUECdEGA4ICAAGooAgBzIAJBBnZB/AdxQYDYgIAAaigCAHMgAkEOdkH8B3FBgNCAgABqKAIAcyACQRZ2QfwHcUGAyICAAGooAgBzIAAoAggiAkH/AXFBAnRBgMCAgABqKAIAcyACQQZ2QfwHcUGAuICAAGooAgBzIAJBDnZB/AdxQYCwgIAAaigCAHMgAkEWdkH8B3FBgKiAgABqKAIAcyAAKAIMIgJB/wFxQQJ0QYCggIAAaigCAHMgAkEGdkH8B3FBgJiAgABqKAIAcyACQQ52QfwHcUGAkICAAGooAgBzIAJBFnZB/AdxQYCIgIAAaigCAHMhAiAAQRBqIQAgAUFwaiIBQQ9LDQALCwJAIAFFDQACQAJAIAFBAXENACABIQMMAQsgAC0AACACc0H/AXFBAnRBgIiAgABqKAIAIAJBCHZzIQIgAEEBaiEAIAFBf2ohAwsgAUEBRg0AA0AgAEEBai0AACAALQAAIAJzQf8BcUECdEGAiICAAGooAgAgAkEIdnMiAnNB/wFxQQJ0QYCIgIAAaigCACACQQh2cyECIABBAmohACADQX5qIgMNAAsLIAIL'/*WASM:END*/, WASM_MIN = 1024, WASM_CHUNK = 1 << 20, K;
  var INF_B64 = /*WASMINF:BEGIN*/'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'/*WASMINF:END*/;   // the small-entry inflate: its own module, compiled the first time it is needed
  /* compile early (since 1.3.0): the engine compiles the program on another thread as soon as this file loads, so the page keeps running; the first big checksum then only starts it. A checksum asked
     for before the compile is done compiles on the spot as it always did, so nothing waits and the answers do not change. */
  var ZM, zbin = null, earlyP = null;
  function zipBytes() {
    if (zbin) return zbin;
    var bin, i;
    if (typeof atob === 'function') { var raw = atob(WASM_B64); bin = new Uint8Array(raw.length); for (i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i); }
    else bin = new Uint8Array(Buffer.from(WASM_B64, 'base64'));
    return (zbin = bin);
  }
  function zipModule() {     // undefined until decided; null when the browser has none or refuses it
    if (ZM !== undefined) return ZM;
    ZM = null;
    try {
      if (typeof WebAssembly === 'object' && typeof WebAssembly.Module === 'function') ZM = new WebAssembly.Module(zipBytes());
    } catch (e) { ZM = null; }
    zbin = null;
    return ZM;
  }
  function compileEarly() {
    if (earlyP) return earlyP;
    try {
      if (typeof WebAssembly !== 'object' || !WebAssembly || typeof WebAssembly.compile !== 'function' || typeof WebAssembly.Module !== 'function') { ZM = null; return (earlyP = Promise.resolve(false)); }
      earlyP = WebAssembly.compile(zipBytes()).then(function (m) { if (ZM === undefined) ZM = m; zbin = null; return ZM !== null; }, function () { if (ZM === undefined) ZM = null; zbin = null; return false; });
    } catch (e) { earlyP = Promise.resolve(false); }
    return earlyP;
  }
  function kernel() {
    if (K !== undefined) return K;
    K = null;
    try {
      var mod = zipModule();
      if (!mod) return K;
      var ex = new WebAssembly.Instance(mod, {}).exports;
      ex.init();
      var base = (ex.__heap_base.value + 15) & ~15, need = Math.ceil((base + WASM_CHUNK) / 65536), have = ex.memory.buffer.byteLength / 65536;
      if (need > have) ex.memory.grow(need - have);
      K = { ex: ex, base: base };
    } catch (e) { K = null; }
    return K;
  }
  var INFLATE_MAX = 4096;   // compressed bytes up to which the WebAssembly inflate is used (bigger entries use the browser's own stream, which is faster once it is running)
  var IK;   // undefined until tried; null when there is no WebAssembly
  function inflateKernel() {
    if (IK !== undefined) return IK;
    IK = null;
    try {
      if (typeof WebAssembly !== 'object' || typeof WebAssembly.Module !== 'function') return IK;
      var bin, i;
      if (typeof atob === 'function') { var raw = atob(INF_B64); bin = new Uint8Array(raw.length); for (i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i); }
      else bin = new Uint8Array(Buffer.from(INF_B64, 'base64'));
      var ex = new WebAssembly.Instance(new WebAssembly.Module(bin), {}).exports;
      IK = { ex: ex, base: (ex.__heap_base.value + 15) & ~15 };
    } catch (e) { IK = null; }
    return IK;
  }
  /** Raw deflate -> { bytes } or { err: -1 damaged | -2 more than cap }, in WebAssembly, for small entries; null when there is no WebAssembly. */
  function inflateWasm(src, cap) {
    var k = inflateKernel();
    if (!k) return null;
    try {
      var need = k.base + src.length + cap + 64, mem = k.ex.memory;
      if (need > mem.buffer.byteLength) mem.grow(Math.ceil((need - mem.buffer.byteLength) / 65536));
      new Uint8Array(mem.buffer, k.base, src.length).set(src);
      var po = (k.base + src.length + 15) & ~15, n = k.ex.inflate(k.base, src.length, po, cap);
      if (n < 0) return { err: n };
      var out = new Uint8Array(n); out.set(new Uint8Array(mem.buffer, po, n));
      return { bytes: out };
    } catch (e) { return null; }
  }
  /** CRC-32 of a Uint8Array as an unsigned number. WebAssembly from 1,024 bytes up when the browser allows it; crc32(bytes, true) forces the plain JavaScript loop. */
  function crc32(u8, plain) { return (crcRun(u8, -1, plain === true) ^ -1) >>> 0; }
  /** Running CRC-32: continues from `s` (start with -1) over `u8`; the final answer is the state ^ -1. Streams use it so the checksum is done while the bytes arrive. */
  function crcRun(u8, s, plain) {
    var k = plain === true || u8.length < WASM_MIN || typeof u8.subarray !== 'function' ? null : kernel();
    if (!k) return crcJsRun(u8, s);
    try {
      var L = u8.length, o = 0, n, s0 = s;
      while (o < L) {
        n = L - o < WASM_CHUNK ? L - o : WASM_CHUNK;
        new Uint8Array(k.ex.memory.buffer, k.base, n).set(o === 0 && n === L ? u8 : u8.subarray(o, o + n));
        s = k.ex.crc(k.base, n, s); o += n;
      }
      return s;
    } catch (e) { K = null; return crcJsRun(u8, s0); }
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
    // first the end record whose comment reaches exactly the end of the file (an end-record signature inside a zip comment is not the directory), then the last signature, so zips with bytes after the record still open
    for (var p = u8.length - 22; p >= lo; p--) if (u8[p] === 0x50 && u8[p + 1] === 0x4b && u8[p + 2] === 5 && u8[p + 3] === 6 && p + 22 + u16(d, p + 20) === u8.length) { eocd = p; break; }
    if (eocd < 0) for (p = u8.length - 22; p >= lo; p--) if (u8[p] === 0x50 && u8[p + 1] === 0x4b && u8[p + 2] === 5 && u8[p + 3] === 6) { eocd = p; break; }
    if (eocd < 0) throw bad();
    var count = u16(d, eocd + 10), cdSize = u32(d, eocd + 12), cdOff = u32(d, eocd + 16);
    if ((count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) && eocd >= 20 && u32(d, eocd - 20) === 0x07064b50) {
      var z = u64(d, eocd - 20 + 8);
      if (z + 56 <= u8.length && u32(d, z) === 0x06064b50) { count = u64(d, z + 32); cdSize = u64(d, z + 40); cdOff = u64(d, z + 48); }
    }
    if (!isFinite(count) || !isFinite(cdSize) || !isFinite(cdOff)) throw bad();
    var shift = 0;                                              // zips with something in front (self-extracting, email) keep offsets relative to the zip's own start
    if (cdOff + cdSize > eocd || u32(d, cdOff) !== 0x02014b50) { shift = eocd - cdSize - cdOff; if (shift < 0 || u32(d, cdOff + shift) !== 0x02014b50) { if (count) throw bad(); } }
    return parseCd(u8.subarray(cdOff + shift), count, shift, lim);
  }

  /** The entries of a central directory. `cd` starts at the first directory record; `shift` is the number of bytes in front of the zip. */
  function parseCd(cd, count, shift, lim) {
    var d = new DataView(cd.buffer, cd.byteOffset, cd.byteLength), u8 = cd, entries = [], notes = [], q = 0, seen = 0, truncated = false;
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
      var cap = Math.min(limit, e.usize + 1), w = e.csize <= INFLATE_MAX && cap <= 16777216 ? inflateWasm(body, cap) : null;
      if (w) { if (w.err) return { skip: w.err === -2 ? 'unpacks to more than it says it does' : 'looks damaged' }; out = w.bytes; }
      else {
        try { out = await inflateRaw(body, cap); }
        catch (err) { return { skip: err && err.message === 'TOOBIG' ? 'unpacks to more than it says it does' : 'looks damaged' }; }
      }
    }
    if (out.length !== e.usize) return { skip: 'looks damaged (its size is not what the zip says)' };
    if (crc32(out) !== e.crc) return { skip: 'looks damaged (its checksum does not match)' };
    return { bytes: out };
  }

  /* ---- streaming from a File or Blob (since 1.4.0): only the end of the file, the table of contents and the entry asked for are read; nothing else is loaded ---- */
  var SMALL_ENTRY = 4194304, WINDOW = 4194304, PAR_ENTRY = 2097152, BAD_ZIP = 'This is not a zip file I can read (it may be cut off or damaged).';
  async function bytesOf(blob, a, b) { return new Uint8Array(await blob.slice(a, b).arrayBuffer()); }
  /** The table of contents of a File or Blob. Same answers as list() on the same bytes; reads the last 64 KB and the directory, not the entries. */
  async function listBlob(blob, lim) {
    lim = lim || LIMITS;
    var bad = function () { return new Error(BAD_ZIP); }, size = blob.size;
    if (size < 22) throw bad();
    var tailStart = Math.max(0, size - 22 - 65535 - 20), tail = await bytesOf(blob, tailStart, size), d = new DataView(tail.buffer, tail.byteOffset, tail.byteLength), eocd = -1, lo = Math.max(0, tail.length - 22 - 65535), p;
    for (p = tail.length - 22; p >= lo; p--) if (tail[p] === 0x50 && tail[p + 1] === 0x4b && tail[p + 2] === 5 && tail[p + 3] === 6 && p + 22 + u16(d, p + 20) === tail.length) { eocd = p; break; }
    if (eocd < 0) for (p = tail.length - 22; p >= lo; p--) if (tail[p] === 0x50 && tail[p + 1] === 0x4b && tail[p + 2] === 5 && tail[p + 3] === 6) { eocd = p; break; }
    if (eocd < 0) throw bad();
    var eocdAt = tailStart + eocd, count = u16(d, eocd + 10), cdSize = u32(d, eocd + 12), cdOff = u32(d, eocd + 16);
    if ((count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) && eocd >= 20 && u32(d, eocd - 20) === 0x07064b50) {
      var z = u64(d, eocd - 20 + 8);
      if (z + 56 <= size) { var zr = await bytesOf(blob, z, z + 56), zd = new DataView(zr.buffer, zr.byteOffset, zr.byteLength); if (u32(zd, 0) === 0x06064b50) { count = u64(zd, 32); cdSize = u64(zd, 40); cdOff = u64(zd, 48); } }
    }
    if (!isFinite(count) || !isFinite(cdSize) || !isFinite(cdOff)) throw bad();
    var shift = 0, sig = cdOff + 4 <= size ? await bytesOf(blob, cdOff, cdOff + 4) : null;
    if (cdOff + cdSize > eocdAt || !sig || u32(new DataView(sig.buffer, sig.byteOffset, 4), 0) !== 0x02014b50) {
      shift = eocdAt - cdSize - cdOff;
      if (shift < 0) { if (count) throw bad(); }
      else { var s2 = await bytesOf(blob, cdOff + shift, cdOff + shift + 4); if (s2.length < 4 || u32(new DataView(s2.buffer, s2.byteOffset, 4), 0) !== 0x02014b50) { if (count) throw bad(); } }
    }
    if (cdSize > 67108864) throw bad();
    var cdStart = cdOff + shift;   // read the directory and the end record (the whole rest of a normal file, which is all the in-memory path looks at); a directory claiming to be tiny still gets 1 MB of slack
    return parseCd(await bytesOf(blob, cdStart, Math.min(size, cdStart + Math.max(cdSize, 1048576) + size - eocdAt)), count, shift, lim);
  }

  /** Raw deflate (or stored) bytes of a Blob -> bytes, never more than `limit`; the checksum is worked out while the bytes arrive. Returns { bytes, crc }. */
  async function inflateBlob(part, method, limit) {
    if (typeof DecompressionStream !== 'function' || typeof part.stream !== 'function') {
      var src = new Uint8Array(await part.arrayBuffer()), o = method === 0 ? src : await inflateRaw(src, limit);
      if (o.length > limit) throw new Error('TOOBIG');
      return { bytes: o, crc: crc32(o) };
    }
    var rs = part.stream(), crc = -1, total = 0, chunks = [], rd;
    if (method === 8) rs = rs.pipeThrough(new DecompressionStream('deflate-raw'));
    rd = rs.getReader();
    try {
      for (;;) {
        var r = await rd.read();
        if (r.done) break;
        total += r.value.length;
        if (total > limit) throw new Error('TOOBIG');
        crc = crcRun(r.value, crc);
        chunks.push(r.value);
      }
    } catch (e) { try { rd.cancel().catch(noop); } catch (e2) { /* already closed */ } throw e; }
    var out;
    if (chunks.length === 1) out = chunks[0];
    else { out = new Uint8Array(total); for (var i = 0, at = 0; i < chunks.length; at += chunks[i].length, i++) out.set(chunks[i], at); }
    return { bytes: out, crc: (crc ^ -1) >>> 0 };
  }
  /** Same answers as read() for the same entry, but the entry is taken from a File or Blob a piece at a time. */
  async function readBlobEntry(blob, e, limit, cache) {
    if (e.flags & 1) return { skip: 'is password-protected' };
    if (e.method !== 0 && e.method !== 8) return { skip: 'uses a compression method I can\'t open' };
    if (e.usize > limit) return { skip: 'is too large to open (over ' + Math.round(limit / 1e6) + ' MB)' };
    if (e.start + 30 > blob.size) return { skip: 'looks damaged' };
    if (e.csize <= SMALL_ENTRY) {   // a small entry comes in one read (header and data together); the read-and-check code is the in-memory one
      var need = 30 + 1024 + e.csize, buf = cache && e.csize <= WINDOW / 16 ? cache.w : null, at = cache && cache.at;   // small entries sit close together: one read of a few MB serves the entries that follow (each read of a Blob costs about a millisecond in Chromium)
      if (!buf || e.start < at || (e.start - at + need > buf.length && at + buf.length < blob.size)) { at = e.start; buf = await bytesOf(blob, at, Math.min(blob.size, at + (cache && e.csize <= WINDOW / 16 ? WINDOW : need))); if (cache && e.csize <= WINDOW / 16) { cache.w = buf; cache.at = at; } }
      var win = buf.subarray(e.start - at, Math.min(buf.length, e.start - at + need)), wd = new DataView(win.buffer, win.byteOffset, win.byteLength);
      if (!(win.length >= 30 && u32(wd, 0) === 0x04034b50 && 30 + u16(wd, 26) + u16(wd, 28) + e.csize > win.length && e.start + win.length < blob.size)) return readEntry(win, Object.assign({}, e, { start: 0 }), limit);   // else the header has a long extra field: read it the long way
    }
    var h = await bytesOf(blob, e.start, e.start + 30), hd = new DataView(h.buffer, h.byteOffset, 30);
    if (u32(hd, 0) !== 0x04034b50) return { skip: 'looks damaged' };
    var data = e.start + 30 + u16(hd, 26) + u16(hd, 28);
    if (data + e.csize > blob.size) return { skip: 'looks damaged (cut off)' };
    var got;
    if (e.method === 0 && e.csize > limit) return { skip: 'is too large to open (over ' + Math.round(limit / 1e6) + ' MB)' };
    try { got = await inflateBlob(blob.slice(data, data + e.csize), e.method, e.method === 0 ? limit : Math.min(limit, e.usize + 1)); }
    catch (err) { return { skip: err && err.message === 'TOOBIG' ? 'unpacks to more than it says it does' : 'looks damaged' }; }
    if (got.bytes.length !== e.usize) return { skip: 'looks damaged (its size is not what the zip says)' };
    if (got.crc !== e.crc) return { skip: 'looks damaged (its checksum does not match)' };
    return { bytes: got.bytes };
  }
  /** Where an archive's entries come from: bytes already in memory, or a File/Blob read in pieces. Everything above this line works with either. */
  function memSource(u8) { return { list: function (lim) { return list(u8, lim); }, read: function (e, limit) { return readEntry(u8, e, limit); } }; }
  function blobSource(blob, helpers) {
    var src = { list: function (lim) { return listBlob(blob, lim); }, read: function (e, limit) { return readBlobEntry(blob, e, limit, cache); } }, cache = {};
    if (helpers && helpers.length) {
      var next = 0;
      src.width = helpers.length;
      src.prefetch = function (e, limit) {
        var h = helpers[next++ % helpers.length];
        if (h.blob !== blob) { h.blob = blob; try { h.w.postMessage({ op: 'open', blob: blob }); } catch (err) { /* the job below reports it */ } }
        return ask(h, { op: 'job', entry: e, limit: limit });
      };
    }
    return src;
  }
  /** One entry as text, worked out in one go (used by helpers): { text, size } | { text: null, size } for a binary file | { skip }. */
  async function textJob(blob, e, limit, cache) {
    var got = await readBlobEntry(blob, e, limit, cache);
    return got.skip ? got : { text: decodeText(got.bytes), size: got.bytes.length };
  }
  function workerBody() {   // runs inside a helper; `ZipOpen` is this file's code loaded there
    var cur = null, cache = {};
    onmessage = function (ev) {
      var m = ev.data;
      if (m.op === 'open') { cur = m.blob; cache = {}; return; }
      ZipOpen._textJob(cur, m.entry, m.limit, cache).then(function (r) { postMessage({ id: m.id, r: r }); }, function (err) { postMessage({ id: m.id, r: { skip: 'looks damaged' } }); });
    };
  }
  var POOL = [], nextId = 1;
  function makeHelper(spawn) {
    var code = 'var ZipOpen=(' + SELF_SRC + ')();(' + workerBody.toString() + ')();', w, h;
    if (typeof spawn === 'function') w = spawn(code);
    else { var url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' })); w = new Worker(url); URL.revokeObjectURL(url); }
    h = { w: w, wait: {} };
    w.onmessage = function (ev) { var m = ev.data, r = h.wait[m.id]; if (r) { delete h.wait[m.id]; r(m.r); } };
    w.onerror = function (ev) { Object.keys(h.wait).forEach(function (id) { var r = h.wait[id]; delete h.wait[id]; r({ skip: 'looks damaged' }); }); if (ev && ev.preventDefault) ev.preventDefault(); };
    return h;
  }
  function ask(h, msg) { return new Promise(function (ok) { var id = nextId++; msg.id = id; h.wait[id] = ok; try { h.w.postMessage(msg); } catch (e) { delete h.wait[id]; ok({ skip: 'looks damaged' }); } }); }
  /** Starts n helpers ahead of time (Web Workers; each compiles the checksum program), so the first big zip does not pay for it. Returns how many are ready. */
  function warm(n, spawn) { while (POOL.length < n) POOL.push(makeHelper(spawn)); return POOL.length; }
  function closeHelpers() { POOL.forEach(function (h) { try { h.w.terminate(); } catch (e) { /* gone */ } }); POOL = []; }
  function helpersFor(opts) {
    var n = opts && opts.workers > 0 ? Math.min(Math.floor(opts.workers), 32) : 0;
    if (n < 2 || (!opts.spawn && (typeof Worker !== 'function' || typeof URL !== 'function' || !URL.createObjectURL))) return null;
    try { warm(n, opts.spawn); } catch (e) { return null; }
    return POOL.slice(0, n);
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
  async function expand(bytes, fileName, opts) { return expandFrom(memSource(bytes), fileName, opts); }
  /** Same as expand() for a File or Blob (a dropped file, a fetch result): a big zip is read in pieces, so it never has to sit whole in memory. Same answers, same notes. A zip of up to 16 MB without helpers is read in one go (0.80 to 0.93x the time of reading it in pieces). */
  async function expandBlob(blob, fileName, opts) {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = 0; }
    var h = helpersFor(opts);
    try {
      if (!h && blob.size <= (opts && opts._wholeMax !== undefined ? opts._wholeMax : WHOLE_MAX) && typeof blob.arrayBuffer === 'function') return await expandFrom(memSource(new Uint8Array(await blob.arrayBuffer())), fileName || blob.name, opts);
      return await expandFrom(blobSource(blob, h), fileName || blob.name, opts);
    } finally { if (POOL.length && typeof setTimeout === 'function') { idleTimer = setTimeout(function () { idleTimer = 0; closeHelpers(); }, (opts && opts.idleMs) || 5000); if (idleTimer && idleTimer.unref) idleTimer.unref(); } }   // helpers keep their memory while they live: close them after a quiet spell
  }
  var WHOLE_MAX = 16777216;   // opts._wholeMax (tests only) changes it
  var idleTimer = 0;
  async function expandFrom(src, fileName, opts) {
    var lim = Object.assign({}, LIMITS, opts || {}), ctx = { lim: lim, files: [], notes: [], total: 0, other: {}, stopped: false };
    var label = baseOf(fileName || 'archive');
    await openArchive(src, label, '', ctx, 0, /\.(xlsx|xlsm)$/i.test(label));
    var otherN = 0, otherExt = [];
    Object.keys(ctx.other).forEach(function (k) { otherN += ctx.other[k]; otherExt.push(k ? '.' + k : 'no extension'); });
    if (otherN) ctx.notes.push(otherN + ' file' + (otherN === 1 ? '' : 's') + ' of other kinds (' + otherExt.slice(0, 6).join(', ') + (otherExt.length > 6 ? ', …' : '') + ') ' + (otherN === 1 ? 'was' : 'were') + ' left alone.');
    if (!ctx.files.length) throw new Error('There were no files I can read inside ' + label + '. I read zips of text files (such as CSV, TSV, JSON, Markdown and XML) and Excel (.xlsx).' + (ctx.notes.length ? ' ' + ctx.notes.slice(0, 3).join(' ') : ''));
    return { files: ctx.files, notes: ctx.notes };
  }

  async function openArchive(src, label, prefix, ctx, depth, asBook) {
    var lim = ctx.lim, toc;
    try { toc = await src.list(lim); } catch (e) { if (depth === 0) throw e; ctx.notes.push('"' + label + '" is not a zip I can open; skipped.'); return; }
    toc.notes.forEach(function (n) { ctx.notes.push(n); });
    var entries = toc.entries.filter(function (e) { return !e.dir && e.path && !JUNK.test(e.path); });
    // a workbook is a zip too: gather its parts, then turn each sheet into a table
    var isBook = asBook || entries.some(function (e) { return e.path === 'xl/workbook.xml'; }) && entries.some(function (e) { return e.path === '[Content_Types].xml'; });
    if (isBook) return openBook(src, entries, label, prefix, ctx);
    entries.sort(function (a, b) { return a.path < b.path ? -1 : a.path > b.path ? 1 : 0; });
    var pre = {}, pending = 0;
    function fill(from) {   // with helpers: start the next few text entries now, so they unpack side by side; the loop below still takes them in order and applies the same limits
      for (var j = from, started = 0; j < entries.length && started < src.width; j++) {
        var ej = entries[j], ex = extOf(ej.path);
        if (pre[j] !== undefined || ej.usize < (lim.helperMinBytes === undefined ? PAR_ENTRY : lim.helperMinBytes) || ex === 'zip' || ex === 'xlsx' || ex === 'xlsm' || ex === 'xls' || ex === 'ods' || ex === 'numbers' || !(lim.textExt || TEXT_EXT).test(ej.path)) continue;
        if (ej.usize > lim.maxEntryBytes || ej.usize > lim.maxTotalBytes - ctx.total - pending || pending > 268435456) continue;
        pre[j] = src.prefetch(ej, Math.min(lim.maxEntryBytes, lim.maxTotalBytes - ctx.total)); pending += ej.usize; started++;
      }
    }
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
      if (kind === 'text' && src.prefetch) {
        fill(i);
        if (pre[i] !== undefined) {
          var pf = await pre[i]; pending -= e.usize;
          if (pf.skip) { ctx.notes.push('"' + shown + '" ' + pf.skip + '; skipped.'); continue; }
          ctx.total += pf.size;
          if (pf.text === null) { ctx.notes.push('"' + shown + '" looks like a binary file, not text; skipped.'); continue; }
          ctx.files.push({ name: baseOf(e.path), path: shown, text: pf.text }); continue;
        }
      }
      var got = await src.read(e, kind === 'text' ? Math.min(lim.maxEntryBytes, room) : room);
      if (got.skip) { ctx.notes.push('"' + shown + '" ' + got.skip + '; skipped.'); continue; }
      ctx.total += got.bytes.length;
      if (kind === 'text') {
        var text = decodeText(got.bytes);
        if (text === null) { ctx.notes.push('"' + shown + '" looks like a binary file, not text; skipped.'); continue; }
        ctx.files.push({ name: baseOf(e.path), path: shown, text: text });
      } else await openArchive(memSource(got.bytes), baseOf(e.path), shown + '!/', ctx, depth + 1, kind === 'book');
    }
  }

  async function openBook(src, entries, label, prefix, ctx) {
    var lim = ctx.lim, wanted = /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^\/]+\.xml)$/i, parts = {};
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!wanted.test(e.path)) continue;
      var room = Math.min(lim.maxPartBytes, lim.maxTotalBytes - ctx.total);
      if (room <= 0) { ctx.stopped = true; ctx.notes.push('Stopped opening the workbook after ' + Math.round(lim.maxTotalBytes / 1e6) + ' MB of unpacked data (a safety limit).'); break; }
      var got = await src.read(e, room);
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

  compileEarly();
  return { expand: expand, expandBlob: expandBlob, warm: warm, closeHelpers: closeHelpers, _textJob: textJob, list: list, listBlob: listBlob, read: read, readBlob: readBlobEntry, isZip: isZip, looksLikeArchive: looksLikeArchive, decodeText: decodeText, crc32: crc32, wasmAvailable: function () { return !!kernel(); }, wasmReady: function () { return compileEarly(); }, wasmModule: zipModule, _inflateMax: function (n) { INFLATE_MAX = n; }, LIMITS: LIMITS };
}));
