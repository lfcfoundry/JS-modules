// Copyright (c) 2026 LFC Foundry. MIT License. Source part of json-format.js (joined by build.py).

  // ================================================================ helper workers: only byte work moves (CRC, zstd, number columns); strings and rows are built on the calling thread
  function workerSource() {
    return 'var JF = (' + jfFactory.toString() + ')(), ready = JF.init({ readOnly: true }), send, onMsg;\n' +
      'if (typeof self === "undefined" && typeof require === "function") { var wt = require("worker_threads"); send = function (m, t) { wt.parentPort.postMessage(m, t); }; wt.parentPort.on("message", function (m) { onMsg(m); }); }\n' +
      'else { send = function (m, t) { self.postMessage(m, t); }; self.onmessage = function (e) { onMsg(e.data); }; }\n' +
      'onMsg = function (m) { ready.then(function () { var r = JF._job(m); send(r.msg, r.transfer); }); };\n';
  }
  function runJob(m) {   // in a helper: { id, kind, buf, crc, want } -> { msg, transfer }
    try {
      var b = m.buf; if (crcJS(b, 0) !== m.crc) throw new Error('block ' + m.id + ' checksum mismatch');
      var F = m.kind === 'f' ? flatFrames(S.zdec, b, m.want, true) : nestedFrames(S.zdec, b);
      return { msg: { id: m.id, F: F }, transfer: m.kind === 'f' ? flatTransfer(F) : nestedTransfer(F) };
    } catch (e) { return { msg: { id: m.id, error: String(e && e.message || e) }, transfer: [] }; }
  }
  function makePool(opts) {   // -> Promise of { unpack(bytes, opts), size, close() }
    opts = opts || {};
    var hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || (typeof require === 'function' && require('os').cpus().length) || 4;
    var size = opts.workers || Math.min(16, Math.max(3, hc - 1)), src = workerSource(), ws = [], i, url = null, W, inflight = [], pending = new Map(), nextJob = 0;
    function spawn() {
      var w;
      if (typeof Worker === 'function') { url = url || URL.createObjectURL(new Blob([src], { type: 'text/javascript' })); w = new Worker(url); w.onmessage = function (e) { done(w, e.data); }; w.onerror = function (e) { failAll(new Error('helper worker failed: ' + (e && e.message))); }; w.post = function (m, t) { w.postMessage(m, t); }; w.kill = function () { w.terminate(); }; }
      else { W = W || require('worker_threads').Worker; w = new W(src, { eval: true }); w.on('message', function (m) { done(w, m); }); w.on('error', failAll); w.post = function (m, t) { w.postMessage(m, t); }; w.kill = function () { w.terminate(); }; }
      w.busy = 0; return w;
    }
    var jobs = [], active = 0, wake = null;
    function failAll(e) { pending.forEach(function (p) { p.reject(e); }); pending.clear(); jobs.length = 0; }
    function done(w, m) { w.busy--; var p = pending.get(m.id); pending.delete(m.id); if (m.error) { if (p) p.reject(new Error(m.error)); } else if (p) p.resolve(m.F); pump(); }
    function pump() {
      while (jobs.length) {
        var w = null, q; for (q = 0; q < ws.length; q++) if (ws[q].busy < 2 && (!w || ws[q].busy < w.busy)) w = ws[q];
        if (!w) return;
        var j = jobs.shift(); w.busy++; w.post(j.m, [j.m.buf.buffer]);
      }
    }
    function submit(m) { return new Promise(function (resolve, reject) { m.id = nextJob++; pending.set(m.id, { resolve: resolve, reject: reject }); jobs.push({ m: m }); pump(); }); }
    for (i = 0; i < size; i++) ws.push(spawn());
    function unpackPool(bytes, o) {
      o = o || {}; need(false);
      var file = openFile(bytes), rn = makeNestedReader(S.zdec), rf = makeFlatReader(S.zdec), range = o.range || null, want = null, k, n = file.blocks.length, i2;
      if (o.keys) { want = {}; for (k = 0; k < o.keys.length; k++) want[o.keys[k]] = 1; if (range) want[range.key] = 1; }
      var results = new Array(n), out = [];
      for (i2 = 0; i2 < n; i2++) (function (i) {
        if (!blockMayMatch(file, i, range)) { results[i] = Promise.resolve([]); return; }
        var b = file.blocks[i], kd = b[4];
        if (b[0] + b[1] > file.footer.bodyEnd) { results[i] = Promise.reject(new Error('block ' + i + ' out of range')); return; }
        if (kd === 'r') { results[i] = Promise.resolve(keepRows(rawRows(readRawBlock(S.zdec, blockBytes(file, i))), range)); return; }
        results[i] = submit({ kind: kd, buf: file.bytes.slice(b[0], b[0] + b[1]), crc: b[2], want: kd === 'f' ? want : null }).then(function (F) {
          var r = kd === 'f' ? rf.assemble(F, want) : rn.assemble(F);
          if (want && kd !== 'f') r = projectRows(r, want);
          r = keepRows(r, range);
          if (o.keys && range && o.keys.indexOf(range.key) < 0) r = projectRows(r, wantOf(o.keys));
          return r;
        });
      })(i2);
      // blocks are assembled in the order they finish; the result list is in block order
      return Promise.all(results).then(function (all) { for (var a = 0; a < all.length; a++) for (var j = 0; j < all[a].length; j++) out.push(all[a][j]); return out; });
    }
    function wantOf(keys) { var w = {}; keys.forEach(function (k) { w[k] = 1; }); return w; }
    return Promise.resolve({ size: size, unpack: unpackPool, close: function () { ws.forEach(function (w) { w.kill(); }); if (url) URL.revokeObjectURL(url); } });
  }
