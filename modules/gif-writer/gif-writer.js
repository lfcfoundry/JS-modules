/*!
 * gif-writer.js: write animated GIFs from canvas pictures, in the browser or in Node. No dependencies.
 * One palette for the whole animation (median cut then k-means over the exact colors of several pictures), pixels that did not change
 * are left transparent, and every picture is compressed the moment it is added.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.0.0 (API 1)
 *
 *   var pal = GifWriter.makePalette([rgba1, rgba2], 255);          // rgba: Uint8ClampedArray from ctx.getImageData(...).data
 *   var enc = GifWriter.createEncoder(width, height, pal, { loop: true });
 *   enc.add(rgba1, 500); enc.add(rgba2, 300);                       // picture, how long it stays (milliseconds)
 *   var bytes = enc.finish();                                       // Uint8Array: save as .gif
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GifWriter = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

  /** The pixels of an RGBA array as 0xRRGGBB numbers, one callback-free pass into `fn(color)`; also returns a Uint32 view when it can. */
  function words(rgba) {
    var n = rgba.length >> 2;
    if (LE && (rgba.byteOffset & 3) === 0) return new Uint32Array(rgba.buffer, rgba.byteOffset, n);
    var w = new Uint32Array(n);
    for (var i = 0; i < n; i++) w[i] = (rgba[i * 4] | (rgba[i * 4 + 1] << 8) | (rgba[i * 4 + 2] << 16) | (rgba[i * 4 + 3] << 24)) >>> 0;   // same layout as a little-endian view
    return w;
  }
  var rgbOf = function (px) { return ((px & 255) << 16) | (px & 0xff00) | ((px >>> 16) & 255); };

  /** Up to maxColors colors that stand for the pictures. */
  function makePalette(pictures, maxColors) {
    maxColors = Math.min(255, maxColors || 255);
    var HB = 16, HS = 1 << HB, mask = 0xffffff, attempt, uniq = 0, keys, cnts, p, i;
    var total = 0; for (p = 0; p < pictures.length; p++) total += pictures[p].length >> 2;
    var stride = total > 1000000 ? 2 : 1;   // big pictures: look at every other pixel (the colors that matter come in runs and areas, so the palette barely changes; the histogram is the largest steady cost)
    for (attempt = 0; attempt < 6; attempt++) {
      keys = new Int32Array(HS).fill(-1); cnts = new Int32Array(HS); uniq = 0;
      var cap = HS * 0.4;
      for (p = 0; p < pictures.length && uniq <= cap; p++) {
        var w = words(pictures[p]), n = w.length, last = -2, lastSlot = 0;
        for (i = 0; i < n; i += stride) {
          var col = rgbOf(w[i]) & mask;
          if (col === last) { cnts[lastSlot]++; continue; }
          var h = Math.imul(col, 0x9e3779b1) >>> (32 - HB);
          while (keys[h] !== -1 && keys[h] !== col) h = (h + 1) & (HS - 1);
          if (keys[h] === -1) { keys[h] = col; uniq++; if (uniq > cap) break; }
          cnts[h]++; last = col; lastSlot = h;
        }
      }
      if (uniq <= cap) break;
      // too many distinct colors for the table: first a bigger table (flat pictures need a tiny one, which stays in the cache), then (a photograph) drop the lowest bits of every channel and count again
      if (attempt === 0) { HB = 20; HS = 1 << HB; } else if (attempt === 1) { HB = 22; HS = 1 << HB; } else mask = attempt === 2 ? 0xfefefe : attempt === 3 ? 0xfcfcfc : 0xf8f8f8;
    }
    var R = new Uint8Array(uniq), G = new Uint8Array(uniq), B = new Uint8Array(uniq), C = new Float64Array(uniq), u = 0;
    for (i = 0; i < HS; i++) if (keys[i] !== -1) { R[u] = keys[i] >> 16; G[u] = (keys[i] >> 8) & 255; B[u] = keys[i] & 255; C[u] = cnts[i]; u++; }
    keys = cnts = null;
    if (uniq <= maxColors) { var exact = []; for (i = 0; i < uniq; i++) exact.push([R[i], G[i], B[i]]); return exact; }

    /* median cut: boxes are ranges of `order`; the box with the widest spread (times the square root of its pixels) is cut where half its pixels lie */
    var order = new Int32Array(uniq), sortKey = new Int32Array(uniq);
    for (i = 0; i < uniq; i++) order[i] = i;
    var chans = [R, G, B], boxes = [];
    var stats = function (lo, hi) {
      var r0 = 255, r1 = 0, g0 = 255, g1 = 0, b0 = 255, b1 = 0, tot = 0;
      for (var q = lo; q < hi; q++) { var o = order[q], r = R[o], g = G[o], b = B[o]; if (r < r0) r0 = r; if (r > r1) r1 = r; if (g < g0) g0 = g; if (g > g1) g1 = g; if (b < b0) b0 = b; if (b > b1) b1 = b; tot += C[o]; }
      var dr = r1 - r0, dg = g1 - g0, db = b1 - b0, mx = Math.max(dr, dg, db);
      return { lo: lo, hi: hi, ch: dr >= dg && dr >= db ? 0 : dg >= db ? 1 : 2, score: hi - lo < 2 ? 0 : mx * Math.sqrt(tot), tot: tot };
    };
    boxes.push(stats(0, uniq));
    while (boxes.length < maxColors) {
      var bi = -1, bs = 0, q;
      for (q = 0; q < boxes.length; q++) if (boxes[q].score > bs) { bs = boxes[q].score; bi = q; }
      if (bi < 0) break;
      var bx = boxes[bi], ch = chans[bx.ch];
      for (q = bx.lo; q < bx.hi; q++) sortKey[q] = (ch[order[q]] << 21) | order[q];
      sortKey.subarray(bx.lo, bx.hi).sort();
      for (q = bx.lo; q < bx.hi; q++) order[q] = sortKey[q] & 0x1fffff;
      var run = 0, cut = bx.lo + 1;
      for (q = bx.lo; q < bx.hi - 1; q++) { run += C[order[q]]; cut = q + 1; if (run >= bx.tot / 2) break; }
      boxes.splice(bi, 1, stats(bx.lo, cut), stats(cut, bx.hi));
    }
    var K = boxes.length, cr = new Float64Array(K), cg = new Float64Array(K), cb = new Float64Array(K);
    boxes.forEach(function (bx2, k) {
      var r = 0, g = 0, b = 0, t = 0;
      for (var q2 = bx2.lo; q2 < bx2.hi; q2++) { var o = order[q2], c = C[o]; r += R[o] * c; g += G[o] * c; b += B[o] * c; t += c; }
      cr[k] = r / t; cg[k] = g / t; cb[k] = b / t;
    });
    /* a few rounds of k-means (each color to its nearest center, centers to the pixel-weighted mean); the same eye-weighted distance as the encoder uses */
    var rounds = uniq * K <= 6e7 ? 2 : uniq * K <= 3e8 ? 1 : 0, assign = new Int32Array(uniq);
    for (var it = 0; it < rounds; it++) {
      var sr = new Float64Array(K), sg = new Float64Array(K), sb = new Float64Array(K), st = new Float64Array(K);
      for (i = 0; i < uniq; i++) {
        var r2 = R[i], g2 = G[i], b2 = B[i], best = 0, bd = 1e18;
        for (var k2 = 0; k2 < K; k2++) { var dr2 = cr[k2] - r2, dg2 = cg[k2] - g2, db2 = cb[k2] - b2, dd = dr2 * dr2 * 2 + dg2 * dg2 * 4 + db2 * db2 * 3; if (dd < bd) { bd = dd; best = k2; } }
        assign[i] = best; var c2 = C[i]; sr[best] += r2 * c2; sg[best] += g2 * c2; sb[best] += b2 * c2; st[best] += c2;
      }
      for (var k3 = 0; k3 < K; k3++) if (st[k3] > 0) { cr[k3] = sr[k3] / st[k3]; cg[k3] = sg[k3] / st[k3]; cb[k3] = sb[k3] / st[k3]; }
    }
    var out = [];
    for (var k4 = 0; k4 < K; k4++) out.push([Math.round(cr[k4]), Math.round(cg[k4]), Math.round(cb[k4])]);
    return out;
  }

  /**
   * LZW for GIF. indices: Uint8Array of palette numbers. Returns the code bytes (not yet cut into blocks) as a Uint8Array.
   * The string table is a small open-addressing hash (16K slots, cleared whenever the 4096 codes are used up), which stays in the processor cache.
   */
  var HK = null, HV = null, RC = null;
  function lzw(indices, minCode, plain) {
    var len = indices.length, clearCode = 1 << minCode, eoi = clearCode + 1, next = eoi + 1, size = minCode + 1, i;
    if (!HK) { HK = new Int32Array(16384); HV = new Uint16Array(16384); RC = []; }
    var hk = HK, hv = HV, rc = RC, out = new Uint8Array(Math.ceil((len + 8) * 1.51) + 64), o = 0, cur = 0, shift = 0;
    var emit = function (code) { cur |= code << shift; shift += size; while (shift >= 8) { out[o++] = cur & 255; cur >>>= 8; shift -= 8; } };
    /* Runs of one value (the transparent parts of a changed picture are runs hundreds of thousands long) are handled without looking at every
       item. In a run of c the table holds c, cc, ccc ... up to some length m ("the chain": its length rl[] and its codes rc[c][length]); the
       coder must emit the code of the longest, and add one longer. That is a fixed pattern, so a whole run is walked in a few steps. The bytes
       are the same as the item-by-item coder gives (`plain` = true runs that coder; test/run.js compares them). */
    var top = null, topLen = null, c;
    if (!plain) { top = new Int32Array(256).fill(-1); topLen = new Uint16Array(256); }
    var resetChains = function () { for (var q = 0; q < 256; q++) if (top[q] >= 0) { top[q] = -1; topLen[q] = 0; } };
    var chainOf = function (sym) {   // the chain of `sym`: top code and length, starting from the plain value itself
      if (top[sym] < 0) { top[sym] = sym; topLen[sym] = 1; if (!rc[sym]) rc[sym] = new Uint16Array(4097); rc[sym][1] = sym; }
    };
    hk.fill(0); emit(clearCode);
    if (len) {
      var prefix = indices[0];
      for (i = 1; i < len; i++) {
        var k = indices[i];
        if (!plain && prefix === k && k < clearCode) {   // the lookahead symbol starts a run of k
          var j = i + 1; while (j < len && indices[j] === k) j++;
          var T = j - i + 1;   // the run, counting the lookahead symbol
          c = k; chainOf(c);
          var m = topLen[c];
          while (T > m) {
            emit(rc[c][m]);
            T -= m;
            if (next === 4096) { emit(clearCode); next = eoi + 1; size = minCode + 1; hk.fill(0); resetChains(); chainOf(c); m = 1; }
            else {
              if (next >= (1 << size)) size++;
              var rkey = ((rc[c][m] << 8) | c) + 1, rh = Math.imul(rkey, 0x9e3779b1) >>> 18;
              while (hk[rh] !== 0) rh = (rh + 1) & 16383;
              hk[rh] = rkey; hv[rh] = next; m++; rc[c][m] = next; top[c] = next; topLen[c] = m; next++;
            }
          }
          prefix = rc[c][T];   // what is left of the run is already in the table
          i = j - 1;
          continue;
        }
        var key = ((prefix << 8) | k) + 1, h = Math.imul(key, 0x9e3779b1) >>> 18, e = hk[h];
        while (e !== 0 && e !== key) { h = (h + 1) & 16383; e = hk[h]; }
        if (e === key) { prefix = hv[h]; continue; }
        cur |= prefix << shift; shift += size; while (shift >= 8) { out[o++] = cur & 255; cur >>>= 8; shift -= 8; }
        if (next === 4096) { emit(clearCode); next = eoi + 1; size = minCode + 1; hk.fill(0); if (!plain) resetChains(); }
        else {
          if (next >= (1 << size)) size++;
          hk[h] = key; hv[h] = next;
          if (!plain && top[k] === prefix) { var l2 = topLen[k] + 1; topLen[k] = l2; top[k] = next; rc[k][l2] = next; }   // the table now holds a longer run of k
          next++;
        }
        prefix = k;
      }
      emit(prefix);
    }
    emit(eoi);
    if (shift > 0) out[o++] = cur & 255;
    return out.subarray(0, o);
  }

  /**
   * A streaming writer: createEncoder(width, height, palette, { loop }) then add(rgba, delayMs) for each picture, then finish().
   * Pixels that did not change since the last picture are left transparent, so still parts cost almost nothing.
   */
  function createEncoder(width, height, palette, opts) {
    opts = opts || {};
    var pal = palette.slice(0, 255), TRANS = 255, frames = [], n = width * height, prevIdx = null, prevRaw = null, bufIdx = null, chg = null;
    var PR = new Int32Array(255), PG = new Int32Array(255), PB = new Int32Array(255), NP = pal.length, j;
    for (j = 0; j < NP; j++) { PR[j] = pal[j][0]; PG[j] = pal[j][1]; PB[j] = pal[j][2]; }
    var CAP = 1 << 20, ck = new Int32Array(CAP).fill(-1), cv = new Uint8Array(CAP), used = 0;
    var L1 = 1 << 14, l1k = new Int32Array(L1).fill(-1), l1v = new Uint8Array(L1);   // a small table that stays in the processor cache, in front of the big one
    var nearest = function (col) {
      var h1 = Math.imul(col, 0x9e3779b1) >>> 18;
      if (l1k[h1] === col) return l1v[h1];
      var v = nearestSlow(col); l1k[h1] = col; l1v[h1] = v; return v;
    };
    var nearestSlow = function (col) {
      var h = Math.imul(col, 0x9e3779b1) >>> 12;
      while (ck[h] !== -1) { if (ck[h] === col) return cv[h]; h = (h + 1) & (CAP - 1); }
      var r = col >> 16, g = (col >> 8) & 255, b = col & 255, best = 0, bd = 1e9;
      for (var q = 0; q < NP; q++) { var dr = PR[q] - r, dg = PG[q] - g, db = PB[q] - b, dd = dr * dr * 2 + dg * dg * 4 + db * db * 3; if (dd < bd) { bd = dd; best = q; if (!dd) break; } }
      if (used > CAP * 0.6) { ck.fill(-1); used = 0; h = Math.imul(col, 0x9e3779b1) >>> 12; while (ck[h] !== -1) h = (h + 1) & (CAP - 1); }
      ck[h] = col; cv[h] = best; used++;
      return best;
    };
    return {
      add: function (rgba, delayMs) {
        var w = words(rgba), idx, i, x, y, nchg = 0;
        var minx = width, miny = height, maxx = -1, maxy = -1, last = -1, lastIdx = 0;
        if (!prevRaw) {
          idx = new Uint8Array(n); prevRaw = new Uint32Array(n); bufIdx = new Uint8Array(n); chg = new Int32Array(n);
          for (i = 0; i < n; i++) { var px0 = w[i]; if (px0 === last) { idx[i] = lastIdx; continue; } last = px0; lastIdx = nearest(rgbOf(px0)); idx[i] = lastIdx; }
        } else {
          idx = bufIdx; idx.set(prevIdx);                                       // start from the last picture; only changed elements are rewritten
          var pr = prevRaw;
          for (y = 0, i = 0; y < height; y++) {
            var rowEnd = i + width, rowHit = false;
            for (x = i; x < rowEnd; x++) {
              var px = w[x];
              if (px === pr[x]) continue;
              if (px === last) idx[x] = lastIdx; else { last = px; lastIdx = nearest(rgbOf(px)); idx[x] = lastIdx; }
              if (idx[x] !== prevIdx[x]) { rowHit = true; chg[nchg++] = x; if (x - i < minx) minx = x - i; if (x - i > maxx) maxx = x - i; }
            }
            if (rowHit) { if (y < miny) miny = y; maxy = y; }
            i = rowEnd;
          }
          prevRaw.set(w);
          if (maxx < 0) { frames[frames.length - 1].delay += delayMs; return; }
        }
        var x0 = 0, y0 = 0, fw = width, fh = height, data = idx;
        if (prevIdx) {
          x0 = minx; y0 = miny; fw = maxx - minx + 1; fh = maxy - miny + 1; data = new Uint8Array(fw * fh).fill(TRANS);   // everything unchanged, then only the changed items are written
          for (i = 0; i < nchg; i++) { var at = chg[i], yy = (at / width) | 0; data[(yy - y0) * fw + (at - yy * width - x0)] = idx[at]; }
          bufIdx = prevIdx;                                                     // recycle the older index picture
        } else prevRaw.set(w);
        prevIdx = idx;
        frames.push({ x: x0, y: y0, w: fw, h: fh, delay: delayMs, trans: frames.length > 0, code: lzw(data, 8) });
      },
      finish: function () {
        var size = 800 + frames.length * 32, f, i;
        for (f = 0; f < frames.length; f++) size += frames[f].code.length + Math.ceil(frames[f].code.length / 255) + 40;
        var out = new Uint8Array(size), o = 0;
        var le = function (v) { out[o++] = v & 255; out[o++] = (v >> 8) & 255; };
        for (i = 0; i < 6; i++) out[o++] = 'GIF89a'.charCodeAt(i);
        le(width); le(height); out[o++] = 0xF7; out[o++] = 0; out[o++] = 0;
        for (i = 0; i < 256; i++) { var c = pal[i] || [0, 0, 0]; out[o++] = c[0]; out[o++] = c[1]; out[o++] = c[2]; }
        if (opts.loop !== false) { out[o++] = 0x21; out[o++] = 0xFF; out[o++] = 11; for (i = 0; i < 11; i++) out[o++] = 'NETSCAPE2.0'.charCodeAt(i); out[o++] = 3; out[o++] = 1; out[o++] = 0; out[o++] = 0; out[o++] = 0; }
        frames.forEach(function (fr) {
          out[o++] = 0x21; out[o++] = 0xF9; out[o++] = 4; out[o++] = (1 << 2) | (fr.trans ? 1 : 0); le(Math.max(2, Math.round(fr.delay / 10))); out[o++] = TRANS; out[o++] = 0;
          out[o++] = 0x2C; le(fr.x); le(fr.y); le(fr.w); le(fr.h); out[o++] = 0;
          out[o++] = 8;
          for (var p = 0; p < fr.code.length; p += 255) { var len = Math.min(255, fr.code.length - p); out[o++] = len; out.set(fr.code.subarray(p, p + len), o); o += len; }
          out[o++] = 0;
        });
        out[o++] = 0x3B;
        return out.slice(0, o);
      },
      count: function () { return frames.length; }
    };
  }
  return { makePalette: makePalette, createEncoder: createEncoder, lzw: lzw };
}));
