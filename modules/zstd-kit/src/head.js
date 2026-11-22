/*!
 * zstd-kit.js: Zstandard compression in the browser and Node, plus XXH64 and CRC-32, from one WebAssembly build.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Version 1.0.1 (API 1)
 * Copyright (c) 2026 LFC Foundry. MIT License (this wrapper and wasm/zstd-glue.c).
 * The WebAssembly inside is Zstandard 1.5.7 by Yann Collet and Meta Platforms, compiled unchanged, BSD-3-Clause:
 * https://facebook.github.io/zstd/ (see NOTICE-zstd.txt). XXH64 is the copy inside Zstandard (Yann Collet, https://xxhash.com/).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.ZstdKit = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
