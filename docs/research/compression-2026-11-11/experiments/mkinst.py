# Copyright (c) 2026 LFC Foundry. MIT License.
import sys
s=open(sys.argv[1],encoding='latin-1').read()
a="api.compress = function (src, level, windowLog, most) {"
assert s.count(a)==1
s=s.replace(a,"api.compress = function (src, level, windowLog, most) { var __t=__N(), __r=__c0(src, level, windowLog, most); __H.c(src, __r, __N()-__t, most, level); return __r; }; var __c0 = function (src, level, windowLog, most) {")
b="function decompressView(src, outLen) {"
assert s.count(b)==1
s=s.replace(b,"function decompressView(src, outLen) { var __t=__N(), __r=__dv0(src, outLen); __H.d(src.length, __r.length, __N()-__t); return __r; } function __dv0(src, outLen) {")
pre="var __N=(typeof performance!=='undefined')?function(){return performance.now()}:Date.now; var __H=(typeof globalThis!=='undefined'&&globalThis.__H)||{c:function(){},d:function(){}};\n"
open(sys.argv[2],'w',encoding='latin-1').write(pre+s)
