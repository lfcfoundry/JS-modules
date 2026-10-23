// Copyright (c) 2026 LFC Foundry. MIT License. Part of memory-compression.js; build.py joins the pieces in src/ (this line is left out of the built file).

  // ================================================================ pager: a long list kept packed in pages, opened one page at a time and let go of when memory is tight
  // pager(list, opts) packs the list in pages of opts.pageRows (default 2,048) rows. get(i) opens only the page that holds row i (a page opens in about 1 to 3 ms); a page that was only read
  // leaves memory for free (its packed bytes stay); an edited page is packed again first. opts.livePages (default 4) is how many opened pages may stay in memory, opts.readAhead (default true)
  // opens the next page in the background when rows are read in order, opts.auto (default true) steps the live pages down when the page's heap is close to its limit; every other
  // option is a pack option (mode, wasm ...) used for each page. Objects handed out by get() belong to their page: after that page leaves memory and comes back they are new objects,
  // so call changed(i) or set(i, value) for a row you changed. Shared objects between pages (refs) are not kept.
  // a store for spilled pages in the browser's IndexedDB: put(key, bytes), get(key), remove(key) all return promises (opts.spill can also be any object with these three)
  function idbStore(name) {
    var dbp = null;
    function db() {
      if (!dbp) dbp = new Promise(function (resolve, reject) {
        var rq;
        if (typeof indexedDB === 'undefined') { reject(new Error('MemoryCompressionJSO: this environment has no IndexedDB')); return; }
        rq = indexedDB.open(name || 'memory-compression-spill', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('pages'); };
        rq.onsuccess = function () { resolve(rq.result); }; rq.onerror = function () { reject(rq.error); };
      });
      return dbp;
    }
    function run(mode, f) {
      return db().then(function (d) {
        return new Promise(function (resolve, reject) {
          var tx = d.transaction('pages', mode), rq = f(tx.objectStore('pages'));
          tx.oncomplete = function () { resolve(rq && rq.result); }; tx.onerror = tx.onabort = function () { reject(tx.error); };
        });
      });
    }
    return {
      put: function (key, bytes) { return run('readwrite', function (st) { return st.put(bytes, key); }); },
      get: function (key) { return run('readonly', function (st) { return st.get(key); }).then(function (v) { if (!v) throw new Error('MemoryCompressionJSO: a spilled page is missing from storage'); return v instanceof Uint8Array ? v : new Uint8Array(v.buffer || v); }); },
      remove: function (key) { return run('readwrite', function (st) { return st.delete(key); }); }
    };
  }
  function coolWorker() {                 // a worker running this same file, or null when the page cannot make one
    var src, url, w;
    if (typeof Worker !== 'function' || typeof Blob !== 'function' || typeof URL === 'undefined' || !URL.createObjectURL) return null;
    try {
      src = 'var api = (' + mcFactory.toString() + ')(); onmessage = function (m) { var d = m.data, b; try { b = api.pack(api.unpack(d.bytes, d.po), d.co).slice(); postMessage({ bytes: b }, [b.buffer]); } catch (x) { postMessage({ error: String(x && x.message || x) }); } };';
      url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      w = new Worker(url); URL.revokeObjectURL(url);
      return w;
    } catch (x) { return null; }
  }
  // pager.plan(list, opts): picks pageRows, livePages and mode for a list from the size of its rows and the device's memory, and says why. A page is sized to about 512 KB of live objects (256 KB when
  // the device reports 2 or 3 GB, 128 KB below 2 GB), between 512 and 2,048 rows, so a page opens in about the same time (0.3 to 1.5 ms) whatever the rows hold. The live pages
  // are given about 2 MB (1 MB at 2 or 3 GB, 512 KB below 2 GB), between 2 and 8 pages. pageView is true when the sampled rows are nearly all numbers (pageView: 'auto' uses it). The mode stays fast unless the packed list alone would take more than a tenth of the page's memory
  // (opts.heapBytes, else the browser's heap limit, else 512 MB for each GB of device memory), then it is balanced (15 to 17% smaller packed, pages open 1.3 to 2.2 times slower). opts.deviceMemory overrides the reading.
  function pagerPlan(list, opts) {
    var o = opts || {}, n = list.length, h = heapInfo(), gb = o.deviceMemory || h.deviceMemoryGB || 4, step = n > 64 ? n / 64 : 1, sample = [], i, per, target, rows, live, budget, heap, packedEst, mode = 'fast', why, num, tot, x, q, pv;
    for (i = 0; i < n && sample.length < 64; i += step) sample.push(list[Math.floor(i)]);
    per = sample.length ? Math.max(8, estimateBytes(sample) / sample.length) : 64;
    target = gb >= 4 ? 524288 : gb >= 2 ? 262144 : 131072;
    rows = Math.max(512, Math.min(2048, Math.round(target / per / 256) * 256));
    live = Math.max(2, Math.min(8, Math.round((gb >= 4 ? 2097152 : gb >= 2 ? 1048576 : 524288) / (rows * per))));
    heap = o.heapBytes || h.jsHeapLimit || gb * 536870912; packedEst = n * per / 7;
    if (packedEst > heap / 10) mode = 'balanced';
    num = 0; tot = 0;
    for (i = 0; i < sample.length; i++) { x = sample[i]; if (x && typeof x === 'object' && !Array.isArray(x)) { for (q in x) { tot++; if (typeof x[q] === 'number' || typeof x[q] === 'boolean') num++; } } else { tot = 0; break; } }
    pv = tot > 0 && num >= tot * 0.9 && sample.length >= 16;                                  // rows that are (nearly) all numbers: the page can stay as columns, about half the memory of objects, opening 2 to 3 times faster
    why = 'about ' + Math.round(per) + ' bytes a row, ' + gb + ' GB device, a page of ' + rows + ' rows is about ' + Math.round(rows * per / 1024) + ' KB' + (mode === 'balanced' ? ', packed list over a tenth of the memory budget' : '');
    return { pageRows: n <= rows * 1.5 ? Math.max(1, n) : rows, livePages: live, mode: mode, pageView: pv, bytesPerRow: Math.round(per), why: why };
  }
  function pagerAuto(list, opts) {       // pageRows, livePages and mode set to 'auto' are filled in by pager.plan
    var o = opts || {}, a = o.pageRows === 'auto' || o.livePages === 'auto' || o.mode === 'auto' || o.pageView === 'auto', pl, k, c;
    if (!a || !Array.isArray(list)) return o;
    pl = pagerPlan(list, o); c = {};
    for (k in o) c[k] = o[k];
    if (o.pageRows === 'auto') c.pageRows = pl.pageRows;
    if (o.livePages === 'auto') c.livePages = pl.livePages;
    if (o.mode === 'auto') c.mode = pl.mode;
    if (o.pageView === 'auto') c.pageView = pl.pageView;
    return c;
  }
  function pager(list, opts) {
    var store, uid = Math.random().toString(36).slice(2, 10), o = pagerAuto(list, opts), rows = o.pageRows > 0 ? Math.floor(o.pageRows) : 2048, n = list.length, np = Math.ceil(n / rows), pages = new Array(np), maxLive = o.livePages >= 0 ? Math.floor(o.livePages) : 4,
      asView = !!o.pageView, coldOn = !!o.cold, coldAfter = o.coldAfter > 0 ? o.coldAfter : 3000, lastTouch = 0, coldTimer = null, coolBad = false, ahead = o.readAhead !== false && !o.pageView, auto = o.auto !== false, live = 0, clock = 0, lastPage = -2, level = 0, packOpts = {}, k, p, st = { pageIns: 0, pageOuts: 0, repacks: 0, hits: 0 }, P, factor = 1;
    packOpts.hints = {};                         // each column remembers which number ways won on earlier pages (every 4th pack still tries them all)
    for (k in o) if (k !== 'pageRows' && k !== 'livePages' && k !== 'readAhead' && k !== 'auto' && k !== 'onPressure' && k !== 'background' && k !== 'sliceMs' && k !== 'spill' && k !== 'spillAt' && k !== 'onError' && k !== 'deviceMemory' && k !== 'heapBytes' && k !== 'pageView' && k !== 'cold' && k !== 'coldAfter') packOpts[k] = o[k];
    if (!Array.isArray(list)) jfail('pager() needs an array');
    store = o.spill ? (o.spill === true ? idbStore() : o.spill) : null;
    function pkey(i) { return uid + ':' + i; }
    function fail(x) { if (typeof o.onError === 'function') o.onError(x); }
    function packPage(i) { return pack(list.slice(i * rows, Math.min(n, (i + 1) * rows)), packOpts); }
    for (p = 0; p < np; p++) {
      if (o.background) pages[p] = { bytes: null, rows: Math.min(rows, n - p * rows), value: list.slice(p * rows, Math.min(n, (p + 1) * rows)), dirty: true, used: 0, heap: 0, disk: false, stored: false };     // opened as they are; packed a slice at a time by settle()
      else pages[p] = { bytes: packPage(p), rows: Math.min(rows, n - p * rows), value: undefined, dirty: false, used: 0, heap: 0, disk: false, stored: false };
    }
    if (o.background) live = np;
    list = null;                                  // the pager keeps no reference to the caller's array: the caller can let go of it
    function limit() { return level >= 2 ? 0 : level === 1 ? maxLive >> 1 : maxLive; }
    function isOpen(e) { return e.value !== undefined || e.view !== undefined; }
    function pageOut(e) {
      if (e.view !== undefined) { e.view = undefined; live--; st.pageOuts++; return; }
      if (e.value === undefined) return;
      if (e.dirty) { e.bytes = pack(e.value, packOpts); e.rows = e.value.length; e.dirty = false; e.disk = false; e.cold = false; st.repacks++; }
      e.value = undefined; live--; st.pageOuts++;
    }
    function pageOutClean(e) { if (live > limit() && e.value !== undefined && !e.dirty) { e.value = undefined; live--; st.pageOuts++; } }
    function makeRoom(keep, room) {              // opens room pages' worth of space: the least recently used live pages go, except keep
      var best, i, e;
      while (live > Math.max(0, limit() - room)) {
        best = null;
        for (i = 0; i < np; i++) { e = pages[i]; if (isOpen(e) && i !== keep && (!best || e.used < best.used)) best = e; }
        if (!best) return;
        pageOut(best);
      }
    }
    function checkHeap() {
      var h = heapInfo(), lv = 0;
      if (h.usedJSHeap && h.jsHeapLimit) lv = h.usedJSHeap >= h.jsHeapLimit * 0.8 ? 2 : h.usedJSHeap >= h.jsHeapLimit * 0.6 ? 1 : 0;
      if (lv !== level) { level = lv; if (typeof o.onPressure === 'function') o.onPressure(lv, P.memory()); }
    }
    function openView(i) {                       // page i as columns (pageView): objects are made one row at a time; a page that cannot be shown this way is opened as objects
      var e = pages[i], vo = packOpts.wasm === false ? { wasm: false } : undefined;
      if (!e.bytes) jfail('page ' + i + ' is on disk: use await load(' + (i * rows) + ') or getAsync(' + (i * rows) + ') first');
      if (auto && (st.pageIns & 15) === 0) checkHeap();
      makeRoom(i, 1);
      try { e.view = view(e.bytes, vo); } catch (x) { e.view = undefined; return open(i); }
      live++; st.pageIns++; return e.view;
    }
    function open(i) {                           // the rows of page i, opened now if they are not
      var e = pages[i];
      if (e.value === undefined && e.view !== undefined) { e.view = undefined; live--; }       // a page shown as columns becomes objects when it is edited or read as a whole
      if (e.value === undefined) {
        if (!e.bytes) jfail('page ' + i + ' is on disk: use await load(' + (i * rows) + ') or getAsync(' + (i * rows) + ') first');
        if (auto && (st.pageIns & 15) === 0) checkHeap();
        makeRoom(i, 1);
        e.value = unpack(e.bytes, packOpts); live++; st.pageIns++;
        e.heap = e.value.length ? Math.round(estimateBytes(e.value) * factor) : 0;
      } else st.hits++;
      e.used = ++clock; return e.value;
    }
    function ahead1(i, d) {                      // d is 1 for a forward sweep and -1 for a backward one
      var j = i + d;
      if (j >= 0 && j < np && pages[j].value === undefined && limit() > 1) later(function () {
        var e = pages[j];
        if (!e || e.value !== undefined || limit() <= 1) return;
        if (e.bytes) open(j); else if (store) P.load(j * rows).catch(fail);        // a spilled page is fetched from storage
      });
    }
    function row(i) { if (!(i >= 0 && i < n)) jfail('row ' + i + ' is outside the list of ' + n); return i; }
    P = {
      get length() { return n; },
      get: function (i) {                       // the object at row i (opens its page if needed)
        var pi, v, e0;
        if (!(i >= 0 && i < n)) return undefined;
        pi = (i / rows) | 0;
        if (coldOn) lastTouch = performance.now();
        if (asView) {
          e0 = pages[pi];
          if (e0.value === undefined) { if (e0.view === undefined) openView(pi); if (e0.view !== undefined) { e0.used = ++clock; lastPage = pi; return e0.view.get(i - pi * rows); } }
        }
        v = open(pi)[i - pi * rows];
        if (ahead && (pi === lastPage + 1 || pi === lastPage - 1)) ahead1(pi, pi > lastPage ? 1 : -1);
        lastPage = pi; return v;
      },
      range: function (from, to) {              // rows from to to - 1 as an array
        var out = [], i, pi, v;
        from = Math.max(0, from | 0); to = Math.min(n, to === undefined ? n : to | 0);
        for (i = from; i < to; i += v.length) { pi = (i / rows) | 0; v = open(pi); v = v.slice(i - pi * rows, Math.min(v.length, to - pi * rows)); out.push.apply(out, v); }
        return out;
      },
      each: function (fn, eopts) {              // a promise: fn(objects, firstRow) for each page in order, the page free in between; pages that were closed are closed again (spilled pages are read from storage)
        var pi = 0, ms = eopts && eopts.sliceMs > 0 ? eopts.sliceMs : 8;
        return new Promise(function (resolve, reject) {
          function run() {
            var t0 = performance.now(), e, v;
            try {
              while (pi < np) {
                e = pages[pi];
                if (e.value === undefined && !e.bytes) {            // on disk: fetch, use, forget
                  store.get(pkey(pi)).then(function (b) { fn(unpack(b, packOpts), pi * rows); pi++; later(run); }).catch(reject); return;
                }
                v = e.value !== undefined ? e.value : unpack(e.bytes, packOpts);
                fn(v, pi * rows); pi++;
                if (pi < np && performance.now() - t0 >= ms) { later(run); return; }
              }
            } catch (x) { reject(x); return; }
            resolve(n);
          }
          later(run);
        });
      },
      set: function (i, value) { var pi = (row(i) / rows) | 0, e = pages[pi]; open(pi)[i - pi * rows] = value; e.dirty = true; },
      changed: function (i) { var pi = (row(i) / rows) | 0; if (asView) jfail('changed() cannot see a row that was read from a column page: use set(i, value)'); open(pi); pages[pi].dirty = true; },       // call after changing an object from get() in place
      push: function (value) {                  // adds a row at the end
        var last = pages[np - 1], v;
        if (!last || last.rows >= rows) { last = { bytes: null, rows: 0, value: [], dirty: true, used: ++clock, heap: 0, disk: false, stored: false }; pages[np++] = last; live++; makeRoom(np - 1, 0); }
        v = open(np - 1); v.push(value); last.rows = v.length; last.dirty = true; n++; return n;
      },
      flush: function () { var i, e; for (i = 0; i < np; i++) { e = pages[i]; if (e.dirty && e.value !== undefined) { e.bytes = pack(e.value, packOpts); e.rows = e.value.length; e.dirty = false; e.disk = false; e.cold = false; st.repacks++; } } },
      trim: function (keep) {                   // lets pages go until at most keep (default: the current limit) stay open
        var want = keep >= 0 ? keep : limit(), best, i, e;
        while (live > want) {
          best = null;
          for (i = 0; i < np; i++) { e = pages[i]; if (isOpen(e) && (!best || e.used < best.used)) best = e; }
          if (!best) break;
          pageOut(best);
        }
        return live;
      },
      release: function () { return P.trim(0); },
      pressure: function (lv) { level = lv > 0 ? (lv > 1 ? 2 : 1) : 0; P.trim(); if (level === 2 && store && o.spillAt !== false) P.spill().catch(fail); return level; },        // 0 = normal, 1 = half the live pages, 2 = none kept
      load: function (i) {                      // a promise of row i's page opened (fetched from storage first if it was spilled); then get() works for every row of that page
        var pi = (row(i) / rows) | 0, e = pages[pi];
        if (asView && e.bytes) return Promise.resolve(P);
        if (e.value !== undefined || e.bytes) { open(pi); return Promise.resolve(P); }
        return store.get(pkey(pi)).then(function (b) { e.bytes = b; e.disk = true; open(pi); return P; });
      },
      getAsync: function (i) { return i >= 0 && i < n ? P.load(i).then(function () { return P.get(i); }) : Promise.resolve(undefined); },
      spill: function (sopts) {                 // a promise: moves the packed bytes of every closed, unedited page to storage (a page already there only drops its memory copy); { all: true } closes the open pages first
        var i = 0, jobs = [], e;
        if (!store) return Promise.reject(new Error('MemoryCompressionJSO: pager() was made without the spill option'));
        if (sopts && sopts.all) P.trim(0);
        if (coldOn && !(sopts && sopts.cool === false)) return P.cool().then(function () { return P.spill({ cool: false }); });
        function one(pi, pe) {
          var b = pe.bytes;
          if (pe.disk) { pe.bytes = null; return Promise.resolve(); }
          return store.put(pkey(pi), b).then(function () { pe.stored = true; if (pe.bytes === b && pe.value === undefined) { pe.bytes = null; pe.disk = true; } });
        }
        for (; i < np; i++) { e = pages[i]; if (e.value === undefined && e.view === undefined && e.bytes && !e.dirty) jobs.push(one(i, e)); }
        return Promise.all(jobs).then(function () { return P; });
      },
      dispose: function () { var i, jobs = []; if (coldTimer !== null) { clearInterval(coldTimer); coldTimer = null; } if (store) for (i = 0; i < np; i++) if (pages[i].stored) { pages[i].stored = false; pages[i].disk = false; jobs.push(store.remove(pkey(i))); }; return Promise.all(jobs).then(function () { return P; }); },
      settle: function (sliceMs) {              // a promise: packs every edited page (and, with background: true, every page) a slice of about sliceMs (default 8) at a time, then lets pages go down to the limit
        var i = 0, ms = sliceMs > 0 ? sliceMs : o.sliceMs > 0 ? o.sliceMs : 8;
        return new Promise(function (resolve, reject) {
          function run() {
            var t0 = performance.now(), e, t1, cost = 0;                     // a page is only started when the slice has room for as long as the last one took
            try {
              while (i < np) {
                e = pages[i];
                if (e.dirty && e.value !== undefined) {
                  t1 = performance.now(); if (t1 - t0 + cost > ms && t1 > t0 + 0.01 && cost > 0) { later(run); return; }
                  e.bytes = pack(e.value, packOpts); e.rows = e.value.length; e.dirty = false; e.disk = false; e.cold = false; st.repacks++; pageOutClean(e); cost = Math.max(cost, performance.now() - t1);
                }
                i++;
              }
              P.trim();
            } catch (x) { reject(x); return; }
            resolve(P);
          }
          later(run);
        });
      },
      cool: function (copts) {                  // a promise: repacks every closed, unedited page smaller (mode balanced: about 16 to 19% fewer bytes, a page then opens 1.3 to 2.2 times slower). In a browser the packing runs in a background worker made from this same file (the page's CSP needs worker-src blob:), so the page's own thread only hands over and takes back the bytes; without a worker nothing is cooled (resolves with pages: 0). In Node it runs inline, a page at a time.
        var i = 0, co = {}, k2, done = 0, saved = 0, w = null, inline = typeof window === 'undefined' && typeof Worker !== 'function';
        for (k2 in packOpts) if (k2 !== 'hints') co[k2] = packOpts[k2];
        co.mode = 'balanced';
        if (!inline) { if (coolBad) return Promise.resolve({ pages: 0, saved: 0, worker: false }); w = coolWorker(); if (!w) return Promise.resolve({ pages: 0, saved: 0, worker: false }); }
        return new Promise(function (resolve, reject) {
          var replied = false;
          if (w) w.onerror = function (ev) {      // attached as soon as the worker exists: a page policy that blocks blob: workers reports it right after creation
            w.terminate();
            if (!replied) { coolBad = true; if (coldTimer !== null) { clearInterval(coldTimer); coldTimer = null; } resolve({ pages: 0, saved: 0, worker: false }); } else reject(new Error('MemoryCompressionJSO: the cooling worker failed'));
          };
          function finish() { if (w) w.terminate(); resolve({ pages: done, saved: saved, worker: !!w }); }
          function take(e, orig, b) {
            e.cold = true;
            if (b.length < orig.length && e.bytes === orig && !e.dirty) { saved += orig.length - b.length; e.bytes = b; e.disk = false; done++; }
          }
          function next() {
            var e, orig;
            while (i < np) { e = pages[i]; if (e.view === undefined && e.bytes && !e.dirty && !e.cold) break; i++; }
            if (i >= np) { finish(); return; }
            orig = e.bytes; i++;
            if (!w) { try { take(e, orig, pack(unpack(orig, packOpts), co)); } catch (x) { reject(x); return; } later(next); return; }
            w.onmessage = function (m) { replied = true; if (m.data.error) { w.terminate(); reject(new Error('MemoryCompressionJSO: ' + m.data.error)); return; } take(e, orig, m.data.bytes); next(); };
            var copy = orig.slice(); w.postMessage({ bytes: copy, po: packOpts, co: co }, [copy.buffer]);
          }
          later(next);
        });
      },
      calibrate: function (f) { if (f === undefined) return factor; factor = f; return factor; },
      memory: function () {
        var packed = 0, heap = 0, dirty = 0, spilled = 0, cold = 0, i, e;
        for (i = 0; i < np; i++) { e = pages[i]; packed += e.bytes ? e.bytes.length : 0; if (e.cold) cold++; if (!e.bytes && e.disk) spilled++; if (e.value !== undefined) heap += e.heap; else if (e.view !== undefined) heap += Math.round(e.view.memory().restored * factor); if (e.dirty) dirty++; }
        return { cold: cold, rows: n, pages: np, pageRows: rows, open: live, dirty: dirty, packed: packed, openHeap: heap, spilled: spilled, level: level, pageIns: st.pageIns, pageOuts: st.pageOuts, repacks: st.repacks, hits: st.hits };
      }
    };
    if (coldOn && typeof setInterval === 'function') {                    // after coldAfter ms without a read, closed pages are cooled in the background
      coldTimer = setInterval(function () { if (performance.now() - lastTouch >= coldAfter) P.cool().catch(fail); }, coldAfter);
      if (coldTimer && typeof coldTimer.unref === 'function') coldTimer.unref();
    }
    if (o.background) P.ready = P.settle();
    return P;
  }
  pager.plan = pagerPlan;
