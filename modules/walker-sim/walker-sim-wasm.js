/*!
 * walker-sim-wasm.js: an optional faster walking loop and faster what-if rounds for walker-sim, written in WebAssembly (about 1 KB each, built from wasm/walker-sim.c and wasm/sweep.c with wasm/build.sh).
 * Load walker-sim.js first, then this file. The counts stay exactly the same as without it for the same seed; it only changes how fast the walkers go.
 * It helps most in Chromium and Firefox (about twice as fast again) and little in WebKit (1.0 to 1.3 times in WebKitGTK and GNOME Web). It needs a page that allows WebAssembly (the policy word is
 * wasm-unsafe-eval); when the page does not allow it, or the browser has no WebAssembly, loading this file does nothing and walker-sim keeps using its JavaScript loop.
 * A run switches to it after its first 20,000 walkers (cfg.wasmAfter changes that; setting it up costs about as much as walking that many), so small runs never pay for it.
 * Only runs with fixed weights, one start item, no costs or waits and a step cap of 100,000 or less use it; every other run uses the JavaScript loop as before.
 * sweep and exactEndpoints use a second program from this file for their rounds (WalkerSim.useSweepKernel); it works out the same numbers to the last digit, and without WebAssembly walker-sim runs the rounds in JavaScript.
 * Turn it off for one run with cfg.wasm = false. sim.engine says which loop a run used ('wasm' or 'js'); WalkerSim.wasm says whether this file found WebAssembly usable.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 2.4.1 (API 2)
 */

(function (root, factory) {
  var core = root.WalkerSim || (typeof module === 'object' && module.exports && module.exports.create ? module.exports : null);
  if (typeof module === 'object' && module.exports) module.exports = factory(core || require('./walker-sim.js'));
  else factory(core);
}(typeof self !== 'undefined' ? self : this, function (WalkerSim) {
  'use strict';
  var mod = null, settled = false, early = null, bin = null;     // bin: the decoded program, kept only until it is compiled once
  function wasmBytes() {
    if (bin) return bin;
    var src = /*WASM:BEGIN*/'AGFzbQEAAAABEwFgDn9/f39/f39/f39/f39/AX8CDwEDZW52Bm1lbW9yeQIAAgMCAQAGBwF/AUGAEAsHCAEEd2FsawAACv4GAfsGAgh/AnwCQCAADQAgDUEANgIAIAIPCwJAAkAgA0EBSA0AIAcgAWohDkEAIQ9BACEQA0ACQAJAIA4tAABFDQAgASERQQAhEgwBC0EAIRIgASERA0AgBCARQQJ0aigCACETAkACQCAIIBFBCHQgAkH1863pBmoiAkEPdiACcyACQQFybCIRQQd2IBFzIBFBPXJsIBFqIBFzIhRBGHZyai0AACIRQf8BRg0AIBMgEWohFQwBCyATQX9qIRUgBSATQQN0aiERIBRBDnYgFHO4RAAAAAAAAPA9oiEWA0AgFUEBaiEVIBErAwAhFyARQQhqIREgFyAWZQ0ACwsgCSAVQQN0aiIRIBErAwBEAAAAAAAA8D+gOQMAIBJBAWohEiAHIAYgFUECdGooAgAiEWotAAANASASIANIDQALCyAKIBJBA3RqIhUgFSsDAEQAAAAAAADwP6A5AwACQAJAIAsgEUECdGooAgAiEUEASA0AIAwgEUEDdGoiESARKwMARAAAAAAAAPA/oDkDAAwBCyAPQQFqIQ8LIBBBAWoiECAARw0ADAILCwJAIAsgAUECdGooAgAiEUEASA0AIAwgEUEDdGohESAAQQNxIRUCQCAAQQRJDQAgAEF8cSESA0AgCiAKKwMARAAAAAAAAPA/oDkDACARIBErAwBEAAAAAAAA8D+gOQMAIAogCisDAEQAAAAAAADwP6A5AwAgESARKwMARAAAAAAAAPA/oDkDACAKIAorAwBEAAAAAAAA8D+gOQMAIBEgESsDAEQAAAAAAADwP6A5AwAgCiAKKwMARAAAAAAAAPA/oDkDACARIBErAwBEAAAAAAAA8D+gOQMAIBJBfGoiEg0ACwtBACEPIBVFDQEDQCAKIAorAwBEAAAAAAAA8D+gOQMAIBEgESsDAEQAAAAAAADwP6A5AwAgFUF/aiIVDQAMAgsLIABBB3EhESAKKwMAIRcCQCAAQQhJDQAgAEF4cSEVA0AgF0QAAAAAAADwP6BEAAAAAAAA8D+gRAAAAAAAAPA/oEQAAAAAAADwP6BEAAAAAAAA8D+gRAAAAAAAAPA/oEQAAAAAAADwP6BEAAAAAAAA8D+gIRcgFUF4aiIVDQALCwJAIBFFDQADQCAXRAAAAAAAAPA/oCEXIBFBf2oiEQ0ACwsgCiAXOQMAIAAhDwsgDSAPNgIAIAIL'/*WASM:END*/;
    if (typeof Uint8Array.fromBase64 === 'function') return (bin = Uint8Array.fromBase64(src));
    var txt = atob(src), bytes = new Uint8Array(txt.length);
    for (var i = 0; i < txt.length; i++) bytes[i] = txt.charCodeAt(i);
    return (bin = bytes);
  }
  function accept(m) {     // keep m only if the page lets it start: some engines only refuse at the first Instance when the policy forbids WebAssembly
    settled = true; bin = null;
    try { new WebAssembly.Instance(m, { env: { memory: new WebAssembly.Memory({ initial: 2 }) } }); mod = m; } catch (e) { mod = null; }
    return mod;
  }
  function ensure() {     // a run that finds the early compile unfinished compiles on the spot, as before
    if (settled) return mod;
    try { return accept(new WebAssembly.Module(wasmBytes())); } catch (e) { settled = true; bin = null; return (mod = null); }
  }
  /* compile early: the engine compiles on another thread as soon as this file loads, so the page keeps running; WalkerSim.wasmReady() says when (true when WebAssembly is usable) */
  if (typeof WebAssembly !== 'object' || !WebAssembly || typeof WebAssembly.Module !== 'function') settled = true;     // no WebAssembly at all: decided now
  try {
    early = settled ? Promise.resolve(false) : typeof WebAssembly.compile === 'function'
      ? WebAssembly.compile(wasmBytes()).then(function (m) { if (!settled) accept(m); return mod !== null; }, function () { if (!settled) { settled = true; bin = null; mod = null; } return false; })
      : Promise.resolve(false);
  } catch (e) { early = Promise.resolve(false); }
  Object.defineProperty(WalkerSim, 'wasm', { configurable: true, enumerable: true, get: function () { return ensure() !== null; } });     // whether this file found WebAssembly usable
  WalkerSim.wasmReady = function () { return early; };
  WalkerSim.wasmModule = function () { return ensure(); };     // the compiled WebAssembly.Module (or null), to hand to a worker

  /** Gets the arrays of one run, copies them into a memory of its own and gives back the pieces the run counts in and the walking function. Null (use JavaScript) on any trouble. */
  WalkerSim.useKernel(function (a) {
    try {
      if (!ensure()) return null;
      var n = a.n, m = a.m, K = a.K, off = 66560;     // the arrays start above the compiled module's own stack (it sits below 66,560)
      var take = function (size) { off = (off + 7) & ~7; var o = off; off += size; return o; };
      var oOs = take(4 * (n + 1)), oTg = take(4 * m), oHalt = take(n), oEp = take(4 * n), oLut = take(n * 256), oCum = take(8 * m), oMoves = take(8 * m), oTab = take(8 * (a.cap + 1)), oTc = take(8 * K), oSt = take(8);
      var mem = new WebAssembly.Memory({ initial: Math.ceil(off / 65536) + 1 });
      var walk = new WebAssembly.Instance(mod, { env: { memory: mem } }).exports.walk, buf = mem.buffer;
      new Int32Array(buf, oOs, n + 1).set(a.os); new Int32Array(buf, oTg, m).set(a.tg); new Uint8Array(buf, oHalt, n).set(a.halt);
      new Int32Array(buf, oEp, n).set(a.epOf); new Uint8Array(buf, oLut, n * 256).set(a.lut); new Float64Array(buf, oCum, m).set(a.cumN);
      var stuck = new Uint32Array(buf, oSt, 1), cap = a.cap;
      return {
        moves: new Float64Array(buf, oMoves, m), tab: new Float64Array(buf, oTab, cap + 1), counts: new Float64Array(buf, oTc, K),
        walk: function (rng, count, start) { rng.reseed(walk(count, start, rng.state(), cap, oOs, oCum, oTg, oHalt, oLut, oMoves, oTab, oEp, oTc, oSt)); return stuck[0]; }
      };
    } catch (e) { return null; }
  });
  /* The what-if rounds (sweep, exactEndpoints) have a program of their own, wasm/sweep.c: a SIMD build and a scalar twin for engines that refuse SIMD. It is compiled early like the walking loop,
     keeps one memory and one instance for all calls (the memory grows only when a call needs more) and hands back null on any trouble, which makes walker-sim use its JavaScript loop. */
  var sw = { mod: null, exp: null, mem: null, settled: false };
  function swBytes(b64) { if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(b64); var txt = atob(b64), bytes = new Uint8Array(txt.length); for (var i = 0; i < txt.length; i++) bytes[i] = txt.charCodeAt(i); return bytes; }
  var SW_SIMD = /*SWEEP:BEGIN*/'AGFzbQEAAAABDwFgCn9/f39/f39/f38BfwIPAQNlbnYGbWVtb3J5AgACAwIBAAYHAX8BQYAQCwcKAQZzd2VlcHMAAArRBwHOBwYBfwJ8D38BfAF7BHxBASEKRAAAAAAAAPB/IQsCQAJAIABBAU4NAEEAIQpEAAAAAAAA8H8hDAwBC0QAAAAAAAAAACEMIAFBAUgNACACQQFIDQAgAkEBcSENIAJBfnEhDiACQX9qIQ8gByACQQN0IhBqIREgCCAQaiESRAAAAAAAAPB/IQxBACEKA0AgDCELRAAAAAAAAAAAIQxBACETA0AgAyATQQJ0IhRqKAIAIRVBACEQAkACQCACQQJJIhYNACAOIRcgCCEQA0AgEP0MAAAAAAAAAAAAAAAAAAAAAP0LAwAgEEEQaiEQIBdBfmoiFw0ACyAOIRAgDiACRg0BCyACIBBrIRcgCCAQQQN0aiEQA0AgEEIANwMAIBBBCGohECAXQX9qIhcNAAsLIBUgAmwhGAJAIAQgFGooAgAiGSAEIBNBAWoiE0ECdGooAgAiGk4NAANAIAcgBSAZQQJ0aigCAEEDdCIbaiEVIAYgGUEDdGorAwAhHEEAIRACQAJAIBYNAAJAIBEgG2ogCE0NACAVIBJJDQELIBz9FCEdIA4hFCAIIRAgFSEXA0AgECAQ/QADACAdIBf9AAMA/fIB/fAB/QsDACAQQRBqIRAgF0EQaiEXIBRBfmoiFA0ACyAOIRAgDiACRg0BCyAQIRQCQCANRQ0AIAggEEEDdCIXaiIUIBQrAwAgHCAVIBdqKwMAoqA5AwAgEEEBciEUCyAPIBBGDQAgByAUQQN0IhAgG2pqIRcgAiAUayEUIAggEGohEANAIBAgECsDACAcIBcrAwCioDkDACAQQQhqIhUgFSsDACAcIBdBCGorAwCioDkDACAXQRBqIRcgEEEQaiEQIBRBfmoiFA0ACwsgGUEBaiIZIBpHDQALCyAHIBhBA3RqIRlEAAAAAAAAAAAhHkEAIRQCQCAPRQ0AIBkhECAIIRcDQCAQKwMAIRwgECAXKwMAIh85AwAgEEEIaiIVKwMAISAgFSAXQQhqKwMAIiE5AwAgHiAfIByhIhyaIBwgHEQAAAAAAAAAAGMboCAhICChIhyaIBwgHEQAAAAAAAAAAGMboCEeIBBBEGohECAXQRBqIRcgDiAUQQJqIhRHDQALCwJAIA1FDQAgGSAUQQN0IhBqIhcrAwAhHCAXIAggEGorAwAiHzkDACAeIB8gHKEiHJogHCAcRAAAAAAAAAAAYxugIR4LIB4gDCAeIAxkGyEMIBMgAUcNAAsgCkEBaiEKIAxEEeotgZmXcT1jDQEgCiAASA0ACwsgCSALOQMIIAkgDDkDACAJIAq3OQMQIAoL'/*SWEEP:END*/, SW_SCALAR = /*SWEEPS:BEGIN*/'AGFzbQEAAAABDwFgCn9/f39/f39/f38BfwIPAQNlbnYGbWVtb3J5AgACAwIBAAYHAX8BQYAQCwcKAQZzd2VlcHMAAArtBgHqBgQBfwJ8D38FfEEBIQpEAAAAAAAA8H8hCwJAAkAgAEEBTg0AQQAhCkQAAAAAAADwfyEMDAELRAAAAAAAAAAAIQwgAUEBSA0AIAJBAUgNACACQQFxIQ0gAkF+cSEOIAJBeHEhDyACQQdxIRAgAkF/aiERRAAAAAAAAPB/IQxBACEKIAJBCEkhEgNAIAwhC0QAAAAAAAAAACEMQQAhEwNAIAMgE0ECdCIUaigCACEVQQAhFgJAIBINAEEAIRYgCCEXA0AgF0IANwMAIBdBOGpCADcDACAXQTBqQgA3AwAgF0EoakIANwMAIBdBIGpCADcDACAXQRhqQgA3AwAgF0EQakIANwMAIBdBCGpCADcDACAXQcAAaiEXIA8gFkEIaiIWRw0ACwsCQCAQRQ0AIAggFkEDdGohFyAQIRYDQCAXQgA3AwAgF0EIaiEXIBZBf2oiFg0ACwsgFSACbCEYAkAgBCAUaigCACIZIAQgE0EBaiITQQJ0aigCACIaTg0AA0AgByAFIBlBAnRqKAIAQQN0aiEbIAYgGUEDdGorAwAhHEEAIRQCQCARRQ0AIAghFyAbIRYDQCAXIBcrAwAgHCAWKwMAoqA5AwAgF0EIaiIVIBUrAwAgHCAWQQhqKwMAoqA5AwAgF0EQaiEXIBZBEGohFiAOIBRBAmoiFEcNAAsLAkAgDUUNACAIIBRBA3QiF2oiFiAWKwMAIBwgGyAXaisDAKKgOQMACyAZQQFqIhkgGkcNAAsLIAcgGEEDdGohGUQAAAAAAAAAACEdQQAhFAJAIBFFDQAgGSEXIAghFgNAIBcrAwAhHCAXIBYrAwAiHjkDACAXQQhqIhUrAwAhHyAVIBZBCGorAwAiIDkDACAdIB4gHKEiHJogHCAcRAAAAAAAAAAAYxugICAgH6EiHJogHCAcRAAAAAAAAAAAYxugIR0gF0EQaiEXIBZBEGohFiAOIBRBAmoiFEcNAAsLAkAgDUUNACAZIBRBA3QiF2oiFisDACEcIBYgCCAXaisDACIeOQMAIB0gHiAcoSIcmiAcIBxEAAAAAAAAAABjG6AhHQsgHSAMIB0gDGQbIQwgEyABRw0ACyAKQQFqIQogDEQR6i2BmZdxPWMNASAKIABIDQALCyAJIAs5AwggCSAMOQMAIAkgCrc5AxAgCgs='/*SWEEPS:END*/;
  function swAccept(m) {     // an engine may only refuse at the first Instance (a page that forbids WebAssembly), so make the one instance now
    try {
      var mem = new WebAssembly.Memory({ initial: 2 }), exp = new WebAssembly.Instance(m, { env: { memory: mem } }).exports;
      if (typeof exp.sweeps === 'function') { sw.mod = m; sw.exp = exp; sw.mem = mem; }
    } catch (e) { sw.mod = null; }
    return sw.mod !== null;
  }
  function swEnsure() {     // the early compile unfinished: compile on the spot (1 KB, a fraction of a millisecond)
    if (sw.settled) return sw.mod !== null;
    sw.settled = true;
    if (typeof WebAssembly !== 'object' || !WebAssembly) return false;
    var list = [SW_SIMD, SW_SCALAR];
    for (var i = 0; i < list.length; i++) { try { if (swAccept(new WebAssembly.Module(swBytes(list[i])))) return true; } catch (e) { /* SIMD refused: try the scalar twin */ } }
    return false;
  }
  if (typeof WebAssembly === 'object' && WebAssembly && typeof WebAssembly.compile === 'function') {
    try {
      WebAssembly.compile(swBytes(SW_SIMD)).catch(function () { return WebAssembly.compile(swBytes(SW_SCALAR)); }).then(function (m) { if (!sw.settled) { sw.settled = true; swAccept(m); } }, function () { sw.settled = true; });
    } catch (e) { /* compiled on the spot at the first call */ }
  }
  WalkerSim.useSweepKernel(function (maxS, nO, K, ordA, eS, tKa, pea, c, acc) {
    try {
      if (!swEnsure()) return null;
      var E = tKa.length, off = 66560, take = function (size) { off = (off + 7) & ~7; var o = off; off += size; return o; };
      var oOrd = take(4 * nO), oES = take(4 * (nO + 1)), oTK = take(4 * E), oPe = take(8 * E), oC = take(8 * c.length), oAcc = take(8 * K), oOut = take(24), need = Math.ceil((off + 8) / 65536);
      var have = sw.mem.buffer.byteLength / 65536;
      if (need > have) sw.mem.grow(need - have);
      var buf = sw.mem.buffer;
      new Int32Array(buf, oOrd, nO).set(ordA); new Int32Array(buf, oES, nO + 1).set(eS); new Int32Array(buf, oTK, E).set(tKa);
      new Float64Array(buf, oPe, E).set(pea); new Float64Array(buf, oC, c.length).set(c);
      sw.exp.sweeps(maxS, nO, K, oOrd, oES, oTK, oPe, oC, oAcc, oOut);
      var out = new Float64Array(buf, oOut, 3), res = [out[0], out[1], out[2]];
      c.set(new Float64Array(buf, oC, c.length));     // c is only written when the whole call went well
      return res;
    } catch (e) { return null; }
  });
  return WalkerSim;
}));
