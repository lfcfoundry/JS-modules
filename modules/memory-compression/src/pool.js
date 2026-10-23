// Copyright (c) 2026 LFC Foundry. MIT License. Part of memory-compression.js; build.py joins the pieces in src/ (this line is left out of the built file).

  // ================================================================ packAsync's workers
  // makePool({ size }): workers that run the number picker for packAsync(value, { workers: pool }). Each worker is this same file loaded from a blob: URL, so a page that sets a content-security-policy
  // needs worker-src blob: for it. Without Worker, or when new Worker() throws, pool.run answers on the page; when a worker is blocked later (the error event) or goes silent for 10 s, the waiting runs reject and packAsync packs the plain way, so the bytes never differ and the promise always settles. pool.close() ends the workers.
  function makePool(opts) {
    opts = opts || {};
    var cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency || 4, size = opts.size > 0 ? Math.floor(opts.size) : Math.max(1, Math.min(3, cores - 1)), ws = [], url = null, pending = {}, nextId = 1, watchdog = opts.timeout > 0 ? opts.timeout : 10000, usable = typeof Worker === 'function' && typeof Blob === 'function' && typeof URL === 'function' && typeof URL.createObjectURL === 'function';
    function fail(why) {                                           // a worker could not start, was blocked (content-security-policy), crashed or went silent: this pool answers on the page from now on, and every waiting run rejects so packAsync packs the plain way
      var id, p, k;
      usable = false;
      for (k = 0; k < ws.length; k++) { try { ws[k].terminate(); } catch (x) { } }
      ws = [];
      if (url) { try { URL.revokeObjectURL(url); } catch (x) { } url = null; }
      for (id in pending) { p = pending[id]; delete pending[id]; p.fail(why); }
    }
    function start() {
      var src, i, w;
      if (!usable || ws.length) return;
      try {
        src = 'var MC=' + unified.workerSource() + ';self.onmessage=function(ev){var d=ev.data,out=[],tr=[],i,r,b;for(i=0;i<d.jobs.length;i++){r=null;try{if(d.jobs[i].kind===1){r=MC.objects.cols(d.jobs[i].src,d.jobs[i].n,d.jobs[i].a,d.jobs[i].wopts);out.push({id:d.jobs[i].id,ctl:r.ctl,blob:r.blob,v5:r.v5});tr.push(r.ctl.buffer);tr.push(r.blob.buffer);continue;}r=MC.objects.adapt(d.jobs[i].src,d.jobs[i].mode,d.jobs[i].wasm);}catch(e){r=null;if(d.jobs[i].kind===1){out.push({id:d.jobs[i].id,fail:1});continue;}}if(r&&r.bytes){b=r.bytes.slice();out.push({id:d.jobs[i].id,bytes:b,z:r.z});tr.push(b.buffer);}else out.push({id:d.jobs[i].id,bytes:null,z:0});}self.postMessage({out:out},tr);};';
        url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
        for (i = 0; i < size; i++) {
          w = new Worker(url);
          w.onmessage = function (ev) { var o = ev.data.out, k, p; for (k = 0; k < o.length; k++) { p = pending[o[k].id]; if (p) { delete pending[o[k].id]; p.ok(o[k]); } } };
          w.onerror = function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); fail('worker error'); };      // a blocked blob: worker reports here, later than new Worker()
          w.onmessageerror = function () { fail('worker message error'); };
          ws.push(w);
        }
      } catch (err) { fail('no worker'); }
    }
    function run(jobs) {
      var order = [], load = [], mine = [], i, k, w, ps = [], rows = 0, timer = null, results = new Array(jobs.length), all;
      start();
      if (!usable || !ws.length) return Promise.resolve(jobs.map(function (j) { return j.kind === 1 ? colsFor(j.src, j.n, j.a, j.wopts) : adaptFor(j.src, j.mode, j.wasm); }));
      for (i = 0; i < jobs.length; i++) { order.push(i); rows += jobs[i].n; }
      order.sort(function (a, b) { return jobs[b].n - jobs[a].n; });
      for (w = 0; w < ws.length; w++) { load.push(0); mine.push([]); }
      for (k = 0; k < order.length; k++) { w = load.indexOf(Math.min.apply(null, load)); load[w] += jobs[order[k]].n; mine[w].push(order[k]); }
      for (w = 0; w < ws.length; w++) {
        if (!mine[w].length) continue;
        (function (w) {
          var msg = [], tr = [];
          mine[w].forEach(function (ix) {
            var id = nextId++; msg.push({ id: id, kind: jobs[ix].kind, src: jobs[ix].src, n: jobs[ix].n, a: jobs[ix].a, wopts: jobs[ix].wopts, mode: jobs[ix].mode, wasm: jobs[ix].wasm }); tr.push(jobs[ix].src.buffer);
            ps.push(new Promise(function (res, rej) { pending[id] = { fail: function (why) { rej(new Error('MemoryCompression pool: ' + why)); }, ok: function (o) { results[ix] = o.fail ? { fail: 1 } : o.ctl ? { ctl: o.ctl, blob: o.blob, v5: o.v5 } : { bytes: o.bytes || null, z: o.z }; res(); } }; }));
          });
          try { ws[w].postMessage({ jobs: msg }, tr); } catch (err) { fail('postMessage failed'); }
        })(w);
      }
      all = Promise.all(ps);
      timer = setTimeout(function () { fail('no answer from the workers'); }, watchdog + rows / 100);              // never wait for ever on a worker that was blocked without an error
      if (timer && timer.unref) timer.unref();
      return all.then(function (r) { clearTimeout(timer); return results; }, function (err) { clearTimeout(timer); throw err; });
    }
    function close() { fail('closed'); }
    return { run: run, close: close, start: start, size: size };
  }
