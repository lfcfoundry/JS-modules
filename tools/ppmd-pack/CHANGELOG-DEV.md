# ppmd-pack developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 2.0.0 · API 2 · 2026-10-18

### Quick
Packed pages now carry the WebAssembly decoder by default (about 9.8 KB or 5% bigger, opens faster); --no-wasm gives the old smaller page. --wasm still works.

### Deep
BREAKING DEFAULT (major, API 2): packed pages now carry the 9,317-byte WebAssembly PPMd decoder by default, behind the PPMd data; the loader tries it first and uses the JavaScript decoder when it is missing, refused or wrong. New --no-wasm gives the old page; --wasm still works (it is the default) and still stops with an error for a model memory over 1 GB, while the default quietly leaves WebAssembly out then. --compare now builds the LZMA page with WebAssembly exactly when the PPMd page has it. Page size, Pineapple Defense without a minifier (smaller is better): 160450 bytes with --no-wasm, 170155 by default (+9705, +6.0%). Time until the unpacked page starts, --no-wasm to default (lower is better): ungoogled-chromium 155.0.8059.39-1 256.0 ms to 165.0 ms (1.55x); Firefox 158.0 283.0 ms to 173.0 ms (1.64x); WebKitGTK 2.52.6 189.0 ms to 151.0 ms (1.25x); GNOME Web 46.5 228.0 ms to 185.0 ms (1.23x). Tests: 30 ppmd-pack checks (3 rewritten for the new default).

## 1.1.1 · API 1 · 2026-10-17

### Quick
Faster packing with identical pages: key choice no longer tries every option.

### Deep
Faster packing with the same pages: it uses lzma-pack's new byte-pair counting to choose the XOR key instead of trying all 256 keys over the payload (the key search was 11.7 of the 17 s the test took when profiled). Packing a 38 KB page went from 0.77 s to 0.35 s (2.2 times faster; lower is better) with an identical output file; the tool's own test went from 6.5 s to 4.1 s. The PPMd encoder itself is unchanged and is now most of the time

## 1.1.0 · API 1 · 2026-10-17

### Quick
New optional --wasm ships the WebAssembly decoder in the packed page. Pages open about 1.5 to 2.1 times faster, and pages that forbid WebAssembly still open.

### Deep
New and optional: --wasm also ships the WebAssembly PPMd decoder (modules/ppmd-decode/wasm/ppmd7.wasm, 9,317 bytes, stored raw behind the PPMd data). The loader tries it first and falls back to the JavaScript decoder, which stays in the page, so a page whose policy forbids WebAssembly still opens. Measured on the 703,049-byte Apple Press page (median of 5 fresh page loads; time until the page is unpacked, lower is better): PPMd 313 to 194 ms in ungoogled Chromium 155 (1.6 times faster), 313 to 204 in Firefox 158 (1.5 times), 392 to 184 in WebKitGTK 2.52.6 (2.1 times), 376 to 182 in GNOME Web 46.5 (2.1 times). The page grows by 9,760 bytes (188,602 to 198,362; smaller is better), so with --wasm it is 6.8 KB bigger than the LZMA page (191,584) and still opens 1.6 to 3 times slower than it (LZMA 106 to 120 ms); use it only when PPMd wins by more than that, or when the PPMd page is already chosen. The self-check now runs the page four ways in Node (plain, WebAssembly, WebAssembly refused, decoder answering wrongly); 6 new checks, 30 in all (24 before). Pages made without --wasm are byte for byte what 1.0.1 made (checked on the Apple Press page).

## 1.0.2 · API 1 · 2026-10-17

### Quick
A page policy given to the packer now allows WebAssembly, as lzma-pack does.

### Deep
Same page-policy rule as lzma-pack 1.1.1: a Content-Security-Policy given with --head now carries 'wasm-unsafe-eval' in script-src (the packer reuses lzma-pack's rewrite). Before: nothing was added or warned about. After: the token is added (1 new check; 24 of 24 packer checks pass, 3 skipped as before), everything else in the policy is unchanged, and a page with no --head policy still gets none. This makes the coming --wasm mode work under a page policy without a manual edit.

## 1.0.1 · API 1 · 2026-10-17

### Quick
Fixed: packing failed every time unless you skipped the Node check. It works again.

### Deep
Fixed: packing a page failed every time with 'TypeError: Cannot read properties of undefined (reading forEach)' unless you passed --skip-node-check, since lzma-pack 1.1.0 changed the Node check it shares (7 of the 26 tool checks failed). It now asks the shared check for the plain mode only, as before, and reads its list of answers. After the fix: 23 of 23 checks that can run here pass, and the Node check runs again (nothing else changes in the packed page).

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
