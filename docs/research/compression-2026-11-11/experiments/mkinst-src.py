# Copyright (c) 2026 LFC Foundry. MIT License.
# like mkinst.py, but the decompress hook gets the frame bytes and the raw output, and the zstd compress function is left on globalThis.__ZC (for ovh.cjs and dict.cjs)
import sys
s = open(sys.argv[1], encoding='latin-1').read()
a = "__H.d(src.length, __r.length, __N()-__t)"; assert s.count(a) == 1; s = s.replace(a, "__H.d(src, __r, __N()-__t)")
b = "api.compress = function (src, level, windowLog, most) { var __t"; assert s.count(b) == 1; s = s.replace(b, "api.compress = function (src, level, windowLog, most) { globalThis.__ZC = __c0; var __t")
open(sys.argv[2], 'w', encoding='latin-1').write(s)
