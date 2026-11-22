#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Builds the real-data work folder /tmp/real-corpus: real slices, the module files and the rival libraries.
# Needs the project files under /mnt/project-files (the retail, SEC and SBA uploads) and network access to npm.
set -eu
here=$(cd "$(dirname "$0")" && pwd); repo="$here/../.."; W=/tmp/real-corpus; PP=/tmp/pp
mkdir -p "$W" "$PP"
npm install --prefix "$PP" puppeteer-core esbuild papaparse fflate msgpackr fzstd jszip graphology graphology-components graphology-shortest-path dagre d3-sankey
cp "$here/gl-entry.js" "$here/ds-entry.js" "$PP/"
(cd "$PP" && ./node_modules/.bin/esbuild gl-entry.js --bundle --minify --format=iife --outfile="$W/gl.js" && ./node_modules/.bin/esbuild ds-entry.js --bundle --minify --format=iife --outfile="$W/d3s.js")
cp "$PP/node_modules/papaparse/papaparse.min.js" "$W/"; cp "$PP/node_modules/fflate/umd/index.js" "$W/fflate.js"; cp "$PP/node_modules/fzstd/umd/index.js" "$W/fzstd.js"; cp "$PP/node_modules/jszip/dist/jszip.min.js" "$W/"
cp "$PP/node_modules/msgpackr/dist/index.min.js" "$W/msgpackr.js"; cp "$PP/node_modules/dagre/dist/dagre.min.js" "$W/"
for m in text-columns lz4-kit zstd-kit memory-compression graph-walk netflow-layers netflow-sankey zip-open; do cp "$repo/modules/$m/$m.js" "$W/"; done
cp "$here/page.html" "$W/index.html"
node "$here/prep-slices.js" && node "$here/prep-layers.js" && node "$here/prep-sankey.js"
echo "ready: node tools/real-corpus/run.js chromium csv comp mem graph layers sankey sankeyq zip"
