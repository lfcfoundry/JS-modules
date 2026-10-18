# ppmd-pack changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.1.1 · API 1 · 2026-10-17
- Faster packing with identical pages: key choice no longer tries every option.

## 1.1.0 · API 1 · 2026-10-17
- New optional --wasm ships the WebAssembly decoder in the packed page. Pages open about 1.5 to 2.1 times faster, and pages that forbid WebAssembly still open.

## 1.0.2 · API 1 · 2026-10-17
- A page policy given to the packer now allows WebAssembly, as lzma-pack does.

## 1.0.1 · API 1 · 2026-10-17
- Fixed: packing failed every time unless you skipped the Node check. It works again.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- 2026-10-15: New tool: packs one HTML file with PPMd; a pure Python encoder, byte-identical to 7-Zip's.
- 2026-10-15: Every packed page now starts with a credit comment (Shkarin, Pavlov, 7-Zip).
- 2026-10-16: Examples rebuilt so their credit link points at lfcfoundry.
