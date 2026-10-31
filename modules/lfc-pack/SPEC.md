# LFC-pack file container, format 1.0 (draft)

Status: draft. File formats are not frozen until a formal release; this text describes what `lfc-pack.js` (JavaScript) and `python/lfc_pack.py` (Python) both read and write today. The words MUST, SHOULD and MAY are used in the usual sense. American English. All integers are little-endian.

Part 1 (this file) is the container: how to find the blocks and the index, and what every reader must do. Part 2, [LAYOUT-SPEC.md](LAYOUT-SPEC.md), is the byte layout inside the flat (`f`) and nested (`n`) blocks. The raw block (`r`) is fully specified here.

## 1. Names
- Name: LFC-pack. File extension `.json.lfc`. Magic `LFC1` (bytes 4C 46 43 31). Global in the browser: `LfcPack`.
- No media type is named yet (owner decision 2026.10.30: decide at the formal release). Identify files by the extension and the magic bytes.
- A file holds one or more tables of rows. A row is one JSON value, normally an object, stored the way NDJSON stores a line.

## 2. Layout
```
[ block 0 ][ block 1 ] ... [ block N-1 ][ footer ][ trailer, 16 bytes ]
```
Blocks come first so a writer can stream them out. Readers start from the end.

### 2.1 Trailer (the last 16 bytes)
| Bytes | Field |
|---|---|
| 0-3 | footer length `flen` (u32) |
| 4-7 | CRC-32 of the footer bytes (zlib polynomial 0xEDB88320, the same as zlib.crc32) |
| 8-9 | format major (u16). This text is major 1. |
| 10-11 | format minor (u16). This text is minor 0. |
| 12-15 | magic `LFC1` |

Reader rules: the last four bytes MUST be the magic, else it is not an LFC-pack file. A major above the reader's own MUST be refused. A higher minor MAY be read; unknown optional parts are ignored. `flen` MUST NOT exceed file length minus 16. The footer CRC MUST be checked.

### 2.2 Footer
The footer is the `flen` bytes before the trailer. Byte 0 says how the rest is stored: `0` = plain, `1` = one zstd frame (the writer uses level 3). The decoded body is a list of sections until the end (a body that ends in the middle of a section header or payload is damaged and MUST be refused):

| Bytes | Field |
|---|---|
| 0-1 | section id (u16) |
| 2-3 | flags (u16): bit 0 REQUIRED |
| 4-7 | payload length (u32) |
| 8.. | payload |

A reader MUST skip a section whose id it does not know, unless bit 0 is set, in which case it MUST refuse the file. Each id appears at most once (a reader SHOULD refuse a footer that repeats one). Sections 1, 2 and 12 MUST be present (refuse the file if one is missing). `flen` is at least 1 (the encoding byte). Ids 8 and 13 are treated like any unknown id. Ids 8 and 13 are reserved and never reused. Ids 1000 and up are for applications.

### 2.3 Sections written today
Payloads that are JSON are UTF-8 text.

| Id | Flags | Payload |
|---|---|---|
| 1 header | required | JSON `{rows, blocks, writer}`; files with several tables also carry `tables: [[name, "rows"\|"value"], ...]`, and each block's `tableIndex` points into that list. The rows of one table are its blocks' rows in block order. A table of kind `value` holds exactly one row, an object `{"v": value}`; the value is its `v` member. `rows` is the total over all tables. |
| 2 block table | required | JSON array, one entry per block: `[offset, length, crc32, rows, kind, tableIndex]`, optionally followed by a seventh item: the XXH64 (seed 0) of the block bytes as 16 lowercase hex digits (see 2.4) |
| 5 zone maps | optional | JSON array, one entry per block: a list of `[hash, min, max, count]` per number column (hash is FNV-1a of `"." + key`, as the reference code computes it); a block whose range for a key does not meet a query range can be skipped |
| 12 feature flags | required | JSON `{exact: bool, tail: bool}`. `tail: false` means the last line had no final newline. |
| 6 metadata | optional | JSON `{v: 1, ...}` an app chose to carry with the file (title, producer, tables and columns, anything else); at most 64 KB; readers MUST NOT use it for decoding. See `PROPOSAL-metadata-section.md`. |
| 9 raw-line store | required when present | byte-exact files only: u32 `hl`, `hl` bytes of JSON `{blockIndex: [[row, byteLength], ...]}`, then the raw bytes of those rows. `blockIndex` is the block's number in the block table written as decimal text; `row` is the row's 0-based position inside that block (blank lines are not rows); the raw bytes are one row's line without its LF, may be empty, and follow one after another in the order the JSON lists them (blocks ascending, rows ascending). Those rows are returned verbatim instead of re-serialized. |
| 15 number spellings | required when present | byte-exact files only: JSON `{blockIndex: [[row, [[tokenIndex, text], ...]], ...]}`; the row is the canonical text with the listed number tokens replaced by `text`. A number token is a maximal match of the JSON number grammar `-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?` in the canonical text outside string literals (object keys are strings, so they never count); tokens are counted from 0, left to right, in the canonical text before any replacement; `row` is the 0-based position inside the block. |
| 16 shared tables | required when present | nested blocks written with `share: true`: JSON `{v: 1, s: [strings], k: [shape texts]}`, the strings and shapes that blocks with header `g: 1` point to by code. See `LAYOUT-SPEC.md` 3.6. |

Ids 3, 4, 7, 10, 11, 14 are reserved for the index, Bloom filter, record-type map and file hash described in the design notes; a reader MUST accept and ignore them.

### 2.4 Block table entry
Optional seventh item `xxh64`: writers that add it MUST still write the correct `crc32`. A reader that supports XXH64 MAY check the block with `xxh64` alone and skip `crc32` (about 2.5 to 3 times faster in WebAssembly); a reader that does not, or finds an item that is not 16 lowercase hex digits, checks `crc32` as before. Readers MUST ignore any further items.

Flat blocks written with `check: 'xxh64'` also carry an eighth item `[prefixLength, xxh64]`: the XXH64 of the first `prefixLength` bytes of the block (length word, header, meta, planes and any key-order frames, everything before the first column frame). Their flat meta then has, per column, `o` (offset of the column's first frame counted from the first column frame) and `x` (XXH64 of all the column's frames, 16 hex digits). A reader that wants only some columns MAY check the prefix and just those columns instead of the whole block, and skip the other columns without walking past them. A reader that wants all columns checks the whole block as before; readers that ignore the extra items stay correct.

Writers write the blocks in table order, one after the other, starting at offset 0, so each block starts where the previous one ends and the last one ends where the footer starts. A reader only has to check that every block lies inside that range. `offset` and `length` locate the block bytes from the start of the file (`offset + length` MUST NOT pass the end of the last block, the start of the footer). `crc32` is the CRC-32 of those bytes and MUST be checked before use. `rows` is the row count. `kind` is one character: `f` flat block, `n` nested block, `r` raw block. `tableIndex` (default 0) names the table in the header.

## 3. Reading
1. Read the last 16 bytes, then the footer; check magic, major, lengths and CRC.
2. Read the block table. For each wanted block, read its bytes, check the CRC, decode by kind.
3. Rows come out in block order, then row order inside the block, which is the original order.
4. Value meaning: numbers are IEEE-754 doubles, as `JSON.parse` reads them. An integer above 2^53 therefore reads back as the nearest double; only a byte-exact file (`exact: true`) returns the original digits. `-0` stays `-0` in JavaScript; a language without negative-zero integers reads `0`.
5. **Canonical JSON text** is exactly what JavaScript's `JSON.stringify` writes for the row: no spaces; strings escape only `"` `\` and the control characters (`\b \f \n \r \t`, every other character below U+0020 as `\u00xx` in lowercase hex) and lone surrogates (as `\udxxx`, lowercase); U+007F, U+2028 and all other characters are written as themselves; numbers are JavaScript's shortest round-trip text (`1e+21`, `5e-324`, `0.1`, whole numbers without `.0`, `-0` as `0`); object members in JavaScript order: keys that are array indexes (`0` to `4294967294`, no leading zeros) first in ascending order, then the other keys in the order the file kept (first-seen order inside a flat block, shape order inside a nested block). A number outside the double range (such as `1e999`) is outside the format: the reference writer keeps it as infinity and the canonical text writes `null`; other writers SHOULD NOT produce it. Output of a value-exact file is that text of each row, each followed by LF. **Byte-exact assembly.** For each block in order: a raw block contributes its text unchanged; for a flat or nested block, row `i` is the verbatim bytes from section 9 when the block's list has an entry for `i`, otherwise the canonical text with the spellings from section 15 put back, and each row is followed by LF. When the flags say `tail` is false and the last block is not a raw block, the final LF of the whole output is removed. `exact` defaults to false and `tail` to true when absent. Sections 9 and 15 are only written by byte-exact files. Output of a byte-exact file is the input bytes, including blank lines, spacing, number spellings and a missing final newline.

## 4. Raw block (`r`)
`u32 n` (length of the original text) followed by one zstd frame holding that text. The text is whole lines separated by LF. A line is blank when it holds only spaces, tabs and carriage returns; a row is a non-blank line. The `rows` entry of the block table counts every line, blank ones included: the number of LF-terminated lines plus one for an unterminated last line (readers need not check it). Value-exact reading parses each non-blank line as JSON after decoding the text as UTF-8; text that is not valid UTF-8 MUST be refused. Writers use it in byte-exact mode for text that is not plain rows (CRLF, blank lines, invalid UTF-8). A raw block can be decoded by any zstd library.

## 5. Conformance
`vectors/` holds eight small sources (`NAME.ndjson`), their value-exact files (`NAME.json.lfc`) and their byte-exact files (`NAME.x.json.lfc`). They are all flat blocks; `vectors/layout/` adds files that use the nested block and every flat column type (see `LAYOUT-SPEC.md` 7; `node test/genlayout.cjs` writes them, `python3 test/layoutcheck.py` checks the byte layout, `python3 test/pylayout.py` runs the Python reader). A reader passes when:
- every `NAME.json.lfc` decodes to the rows of `json.loads` over the `.ndjson` lines (numbers compared as doubles),
- every `NAME.x.json.lfc` returns the `.ndjson` bytes exactly.

`node test/vectors.cjs` runs this for the JavaScript reader and `python3 test/pyvectors.py` for the Python reader. `node test/vectors.cjs --update` rewrites the files; do that only when the format changes on purpose, and say so in the changelog.

## 6. For writers
- Blocks hold whole lines. The default block target is 13 MB of input text (21 MB before 0.2.0).
- A writer MUST write sections 1, 2 and 12, SHOULD write section 5, and MUST write sections 9 and 15 only for byte-exact files with exceptions.
- Do not write a section id above 1000 as REQUIRED unless the file cannot be understood without it.

## 7. Open points
- Footer sections are JSON today; a compact binary form is possible and would only change section payloads, not the container.
- Whole-file hash (design notes: XXH3-128) and per-block hash algorithm id are not implemented; CRC-32 is the only checksum.
- Media type naming, registration and a magic-number entry for `file(1)` wait for a release decision.
