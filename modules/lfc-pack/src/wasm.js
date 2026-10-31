// Copyright (c) 2026 LFC Foundry. MIT License. Source part of lfc-pack.js (joined by build.py).

  // ================================================================ WebAssembly modules (built from wasm/*.c by wasm/build.sh and wasm/build-core.sh; embedded by wasm/embed.py)
  var WASM = /*WASM:BEGIN*/{}/*WASM:END*/;
  var SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
  function hasSimd() { try { return WebAssembly.validate(SIMD_PROBE); } catch (e) { return false; } }
  var S = { core: null, zdec: null, zfull: null, ready: null, wready: null };   // loaded instances
  function wasmBytes(name) { if (!WASM[name]) throw new Error('wasm module missing: ' + name); return fromB64(WASM[name]); }
  function coreName() { return hasSimd() ? 'core' : 'core-plain'; }
  // async: the page's main thread may not compile big modules synchronously
  function loadAsync(names) {
    return Promise.all(names.map(function (n) { return MODS[n] ? new WebAssembly.Instance(MODS[n], {}) : WebAssembly.instantiate(wasmBytes(n), {}).then(function (r) { MODS[n] = r.module; return r.instance; }); }));
  }
  // compiled modules are kept, so trim() makes a fresh instance (fresh, small memory) without compiling again: a new compile starts on the browser's first, slower code tier
  var MODS = {};
  function loadSync(name) { return new WebAssembly.Instance(MODS[name] || (MODS[name] = new WebAssembly.Module(wasmBytes(name))), {}); }
