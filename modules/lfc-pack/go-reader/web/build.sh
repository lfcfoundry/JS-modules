#!/bin/sh
# Rebuilds web/lfcp-go.js from the Go source. Needs Go 1.25 and python3 (standard library only).
# The result depends only on the source, go.sum and the Go version: -trimpath, no build id, gzip without a timestamp.
set -eu
cd "$(dirname "$0")/.."
GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w -buildid=" -o web/lfcp.wasm .
gzip -9 -n -c web/lfcp.wasm > web/lfcp.wasm.gz
python3 -I - <<'PY'
import base64, subprocess, re
glue = open(subprocess.check_output(['go', 'env', 'GOROOT']).decode().strip() + '/lib/wasm/wasm_exec.js').read()
glue = re.sub(r'^"use strict";\n', '', glue, flags=re.M)
src = open('web/lfcp-go.src.js').read()
b64 = base64.b64encode(open('web/lfcp.wasm.gz', 'rb').read()).decode()
out = src.replace('/*@@WASM_EXEC@@*/', glue).replace('@@WASM@@', b64)
open('web/lfcp-go.js', 'w').write(out)
import glob, os, json
vec = {}
for p in sorted(glob.glob('../vectors/*.ndjson')):
    n = os.path.basename(p)[:-len('.ndjson')]
    rd = lambda x: base64.b64encode(open(x, 'rb').read()).decode()
    vec[n] = {'src': rd(p), 'value': rd('../vectors/%s.json.lfc' % n), 'exact': rd('../vectors/%s.x.json.lfc' % n)}
open('web/tester.html', 'w').write(open('web/tester.src.html').read().replace('/*@@VECTORS@@*/', json.dumps(vec)))
print('lfcp-go.js', len(out), 'bytes;', 'wasm', len(open('web/lfcp.wasm','rb').read()), 'bytes;', 'gz', len(open('web/lfcp.wasm.gz','rb').read()), 'bytes')
PY
