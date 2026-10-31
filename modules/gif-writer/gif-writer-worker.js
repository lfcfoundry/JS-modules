/*!
 * gif-writer-worker.js, an optional companion of gif-writer.js: a GIF worker: filters pictures and writes the GIF off the main thread. The same handler runs in a real worker and, where workers are missing, on the page.
 * Needs GifWriter (gif-writer.js) and GifWriterFx (gif-writer-fx.js) in the same scope; GifWriterCard (gif-writer-card.js) is optional. Copyright (c) 2026 LFC Foundry. MIT License.
 * Version 1.6.0 (API 1)
 * Messages in:  wasm {id} | card {id} | init {w,h} | filter {id,buf,w,h,f} | palette {bufs,colors,tol} | frame {id,buf,ms} | finish
 * Messages out: wasm {id,ok} | card {id,ok} | filtered {id,buf} | ready | ack {id} | done {bytes}
 */
var GifWriterWorker = (function () {
  'use strict';
  var W = 0, H = 0, enc = null, gl = null;
  function handle(m, post) {
    var a;
    switch (m.t) {
      case 'wasm': GifWriterFx.initWasm().then(function (ok) { post({ t: 'wasm', id: m.id, ok: ok }); }); break;
      case 'card': try { gl = typeof GifWriterCard !== 'undefined' && typeof OffscreenCanvas !== 'undefined' ? GifWriterCard.create() : null; } catch (e) { gl = null; } post({ t: 'card', id: m.id, ok: !!gl }); break;
      case 'init': W = m.w; H = m.h; enc = null; break;
      case 'filter': a = new Uint8ClampedArray(m.buf); if (gl) { var keep = a.slice(); if (!gl.apply(a, m.w, m.h, m.f)) { a.set(keep); gl = null; GifWriterFx.apply(a, m.w, m.h, m.f); } } else GifWriterFx.apply(a, m.w, m.h, m.f); post({ t: 'filtered', id: m.id, buf: a.buffer }, [a.buffer]); break;
      case 'palette': enc = GifWriter.createEncoder(W, H, GifWriter.makePalette(m.bufs.map(function (b) { return new Uint8ClampedArray(b); }), m.colors || 255), { loop: true, tolerance: m.tol || 0 }); post({ t: 'ready' }); break;
      case 'frame': enc.add(new Uint8ClampedArray(m.buf), m.ms); post({ t: 'ack', id: m.id }); break;
      case 'finish': a = enc.finish(); post({ t: 'done', bytes: a.buffer }, [a.buffer]); break;
    }
  }
  if (typeof importScripts === 'function' && typeof document === 'undefined') self.onmessage = function (e) { handle(e.data, function (msg, tr) { self.postMessage(msg, tr || []); }); };
  return { handle: handle };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = GifWriterWorker;
