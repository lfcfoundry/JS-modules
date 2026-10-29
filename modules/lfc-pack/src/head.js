/*!
 * lfc-pack.js: JSON archive format LFC-pack (.json.lfc): blocks of rows, each field stored as columns, zstd inside, a footer with zone maps.
 * Part of JS-modules, https://github.com/lfcfoundry/JS-modules
 * Copyright (c) 2026 LFC Foundry. MIT License (see LICENSE at the repository root).
 * Version 0.1.10 (API 0)
 *
 * Needs WebAssembly (zstd, the tokenizer and the string deduplicator are compiled from C; page policy 'wasm-unsafe-eval' and nothing else). No other dependency, one file.
 * Contains zstd 1.5.7 (BSD-3-Clause, Meta Platforms), compiled to wasm32; see NOTICE-zstd.txt next to this file.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LfcPack = api;
})(typeof self !== 'undefined' ? self : this, function jfFactory() {
  'use strict';
