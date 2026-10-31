# lzma-pack developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 2.0.0 · API 2 · 2026-10-18

### Quick
Packed pages now carry the WebAssembly decoder by default (about 4.5 KB or 3% bigger, opens faster); --no-wasm gives the old smaller page. --wasm still works.

### Deep
BREAKING DEFAULT (major, API 2): packed pages now carry the 4,087-byte WebAssembly decoder by default, behind the LZMA data; the loader tries it first and uses the JavaScript decoder when it is missing, refused or wrong. New --no-wasm gives the old page; --wasm still works (it is the default) and still refuses lc + lp above 4, while the default quietly leaves WebAssembly out in that case. pack(..., wasm=None) is the new default (True insists, False leaves it out). Page size, Pineapple Defense without a minifier (smaller is better): 154496 bytes with --no-wasm, 159028 by default (+4532, +2.9%). Time until the unpacked page starts, --no-wasm to default (lower is better): ungoogled-chromium 155.0.8059.39-1 105.5 ms to 77.4 ms (1.36x); Firefox 158.0 94.0 ms to 75.0 ms (1.25x); WebKitGTK 2.52.6 84.0 ms to 73.0 ms (1.15x); GNOME Web 46.5 104.0 ms to 90.0 ms (1.16x). Tests: 25 lzma-pack checks (3 rewritten for the new default).

## 1.1.2 · API 1 · 2026-10-17

### Quick
Faster packing with identical pages: choosing the key took seconds before and now takes a fraction of a second.

### Deep
Faster packing with the same pages: choosing the XOR key that needs the fewest escapes (bytes mode) no longer tries all 256 keys over the whole payload; it counts single bytes and byte pairs once. Choosing the key for a 190 KB payload went from 6.9 s to 0.04 s (172 times faster; lower is better) and picks the same key (a new check compares it with the old way on 6 test payloads); packing a 38 KB page went from 0.53 s to 0.06 s and the output file is identical. The tool's own test went from 2.2 s to about 1 s

## 1.1.1 · API 1 · 2026-10-17

### Quick
A page policy given to the packer now always allows WebAssembly, the one addition the project allows, so the faster decoder is used.

### Deep
Every page policy given with --head now carries 'wasm-unsafe-eval' in script-src, the one addition the project allows. Before: the packer only printed a warning when --head set a policy without it, and the page quietly fell back to the slower JavaScript decoder (the first decode took about 2.1x as long in Chromium and 1.7x as long in Firefox without WebAssembly; measured on a 569,513-byte game page). After: the packer adds the token itself (4 of 4 browsers ran the WebAssembly decoder from a policy given without it); a policy with no script-src but a default-src gets a script-src built from the default-src sources plus the token, a policy that says nothing about scripts is left alone, and a page with no --head policy still gets none. Nothing else in the policy changes.

## 1.1.0 · API 1 · 2026-10-17

### Quick
New optional --wasm adds the WebAssembly decoder to the packed page (about 3% bigger), which starts 14 to 30 ms sooner on a desktop.

### Deep
New option --wasm (off by default): the packed page also carries the WebAssembly LZMA decoder and tries it first, with the JavaScript decoder as the fallback. The page grows by about 4.5 KB (148,360 to 152,880 bytes for Pineapple Defense, +3.0%; smaller is better) and starts 14 to 30 ms sooner on a desktop (ungoogled-chromium 155: 104.0 to 77.7 ms; Firefox 158.0: 150.0 to 132.0; WebKitGTK 2.52.6: 84.0 to 70.0; GNOME Web 46.5: 111.0 to 88.0; smaller is better). The page needs wasm-unsafe-eval in its Content-Security-Policy to use it; without it, Chromium and Firefox fall back by themselves. The packer's own check now runs the loader four ways in Node (with the decoder, no WebAssembly, refused WebAssembly, wrong length) and the packer says so when --head sets a policy without wasm-unsafe-eval. Without --wasm, and with a minifier, the packed pages are byte for byte the same as before (checked on Pineapple Defense and the example page, both encodings).

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
