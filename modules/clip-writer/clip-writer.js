/*!
 * clip-writer.js: turn pictures into a short MP4 or WebM video in the browser, with the browser's own video encoder (WebCodecs) and two small file writers. No libraries, works offline.
 * The writers hold the whole file in memory, which is fine for a slide-sized clip. About 8 times smaller than a GIF of the same pictures.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules. Cut from Netflow Map.
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.2.0 (API 1)
 *
 *   ClipWriter.support(w, h, fps).then(function (s) { ... s.mp4, s.webm ... });       // which formats this browser can make
 *   var wr = ClipWriter.createWriter({ w: 640, h: 360, fps: 25, format: 'mp4', bitsPerPixel: 0.1 });
 *   wr.add(rgbaArrayBuffer, 40);   // a picture (RGBA bytes) and how long it stays, in milliseconds; returns a promise to wait on
 *   wr.finish().then(function (bytes) { ... });                                       // Uint8Array: save as .mp4 or .webm
 *   Fragmented MP4: format 'fmp4' (with onSegment(bytes, isInit) to stream the pieces); sound: audio: { sampleRate: 48000, channels: 2, codec: 'opus' } and wr.addAudio([left, right]).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ClipWriter = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var MAX_MP4_DURATION = 0xffffffff, MAX_WEBM_INTEGER = 9007199254740991;
  function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
  function u16(n) { return [(n >>> 8) & 255, n & 255]; }
  function str(s) { var a = [], i; for (i = 0; i < s.length; i++) a.push(s.charCodeAt(i) & 255); return a; }
  function durationTotal(samples, limit, format) {
    var total = 0, i, ms;
    for (i = 0; i < samples.length; i++) {
      ms = samples[i] && samples[i].ms;
      if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) throw new RangeError('clip-writer: frame duration must be a finite non-negative number');
      total += ms;
      if (!isFinite(total) || total > limit) throw new RangeError('clip-writer: ' + format + ' duration exceeds its supported range');
    }
    return total;
  }
  function cat(parts) {   /* byte arrays (plain arrays or Uint8Arrays) into one Uint8Array */
    var n = 0, i, o, p = 0; for (i = 0; i < parts.length; i++) n += parts[i].length;
    o = new Uint8Array(n); for (i = 0; i < parts.length; i++) { o.set(parts[i], p); p += parts[i].length; } return o;
  }

  /* ---- MP4 ---- */
  function box(type, parts) { var body = cat(parts); return cat([u32(body.length + 8), str(type), body]); }
  function full(type, flags, parts) { return box(type, [[0, (flags >>> 16) & 255, (flags >>> 8) & 255, flags & 255]].concat(parts)); }   /* version 0, then the 24-bit flags */
  var MATRIX = [].concat(u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000));
  function avc1Box(w, h, avcC) { return box('avc1', [[0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0], u32(0), u32(0), u32(0), u16(w), u16(h), u32(0x480000), u32(0x480000), u32(0), u16(1), new Array(32).fill(0), u16(0x18), u16(0xffff), box('avcC', [avcC])]); }
  function trakBox(w, h, dur, stbl) {   /* the video track around a sample table (dur in milliseconds) */
    var minf = box('minf', [full('vmhd', 1, [u16(0), u16(0), u16(0), u16(0)]), box('dinf', [full('dref', 0, [u32(1), full('url ', 1, [])])]), stbl]);
    var mdia = box('mdia', [full('mdhd', 0, [u32(0), u32(0), u32(1000), u32(dur), u16(0x55c4), u16(0)]), full('hdlr', 0, [u32(0), str('vide'), u32(0), u32(0), u32(0), str('Video'), [0]]), minf]);
    return box('trak', [full('tkhd', 3, [u32(0), u32(0), u32(1), u32(0), u32(dur), u32(0), u32(0), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(w * 65536), u32(h * 65536)]), mdia]);
  }
  function mvhdBox(dur, nextTrack) { return full('mvhd', 0, [u32(0), u32(0), u32(1000), u32(dur), u32(0x10000), u16(0x100), u16(0), u32(0), u32(0), MATRIX, new Array(24).fill(0), u32(nextTrack || 2)]); }
  /* ---- one AAC audio track: audio = { samples: [{ data, ticks }] (ticks in 1 / sampleRate s, usually 1024), sampleRate, channels, config: the AudioSpecificConfig bytes } ---- */
  function checkAudio(a) {
    var i, t;
    if (!a || !a.samples || !a.config || !(a.sampleRate > 0 && a.sampleRate < 65536) || !(a.channels > 0) || (a.codec !== 'opus' && a.config.length > 100)) throw new RangeError('clip-writer: audio needs samples, config, sampleRate (under 65536) and channels');
    if (a.codec === 'opus' && a.sampleRate !== 48000) throw new RangeError('clip-writer: opus in MP4 uses a sample rate of 48000');
    for (i = 0; i < a.samples.length; i++) { t = a.samples[i].ticks; if (typeof t !== 'number' || !isFinite(t) || t < 0 || t > 0xffffffff) throw new RangeError('clip-writer: audio sample length must be a finite non-negative number of ticks'); }
  }
  function audioTicks(a) { var t = 0, i; for (i = 0; i < a.samples.length; i++) t += a.samples[i].ticks >>> 0; return t; }
  function opusBox(a) {   /* config is the encoder's OpusHead; MP4 wants it as a dOps box (big-endian, no 'OpusHead' text) */
    var c = a.config, le16 = function (p) { return c[p] | (c[p + 1] << 8); }, le32 = function (p) { return (c[p] | (c[p + 1] << 8) | (c[p + 2] << 16) | (c[p + 3] << 24)) >>> 0; };
    if (c.length < 19 || String.fromCharCode.apply(null, Array.prototype.slice.call(c, 0, 8)) !== 'OpusHead') throw new RangeError('clip-writer: opus config must be the 19+ byte OpusHead record');
    var gain = le16(16);
    return box('Opus', [[0, 0, 0, 0, 0, 0, 0, 1], [0, 0, 0, 0, 0, 0, 0, 0], u16(a.channels), u16(16), u16(0), u16(0), u32(48000 * 65536),
      box('dOps', [[0, c[9]], u16(le16(10)), u32(le32(12)), u16(gain), [c[18]], Array.prototype.slice.call(c, 19)])]);
  }
  function mp4aBox(a) {
    if (a.codec === 'opus') return opusBox(a);
    var cfg = Array.prototype.slice.call(a.config), L = cfg.length;
    var esds = full('esds', 0, [[3, 23 + L, 0, 2, 0, 4, 15 + L, 0x40, 0x15, 0, 0, 0], u32(0), u32(0), [5, L], cfg, [6, 1, 2]]);
    return box('mp4a', [[0, 0, 0, 0, 0, 0, 0, 1], [0, 0, 0, 0, 0, 0, 0, 0], u16(a.channels), u16(16), u16(0), u16(0), u32(a.sampleRate * 65536), esds]);
  }
  function audioTrakBox(a, ticks, stbl) {
    var movieMs = Math.round(ticks * 1000 / a.sampleRate);
    var minf = box('minf', [full('smhd', 0, [u16(0), u16(0)]), box('dinf', [full('dref', 0, [u32(1), full('url ', 1, [])])]), stbl]);
    var mdia = box('mdia', [full('mdhd', 0, [u32(0), u32(0), u32(a.sampleRate), u32(ticks), u16(0x55c4), u16(0)]), full('hdlr', 0, [u32(0), str('soun'), u32(0), u32(0), u32(0), str('Sound'), [0]]), minf]);
    return box('trak', [full('tkhd', 3, [u32(0), u32(0), u32(2), u32(0), u32(movieMs), u32(0), u32(0), u16(0), u16(0), u16(0x100), u16(0), MATRIX, u32(0), u32(0)]), mdia]);
  }
  /** samples: [{ data: Uint8Array (length-prefixed H.264), ms: how long it shows, key: bool }]; avcC: the decoder configuration record. */
  function writeMp4(samples, w, h, avcC, audio) {
    var n = samples.length, total = 0, i, dur = durationTotal(samples, MAX_MP4_DURATION, 'MP4'), atotal = 0, aticks = 0, atrak = null, movieDur = dur;
    for (i = 0; i < n; i++) total += samples[i].data.length;
    if (audio) { checkAudio(audio); for (i = 0; i < audio.samples.length; i++) atotal += audio.samples[i].data.length; aticks = audioTicks(audio); movieDur = Math.max(dur, Math.round(aticks * 1000 / audio.sampleRate)); if (movieDur > MAX_MP4_DURATION) throw new RangeError('clip-writer: MP4 duration exceeds its supported range'); }
    var ftyp = box('ftyp', [str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41')]);
    var mdatHead = cat([u32(total + atotal + 8), str('mdat')]), dataStart = ftyp.length + 8;
    var stts = [], run = 0, last = -1, runs = [];
    for (i = 0; i < n; i++) { if (samples[i].ms === last) run++; else { if (run) runs.push([run, last]); run = 1; last = samples[i].ms; } } if (run) runs.push([run, last]);
    runs.forEach(function (r) { stts.push(u32(r[0]), u32(r[1])); });
    var stss = [], szs = []; for (i = 0; i < n; i++) { if (samples[i].key) stss.push(u32(i + 1)); szs.push(u32(samples[i].data.length)); }
    var stbl = box('stbl', [full('stsd', 0, [u32(1), avc1Box(w, h, avcC)]), full('stts', 0, [u32(runs.length)].concat(stts)), full('stss', 0, [u32(stss.length)].concat(stss)), full('stsc', 0, [u32(1), u32(1), u32(n), u32(1)]), full('stsz', 0, [u32(0), u32(n)].concat(szs)), full('stco', 0, [u32(1), u32(dataStart)])]);
    var trak = trakBox(w, h, dur, stbl);
    if (audio) {
      var m = audio.samples.length, astts = [], arun = 0, alast = -1, aruns = [], aszs = [];
      for (i = 0; i < m; i++) { var tk = audio.samples[i].ticks >>> 0; if (tk === alast) arun++; else { if (arun) aruns.push([arun, alast]); arun = 1; alast = tk; } aszs.push(u32(audio.samples[i].data.length)); } if (arun) aruns.push([arun, alast]);
      aruns.forEach(function (r) { astts.push(u32(r[0]), u32(r[1])); });
      atrak = audioTrakBox(audio, aticks, box('stbl', [full('stsd', 0, [u32(1), mp4aBox(audio)]), full('stts', 0, [u32(aruns.length)].concat(astts)), full('stsc', 0, [u32(1), u32(1), u32(m), u32(1)]), full('stsz', 0, [u32(0), u32(m)].concat(aszs)), full('stco', 0, [u32(1), u32(dataStart + total)])]));
    }
    var moov = box('moov', atrak ? [mvhdBox(movieDur, 3), trak, atrak] : [mvhdBox(dur), trak]);
    var parts = [ftyp, mdatHead]; for (i = 0; i < n; i++) parts.push(samples[i].data);
    if (audio) for (i = 0; i < audio.samples.length; i++) parts.push(audio.samples[i].data);
    parts.push(moov);
    return cat(parts);
  }

  /* ---- fragmented MP4: a start-up header (ftyp + moov with no pictures in it), then one moof + mdat pair for every run of pictures that starts at a key picture.
     Each pair can be played alone, appended to a MediaSource, or sent over a connection. Pairs are written straight into one buffer (no box tree). ---- */
  var FKEY = 0x02000000, FDELTA = 0x01010000;   /* sample flags: a key picture; a picture that needs the ones before it */
  function fmp4Init(w, h, avcC, audio) {
    var stbl = box('stbl', [full('stsd', 0, [u32(1), avc1Box(w, h, avcC)]), full('stts', 0, [u32(0)]), full('stsc', 0, [u32(0)]), full('stsz', 0, [u32(0), u32(0)]), full('stco', 0, [u32(0)])]);
    var trex = [full('trex', 0, [u32(1), u32(1), u32(0), u32(0), u32(FDELTA)])], traks = [trakBox(w, h, 0, stbl)];
    if (audio) {
      checkAudio(audio); trex.push(full('trex', 0, [u32(2), u32(1), u32(0), u32(0), u32(FKEY)]));
      traks.push(audioTrakBox(audio, 0, box('stbl', [full('stsd', 0, [u32(1), mp4aBox(audio)]), full('stts', 0, [u32(0)]), full('stsc', 0, [u32(0)]), full('stsz', 0, [u32(0), u32(0)]), full('stco', 0, [u32(0)])])));
    }
    return cat([box('ftyp', [str('iso5'), u32(512), str('iso5'), str('iso6'), str('avc1'), str('mp41')]), box('moov', [mvhdBox(0, audio ? 3 : 2)].concat(traks, [box('mvex', trex)]))]);
  }
  function uniform(samples, a, b) { var ms = samples[a].ms >>> 0, i; for (i = a + 1; i < b; i++) if ((samples[i].ms >>> 0) !== ms) return false; return true; }
  function dataSize(samples, a, b) { var data = 0, i; for (i = a; i < b; i++) data += samples[i].data.length; return data; }
  /** the audio part of one fragment: { s: audio samples, a, b: which ones, t: ticks before the first, data: their bytes } or null */
  function audioPart(s, a, b, t) { return b > a ? { s: s, a: a, b: b, t: t, data: dataSize(s, a, b) } : null; }
  function fragSize(n, u, data, au) { return 24 + (n ? 8 + (u ? 24 : 20) + 20 + 24 + n * (u ? 4 : 8) : 0) + (au ? 64 + (au.b - au.a) * 8 : 0) + 8 + data + (au ? au.data : 0); }   /* moof header + mfhd, video traf (header, tfhd, tfdt, trun), audio traf (header 8, tfhd 16, tfdt 20, trun 20 + 8 per sample), mdat header, bytes */
  function w32(o, p, v) { o[p] = v >>> 24; o[p + 1] = (v >>> 16) & 255; o[p + 2] = (v >>> 8) & 255; o[p + 3] = v & 255; }
  /** writes pictures a..b-1 (none when a = b) and the audio part as one moof + mdat pair at out[pos]; t = the first picture's start in ms; u = every time the same (see uniform); data = total picture bytes; returns the end position */
  function putFragment(samples, a, b, seq, t, out, pos, u, data, au) {
    var n = b - a, tfhd = u ? 24 : 20, trunV = n ? 24 + n * (u ? 4 : 8) : 0, trafV = n ? 8 + tfhd + 20 + trunV : 0, m = au ? au.b - au.a : 0, trafA = au ? 64 + m * 8 : 0, moof = 24 + trafV + trafA, p = pos, i, s;
    w32(out, p, moof); w32(out, p + 4, 0x6d6f6f66);                 /* moof */
    w32(out, p + 8, 16); w32(out, p + 12, 0x6d666864); w32(out, p + 16, 0); w32(out, p + 20, seq);   /* mfhd */
    p += 24;
    if (n) {
      w32(out, p, trafV); w32(out, p + 4, 0x74726166); p += 8;   /* traf */
      w32(out, p, tfhd); w32(out, p + 4, 0x74666864); w32(out, p + 8, u ? 0x020028 : 0x020020); w32(out, p + 12, 1); p += 16;   /* tfhd: offsets count from the moof */
      if (u) { w32(out, p, samples[a].ms >>> 0); p += 4; }
      w32(out, p, FDELTA); p += 4;
      w32(out, p, 20); w32(out, p + 4, 0x74666474); w32(out, p + 8, 0x01000000); w32(out, p + 12, Math.floor(t / 4294967296)); w32(out, p + 16, t >>> 0); p += 20;   /* tfdt */
      w32(out, p, trunV); w32(out, p + 4, 0x7472756e); w32(out, p + 8, u ? 0x205 : 0x305); w32(out, p + 12, n); w32(out, p + 16, moof + 8); w32(out, p + 20, samples[a].key ? FKEY : FDELTA); p += 24;
      for (i = a; i < b; i++) { if (!u) { w32(out, p, samples[i].ms >>> 0); p += 4; } w32(out, p, samples[i].data.length); p += 4; }
    }
    if (au) {
      w32(out, p, trafA); w32(out, p + 4, 0x74726166); p += 8;   /* traf of track 2 */
      w32(out, p, 16); w32(out, p + 4, 0x74666864); w32(out, p + 8, 0x020000); w32(out, p + 12, 2); p += 16;
      w32(out, p, 20); w32(out, p + 4, 0x74666474); w32(out, p + 8, 0x01000000); w32(out, p + 12, Math.floor(au.t / 4294967296)); w32(out, p + 16, au.t >>> 0); p += 20;
      w32(out, p, 20 + m * 8); w32(out, p + 4, 0x7472756e); w32(out, p + 8, 0x301); w32(out, p + 12, m); w32(out, p + 16, moof + 8 + data); p += 20;
      for (i = au.a; i < au.b; i++) { w32(out, p, au.s[i].ticks >>> 0); w32(out, p + 4, au.s[i].data.length); p += 8; }
    }
    w32(out, p, 8 + data + (au ? au.data : 0)); w32(out, p + 4, 0x6d646174); p += 8;   /* mdat */
    for (i = a; i < b; i++) { s = samples[i].data; out.set(s, p); p += s.length; }
    if (au) for (i = au.a; i < au.b; i++) { s = au.s[i].data; out.set(s, p); p += s.length; }
    return p;
  }
  function fmp4Build(samples, w, h, avcC, audio) {   /* one buffer: init, then every fragment; returns it with where each part starts */
    var n = samples.length, init = fmp4Init(w, h, avcC, audio), cuts = [init.length], starts = [], us = [], datas = [], times = [], total = init.length, i, a = 0, ms, first = 0, u = true, data = 0, out, p, t = 0, ta = 0, aus = [], ai = 0, at = 0, as = audio ? audio.samples : null, end;
    durationTotal(samples, MAX_WEBM_INTEGER, 'MP4');
    for (i = 0; i <= n; i++) {   /* one pass: a run ends at every key picture, and at the end */
      if (i === n || (i > a && samples[i].key)) {
        if (i > a) { starts.push(a); us.push(u); datas.push(data); times.push(ta); }
        a = i; ta = t; u = true; data = 0; if (i === n) break;
      }
      ms = samples[i].ms >>> 0; if (i === a) first = ms; else if (ms !== first) u = false;
      data += samples[i].data.length; t += ms;
    }
    for (i = 0; i < starts.length; i++) {   /* each run takes the sound that begins before the next run does; the last run takes what is left */
      var au = null;
      if (as) {
        var a0 = ai, t0 = at; end = i + 1 < starts.length ? times[i + 1] : Infinity;
        while (ai < as.length && (at * 1000 / audio.sampleRate < end)) { at += as[ai].ticks >>> 0; ai++; }
        au = audioPart(as, a0, ai, t0);
      }
      aus.push(au); total += fragSize(starts[i + 1] === undefined ? n - starts[i] : starts[i + 1] - starts[i], us[i], datas[i], au); cuts.push(total);
    }
    out = new Uint8Array(total); out.set(init, 0); p = init.length;
    for (i = 0; i < starts.length; i++) p = putFragment(samples, starts[i], i + 1 < starts.length ? starts[i + 1] : n, i + 1, times[i], out, p, us[i], datas[i], aus[i]);
    return { bytes: out, cuts: cuts };
  }
  /** the whole fragmented file in one Uint8Array: init, then every fragment. Takes the same samples as writeMp4 (and the same optional audio). */
  function writeFmp4(samples, w, h, avcC, audio) { return fmp4Build(samples, w, h, avcC, audio).bytes; }
  /** { init, fragments: [Uint8Array, ...] } as views into one buffer: append init, then each fragment, to a MediaSource or send them one at a time. */
  function writeFmp4Segments(samples, w, h, avcC, audio) {
    var r = fmp4Build(samples, w, h, avcC, audio), i, frags = [];
    for (i = 1; i < r.cuts.length; i++) frags.push(r.bytes.subarray(r.cuts[i - 1], r.cuts[i]));
    return { init: r.bytes.subarray(0, r.cuts[0]), fragments: frags };
  }

  /* ---- WebM ---- */
  function vsize(n) { return [1, 0, 0, (n / 0x100000000) & 255, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }   /* an 8-byte size */
  function el(id, parts) { var body = cat(parts); return cat([id, vsize(body.length), body]); }
  function uint(n) { if (!(n >= 0) || !isFinite(n) || n > MAX_WEBM_INTEGER) throw new RangeError('clip-writer: WebM integer is out of range'); var a = [], v = n; do { a.unshift(v & 255); v = Math.floor(v / 256); } while (v); return a; }
  function f64(x) { var b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, x); return b; }
  /** samples: [{ data, ms, key }] of VP9. */
  function writeWebm(samples, w, h) {
    var n = samples.length, i, dur = durationTotal(samples, MAX_WEBM_INTEGER, 'WebM'), t = 0, clusters = [], cues = [], cur = null, pos = 0;
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
    if (format === 'mp4' || format === 'fmp4') return (w * h > 2088960) ? 'avc1.640033' : 'avc1.640028';
    return 'vp09.00.10.08';
  }
  function support(w, h, fps) {
    var out = { mp4: false, webm: false, fmp4: false, audio: false, aac: false, opus: false };
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return Promise.resolve(out);
    var test = function (format) {
      var cfg = { codec: codecFor(format, w, h), width: w, height: h, framerate: fps, bitrate: 1e6 }; if (format === 'mp4') cfg.avc = { format: 'avc' };
      return VideoEncoder.isConfigSupported(cfg).then(function (r) { out[format] = !!(r && r.supported); }, function () { /* no */ });
    };
    var audio = function () {
      if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return Promise.resolve();
      var one = function (key, cfg) { return AudioEncoder.isConfigSupported(cfg).then(function (r) { out[key] = !!(r && r.supported); out.audio = out.audio || out[key]; }, function () { /* no */ }); };
      return one('aac', { codec: 'mp4a.40.2', sampleRate: 44100, numberOfChannels: 2, bitrate: 96000 }).then(function () { return one('opus', { codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 96000 }); });
    };
    return test('mp4').then(function () { return test('webm'); }).then(audio).then(function () { out.fmp4 = out.mp4; return out; });
  }
  function createWriter(o) {
    var w = o.w & ~1, h = o.h & ~1, format = o.format, samples = [], desc = null, err = null, pending = [], count = 0, t = 0;
    var mp4ish = format === 'mp4' || format === 'fmp4', ao = o.audio, aenc = null, asamples = [], adesc = null, aPos = 0;
    if (ao && !mp4ish) throw new Error('clip-writer: sound goes into MP4 only (format mp4 or fmp4)');
    var opus = !!(ao && ao.codec === 'opus');
    var audioObj = function (list) { return adesc ? { samples: list, sampleRate: ao.sampleRate, channels: ao.channels, config: adesc, codec: opus ? 'opus' : 'aac' } : null; };
    /* fragmented MP4 with onSegment: each run of pictures is handed over as soon as the next key picture shows it is complete, and nothing is kept */
    var live = format === 'fmp4' && typeof o.onSegment === 'function', run = [], runT = 0, seq = 1, got = 0, sentInit = false, aq = [], aSent = 0;
    var sendRun = function (last) {
      var u = run.length ? uniform(run, 0, run.length) : true, data = dataSize(run, 0, run.length), i, au = null, buf;
      if (!run.length && !(last && aq.length)) return;
      if (!sentInit) { sentInit = true; o.onSegment(fmp4Init(w, h, desc, audioObj([])), true); }
      if (aq.length) { if (!adesc) throw new Error('the audio encoder gave no settings'); au = audioPart(aq, 0, aq.length, aSent); for (i = 0; i < aq.length; i++) aSent += aq[i].ticks >>> 0; }
      buf = new Uint8Array(fragSize(run.length, u, data, au));
      putFragment(run, 0, run.length, seq++, runT, buf, 0, u, data, au); for (i = 0; i < run.length; i++) runT += run[i].ms >>> 0; run = []; aq = []; o.onSegment(buf, false);
    };
    var cfg = { codec: codecFor(format, w, h), width: w, height: h, framerate: o.fps, bitrate: Math.max(100000, Math.round(w * h * o.fps * (o.bitsPerPixel || 0.1))), latencyMode: 'quality' };
    if (mp4ish) cfg.avc = { format: 'avc' };
    var enc = new VideoEncoder({
      output: function (chunk, meta) {
        var d = new Uint8Array(chunk.byteLength); chunk.copyTo(d);
        if (meta && meta.decoderConfig && meta.decoderConfig.description) desc = new Uint8Array(meta.decoderConfig.description instanceof ArrayBuffer ? meta.decoderConfig.description : meta.decoderConfig.description.buffer.slice(meta.decoderConfig.description.byteOffset, meta.decoderConfig.description.byteOffset + meta.decoderConfig.description.byteLength));
        if (live) {
          if (chunk.type === 'key') { try { sendRun(); } catch (e) { err = e; } }
          run.push({ data: d, key: chunk.type === 'key', ms: pending[got++] });
        } else samples.push({ data: d, key: chunk.type === 'key', ts: chunk.timestamp });
      },
      error: function (e) { err = e; }
    });
    enc.configure(cfg);
    if (ao) {
      aenc = new AudioEncoder({
        output: function (chunk, meta) {
          var d = new Uint8Array(chunk.byteLength), s; chunk.copyTo(d);
          if (meta && meta.decoderConfig && meta.decoderConfig.description) { var ds = meta.decoderConfig.description; adesc = new Uint8Array(ds instanceof ArrayBuffer ? ds.slice(0) : ds.buffer.slice(ds.byteOffset, ds.byteOffset + ds.byteLength)); }
          s = { data: d, ticks: chunk.duration ? Math.round(chunk.duration * ao.sampleRate / 1e6) : (opus ? 960 : 1024) };
          if (live) { if (sentInit && !adesc) err = new Error('the sound started after the first piece was sent'); aq.push(s); } else asamples.push(s);
        },
        error: function (e) { err = e; }
      });
      var ac = { codec: opus ? 'opus' : 'mp4a.40.2', sampleRate: ao.sampleRate, numberOfChannels: ao.channels, bitrate: ao.bitrate || 96000 }; if (!opus) ac.aac = { format: 'aac' }; aenc.configure(ac);
    }
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
      /** channels: one Float32Array of samples in -1..1 per channel (a mono clip may pass one Float32Array); they follow the sound added before, in order. Needs the audio option. */
      addAudio: function (channels) {
        if (!aenc) throw new Error('clip-writer: pass the audio option to createWriter first');
        if (err) throw err;
        var list = channels instanceof Float32Array ? [channels] : channels, n = list[0].length, buf = new Float32Array(n * list.length), k;
        if (list.length !== ao.channels) throw new RangeError('clip-writer: expected ' + ao.channels + ' channels of sound');
        for (k = 0; k < list.length; k++) buf.set(list[k], k * n);
        var ad = new AudioData({ format: 'f32-planar', sampleRate: ao.sampleRate, numberOfFrames: n, numberOfChannels: list.length, timestamp: Math.round(aPos * 1e6 / ao.sampleRate), data: buf });
        aenc.encode(ad); ad.close(); aPos += n;
        return aenc.encodeQueueSize > 8 ? new Promise(function (r) { var iv = setInterval(function () { if (aenc.encodeQueueSize <= 2 || err) { clearInterval(iv); r(); } }, 4); }) : Promise.resolve();
      },
      finish: function () {
        return (aenc ? aenc.flush() : Promise.resolve()).then(function () { return enc.flush(); }).then(function () {
          if (err) throw err; enc.close(); if (aenc) aenc.close();
          if (live) { if (got !== pending.length) throw new Error('the video encoder gave ' + got + ' pictures for ' + pending.length); sendRun(true); return null; }
          if (samples.length !== pending.length) throw new Error('the video encoder gave ' + samples.length + ' pictures for ' + pending.length);
          samples.forEach(function (s, i) { s.ms = pending[i]; });
          if (mp4ish) { if (!desc) throw new Error('the encoder gave no H.264 settings'); return (format === 'mp4' ? writeMp4 : writeFmp4)(samples, w, h, desc, asamples.length ? audioObj(asamples) : null); }
          return writeWebm(samples, w, h);
        });
      },
      cancel: function () { try { enc.close(); } catch (e) { /* closed */ } try { if (aenc) aenc.close(); } catch (e) { /* closed */ } }
    };
  }
  return { version: '1.2.0', api: 1, support: support, createWriter: createWriter, writeMp4: writeMp4, writeFmp4: writeFmp4, writeFmp4Segments: writeFmp4Segments, writeWebm: writeWebm };
}));
