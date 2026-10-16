#!/bin/bash
# The whole single-file pipeline, as used for Apple Press, in one place. Each step is optional.
# Part of JS-modules, https://github.com/JNFoo/JS-modules. Copyright (c) 2026 LFC Foundry. MIT License.
# Usage: ./build-example.sh game.html            (writes game.slim.html and game.small.html next to it)
# Works from any folder: the tools are found next to this script, the input path is taken as you type it.
# Needs: pip install fonttools brotli zopfli ; npm i svgo terser html-minifier-terser
set -e
here="$(cd "$(dirname "$0")" && pwd)"
if [ -z "$1" ] || [ ! -f "$1" ]; then echo "usage: build-example.sh game.html   (input file not found: '$1')" >&2; exit 1; fi
in="$1"; base="${in%.html}"
python3 "$here/optfonts.py" "$in" "$base.fonts.html" --report   # 1. subset embedded fonts to the characters used
node "$here/optsvg.js" "$base.fonts.html" "$base.svg.html"      # 2. tighten inline SVG (nothing renamed or merged)
npx html-minifier-terser --collapse-whitespace --conservative-collapse --remove-comments --minify-css true --minify-js true \
  -o "$base.slim.html" "$base.svg.html"                         # 3. minify HTML, CSS, JS
python3 "$here/pack.py" "$base.slim.html" "$base.small.html" "$(basename "$base")"   # 4. self-extracting Zopfli copy
rm -f "$base.fonts.html" "$base.svg.html"
ls -l "$in" "$base.slim.html" "$base.small.html"
