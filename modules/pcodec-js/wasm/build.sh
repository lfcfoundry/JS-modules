#!/bin/sh
# usage: build.sh NAME "FEATURES" [OPT] [SIMD=0|1]  -> ../wasm/NAME.wasm
set -e
cd "$(dirname "$0")"
NAME=$1; FEAT=$2; OPT=${3:-z}; SIMD=${4:-0}
FLAGS=""; [ "$SIMD" = 1 ] && FLAGS="-C target-feature=+simd128"
RUSTFLAGS="$FLAGS --remap-path-prefix=$PWD=/pcodec-js --remap-path-prefix=$HOME/.cargo=/cargo --remap-path-prefix=$HOME/.rustup=/rustup" CARGO_PROFILE_RELEASE_OPT_LEVEL=$OPT cargo build --release --locked --target wasm32-unknown-unknown --features "$FEAT" --target-dir target-$NAME
cp target-$NAME/wasm32-unknown-unknown/release/pcodec_js.wasm ../work/wasm/$NAME.wasm
ls -l ../work/wasm/$NAME.wasm | awk '{print $5, $9}'
