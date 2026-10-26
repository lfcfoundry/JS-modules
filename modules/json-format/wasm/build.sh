#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds zstd-full.wasm (compress + decompress) and zstd-dec.wasm (decompress only) from the pinned zstd release.
# Needs clang 18+ with the wasm32 target, wasm-ld, curl and sha256sum. Nothing from the zstd package is run, only compiled.
set -e
cd "$(dirname "$0")"
V=1.5.7; SHA=eb33e51f49a15e023950cd7825ca74a4a2b43db8354825ac24fc1b7ee09e6fa3
W=${ZSTD_WORK:-/tmp/lfc-json-format-zstd}; mkdir -p "$W"
if [ ! -d "$W/zstd-$V" ]; then
  curl -fsSL -o "$W/zstd-$V.tar.gz" "https://github.com/facebook/zstd/releases/download/v$V/zstd-$V.tar.gz"
  echo "$SHA  $W/zstd-$V.tar.gz" | sha256sum -c -
  tar xzf "$W/zstd-$V.tar.gz" -C "$W"
fi
L="$W/zstd-$V/lib"
F="--target=wasm32 -Os -mbulk-memory -nostdlib -ffreestanding -fno-builtin-memcpy -fno-builtin-memset -DNDEBUG -DDEBUGLEVEL=0 -DZSTD_DISABLE_ASM -DZSTD_NO_TRACE -DZSTD_LEGACY_SUPPORT=0 -DHAVE_CONFIG_H=0 -include $PWD/zstd-freestanding.h -I$PWD/stubs -I$L -I$L/common"
LD="-Wl,--no-entry -Wl,--export=__heap_base -Wl,--initial-memory=1048576 -Wl,--max-memory=2147483648 -Wl,-z,stack-size=262144 -Wl,--strip-all -Wl,--global-base=1024"
COMMON="$L/common/entropy_common.c $L/common/error_private.c $L/common/fse_decompress.c $L/common/zstd_common.c $L/common/xxhash.c"
DEC="$L/decompress/huf_decompress.c $L/decompress/zstd_ddict.c $L/decompress/zstd_decompress.c $L/decompress/zstd_decompress_block.c"
ENC="$L/compress/fse_compress.c $L/compress/hist.c $L/compress/huf_compress.c $L/compress/zstd_compress.c $L/compress/zstd_compress_literals.c $L/compress/zstd_compress_sequences.c $L/compress/zstd_compress_superblock.c $L/compress/zstd_double_fast.c $L/compress/zstd_fast.c $L/compress/zstd_lazy.c $L/compress/zstd_ldm.c $L/compress/zstd_opt.c $L/compress/zstd_preSplit.c"
clang $F $LD -DZS_DECODE_ONLY -DZSTD_STRIP_ERROR_STRINGS -o zstd-dec.wasm zstd-glue.c $COMMON $DEC
clang $F $LD -o zstd-full.wasm zstd-glue.c $COMMON $DEC $ENC
wc -c zstd-dec.wasm zstd-full.wasm
