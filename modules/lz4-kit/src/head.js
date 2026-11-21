/*!
 * lz4-kit.js: LZ4 compression and decompression (blocks and the .lz4 frame) in the browser and Node, from one WebAssembly build of the official library.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Version 1.1.2 (API 1)
 * Copyright (c) 2026 LFC Foundry. MIT License (this wrapper and wasm/lz4-glue.c).
 * The WebAssembly inside is LZ4 1.11.1 by Yann Collet, compiled unchanged, BSD-2-Clause: https://lz4.org/ (see NOTICE-lz4.txt).
 * Release 1.11.1 is the first one without the 1.11.0 overflow in LZ4_resetStreamHC at high compression levels (10 and up).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Lz4Kit = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
