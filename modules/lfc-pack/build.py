#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
# Version 0.4.12 (API 0)
# Concatenates src/*.js into lfc-pack.js and embeds the wasm modules (the four big ones deflated, then base64; lfc-pack-read.js keeps plain base64). Run from anywhere.
import base64, os, struct, sys, zlib
here = os.path.dirname(os.path.abspath(__file__))
order = ['head', 'util', 'wasm', 'zstd', 'shred', 'nested', 'flat', 'container', 'api', 'pool', 'tail']
src = ''.join(open(os.path.join(here, 'src', n + '.js'), encoding='utf-8').read() for n in order)
mods = {'zstd-dec': 'wasm/zstd-dec.wasm', 'zstd-full': 'wasm/zstd-full.wasm', 'core': 'wasm/core.wasm', 'core-plain': 'wasm/core-plain.wasm'}
def packed(path):   # 4-byte size, then raw DEFLATE (level 9), then base64; src/wasm.js unpacks it
    raw = open(os.path.join(here, path), 'rb').read(); c = zlib.compressobj(9, zlib.DEFLATED, -15, 9)
    return base64.b64encode(struct.pack('<I', len(raw)) + c.compress(raw) + c.flush()).decode()
lit = '{' + ','.join('"%s":"%s"' % (k, packed(v)) for k, v in mods.items()) + '}'
a, b = '/*WASM:BEGIN*/', '/*WASM:END*/'
i = src.index(a); j = src.index(b)
tpl = base64.b64encode(open(os.path.join(here, 'wasm/tpl4.wasm'), 'rb').read()).decode()
src = src.replace('/*TPL:BEGIN*//*TPL:END*/', tpl)
src = src.replace('/*FS:BEGIN*//*FS:END*/', base64.b64encode(open(os.path.join(here, 'wasm/flatscan.wasm'), 'rb').read()).decode())
i = src.index(a); j = src.index(b)
out = src[:i + len(a)] + lit + src[j:]
open(os.path.join(here, 'lfc-pack.js'), 'w', encoding='utf-8').write(out)
print('lfc-pack.js', len(out))
# decoder-only build for pages that only open files: same code, only the 57 KB zstd decoder embedded
lit2 = '{"zstd-dec":"%s"}' % base64.b64encode(open(os.path.join(here, mods['zstd-dec']), 'rb').read()).decode()
out2 = src[:i + len(a)] + lit2 + src[j:]
open(os.path.join(here, 'lfc-pack-read.js'), 'w', encoding='utf-8').write(out2)
print('lfc-pack-read.js', len(out2))
# offline file viewer: the decoder-only build is inlined into viewer.html (one file, no network)
vs = os.path.join(here, 'viewer.src.html')
if os.path.exists(vs):
    page = open(vs, encoding='utf-8').read().replace('/*LFC-READ*/', out2.replace('</script', '<\\/script'))
    open(os.path.join(here, 'viewer.html'), 'w', encoding='utf-8').write(page)
    print('viewer.html', len(page))
