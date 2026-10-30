/*!
 * lfcp-go.js: a second, independent LFC-pack reader (written in Go, compiled to WebAssembly) for checking files against the JavaScript reader.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 0.1.0 (API 0)
 *
 * Needs WebAssembly (page policy 'wasm-unsafe-eval' and nothing else) and DecompressionStream('gzip'). One file, no other dependency, no network.
 * Contains the Go runtime glue wasm_exec.js and a Go-built wasm of go-reader (Go 1.25 license BSD-3-Clause; klauspost/compress BSD-3-Clause and Apache-2.0); see NOTICE-go.txt next to this file.
 * Source and rebuild: go-reader/ (sh web/build.sh).
 *
 *   await LfcpGo.init();                  // unpacks and starts the wasm (about 3.6 MB once unpacked; keep it for the page's life)
 *   LfcpGo.info(bytes)                    // { rows, blocks, size, major, minor }
 *   LfcpGo.rows(bytes)                    // Uint8Array: canonical JSON, one row per line
 *   LfcpGo.text(bytes)                    // Uint8Array: NDJSON text (the original bytes for a byte-exact file)
 * Each throws an Error with the reader's message for a file it refuses. `bytes` is a Uint8Array of the whole .json.lfc file.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LfcpGo = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var WASM_GZ_B64 = '@@WASM@@';
  var ready = null, api = null;

  function loadGo() {
    var g = typeof globalThis !== 'undefined' ? globalThis : self;
/*@@WASM_EXEC@@*/
    return g.Go;
  }

  async function gunzip(b64) {
    var bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    var s = new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }

  function init() {
    if (ready) return ready;
    ready = (async function () {
      var Go = loadGo(), go = new Go(), wasm = await gunzip(WASM_GZ_B64);
      var r = await WebAssembly.instantiate(wasm, go.importObject);
      go.run(r.instance);   // runs until the page closes; the Go side parks itself after registering
      for (var i = 0; i < 200 && !globalThis.__lfcpGo; i++) await new Promise(function (ok) { setTimeout(ok, 1); });
      if (!globalThis.__lfcpGo) throw new Error('LfcpGo: wasm did not start');
      api = globalThis.__lfcpGo;
    })();
    return ready;
  }

  function call(name, bytes) {
    if (!api) throw new Error('LfcpGo: call init() first');
    var r = api[name](bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    if (r.error !== undefined) throw new Error(r.error);
    return r.ok;
  }

  return {
    init: init,
    info: function (b) { return call('info', b); },
    rows: function (b) { return call('rows', b); },
    text: function (b) { return call('text', b); },
    version: '0.1.0',
    apiVersion: 0
  };
});
