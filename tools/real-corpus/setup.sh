#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds the real-data work folder /tmp/real-corpus: real slices, the module files and the rival libraries.
# Needs the project files under /mnt/project-files (the retail, SEC and SBA uploads) and network access to npm.
set -eu
here=$(cd "$(dirname "$0")" && pwd); repo="$here/../.."; W=/tmp/real-corpus; PP=/tmp/pp
mkdir -p "$W" "$PP"
npm install --prefix "$PP" puppeteer-core esbuild papaparse fflate msgpackr fzstd jszip d3-hierarchy lzma gifenc graphology graphology-components graphology-shortest-path dagre d3-sankey lz4js@0.2.0 lz4-wasm@0.9.2
cp "$here/gl-entry.js" "$here/ds-entry.js" "$PP/"
(cd "$PP" && ./node_modules/.bin/esbuild gl-entry.js --bundle --minify --format=iife --outfile="$W/gl.js" && ./node_modules/.bin/esbuild ds-entry.js --bundle --minify --format=iife --outfile="$W/d3s.js")
cp "$PP/node_modules/papaparse/papaparse.min.js" "$W/"; cp "$PP/node_modules/fflate/umd/index.js" "$W/fflate.js"; cp "$PP/node_modules/fzstd/umd/index.js" "$W/fzstd.js"; cp "$PP/node_modules/jszip/dist/jszip.min.js" "$W/"
cp "$PP/node_modules/msgpackr/dist/index.min.js" "$W/msgpackr.js"; cp "$PP/node_modules/dagre/dist/dagre.min.js" "$W/"
for m in text-columns lz4-kit zstd-kit memory-compression graph-walk netflow-layers netflow-sankey zip-open; do cp "$repo/modules/$m/$m.js" "$W/"; done
cp "$PP/node_modules/d3-hierarchy/dist/d3-hierarchy.min.js" "$W/" 2>/dev/null || true; cp "$here/d3h-entry.js" "$PP/"; (cd "$PP" && ./node_modules/.bin/esbuild d3h-entry.js --bundle --minify --format=iife --outfile="$W/d3h.js"); cp "$repo/modules/netflow-hierarchy/netflow-hierarchy.js" "$W/"
cp "$PP/node_modules/lzma/src/lzma-d-min.js" "$W/lzmajs.js"; cp "$repo/modules/lzma-decode/lzma-decode-with-wasm.js" "$W/"
cp "$repo/modules/pcodec-js/pcodec-js-pack.js" "$W/"
cp "$here/ge-entry.js" "$PP/"; (cd "$PP" && ./node_modules/.bin/esbuild ge-entry.js --bundle --minify --format=iife --outfile="$W/ge.js"); cp "$repo/modules/gif-writer/gif-writer.js" "$W/"
mkdir -p "$W/lz4r" && cp "$PP/node_modules/lz4js/lz4.js" "$PP/node_modules/lz4js/util.js" "$PP/node_modules/lz4js/xxh32.js" "$PP/node_modules/lz4-wasm/lz4_wasm_bg.wasm" "$W/lz4r/" && sed '1s#.*#let wasm; export function __wbg_set_wasm(v){wasm=v}#' "$PP/node_modules/lz4-wasm/lz4_wasm_bg.js" > "$W/lz4r/lz4_wasm_bg.js"
cp "$here/page.html" "$W/index.html"
node "$here/prep-slices.js" && node "$here/prep-layers.js" && node "$here/prep-sankey.js" && node "$here/prep-floats.js" && node "$here/prep-trees.js" && node "$here/prep-lzma.js" && node "$here/prep-fhir.js"
echo "ready: node tools/real-corpus/run.js chromium csv comp mem graph layers sankey sankeyq zip"
