# Copyright (c) 2026 LFC Foundry. MIT License.
# Counts why the fast flat writer declines a block (scan code, gather, lists, size); counts only, no times.
import sys
s=open(sys.argv[1],encoding='latin-1').read()
C="(globalThis.__BAIL||(globalThis.__BAIL={}))"
def rep(a,b):
    global s
    assert s.count(a)==1,(a,s.count(a)); s=s.replace(a,b)
rep("if (rc !== 0) return null;", "if (rc !== 0) { "+C+"['scan'+rc]=("+C+"['scan'+rc]||0)+1; return null; }")
rep("if (opts.noLists && nlist) return null;", "if (opts.noLists && nlist) { "+C+".lists=("+C+".lists||0)+1; return null; }")
rep("if (W.x.gather(nc, P.ckey, P.cval, P.cfd, P.ktype, P.kfd, nk, P.llen, P.gcnt, P.gtot, P.goff, P.gout)) return null;", "if (W.x.gather(nc, P.ckey, P.cval, P.cfd, P.ktype, P.kfd, nk, P.llen, P.gcnt, P.gtot, P.goff, P.gout)) { "+C+".gather50=("+C+".gather50||0)+1; return null; }")
open(sys.argv[2],'w',encoding='latin-1').write(s)
