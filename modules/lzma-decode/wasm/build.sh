#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds lzma-decode.wasm from lzma-decode.c and prints its size. Needs clang with the wasm32 target and wasm-ld. Then run embed.py to put it into ../lzma-decode-wasm.js.
# The module owns its memory (exported as "memory") and tells the caller where free space starts (the "__heap_base" export).
# Keep the file small: the page compiles it on the main thread with the plain synchronous constructor. 5,024 bytes (1.5.0) compile that way in Chromium 155, Firefox 158 and WebKitGTK 2.52.6 (tests/lzma-wasm-browser.js); the old 4,096-byte note was out of date.
set -e
cd "$(dirname "$0")"
clang --target=wasm32 -Os -mbulk-memory -nostdlib -ffreestanding -fno-builtin -Wl,--no-entry -Wl,--export=lzma_decode -Wl,--export=lzma_begin -Wl,--export=lzma_more -Wl,--export=__heap_base -Wl,--strip-all \
  -o lzma-decode.wasm lzma-decode.c
wc -c lzma-decode.wasm
