// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ helper workers: only byte work moves (CRC, zstd, number columns); strings and rows are built on the calling thread
  function workerSource(full) {
    return 'var JF = (' + jfFactory.toString() + ')(), ready = JF.init(' + (full ? '{}' : '{ readOnly: true }') + '), send, onMsg;\n' +
      'if (typeof self === "undefined" && typeof require === "function") { var wt = require("worker_threads"); send = function (m, t) { wt.parentPort.postMessage(m, t); }; wt.parentPort.on("message", function (m) { onMsg(m); }); }\n' +
      'else { send = function (m, t) { self.postMessage(m, t); }; self.onmessage = function (e) { onMsg(e.data); }; }\n' +
      'onMsg = function (m) { ready.then(function () { if (m.kind === "p") send({ id: m.id, started: true }, []); var r = JF._job(m); send(r.msg, r.transfer); }); };\n';
  }
  function runJob(m) {   // in a helper: { id, kind, buf, crc, want } -> { msg, transfer }
    try {
      if (m.kind === 'p') {   // pack one run of whole blocks: the slice is dropped as soon as it is packed
        var out = packMany([{ name: null, bytes: m.buf }], m.opts); m.buf = null;
        var f = openFile(out);
        return { msg: { id: m.id, bytes: out, bodyEnd: f.footer.bodyEnd, blocks: f.blocks, zone: f.zone, tail: (jsonSec(f.footer.sec[SEC_FLAGS]) || {}).tail }, transfer: [out.buffer] };
      }
      var b = m.buf; if (crcJS(b, 0) !== m.crc) throw new Error('block ' + m.id + ' checksum mismatch');
      var F = m.kind === 'f' ? flatFrames(S.zdec, b, m.want, true) : nestedFrames(S.zdec, b);
      return { msg: { id: m.id, F: F }, transfer: m.kind === 'f' ? flatTransfer(F) : nestedTransfer(F) };
    } catch (e) { return { msg: { id: m.id, error: String(e && e.message || e) }, transfer: [] }; }
  }
  function makePool(opts) {   // -> Promise of { unpack(bytes, opts), size, close() }
    opts = opts || {};
    var hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || (typeof require === 'function' && require('os').cpus().length) || 4;
    var size = opts.workers || Math.min(2, Math.max(1, hc - 1)), src = workerSource(), ws = [], i, url = null, W, inflight = [], pending = new Map(), nextJob = 0;
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
        if ((o.table != null && (file.blocks[i][5] || 0) !== o.table) || !blockMayMatch(file, i, range)) { results[i] = Promise.resolve([]); return; }
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

  // ---- block-parallel pack (opt-in): consecutive blocks are cut exactly where one thread would cut them, each helper packs its run, and the parts are joined behind one footer; the file is the same bytes the single-thread pack writes
  function packParallel(input, opts) {   // -> Promise of bytes
    opts = opts || {};
    return init().then(function () {
      var b = bytesOf(input), bb = opts.blockBytes || BLOCK_BYTES, cuts = [0], q = 0, e, nl, hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || (typeof require === 'function' && require('os').cpus().length) || 4;
      while (q < b.length) { e = Math.min(b.length, q + bb); if (e < b.length) { nl = b.indexOf(10, e); e = nl < 0 ? b.length : nl + 1; } cuts.push(e); q = e; }
      var nb = cuts.length - 1, w = Math.min(opts.workers || hc, 8, nb), per = Math.ceil(nb / Math.max(1, w)), groups = [], g;
      if (opts.exact || w < 2) return pack(b, opts);   // exact mode and small inputs stay on one thread
      for (g = 0; g < nb; g += per) groups.push([cuts[g], cuts[Math.min(nb, g + per)]]);
      var jopts = {}, k; for (k in opts) if (k !== 'workers') jopts[k] = opts[k];
      return new Promise(function (resolve, reject) {
        var ws = [], results = new Array(groups.length), left = groups.length, failed = false;
        function release(ok) {   // finished helpers wait 3 s for the next call (they already hold the loaded wasm); a failed run ends them
          if (!ok) { ws.forEach(function (x) { x.kill(); }); ws = []; }
          clearTimeout(idleTimer); idleHelpers = idleHelpers.concat(ws); ws = [];
          idleTimer = setTimeout(function () { idleHelpers.forEach(function (x) { x.kill(); }); idleHelpers = []; }, 3000); if (idleTimer.unref) idleTimer.unref();
        }
        function fail(err) { if (failed) return; failed = true; release(false); reject(err instanceof Error ? err : new Error(String(err && err.message || err))); }
        function onMsg(i, m, next) {
          if (m.started) { next(); return; }
          if (m.error) { fail(new Error(m.error)); return; }
          results[i] = m; if (--left === 0 && !failed) { release(true); try { resolve(stitch(results, b.length, jopts)); } catch (er) { reject(er); } }
        }
        function start(i) {   // helpers start one at a time: the next one starts when this one has its slice and has begun packing
          if (i >= groups.length || failed) return;
          var w2 = takeHelper(), slice = Uint8Array.prototype.slice.call(b, groups[i][0], groups[i][1]), nx = function () { start(i + 1); };
          w2.listen(function (m) { onMsg(i, m, nx); }, fail);
          w2.post({ id: i, kind: 'p', buf: slice, opts: jopts }, [slice.buffer]);
          ws.push(w2);
        }
        start(0);
      });
    });
  }
  var idleHelpers = [], idleTimer = null, packUrl = null;
  function takeHelper() {   // a helper kept from the last packParallel call, or a new one
    clearTimeout(idleTimer); if (idleHelpers.length) return idleHelpers.pop();
    var src = workerSource(true), w;
    if (typeof Worker === 'function') {
      packUrl = packUrl || URL.createObjectURL(new Blob([src], { type: 'text/javascript' })); w = new Worker(packUrl);
      w.listen = function (onm, one) { w.onmessage = function (ev) { onm(ev.data); }; w.onerror = function (ev) { one(new Error('helper worker failed: ' + (ev && ev.message))); }; };
      w.post = function (m, t) { w.postMessage(m, t); }; w.kill = function () { w.terminate(); };
    } else {
      w = new (require('worker_threads').Worker)(src, { eval: true });
      w.listen = function (onm, one) { w.removeAllListeners('message'); w.removeAllListeners('error'); w.on('message', onm); w.on('error', one); };
      w.post = function (m, t) { w.postMessage(m, t); }; w.kill = function () { w.terminate(); };
    }
    return w;
  }
  function stitch(results, inLen, jopts) {   // join the packed runs, renumber the block table, write the footer as pack does
    var parts = [], blocks = [], zone = [], off = 0, rows = 0, i, j, r, bl;
    for (i = 0; i < results.length; i++) {
      r = results[i]; parts.push(r.bytes.subarray(0, r.bodyEnd));
      for (j = 0; j < r.blocks.length; j++) { bl = r.blocks[j]; blocks.push([bl[0] + off, bl[1], bl[2], bl[3], bl[4], bl[5]]); rows += bl[3]; zone.push(r.zone[j]); }
      off += r.bodyEnd;
    }
    var tail = results[results.length - 1].tail;
    parts.push(writeFooter(S.zfull, [
      { id: SEC_HEADER, flags: 1, payload: te.encode(JSON.stringify({ rows: rows, blocks: blocks.length, writer: 'lfc-pack 0.1.5' })) },
      { id: SEC_BLOCKS, flags: 1, payload: te.encode(JSON.stringify(blocks)) },
      { id: SEC_ZONE, flags: 0, payload: te.encode(JSON.stringify(zone)) },
      { id: SEC_FLAGS, flags: 1, payload: te.encode(JSON.stringify({ exact: false, tail: tail })) }
    ], true));
    return concat(parts);
  }
