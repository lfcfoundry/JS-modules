/*!
 * clip-writer.js: turn pictures into a short MP4 or WebM video in the browser, with the browser's own video encoder (WebCodecs) and two small file writers. No libraries, works offline.
 * The writers hold the whole file in memory, which is fine for a slide-sized clip. About 8 times smaller than a GIF of the same pictures.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules. Cut from Netflow Map.
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.0 (API 1)
 *
 *   ClipWriter.support(w, h, fps).then(function (s) { ... s.mp4, s.webm ... });       // which formats this browser can make
 *   var wr = ClipWriter.createWriter({ w: 640, h: 360, fps: 25, format: 'mp4', bitsPerPixel: 0.1 });
 *   wr.add(rgbaArrayBuffer, 40);   // a picture (RGBA bytes) and how long it stays, in milliseconds; returns a promise to wait on
 *   wr.finish().then(function (bytes) { ... });                                       // Uint8Array: save as .mp4 or .webm
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ClipWriter = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
  function u16(n) { return [(n >>> 8) & 255, n & 255]; }
  function str(s) { var a = [], i; for (i = 0; i < s.length; i++) a.push(s.charCodeAt(i) & 255); return a; }
  function cat(parts) {   /* byte arrays (plain arrays or Uint8Arrays) into one Uint8Array */
    var n = 0, i, o, p = 0; for (i = 0; i < parts.length; i++) n += parts[i].length;
    o = new Uint8Array(n); for (i = 0; i < parts.length; i++) { o.set(parts[i], p); p += parts[i].length; } return o;
  }

  /* ---- MP4 ---- */
  function box(type, parts) { var body = cat(parts); return cat([u32(body.length + 8), str(type), body]); }
  function full(type, flags, parts) { return box(type, [[0, (flags >>> 16) & 255, (flags >>> 8) & 255, flags & 255]].concat(parts)); }   /* version 0, then the 24-bit flags */
  var MATRIX = [].concat(u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000));
  /** samples: [{ data: Uint8Array (length-prefixed H.264), ms: how long it shows, key: bool }]; avcC: the decoder configuration record. */
  function writeMp4(samples, w, h, avcC) {
    var n = samples.length, total = 0, i, dur = 0, TS = 1000;
    for (i = 0; i < n; i++) { total += samples[i].data.length; dur += samples[i].ms; }
    var ftyp = box('ftyp', [str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41')]);
    var mdatHead = cat([u32(total + 8), str('mdat')]), dataStart = ftyp.length + 8;
    var stts = [], run = 0, last = -1, runs = [];
    for (i = 0; i < n; i++) { if (samples[i].ms === last) run++; else { if (run) runs.push([run, last]); run = 1; last = samples[i].ms; } } if (run) runs.push([run, last]);
    runs.forEach(function (r) { stts.push(u32(r[0]), u32(r[1])); });
    var stss = [], szs = []; for (i = 0; i < n; i++) { if (samples[i].key) stss.push(u32(i + 1)); szs.push(u32(samples[i].data.length)); }
    var avc1 = box('avc1', [[0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0], u32(0), u32(0), u32(0), u16(w), u16(h), u32(0x480000), u32(0x480000), u32(0), u16(1), new Array(32).fill(0), u16(0x18), u16(0xffff), box('avcC', [avcC])]);
    var stbl = box('stbl', [full('stsd', 0, [u32(1), avc1]), full('stts', 0, [u32(runs.length)].concat(stts)), full('stss', 0, [u32(stss.length)].concat(stss)), full('stsc', 0, [u32(1), u32(1), u32(n), u32(1)]), full('stsz', 0, [u32(0), u32(n)].concat(szs)), full('stco', 0, [u32(1), u32(dataStart)])]);
    var minf = box('minf', [full('vmhd', 1, [u16(0), u16(0), u16(0), u16(0)]), box('dinf', [full('dref', 0, [u32(1), full('url ', 1, [])])]), stbl]);
    var mdia = box('mdia', [full('mdhd', 0, [u32(0), u32(0), u32(TS), u32(dur), u16(0x55c4), u16(0)]), full('hdlr', 0, [u32(0), str('vide'), u32(0), u32(0), u32(0), str('Video'), [0]]), minf]);
    var trak = box('trak', [full('tkhd', 3, [u32(0), u32(0), u32(1), u32(0), u32(dur), u32(0), u32(0), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(w * 65536), u32(h * 65536)]), mdia]);
    var moov = box('moov', [full('mvhd', 0, [u32(0), u32(0), u32(TS), u32(dur), u32(0x10000), u16(0x100), u16(0), u32(0), u32(0), MATRIX, new Array(24).fill(0), u32(2)]), trak]);
    var parts = [ftyp, mdatHead]; for (i = 0; i < n; i++) parts.push(samples[i].data); parts.push(moov);
    return cat(parts);
  }

  /* ---- WebM ---- */
  function vsize(n) { return [1, 0, 0, (n / 0x100000000) & 255, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }   /* an 8-byte size */
  function el(id, parts) { var body = cat(parts); return cat([id, vsize(body.length), body]); }
  function uint(n) { var a = [], v = n; do { a.unshift(v & 255); v = Math.floor(v / 256); } while (v); return a; }
  function f64(x) { var b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, x); return b; }
  /** samples: [{ data, ms, key }] of VP9. */
  function writeWebm(samples, w, h) {
    var n = samples.length, i, dur = 0, t = 0, clusters = [], cues = [], cur = null, pos = 0;
    for (i = 0; i < n; i++) dur += samples[i].ms;
    var head = el([0x1a, 0x45, 0xdf, 0xa3], [el([0x42, 0x86], [[1]]), el([0x42, 0xf7], [[1]]), el([0x42, 0xf2], [[4]]), el([0x42, 0xf3], [[8]]), el([0x42, 0x82], [str('webm')]), el([0x42, 0x87], [[4]]), el([0x42, 0x85], [[2]])]);
    var info = el([0x15, 0x49, 0xa9, 0x66], [el([0x2a, 0xd7, 0xb1], [uint(1000000)]), el([0x4d, 0x80], [str('LFC Foundry')]), el([0x57, 0x41], [str('clip-writer')]), el([0x44, 0x89], [f64(dur)])]);
    var tracks = el([0x16, 0x54, 0xae, 0x6b], [el([0xae], [el([0xd7], [[1]]), el([0x73, 0xc5], [[1]]), el([0x83], [[1]]), el([0x86], [str('V_VP9')]), el([0xe0], [el([0xb0], [uint(w)]), el([0xba], [uint(h)])])])]);
    var flush = function () { if (cur) { var c = el([0x1f, 0x43, 0xb6, 0x75], [el([0xe7], [uint(cur.t)])].concat(cur.blocks)); clusters.push(c); pos += c.length; cur = null; } };
    for (i = 0; i < n; i++) {
      var s = samples[i];
      if (!cur || (s.key && cur.blocks.length > 0) || t - cur.t > 30000) { flush(); cur = { t: t, blocks: [], at: pos }; if (s.key) cues.push([t, pos]); }
      cur.blocks.push(el([0xa3], [[0x81], u16(t - cur.t), [s.key ? 0x80 : 0], s.data]));
      t += s.ms;
    }
    flush();
    /* cue positions count from the start of the segment's content: the info, the tracks (and, before the clusters, the cues themselves) come first.
       The cues' own length depends on how many bytes the positions need, so build them again until the length stops changing. */
    var makeCues = function (before) { return el([0x1c, 0x53, 0xbb, 0x6b], cues.map(function (c) { return el([0xbb], [el([0xb3], [uint(c[0])]), el([0xb7], [el([0xf7], [[1]]), el([0xf1], [uint(c[1] + before)])])]); })); };
    var cuesEl = makeCues(0), tries;
    for (tries = 0; tries < 8; tries++) { var again = makeCues(info.length + tracks.length + cuesEl.length); if (again.length === cuesEl.length) { cuesEl = again; break; } cuesEl = again; }
    return cat([head, el([0x18, 0x53, 0x80, 0x67], [info, tracks, cuesEl].concat(clusters))]);
  }

  /* ---- the browser's encoders ---- */
  function codecFor(format, w, h) {
    if (format === 'mp4') return (w * h > 2088960) ? 'avc1.640033' : 'avc1.640028';
    return 'vp09.00.10.08';
  }
  function support(w, h, fps) {
    var out = { mp4: false, webm: false };
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return Promise.resolve(out);
    var test = function (format) {
      var cfg = { codec: codecFor(format, w, h), width: w, height: h, framerate: fps, bitrate: 1e6 }; if (format === 'mp4') cfg.avc = { format: 'avc' };
      return VideoEncoder.isConfigSupported(cfg).then(function (r) { out[format] = !!(r && r.supported); }, function () { /* no */ });
    };
    return test('mp4').then(function () { return test('webm'); }).then(function () { return out; });
  }
  function createWriter(o) {
    var w = o.w & ~1, h = o.h & ~1, format = o.format, samples = [], desc = null, err = null, pending = [], count = 0, t = 0;
    var cfg = { codec: codecFor(format, w, h), width: w, height: h, framerate: o.fps, bitrate: Math.max(100000, Math.round(w * h * o.fps * (o.bitsPerPixel || 0.1))), latencyMode: 'quality' };
    if (format === 'mp4') cfg.avc = { format: 'avc' };
    var enc = new VideoEncoder({
      output: function (chunk, meta) {
        var d = new Uint8Array(chunk.byteLength); chunk.copyTo(d);
        if (meta && meta.decoderConfig && meta.decoderConfig.description) desc = new Uint8Array(meta.decoderConfig.description instanceof ArrayBuffer ? meta.decoderConfig.description : meta.decoderConfig.description.buffer.slice(meta.decoderConfig.description.byteOffset, meta.decoderConfig.description.byteOffset + meta.decoderConfig.description.byteLength));
        samples.push({ data: d, key: chunk.type === 'key', ts: chunk.timestamp });
      },
      error: function (e) { err = e; }
    });
    enc.configure(cfg);
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h; var cx = cv.getContext('2d');
    return {
      w: w, h: h, codec: cfg.codec,
      /** rgba: an ArrayBuffer of w0 × h0 RGBA pixels (the picture size, which is the video size or one or two pixels more). */
      add: function (rgba, ms, w0) {
        if (err) throw err;
        /* through a canvas: some browsers (WebKitGTK) turn a VideoFrame made straight from RGBA bytes into a nearly empty picture */
        cx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w0 || w, Math.round(rgba.byteLength / 4 / (w0 || w))), 0, 0, 0, 0, w, h);
        var f = new VideoFrame(cv, { timestamp: t * 1000, duration: ms * 1000 });
        enc.encode(f, { keyFrame: count % 50 === 0 }); f.close(); count++; t += ms;
        pending.push(ms);
        /* hold back when the encoder is far behind, so pictures do not pile up in memory */
        return enc.encodeQueueSize > 8 ? new Promise(function (r) { var iv = setInterval(function () { if (enc.encodeQueueSize <= 2 || err) { clearInterval(iv); r(); } }, 4); }) : Promise.resolve();
      },
      finish: function () {
        return enc.flush().then(function () {
          if (err) throw err; enc.close();
          if (samples.length !== pending.length) throw new Error('the video encoder gave ' + samples.length + ' pictures for ' + pending.length);
          samples.forEach(function (s, i) { s.ms = pending[i]; });
          if (format === 'mp4') { if (!desc) throw new Error('the encoder gave no H.264 settings'); return writeMp4(samples, w, h, desc); }
          return writeWebm(samples, w, h);
        });
      },
      cancel: function () { try { enc.close(); } catch (e) { /* closed */ } }
    };
  }
  return { version: '1.0.0', api: 1, support: support, createWriter: createWriter, writeMp4: writeMp4, writeWebm: writeWebm };
}));
