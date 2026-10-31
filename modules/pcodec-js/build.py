#!/usr/bin/env python3
# Copyright (c) 2026 LFC Foundry. MIT License.
# Version 1.6.2 (API 1)
# Builds the three shipped files from src/ and the WebAssembly programs in wasm/:
#   pcodec-js.js       reader, the speed-built program (no SIMD needed)
#   pcodec-js-fast.js  reader, the SIMD program (about 15% faster unpack on Firefox; needs a browser with WebAssembly SIMD)
#   pcodec-js-pack.js  reader and packer in one file
# The three wasm programs are embedded deflated (zlib level 9, raw deflate stream) then base64, so the files are about half the size; rebuilding gives the same files with the same zlib.
# usage: python3 build.py [--version X.Y.Z] [--out DIR]
import base64, os, sys, zlib

args = sys.argv[1:]
def opt(name, default):
    return args[args.index(name) + 1] if name in args else default

here = os.path.dirname(os.path.abspath(__file__))
wasm_dir = os.path.join(here, 'wasm')
out_dir = opt('--out', here)
version = opt('--version', '1.1.0')
src = open(os.path.join(here, 'src', 'pcodec-js.src.js'), encoding='utf8').read()
warm = open(os.path.join(here, 'src', 'warm.json'), encoding='utf8').read().strip()
pack_api = open(os.path.join(here, 'src', 'pack_api.js'), encoding='utf8').read().rstrip('\n')

def b64(name):
    # each program is stored deflate-raw (level 9), then base64; the file opens it with DecompressionStream('deflate-raw') before compiling
    raw = open(os.path.join(wasm_dir, name), 'rb').read()
    z = zlib.compressobj(9, zlib.DEFLATED, -15, 9)
    return base64.b64encode(z.compress(raw) + z.flush()).decode()

def build(out_name, programs, profile_line, with_pack):
    body = '{ ' + ', '.join('%s: "%s"' % (k, b64(f)) for k, f in programs.items()) + ' }'
    text = (src.replace('@PROGRAMS@', body).replace('@WARM@', warm).replace('@VERSION@', version)
               .replace('@PROFILE_LINE@', profile_line).replace('@PACK_API@', pack_api if with_pack else ''))
    open(os.path.join(out_dir, out_name), 'w', encoding='utf8').write(text)
    print(out_name, len(text.encode('utf8')), 'bytes;', ', '.join('%s program %d B' % (k, os.path.getsize(os.path.join(wasm_dir, f))) for k, f in programs.items()))

build('pcodec-js.js', {'plain': 'read-speed.opt.wasm'}, 'reader: unpacks and streams (to pack as well, use pcodec-js-pack.js)', False)
build('pcodec-js-fast.js', {'fast': 'read-fast.opt.wasm'}, 'reader with the SIMD program: unpacks and streams, needs WebAssembly SIMD (pcodec-js.js works everywhere)', False)
build('pcodec-js-pack.js', {'pack': 'pack-full.opt.wasm'}, 'reader and packer in one file', True)
