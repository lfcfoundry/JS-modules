/*!
 * gif-writer.js: write animated GIFs from canvas pictures, in the browser or in Node. No dependencies.
 * One palette for the whole animation (median cut then k-means over the exact colors of several pictures), pixels that did not change
 * are left transparent, and every picture is compressed the moment it is added.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.1.0 (API 1)
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
    var HB = 16, HS = 1 << HB, mask = 0xffffff, attempt, uniq = 0, p, i;
    var total = 0; for (p = 0; p < pictures.length; p++) total += pictures[p].length >> 2;
    var stride = total > 1000000 ? 2 : 1;   // big pictures: look at every other pixel (the colors that matter come in runs and areas, so the palette barely changes; the histogram is the largest steady cost)
    var tbl;   // one table of pairs: [color + 1, count] (0 = empty slot), so a lookup touches one cache line
    for (attempt = 0; attempt < 6; attempt++) {
      tbl = new Int32Array(HS * 2); uniq = 0;
      var cap = HS * 0.4;
      for (p = 0; p < pictures.length && uniq <= cap; p++) {
        var w = words(pictures[p]), n = w.length, last = -2, lastSlot = 0;
        for (i = 0; i < n; i += stride) {
          var col = rgbOf(w[i]) & mask;
          if (col === last) { tbl[lastSlot]++; continue; }
          var h = Math.imul(col, 0x9e3779b1) >>> (32 - HB), c1 = col + 1, e = tbl[h * 2];
          while (e !== 0 && e !== c1) { h = (h + 1) & (HS - 1); e = tbl[h * 2]; }
          if (e === 0) { tbl[h * 2] = c1; uniq++; if (uniq > cap) break; }
          lastSlot = h * 2 + 1; tbl[lastSlot]++; last = col;
        }
      }
      if (uniq <= cap) break;
      // too many distinct colors for the table: first a bigger table (flat pictures need a tiny one, which stays in the cache), then (a photograph) drop the lowest bits of every channel and count again
      if (attempt === 0) { HB = 20; HS = 1 << HB; } else if (attempt === 1) { HB = 22; HS = 1 << HB; } else mask = attempt === 2 ? 0xfefefe : attempt === 3 ? 0xfcfcfc : 0xf8f8f8;
    }
    var R = new Uint8Array(uniq), G = new Uint8Array(uniq), B = new Uint8Array(uniq), C = new Float64Array(uniq), u = 0;
    for (i = 0; i < HS; i++) if (tbl[i * 2] !== 0) { var kc = tbl[i * 2] - 1; R[u] = kc >> 16; G[u] = (kc >> 8) & 255; B[u] = kc & 255; C[u] = tbl[i * 2 + 1]; u++; }
    tbl = null;
    if (uniq <= maxColors) { var exact = []; for (i = 0; i < uniq; i++) exact.push([R[i], G[i], B[i]]); return exact; }

    /* median cut: boxes are ranges of `order`; the box with the widest spread (times the square root of its pixels) is cut where half its pixels lie.
       The cut is found without sorting: count the pixels of the box per channel value, find the value where the running total reaches half, and
       break ties inside that value by color number, which is exactly where a sort on (value, color number) would put the cut. */
    var order = new Int32Array(uniq), scratch = new Int32Array(uniq), wsum = new Float64Array(256), num = new Int32Array(256);
    for (i = 0; i < uniq; i++) order[i] = i;
    var chans = [R, G, B], boxes = [];
    var mkBox = function (lo, hi, r0, r1, g0, g1, b0, b1, tot) {
      var dr = r1 - r0, dg = g1 - g0, db = b1 - b0, mx = Math.max(dr, dg, db);
      return { lo: lo, hi: hi, ch: dr >= dg && dr >= db ? 0 : dg >= db ? 1 : 2, score: hi - lo < 2 ? 0 : mx * Math.sqrt(tot), tot: tot };
    };
    var r0 = 255, r1 = 0, g0 = 255, g1 = 0, b0 = 255, b1 = 0, tot0 = 0;
    for (i = 0; i < uniq; i++) { var rr = R[i], gg = G[i], bb = B[i]; if (rr < r0) r0 = rr; if (rr > r1) r1 = rr; if (gg < g0) g0 = gg; if (gg > g1) g1 = gg; if (bb < b0) b0 = bb; if (bb > b1) b1 = bb; tot0 += C[i]; }
    boxes.push(mkBox(0, uniq, r0, r1, g0, g1, b0, b1, tot0));
    while (boxes.length < maxColors) {
      var bi = -1, bs = 0, q;
      for (q = 0; q < boxes.length; q++) if (boxes[q].score > bs) { bs = boxes[q].score; bi = q; }
      if (bi < 0) break;
      var bx = boxes[bi], ch = chans[bx.ch], size = bx.hi - bx.lo, v, o2, half = bx.tot / 2, run = 0, below = 0;
      wsum.fill(0); num.fill(0);
      for (q = bx.lo; q < bx.hi; q++) { o2 = order[q]; v = ch[o2]; wsum[v] += C[o2]; num[v]++; }
      for (v = 0; v < 256; v++) { if (num[v] && run + wsum[v] >= half) break; run += wsum[v]; below += num[v]; }
      var m = num[v], g = scratch.subarray(0, m), gn = 0, pl;
      for (q = bx.lo; q < bx.hi; q++) { o2 = order[q]; if (ch[o2] === v) g[gn++] = o2; }
      g.sort();
      for (pl = 0; pl < m; pl++) { run += C[g[pl]]; if (run >= half) break; }
      if (below + pl + 1 > size - 1) pl--;   // a box is never cut at its end: the last color always goes to the upper half
      var T = pl >= 0 ? g[pl] : -1, a = bx.lo, b2 = 0, cut = bx.lo + below + pl + 1, tmp = scratch;
      /* split the box into two halves, and measure both halves on the way (their color ranges and pixel totals) */
      var lr0 = 255, lr1 = 0, lg0 = 255, lg1 = 0, lb0 = 255, lb1 = 0, lt = 0, ur0 = 255, ur1 = 0, ug0 = 255, ug1 = 0, ub0 = 255, ub1 = 0, ut = 0;
      for (q = bx.lo; q < bx.hi; q++) {
        o2 = order[q]; var v2 = ch[o2], cr3 = R[o2], cg3 = G[o2], cb3 = B[o2];
        if (v2 < v || (v2 === v && o2 <= T)) {
          order[a++] = o2; lt += C[o2];
          if (cr3 < lr0) lr0 = cr3; if (cr3 > lr1) lr1 = cr3; if (cg3 < lg0) lg0 = cg3; if (cg3 > lg1) lg1 = cg3; if (cb3 < lb0) lb0 = cb3; if (cb3 > lb1) lb1 = cb3;
        } else {
          tmp[b2++] = o2; ut += C[o2];
          if (cr3 < ur0) ur0 = cr3; if (cr3 > ur1) ur1 = cr3; if (cg3 < ug0) ug0 = cg3; if (cg3 > ug1) ug1 = cg3; if (cb3 < ub0) ub0 = cb3; if (cb3 > ub1) ub1 = cb3;
        }
      }
      for (q = 0; q < b2; q++) order[a + q] = tmp[q];
      boxes.splice(bi, 1, mkBox(bx.lo, cut, lr0, lr1, lg0, lg1, lb0, lb1, lt), mkBox(cut, bx.hi, ur0, ur1, ug0, ug1, ub0, ub1, ut));
    }
    var K = boxes.length, cr = new Float64Array(K), cg = new Float64Array(K), cb = new Float64Array(K);
    boxes.forEach(function (bx2, k) {
      var r = 0, g = 0, b = 0, t = 0;
      for (var q2 = bx2.lo; q2 < bx2.hi; q2++) { var o = order[q2], c = C[o]; r += R[o] * c; g += G[o] * c; b += B[o] * c; t += c; }
      cr[k] = r / t; cg[k] = g / t; cb[k] = b / t;
    });
    /* a few rounds of k-means (each color to its nearest center, centers to the pixel-weighted mean); the same eye-weighted distance as the encoder uses.
       The centers are kept in a list sorted by green and each color looks outward from its own green value, stopping as soon as the green part alone
       (4 * difference squared, which is part of the sum) is already larger than the best distance found: the same winner as looking at every center,
       and when two centers are equally near, the one with the lower number wins. */
    var rounds = uniq * K <= 6e7 ? 2 : uniq * K <= 3e8 ? 1 : 0, byG = new Int32Array(K), gv = new Float64Array(K), rv = new Float64Array(K), bv = new Float64Array(K);
    for (var it = 0; it < rounds; it++) {
      var sr = new Float64Array(K), sg = new Float64Array(K), sb = new Float64Array(K), st = new Float64Array(K), k2;
      for (k2 = 0; k2 < K; k2++) byG[k2] = k2;
      byG.sort(function (x, y) { return cg[x] - cg[y] || x - y; });
      for (k2 = 0; k2 < K; k2++) { gv[k2] = cg[byG[k2]]; rv[k2] = cr[byG[k2]]; bv[k2] = cb[byG[k2]]; }
      for (i = 0; i < uniq; i++) {
        var r2 = R[i], g2 = G[i], b2 = B[i], best = 0, bd = 1e18, dr2, dg2, db2, dd, kk, gap;
        var lo2 = 0, hi2 = K;   // find the first sorted center whose green is not below g2
        while (lo2 < hi2) { var mid = (lo2 + hi2) >> 1; if (gv[mid] < g2) lo2 = mid + 1; else hi2 = mid; }
        var down = lo2 - 1, up = lo2;
        while (down >= 0 || up < K) {
          if (down < 0 || (up < K && gv[up] - g2 <= g2 - gv[down])) {
            dg2 = gv[up] - g2; gap = dg2 * dg2 * 4;
            if (gap > bd) { up = K; continue; }   // every center further out on this side is further still
            dr2 = rv[up] - r2; db2 = bv[up] - b2; kk = up++;
          } else {
            dg2 = gv[down] - g2; gap = dg2 * dg2 * 4;
            if (gap > bd) { down = -1; continue; }
            dr2 = rv[down] - r2; db2 = bv[down] - b2; kk = down--;
          }
          dd = dr2 * dr2 * 2 + gap + db2 * db2 * 3;
          if (dd < bd || (dd === bd && byG[kk] < best)) { bd = dd; best = byG[kk]; }
        }
        var c2 = C[i]; sr[best] += r2 * c2; sg[best] += g2 * c2; sb[best] += b2 * c2; st[best] += c2;
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
    var SI = new Int32Array(NP), SR = new Int32Array(NP), SG = new Int32Array(NP), SB = new Int32Array(NP);   // the palette sorted by green (equal greens by number)
    for (j = 0; j < NP; j++) SI[j] = j;
    SI.sort(function (x, y) { return PG[x] - PG[y] || x - y; });
    for (j = 0; j < NP; j++) { SR[j] = PR[SI[j]]; SG[j] = PG[SI[j]]; SB[j] = PB[SI[j]]; }
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
      var r = col >> 16, g = (col >> 8) & 255, b = col & 255, best = 0, bd = 1e9, lo = 0, hi = NP, dg, gap, dd, at;
      /* the palette is kept sorted by green; look outward from this color's green and stop on a side as soon as the green part alone (4 * difference
         squared, part of the sum) beats the best so far: the same answer as looking at every entry, and for equal distances the lower number wins */
      while (lo < hi) { var mid = (lo + hi) >> 1; if (SG[mid] < g) lo = mid + 1; else hi = mid; }
      var down = lo - 1, up = lo;
      while (down >= 0 || up < NP) {
        if (down < 0 || (up < NP && SG[up] - g <= g - SG[down])) {
          dg = SG[up] - g; gap = dg * dg * 4;
          if (gap > bd) { up = NP; continue; }
          at = up++;
        } else {
          dg = SG[down] - g; gap = dg * dg * 4;
          if (gap > bd) { down = -1; continue; }
          at = down--;
        }
        var dr = SR[at] - r, db = SB[at] - b;
        dd = dr * dr * 2 + gap + db * db * 3;
        if (dd < bd || (dd === bd && SI[at] < best)) { bd = dd; best = SI[at]; }
      }
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
