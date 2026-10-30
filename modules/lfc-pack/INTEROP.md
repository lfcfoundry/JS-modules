# LFC-pack for other applications, format 1.0 (draft), part 3

Status: draft, like `SPEC.md` (container) and `LAYOUT-SPEC.md` (block layouts). File formats are not frozen until a formal release. This part is for people who build an app that reads or writes `.json.lfc` files, or hands them to another app. American English. MUST, SHOULD, MAY in the usual sense.

## 1. What an app can rely on
- The file extension is `.json.lfc`; the last four bytes are `LFC1`. A program can find LFC-pack files by those four bytes and need not trust the name.
- Proposed media type `application/vnd.lfc-pack` (not registered; waits for a release decision). Until then apps should use `application/octet-stream` and the extension. A `file(1)` rule would be: offset `-4` from the end, string `LFC1`. (Needs a reader that supports end-relative offsets; the first bytes of a file are a block, not a magic.)
- A file is a list of rows (JSON values, normally objects), optionally several named tables and plain values (`packTables`). Rows come back in the order they were written.
- The data model is JSON as `JSON.parse` reads it: numbers are doubles; integers above 2^53 are rounded to the nearest double unless the file is byte-exact (`exact: true` in footer section 12), where the original text comes back. `-0` is kept where the language has it.
- Value-exact files give the same rows as the source, not the same bytes. Byte-exact files give back the source bytes, including spacing, CRLF, blank lines and number spellings.

## 2. Reader levels
An app states which level it supports. A reader of a level MUST refuse (not guess at) anything above it.

| Level | Reads | Needs |
|---|---|---|
| R0 | container, footer, raw blocks (`r`), byte-exact files made of raw blocks | `SPEC.md` + a zstd decoder |
| R1 | R0 plus flat blocks (`f`) | `LAYOUT-SPEC.md` sections 1 and 2 |
| R2 | R1 plus nested blocks (`n`) | `LAYOUT-SPEC.md` section 3 |
| R3 | R2 plus footer sections 5 (zone maps), 9 (raw lines), 15 (number spellings): range skips and byte-exact output | `SPEC.md` 2.3, `LAYOUT-SPEC.md` 4 |

The reference readers are `lfc-pack.js` (R3), `python/lfc_pack.py` (R3) and the Go reader on branch `claude/project-thread-rmb60f` (passes the vectors including the byte-exact ones, so R3 on those files; see its report). Conformance for every level: decode all files in `vectors/` and `vectors/layout/` as described in the two specs.

## 3. Versioning and unknown parts
- The trailer holds format major and minor. A reader MUST refuse a major above its own. A higher minor MAY be read. Within one major, new things arrive only as: new optional footer sections, new keys in headers, meta or params, new ids in existing registries. A reader ignores unknown optional things.
- A new column type letter, block kind or required section (flag bit 0) makes a file unreadable to older readers, so it needs a new major, or a required section the old reader refuses cleanly (never a silent misread).
- Footer section ids: 1 to 15 belong to this format (8 and 13 reserved forever); 16 to 999 are reserved for later parts of this format; 1000 and up are for applications. An application section MUST be optional unless the file is meaningless without it; MUST carry its own name or version inside its payload; SHOULD stay under 1 MB.
- Until a formal release, the format may still change (private use only). After release, a change that breaks old readers needs a new major.

## 4. Writing files other apps can read
- Write sections 1, 2 and 12; write section 5 (zone maps) when you can. Keep blocks to whole lines. Check every CRC on read.
- Do not rely on key order; value-exact files do not keep it.
- Put app data you want to carry along in a section with id 1000 or more, or as an ordinary table (`packTables`). Never in a field the layouts define.
- Name the table when a file holds more than one kind of row.
- To share a file with an app that supports less, write rows as plain flat objects (smaller reader needed) or give the receiver R0 by writing byte-exact raw blocks only.

## 5. Safety for readers
Treat every file as untrusted input.
1. Cap sizes before allocating: the footer, section payloads, block table, every frame's declared raw length, and the sum of declared sizes. A frame that declares gigabytes is refused, not allocated.
2. Check every offset and length against the file size; blocks must lie between 0 and the footer start and not overlap the footer.
3. Check CRCs (block and footer) before trusting content. CRC-32 finds damage, not tampering: for authenticity use a signature outside the format.
4. Check every decoded frame size against the declared one; check column counts against the row count; check dictionary and template numbers against their tables; refuse bit widths above 24.
5. Build objects so that a key such as `__proto__` is a plain member (in JavaScript use `defineProperty`).
6. Limit recursion: shapes nest as deep as the data, so use an explicit stack or a depth cap (the writer sends rows nested 100 levels or deeper to shape `5`, which is JSON text).
7. A reader MUST NOT execute, evaluate or fetch anything named in a file.

## 6. Open points
- Media type registration and `file(1)` entry (release decision).
- A whole-file hash and per-block hash algorithm id are not written yet (`SPEC.md` 7).
- A registry file listing application section ids 1000 and up, so two apps do not pick the same id, does not exist yet; until then use your app name inside the payload.
