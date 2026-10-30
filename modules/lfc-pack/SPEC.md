# LFC-pack file container, format 1.0 (draft)

Status: draft. File formats are not frozen until a formal release; this text describes what `lfc-pack.js` (JavaScript) and `python/lfc_pack.py` (Python) both read and write today. The words MUST, SHOULD and MAY are used in the usual sense. American English. All integers are little-endian.

Part 1 (this file) is the container: how to find the blocks and the index, and what every reader must do. Part 2, [LAYOUT-SPEC.md](LAYOUT-SPEC.md), is the byte layout inside the flat (`f`) and nested (`n`) blocks. The raw block (`r`) is fully specified here.

## 1. Names
- Name: LFC-pack. File extension `.json.lfc`. Magic `LFC1` (bytes 4C 46 43 31). Global in the browser: `LfcPack`.
- Proposed media type (not registered, needs a decision): `application/vnd.lfc-pack`.
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
The footer is the `flen` bytes before the trailer. Byte 0 says how the rest is stored: `0` = plain, `1` = one zstd frame (the writer uses level 3). The decoded body is a list of sections until the end:

| Bytes | Field |
|---|---|
| 0-1 | section id (u16) |
| 2-3 | flags (u16): bit 0 REQUIRED |
| 4-7 | payload length (u32) |
| 8.. | payload |

A reader MUST skip a section whose id it does not know, unless bit 0 is set, in which case it MUST refuse the file. Ids 8 and 13 are reserved and never reused. Ids 1000 and up are for applications.

### 2.3 Sections written today
Payloads that are JSON are UTF-8 text.

| Id | Flags | Payload |
|---|---|---|
| 1 header | required | JSON `{rows, blocks, writer}`; files with several tables also carry `tables: [[name, "rows"\|"value"], ...]` |
| 2 block table | required | JSON array, one entry per block: `[offset, length, crc32, rows, kind, tableIndex]` |
| 5 zone maps | optional | JSON array, one entry per block: a list of `[hash, min, max, count]` per number column (hash is FNV-1a of `"." + key`, as the reference code computes it); a block whose range for a key does not meet a query range can be skipped |
| 12 feature flags | required | JSON `{exact: bool, tail: bool}`. `tail: false` means the last line had no final newline. |
| 9 raw-line store | required when present | byte-exact files only: u32 `hl`, `hl` bytes of JSON `{blockIndex: [[row, byteLength], ...]}`, then the raw bytes of those rows in the same order. Those rows are returned verbatim instead of re-serialized. |
| 15 number spellings | required when present | byte-exact files only: JSON `{blockIndex: [[row, [[tokenIndex, text], ...]], ...]}`; the row is the canonical text with the listed number tokens (left to right, outside strings) replaced by `text` |

Ids 3, 4, 6, 7, 10, 11, 14 are reserved for the index, Bloom filter, metadata, record-type map and file hash described in the design notes; a reader MUST accept and ignore them.

### 2.4 Block table entry
`offset` and `length` locate the block bytes from the start of the file (`offset + length` MUST NOT pass the end of the last block, the start of the footer). `crc32` is the CRC-32 of those bytes and MUST be checked before use. `rows` is the row count. `kind` is one character: `f` flat block, `n` nested block, `r` raw block. `tableIndex` (default 0) names the table in the header.

## 3. Reading
1. Read the last 16 bytes, then the footer; check magic, major, lengths and CRC.
2. Read the block table. For each wanted block, read its bytes, check the CRC, decode by kind.
3. Rows come out in block order, then row order inside the block, which is the original order.
4. Value meaning: numbers are IEEE-754 doubles, as `JSON.parse` reads them. An integer above 2^53 therefore reads back as the nearest double; only a byte-exact file (`exact: true`) returns the original digits. `-0` stays `-0` in JavaScript; a language without negative-zero integers reads `0`.
5. Output of a value-exact file is the canonical JSON text of each row (no spaces, JavaScript string escapes). Output of a byte-exact file is the input bytes, including blank lines, spacing, number spellings and a missing final newline.

## 4. Raw block (`r`)
`u32 n` (length of the original text) followed by one zstd frame holding that text. The text is whole lines separated by LF; a row is a non-blank line; the row count in the table is the number of LF-terminated lines plus one for an unterminated last line. Writers use it in byte-exact mode for text that is not plain rows (CRLF, blank lines, invalid UTF-8). A raw block can be decoded by any zstd library.

## 5. Conformance
`vectors/` holds eight small sources (`NAME.ndjson`), their value-exact files (`NAME.json.lfc`) and their byte-exact files (`NAME.x.json.lfc`). A reader passes when:
- every `NAME.json.lfc` decodes to the rows of `json.loads` over the `.ndjson` lines (numbers compared as doubles),
- every `NAME.x.json.lfc` returns the `.ndjson` bytes exactly.

`node test/vectors.cjs` runs this for the JavaScript reader and `python3 test/pyvectors.py` for the Python reader. `node test/vectors.cjs --update` rewrites the files; do that only when the format changes on purpose, and say so in the changelog.

## 6. For writers
- Blocks hold whole lines. The default block target is 21 MB of input text.
- A writer MUST write sections 1, 2 and 12, SHOULD write section 5, and MUST write sections 9 and 15 only for byte-exact files with exceptions.
- Do not write a section id above 1000 as REQUIRED unless the file cannot be understood without it.

## 7. Open points
- Footer sections are JSON today; a compact binary form is possible and would only change section payloads, not the container.
- Whole-file hash (design notes: XXH3-128) and per-block hash algorithm id are not implemented; CRC-32 is the only checksum.
- Media type registration and a magic-number entry for `file(1)` wait for a release decision.
