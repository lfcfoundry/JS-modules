// Copyright (c) 2026 LFC Foundry. MIT License. Part of memory-compression.js; build.py joins the pieces in src/ (this line is left out of the built file).

  // ================================================================ keeper: named data that is held packed, restored on demand and let go of when memory is tight
  // heapInfo(): what the page can tell about memory. Firefox and Safari tell nothing, so the keeper's own accounting (memory()) is what to rely on there.
  function heapInfo() {
    var m = typeof performance !== 'undefined' && performance && performance.memory, d = typeof navigator !== 'undefined' && navigator ? navigator.deviceMemory : undefined;
    return { usedJSHeap: m ? m.usedJSHeapSize : null, jsHeapLimit: m ? m.jsHeapSizeLimit : null, deviceMemoryGB: d || null, source: m ? 'performance.memory' : 'none' };
  }
  // estimateBytes(value): roughly how many bytes the value takes as live JavaScript objects (an estimate, usually within a third): 16 bytes of header and 8 per property or element,
  // 8 per number that is not a small whole number, strings by length, typed arrays exactly. Arrays of 200 or more objects are sampled.
  // A string that shows up again costs nothing more (the same string is shared); head is what a string costs besides its characters (16, or 32 for a long string cut out of a bigger one).
  function estimateBytes(value, head) {
    var seen = new Set(), seenS = new Set(), hs = head || 16;
    function walk(v, depth) {
      var t = typeof v, b, k, i, n, keys, step, sum;
      if (t === 'number') return v === (v | 0) ? 0 : 8;
      if (t === 'string') { if (v.length === 0 || seenS.has(v)) return 0; if (seenS.size < 4096) seenS.add(v); return (v.length >= 13 ? hs : 16) + v.length; }
      if (t === 'bigint') return 16;
      if (v === null || t !== 'object' || depth > 40) return 0;
      if (seen.has(v)) return 0;
      seen.add(v);
      if (ArrayBuffer.isView(v)) return 16 + v.byteLength;
      if (Array.isArray(v)) {
        n = v.length; b = 16 + 8 * n; step = n >= 200 ? Math.floor(n / 100) : 1; sum = 0;
        for (i = 0, k = 0; i < n; i += step, k++) sum += walk(v[i], depth + 1);
        return b + (step > 1 ? sum * step : sum);
      }
      if (v instanceof Map || v instanceof Set) { b = 32; v.forEach(function (x, y) { b += 16 + walk(x, depth + 1) + (v instanceof Map ? walk(y, depth + 1) : 0); }); return b; }
      keys = Object.keys(v); b = 16 + 8 * keys.length;
      for (i = 0; i < keys.length; i++) b += walk(v[keys[i]], depth + 1);
      return b;
    }
    return Math.round(walk(value, 0));
  }
  // ---- restoring in slices: a packed array of objects is opened as a view, one column at a time, then the objects are made a few thousand at a time, with the page free in between.
  // (A worker was tried: the finished objects have to be copied back to the page, which stalled it longer than unpacking on the page did, so there is none.)
  var yieldChannel = null;
  function later(fn) {
    if (typeof setImmediate === 'function') setImmediate(fn);                       // Node: a message port would keep the process from exiting
    else if (typeof MessageChannel === 'function') {
      if (!yieldChannel) { yieldChannel = new MessageChannel(); yieldChannel.queue = []; yieldChannel.port1.onmessage = function () { var f = yieldChannel.queue.shift(); if (f) f(); }; }
      yieldChannel.queue.push(fn); yieldChannel.port2.postMessage(0);
    } else setTimeout(fn, 0);
  }
  function unpackInSlices(bytes, popts, sliceMs) {      // a promise of the unpacked value, or null when the bytes are not a packed array of objects that share their keys
    var vw, keys, n, out, q = 0, i = 0, g;
    try { vw = view(bytes, popts); } catch (e) { return null; }
    keys = vw.keys; n = vw.length; out = new Array(n);
    return new Promise(function (resolve, reject) {
      function step() {
        var t0 = performance.now(), j;
        try {
          while (q < keys.length) { vw.field(0, keys[q++]); if (performance.now() - t0 >= sliceMs) { later(step); return; } }
          if (!g) g = vw.get;
          while (i < n) {
            for (j = 0; j < 512 && i < n; j++, i++) out[i] = g(i);
            if (i < n && performance.now() - t0 >= sliceMs) { later(step); return; }
          }
        } catch (e) { reject(e); return; }
        vw.release(); resolve(out);
      }
      later(step);
    });
  }

  // keeper(opts): opts.budget (bytes the keeper may hold, packed and restored together; 0 = no limit), opts.onPressure(level, memory) called when a level changes,
  // and any pack option (mode, picker, fsst, front, refs, wasm ...) used when packing. Methods: hold, get, restore, view, column, touch, has, drop, release, trim, pin, unpin,
  // calibrate, memory, level, names, adopt, bytes.
  function keeper(opts) {
    var items = new Map(), clock = 0, o = opts || {}, budget = o.budget > 0 ? o.budget : 0, lastLevel = 0, K, packOpts = {}, k, factor = 1, rate = 40, rateKnown = false;
    for (k in o) if (k !== 'budget' && k !== 'onPressure') packOpts[k] = o[k];
    function need(name) { var e = items.get(name); if (!e) jfail('nothing is held under the name ' + name); return e; }
    function restoredOf(e) { return Math.round(((e.value !== undefined ? e.heap : 0) + (e.view ? e.view.memory().restored : 0)) * factor); }
    function restoreMsOf(e) { return e.restoreMs !== undefined ? e.restoreMs : Math.round(e.bytes.length / 1e6 * rate * 10) / 10; }
    function noteRestore(e, ms) {              // remembers how long a restore took, and uses it to guess for the items not yet restored
      e.restoreMs = Math.round(ms * 10) / 10;
      if (e.bytes.length > 100000) { rate = rateKnown ? (rate + ms / (e.bytes.length / 1e6)) / 2 : ms / (e.bytes.length / 1e6); rateKnown = true; }
    }
    function totals() {
      var packed = 0, restored = 0, list = {};
      items.forEach(function (e, name) {
        var r = restoredOf(e); packed += e.bytes.length; restored += r;
        list[name] = { packed: e.bytes.length, restored: r, rows: e.rows, used: e.used, pinned: e.pins, restoreMs: restoreMsOf(e), restoreMsMeasured: e.restoreMs !== undefined, restoredBy: e.by };
      });
      return { packed: packed, restored: restored, total: packed + restored, budget: budget, factor: factor, items: list };
    }
    function levelOf(t) {
      var lv = 0, h = heapInfo();
      if (budget) lv = t.total >= budget ? 2 : t.total >= budget * 0.7 ? 1 : 0;
      if (h.usedJSHeap && h.jsHeapLimit) lv = Math.max(lv, h.usedJSHeap >= h.jsHeapLimit * 0.8 ? 2 : h.usedJSHeap >= h.jsHeapLimit * 0.6 ? 1 : 0);
      return lv;
    }
    function letGo(e) { e.value = undefined; if (e.view) { e.view.release(); e.view = null; } }
    function trimTo(target, keep) {      // let go of restored copies, least recently used first, until the total is at or under target; pinned items stay
      var t = totals(), freed = 0, order = [];
      items.forEach(function (e, name) { if (name !== keep && !e.pins && restoredOf(e) > 0) order.push(e); });
      order.sort(function (a, b) { return a.used - b.used; });
      order.forEach(function (e) {
        var r;
        if (t.total - freed <= target) return;
        r = restoredOf(e); letGo(e); freed += r;
      });
      return freed;
    }
    function check(keep) {
      var t = totals(), lv;
      if (budget && t.total > budget) { trimTo(budget, keep); t = totals(); }
      lv = levelOf(t);
      if (lv !== lastLevel) { lastLevel = lv; if (typeof o.onPressure === 'function') o.onPressure(lv, t); }
    }
    function install(e, name, v, ms, by) {
      e.value = v; e.used = ++clock; e.by = by; noteRestore(e, ms); check(name);
      return v;
    }
    K = {
      hold: function (name, value, popts) {            // packs value and keeps only the packed form: the caller lets go of its own copy
        var e = items.get(name) || { name: name, pins: 0 }, po = {}, kk;
        for (kk in packOpts) po[kk] = packOpts[kk]; if (popts) for (kk in popts) po[kk] = popts[kk];
        e.bytes = pack(value, po); e.value = undefined; e.view = null; e.heap = estimateBytes(value); e.rows = Array.isArray(value) ? value.length : undefined; e.used = ++clock;
        e.restoreMs = undefined; e.by = undefined; e.opts = po;
        items.set(name, e); check(name);
        return { packed: e.bytes.length, heap: Math.round(e.heap * factor) };
      },
      adopt: function (name, bytes, restoredHeap) {     // keeps bytes packed elsewhere (made by pack(), perhaps in a worker); restoredHeap is the live size of the value they hold, if known
        var e = items.get(name) || { name: name, pins: 0 };
        e.bytes = bytes; e.value = undefined; e.view = null; e.heap = restoredHeap > 0 ? restoredHeap : bytes.length * 6; e.rows = undefined; e.used = ++clock; e.restoreMs = undefined; e.by = undefined; e.opts = {};
        items.set(name, e); check(name);
        return { packed: bytes.length, heap: Math.round(e.heap * factor) };
      },
      bytes: function (name) { return need(name).bytes; },       // the packed bytes themselves (to hand to another worker or to store)
      has: function (name) { return items.has(name); },
      names: function () { return Array.from(items.keys()); },
      touch: function (name) { need(name).used = ++clock; },
      get: function (name) {                           // the value, restored now (the page waits) the first time and kept until released or trimmed
        var e = need(name), t0;
        if (e.value === undefined) { t0 = performance.now(); install(e, name, unpack(e.bytes, packOpts), performance.now() - t0, 'page'); }
        else { e.used = ++clock; check(name); }
        return e.value;
      },
      restore: function (name, ropts) {                // a promise of the value, restored in slices of about ropts.sliceMs (default 8) so the page stays free; same value as get()
        var e = items.get(name), b, t0, ms = ropts && ropts.sliceMs > 0 ? ropts.sliceMs : 8, sl;
        if (!e) return Promise.reject(new Error('MemoryCompressionJSO: nothing is held under the name ' + name));
        if (e.value !== undefined) { e.used = ++clock; return Promise.resolve(e.value); }
        if (e.pending) return e.pending;
        b = e.bytes; t0 = performance.now();
        sl = unpackInSlices(b, packOpts, ms);
        e.pending = (sl ? sl.then(function (v) { return { v: v, by: 'slices' }; }) : new Promise(function (res, rej) { later(function () { try { res({ v: unpack(b, packOpts), by: 'page' }); } catch (x) { rej(x); } }); })).then(function (r) {
          e.pending = null;
          if (items.get(name) !== e || e.bytes !== b) return items.has(name) ? K.restore(name, ropts) : r.v;       // replaced or dropped meanwhile
          if (e.value !== undefined) return e.value;
          return install(e, name, r.v, performance.now() - t0, r.by);
        }, function (err) { e.pending = null; throw err; });
        return e.pending;
      },
      each: function (name, fn, eopts) {               // a promise that calls fn(objects, firstRow) for each run of rows (default 2,048 rows) of a packed array of objects, with the page free in between; the whole list is never made at once
        var e = items.get(name), vw, n, step, at = 0, q = 0, ms = eopts && eopts.sliceMs > 0 ? eopts.sliceMs : 8;
        if (!e) return Promise.reject(new Error('MemoryCompressionJSO: nothing is held under the name ' + name));
        step = eopts && eopts.chunk > 0 ? Math.floor(eopts.chunk) : 2048;
        try { vw = K.view(name); } catch (x) { return Promise.reject(x); }
        n = vw.length; e.used = ++clock;
        return new Promise(function (resolve, reject) {
          function run() {
            var t0 = performance.now();
            try {
              while (q < vw.keys.length) { vw.field(0, vw.keys[q++]); if (performance.now() - t0 >= ms) { later(run); return; } }       // the columns open one per step first
              while (at < n) {
                fn(vw.slice(at, Math.min(n, at + step)), at); at += step;
                if (at < n && performance.now() - t0 >= ms) { later(run); return; }
              }
            } catch (x) { reject(x); return; }
            check(name); resolve(n);
          }
          later(run);
        });
      },
      view: function (name) {                          // a view over the packed bytes (a packed array of 16 or more objects): columns open one at a time
        var e = need(name);
        if (!e.view) e.view = view(e.bytes, packOpts);
        e.used = ++clock; return e.view;
      },
      column: function (name, key) { var v = K.view(name), c = v.column(key); check(name); return c; },
      pin: function (name) { var e = need(name); e.pins++; return e.pins; },        // while pinned (a count: pin twice, unpin twice) the item is never trimmed or released by the keeper
      unpin: function (name) { var e = need(name); if (e.pins > 0) e.pins--; return e.pins; },
      drop: function (name, force) { var e = items.get(name); if (e && e.pins && !force) return false; items.delete(name); return true; },
      release: function (name, force) {                // lets go of the restored copy (and opened columns); the packed bytes stay. Pinned items stay unless force is true
        var e;
        if (name === undefined) { items.forEach(function (x) { if (!x.pins || force) letGo(x); }); return true; }
        e = need(name); if (e.pins && !force) return false;
        letGo(e); return true;
      },
      trim: function (target) { var f = trimTo(target === undefined ? budget : target); check(); return f; },
      calibrate: function (f) {                        // the number to multiply the live size of restored data by (a browser page can cost 2.5 times what a plain heap count says); no argument = read it
        if (f === undefined) return factor;
        if (typeof f !== 'number' || !(f > 0) || f > 100) jfail('calibrate() needs a number above 0 (and at most 100)');
        factor = f; check(); return factor;
      },
      memory: function () { return totals(); },
      level: function () { return levelOf(totals()); },
      heap: heapInfo
    };
    return K;
  }

  // profile(value, opts, repeats): times pack and unpack of a value and lists where the pack time and bytes go (the report option, column by column). For finding the slow part.
  function profile(value, opts, repeats) {
    var o = {}, kk, rep = [], best = 1e18, bestU = 1e18, bytes, i, t0, r = repeats > 0 ? repeats : 3;
    if (opts) for (kk in opts) o[kk] = opts[kk];
    for (i = 0; i < r; i++) {
      t0 = performance.now(); bytes = pack(value, o); t0 = performance.now() - t0; if (t0 < best) best = t0;
      t0 = performance.now(); unpack(bytes, o); t0 = performance.now() - t0; if (t0 < bestU) bestU = t0;
    }
    o.report = rep; pack(value, o);
    return { bytes: bytes.length, packMs: Math.round(best * 100) / 100, unpackMs: Math.round(bestU * 100) / 100, format: bytes[2], parts: rep };
  }
