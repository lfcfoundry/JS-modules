    if (HAS_PACK) {
      var CANDIDATES_F = [[0, 0, 0, 0], [0, 0, 3, 0], [0, 0, 2, 1], [2, 0.001, 0, 0], [2, 1e-4, 0, 0], [2, 0.01, 0, 0], [1, 0, 0, 0]];   // mode, mode argument, delta, delta order
      var CANDIDATES_I = [[0, 0, 0, 0], [0, 0, 3, 0], [0, 0, 2, 1], [1, 0, 0, 0]];
      // Packs a typed array (Uint32, BigUint64, Int32, BigInt64, Float32, Float64, Uint16 or Int16) into an ordinary Pcodec file. opts.level 0 to 12 (default 8, Pcodec's own default).
      // opts.smallest: true also tries seven other encoder settings on a 20,000-number sample, packs with the best, and keeps the smaller file (about 3.2 to 3.7 times the time, about 2.8% to 4% smaller on decimals and counters).
      api.pack = function (arr, opts) {
        opts = opts || {};
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
          if (opts.smallest && arr.length >= 256) {
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
    }
