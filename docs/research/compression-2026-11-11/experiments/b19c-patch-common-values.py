# Copyright (c) 2026 LFC Foundry. MIT License.
# usage: python3 b19c-patch-common-values.py in.js out.js (after the B19, cache and B19b patches)
# research B19c: common values (more than half the rows of a block match) without paying twice.
# codes mode: the dictionary column is rebuilt from the labels and codes already read, kept as the block's decoded column, and the rows are picked by position (no second decode, no second compare).
# cache mode: the whole-block path assembles from the cached decoded columns instead of decoding every column again on every query.
import sys
src, dst = sys.argv[1], sys.argv[2]; s = open(src, encoding='latin-1').read()
old1 = "if (cd[k++] === c0 && c0 >= 0) sel[m++] = i; }\n      } else {"
assert s.count(old1) == 1
new1 = """if (cd[k++] === c0 && c0 >= 0) sel[m++] = i; }
        if (m * 2 > n) { var labs = typeof val === 'string' ? tdr.decode(frOne(col, o)).split('\\0') : (cnt ? tdr.decode(frOne(col, o)).split('\\0') : []), pre = new Array(cm.n), kk = 0; at = 0;
          if (np) { for (i = 0; i < cm.n; i++) pre[i] = (np[i >> 3] >> (i & 7)) & 1 ? null : labs[cd[kk++]]; } else for (i = 0; i < cnt; i++) pre[i] = labs[cd[i]];
          col.pre = pre; frBlock(F); var allr = assemble(F, want), pk = new Array(m); for (i = 0; i < m; i++) pk[i] = allr[sel[i]]; return pk; }
      } else {"""
s = s.replace(old1, new1)
old2 = "if (m * 2 > n) { frBlock(F); var all = assemble(F, want), oo = []; for (i = 0; i < m; i++) oo.push(all[sel[i]]); return oo; }"
assert s.count(old2) == 1
new2 = "if (m * 2 > n) { frBlock(F); for (j = 0; j < K; j++) if (F.cols[j] !== null && !F.cols[j].pre) F.cols[j].pre = colOf(j); var all = assemble(F, want), oo = new Array(m); for (i = 0; i < m; i++) oo[i] = all[sel[i]]; return oo; }"
s = s.replace(old2, new2)
open(dst, 'w', encoding='latin-1').write(s)
