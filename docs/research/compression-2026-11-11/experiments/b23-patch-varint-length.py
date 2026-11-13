#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
# B23 (research): varintsT skips its length-counting pass when the caller already summed the varint lengths (vlenSum for the
# absolute/delta choice), in both writers. Same bytes. usage: b23-patch-varint-length.py in.js out.js
import sys
s = open(sys.argv[1], encoding='utf-8').read()
def rep(old, new, cnt=1):
    global s
    assert s.count(old) == cnt, ('anchor', old[:70], s.count(old)); s = s.replace(old, new)
rep("""  function varintsT(a, m) {   // a: typed array of non-negative whole numbers (first m entries) -> varint bytes
    var n = 0, i, u, o, p = 0;
    for (i = 0; i < m; i++) {""", """  function varintsT(a, m, len) {   // a: typed array of non-negative whole numbers (first m entries) -> varint bytes; len: their varint length when the caller already summed it (B23)
    var n = 0, i, u, o, p = 0;
    if (len > 0) n = len; else for (i = 0; i < m; i++) {""")
rep("""    if (!dz2 || sa <= sb * 1.05) cand('V', { mono: mono, scale: scale }, [varintsT(d, n)]);
    if (dz2 && sb <= sa * 1.05) cand('V', { mono: false, scale: scale, delta: true }, [varintsT(dz2, n)]);""",
"""    if (!dz2 || sa <= sb * 1.05) cand('V', { mono: mono, scale: scale }, [varintsT(d, n, sa)]);
    if (dz2 && sb <= sa * 1.05) cand('V', { mono: false, scale: scale, delta: true }, [varintsT(dz2, n, sb)]);""")
rep("""          if (!dz2 || sa <= sb * 1.05) cand('V', { mono: mono, scale: scale }, [varintsT(d, c)], c);
          if (dz2 && sb <= sa * 1.05) cand('V', { mono: false, scale: scale, delta: true }, [varintsT(dz2, c)], c);""",
"""          if (!dz2 || sa <= sb * 1.05) cand('V', { mono: mono, scale: scale }, [varintsT(d, c, sa)], c);
          if (dz2 && sb <= sa * 1.05) cand('V', { mono: false, scale: scale, delta: true }, [varintsT(dz2, c, sb)], c);""")
open(sys.argv[2], 'w', encoding='utf-8').write(s); print(sys.argv[2])
