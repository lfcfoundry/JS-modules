// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ helper workers: only byte work moves (CRC, zstd, number columns); strings and rows are built on the calling thread
  function workerSource(full) {
    return 'var JF = (' + jfFactory.toString() + ')(), ready = JF.init(' + (full ? '{}' : '{ readOnly: true }') + '), send, onMsg;\n' +
      'if (typeof self === "undefined" && typeof require === "function") { var wt = require("worker_threads"); send = function (m, t) { wt.parentPort.postMessage(m, t); }; wt.parentPort.on("message", function (m) { onMsg(m); }); }\n' +
      'else { send = function (m, t) { self.postMessage(m, t); }; self.onmessage = function (e) { onMsg(e.data); }; }\n' +
      'onMsg = function (m) { ready.then(function () { if (m.kind === "t") { JF._trimPacker(); return; } if (m.kind === "p") send({ id: m.id, started: true }, []); var r = JF._job(m); send(r.msg, r.transfer); }); };\n';
  }
  function runJob(m) {   // in a helper: { id, kind, buf, crc, want } -> { msg, transfer }
    try {
      if (m.kind === 'p') {   // pack one run of whole blocks: the slice is dropped as soon as it is packed
        var out = packMany([{ name: null, bytes: m.buf }], m.opts); m.buf = null;
        var f = openFile(out);
        return { msg: { id: m.id, bytes: out, bodyEnd: f.footer.bodyEnd, blocks: f.blocks, zone: f.zone, tail: (jsonSec(f.footer.sec[SEC_FLAGS]) || {}).tail, picked: m.opts && m.opts._picked }, transfer: [out.buffer] };
      }
      if (m.kind === 'w') return { msg: { id: m.id, warm: true }, transfer: [] };   // helper start-up only: the wasm is loaded by the time this answers
      var b = m.buf; if (crcJS(b, 0) !== m.crc) throw new Error('block ' + m.id + ' checksum mismatch');
      var F = m.kind === 'f' ? flatFrames(S.zdec, b, m.want, true) : nestedFrames(S.zdec, b);
      return { msg: { id: m.id, F: F }, transfer: m.kind === 'f' ? flatTransfer(F) : nestedTransfer(F) };
    } catch (e) { return { msg: { id: m.id, error: String(e && e.message || e) }, transfer: [] }; }
  }
  function tmNow() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
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
      var file = openFile(bytes), rn = makeNestedReader(S.zdec, sharedOf(file)), rf = makeFlatReader(S.zdec), range = o.range || null, want = null, k, n = file.blocks.length, i2;
      if (o.keys) { want = {}; for (k = 0; k < o.keys.length; k++) want[o.keys[k]] = 1; if (range) want[range.key] = 1; }
      var results = new Array(n), out = [], t0 = tmNow();
      for (i2 = 0; i2 < n; i2++) (function (i) {
        if ((o.table != null && (file.blocks[i][5] || 0) !== o.table) || !blockMayMatch(file, i, range)) { results[i] = Promise.resolve([]); return; }
        var b = file.blocks[i], kd = b[4];
        if (b[0] + b[1] > file.footer.bodyEnd) { results[i] = Promise.reject(new Error('block ' + i + ' out of range')); return; }
        if (kd === 'r') { results[i] = Promise.resolve(keepRows(rawRows(readRawBlock(S.zdec, blockBytes(file, i))), range)); return; }
        results[i] = submit({ kind: kd, buf: file.bytes.slice(b[0], b[0] + b[1]), crc: b[2], want: kd === 'f' ? want : null }).then(function (F) {
          var ta = tmNow(), r = kd === 'f' ? rf.assemble(F, want) : rn.assemble(F);
          if (want && kd !== 'f') r = projectRows(r, want);
          r = keepRows(r, range);
          if (o.keys && range && o.keys.indexOf(range.key) < 0) r = projectRows(r, wantOf(o.keys));
          if (o.timing) { o.timing.assembleMs = (o.timing.assembleMs || 0) + (tmNow() - ta); o.timing.lastBlockAt = tmNow() - t0; }   // optional timing: main-thread row building after the helpers return columns
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
    opts = packOpts(opts);
    return init().then(function () {
      var T0 = Date.now(), b = bytesOf(input), bb = opts.blockBytes || BLOCK_BYTES, cuts = [0], q = 0, e, nl, hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || (typeof require === 'function' && require('os').cpus().length) || 4;
      if (opts.balance && !opts.blockBytes) bb = Math.max(4 << 20, Math.min(bb, Math.ceil(b.length / Math.min(opts.workers || hc, 8))));   // experimental: about one block per helper; the file differs from pack() unless pack gets the same blockBytes
      if (opts.balance === 'even' && !opts.blockBytes) { var nb0 = Math.ceil(b.length / bb), w0 = Math.min(opts.workers || hc, 8); if (w0 > 1 && nb0 > 1) bb = Math.ceil(b.length / (Math.ceil(nb0 / w0) * w0)); }   // experimental: as many blocks as a whole number of rounds for the helpers, so none waits alone at the end; the file differs from pack() unless pack gets the same blockBytes
      while (q < b.length) { e = Math.min(b.length, q + bb); if (e < b.length) { nl = b.indexOf(10, e); e = nl < 0 ? b.length : nl + 1; } cuts.push(e); q = e; }
      var nb = cuts.length - 1, w = Math.min(opts.workers || hc, 8, nb), per = Math.ceil(nb / Math.max(1, w)), groups = [], g, dyn = opts.dynamic !== false;
      if (opts.exact || opts.share || w < 2) return pack(b, opts);   // exact mode, shared tables (one table built block after block) and small inputs stay on one thread
      if (dyn) for (g = 0; g < nb; g++) groups.push([cuts[g], cuts[g + 1]]);   // one job per block; a helper that finishes takes the next block, so the run does not wait on one slow run of blocks
      else for (g = 0; g < nb; g += per) groups.push([cuts[g], cuts[Math.min(nb, g + per)]]);
      var jopts = {}, k, tm = opts.timing; for (k in opts) if (k !== 'workers' && k !== 'timing') jopts[k] = opts[k];
      // per-path strings (see packMany): a long input lets group 0 try both layouts; the other groups start with per-path strings and are packed again
      // if group 0 picks the plain layout, so the file is the one pack() writes
      var pickWait = false, curPick = 1, sentWith = [], redo = [], parked = [];
      if (jopts.paths !== false && jopts.paths !== 'only' && jopts._pick == null) { if (b.length < PATHS_TRY * bb) jopts._pick = 1; else pickWait = true; }
      if (tm) { tm.cut = Date.now() - T0; tm.groups = []; }   // optional phase timing: ms from the call start, filled in as the run goes
      return new Promise(function (resolve, reject) {
        var ws = [], results = new Array(groups.length), left = groups.length, failed = false;
        function release(ok) {   // finished helpers wait 3 s for the next call (they already hold the loaded wasm); a failed run ends them
          if (!ok) { ws.forEach(function (x) { x.kill(); }); ws = []; }
          else ws.forEach(function (x) { x.post({ kind: 't' }, []); });   // a waiting helper gives back its packer memory (it keeps the compiled wasm and its zstd memory, so the next call is as fast)
          clearTimeout(idleTimer); idleHelpers = idleHelpers.concat(ws); ws = [];
          idleTimer = setTimeout(function () { idleHelpers.forEach(function (x) { x.kill(); }); idleHelpers = []; }, 3000); if (idleTimer.unref) idleTimer.unref();
        }
        function fail(err) { if (failed) return; failed = true; release(false); reject(err instanceof Error ? err : new Error(String(err && err.message || err))); }
        function onMsg(i, m, next, w2) {
          if (m.started) { if (tm) tm.groups[i].started = Date.now() - T0; if (next) { var n2 = next; next = null; n2(); } return; }
          if (m.error) { fail(new Error(m.error)); return; }
          if (tm) tm.groups[i].done = Date.now() - T0;
          if (pickWait && i === 0) {
            pickWait = false; curPick = m.picked === 0 ? 0 : 1;
            if (curPick === 0) { for (var j = 1; j < results.length; j++) if (results[j] && sentWith[j] !== 0) { results[j] = undefined; left++; redo.push(j); } while (redo.length && parked.length) give(parked.pop(), null); if (redo.length) { var w3 = takeHelper(); ws.push(w3); give(w3, null); } }
          } else if (!pickWait && sentWith[i] !== undefined && sentWith[i] !== curPick && i !== 0) { redo.push(i); if (w2) give(w2, null); return; }
          results[i] = m; if (w2 && (dyn || redo.length)) give(w2, null); if (--left === 0 && !failed) { release(true); try { var ts = Date.now(); var out = stitch(results, b.length, jopts); if (tm) { tm.stitchMs = Date.now() - ts; tm.total = Date.now() - T0; } resolve(out); } catch (er) { reject(er); } }
        }
        var nextGroup = 0, helpersStarted = 0;
        function give(w2, nx) {   // hand this helper the next job, or keep it for later calls when none is left
          if (failed) return;
          if (nextGroup >= groups.length && !redo.length) { if (w2) parked.push(w2); if (nx) nx(); return; }
          var i = redo.length ? redo.shift() : nextGroup++, t1 = Date.now(), slice = Uint8Array.prototype.slice.call(b, groups[i][0], groups[i][1]);
          if (tm) tm.groups[i] = { takeMs: 0, copyMs: Date.now() - t1, posted: Date.now() - T0, bytes: slice.length };
          w2.listen(function (m) { onMsg(i, m, nx, w2); }, fail);
          var jo = jopts; if (pickWait && i === 0) jo = Object.assign({}, jopts, { _tryFirst: true }); else if (jopts._pick == null) { jo = Object.assign({}, jopts, { _pick: curPick }); sentWith[i] = curPick; }
          w2.post({ id: i, kind: 'p', buf: slice, opts: jo }, [slice.buffer]);
        }
        function start() {   // helpers start one at a time: the next one starts when this one has its slice and has begun packing
          if (helpersStarted >= w || nextGroup >= groups.length || failed) return;
          helpersStarted++; var w2 = takeHelper(); ws.push(w2); give(w2, start);
        }
        start();
      });
    });
  }
  var idleHelpers = [], idleTimer = null, packUrl = null;
  // warmPack(n, { keepMs }): start n pack helpers now (default: as many as packParallel would use, at most 8) and keep them keepMs (default 10,000) for the next packParallel call, which then skips the helper start-up
  function warmPack(n, o) {
    return init().then(function () {
      var hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || (typeof require === 'function' && require('os').cpus().length) || 4, k = Math.min(n || hc, 8), keep = (o && o.keepMs) || 10000, made = [], i;
      clearTimeout(idleTimer); for (i = idleHelpers.length; i < k; i++) made.push(takeHelper());
      var all = idleHelpers.concat(made), pending = made.map(function (w2, j) { return new Promise(function (res, rej) { w2.listen(function (m) { if (m.error) rej(new Error(m.error)); else res(); }, rej); w2.post({ id: -1 - j, kind: 'w' }, []); }); });
      return Promise.all(pending).then(function () {
        idleHelpers = all; clearTimeout(idleTimer); idleTimer = setTimeout(function () { idleHelpers.forEach(function (x) { x.kill(); }); idleHelpers = []; }, keep); if (idleTimer.unref) idleTimer.unref();
        return all.length;
      });
    });
  }
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
      for (j = 0; j < r.blocks.length; j++) { bl = r.blocks[j]; blocks.push([bl[0] + off].concat(bl.slice(1))); rows += bl[3]; zone.push(r.zone[j]); }
      off += r.bodyEnd;
    }
    var tail = results[results.length - 1].tail;
    parts.push(writeFooter(S.zfull, [
      { id: SEC_HEADER, flags: 1, payload: te.encode(JSON.stringify({ rows: rows, blocks: blocks.length, writer: 'lfc-pack 0.1.5' })) },
      { id: SEC_BLOCKS, flags: 1, payload: te.encode(JSON.stringify(blocks)) },
      { id: SEC_ZONE, flags: 0, payload: te.encode(JSON.stringify(zone)) },
      { id: SEC_FLAGS, flags: 1, payload: te.encode(JSON.stringify({ exact: false, tail: tail })) }
    ].concat(metaSecs(jopts)), true));
    return concat(parts);
  }
