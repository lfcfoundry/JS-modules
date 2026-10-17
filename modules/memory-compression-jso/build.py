#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
# Version 1.4.0 (API 1)
"""Builds memory-compression-jso.js: header + the packing core (copied from ../memory-compression/memory-compression.js) + src/jso-layer.js.
Run:  python3 modules/memory-compression-jso/build.py   (after changing the core or the layer)"""
import os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
core_path = os.environ.get('MC_CORE') or os.path.join(here, '..', 'memory-compression', 'memory-compression.js')
core = open(core_path).read()
marker = "})(typeof self !== 'undefined' ? self : this, function () {\n"
i = core.index(marker) + len(marker)
j = core.rindex('});')
body = core[i:j]
layer = open(os.path.join(here, 'src', 'picker.js')).read() + open(os.path.join(here, 'src', 'jso-layer.js')).read() + open(os.path.join(here, 'src', 'keeper.js')).read()
head = open(os.path.join(here, 'src', 'header.txt')).read()
out = head + """(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.MemoryCompressionJSO = factory(); if (!root.MemoryCompression) root.MemoryCompression = root.MemoryCompressionJSO.core; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ================================================================ the packing core (identical to memory-compression.js; its WebAssembly helper is inside)
  var MC = (function () {
""" + body + """  })();

""" + layer + """
  return {
    pack: pack, unpack: unpack, view: view, freeBuffers: freeBuffers,
    ready: MC.ready, accelerated: MC.accelerated,
    keeper: keeper, heap: heapInfo, profile: profile, estimateBytes: estimateBytes,
    core: MC, picker: PK
  };
});
"""
open(os.path.join(here, 'memory-compression-jso.js'), 'w').write(out)
print('wrote memory-compression-jso.js, %d bytes' % len(out))
