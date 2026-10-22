    if (HAS_PACK) {
      var CANDIDATES_F = [[0, 0, 0, 0], [0, 0, 3, 0], [0, 0, 2, 1], [2, 0.001, 0, 0], [2, 1e-4, 0, 0], [2, 0.01, 0, 0], [1, 0, 0, 0]];   // mode, mode argument, delta, delta order
      var CANDIDATES_I = [[0, 0, 0, 0], [0, 0, 3, 0], [0, 0, 2, 1], [1, 0, 0, 0]];
      // Packs a typed array (Uint32, BigUint64, Int32, BigInt64, Float32, Float64, Uint16 or Int16) into an ordinary Pcodec file. opts.level 0 to 12 (default 8, Pcodec's own default).
      // opts.parts: true (8) or a number packs a big column as that many ordinary Pcodec files behind a small header (a split file) that PcodecJS.pool() can unpack on several workers; a column of one page (up to 262,144 numbers) stays a normal file; not combined with smallest.
      // opts.smallest: 'quick' checks whether the numbers are decimals (multiples of 0.1, 0.01, ... 0.000001) and, if so, also packs with that setting and keeps the smaller file: about 90% of the saving of true on our 39 test columns (3.6% against 4.0% smaller) at about 1.4 times the plain time. opts.smallest: true also tries seven other encoder settings on a 20,000-number sample, packs with the best, and keeps the smaller file (about 3.2 to 3.7 times the time, about 2.8% to 4% smaller on decimals and counters).
      var DECIMALS = [0.1, 0.01, 0.001, 1e-4, 1e-5, 1e-6];
      // The coarsest of 0.1 ... 0.000001 that at least 99% of about 512 sampled numbers are a whole multiple of, or 0.
      function decimalBase(a, single) {
        var n = a.length, step = Math.max(1, Math.floor(n / 512)), k, i, ok, tot, q, tol, x;
        for (k = 0; k < DECIMALS.length; k++) {
          ok = 0; tot = 0;
          for (i = 0; i < n; i += step) { x = a[i]; if (x !== x || x === Infinity || x === -Infinity) continue; tot++; q = x / DECIMALS[k]; tol = (single ? 1e-6 : 1e-9) * Math.max(1, Math.abs(q)); if (Math.abs(q - Math.round(q)) <= tol) ok++; }
          if (tot && ok / tot >= 0.99) return DECIMALS[k];
        }
        return 0;
      }
      api.pack = function (arr, opts) {
        opts = opts || {};
        if (opts.parts) return packSplit(arr, opts);
        var type = typeOf(arr), level = opts.level === undefined ? 8 : opts.level;
        if (!type) throw new TypeError('PcodecJS: pack needs a typed array of u16, i16, u32, i32, f32, u64, i64 or f64');
        if (!(level >= 0 && level <= 12) || level !== Math.floor(level)) throw new RangeError('PcodecJS: level is 0 to 12');
        if (arr.length === 0) throw new RangeError('PcodecJS: nothing to pack');
        var kind = TYPES[type][0];
        function once(x, a, cfg) {
          var src = new Uint8Array(a.buffer, a.byteOffset, a.byteLength), p = putIn(x, src), n;
          try { n = cfg ? x.compress_cfg(kind, p, a.length, level, cfg[0], cfg[1], cfg[2], cfg[3]) : x.compress(kind, p, a.length, level); } finally { x.release(p, src.length); }
          if (n < 0) fail(n);
          var out = new Uint8Array(x.memory.buffer, x.out_ptr(), n).slice(); x.out_release(); return out;
        }
        return run(function (x) {
          drop();
          var best = once(x, arr, null);
          if (opts.smallest === 'quick') {                              // decimals only: if the numbers are multiples of 0.1, 0.01, ... try that one setting on the whole array
            var base = (type === 'f64' || type === 'f32') && arr.length >= 256 ? decimalBase(arr, type === 'f32') : 0, alt;
            if (base) { alt = once(x, arr, [2, base, 0, 0]); if (alt.length < best.length) best = alt; }
          } else if (opts.smallest && arr.length >= 256) {
            var S = 20000, smp = arr;
            if (arr.length > S * 2) { var k = 4, L = S / k, j, s; smp = new arr.constructor(S); for (j = 0; j < k; j++) { s = Math.floor((arr.length - L) * j / (k - 1)); smp.set(arr.subarray(s, s + L), j * L); } }
            // When the sample is the whole array (up to 40,000 numbers) the sample packs are the real packs: setting 0 is the pack already made, and the winner is kept instead of being packed again.
            var whole = smp === arr, cands = (type === 'f64' || type === 'f32') ? CANDIDATES_F : CANDIDATES_I, bi = 0, bs = whole ? best.length : 1e18, bo = whole ? best : null, i, z, o;
            for (i = whole ? 1 : 0; i < cands.length; i++) { try { o = once(x, smp, cands[i]); } catch (e) { continue; } z = o.length; if (z < bs) { bs = z; bi = i; if (whole) bo = o; } }
            if (bi !== 0) { var alt = whole ? bo : once(x, arr, cands[bi]); if (alt.length < best.length) best = alt; }
          }
          return best;
        });
      };

      // One stretch of a big column packed as whole pages, for packing a column on several workers (PcodecJS.pool shares the column out; the pieces join into exactly the bytes pack() writes).
      // o = { sizes: the page sizes of this stretch, total: the count of the whole column, level, first: true for the first stretch, last: true for the last }
      api.packPart = function (arr, o) {
        var type = typeOf(arr), kind, sizes = o && o.sizes, level = o && o.level !== undefined ? o.level : 8, i, off = 0, outs = [], len = 0, out, q = 0;
        if (!type) throw new TypeError('PcodecJS: packPart needs a typed array of u16, i16, u32, i32, f32, u64, i64 or f64');
        if (!sizes || !sizes.length || !(level >= 0 && level <= 12) || !(o.total >= arr.length)) throw new RangeError('PcodecJS: packPart needs { sizes, total, level }');
        for (i = 0; i < sizes.length; i++) off += sizes[i];
        if (off !== arr.length) throw new RangeError('PcodecJS: the page sizes do not add up to the array');
        kind = TYPES[type][0]; off = 0;
        return run(function (x) {
          drop();
          for (i = 0; i < sizes.length; i++) {
            var part = arr.subarray(off, off + sizes[i]), src = new Uint8Array(part.buffer, part.byteOffset, part.byteLength), p = putIn(x, src), n;
            try { n = x.compress_part(kind, p, sizes[i], level, o.total, (o.first && i === 0 ? 1 : 0) | (o.last && i === sizes.length - 1 ? 2 : 0)); } finally { x.release(p, src.length); }
            if (n < 0) fail(n);
            outs.push(new Uint8Array(x.memory.buffer, x.out_ptr(), n).slice()); x.out_release(); len += n; off += sizes[i];
          }
          out = new Uint8Array(len);
          for (i = 0; i < outs.length; i++) { out.set(outs[i], q); q += outs[i].length; }
          return out;
        });
      };

      // A split file: the column's pages (equal pages of at most 262,144 numbers, as Pcodec cuts them) are shared out over `parts` ordinary Pcodec files. Each part holds the same page bytes a normal file would, so the whole is about 7 bytes per part plus 4 for the header larger.
      function packSplit(arr, opts) {
        var type = typeOf(arr), n, pages, want, P, rest = {}, k, files = [], g, from, to, off = 0, cnt, sizes, i;
        if (!type) throw new TypeError('PcodecJS: pack needs a typed array of u16, i16, u32, i32, f32, u64, i64 or f64');
        if (opts.smallest) throw new RangeError('PcodecJS: parts and smallest cannot be combined');
        n = arr.length; if (!n) throw new RangeError('PcodecJS: nothing to pack');
        want = opts.parts === true ? 8 : Math.floor(opts.parts);
        if (!(want >= 1)) throw new RangeError('PcodecJS: parts is a number from 1 up, or true');
        pages = pageSizes(n); P = Math.min(want, pages.length, 65535);
        if (P < 2) { for (k in opts) if (k !== 'parts') rest[k] = opts[k]; return api.pack(arr, rest); }
        for (g = 0; g < P; g++) {
          from = Math.floor(g * pages.length / P); to = Math.floor((g + 1) * pages.length / P); sizes = pages.slice(from, to); cnt = 0;
          for (i = 0; i < sizes.length; i++) cnt += sizes[i];
          files.push(api.packPart(arr.subarray(off, off + cnt), { sizes: sizes, total: cnt, level: opts.level, first: true, last: true })); off += cnt;
        }
        return buildSplit(n, files);
      }
    }
