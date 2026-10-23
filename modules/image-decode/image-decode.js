/*!
 * image-decode.js: turn a picture file (PNG, JPEG, WebP, AVIF, GIF) into something a canvas can draw, WITHOUT freezing the
 * page at the first draw. Picks the way that keeps the page moving in each browser, loads a list of pictures in order with a
 * small number at a time, and tells you whether the browser can read WebP or AVIF.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 1.2.0 (API 1)
 *
 *   ImageDecode.load(source[, { strategy: 'auto' }])   -> Promise of a drawable (an ImageBitmap or an Image), ready to drawImage
 *   ImageDecode.loadAll(list[, { concurrency: 2, onEach: function (drawable, index) {} }])  -> Promise of an array, same order
 *   ImageDecode.ahead(items[, { concurrency: 1, idle: 'idle' }])  -> a handle that decodes pictures in idle time before they are needed: get(key), ready(key), drawable(key), release(key), cancel()
 *   ImageDecode.supports('webp' | 'avif' | 'png' | 'jpeg')  -> Promise of true/false
 *   ImageDecode.pick({ avif: urlA, webp: urlB, png: urlC })  -> Promise of the first url the browser can read (best format first)
 *   ImageDecode.close(drawable)                              -> frees an ImageBitmap's memory (an Image needs nothing)
 *   ImageDecode.strategy                                     -> 'bitmap' or 'decode': the way 'auto' uses in this browser
 *   ImageDecode.create(env)                                  -> a separate copy that uses env instead of the page's own globals (tests)
 *
 * source is a Blob, an ArrayBuffer or typed array (the kind of picture is read from its first bytes), a data: address, or a
 * url (same site, or one the page may fetch). A data: address is turned into bytes in place, with no network request.
 *
 * Why two ways: a picture drawn for the first time is normally decoded right at that drawImage call, on the page's main
 * thread, and a 2048 x 2048 sheet freezes the page for 50 to 110 ms. Measured in the four test browsers (README has the
 * table): Chromium decodes off the main thread only through createImageBitmap ('bitmap'); an Image.decode() there is
 * decoded again at the first draw. Firefox and WebKit are the opposite: Image.decode() keeps the freeze at 1 to 11 ms, while
 * createImageBitmap there freezes the page for the whole decode. 'auto' therefore uses 'bitmap' in Chromium-family browsers
 * and 'decode' elsewhere. 'decode' reads the picture through a blob: address; if the page refuses that (no img-src blob:), the
 * module remembers it and goes through a background worker (WebKit family, needs worker-src blob:) and then a data: address
 * (needs img-src data:), and only then tries the other way ('bitmap') once before the promise rejects.
 *
 * Needs createImageBitmap or Image; without either, load() rejects with a plain message. No wasm: the browser's own decoder
 * is already native code, so there is nothing for wasm to speed up.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ImageDecode = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // One-pixel pictures, each made by an encoder, used only to ask "can this browser read the format?".
  var PROBES = {
    png: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4IScHAAK2AQU0pnWqAAAAAElFTkSuQmCC',
    webp: 'UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAdQjyLXo/+BiOh/AAA=',
    avif: 'AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADrbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAETAAAAKAAAAChpaW5mAAAAAAABAAAAGmluZmUCAAAAAAEAAGF2MDFDb2xvcgAAAABqaXBycAAAAEtpcGNvAAAAFGlzcGUAAAAAAAAAAQAAAAEAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAABdpcG1hAAAAAAAAAAEAAQQBAoMEAAAAMG1kYXQSAAoIGAAGiAhoNCAyGhlHh4Yhh5555oJAAJBBEdVElYPM3eMh23JA',
    jpeg: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDkKKKK8U/TD//Z'
  };
  var MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif' };

  // The kind of picture, from its first bytes. Returns '' when it is none of the five.
  function sniff(u8) {
    if (!u8 || u8.length < 12) return '';
    if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return 'png';
    if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return 'jpeg';
    if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x38) return 'gif';
    if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 && u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50) return 'webp';
    if (u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70) {   // "ftyp": the brand says avif
      var brand = String.fromCharCode(u8[8], u8[9], u8[10], u8[11]);
      if (brand === 'avif' || brand === 'avis') return 'avif';
    }
    return '';
  }

  function create(env) {
    env = env || {};
    var g = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : {});
    var cib = 'createImageBitmap' in env ? env.createImageBitmap : g.createImageBitmap && g.createImageBitmap.bind(g);
    var ImageCtor = 'Image' in env ? env.Image : g.Image;
    var URLApi = 'URL' in env ? env.URL : g.URL;
    var fetchFn = 'fetch' in env ? env.fetch : (g.fetch && g.fetch.bind(g));
    var atobFn = 'atob' in env ? env.atob : (g.atob && g.atob.bind(g));
    var BlobCtor = 'Blob' in env ? env.Blob : g.Blob;
    var ReaderCtor = 'FileReader' in env ? env.FileReader : g.FileReader;
    var nav = 'navigator' in env ? env.navigator : g.navigator;
    var ricFn = 'requestIdleCallback' in env ? env.requestIdleCallback : (g.requestIdleCallback && g.requestIdleCallback.bind(g));
    var timeoutFn = 'setTimeout' in env ? env.setTimeout : g.setTimeout.bind(g);

    // Chromium family (Chrome, Edge, Opera, ungoogled Chromium, Android WebView) decodes off the main thread through
    // createImageBitmap only; everything else (Firefox, Safari, WebKitGTK, GNOME Web) through Image.decode().
    function chromiumFamily() {
      var brands = nav && nav.userAgentData && nav.userAgentData.brands;
      if (brands && brands.length) { for (var i = 0; i < brands.length; i++) if (/chromium/i.test(brands[i].brand)) return true; return false; }
      var ua = (nav && nav.userAgent) || '';
      return /Chrome\/|Chromium\/|CriOS\//.test(ua) && !/Firefox\/|Edge\/\d|Epiphany|WebKitGTK/.test(ua);
    }
    var strategy = cib && (!ImageCtor || chromiumFamily()) ? 'bitmap' : (ImageCtor ? 'decode' : (cib ? 'bitmap' : ''));

    function toBlob(source) {
      if (BlobCtor && source instanceof BlobCtor) return Promise.resolve(source);
      var bytes = null;
      if (source instanceof ArrayBuffer) bytes = new Uint8Array(source);
      else if (source && source.buffer instanceof ArrayBuffer && typeof source.byteLength === 'number') bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
      if (bytes) return Promise.resolve(makeBlob(bytes));
      if (typeof source !== 'string') return Promise.reject(new Error('ImageDecode: the source must be a Blob, bytes, a data: address or a url'));
      var m = /^data:([^;,]*)((?:;[^;,]*)*?),/i.exec(source);
      if (m) {
        var rest = source.slice(m[0].length), isB64 = /;base64/i.test(m[2]), raw;
        try {
          if (isB64) { if (!atobFn) throw new Error('no atob'); raw = atobFn(rest.replace(/\s+/g, '')); } else raw = decodeURIComponent(rest);
        } catch (e) { return Promise.reject(new Error('ImageDecode: the data: address is not valid')); }
        var u8 = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i) & 255;
        return Promise.resolve(makeBlob(u8, m[1]));
      }
      if (!fetchFn) return Promise.reject(new Error('ImageDecode: this page cannot fetch a url'));
      return fetchFn(source).then(function (r) {
        if (!r.ok) throw new Error('ImageDecode: ' + source + ' answered ' + r.status);
        return r.blob();
      });
    }
    function makeBlob(u8, type) {
      var kind = sniff(u8);
      return new BlobCtor([u8], { type: kind ? MIME[kind] : (type || '') });
    }

    function viaBitmap(blob) {
      if (!cib) return Promise.reject(new Error('ImageDecode: createImageBitmap is not available'));
      return cib(blob);
    }
    // Image.decode() needs an address for the picture: a blob: address (cheap, but the page's Content-Security-Policy must
    // allow img-src blob:) or a data: address (made by FileReader, which needs img-src data:).
    var blobRefused = false;
    function toDataUrl(blob) {
      if (!ReaderCtor) return Promise.reject(new Error('ImageDecode: FileReader is not available'));
      return new Promise(function (res, rej) {
        var r = new ReaderCtor();
        r.onload = function () { res(r.result); };
        r.onerror = function () { rej(r.error || new Error('ImageDecode: the picture could not be read')); };
        r.readAsDataURL(blob);
      });
    }
    function decodeFrom(url, done) {
      var img = new ImageCtor();
      img.src = url;
      var ready = typeof img.decode === 'function' ? img.decode() : new Promise(function (res, rej) { img.onload = function () { res(); }; img.onerror = function () { rej(new Error('ImageDecode: the picture could not be read')); }; });
      return ready.then(function () { done(); return img; }, function (e) { done(); throw e; });
    }
    function viaBlobUrl(blob) {
      if (!URLApi || !URLApi.createObjectURL) return Promise.reject(new Error('ImageDecode: blob: addresses are not available'));
      var url = URLApi.createObjectURL(blob);
      return decodeFrom(url, function () { try { URLApi.revokeObjectURL(url); } catch (e) { /* ignore */ } });
    }
    function viaDataUrl(blob) {
      return toDataUrl(blob).then(function (url) { return decodeFrom(url, function () { /* nothing to free */ }); });
    }
    // A background worker that does createImageBitmap() for us (needs worker-src blob: in the page's policy). WebKit decodes
    // there without freezing the page; Firefox does not gain from it, so 'auto' only uses it for non-Firefox, non-Chromium engines.
    var workerState = null;   // null = not tried, a Worker, or false = refused or unavailable
    var jobs = {}, jobId = 0;
    var WORKER_CODE = 'onmessage=function(e){var d=e.data;createImageBitmap(d.b).then(function(m){postMessage({i:d.i,m:m},[m]);},function(x){postMessage({i:d.i,e:String(x&&x.message||x)});});};';
    function getWorker() {
      if (workerState !== null) return workerState;
      workerState = false;
      try {
        var W = 'Worker' in env ? env.Worker : g.Worker;
        if (!W || !cib || !URLApi || !URLApi.createObjectURL || !BlobCtor) return false;
        var u = URLApi.createObjectURL(new BlobCtor([WORKER_CODE], { type: 'text/javascript' }));
        var w = new W(u);
        try { URLApi.revokeObjectURL(u); } catch (e0) { /* ignore */ }
        w.onmessage = function (e) { var j = jobs[e.data.i]; if (!j) return; delete jobs[e.data.i]; if (e.data.m) j.res(e.data.m); else j.rej(new Error(e.data.e || 'ImageDecode: the worker could not read the picture')); };
        w.onerror = function () { workerState = false; var k; for (k in jobs) { jobs[k].rej(new Error('ImageDecode: the worker is not allowed or failed')); delete jobs[k]; } try { w.terminate(); } catch (e1) { /* ignore */ } };
        workerState = w;
      } catch (e) { workerState = false; }
      return workerState;
    }
    function viaWorker(blob) {
      var w = getWorker();
      if (!w) return Promise.reject(new Error('ImageDecode: a background worker is not available'));
      return new Promise(function (res, rej) { var i = ++jobId; jobs[i] = { res: res, rej: rej }; try { w.postMessage({ i: i, b: blob }); } catch (e) { delete jobs[i]; rej(e); } });
    }
    var isFirefox = /Firefox\/\d/.test((nav && nav.userAgent) || '');
    // Image.decode() routes in the order: blob: address; when the page refuses blob: pictures (no img-src blob:), a background
    // worker (non-Firefox engines) and then a data: address (needs img-src data:). What the page refused is remembered.
    function viaDecode(blob, address) {
      if (!ImageCtor) return Promise.reject(new Error('ImageDecode: Image is not available'));
      if (address === 'blob') return viaBlobUrl(blob);
      if (address === 'data') return viaDataUrl(blob);
      if (address === 'worker') return viaWorker(blob);
      var first;
      if (!blobRefused) first = viaBlobUrl(blob).catch(function (e1) { blobRefused = true; return Promise.reject(e1); });
      else first = Promise.reject(new Error('ImageDecode: blob: pictures are refused by the page'));
      return first.catch(function (e1) {
        var viaW = function () { return !isFirefox && workerState !== false ? viaWorker(blob) : Promise.reject(e1); };
        return viaW().catch(function () { return viaDataUrl(blob); }).catch(function () { throw e1; });
      });
    }

    // Load one picture. Resolves to a drawable. opts.strategy: 'auto' (default), 'bitmap' or 'decode'; opts.address (only for 'decode'): 'auto' (default), 'blob', 'data' or 'worker'.
    function load(source, opts) {
      var want = (opts && opts.strategy) || 'auto', first = want === 'auto' ? strategy : want, second = first === 'bitmap' ? 'decode' : 'bitmap';
      if (!first) return Promise.reject(new Error('ImageDecode: this browser has neither createImageBitmap nor Image'));
      return toBlob(source).then(function (blob) {
        var run = function (way) { return way === 'bitmap' ? viaBitmap(blob) : viaDecode(blob, (opts && opts.address) || 'auto'); };
        return run(first).catch(function (e1) {
          if (want !== 'auto') throw e1;
          return run(second).catch(function () { throw e1; });
        });
      });
    }

    // Load a list, in order, `concurrency` at a time (default 2), so the first pictures are ready first and the
    // browser is never handed the whole list at once. A picture that fails gives null in its place and does not stop the rest.
    function loadAll(list, opts) {
      opts = opts || {};
      var limit = Math.max(1, opts.concurrency || 2), out = new Array(list.length), next = 0, errors = [];
      return new Promise(function (resolve) {
        var running = 0, finished = 0;
        if (!list.length) return resolve(out);
        function pump() {
          while (running < limit && next < list.length) start(next++);
        }
        function start(i) {
          running++;
          load(list[i], opts).then(function (d) { out[i] = d; if (opts.onEach) try { opts.onEach(d, i); } catch (e) { /* the callback's own problem */ } },
            function (e) { out[i] = null; errors[i] = e; })
            .then(function () { running--; finished++; if (finished === list.length) { out.errors = errors; resolve(out); } else pump(); });
        }
        pump();
      });
    }


    // Decode ahead. ahead(items[, opts]) starts decoding pictures in the page's idle time, one at a time, before they are needed, and keeps the
    // result. items is an array of sources or an object { key: source } (an array uses 0, 1, 2 ... as keys). When the page asks for one with get(key)
    // it is usually already there, so a stage change draws at once. Returns { get(key) -> Promise of a drawable, ready(key) -> true when it is decoded,
    // drawable(key) -> the drawable or null, release(key) -> frees it (an ImageBitmap's memory), cancel() -> stops what has not started, count }.
    // opts: concurrency (default 1), idle ('idle' default: wait for an idle moment before each start, but at most `timeout` ms (default 300) on a page that never goes idle; 'now': start at once), onEach(drawable, key),
    // and strategy and address, which go to load(). A picture that fails rejects its get() and does not stop the rest. get() of a picture that has
    // not started starts it at once, ahead of the queue.
    function ahead(items, opts) {
      opts = opts || {};
      var keys = [], src = {}, st = {}, queue = [], running = 0, stopped = false, limit = Math.max(1, opts.concurrency || 1), waiting = false, i, k;
      if (Array.isArray(items)) { for (i = 0; i < items.length; i++) { keys.push(String(i)); src[i] = items[i]; } }
      else for (k in items) if (Object.prototype.hasOwnProperty.call(items, k)) { keys.push(k); src[k] = items[k]; }
      keys.forEach(function (key) { st[key] = { state: 'queued', value: null, promise: null }; queue.push(key); });
      function begin(key) {
        var e = st[key];
        if (e.state !== 'queued') return e.promise;
        e.state = 'loading'; running++;
        e.promise = load(src[key], opts).then(function (d) {
          e.state = 'done'; e.value = d; running--;
          if (opts.onEach) try { opts.onEach(d, key); } catch (err) { /* the callback's own problem */ }
          pump(); return d;
        }, function (err) { e.state = 'failed'; running--; pump(); throw err; });
        e.promise.catch(function () { /* the caller of get() sees it; an unread failure is not an unhandled rejection */ });
        return e.promise;
      }
      function pump() {
        if (waiting || stopped) return;
        if (running >= limit || !queue.length) return;
        waiting = true;
        var go = function () {
          waiting = false;
          while (!stopped && running < limit && queue.length) { var key = queue.shift(); if (st[key].state === 'queued') begin(key); }
        };
        if (opts.idle === 'now') go();
        else if (ricFn) ricFn(go, { timeout: opts.timeout > 0 ? opts.timeout : 300 });
        else timeoutFn(go, 50);
      }
      pump();
      return {
        count: keys.length,
        get: function (key) {
          var e = st[String(key)];
          if (!e) return Promise.reject(new Error('ImageDecode: no picture called ' + key));
          if (e.state === 'queued') { if (stopped) return Promise.reject(new Error('ImageDecode: this ahead() was cancelled')); return begin(String(key)); }
          if (e.state === 'done') return Promise.resolve(e.value);
          return e.promise;
        },
        ready: function (key) { var e = st[String(key)]; return !!e && e.state === 'done'; },
        drawable: function (key) { var e = st[String(key)]; return e && e.state === 'done' ? e.value : null; },
        release: function (key) { var e = st[String(key)]; if (e && e.state === 'done') { close(e.value); e.value = null; e.state = 'released'; e.promise = Promise.reject(new Error('ImageDecode: released')); e.promise.catch(function () {}); } },
        cancel: function () { stopped = true; queue.length = 0; }
      };
    }

    var support = {};
    // Can this browser read the format? Asked once per format with a one-pixel picture; the answer is remembered.
    function supports(type) {
      type = String(type).toLowerCase().replace('jpg', 'jpeg');
      if (support[type]) return support[type];
      if (!PROBES[type]) return (support[type] = Promise.resolve(type === 'gif'));
      var u8, raw;
      try { raw = atobFn(PROBES[type]); u8 = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i); } catch (e) { return (support[type] = Promise.resolve(false)); }
      support[type] = load(makeBlob(u8)).then(function (d) { close(d); return true; }, function () { return false; });
      return support[type];
    }

    // pick({ avif: a, webp: b, png: c }) -> the first url (in the order given) whose format this browser can read; null if none.
    function pick(urls) {
      var kinds = Object.keys(urls);
      return kinds.reduce(function (p, k) {
        return p.then(function (found) { return found !== null ? found : supports(k).then(function (ok) { return ok ? urls[k] : null; }); });
      }, Promise.resolve(null));
    }

    function close(d) { if (d && typeof d.close === 'function') try { d.close(); } catch (e) { /* already closed */ } }

    return { load: load, loadAll: loadAll, ahead: ahead, supports: supports, pick: pick, close: close, sniff: sniff, strategy: strategy, create: create, version: '1.2.0' };
  }

  return create();
});
