// Copyright (c) 2026 LFC Foundry. MIT License. Part of memory-compression.js; build.py joins the pieces in src/ (this line is left out of the built file).
  // ================================================================ the number picker
  // Every block of 8,192 numbers picks its own way: whole numbers (one repeated value, offset + bit packing, differences, runs, a small dictionary, a few big outliers kept aside,
  // a common factor, or a byte-coded bucket table), decimals (ALP: 12.34 as the whole number 1234; float noise such as 1.8630000000000002 is kept as a tiny distance from the decimal
  // guess), and other doubles (their front bits, a dictionary of doubles, or byte planes: each of the 8 bytes of every double coded on its own). Anything that fits none is stored
  // as plain doubles, so every input comes back bit for bit (NaN, infinities, -0 and 5e-324 included). Plain JavaScript; used for number columns in the balanced and small modes.
  var PK = (function () {
    var LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;        // the bit tricks below assume the usual little-endian memory layout
    function pfail(m) { throw new Error('MemoryCompressionJSO: ' + m); }

    // ---------------------------------------------------------------- bytes in and out
    var NOBYTES = new Uint8Array(0);
    function Wr() { this.b = NOBYTES; this.n = 0; this.dv = null; }              // nothing is allocated until the first byte is written
    Wr.prototype.need = function (k) {
      var nb;
      if (this.n + k > this.b.length) { nb = new Uint8Array(Math.max(this.b.length * 2, this.n + k, 64)); nb.set(this.b.subarray(0, this.n)); this.b = nb; this.dv = null; }
    };
    Wr.prototype.u8 = function (v) { this.need(1); this.b[this.n++] = v; };
    Wr.prototype.vi = function (x) { this.need(10); while (x >= 128) { this.b[this.n++] = (x % 128) | 128; x = Math.floor(x / 128); } this.b[this.n++] = x; };
    Wr.prototype.zi = function (x) { this.vi(x < 0 ? -2 * x - 1 : 2 * x); };
    Wr.prototype.bytes = function (u8) { this.need(u8.length); this.b.set(u8, this.n); this.n += u8.length; };
    Wr.prototype.f64 = function (v) {
      this.need(8); if (!this.dv) this.dv = new DataView(this.b.buffer);
      this.dv.setFloat64(this.n, v, true); this.n += 8;
    };
    Wr.prototype.out = function () { return this.b.subarray(0, this.n); };
    function Rd(u8) { this.b = u8; this.p = 0; this.dv = new DataView(u8.buffer, u8.byteOffset, u8.length); }
    Rd.prototype.u8 = function () { if (this.p >= this.b.length) pfail('the data is cut off'); return this.b[this.p++]; };
    Rd.prototype.vi = function () {
      var x = 0, m = 1, c, k = 0;
      do { if (this.p >= this.b.length || k++ >= 8) pfail('the data is cut off or damaged'); c = this.b[this.p++]; x += (c & 127) * m; m *= 128; } while (c & 128);
      return x;
    };
    Rd.prototype.zi = function () { var z = this.vi(); return z % 2 ? -(z + 1) / 2 : z / 2; };
    Rd.prototype.f64 = function () { if (this.p + 8 > this.b.length) pfail('the data is cut off'); var v = this.dv.getFloat64(this.p, true); this.p += 8; return v; };
    Rd.prototype.bytes = function (k) {
      if (!(k >= 0) || this.p + k > this.b.length) pfail('the data is cut off or damaged');
      var o = this.b.subarray(this.p, this.p + k); this.p += k; return o;
    };

    // ---------------------------------------------------------------- bit packing (values below 2^32)
    var KWC = null;                                                               // the wasm helper while pack() or unpack() runs with it allowed (a block of 1,024 numbers or more uses it)
    function kal(x) { return (x + 15) & ~15; }
    function bwOf(maxv) { return maxv <= 0 ? 0 : 32 - Math.clz32(maxv >>> 0) + (maxv > 4294967295 ? 99 : 0); }
    function bpWrite(w, a, n, bw) {
      var words, o, pos = 0, i, v, idx, off;
      if (!bw) return;
      words = Math.ceil(n * bw / 32) + 1; o = new Uint32Array(words);
      for (i = 0; i < n; i++) {
        v = a[i] >>> 0; idx = pos >>> 5; off = pos & 31;
        o[idx] |= v << off; if (off + bw > 32) o[idx + 1] |= v >>> (32 - off);
        pos += bw;
      }
      w.bytes(new Uint8Array(o.buffer, 0, Math.ceil(n * bw / 8)));
    }
    function bpWriteF(w, a, base, n, bw) {       // a: Float64Array of whole numbers; writes a[i] - base in bw bits each (the wasm helper when it is on)
      var kw = KWC, aP, oP, bytes;
      if (kw && n >= 1024 && bw > 0 && bw <= 32) {
        aP = kw.base; oP = kal(aP + n * 8); bytes = Math.ceil(n * bw / 8);
        if (kwRoom(oP + (Math.ceil(n * bw / 32) + 1) * 4 - kw.base + 64)) {
          new Float64Array(kw.mem.buffer, aP, n).set(a);
          kw.x.bp_pack(aP, n, base, bw, oP);
          w.bytes(new Uint8Array(kw.mem.buffer, oP, bytes)); return;
        }
      }
      var res = new Uint32Array(n), i; for (i = 0; i < n; i++) res[i] = a[i] - base;
      bpWrite(w, res, n, bw);
    }
    function bpReadF(r, n, bw, base) {            // n values of bw bits, each plus base, as doubles
      var kw = KWC, out, res, i, bytes, sP, oP, src;
      if (bw > 32) pfail('bad bit width');
      if (!bw) { out = new Float64Array(n); if (base) out.fill(base); return out; }
      if (kw && n >= 1024) {
        bytes = Math.ceil(n * bw / 8); sP = kw.base; oP = kal(sP + bytes + 16);
        if (kwRoom(oP + n * 8 - kw.base + 64)) {
          src = r.bytes(bytes);
          new Uint8Array(kw.mem.buffer, sP, bytes + 8).fill(0, bytes).set(src);
          kw.x.bp_unpack(sP, n, bw, base, oP);
          out = new Float64Array(n); out.set(new Float64Array(kw.mem.buffer, oP, n)); return out;
        }
      }
      res = bpRead(r, n, bw); out = new Float64Array(n); for (i = 0; i < n; i++) out[i] = res[i] + base; return out;
    }
    function bpRead(r, n, bw) {
      var out = new Uint32Array(n), bytes, src, tmp, mask, pos = 0, i, idx, off, v;
      if (!bw) return out;
      if (bw > 32) pfail('bad bit width');
      bytes = Math.ceil(n * bw / 8); src = r.bytes(bytes); tmp = new Uint32Array(Math.ceil(bytes / 4) + 1);
      new Uint8Array(tmp.buffer).set(src); mask = bw === 32 ? 0xFFFFFFFF : (1 << bw) - 1;
      for (i = 0; i < n; i++) {
        idx = pos >>> 5; off = pos & 31; v = tmp[idx] >>> off;
        if (off + bw > 32) v |= tmp[idx + 1] << (32 - off);
        out[i] = (v & mask) >>> 0; pos += bw;
      }
      return out;
    }

    // ---------------------------------------------------------------- rANS entropy coding of bytes (static table, 12-bit frequencies)
    var SB = 12, M = 1 << SB, RL = 1 << 23;
    function ransEncode(syms, freq, cum) {                     // the bytes (a view; use them before the next call); wasm helper for 1,024 symbols and up
      var kw = KWC, n = syms.length, sP, fP, oP, cap, len;
      if (kw && n >= 1024) {
        cap = n * 2 + 64; sP = kw.base; fP = kal(sP + n); oP = kal(fP + 512);
        if (kwRoom(oP + cap + 16 - kw.base + 64)) {
          new Uint8Array(kw.mem.buffer, sP, n).set(syms); new Uint16Array(kw.mem.buffer, fP, 256).set(freq);
          len = kw.x.rans_enc(sP, n, fP, oP, cap);
          return new Uint8Array(kw.mem.buffer, oP + cap - len, len);
        }
      }
      return ransEncodeJS(syms, freq, cum);
    }
    function ransEncodeJS(syms, freq, cum) {
      var out = new Uint8Array(syms.length * 2 + 64), p = out.length, x = RL, i, s, f, xm, q, k, xmax = new Float64Array(256), inv = new Float64Array(256);
      for (s = 0; s < 256; s++) if (freq[s]) { xmax[s] = ((RL >>> SB) << 8) * freq[s]; inv[s] = 1 / freq[s]; }
      for (i = syms.length - 1; i >= 0; i--) {
        s = syms[i]; f = freq[s]; xm = xmax[s];
        while (x >= xm) { out[--p] = x & 255; x = x >>> 8; }
        q = (x * inv[s]) | 0; k = x - q * f;                                   // x / f by multiplying with 1 / f, then corrected by one step
        if (k >= f) { q++; k -= f; } else if (k < 0) { q--; k += f; }
        x = (q << SB) + k + cum[s];
      }
      for (k = 3; k >= 0; k--) out[--p] = (x >>> (8 * k)) & 255;
      return out.subarray(p);
    }
    function ransDecode(bytes, n, freq, cum, slot) {
      var kw = KWC, len = bytes.length, sP, fP, oP, out;
      if (kw && n >= 1024 && len >= 4 && len <= n * 2 + 64) {
        sP = kw.base; fP = kal(sP + len + 16); oP = kal(fP + 512);
        if (kwRoom(oP + n + 16 - kw.base + 64)) {
          new Uint8Array(kw.mem.buffer, sP, len).set(bytes); new Uint16Array(kw.mem.buffer, fP, 256).set(freq);
          if (kw.x.rans_dec(sP, len, n, fP, oP, 0) < 0) pfail('bad entropy data');
          out = new Uint8Array(n); out.set(new Uint8Array(kw.mem.buffer, oP, n)); return out;
        }
      }
      return ransDecodeJS(bytes, n, freq, cum, slot);
    }
    function ransDecodeJS(bytes, n, freq, cum, slot) {
      var out = new Uint8Array(n), len = bytes.length, p = 4, x, i, m, s;
      if (len < 4) pfail('bad entropy data');
      x = (bytes[0] | bytes[1] << 8 | bytes[2] << 16 | bytes[3] << 24) >>> 0;
      for (i = 0; i < n; i++) {
        m = x & (M - 1); s = slot[m]; out[i] = s; x = freq[s] * (x >>> SB) + m - cum[s];
        while (x < RL) { if (p >= len) pfail('bad entropy data'); x = ((x << 8) | bytes[p++]) >>> 0; }
      }
      return out;
    }
    function normFreq(cnt, n) {
      var f = new Uint16Array(256), tot = 0, big = 0, i;
      for (i = 0; i < 256; i++) if (cnt[i]) { f[i] = Math.max(1, Math.floor(cnt[i] * M / n)); tot += f[i]; if (cnt[i] > cnt[big]) big = i; }
      f[big] += M - tot;
      if (f[big] < 1) pfail('bad frequencies');
      return f;
    }
    function writeTable(w, freq) {
      var bm = new Uint8Array(32), i;
      for (i = 0; i < 256; i++) if (freq[i]) bm[i >> 3] |= 1 << (i & 7);
      w.bytes(bm); for (i = 0; i < 256; i++) if (freq[i]) w.vi(freq[i] - 1);
    }
    function readTable(r) {              // the frequency table, checked: it must add up to exactly 4096
      var bm = r.bytes(32), freq = new Uint16Array(256), cum = new Uint16Array(257), slot = new Uint8Array(M), i, tot = 0, v;
      for (i = 0; i < 256; i++) if ((bm[i >> 3] >> (i & 7)) & 1) { v = r.vi() + 1; tot += v; if (tot > M) pfail('bad frequencies'); freq[i] = v; }
      if (tot !== M) pfail('bad frequencies');
      for (i = 0; i < 256; i++) { cum[i + 1] = cum[i] + freq[i]; slot.fill(i, cum[i], cum[i + 1]); }
      return { freq: freq, cum: cum, slot: slot };
    }

    // ---------------------------------------------------------------- whole numbers (a Float64Array of whole numbers, each below 2^52 in size)
    var IS = { RAW: 0, CONST: 1, FOR: 2, DELTA: 3, RLE: 4, DICT: 5, PFOR: 6, DIV: 7, ENT: 8 }, MAX_DEPTH = 4;
    var STAT = null;                                                              // the smallest, the largest and "all whole numbers" of the block isIntegral just looked at (same array object)
    function statsOf(kw, a) {                                                     // one pass in the wasm helper for a block of 1,024 numbers or more; null when it cannot
      var n = a.length, aP = kw.base, mP = kal(aP + n * 8), ok, mm;
      if (!kwRoom(mP + 16 - kw.base + 64)) return null;
      new Float64Array(kw.mem.buffer, aP, n).set(a); ok = kw.x.block_stats(aP, n, mP); mm = new Float64Array(kw.mem.buffer, mP, 2);
      return (STAT = { a: a, mn: mm[0], mx: mm[1], ok: ok === 1 });
    }
    function range(a) { var mn = Infinity, mx = -Infinity, i, v; if (STAT && STAT.a === a) return [STAT.mn, STAT.mx]; for (i = 0; i < a.length; i++) { v = a[i]; if (v < mn) mn = v; if (v > mx) mx = v; } return [mn, mx]; }
    function distinctFew(a, k) {      // true when the first 256 values hold more than k different ones
      var m = new Set(), i, n = Math.min(a.length, 256);
      for (i = 0; i < n; i++) { m.add(a[i]); if (m.size > k) return true; }
      return false;
    }
    function gapsOf(pos) { var g = new Float64Array(pos.length), prev = -1, k; for (k = 0; k < pos.length; k++) { g[k] = pos[k] - prev - 1; prev = pos[k]; } return g; }
    function deltaOf(a, n, d) {        // d[i - 1] = zigzag(a[i] - a[i - 1]); returns the largest
      var kw = KWC, aP, dP, i, x, y = 0;
      if (kw && n >= 1024) {
        aP = kw.base; dP = kal(aP + n * 8);
        if (kwRoom(dP + n * 8 - kw.base + 64)) {
          new Float64Array(kw.mem.buffer, aP, n).set(a); y = kw.x.delta_enc(aP, n, dP);
          d.set(new Float64Array(kw.mem.buffer, dP, n - 1)); return y;
        }
      }
      for (i = 1; i < n; i++) { x = a[i] - a[i - 1]; x = x < 0 ? -2 * x - 1 : 2 * x; d[i - 1] = x; if (x > y) y = x; }
      return y;
    }
    function undeltaOf(d, n, c0) {    // out[0] = c0; out[i] = out[i - 1] + unzigzag(d[i - 1])
      var kw = KWC, dP, oP, out = new Float64Array(n), i, c = c0, z;
      if (kw && n >= 1024) {
        dP = kw.base; oP = kal(dP + n * 8);
        if (kwRoom(oP + n * 8 - kw.base + 64)) {
          new Float64Array(kw.mem.buffer, dP, n - 1).set(d); kw.x.delta_dec(dP, n - 1, c0, oP);
          out.set(new Float64Array(kw.mem.buffer, oP, n)); return out;
        }
      }
      out[0] = c0;
      for (i = 1; i < n; i++) { z = d[i - 1]; c += z % 2 ? -(z + 1) / 2 : z / 2; out[i] = c; }
      return out;
    }
    function encIntWith(sch, a, depth, opt, mm, bound) {      // bytes, or null when this way does not apply (mm: the smallest and largest value, when the caller already has them)
      var n = a.length, w = new Wr(), mn, mx, rng, bw, res, i, mm, d, g, x, y, t, vals, runs, j, m, keys, codes, q, lim, pos, hi, low, sh, div, syms, cnt, freq, cum, rb, hist, seen;
      w.u8(sch);
      if (sch === IS.RAW) { w.need(n * 8 + 1); for (i = 0; i < n; i++) w.f64(a[i]); return w.out(); }
      if (!mm) mm = range(a);
      mn = mm[0]; mx = mm[1];
      if (sch === IS.CONST) { if (mn !== mx) return null; w.zi(mn); return w.out(); }
      if (sch === IS.FOR) {
        rng = mx - mn; if (rng > 4294967295) return null;
        bw = bwOf(rng);
        w.zi(mn); w.u8(bw); bpWriteF(w, a, mn, n, bw); return w.out();
      }
      if (sch === IS.ENT) {
        rng = mx - mn; if (rng >= 549755813888 || n < 64) return null;
        bw = rng < 1 ? 0 : Math.floor(Math.log2(rng)) + 1; sh = Math.max(0, bw - 8); div = Math.pow(2, sh);
        if (bound && n * sh / 8 > bound) return null;                      // the low bits alone are already bigger than the best so far: it cannot win
        syms = new Uint8Array(n); low = new Uint32Array(n); cnt = new Uint32Array(256);
        for (i = 0; i < n; i++) { x = a[i] - mn; y = Math.floor(x / div); syms[i] = y; low[i] = x - y * div; cnt[y]++; }
        if (bound) {                                                         // a quick estimate first: if the entropy coder cannot get under the best size so far, it is not run
          x = 0; y = 0; for (i = 0; i < 256; i++) if (cnt[i]) { y++; x -= cnt[i] * Math.log2(cnt[i] / n); }
          if (x / 8 + y * 0.5 + n * sh / 8 > bound) return null;
        }
        freq = normFreq(cnt, n); cum = new Uint16Array(257); for (i = 0; i < 256; i++) cum[i + 1] = cum[i] + freq[i];
        w.zi(mn); w.u8(sh); writeTable(w, freq);
        rb = ransEncode(syms, freq, cum); w.vi(rb.length); w.bytes(rb); bpWrite(w, low, n, sh); return w.out();
      }
      if (depth <= 0) return null;
      if (sch === IS.DELTA) {
        if (n < 4) return null;
        d = new Float64Array(n - 1); y = deltaOf(a, n, d);
        if (depth < 2 && bwOf(y) > bwOf(mx - mn) && distinctFew(d, 64)) return null;       // wider than the values themselves and never repeating: differences cannot help
        w.zi(a[0]); w.bytes(encInts(d, depth - 1, opt)); return w.out();
      }
      if (sch === IS.DIV) {
        g = 0;
        for (i = 1; i < n && g !== 1; i++) { x = Math.abs(a[i] - a[0]); y = g; while (y) { t = x % y; x = y; y = t; } g = x; }
        if (g < 2) return null;
        d = new Float64Array(n); for (i = 0; i < n; i++) d[i] = (a[i] - a[0]) / g;
        w.zi(a[0]); w.vi(g); w.bytes(encInts(d, depth - 1, opt)); return w.out();
      }
      if (sch === IS.RLE) {
        for (i = 1, j = 1; i < n; i++) if (a[i] !== a[i - 1] && ++j * 2 > n) return null;   // count the runs first: too many runs and this way cannot apply
        if (n && j * 2 > n) return null;
        vals = []; runs = []; i = 0;
        while (i < n) { j = i + 1; while (j < n && a[j] === a[i]) j++; vals.push(a[i]); runs.push(j - i - 1); i = j; if (vals.length * 2 > n) return null; }
        w.vi(vals.length); w.bytes(encInts(Float64Array.from(vals), depth - 1, opt)); w.bytes(encInts(Float64Array.from(runs), depth - 1, opt)); return w.out();
      }
      if (sch === IS.DICT) {
        lim = Math.min(n / 2, 65536);
        if (mx - mn < Math.max(65536, n * 16)) {                                                      // values in a narrow range: a table indexed by value is much faster than a Map
          seen = new Int32Array(mx - mn + 1); m = 0;
          for (i = 0; i < n; i++) { x = a[i] - mn; if (!seen[x]) { seen[x] = 1; if (++m > lim) return null; } }
          keys = new Float64Array(m); q = 0; for (i = 0; i < seen.length; i++) if (seen[i]) { keys[q] = i + mn; seen[i] = ++q; }
          codes = new Float64Array(n); for (i = 0; i < n; i++) codes[i] = seen[a[i] - mn] - 1;
          w.vi(m); w.bytes(encInts(keys, depth - 1, opt)); w.bytes(encInts(codes, depth - 1, opt)); return w.out();
        }
        m = new Map();
        for (i = 0; i < n; i++) { m.set(a[i], 0); if (m.size > lim) return null; }
        keys = Array.from(m.keys()).sort(function (p, q2) { return p - q2; }); keys.forEach(function (k, ix) { m.set(k, ix); });
        codes = new Float64Array(n); for (i = 0; i < n; i++) codes[i] = m.get(a[i]);
        w.vi(keys.length); w.bytes(encInts(Float64Array.from(keys), depth - 1, opt)); w.bytes(encInts(codes, depth - 1, opt)); return w.out();
      }
      if (sch === IS.PFOR) {
        if (n < 16) return null;
        hist = new Uint32Array(34);                                                // how many values need 0, 1, 2 ... 32 bits (33: more than 32)
        for (i = 0; i < n; i++) { x = a[i] - mn; hist[x > 4294967295 ? 33 : x <= 0 ? 0 : 32 - Math.clz32(x)]++; }
        q = Math.floor(n * 0.92) + 1; x = 0; for (bw = 0; bw < 33; bw++) { x += hist[bw]; if (x >= q) break; }   // the narrowest width that holds at least 92% of the values
        if (bound && Math.ceil(n * bw / 8) >= bound) return null;                  // the packed low parts alone are not smaller than the best so far: it cannot win
        if (bw >= 32) return null;
        x = 0; for (i = bw + 1; i < 34; i++) x += hist[i];
        if (!x) return null;                                                       // every value fits the narrow width: no outliers, so this way is plain offset packing
        lim = Math.pow(2, bw) - 1; pos = []; hi = []; low = new Uint32Array(n);
        for (i = 0; i < n; i++) {
          x = a[i] - mn;
          if (x > lim) { pos.push(i); hi.push(Math.floor(x / (lim + 1))); low[i] = x % (lim + 1); } else low[i] = x;
        }
        w.zi(mn); w.u8(bw); w.vi(pos.length); bpWrite(w, low, n, bw); w.bytes(encInts(gapsOf(pos), depth - 1, opt)); w.bytes(encInts(Float64Array.from(hi), depth - 1, opt)); return w.out();
      }
      return null;
    }
    function sampleOf(a) {                 // a quarter of the values as 4 contiguous slices spread over the array (10% as 10 slices chose badly for decimals: 12% bigger files)
      var n = a.length, k = 4, len = Math.max(64, Math.floor(n * 0.25 / k)), out, s, from;
      if (len * k >= n) return a;
      out = new Float64Array(len * k);
      for (s = 0; s < k; s++) { from = Math.floor((n - len) * s / (k - 1)); out.set(a.subarray(from, from + len), s * len); }
      return out;
    }
    var INT_ORDER = [IS.CONST, IS.FOR, IS.DELTA, IS.RLE, IS.DICT, IS.PFOR, IS.DIV, IS.ENT, IS.RAW];
    function encInts(a, depth, opt) {
      var n = a.length, order = INT_ORDER, pick = -1, s, bs = 1e18, e, best = null, i, sub, mm = range(a);
      if (opt.noEntropy) order = order.filter(function (x) { return x !== IS.ENT; });
      if (opt.prefer && depth === opt.top) {          // most blocks of a column pick the way that won the blocks before; only that way is tried (every 8th block tries all)
        for (i = 0; i < opt.prefer.length; i++) { e = tryInt(opt.prefer[i], a, depth, opt, mm, best ? best.length : 0); if (e && (!best || e.length < best.length)) best = e; }
        if (best) return best;
      }
      if (opt.sample && n > 4096) {        // choose the top way on a sample, then encode only with it
        s = sampleOf(a); sub = { noEntropy: opt.noEntropy, sample: false }; e = range(s);
        for (i = 0; i < order.length; i++) { if (order[i] === IS.RAW) continue; e = tryInt(order[i], s, depth, sub, null, bs < 1e18 ? bs : 0); if (e && e.length < bs) { bs = e.length; pick = order[i]; } }
        if (pick >= 0) { e = tryInt(pick, a, depth, opt, mm); if (e) return e; }
      }
      for (i = 0; i < order.length; i++) { if (order[i] === IS.RAW) continue; e = tryInt(order[i], a, depth, opt, mm, best ? best.length : 0); if (e && (!best || e.length < best.length)) best = e; }
      if (!best || best.length > n * 8) { e = tryInt(IS.RAW, a, depth, opt, mm); if (e && (!best || e.length < best.length)) best = e; }      // plain doubles only when nothing else is smaller
      return best;
    }
    function tryInt(sch, a, depth, opt, mm, bound) { try { return encIntWith(sch, a, depth, opt, mm, bound); } catch (e) { return null; } }
    function decInts(r, n, depth) {
      var sch = r.u8(), out = new Float64Array(n), i, mn, bw, res, d, c, z, g, b, m, vals, runs, o, k, keys, codes, ne, low, gaps, hi, lim1, p, sh, t, syms, rl, div;
      if (depth > MAX_DEPTH) pfail('data nested too deep');
      if (sch === IS.RAW) { for (i = 0; i < n; i++) out[i] = r.f64(); return out; }
      if (sch === IS.CONST) { out.fill(r.zi()); return out; }
      if (sch === IS.FOR) { mn = r.zi(); bw = r.u8(); return bpReadF(r, n, bw, mn); }
      if (sch === IS.ENT) {
        mn = r.zi(); sh = r.u8(); if (sh > 40) pfail('bad shift'); t = readTable(r); rl = r.vi();
        syms = ransDecode(r.bytes(rl), n, t.freq, t.cum, t.slot); low = bpRead(r, n, sh); div = Math.pow(2, sh);
        for (i = 0; i < n; i++) out[i] = syms[i] * div + low[i] + mn;
        return out;
      }
      if (sch === IS.DELTA) {
        if (n < 1) pfail('bad column');
        c = r.zi(); d = decInts(r, n - 1, depth + 1);
        return undeltaOf(d, n, c);
      }
      if (sch === IS.DIV) { b = r.zi(); g = r.vi(); d = decInts(r, n, depth + 1); for (i = 0; i < n; i++) out[i] = d[i] * g + b; return out; }
      if (sch === IS.RLE) {
        m = r.vi(); if (m > n) pfail('bad run count');
        vals = decInts(r, m, depth + 1); runs = decInts(r, m, depth + 1); o = 0;
        for (k = 0; k < m; k++) { c = runs[k] + 1; if (!(c >= 1) || o + c > n) pfail('bad run lengths'); out.fill(vals[k], o, o + c); o += c; }
        if (o !== n) pfail('bad run lengths');
        return out;
      }
      if (sch === IS.DICT) {
        m = r.vi(); if (m > n || m > 65536) pfail('bad dictionary');
        keys = decInts(r, m, depth + 1); codes = decInts(r, n, depth + 1);
        for (i = 0; i < n; i++) { c = codes[i]; if (!(c >= 0 && c < m)) pfail('bad dictionary code'); out[i] = keys[c]; }
        return out;
      }
      if (sch === IS.PFOR) {
        mn = r.zi(); bw = r.u8(); ne = r.vi(); if (ne > n || bw > 31) pfail('bad outliers');
        out = bpReadF(r, n, bw, mn); gaps = decInts(r, ne, depth + 1); hi = decInts(r, ne, depth + 1); lim1 = Math.pow(2, bw);
        p = -1; for (k = 0; k < ne; k++) { p += gaps[k] + 1; if (!(p >= 0 && p < n)) pfail('bad outlier position'); out[p] += hi[k] * lim1; }
        return out;
      }
      pfail('unknown way ' + sch);
    }

    // ---------------------------------------------------------------- doubles: ALP with near misses, ALP-RD, dictionary of doubles, byte planes
    var F10 = [], MAXI = 2251799813685248, f64a = new Float64Array(2), u32a = new Uint32Array(f64a.buffer), HI = LE ? 1 : 0, LO = LE ? 0 : 1, i0;
    for (i0 = 0; i0 <= 22; i0++) F10.push(Number('1e' + i0));
    function alpTry(x, e, f) { var d = Math.round(x * F10[e] / F10[f]); if (Math.abs(d) > MAXI) return null; return d * F10[f] / F10[e] === x && !(x === 0 && 1 / x < 0) ? d : null; }
    function alpParams(a) {                // look at 32 values, rank (e, f) by estimated bits
      var n = a.length, step = Math.max(1, Math.floor(n / 32)), s = [], i, e, f, ex, mn, mx, d, bits, c, bc = 1e18, best = [0, 0], k;
      for (i = 0; i < n && s.length < 32; i += step) s.push(a[i]);
      for (e = 0; e <= 18; e++) for (f = 0; f <= e; f++) {
        ex = 0; mn = Infinity; mx = -Infinity;
        for (k = 0; k < s.length; k++) { d = alpTry(s[k], e, f); if (d === null) ex++; else { if (d < mn) mn = d; if (d > mx) mx = d; } }
        bits = mx >= mn ? Math.log2(mx - mn + 1) : 0; c = (s.length - ex) * bits + ex * 80;
        if (c < bc) { bc = c; best = [e, f]; }
      }
      return best;
    }
    // The distance, in last-place steps, between the bit patterns of two doubles with the same sign: an exact small whole number, or null when it is more than 2^20 away.
    function bitDistance(v, pred) {
      var hv, lv, hp, lp, r;
      f64a[0] = v; hv = u32a[HI]; lv = u32a[LO]; f64a[0] = pred; hp = u32a[HI]; lp = u32a[LO];
      if ((hv >>> 31) !== (hp >>> 31)) return null;
      r = (hv - hp) * 4294967296 + (lv - lp);
      return r >= -1048576 && r <= 1048576 ? r : null;
    }
    function addDistance(pred, r) {        // the double whose bit pattern is r steps from pred's
      var h, l;
      f64a[0] = pred; h = u32a[HI]; l = u32a[LO] + r;
      if (l >= 4294967296) { l -= 4294967296; h = (h + 1) >>> 0; } else if (l < 0) { l += 4294967296; h = (h - 1) >>> 0; }
      u32a[HI] = h; u32a[LO] = l; return f64a[0];
    }
    function encALP(a, depth, opt) {       // decimals as whole numbers; a value that is NOT exactly a decimal is stored as its distance in last-place steps from the decimal guess
      var n = a.length, ef = alpParams(a), e = ef[0], f = ef[1], ints = new Float64Array(n), pos = [], near = [], raw = [], last = 0, i, v, d, code, d0, r, w, kw = KWC, ex = null, xi = 0, aP, iP, pP;
      if (kw && n >= 1024) {                                                  // the exact decimals in the wasm helper; only the rows that are not exact are looked at here
        aP = kw.base; iP = kal(aP + n * 8); pP = kal(iP + n * 8);
        if (kwRoom(pP + n * 4 - kw.base + 64)) {
          new Float64Array(kw.mem.buffer, aP, n).set(a);
          xi = kw.x.alp_enc(aP, n, F10[e], F10[f], iP, pP);
          if (xi * 2 > n) return null;
          ints.set(new Float64Array(kw.mem.buffer, iP, n)); ex = new Uint32Array(kw.mem.buffer, pP, xi).slice(); xi = 0;
        }
      }
      for (var ii = 0, cntx = ex ? ex.length : n; ii < cntx; ii++) {
        i = ex ? ex[ii] : ii;
        v = a[i]; d = ex ? null : alpTry(v, e, f);
        if (ex) last = i > 0 ? ints[i - 1] : 0;
        if (d !== null) { ints[i] = d; last = d; continue; }
        pos.push(i); code = 0; d0 = Math.round(v * F10[e] / F10[f]) + 0;              // + 0 turns -0 into +0 so the encoder and the decoder guess the same value
        if (isFinite(d0) && Math.abs(d0) <= MAXI) {
          r = bitDistance(v, d0 * F10[f] / F10[e]);
          if (r !== null) code = (r >= 0 ? 2 * r : -2 * r - 1) + 1;
          if (code) { ints[i] = d0; last = d0; } else ints[i] = last;
        } else ints[i] = last;
        near.push(code); if (!code) raw.push(v);
        if (pos.length * 2 > n) return null;                  // more than half the values are not decimals: stop now
      }
      if (pos.length * 2 > n) return null;
      w = new Wr(); w.u8(e); w.u8(f); w.vi(pos.length); w.bytes(encInts(ints, depth, opt));
      if (pos.length) {
        w.bytes(encInts(gapsOf(pos), depth - 1, opt)); w.bytes(encInts(Float64Array.from(near), depth - 1, opt));
        for (i = 0; i < raw.length; i++) w.f64(raw[i]);
      }
      return w.out();
    }
    function decALP(r, n, depth) {
      var e = r.u8(), f = r.u8(), ne = r.vi(), ints, out = new Float64Array(n), i, gaps, near, at, p, k, c, q, z;
      if (e > 22 || f > e || ne > n) pfail('bad decimal column');
      ints = decInts(r, n, depth + 1);
      for (i = 0; i < n; i++) out[i] = ints[i] * F10[f] / F10[e];
      if (ne) {
        gaps = decInts(r, ne, depth + 1); near = decInts(r, ne, depth + 1); at = new Uint32Array(ne); p = -1;
        for (k = 0; k < ne; k++) { p += gaps[k] + 1; if (!(p >= 0 && p < n)) pfail('bad exception position'); at[k] = p; }
        for (k = 0; k < ne; k++) {
          c = near[k]; q = at[k];
          if (c === 0) out[q] = r.f64();
          else { if (!(c >= 1 && c <= 2097153)) pfail('bad near miss'); z = c - 1; out[q] = addDistance(out[q], z % 2 ? -(z + 1) / 2 : z / 2); }
        }
      }
      return out;
    }
    function splitHiLo(a, n) {
      var hiA = new Uint32Array(n), loA = new Uint32Array(n), i;
      for (i = 0; i < n; i++) { f64a[0] = a[i]; hiA[i] = u32a[HI]; loA[i] = u32a[LO]; }
      return [hiA, loA];
    }
    function encRD(a, depth, opt) {        // front p bits (a dictionary of up to 8 values, the rest as exceptions) and the back bits packed
      var n = a.length, hl = splitHiLo(a, n), hiA = hl[0], loA = hl[1], bestP = 16, bc = 1e18, p, cnt, i, k, vals, top, tot, c, dict, idx, codes = new Uint32Array(n), pos = [], raw = [], w, lowBits, mask, hiLow = new Uint32Array(n), step = Math.max(1, n >> 8);
      for (p = 4; p <= 16; p++) {
        cnt = new Map(); for (i = 0; i < n; i += step) { k = hiA[i] >>> (32 - p); cnt.set(k, (cnt.get(k) || 0) + 1); }
        vals = Array.from(cnt.values()); top = vals.slice().sort(function (x, y) { return y - x; }).slice(0, 8).reduce(function (s, v) { return s + v; }, 0); tot = vals.reduce(function (s, v) { return s + v; }, 0);
        c = (64 - p) + 3 + (tot - top) / tot * (p + 16); if (c < bc) { bc = c; bestP = p; }
      }
      p = bestP; cnt = new Map(); for (i = 0; i < n; i++) { k = hiA[i] >>> (32 - p); cnt.set(k, (cnt.get(k) || 0) + 1); }
      dict = Array.from(cnt.entries()).sort(function (x, y) { return y[1] - x[1]; }).slice(0, 8).map(function (q) { return q[0]; });
      idx = new Map(); dict.forEach(function (k2, ix) { idx.set(k2, ix); });
      for (i = 0; i < n; i++) { k = hiA[i] >>> (32 - p); if (idx.has(k)) codes[i] = idx.get(k); else { codes[i] = 0; pos.push(i); raw.push(k); } }
      lowBits = 32 - p; mask = lowBits >= 32 ? 0xFFFFFFFF : (1 << lowBits) - 1; for (i = 0; i < n; i++) hiLow[i] = (hiA[i] & mask) >>> 0;
      w = new Wr(); w.u8(p); w.u8(dict.length); dict.forEach(function (k2) { w.vi(k2); }); w.vi(pos.length);
      bpWrite(w, codes, n, dict.length > 1 ? bwOf(dict.length - 1) : 0); bpWrite(w, hiLow, n, lowBits); bpWrite(w, loA, n, 32);
      if (pos.length) { w.bytes(encInts(gapsOf(pos), depth - 1, opt)); raw.forEach(function (k2) { w.vi(k2); }); }
      return w.out();
    }
    function decRD(r, n, depth) {
      var p = r.u8(), nd = r.u8(), dict = [], i, ne, lowBits, codes, hiLow, lo, out = new Float64Array(n), front = new Uint32Array(n), gaps, q, k;
      if (p < 4 || p > 16 || nd > 8) pfail('bad column');
      for (i = 0; i < nd; i++) dict.push(r.vi());
      ne = r.vi(); if (ne > n) pfail('bad exception count');
      lowBits = 32 - p; codes = bpRead(r, n, nd > 1 ? bwOf(nd - 1) : 0); hiLow = bpRead(r, n, lowBits); lo = bpRead(r, n, 32);
      for (i = 0; i < n; i++) front[i] = dict[codes[i]] || 0;
      if (ne) { gaps = decInts(r, ne, depth + 1); q = -1; for (k = 0; k < ne; k++) { q += gaps[k] + 1; if (!(q >= 0 && q < n)) pfail('bad exception position'); front[q] = r.vi(); } }
      for (i = 0; i < n; i++) { u32a[HI] = ((front[i] << lowBits) | hiLow[i]) >>> 0; u32a[LO] = lo[i]; out[i] = f64a[0]; }
      return out;
    }
    function encFDict(a, depth, opt) {
      var n = a.length, m = new Map(), i, k, keys, codes, w, sm, step = n > 2048 ? Math.floor(n / 1024) : 0;
      if (step) { sm = new Set(); for (i = 0; i < n; i += step) sm.add(a[i]); if (sm.size > 0.95 * Math.ceil(n / step)) return null; }       // nearly every sampled value is different: no dictionary will help
      for (i = 0; i < n; i++) { k = a[i] === 0 && 1 / a[i] < 0 ? '-0' : a[i]; if (!m.has(k)) m.set(k, m.size); if (m.size > n / 2 || m.size > 65536) return null; }
      keys = Array.from(m.keys()); codes = new Float64Array(n);
      for (i = 0; i < n; i++) codes[i] = m.get(a[i] === 0 && 1 / a[i] < 0 ? '-0' : a[i]);
      w = new Wr(); w.vi(keys.length); for (i = 0; i < keys.length; i++) w.f64(keys[i] === '-0' ? -0 : keys[i]);
      w.bytes(encInts(codes, depth, opt)); return w.out();
    }
    function decFDict(r, n, depth) {
      var m = r.vi(), keys = [], i, codes, out = new Float64Array(n), c;
      if (m > n || m > 65536) pfail('bad dictionary');
      for (i = 0; i < m; i++) keys.push(r.f64());
      codes = decInts(r, n, depth + 1);
      for (i = 0; i < n; i++) { c = codes[i]; if (!(c >= 0 && c < m)) pfail('bad dictionary code'); out[i] = keys[c]; }
      return out;
    }
    function entropyOf(c, n) {             // a quick estimate of what rANS would write for bytes with these counts: the order-0 entropy plus the table
      var i, bits = 0, used = 0, v;
      for (i = 0; i < 256; i++) { v = c[i]; if (v) { used++; bits -= v * Math.log2(v / n); } }
      return bits / 8 + used * 1.5 + 36;
    }
    function planeMode(p, n) {             // 1 constant, 0 stored, 2 rANS, 3 rANS of byte differences: by estimate, so only one coder runs per plane
      var cnt = new Uint32Array(256), cd = new Uint32Array(256), i, used = 0, d, e2, e3, prev, v;
      for (i = 0; i < n; i++) cnt[p[i]]++;
      for (i = 0; i < 256; i++) if (cnt[i]) used++;
      if (used === 1) return { mode: 1, est: 2 };
      e2 = entropyOf(cnt, n);
      d = new Uint8Array(n); prev = p[0]; d[0] = prev; cd[prev]++;
      for (i = 1; i < n; i++) { v = p[i]; prev = (v - prev) & 255; d[i] = prev; cd[prev]++; prev = v; }
      e3 = entropyOf(cd, n);
      if (Math.min(e2, e3) >= n) return { mode: 0, est: n + 1 };
      return e3 < e2 ? { mode: 3, est: e3 + 1, d: d, c: cd } : { mode: 2, est: e2 + 1, c: cnt };
    }
    function planeBytes(p, n, pm) {        // one byte plane, written the way planeMode chose
      var w = new Wr(), q = pm.mode === 3 ? pm.d : p, c, freq, cum, i, rb, body;
      if (pm.mode === 1) { w.u8(1); w.u8(p[0]); return w.out(); }
      if (pm.mode === 0) { w.u8(0); w.bytes(p); return w.out(); }
      c = pm.c; if (!c) { c = new Uint32Array(256); for (i = 0; i < n; i++) c[q[i]]++; }                // the counts planeMode already made
      freq = normFreq(c, n); cum = new Uint16Array(257); for (i = 0; i < 256; i++) cum[i + 1] = cum[i] + freq[i];
      writeTable(w, freq); rb = ransEncode(q, freq, cum); w.vi(rb.length); w.bytes(rb);
      if (w.n + 1 >= n) { w = new Wr(); w.u8(0); w.bytes(p); return w.out(); }          // the estimate was too hopeful: store the plane
      body = w.out(); w = new Wr(); w.u8(pm.mode); w.bytes(body); return w.out();
    }
    function splitPlanes(a, n, variant) {  // the 8 byte planes of the doubles; variant 1 first XORs every value with the one before it
      var planes = [], b, i, lo, hi, l2, h2, pl = 0, ph = 0, p0, p1, p2, p3, p4, p5, p6, p7;
      for (b = 0; b < 8; b++) planes.push(new Uint8Array(n));
      p0 = planes[0]; p1 = planes[1]; p2 = planes[2]; p3 = planes[3]; p4 = planes[4]; p5 = planes[5]; p6 = planes[6]; p7 = planes[7];
      for (i = 0; i < n; i++) {
        f64a[0] = a[i]; lo = u32a[LO]; hi = u32a[HI];
        if (variant) { l2 = lo; h2 = hi; lo = (lo ^ pl) >>> 0; hi = (hi ^ ph) >>> 0; pl = l2; ph = h2; }
        p0[i] = lo & 255; p1[i] = (lo >>> 8) & 255; p2[i] = (lo >>> 16) & 255; p3[i] = lo >>> 24;
        p4[i] = hi & 255; p5[i] = (hi >>> 8) & 255; p6[i] = (hi >>> 16) & 255; p7[i] = hi >>> 24;
      }
      return planes;
    }
    function planeModes(planes, n) { var pms = [], b; for (b = 0; b < 8; b++) pms.push(planeMode(planes[b], n)); return pms; }
    function estOf(pms) { var e = 0, b; for (b = 0; b < 8; b++) e += pms[b].est; return e; }
    function planeModeK(kw, pP, n, cP, dP) {      // planeMode with the counting in the wasm helper (counts at cP and cP + 1024, differences at dP)
      var cnt, cd, i, used = 0, e2, e3;
      kw.x.plane_stats(pP, n, cP, cP + 1024, dP);
      cnt = new Uint32Array(kw.mem.buffer, cP, 256); cd = new Uint32Array(kw.mem.buffer, cP + 1024, 256);
      for (i = 0; i < 256; i++) if (cnt[i]) used++;
      if (used === 1) return { mode: 1, est: 2 };
      e2 = entropyOf(cnt, n); e3 = entropyOf(cd, n);
      if (Math.min(e2, e3) >= n) return { mode: 0, est: n + 1 };
      return e3 < e2 ? { mode: 3, est: e3 + 1, c: cd.slice() } : { mode: 2, est: e2 + 1, c: cnt.slice() };
    }
    function encPlanesK(a, kw) {           // the same as encPlanes, with the splitting, counting and entropy coding in the wasm helper; null when its memory cannot be had
      var n = a.length, sub = n > 4096 ? sampleOf(a) : a, m = sub.length, mx = Math.max(n, m), cap = n * 2 + 64, subP = kw.base, aP, plP, dP, cP, fP, oP, end, variant, v0 = [], v1 = [], spm, pms = [], b, i, w, v, pm, c, freq, p, len, body, u8, fq;
      aP = sub === a ? subP : kal(subP + m * 8); plP = kal(aP + (sub === a ? 0 : n * 8) + (sub === a ? m * 8 : 0)); dP = kal(plP + 8 * mx); cP = kal(dP + mx + 16); fP = kal(cP + 2048); oP = kal(fP + 512); end = oP + cap + 16;
      if (!kwRoom(end - kw.base + 64)) return null;
      new Float64Array(kw.mem.buffer, subP, m).set(sub);
      if (sub !== a) new Float64Array(kw.mem.buffer, aP, n).set(a);
      kw.x.planes_split(subP, m, 0, plP); for (b = 0; b < 8; b++) v0.push(planeModeK(kw, plP + b * m, m, cP, dP));
      kw.x.planes_split(subP, m, 1, plP); for (b = 0; b < 8; b++) v1.push(planeModeK(kw, plP + b * m, m, cP, dP));
      variant = estOf(v1) < estOf(v0) ? 1 : 0; spm = variant ? v1 : v0;
      kw.x.planes_split(aP, n, variant, plP);
      u8 = new Uint8Array(kw.mem.buffer);
      for (b = 0; b < 8; b++) {
        if (sub === a) pms.push(spm[b]);
        else if (spm[b].mode === 1) { v = u8[plP + b * n]; for (i = 1; i < n && u8[plP + b * n + i] === v; i++); pms.push(i < n ? planeModeK(kw, plP + b * n, n, cP, dP) : spm[b]); }
        else pms.push(planeModeK(kw, plP + b * n, n, cP, dP));
      }
      fq = new Uint16Array(kw.mem.buffer, fP, 256);
      w = new Wr(); w.u8(variant);
      for (b = 0; b < 8; b++) {
        pm = pms[b]; p = plP + b * n; c = new Wr();
        if (pm.mode === 1) { c.u8(1); c.u8(u8[p]); w.bytes(c.out()); continue; }
        if (pm.mode === 0) { c.u8(0); c.bytes(u8.subarray(p, p + n)); w.bytes(c.out()); continue; }
        freq = normFreq(pm.c, n); fq.set(freq);
        if (pm.mode === 3) kw.x.plane_stats(p, n, cP, cP + 1024, dP);                         // the differences again, into dP
        writeTable(c, freq);
        len = kw.x.rans_enc(pm.mode === 3 ? dP : p, n, fP, oP, cap); c.vi(len); c.bytes(new Uint8Array(kw.mem.buffer, oP + cap - len, len));
        if (c.n + 1 >= n) { c = new Wr(); c.u8(0); c.bytes(u8.subarray(p, p + n)); w.bytes(c.out()); continue; }
        body = c.out(); c = new Wr(); c.u8(pm.mode); c.bytes(body); w.bytes(c.out());
      }
      return w.out();
    }
    function encPlanes(a) {
      var kw = KWC, got;
      if (kw && a.length >= 1024) { got = encPlanesK(a, kw); if (got) return got; }
      return encPlanesJS(a);
    }
    function encPlanesJS(a) {                // byte planes of the doubles (like OpenZL's transpose_split); the variant is chosen on a quarter of the block, then each plane's way by estimate
      var n = a.length, sub = n > 4096 ? sampleOf(a) : a, m = sub.length, v0, v1, variant, spm, planes, pms = [], b, w, i, v;
      v0 = planeModes(splitPlanes(sub, m, 0), m); v1 = planeModes(splitPlanes(sub, m, 1), m);
      variant = estOf(v1) < estOf(v0) ? 1 : 0; spm = variant ? v1 : v0;
      planes = splitPlanes(a, n, variant);
      for (b = 0; b < 8; b++) {
        if (sub === a) pms.push(spm[b]);                                             // the sample was the whole block
        else if (spm[b].mode === 1) { v = planes[b][0]; for (i = 1; i < n && planes[b][i] === v; i++); pms.push(i < n ? planeMode(planes[b], n) : spm[b]); }   // constant in the sample: check it is constant everywhere
        else pms.push(planeMode(planes[b], n));
      }
      w = new Wr(); w.u8(variant); for (b = 0; b < 8; b++) w.bytes(planeBytes(planes[b], n, pms[b]));
      return w.out();
    }
    function decPlanesK(r, n, kw) {        // the same as decPlanes, with the entropy decoding and the joining of the planes in the wasm helper; null when its memory cannot be had
      var planesP = kw.base, outP = kal(planesP + 8 * n), freqP = kal(outP + 8 * n), srcP = kal(freqP + 512), cap = n * 2 + 64, variant, b, mode, u8, fq, bm, i, tot, v, rl, sub, out, dst, t;
      if (!kwRoom(srcP + cap + 16 - kw.base + 64)) return null;
      variant = r.u8(); if (variant > 1) pfail('bad column');
      u8 = new Uint8Array(kw.mem.buffer); fq = new Uint16Array(kw.mem.buffer, freqP, 256);
      for (b = 0; b < 8; b++) {
        mode = r.u8(); dst = planesP + b * n;
        if (mode === 1) { u8.fill(r.u8(), dst, dst + n); continue; }
        if (mode === 0) { u8.set(r.bytes(n), dst); continue; }
        if (mode !== 2 && mode !== 3) pfail('bad column');
        bm = r.bytes(32); fq.fill(0); tot = 0;                                              // the frequency table, checked: it must add up to exactly 4096
        for (i = 0; i < 256; i++) if ((bm[i >> 3] >> (i & 7)) & 1) { v = r.vi() + 1; tot += v; if (tot > M) pfail('bad frequencies'); fq[i] = v; }
        if (tot !== M) pfail('bad frequencies');
        rl = r.vi(); sub = r.bytes(rl);
        if (rl > cap) {                                                                     // longer than any packer here writes: the plain way
          t = tablesOf(fq); v = ransDecode(sub, n, t.freq, t.cum, t.slot);
          if (mode === 3) for (i = 1; i < n; i++) v[i] = (v[i - 1] + v[i]) & 255;
          u8.set(v, dst); continue;
        }
        u8.set(sub, srcP);
        if (kw.x.rans_dec(srcP, rl, n, freqP, dst, mode === 3 ? 1 : 0) < 0) pfail('bad entropy data');
      }
      kw.x.planes_join(planesP, n, variant, outP);
      out = new Float64Array(n); out.set(new Float64Array(kw.mem.buffer, outP, n));
      return out;
    }
    function tablesOf(freq) {           // cum and slot tables for a frequency table that adds up to 4096
      var cum = new Uint16Array(257), slot = new Uint8Array(M), i;
      for (i = 0; i < 256; i++) { cum[i + 1] = cum[i] + freq[i]; slot.fill(i, cum[i], cum[i + 1]); }
      return { freq: Uint16Array.from(freq), cum: cum, slot: slot };
    }
    function decPlanes(r, n) {
      var kw = KWC, p0 = r.p, got;
      if (kw && n >= 1024) { got = decPlanesK(r, n, kw); if (got) return got; r.p = p0; }
      return decPlanesJS(r, n);
    }
    function decPlanesJS(r, n) {
      var variant = r.u8(), planes = [], b, mode, t, p, rl, i, lo, hi, pl = 0, ph = 0, out = new Float64Array(n), o32, p0, p1, p2, p3, p4, p5, p6, p7;
      if (variant > 1) pfail('bad column');
      for (b = 0; b < 8; b++) {
        mode = r.u8();
        if (mode === 1) { planes.push(new Uint8Array(n).fill(r.u8())); continue; }
        if (mode === 0) { planes.push(r.bytes(n).slice()); continue; }
        if (mode !== 2 && mode !== 3) pfail('bad column');
        t = readTable(r); rl = r.vi(); p = ransDecode(r.bytes(rl), n, t.freq, t.cum, t.slot);
        if (mode === 3) for (i = 1; i < n; i++) p[i] = (p[i - 1] + p[i]) & 255;
        planes.push(p);
      }
      o32 = new Uint32Array(out.buffer); p0 = planes[0]; p1 = planes[1]; p2 = planes[2]; p3 = planes[3]; p4 = planes[4]; p5 = planes[5]; p6 = planes[6]; p7 = planes[7];
      for (i = 0; i < n; i++) {
        lo = (p0[i] | (p1[i] << 8) | (p2[i] << 16) | (p3[i] << 24)) >>> 0; hi = (p4[i] | (p5[i] << 8) | (p6[i] << 16) | (p7[i] << 24)) >>> 0;
        if (variant) { lo = (lo ^ pl) >>> 0; hi = (hi ^ ph) >>> 0; pl = lo; ph = hi; }
        o32[2 * i + LO] = lo; o32[2 * i + HI] = hi;
      }
      return out;
    }

    // ---------------------------------------------------------------- one block of numbers, and a whole column
    var CS = { INTS: 0, ALP: 1, RD: 2, RAWF: 3, FDICT: 4, PLANES: 5 }, CHUNK = 8192, NAMES = ['INTS', 'ALP', 'RD', 'RAWF', 'FDICT', 'PLANES'];
    function isIntegral(a) { var i, v, st; if (KWC && a.length >= 1024 && (st = statsOf(KWC, a))) return st.ok; for (i = 0; i < a.length; i++) { v = a[i]; if (!(Math.abs(v) < MAXI) || Math.floor(v) !== v || (v === 0 && 1 / v < 0)) return false; } return true; }
    function rawDoubles(a) { var w = new Wr(), i; w.need(a.length * 8); for (i = 0; i < a.length; i++) w.f64(a[i]); return w.out(); }
    function encChunk(a, depth, opt, only) {      // only: the ways that won earlier blocks of this column; given on most blocks so the others are not tried
      var cands = [], best = null, bs = -1, k, e, w;
      if (isIntegral(a)) cands.push([CS.INTS, function () { return encInts(a, depth, opt); }]);
      else {
        cands.push([CS.ALP, function () { return encALP(a, depth, opt); }]); cands.push([CS.FDICT, function () { return encFDict(a, depth, opt); }]);
        if (!opt.noEntropy) cands.push([CS.PLANES, function () { return encPlanes(a); }]);
        cands.push([CS.RD, function () { return encRD(a, depth, opt); }]);                                  // last: it cannot be under 6 bytes a value, so it is skipped when anything before it is smaller
        cands.push([CS.RAWF, function () { return rawDoubles(a); }]);
      }
      for (k = 0; k < cands.length; k++) {
        if (cands[k][0] === CS.RAWF) continue;                                    // plain doubles are written last, only when nothing else is smaller
        if (only && cands[k][0] !== CS.INTS && only.indexOf(cands[k][0]) < 0) continue;
        if (cands[k][0] === CS.RD && best && best.length < a.length * 6) continue;      // this way cannot be under 6 bytes a value (4 for the back bits, at least 2 for the front)
        try { e = cands[k][1](); } catch (err) { e = null; }
        if (e && (!best || e.length < best.length)) { best = e; bs = cands[k][0]; }
      }
      if (only && !best) return encChunk(a, depth, opt, null);                          // none of the ways that won before applies to this block: try them all
      if (!best || best.length >= a.length * 8) { best = rawDoubles(a); bs = CS.RAWF; }
      w = new Wr(); w.u8(bs); w.bytes(best); return w.out();
    }
    function decChunk(r, n) {
      var id = r.u8(), out, i;
      if (id === CS.INTS) return decInts(r, n, 0);
      if (id === CS.ALP) return decALP(r, n, 0);
      if (id === CS.RD) return decRD(r, n, 0);
      if (id === CS.FDICT) return decFDict(r, n, 0);
      if (id === CS.PLANES) return decPlanes(r, n);
      if (id !== CS.RAWF) pfail('unknown way ' + id);
      out = new Float64Array(n); for (i = 0; i < n; i++) out[i] = r.f64(); return out;
    }
    function describe(part) {              // the name of the top way of one block, e.g. "ALP>DELTA", "INTS:RLE", "PLANES"
      var r = new Rd(part), id = r.u8(), names = ['RAW', 'CONST', 'FOR', 'DELTA', 'RLE', 'DICT', 'PFOR', 'DIV', 'ENT'];
      if (id === CS.INTS) return 'INTS:' + names[r.u8()];
      if (id === CS.ALP) { r.u8(); r.u8(); r.vi(); return 'ALP>' + names[r.u8()]; }
      return NAMES[id];
    }
    // pack(values, opts): values is a Float64Array (or any array of numbers). opts.sample (default true): choose each block's top way on a quarter of it, which is much faster;
    // opts.noEntropy: leave out the byte-coded ways (used to give a general compressor something it can still shrink); opts.labels: an array that receives one label per block.
    function pack(values, opts) {
      KWC = opts && opts.wasm === false ? null : kwGet(); STAT = null;
      try { return packRun(values, opts); } finally { KWC = null; STAT = null; }
    }
    function packRun(values, opts) {
      var a = values instanceof Float64Array ? values : Float64Array.from(values), n = a.length, o = { sample: !(opts && opts.sample === false), noEntropy: !!(opts && opts.noEntropy) }, w = new Wr(), i, part, k = 0, won = [], wonInts = [], full, H = opts && opts.hint;
      if (H) { k = H.k || 0; won = H.won || (H.won = []); wonInts = H.wonInts || (H.wonInts = []); }       // opts.hint: what won for this column in earlier packs; a pack then counts on as if its blocks came after those
      w.vi(n); w.vi(CHUNK);
      for (i = 0; i < n; i += CHUNK) {
        k++; full = !(k > 2 && k % 8 !== 0 && won.length);
        o.prefer = full || !wonInts.length ? null : wonInts; o.top = 2;
        part = encChunk(a.subarray(i, Math.min(n, i + CHUNK)), 2, o, full ? null : won);   // a block tries every way for the first blocks and every 8th; the rest try only the ways that have won before
        if (won.indexOf(part[0]) < 0 && part[0] !== CS.RAWF) won.push(part[0]);
        if (part[0] === CS.INTS && wonInts.indexOf(part[1]) < 0 && part[1] !== IS.RAW) wonInts.push(part[1]);
        w.vi(part.length); w.bytes(part);
        if (opts && opts.labels) opts.labels.push(describe(part));
      }
      if (H) H.k = k;
      return w.out();
    }
    // unpack(bytes, count): the Float64Array, exactly as it was packed. count is checked against the data. Damaged or cut data throws an Error whose message starts with MemoryCompressionJSO:.
    function unpack(bytes, count, wasm) {
      KWC = wasm === false ? null : kwGet();
      try { return unpackRun(bytes, count); } finally { KWC = null; }
    }
    function unpackRun(bytes, count) {
      var r = new Rd(bytes), n = r.vi(), c = r.vi(), out, i, len, c2;
      if (n !== count || c < 1 || c > 1048576) pfail('the data does not match the column');
      out = new Float64Array(n);
      for (i = 0; i < n; i += c) { len = r.vi(); c2 = Math.min(c, n - i); out.set(decChunk(new Rd(r.bytes(len)), c2), i); }
      return out;
    }
    function available() { return LE; }
    // unpackStart / unpackStep: the same answer as unpack(), a few blocks of 8,192 numbers at a time (each block stands alone), so a long column can be opened in short slices.
    // st.out is the Float64Array when unpackStep has returned true (all blocks done).
    function unpackStart(bytes, count, wasm) {
      var r = new Rd(bytes), n = r.vi(), c = r.vi();
      if (n !== count || c < 1 || c > 1048576) pfail('the data does not match the column');
      return { r: r, n: n, c: c, i: 0, out: new Float64Array(n), wasm: wasm };
    }
    function unpackStep(st, blocks) {
      var k, len, c2;
      KWC = st.wasm === false ? null : kwGet();
      try {
        for (k = 0; k < blocks && st.i < st.n; k++) { len = st.r.vi(); c2 = Math.min(st.c, st.n - st.i); st.out.set(decChunk(new Rd(st.r.bytes(len)), c2), st.i); st.i += st.c; }
      } finally { KWC = null; }
      return st.i >= st.n;
    }
    return { pack: pack, unpack: unpack, available: available, unpackStart: unpackStart, unpackStep: unpackStep };
  })();

