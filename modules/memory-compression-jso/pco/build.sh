#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Rebuilds pco/mcjso-pco.wasm from pco/src (needs Rust with the wasm32-unknown-unknown target: `rustup target add wasm32-unknown-unknown`).
# Cargo.lock is checked in, so the same pco 1.0.4 sources are used every time. Then run `python3 pco/embed.py` to put the program into memory-compression-jso-pco.js.
set -e
cd "$(dirname "$0")"
cargo build --release --locked --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/mcjso_pco.wasm mcjso-pco.wasm
ls -l mcjso-pco.wasm
sha256sum mcjso-pco.wasm
