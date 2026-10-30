# LFC-pack block layouts, format 1.0 (draft), part 2

Status: draft. File formats are not frozen until a formal release. This is part 2 of the container spec in `SPEC.md`: the bytes inside the flat block (`f`) and the nested block (`n`). The raw block (`r`) is in `SPEC.md` section 4. It describes what `src/flat.js`, `src/nested.js`, `src/shred.js` and `python/lfc_pack.py` read and write today (lfc-pack 0.1.9 to 0.1.11; no layout changed in between). MUST, SHOULD and MAY are used in the usual sense. American English. All integers are little-endian.

How this text was checked: `test/layoutcheck.py` was written from this text alone. It walks every block in `vectors/*.json.lfc` and `vectors/layout/*.json.lfc`, decodes every frame, and fails if a frame is missing, out of order, the wrong size, has no content size, or if any byte of a block is left over. Both readers (JavaScript and Python) also decode every file in `vectors/layout/`. Section 8 lists what the check found.

## 1. Building blocks

### 1.1 Block, header, frames
A block is the byte range named by the block table (`SPEC.md` 2.4). It always starts with:

```
u32 hl | header JSON (hl bytes, UTF-8) | frames, one after the other, to the end of the block
```

The header always has `"k"`: `"f"` for a flat block, `"n"` for a nested block, and `"n"`: the row count. The rest of the header differs (sections 2 and 3). The header says how long every frame is, so a reader can cut them out in order. Nothing may follow the last frame: a reader SHOULD reject a block with bytes left over.

A frame is one complete Zstandard frame (RFC 8878): one frame only, no dictionary, no skippable frames, content size present in the frame header (libzstd writes it when the input size is known, which every writer here does). The compression level is the writer's choice and is not recorded. A reader MAY decode with the raw length the layout declares and MUST refuse a frame whose result is a different size.

Two places say "a frame" but allow a stored copy: the column frames of a flat block carry a stored flag (section 2.4). Everything else is always a Zstandard frame, even when it is tiny or empty (an empty input still gives a 9 to 13 byte frame).

### 1.2 Number encodings used below
- **Varint**: unsigned, 7 bits per byte, least significant group first, bit 7 of a byte set means another byte follows. Writers write the shortest form. Values reach 2^51, so readers MUST NOT use 32-bit shifts: add `(byte & 127) * 128^k`.
- **Zigzag**: `z(x) = x >= 0 ? 2x : -2x - 1`; back: `unz(u) = u even ? u / 2 : -(u + 1) / 2`. Use arithmetic, not bit operations, because values pass 32 bits.
- **Bit packing, width w**: value `i` takes bits `i*w` to `i*w + w - 1` of the stream; bit `k` of the stream is bit `k & 7` of byte `k >> 3`; inside a value the least significant bit comes first. The byte length is `ceil(n*w / 8)`; unused high bits of the last byte are 0. **Width limit:** every bit-packed field in this format has `w <= 24` (`B` at most 24, `T` is 1, `D` at most 16). A value then spans at most 4 bytes (24 bits plus a start offset of up to 7 bits is 31 bits), so a reader needs a 32-bit window only. The JavaScript writer builds a value from at most 4 bytes, so it could not write wider; the Python reader's 5-byte window (up to 33 bits) and the JavaScript reader's 4-byte window agree on every legal file. A reader MUST refuse `w > 24` or `w < 1`.
- **Typed bytes**: a plain array of little-endian values. Widths: `u8, u16, u32, i8, i16, i32, f64`. Where a width is chosen by code, the codes are 0 u8, 1 u16, 2 u32, 3 i8, 4 i16, 5 i32, 6 f64. IEEE-754 doubles, so `-0` is kept.
- **FNV-1a hash** of a string, used to name columns: start `h = 2166136261`; for each UTF-16 code unit `c` of the string: `h = ((h XOR c) * 16777619) mod 2^32`. (Not the UTF-8 bytes.) A reader in a language with UTF-8 strings must hash the UTF-16 code units, so a character above U+FFFF counts as its two surrogates.

### 1.3 Row meaning
A row is the value `JSON.parse` gives for the input line. Object key order is not part of that value, and a value-exact file does not promise it. Duplicate keys in one line: the last one wins (both readers return that value for the duplicate-key tests). Byte-exact mode adds the footer sections described in `SPEC.md`; it changes nothing inside these layouts, except that a flat block gets the key-order lists of section 2.6.

## 2. Flat block (`f`)

Used when every row is a JSON object. One presence bit plane, then one typed column per key.

### 2.1 Layout
```
u32 hl | header | Z(meta) | Z(planes) | [Z(ord list) | Z(ord ids)] | column frames ...
```
`Z(x)` is a Zstandard frame of `x`. The two `ord` frames are present only when `meta.ord` exists (section 2.6).

Header: `{"k":"f","n":ROWS,"m":[metaRawLength,metaFrameLength],"pl":[planesRawLength,planesFrameLength]}`.

Meta (JSON, UTF-8, decoded length `m[0]`):
```
{ "keys": [key0, key1, ...],
  "cols": [ { "t": TYPE, "p": PARAMS, "n": COUNT, "f": [[raw, stored, z], ...] }, ... ],
  "ord":  [listRaw, listFrame, idsKind, idsRaw, idsFrame]        // optional
}
```
`cols[j]` describes `keys[j]`. `keys` are in order of first appearance in the block. `n` is the number of rows that carry the key. `f` lists the column's frames in the order they follow in the block; see 2.4.

### 2.2 Presence planes
The decoded planes are `K` planes of `pb = ceil(n_rows / 8)` bytes each, `K = keys.length`, so the raw length is `K * pb`. Plane `j` starts at `j * pb`. Row `i` has key `j` when bit `i & 7` of byte `i >> 3` of plane `j` is 1. A key that is in every row still has a plane (all ones). The `n` of a column equals the number of ones in its plane.

### 2.3 Assembling rows
For each row `i` in order, for each key `j` in `keys` order whose bit is set: the value is the next unread value of column `j` (one read pointer per column, all start at 0). When `meta.ord` exists, rows are built from the key-order lists instead (2.6). Empty block: `n = 0`, `K = 0`, no frames beyond meta and planes.

### 2.4 Column frames
Each entry `[raw, stored, z]` of `cols[j].f` is one frame in the block of `stored` bytes. If `z = 1` it is a Zstandard frame that decodes to `raw` bytes. If `z = 0` the `stored` bytes are the raw bytes themselves (`stored = raw`); writers do this when compression does not make the frame smaller (this includes empty frames, `raw = 0`). Below, "frame 0", "frame 1" mean the decoded bytes of `f[0]`, `f[1]`.

The writer picks the type; a reader just follows `t`. Every type needs all `n` values of the column to be of one kind, as listed.

### 2.5 Column types
| t | Values it holds | Params `p` | Frames and decoding |
|---|---|---|---|
| `V` | numbers: whole, or with at most two decimals | `{mono, scale}` | 1 frame of `n` varints. `scale` is 1 or 100. `mono = true`: varint `i` is `base[i] - base[i-1]` (the first one is `base[0]`), so a running sum gives `base`; `base[0] >= 0` and `base` never decreases. `mono = false`: each varint is `z(base[i])`. Value = `base[i] / scale` (true division; do not multiply by 0.01). `scale = 100` means `base = round(value * 100)` and `base / 100` is exactly the original double. |
| `B` | numbers, same domain as `V`, range under 2^24 | `{mn, w, scale}` | 1 frame: `n` values bit-packed at width `w`. Value = `(packed + mn) / scale`. `w = max(1, bits needed for max - min)`, at most 24. |
| `F` | any numbers | `{}` | 1 frame: `n` doubles. Used for fractions that are not two-decimal, huge numbers, `-0`, and when raw doubles pack smaller. |
| `T` | booleans | `{}` | 1 frame: bit-packed, width 1, 1 = true. |
| `H` | lowercase hex strings, all the same even length `L >= 16` | `{L}` | 1 frame: `n * L / 2` bytes, two hex digits per byte, high digit first. |
| `U` | lowercase UUID text `8-4-4-4-12` | `{}` | 1 frame: 16 bytes per value, the hex digits in order without dashes. |
| `I` | IPv4 text `a.b.c.d`, each part 0 to 255 written without leading zeros | `{}` | 1 frame: 4 bytes per value. |
| `s` | strings with no NUL character and no lone surrogate | `{}` | 1 frame: UTF-8 of the `n` strings joined with U+0000 (no trailing separator). |
| `D` | strings (same limits as `s`), at most `n / 4` distinct and under 65,536 | `{w, wide}` | 2 frames. Frame 0: the distinct strings in order of first appearance, joined with U+0000. Frame 1: one code per value. `w = 0`: codes are typed bytes, u16 when `wide` is true (more than 256 distinct strings), else u8. `w > 0`: codes bit-packed at width `w` (`wide` false). Value = `strings[code]`. |
| `A` | lists of whole numbers 0 to 2^32 - 1 (no `-0`) | `{m, asc}` | 2 frames. Frame 0: `n` varints, the list lengths. Frame 1: `m` varints, all list items one after another. `asc = true`: inside each list the stored number is the difference to the previous item (first item: the item itself; every list in the column is non-decreasing). `asc = false`: stored number is `z(item - previous)`, previous starts at 0 in every list. |
| `L` | strings, log-line templates | `{}` | 5 frames, section 2.7. |
| `j` | anything else (mixed types, null, nested values, strings with NUL or lone surrogates) | `{}` | 1 frame: the `n` values as JSON text (`-0` written as `-0`) joined with LF. JSON text has no raw LF, so a split on LF is safe. |

Notes for readers: a number column holds values of one JSON kind only; a column with some numbers and some strings or nulls is `j`. All-null columns are `j`. `s`, `D` and `L` take strings from the whole column. Strings never carry U+0000 in `s`, `D`, `L` (that is how the join stays unambiguous). **Text is valid UTF-8:** the frames of `s`, `D` and `L` hold well-formed UTF-8, so no lone surrogate can be in them. A string with a lone surrogate (which JSON allows as `\ud800`) makes the column `j`, where JSON escaping keeps it; in a nested block it goes to the side list (3.4), which is also JSON. A reader may reject invalid UTF-8 in a text frame.

### 2.6 Key-order lists (`meta.ord`)
Present only in byte-exact files. It keeps each row's own key order, which the planes cannot. `ord = [listRaw, listFrame, idsKind, idsRaw, idsFrame]`. The two frames sit between the planes and the first column frame:
- Frame `Z(list)`: JSON array of key-index lists, one per distinct order, for example `[[1,0],[0,1],[0]]`. It decodes to `listRaw` bytes and occupies `listFrame` bytes.
- Frame `Z(ids)`: typed bytes of kind `idsKind` (0, 1 or 2), one entry per row, the index into the list. It decodes to `idsRaw = n * width` bytes and occupies `idsFrame` bytes.

A reader builds row `i` by taking, for each key index `kk` in `list[ids[i]]` in that order, the next value of column `kk`. The planes are still stored and agree with the lists; the lists win.

### 2.7 Log templates (`L`)
For columns of lines such as `GET /item/17 took 42 ms`. Every digit run (optionally with a leading minus) and every hex run of 8 or more digits in a line is a slot. The line with slots replaced by U+0001 is the template. The five frames:

| Frame | Content |
|---|---|
| 0 | the templates joined with U+0000, numbered 0.. in order of first appearance (at most 65,536; a template has at most 4,096 slots) |
| 1 | `2n` bytes: the template number of each row, first `n` bytes the low bytes, then `n` bytes the high bytes |
| 2 | the text slots (below): one entry per text pair, joined with U+0000; each entry is that pair's values joined with LF. Empty when there are none. |
| 3 | the numeric slots (below): varints, pair after pair |
| 4 | one byte per slot pair, in pair order: 1 numeric, 0 text |

A pair is (template, slot number). Pairs are numbered in the order they first appear when going through the rows: at the first row that uses a template, all slots of that template are appended in slot order. Let `c` be the number of rows that use the template. A numeric pair is `c` varints in frame 3: `z(value - previous)` with previous starting at 0; the values are canonical decimal numbers (`0`, or an optional minus and a digit 1 to 9 followed by at most 14 digits). A text pair holds its `c` slot strings (digits, or hex) in row order. Line `i` is the template with each U+0001 replaced by the next unread value of the pair for that slot, in order. Lines with a U+0001 or U+0000 in them cannot use `L`.

## 3. Nested block (`n`)

Used for rows that are nested objects, arrays or any JSON value. A row is described by a *shape*; all strings of the block share one dictionary; every number or boolean comes from a column named by the path it was found at.

### 3.1 Layout
```
u32 hl | header | Z(colmeta) | Z(dict) | Z(side) | Z(skeletons) | Z(row shape ids) | Z(first flags) | Z(repeats) | column frames ...
```
Header:
```
{ "k":"n", "n":ROWS, "count":E,
  "fa":[flagsRaw, flagsFrame, repKind, repCount, repFrame, N],
  "len":[dictRaw, sideRaw, skeletonsRaw],
  "p":[dictFrame, sideFrame, skeletonsFrame],
  "ids":[idsKind, idsCount, idsFrame],
  "cm":[colmetaRaw, colmetaFrame] }
```
Every frame is a Zstandard frame and is always present. Decoded sizes: `dict` `len[0]`, `side` `len[1]`, `skeletons` `len[2]`, `colmeta` `cm[0]`, `row shape ids` `idsCount * width(idsKind)` (`idsCount = n`), `first flags` `fa[0]` (`= ceil(N / 8)`), `repeats` `fa[3] * width(fa[2])`, each column `count * width(kind)`.

### 3.2 Skeletons (shapes)
`Z(skeletons)` decodes to the shape texts joined with LF, numbered 0.. in order (at most 65,536). Row `i` has shape number `ids[i]`. A shape is JSON:

```
shape := 1 | 2 | 3 | 4 | 5 | [ shape, ... ] | { "key": shape, ... }
```
`1` string, `2` number, `3` boolean, `4` null, `5` a whole JSON value kept as text in the string stream (the writer uses it for a row nested 100 levels or deeper; a reader MUST accept it anywhere), `[...]` an array with one shape per element, `{...}` an object with one shape per member. `[]` and `{}` are the empty array and object. A shape does not say which boolean it is; the value comes from a column.

Key order: strings and numbers are read in the order the shape text lists the members. JavaScript's `JSON.parse` moves keys that look like array indexes (`"0"`, `"1"`, ..., below 2^32 - 1) to the front in numeric order, and the JavaScript reader walks the keys in that order. The reference writer therefore writes such keys first in each object of a shape, ascending, and takes strings and numbers in that same order (checked by `vectors/layout/nested-intkeys`). A writer MUST do the same, so that readers using `JSON.parse` and readers that keep text order agree.

### 3.3 Cells and columns
Walk the shape depth first, left to right, rows in order. Each leaf is a *cell*:
- `1` string cell: takes the next string of the block (3.4).
- `5` takes the next string and parses it as JSON.
- `2` number cell: takes the next value of the column named by the cell's path.
- `3` boolean cell: takes the next value of the column named by the cell's path plus `?`; the value is true when it is 1.
- `4` is null and takes nothing.

Path of a cell: the row's root is the empty string `""`; a member of an object adds `"." + key`; an element of an array adds `"[]"` (no index). Examples: row `{"p":{"q":[1,{"r":"s"}]}}` has the number at `.p.q[]` and the string `r` at `.p.q[].r`; a boolean `ok` at the top is at `.ok?`. A column's name is the FNV-1a hash of its path (1.2). Two different paths that happen to hash the same share one column; because writer and reader both walk the same way, reads still agree, but their zone-map entries merge. Hash 2147483001 is kept for the reader's own string-code column and no column in the file may use it.

`Z(colmeta)` decodes to a JSON array with one entry `[hash, kind, count, frameLength]` per column, in the order the column frames follow. `kind` is the width code of 1.2. A column holds its `count` values in the order of the walk. The writer takes the narrowest width that holds every value exactly: whole numbers from 0 give u8, u16 or u32; negative ones give i8, i16 or i32; anything with a fraction, a value beyond 32 bits, `-0` or a non-finite number gives f64. Boolean columns hold 0 and 1 (u8).

### 3.4 Strings
The block has `N` string cells (`fa[5]`) in walk order. Their strings come from three pieces:

- **Dictionary** `Z(dict)`: `E = count` entries joined with U+0000, so `E - 1` separators and no trailing one. The first `nu` entries are the distinct strings of the dictionary, plain ASCII (no NUL) and numbered in order of first use. The remaining `ns = E - nu` entries are empty placeholders for the side strings. Decode dictionary text as ASCII or Latin-1 only.
- **Side list** `Z(side)`: JSON `{"idx":[nu, nu+1, ...],"str":[...]}`. Strings that contain non-ASCII characters, escapes or NUL are kept here once each (full Unicode), and `str[k]` replaces dictionary entry `idx[k]`.
- **Codes**: the code of string cell `c` (0-based, in walk order) is rebuilt from the first-appearance flags and the repeats: `first flags` is a bit plane (bit `c & 7` of byte `c >> 3`); if bit `c` is 1, the cell is the first use of a dictionary entry and its code is the next never-used number `0, 1, 2, ...` (a counter that starts at 0); if bit `c` is 0, its code is the next unread entry of `repeats`. Side strings are never flagged: their cells always take a code from `repeats`, which is `nu + k` for side string `k`. `repeats` is typed bytes of kind `fa[2]`, `fa[3]` entries.
- String value = `entries[code]`.

When `E = 0` the dictionary text is empty. When `nu = 0` and `ns > 0` it is `ns - 1` NUL bytes (every entry is an empty placeholder).

### 3.5 Assembling rows
For row `i`: look up shape `ids[i]` and build the value by the shape: objects get their members in shape order, arrays their elements in order; leaf values come from 3.3 and 3.4. Keep one read pointer per column and one string-cell pointer for the whole block.

## 4. Zone maps (footer section 5)
Corrects `SPEC.md` 2.3, which lists three numbers: each entry is `[hash, min, max, count]`, so four numbers. One list per block, in block order; an entry is a number column of that block.
- Flat block: one entry per key whose column type is `V`, `B` or `F`; `hash` is the FNV-1a hash of `"." + key`; `min` and `max` are the real values (after dividing by the scale); `count` is the column's `n`.
- Nested block: one entry per number or boolean column (not the string codes); `hash` is the column hash of 3.3, which for a top-level key `a` is the hash of `".a"`, so the same as in a flat block; `min`, `max` over the column's values (a boolean column has 0 and 1).
- A column that is absent from a block simply has no entry; a reader that finds none MUST NOT skip the block.

## 5. Reader rules, short list
1. Check block CRC (`SPEC.md` 2.4), then cut frames in order using the header; fail if bytes are left over.
2. Never trust a length: check every decoded size against the layout.
3. Values: numbers are doubles. Decode `V` and `B` with division by `scale`; `F` is the exact double.
4. Dictionary text is ASCII; side strings override placeholders.
5. Keep the shape's member order (3.2); count strings across the whole block, not per row.
6. Container checks that apply here too (part 1, now stated): footer byte 0 must be 0 or 1, else refuse the file; a block-table entry has at least 5 fields (the 6th, table index, is optional); a reader that only reads the footer (such as `info`) never sees damage inside blocks, because block CRCs are checked when a block is read.
7. Ignore unknown keys in headers, meta and params (minor versions may add them); refuse an unknown column type `t` or block kind.

## 6. Writer rules that change what readers see
- Choose a type only when its domain (2.5) holds for the whole column; if unsure use `j`.
- `scale = 100` only when `round(v * 100) / 100 === v` for every value and `|round(v * 100)| < 2^50`.
- Whole numbers in `V`/`B` must be below 2^50 in absolute value; anything larger is `F`.
- Template columns (`L`): the choice is the writer's, and the reference writer decides it by a size check plus a timing check on the machine it runs on (`templates: true` skips the timing check, `false` turns the type off). The same input can therefore produce different bytes on different runs when `templates` is left on automatic. Conformance vectors are made with `templates: true`.
- Nested limits of the reference writer (not of the format): at most 262,144 rows and 48 MB of input text per nested block; at most 65,536 shapes; deeper than 100 levels becomes shape `5`. A writer that hits a limit cuts the block in two at a line end.

## 7. Conformance
`vectors/` holds the eight files of `SPEC.md` section 5. They are small enough that the writer chose flat blocks for all of them, including the file called `nested`. `vectors/layout/` holds thirteen more (`NAME.ndjson` and `NAME.json.lfc`, value-exact) and one multi-table file (`tables.json.lfc` with `tables.expected.json`):

| File | What it adds |
|---|---|
| `flat-all-types` | 40 rows, flat block with all column types `V B F T H U I s D A L j`, mono and not mono, `scale` 100, stored (uncompressed) frames |
| `flat-key-order` | flat block with key-order lists (`meta.ord`) |
| `flat-wide-dict` | 1,400 rows: `D` with more than 256 labels (`wide`), `B` with negative values at `scale` 100, `V` not mono |
| `flat-negatives` | negative and large whole numbers, two-decimal fractions, zero |
| `flat-surrogates` | lone surrogates and U+0000 in strings (column falls to `j`) |
| `nested-surrogates` | the same in a nested block (side list) |
| `nested-astral-key` | a key outside the Basic Multilingual Plane (FNV-1a over UTF-16 code units, 1.2) |
| `multi-block` | three flat blocks in one file |
| `nested-forced` | nested block: arrays, empty array and object, booleans, null, a side string with non-ASCII characters, first-appearance flags and repeats |
| `nested-number-widths` | nested block with a number column of every width (u8 to f64) and `-0` |
| `nested-sparse-wide` | 300 rows, shapes sharing columns |
| `nested-deep` | a row nested 120 levels deep (shape `5`) |
| `nested-intkeys` | keys that look like array indexes (3.2) |

Regenerate with `node test/genlayout.cjs` (same bytes every run), check the layout with `python3 test/layoutcheck.py`. `python3 test/pylayout.py` runs the Python reader over the folder. A second implementation passes when it decodes every `NAME.json.lfc` in both folders to the rows of `json.loads` over the `.ndjson` lines (numbers compared as doubles), and `tables.json.lfc` to `tables.expected.json`.

## 8. Worked example
`vectors/layout/nested-forced.json.lfc`, block 0. Source rows:
```
{"p":{"q":[1,{"r":"s"}],"u":null},"v":"w"}
{"p":{"q":[],"u":{}},"v":"w2"}
{"p":{"q":[true,false,-2.5,1099511627776],"u":"café 😀"},"v":"w"}
{"p":{"q":[1],"u":"w"},"v":"w"}
```
Header: `{"k":"n","n":4,"count":4,"fa":[1,10,0,4,13,7],"len":[7,32,125],"p":[16,41,73],"ids":[0,4,13],"cm":[39,48]}`.
- Skeletons: `{"p":{"q":[2,{"r":1}],"u":4},"v":1}`, `{"p":{"q":[],"u":{}},"v":1}`, `{"p":{"q":[3,3,2,2],"u":1},"v":1}`, `{"p":{"q":[2],"u":1},"v":1}`. Row shape ids: `00 01 02 03`.
- Dictionary text `s\0w\0w2\0` (`E = 4`: `s`, `w`, `w2`, and one empty placeholder). Side list `{"idx":[3],"str":["café 😀"]}`.
- There are `N = 7` string cells: `s`, `w` | `w2` | `café 😀`, `w` | `w`, `w`. Flags byte `07`: cells 0, 1, 2 are first uses (codes 0, 1, 2). Repeats `03 01 01 01` (u8, 4 entries): cell 3 is side string 0, so code `nu + 0 = 3`; cells 4, 5, 6 repeat code 1 (`w`).
- Column table `[[216983282,6,4,35],[689263799,0,2,11]]`: the path `.p.q[]` (hash 216983282) is an f64 column (kind 6) of 4 numbers, in walk order `1, -2.5, 1099511627776, 1`; the path `.p.q[]?` (hash 689263799) is a u8 column of 2 booleans, `1, 0`.

## 9. What the check found (for the code owner)
1. **No default vector reads a nested block.** All eight vectors in `vectors/` are flat blocks (the one called `nested` is a flat block with JSON-text columns), and no flat column type except `B V F s j A` and none of the key-order lists is used. `vectors/layout/` closes this. `layoutcheck.py` prints a coverage line; with both folders every column type, all seven nested widths and the key-order lists are covered.
2. **`SPEC.md` 2.3 zone entry was short by one number** (count). `SPEC.md` now matches section 4 above.
3. **The log-template choice depends on a timing check**, so `--update` on a larger vector can change bytes between runs. The eight small vectors are safe (columns under 16 rows never use it). `genlayout.cjs` uses `templates: true`.
4. **Skeleton key order is a hidden rule** (3.2). It works today because the writer already puts index-like keys first. It needs a vector (supplied) so a second writer cannot break JavaScript readers by accident.
5. **Header `writer` text** reads `lfc-pack 0.1.5` (or `0.1.1` for several tables) although the module is 0.1.11; harmless, but a reader cannot tell the real writer version.
7. **Go reader report** (`lfc-pack-reader/RESULTS.md`) listed six gaps; this text covers them: path-hash grammar (3.3), the nested header tuples `cm p ids fa len` with named fields and sizes (3.1), bit-pack width limit (1.2: 24; the Go and Python windows are wide enough, the JavaScript writer cannot exceed it, checked in `bitpack` of `src/flat.js`, which assembles a value from at most 4 bytes), text columns as valid UTF-8 (2.5), footer byte 0 and short block-table entries (5.6). The sixth, block CRC, is in 5.6.
8. **Dictionary decoding** is Latin-1 in JavaScript and ASCII in Python. Equal for valid files; a damaged file with bytes above 127 in the dictionary is read differently. The spec makes dictionary text ASCII-only so a strict reader may reject it.
