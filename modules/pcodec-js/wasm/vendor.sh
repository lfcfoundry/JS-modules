#!/bin/sh
# Makes wasm/vendor/pco: Pcodec 1.0.4 from crates.io plus pco-1.0.4-pcodec-js.patch (two small hunks in
# src/page_latent_decompressor.rs, Apache-2.0 like the rest of Pcodec). Run once before buildall.sh.
set -e
cd "$(dirname "$0")"
[ -d vendor/pco ] && { echo "vendor/pco already there"; exit 0; }
# Cargo.toml's [patch] needs vendor/pco to exist before cargo can resolve, so fetch the crate with a stub-free temp project
TMP=$(mktemp -d)
mkdir -p "$TMP/src"; echo "" > "$TMP/src/lib.rs"
printf '[package]\nname="x"\nversion="0.0.0"\nedition="2021"\n[dependencies]\npco={version="=1.0.4",default-features=false}\n' > "$TMP/Cargo.toml"
(cd "$TMP" && cargo fetch)
SRC=$(ls -d "$HOME"/.cargo/registry/src/*/pco-1.0.4 | head -1)
mkdir -p vendor
cp -r "$SRC" vendor/pco
rm -rf "$TMP"
(cd vendor && patch -p1 --directory=pco -s < ../pco-1.0.4-pcodec-js.patch)
echo "vendor/pco ready"
