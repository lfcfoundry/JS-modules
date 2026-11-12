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
    // Byte accounting (since 0.9.0). Every job carries the byte size of the block it sends. "queued" = waiting for a helper; "in flight" = posted,
    // answer not yet back. A job's bytes are released when its answer arrives, when its call is cancelled, or when the pool fails; never when it
    // merely starts. Worker count limits jobs, not bytes: maxInflightBytes (opt) is the byte limit for posted jobs. A single block larger than
    // the limit still runs, alone, so a call never waits forever.
    var maxInflight = opts.maxInflightBytes > 0 ? opts.maxInflightBytes : Infinity;
    var st = { queuedJobs: 0, queuedBytes: 0, queuedCopyBytes: 0, inflightJobs: 0, inflightBytes: 0, peakInflightBytes: 0, peakHeldCopyBytes: 0, copiedBytes: 0, cancelledJobs: 0 };
    function held() { return st.queuedCopyBytes + st.inflightBytes; }
    function note() { if (st.inflightBytes > st.peakInflightBytes) st.peakInflightBytes = st.inflightBytes; if (held() > st.peakHeldCopyBytes) st.peakHeldCopyBytes = held(); }
    var jobs = [], active = 0, wake = null;
    function failAll(e) { pending.forEach(function (p) { p.reject(e); }); pending.clear(); jobs.length = 0; st.queuedJobs = st.queuedBytes = st.queuedCopyBytes = st.inflightJobs = st.inflightBytes = 0; }
    function done(w, m) {
      w.busy--; var p = pending.get(m.id); pending.delete(m.id);
      if (p) { st.inflightJobs--; st.inflightBytes -= p.bytes; }
      if (m.error) { if (p) p.reject(new Error(m.error)); } else if (p) p.resolve(m.F);
      pump();
    }
    function pump() {
      while (jobs.length) {
        var w = null, q; for (q = 0; q < ws.length; q++) if (ws[q].busy < 2 && (!w || ws[q].busy < w.busy)) w = ws[q];
        if (!w) return;
        var j = jobs[0];
        if (st.inflightJobs > 0 && st.inflightBytes + j.bytes > maxInflight) return;   // over the byte limit: wait for an answer (a job alone always runs)
        jobs.shift(); st.queuedJobs--; st.queuedBytes -= j.bytes;
        if (j.m.buf) st.queuedCopyBytes -= j.bytes; else { j.m.buf = j.make(); j.make = null; st.copiedBytes += j.bytes; }   // stable input: the private copy is made only now
        var p = pending.get(j.m.id); p.bytes = j.bytes; st.inflightJobs++; st.inflightBytes += j.bytes; note();
        w.busy++; w.post(j.m, [j.m.buf.buffer]);
      }
    }
    // make: returns the private copy; called at once (default) or at dispatch (stable input). call: the unpack call's record, for cancelling.
    function submit(m, bytes, make, lazy, call) {
      return new Promise(function (resolve, reject) {
        m.id = nextJob++; pending.set(m.id, { resolve: resolve, reject: reject, bytes: 0, call: call });
        var j = { m: m, bytes: bytes, make: make, call: call };
        if (!lazy) { m.buf = make(); j.make = null; st.copiedBytes += bytes; st.queuedCopyBytes += bytes; }
        jobs.push(j); st.queuedJobs++; st.queuedBytes += bytes; note(); pump();
      });
    }
    function cancel(call, err) {   // drop this call's queued jobs now; its posted jobs finish in their helper and their answers are dropped
      for (var q = jobs.length - 1; q >= 0; q--) {
        var j = jobs[q]; if (j.call !== call) continue;
        jobs.splice(q, 1); st.queuedJobs--; st.queuedBytes -= j.bytes; if (j.m.buf) st.queuedCopyBytes -= j.bytes; j.m.buf = null; st.cancelledJobs++;
        var p = pending.get(j.m.id); pending.delete(j.m.id); if (p) p.reject(err);
      }
      pending.forEach(function (p, id) { if (p.call === call && !p.dropped) { p.dropped = true; var r = p.reject; p.resolve = p.reject = function () {}; r(err); } });
    }
    for (i = 0; i < size; i++) ws.push(spawn());
    function unpackPool(bytes, o) {
      o = o || {}; need(false);
      var file = openFile(bytes), rn = makeNestedReader(S.zdec, sharedOf(file)), rf = makeFlatReader(S.zdec), range = o.range || null, want = null, k, n = file.blocks.length, i2;
      if (o.keys) { want = {}; for (k = 0; k < o.keys.length; k++) want[o.keys[k]] = 1; if (range) want[range.key] = 1; }
      var results = new Array(n), out = [], t0 = tmNow(), call = {}, signal = o.signal || null, lazy = !!o.stable;   // stable: true = the caller keeps these bytes unchanged until the call settles, so private copies are made only when a block is sent
      if (signal && signal.aborted) return Promise.reject(abortError(signal));
      for (i2 = 0; i2 < n; i2++) (function (i) {
        if ((o.table != null && (file.blocks[i][5] || 0) !== o.table) || !blockMayMatch(file, i, range)) { results[i] = Promise.resolve([]); return; }
        var b = file.blocks[i], kd = b[4];
        if (b[0] + b[1] > file.footer.bodyEnd) { results[i] = Promise.reject(new Error('block ' + i + ' out of range')); return; }
        if (kd === 'r') { results[i] = Promise.resolve(keepRows(rawRows(readRawBlock(S.zdec, blockBytes(file, i))), range)); return; }
        // Buffer.slice aliases caller storage; workers must receive an owned block copy.
        var makeCopy = function () {
          return typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(file.bytes)
            ? new Uint8Array(file.bytes.buffer, file.bytes.byteOffset + b[0], b[1]).slice()
            : file.bytes.slice(b[0], b[0] + b[1]);
        };
        results[i] = submit({ kind: kd, buf: null, crc: b[2], want: kd === 'f' ? want : null }, b[1], makeCopy, lazy, call).then(function (F) {
          var ta = tmNow(), r = kd === 'f' ? rf.assemble(F, want) : rn.assemble(F);
          if (want && kd !== 'f') r = projectRows(r, want);
          r = keepRows(r, range);
          if (o.keys && range && o.keys.indexOf(range.key) < 0) r = projectRows(r, wantOf(o.keys));
          if (o.timing) { o.timing.assembleMs = (o.timing.assembleMs || 0) + (tmNow() - ta); o.timing.lastBlockAt = tmNow() - t0; }   // optional timing: main-thread row building after the helpers return columns
          return r;
        });
      })(i2);
      results.forEach(function (r) { r.catch(function () {}); });   // a cancelled call rejects once, below; its other block promises must not report unhandled
      var all0 = signal ? null : Promise.all(results);
      if (signal) all0 = new Promise(function (res, rej) {
        var onAbort = function () { var e = abortError(signal); cancel(call, e); rej(e); };
        signal.addEventListener('abort', onAbort, { once: true });
        Promise.all(results).then(function (v) { signal.removeEventListener('abort', onAbort); res(v); }, function (e) { signal.removeEventListener('abort', onAbort); rej(e); });
      });
      // blocks are assembled in the order they finish; the result list is in block order
      return all0.then(function (all) { for (var a = 0; a < all.length; a++) for (var j = 0; j < all[a].length; j++) out.push(all[a][j]); return out; });
    }
    function wantOf(keys) { var w = {}; keys.forEach(function (k) { w[k] = 1; }); return w; }
    function abortError(sg) { var r = sg && sg.reason; if (r instanceof Error) return r; var e = new Error('LfcPack: pool read cancelled'); e.name = 'AbortError'; return e; }
    function stats() { var o2 = {}, k2; for (k2 in st) o2[k2] = st[k2]; o2.heldCopyBytes = held(); o2.maxInflightBytes = maxInflight === Infinity ? 0 : maxInflight; return o2; }
    return Promise.resolve({ size: size, unpack: unpackPool, stats: stats, close: function () { ws.forEach(function (w) { w.kill(); }); if (url) URL.revokeObjectURL(url); } });
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
      // per-path strings (see packMany): in a long input, groups sent before group 0 answers each try both layouts on their first big block;
      // once group 0's pick is known, later groups follow it and an early group that picked the other way is packed again, so the file is the one pack() writes
      var pickWait = false, curPick = 1, sentWith = [], redo = [], parked = [], picked = [];
      if (jopts.paths === 'auto' && jopts._pick == null && !PATHS_RULE) { if (b.length < PATHS_TRY * bb) jopts._pick = 1; else if (PATHS_SAMPLE > 0) jopts._pick = samplePick(b, jopts); else pickWait = true; }
      if (tm) { tm.cut = Date.now() - T0; tm.groups = []; }   // optional phase timing: ms from the call start, filled in as the run goes
      return new Promise(function (resolve, reject) {
        var ws = [], results = new Array(groups.length), left = groups.length, failed = false;
        function release(ok) {   // finished helpers wait 3 s for the next call (they already hold the loaded wasm); a failed run ends them
          if (!ok) { ws.forEach(function (x) { x.kill(); }); ws = []; }
          else if (HELPER_TRIM_MS >= 0) { clearTimeout(trimTimer); trimTimer = setTimeout(function () { idleHelpers.forEach(function (x) { x.post({ kind: 't' }, []); }); }, HELPER_TRIM_MS); if (trimTimer.unref) trimTimer.unref(); }   // HELPER_TRIM_MS -1 (default): helpers keep their packer memory until they close 3 s after the last call; giving it back at once made every call grow it again (7-25% slower helper packs)
          idleHelpers = idleHelpers.concat(ws); ws = []; armIdle(3000);   // also after a failed run: helpers other calls left idle still get their closing time
        }
        function fail(err) { if (failed) return; failed = true; release(false); reject(err instanceof Error ? err : new Error(String(err && err.message || err))); }
        function onMsg(i, m, next, w2) {
          if (m.started) { if (tm) tm.groups[i].started = Date.now() - T0; if (next) { var n2 = next; next = null; n2(); } return; }
          if (m.error) { fail(new Error(m.error)); return; }
          if (tm) tm.groups[i].done = Date.now() - T0;
          if (sentWith[i] === 't') picked[i] = m.picked;
          if (pickWait && i === 0) {
            pickWait = false; curPick = m.picked === 0 ? 0 : 1;
            for (var j = 1; j < results.length; j++) if (results[j] && sentWith[j] === 't' && picked[j] != null && picked[j] !== curPick) { results[j] = undefined; left++; redo.push(j); }
            while (redo.length && parked.length) give(parked.pop(), null);
            if (redo.length) { var w3 = takeHelper(); ws.push(w3); give(w3, null); }
          } else if (!pickWait && i !== 0 && ((sentWith[i] === 't' && picked[i] != null && picked[i] !== curPick) || (sentWith[i] !== 't' && sentWith[i] !== undefined && sentWith[i] !== curPick))) { redo.push(i); if (w2) give(w2, null); return; }
          results[i] = m; if (w2 && (dyn || redo.length)) give(w2, null); if (--left === 0 && !failed) { release(true); try { var ts = Date.now(); var out = stitch(results, b.length, jopts); if (tm) { tm.stitchMs = Date.now() - ts; tm.total = Date.now() - T0; } resolve(out); } catch (er) { reject(er); } }
        }
        var nextGroup = 0, helpersStarted = 0;
        function give(w2, nx) {   // hand this helper the next job, or keep it for later calls when none is left
          if (failed) return;
          if (nextGroup >= groups.length && !redo.length) { if (w2) parked.push(w2); if (nx) nx(); return; }
          var i = redo.length ? redo.shift() : nextGroup++, t1 = Date.now(), slice = Uint8Array.prototype.slice.call(b, groups[i][0], groups[i][1]);
          if (tm) tm.groups[i] = { takeMs: 0, copyMs: Date.now() - t1, posted: Date.now() - T0, bytes: slice.length };
          w2.listen(function (m) { onMsg(i, m, nx, w2); }, fail);
          var jo = jopts; if (pickWait) { jo = Object.assign({}, jopts, { _tryFirst: true }); sentWith[i] = 't'; } else if (jopts._pick == null && jopts.paths === 'auto' && !PATHS_RULE) { jo = Object.assign({}, jopts, { _pick: curPick }); sentWith[i] = curPick; }
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
  var idleHelpers = [], idleTimer = null, trimTimer = null, HELPER_TRIM_MS = -1, packUrl = null;
  // packParallelStream(opts): block-parallel pack for text that arrives in pieces (a parser, a download). push(bytes) any number of times; finish() -> Promise of the file, the same bytes pack() writes.
  // A block is cut where pack cuts it (first line end at or after blockBytes), sent to a helper at once, and packed while later text is still being read; finish() joins the blocks behind one footer.
  // opts as packParallel (workers, blockBytes, level, meta, ...); exact and share are not supported (one table built block after block). push copies what it keeps, so the caller may reuse its buffer.
  function packParallelStream(opts) {
    opts = packOpts(opts);
    if (opts.exact) throw new Error('LfcPack: packParallelStream does not support exact mode');
    if (opts.share) throw new Error('LfcPack: packParallelStream does not support share (each helper would build its own tables); pass share: false');
    var hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || (typeof require === 'function' && require('os').cpus().length) || 4;
    var bb = opts.blockBytes || BLOCK_BYTES, maxW = Math.max(1, Math.min(opts.workers || hc, 8)), jopts = {}, k;
    for (k in opts) if (k !== 'workers' && k !== 'timing') jopts[k] = opts[k];
    var acc = new Uint8Array(0), plen = 0, scan = 0, total = 0, queue = [], results = [], jobs = 0, left = 0, helpers = [], free = [], failed = null, done = false, finishing = null, resolveFn = null, rejectFn = null;
    function release(ok) {
      if (!ok) { helpers.forEach(function (x) { x.kill(); }); helpers = []; free = []; }
      else { free.forEach(function (x) { idleHelpers.push(x); }); free = []; helpers = []; armIdle(3000); }
    }
    function fail(err) {
      if (failed) return; failed = err instanceof Error ? err : new Error(String(err && err.message || err)); release(false); queue = [];
      if (rejectFn) rejectFn(failed);
    }
    function give(w, i, chunk) {
      w.listen(function (m) {
        if (m.started) return;
        if (m.error) { fail(new Error(m.error)); return; }
        results[i] = m; left--;
        if (failed) return;
        if (queue.length) { var q = queue.shift(); give(w, q[0], q[1]); } else free.push(w);
        if (done && left === 0 && resolveFn) finishUp();
      }, fail);
      w.post({ id: i, kind: 'p', buf: chunk, opts: jopts }, [chunk.buffer]);   // chunk: a view of a buffer nothing else uses
    }
    function send(chunk) {
      var i = jobs++; left++; total += chunk.length;
      if (free.length) give(free.pop(), i, chunk);
      else if (helpers.length < maxW) { var w = takeHelper(); helpers.push(w); give(w, i, chunk); }
      else queue.push([i, chunk]);
    }
    function finishUp() {
      try { var out = stitch(results, total, jopts); release(true); resolveFn(out); } catch (e) { fail(e); }
    }
    return {
      push: function (bytes) {
        if (done) throw new Error('LfcPack: packParallelStream is finished');
        if (failed) throw failed;
        var b = bytesOf(bytes); if (!b.length) return;
        var need = plen + b.length;
        if (need > acc.length) { var g = new Uint8Array(Math.max(need, Math.min(bb + (bb >> 2) + 65536, Math.max(acc.length * 2, 65536)))); g.set(acc.subarray(0, plen)); acc = g; }   // grows to about one block; the text is copied once, here
        acc.set(b, plen); plen = need;
        while (plen >= bb) {
          var nl = acc.indexOf(10, Math.max(bb, scan));
          if (nl < 0 || nl >= plen) { scan = plen; return; }     // no line end yet: keep waiting, and do not look at these bytes again
          var cut = nl + 1, rest = plen - cut, next = new Uint8Array(Math.max(rest, 0) + 65536);
          next.set(acc.subarray(cut, plen));
          send(acc.subarray(0, cut));                           // the whole buffer goes to the helper (transferred, not copied again)
          acc = next; plen = rest; scan = 0;
        }
      },
      finish: function () {
        if (done) throw new Error('LfcPack: packParallelStream is finished');
        done = true;
        if (failed) return Promise.reject(failed);
        if (plen) { send(acc.subarray(0, plen)); acc = new Uint8Array(0); plen = 0; }
        if (!jobs) { done = true; return init().then(function () { return pack(new Uint8Array(0), opts); }); }
        return init().then(function () {
          return new Promise(function (resolve, reject) { resolveFn = resolve; rejectFn = reject; if (failed) reject(failed); else if (left === 0) finishUp(); });
        });
      }
    };
  }
  // warmPack(n, { keepMs }): start n pack helpers now (default: as many as packParallel would use, at most 8) and keep them keepMs (default 10,000) for the next packParallel call, which then skips the helper start-up
  function warmPack(n, o) {
    return init().then(function () {
      var hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || (typeof require === 'function' && require('os').cpus().length) || 4, k = Math.min(n || hc, 8), keep = (o && o.keepMs) || 10000, made = [], i;
      clearTimeout(idleTimer); for (i = idleHelpers.length; i < k; i++) made.push(newHelper());   // new ones only: taking idle ones here started too few
      var pending = made.map(function (w2, j) { return new Promise(function (res, rej) { w2.listen(function (m) { if (m.error) rej(new Error(m.error)); else res(); }, rej); w2.post({ id: -1 - j, kind: 'w' }, []); }); });
      return Promise.all(pending).then(function () {
        idleHelpers = idleHelpers.concat(made); armIdle(keep);   // the list as it is now: a call that ran meanwhile may have taken or given back helpers
        return idleHelpers.length;
      }, function (e) { made.forEach(function (x) { x.kill(); }); armIdle(keep); throw e; });
    });
  }
  function armIdle(ms) {   // one closing clock for the idle helpers only; busy helpers are never in idleHelpers, so it cannot end a running job
    clearTimeout(idleTimer); idleTimer = null; if (!idleHelpers.length) return;
    idleTimer = setTimeout(function () { idleTimer = null; idleHelpers.forEach(function (x) { x.kill(); }); idleHelpers = []; }, ms); if (idleTimer.unref) idleTimer.unref();
  }
  function takeHelper() {   // a helper kept from the last packParallel call, or a new one
    clearTimeout(idleTimer); idleTimer = null; clearTimeout(trimTimer); if (idleHelpers.length) return idleHelpers.pop();   // the call's release starts the closing clock again
    return newHelper();
  }
  function newHelper() {
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
    var parts = [], blocks = [], zone = [], off = 0, rows = 0, i, j, r, bl, fmin = 0;
    for (i = 0; i < results.length; i++) {
      r = results[i]; parts.push(r.bytes.subarray(0, r.bodyEnd)); if (r.bytes[r.bytes.length - 6] > fmin) fmin = r.bytes[r.bytes.length - 6];
      for (j = 0; j < r.blocks.length; j++) { bl = r.blocks[j]; blocks.push([bl[0] + off].concat(bl.slice(1))); rows += bl[3]; zone.push(r.zone[j]); }
      off += r.bodyEnd;
    }
    var tail = results[results.length - 1].tail;
    parts.push(writeFooter(S.zfull, [
      { id: SEC_HEADER, flags: 1, payload: te.encode(JSON.stringify({ rows: rows, blocks: blocks.length, writer: 'lfc-pack 0.1.5' })) },
      { id: SEC_BLOCKS, flags: 1, payload: te.encode(JSON.stringify(blocks)) },
      { id: SEC_ZONE, flags: 0, payload: te.encode(JSON.stringify(zone)) },
      { id: SEC_FLAGS, flags: 1, payload: te.encode(JSON.stringify({ exact: false, tail: tail })) }
    ].concat(metaSecs(jopts)), true, fmin));
    return concat(parts);
  }
