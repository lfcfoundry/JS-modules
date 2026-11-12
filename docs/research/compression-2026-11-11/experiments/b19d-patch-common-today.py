# Copyright (c) 2026 LFC Foundry. MIT License.
# usage: python3 b19d-patch-common-today.py in.js out.js (after the B19c patches). REJECTED, kept so the result can be rerun
# research B19d: without the cache, a dictionary value in more than half a block's rows hands the block to today's whole-block read and filter (the caller's fallback), after only the label and code frames were read. In the browser's query cycle the late-row whole-block path cost 1.05 to 1.41 of today on such values; a Node profile showed the cost is not decompression (codes were 0.89 to 0.94 of today on the same query run alone), so the fix is to take today's path exactly.
import sys
src, dst = sys.argv[1], sys.argv[2]; s = open(src, encoding='latin-1').read()
a = s.index("        if (m * 2 > n) { var labs = typeof val === 'string'")
b = s.index("return pk; }", a) + len("return pk; }")
s = s[:a] + "        if (m * 2 > n) return null;   // B19d: more than half the rows match: today's whole-block read is the quickest (the caller falls back to it)" + s[b:]
open(dst, 'w', encoding='latin-1').write(s)
