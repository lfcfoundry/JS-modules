#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds crc32.wasm (the WebAssembly checksum) from crc32.c, and xlsx.wasm plus xlsx-simd.wasm from xlsx.c and inflate.c (the Excel reader, sheet bytes to CSV, and the unzipper in one module, so a big sheet unpacks right where it is read; the second uses wasm SIMD in the reader, the first is the fallback), and prints their sizes. Needs clang (18 or newer) with the wasm32 target; the link step uses wasm-ld, which clang calls itself.
#   sh modules/zip-open/wasm/build.sh            all three
#   sh modules/zip-open/wasm/build.sh --check    builds to temporary files and exits 1 when any is not byte for byte the file that ships
# Then run embed.py to put the files into ../zip-open.js.
set -e
cd "$(dirname "$0")"
BASE="--target=wasm32 -O3 -ffp-contract=off -nostdlib -Wl,--no-entry -Wl,--export=__heap_base -Wl,--export-memory -Wl,-z,stack-size=4096 -Wl,--strip-all"
CRC="$BASE -DSLICE=16 -Wl,--export=init -Wl,--export=crc"
XL="--target=wasm32 -O3 -ffp-contract=off -nostdlib -Wl,--no-entry -Wl,--export=__heap_base -Wl,--export-memory -Wl,-z,stack-size=65536 -Wl,--strip-all -Wl,--export=sst -Wl,--export=nosst -Wl,--export=utf8ok -Wl,--export=sheet -Wl,--export=fixups -Wl,--export=lines -Wl,--export=inflate -Wl,--export=crc"
# xl OUT [flags]: xlsx.c (with flags) and inflate.c (never SIMD; its memset and memcpy come from xlsx.c) linked into one module
xl() { O="$1"; shift; D=$(mktemp -d); clang $XL "$@" -c -o "$D/x.o" xlsx.c 2>/dev/null; clang $XL -DNO_MEMFNS -c -o "$D/i.o" inflate.c 2>/dev/null; clang $XL "$@" -o "$O" "$D/x.o" "$D/i.o"; rm -rf "$D"; }
case "$1" in
  --check) ok=0
    for p in crc32 xlsx xlsx-simd; do
      T=$(mktemp); if [ $p = crc32 ]; then clang $CRC -o "$T" $p.c; elif [ $p = xlsx ]; then xl "$T"; else xl "$T" -msimd128 -DXL_SIMD; fi
      s=$p.c; [ $p = xlsx ] && s="xlsx.c and inflate.c"; [ $p = xlsx-simd ] && s="xlsx.c (with SIMD) and inflate.c"; if cmp -s "$T" $p.wasm; then echo "$p.wasm is what $s builds"; else echo "$p.wasm is NOT what $s builds"; ok=1; fi; rm -f "$T"
    done; exit $ok ;;
  *) clang $CRC -o crc32.wasm crc32.c; xl xlsx.wasm; xl xlsx-simd.wasm -msimd128 -DXL_SIMD; wc -c crc32.wasm xlsx.wasm xlsx-simd.wasm ;;
esac
