/*!
 * walker-sim-wasm.js: an optional faster walking loop for walker-sim, written in WebAssembly (about 1 KB, built from wasm/walker-sim.c with wasm/build.sh).
 * Load walker-sim.js first, then this file. The counts stay exactly the same as without it for the same seed; it only changes how fast the walkers go.
 * It helps most in Chromium and Firefox (about twice as fast again) and little in WebKit (1.0 to 1.3 times in WebKitGTK and GNOME Web). It needs a page that allows WebAssembly (the policy word is
 * wasm-unsafe-eval); when the page does not allow it, or the browser has no WebAssembly, loading this file does nothing and walker-sim keeps using its JavaScript loop.
 * A run switches to it after its first 20,000 walkers (cfg.wasmAfter changes that; setting it up costs about as much as walking that many), so small runs never pay for it.
 * Only runs with fixed weights, one start item, no costs or waits and a step cap of 100,000 or less use it; every other run uses the JavaScript loop as before.
 * Turn it off for one run with cfg.wasm = false. sim.engine says which loop a run used ('wasm' or 'js'); WalkerSim.wasm says whether this file found WebAssembly usable.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 2.1.0 (API 2)
 */

(function (root, factory) {
  var core = root.WalkerSim || (typeof module === 'object' && module.exports && module.exports.create ? module.exports : null);
  if (typeof module === 'object' && module.exports) module.exports = factory(core || require('./walker-sim.js'));
  else factory(core);
}(typeof self !== 'undefined' ? self : this, function (WalkerSim) {
  'use strict';
  var mod = null;
  try {
    var txt = atob(/*WASM:BEGIN*/'AGFzbQEAAAABEwFgDn9/f39/f39/f39/f39/AX8CDwEDZW52Bm1lbW9yeQIAAgMCAQAGBwF/AUGAEAsHCAEEd2FsawAACv4GAfsGAgh/AnwCQCAADQAgDUEANgIAIAIPCwJAAkAgA0EBSA0AIAcgAWohDkEAIQ9BACEQA0ACQAJAIA4tAABFDQAgASERQQAhEgwBC0EAIRIgASERA0AgBCARQQJ0aigCACETAkACQCAIIBFBCHQgAkH1863pBmoiAkEPdiACcyACQQFybCIRQQd2IBFzIBFBPXJsIBFqIBFzIhRBGHZyai0AACIRQf8BRg0AIBMgEWohFQwBCyATQX9qIRUgBSATQQN0aiERIBRBDnYgFHO4RAAAAAAAAPA9oiEWA0AgFUEBaiEVIBErAwAhFyARQQhqIREgFyAWZQ0ACwsgCSAVQQN0aiIRIBErAwBEAAAAAAAA8D+gOQMAIBJBAWohEiAHIAYgFUECdGooAgAiEWotAAANASASIANIDQALCyAKIBJBA3RqIhUgFSsDAEQAAAAAAADwP6A5AwACQAJAIAsgEUECdGooAgAiEUEASA0AIAwgEUEDdGoiESARKwMARAAAAAAAAPA/oDkDAAwBCyAPQQFqIQ8LIBBBAWoiECAARw0ADAILCwJAIAsgAUECdGooAgAiEUEASA0AIAwgEUEDdGohESAAQQNxIRUCQCAAQQRJDQAgAEF8cSESA0AgCiAKKwMARAAAAAAAAPA/oDkDACARIBErAwBEAAAAAAAA8D+gOQMAIAogCisDAEQAAAAAAADwP6A5AwAgESARKwMARAAAAAAAAPA/oDkDACAKIAorAwBEAAAAAAAA8D+gOQMAIBEgESsDAEQAAAAAAADwP6A5AwAgCiAKKwMARAAAAAAAAPA/oDkDACARIBErAwBEAAAAAAAA8D+gOQMAIBJBfGoiEg0ACwtBACEPIBVFDQEDQCAKIAorAwBEAAAAAAAA8D+gOQMAIBEgESsDAEQAAAAAAADwP6A5AwAgFUF/aiIVDQAMAgsLIABBB3EhESAKKwMAIRcCQCAAQQhJDQAgAEF4cSEVA0AgF0QAAAAAAADwP6BEAAAAAAAA8D+gRAAAAAAAAPA/oEQAAAAAAADwP6BEAAAAAAAA8D+gRAAAAAAAAPA/oEQAAAAAAADwP6BEAAAAAAAA8D+gIRcgFUF4aiIVDQALCwJAIBFFDQADQCAXRAAAAAAAAPA/oCEXIBFBf2oiEQ0ACwsgCiAXOQMAIAAhDwsgDSAPNgIAIAIL'/*WASM:END*/), bytes = new Uint8Array(txt.length);
    for (var i = 0; i < txt.length; i++) bytes[i] = txt.charCodeAt(i);
    mod = new WebAssembly.Module(bytes);
    new WebAssembly.Instance(mod, { env: { memory: new WebAssembly.Memory({ initial: 2 }) } });     // some engines only refuse here when the page's policy forbids WebAssembly
  } catch (e) { mod = null; }     // no WebAssembly, or the page's policy forbids it: stay on the JavaScript loop
  WalkerSim.wasm = mod !== null;
  if (mod === null) return WalkerSim;

  /** Gets the arrays of one run, copies them into a memory of its own and gives back the pieces the run counts in and the walking function. Null (use JavaScript) on any trouble. */
  WalkerSim.useKernel(function (a) {
    try {
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
  return WalkerSim;
}));
