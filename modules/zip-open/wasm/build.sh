#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds crc32.wasm (the WebAssembly checksum) from crc32.c, inflate.wasm (small-entry inflate) from inflate.c, and xlsx.wasm plus xlsx-simd.wasm (Excel sheet bytes to CSV; the second uses wasm SIMD, the first is the fallback) from xlsx.c, and prints their sizes. Needs clang (18 or newer) with the wasm32 target; the link step uses wasm-ld, which clang calls itself.
#   sh modules/zip-open/wasm/build.sh            crc32.wasm and inflate.wasm
#   sh modules/zip-open/wasm/build.sh --check    builds to temporary files and exits 1 when any is not byte for byte the file that ships
# Then run embed.py to put the files into ../zip-open.js.
set -e
cd "$(dirname "$0")"
BASE="--target=wasm32 -O3 -ffp-contract=off -nostdlib -Wl,--no-entry -Wl,--export=__heap_base -Wl,--export-memory -Wl,-z,stack-size=4096 -Wl,--strip-all"
CRC="$BASE -DSLICE=16 -Wl,--export=init -Wl,--export=crc"
INF="$BASE -Wl,--export=inflate"
XL="--target=wasm32 -O3 -ffp-contract=off -nostdlib -Wl,--no-entry -Wl,--export=__heap_base -Wl,--export-memory -Wl,-z,stack-size=65536 -Wl,--strip-all -Wl,--export=sst -Wl,--export=nosst -Wl,--export=utf8ok -Wl,--export=sheet -Wl,--export=fixups -Wl,--export=lines"
case "$1" in
  --check) ok=0
    for p in crc32 inflate xlsx xlsx-simd; do
      T=$(mktemp); if [ $p = crc32 ]; then clang $CRC -o "$T" $p.c; elif [ $p = xlsx ]; then clang $XL -o "$T" $p.c; elif [ $p = xlsx-simd ]; then clang $XL -msimd128 -DXL_SIMD -o "$T" xlsx.c; else clang $INF -o "$T" $p.c; fi
      s=$p.c; [ $p = xlsx-simd ] && s="xlsx.c (with SIMD)"; if cmp -s "$T" $p.wasm; then echo "$p.wasm is what $s builds"; else echo "$p.wasm is NOT what $s builds"; ok=1; fi; rm -f "$T"
    done; exit $ok ;;
  *) clang $CRC -o crc32.wasm crc32.c; clang $INF -o inflate.wasm inflate.c; clang $XL -o xlsx.wasm xlsx.c; clang $XL -msimd128 -DXL_SIMD -o xlsx-simd.wasm xlsx.c; wc -c crc32.wasm inflate.wasm xlsx.wasm xlsx-simd.wasm ;;
esac
