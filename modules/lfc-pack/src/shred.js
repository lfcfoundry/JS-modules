// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ the NDJSON tokenizer (wasm/core.c) and its JavaScript path for rows the wasm walker hands back
  var MAXD = 100;
  var CODES_KEY = 2147483001;   // column key of the string-code column
  function depthOver(o, lim) {
    var st = [o, 0], d, v, i, k;
    while (st.length) { d = st.pop(); v = st.pop();
      if (v !== null && typeof v === 'object') { if (d >= lim) return true;
        if (Array.isArray(v)) { for (i = 0; i < v.length; i++) st.push(v[i], d + 1); } else { for (k in v) st.push(v[k], d + 1); } } }
    return false;
  }
  var SIDE_CAP = 1 << 19, ROW_CAP = 1 << 18, NUM_CAP = 4 << 20, IN_CAP = 48 << 20;
  function makeShredder(inst) {
    var X = inst.exports, mem = X.memory;
    var v = {
      IN: new Uint8Array(mem.buffer, X.in_ptr(), IN_CAP), TEXT: new Uint8Array(mem.buffer, X.text_ptr(), 48 << 20),
      NODD: new Uint32Array(mem.buffer, X.nodd_ptr(), (1 << 20) * 4), ODD: new Uint8Array(mem.buffer, X.odd_ptr(), 1 << 18),
      RS: new Uint32Array(mem.buffer, X.rowstart_ptr(), ROW_CAP), RE: new Uint32Array(mem.buffer, X.rowend_ptr(), ROW_CAP),
      NUMV: new Float64Array(mem.buffer, X.numv_ptr(), NUM_CAP), NUMP: new Uint32Array(mem.buffer, X.nump_ptr(), NUM_CAP),
      SIDE: new Uint32Array(mem.buffer, X.side_ptr(), SIDE_CAP * 3), SLOWN: new Uint32Array(mem.buffer, X.slown_ptr(), SIDE_CAP * 3),
      IDS: new Uint32Array(mem.buffer, X.ids_ptr(), ROW_CAP), SK: new Uint8Array(mem.buffer, X.sk_ptr(), 1 << 20),
      SHAPES: new Uint8Array(mem.buffer, X.shapes_ptr(), 16 << 20), SHOFF: new Uint32Array(mem.buffer, X.shoff_ptr(), (1 << 16) + 1),
      ST: new Uint32Array(mem.buffer, X.state_ptr(), 16)
    };
    // opts.exact: also collect the lists that restore the original bytes (rows with odd spacing or escapes, number spellings)
    function shred(bytes, opts) {
      var exact = !!(opts && opts.exact); X.set_exact(exact ? 1 : 0);
      if (bytes.length > IN_CAP) throw new Error('block too large');
      v.IN.set(bytes); X.reset(bytes.length);
      var sideAll = [], drained = 0, fb = 0, fbOdd = [], r, i;
      function drain() { X.state_ptr(); var sn = v.ST[2];
        for (var j = drained; j < sn; j++) { var s = v.SIDE[j * 3 + 1], e = v.SIDE[j * 3 + 2]; sideAll.push([v.SIDE[j * 3], JSON.parse('"' + td.decode(v.IN.subarray(s, e)) + '"')]); }
        drained = sn; }
      for (;;) {
        r = X.run(); drain(); if (r === 0) break; if (r === 2) throw new Error('capacity');
        fb++;
        var S = v.ST, textPos = S[0], numN = S[1], strN = S[3], rowN = S[4];
        var line = td.decode(v.IN.subarray(S[6], S[7])), row = JSON.parse(line);
        if (exact) { var ln = td.decode(v.IN.subarray(S[10], S[7])).replace(/^(?:[ \t\r]*\n)+/, ''); if (ln.charAt(ln.length - 1) === '\r') ln = ln.slice(0, -1);
          var same = false; try { same = JSON.stringify(row) === ln; } catch (e) { same = false; } if (!same) fbOdd.push([rowN, ln]); }
        var raw = depthOver(row, MAXD);
        var putStr = function (t) { var ok = t.indexOf('\0') < 0, q; if (ok) for (q = 0; q < t.length; q++) if (t.charCodeAt(q) > 127) { ok = false; break; }
          if (ok) { for (q = 0; q < t.length; q++) v.TEXT[textPos + q] = t.charCodeAt(q); textPos += t.length; } else sideAll.push([strN, t]);
          v.TEXT[textPos++] = 0; strN++; };
        var walk = function (o, p) {
          if (typeof o === 'string') { putStr(o); return 1; }
          if (typeof o === 'number') { v.NUMV[numN] = o; v.NUMP[numN++] = fnvStr(p); return 2; }
          if (typeof o === 'boolean') { v.NUMV[numN] = o ? 1 : 0; v.NUMP[numN++] = fnvStr(p + '?'); return 3; }
          if (o === null) return 4;
          if (Array.isArray(o)) return o.map(function (x) { return walk(x, p + '[]'); });
          var s = {}; for (var k in o) setKey(s, k, walk(o[k], p + '.' + k)); return s;
        };
        var sk; if (raw) { putStr(line); sk = '5'; } else sk = JSON.stringify(walk(row, ''));
        var b = te.encode(sk); v.SK.set(b); var id = X.commit_shape(b.length); v.IDS[rowN] = id;
        X.set_state(textPos, numN, v.ST[2], strN, rowN + 1);
      }
      // exactness lists: rows flagged structural in C (spaces, escapes) and fallback rows get one exact check; rows whose only oddity is number spelling are read from the flagged number spans
      var oddRows = [], spell = []; var rn0 = v.ST[4], nOdd = v.ST[11];
      if (exact) {
        for (i = 0; i < rn0; i++) if (v.ODD[i]) { var l2 = td.decode(v.IN.subarray(v.RS[i], v.RE[i])).replace(/^(?:[ \t\r]*\n)+/, ''); if (l2.charAt(l2.length - 1) === '\r') l2 = l2.slice(0, -1);
          var c = null; try { c = JSON.stringify(JSON.parse(l2)); } catch (e2) { c = null; } if (c !== l2) oddRows.push([i, l2]); }
        for (i = 0; i < fbOdd.length; i++) oddRows.push(fbOdd[i]);
        var cur = -1, list = null;
        for (var e3 = 0; e3 < nOdd; e3++) { var rr = v.NODD[e3 * 4]; if (v.ODD[rr]) continue; var text = tlat.decode(v.IN.subarray(v.NODD[e3 * 4 + 2], v.NODD[e3 * 4 + 3]));
          if (JSON.stringify(Number(text)) === text) continue; if (rr !== cur) { list = []; spell.push([rr, list]); cur = rr; } list.push([v.NODD[e3 * 4 + 1], text]); }
        oddRows.sort(function (a, b) { return a[0] - b[0]; });
      }
      for (i = 0; i < v.ST[9]; i++) v.NUMV[v.SLOWN[i * 3]] = Number(td.decode(v.IN.subarray(v.SLOWN[i * 3 + 1], v.SLOWN[i * 3 + 2])));
      var S2 = v.ST, textLen = S2[0], numN2 = S2[1], strN2 = S2[3], rowN2 = S2[4], shapeN = S2[5];
      // numbers by path hash: count first, then fill typed arrays
      var counts = new Map(), h, cc;
      for (i = 0; i < numN2; i++) { h = v.NUMP[i]; cc = counts.get(h); if (cc === undefined) counts.set(h, 1); else counts.set(h, cc + 1); }
      var cols = new Map(), slot = new Map();
      counts.forEach(function (n, hh) { var a = new Float64Array(n); cols.set(hh, a); slot.set(hh, { a: a, i: 0 }); });
      for (i = 0; i < numN2; i++) { cc = slot.get(v.NUMP[i]); cc.a[cc.i++] = v.NUMV[i]; }
      sideAll.sort(function (a, b) { return a[0] - b[0]; });
      var skelList = []; for (i = 0; i < shapeN; i++) skelList.push(td.decode(v.SHAPES.subarray(v.SHOFF[i], v.SHOFF[i + 1])));
      return { textLen: Math.max(textLen - 1, 0), count: strN2, side: sideAll, cols: cols, skelList: skelList, ids: v.IDS.slice(0, rowN2), n: rowN2, fallback: fb, oddRows: oddRows, spell: spell };
    }
    return { shred: shred, x: X, mem: mem, text: function () { return v.TEXT; } };
  }
