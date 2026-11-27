# Third-party code in this folder

These files are rivals for the Elias-Fano tester (`../elias-fano-vs-rivals-tester.html`). They run only as comparisons and are not part of any module.

- `roaring.mjs`: roaring-wasm 1.1.0 by Salvatore Previti and contributors (https://github.com/SalvatorePreviti/roaring-wasm), a WebAssembly build of CRoaring (Daniel Lemire and contributors). Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0). Unchanged.
- `FastIntegerCompression.js`: FastIntegerCompression.js 0.1.0 by Daniel Lemire and contributors (https://github.com/lemire/FastIntegerCompression.js). Apache License 2.0. Unchanged, used for size only.
- `rivals.wasm` is built from `rivals.c`, our own measure-only prototypes (BP128-style, Stream VByte-style and interpolative coding). MIT, Copyright (c) 2026 LFC Foundry.

The `.bin.gz` files are sorted row-id lists taken from real public data sets (retail, SBA, SEC) and from the generated-patient FHIR training set.
