# Copyright (c) 2026 LFC Foundry. MIT License. Research runner behind the pcodec-js 1.2.0 numbers; it needs the test browsers installed (see the repository QA notes).
import base64,sys
M='/mnt/project-files/js-modules-research/pcodec-module/proposed-tree/modules/pcodec-js/'
wasm,out=sys.argv[1],sys.argv[2]
src=open(M+'src/pcodec-js.src.js',encoding='utf8').read(); warm=open(M+'src/warm.json').read().strip(); pk=open(M+'src/pack_api.js').read().rstrip('\n')
b=base64.b64encode(open(wasm,'rb').read()).decode()
t=src.replace('@PROGRAMS@','{ pack: "%s" }'%b).replace('@WARM@',warm).replace('@VERSION@','1.1.0').replace('@PROFILE_LINE@','exp').replace('@PACK_API@',pk)
open(out,'w',encoding='utf8').write(t); print(out,len(t))
