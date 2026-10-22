#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
# Version 2.1.1 (API 2)
"""Builds memory-compression.js: header + the packing core (src/core.js) + the number picker, object layer and keeper (src/) + the router that picks the layer (src/router.js).
Run:  python3 modules/memory-compression/build.py   (after changing the core, the layer or the router)"""
import os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
core = open(os.environ.get('MC_CORE') or os.path.join(here, 'src', 'core.js'), encoding='utf8').read()
marker = "})(typeof self !== 'undefined' ? self : this, function () {\n"
i = core.index(marker) + len(marker)
j = core.rindex('});')
body = core[i:j]
rd = lambda n: open(os.path.join(here, 'src', n), encoding='utf8').read()
layer = rd('picker.js') + rd('jso-layer.js') + rd('keeper.js')
head = rd('header.txt')
out = head + """(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.MemoryCompression = api; root.MemoryCompressionJSO = api.jso; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ================================================================ the packing core (bytes and typed arrays; its WebAssembly helper is inside)
  var MC = (function () {
""" + body + """  })();

""" + layer + """
  var jso = {
    pack: pack, unpack: unpack, view: view, freeBuffers: freeBuffers,
    ready: MC.ready, accelerated: MC.accelerated,
    keeper: keeper, heap: heapInfo, profile: profile, estimateBytes: estimateBytes,
    core: MC, picker: PK
  };
""" + rd('router.js')
open(os.path.join(here, 'memory-compression.js'), 'w', encoding='utf8').write(out)
print('wrote memory-compression.js, %d bytes' % len(out.encode('utf8')))
