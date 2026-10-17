# memory-compression-jso

**Version 1.2.0 · API 1**

**Tested in:** Node 22.22.0 (31 checks with and without WebAssembly, and the long random test); Firefox 158.0 (reports 158.0b5), ungoogled-chromium 155.0.8059.39-1, WebKitGTK 2.52.6, GNOME Web 46.5, one at a time, a fresh page for each data set; not run: a phone, a real Netflow Map scene

Keeps a big pile of plain JavaScript objects (a list of 300,000 links, 100,000 scene items, an API answer, a log) packed in memory as a few megabytes of bytes, and brings every value back exactly. It is the object version of [memory-compression](../memory-compression/README.md): arrays of objects are stored as columns, and the columns go through that module's float-aware packing. One file, no dependencies, works offline, about 206 KB with comments (the core and its small optional WebAssembly helpers are inside); the optional Pcodec add-on is a second file, `memory-compression-jso-pco.js` (441 KB, because the 327 KB Pcodec program is inside it as text).

**Test it:** `node modules/memory-compression-jso/test/run.js` (31 checks, about 4 s; `--js-only` runs without WebAssembly; `FULL=1` runs 10 times more random cases). **Try it:** `demo.html`. **Rebuild the file:** `python3 modules/memory-compression-jso/build.py`.

## Quick start
```js
var links = [{ id: 0, from: 0, to: 7, weight: 0.25, x1: 12.5, y1: -3.75, color: 4281558988, kind: 'flow', hot: false } /* , 299,999 more */];
var packed = MemoryCompressionJSO.pack(links);            // a Uint8Array: about 14% of the JSON text for 300,000 links like these
links = null;                                             // free the objects
var back = MemoryCompressionJSO.unpack(packed);           // equal objects again: same values, same key order, same -0 and NaN
```
Keep it packed and read single items without making the others (for a packed array of 16 or more objects that all have the same keys):
```js
var v = MemoryCompressionJSO.view(packed);                // decodes the columns once, makes no objects
v.length;  v.keys;                                        // 300000, ['id', 'from', ...]
v.get(4711);                                              // one object, built on the spot
v.field(4711, 'weight');                                  // one value
v.column('x1');                                           // the whole column as a Float64Array (or a plain array for text)
```
A view opens in well under a millisecond (about 0.05 ms for 300,000 links; 1.0.0 took about 29 ms) because a column is restored only the first time it is read. `v.loaded()` lists the restored columns, `v.memory()` says how many bytes that is, and `v.release()` lets them go again.

Objects that point at each other (links holding the very node objects) come back sharing, and a graph is stored by column, not value by value:
```js
var packed = MemoryCompressionJSO.pack({ nodes: nodes, links: links }, { refs: true });   // links[i].from === nodes[k] stays true after unpack()
```
Text that follows a pattern (`'user7@example.org'`, `'2025-03-05T04:15:00Z'`, `'Item 12 flow'`) is stored as the pattern once plus a column of numbers, with no option to set. `{ patterns: false }` turns that off (faster to pack text-heavy data, bigger result). `{ float32: true }` keeps columns of fractions in 4 bytes per value instead of 8: lossy (the relative error is at most about 6 in 100 million), so it is off unless you ask.

`MemoryCompressionJSO.ready()` is a promise that resolves when the fast WebAssembly path has been chosen; calls made earlier still work, in plain JavaScript.


## What it handles
Numbers (whole numbers, decimals, 32-bit and 64-bit floats, `NaN`, infinities, `-0`), text (including lone surrogates and a leading byte-order mark), booleans, `null`, `undefined`, `BigInt`, `Date`, `Map`, `Set`, `RegExp`, typed arrays (not the 64-bit ones), `ArrayBuffer`, nested arrays and objects, sparse arrays (holes come back as `undefined`), keys of any kind including `__proto__`, and null-prototype objects. Shared objects and cycles come back with `refs: true`.

## How it works (plain words)
- An array of 16 or more things is stored **by column**. A list of link objects becomes one list of ids, one of `from`, one of `weight`, and so on, and the key names are written once.
- Each column picks the cheapest way to hold its values: one repeated value, whole numbers in the narrowest width, decimals such as 12.34 or 0.25 as whole numbers with a scale (so 0.25 steps cost 1 or 2 bytes each, not 8), 32-bit floats when that loses nothing, plain 64-bit floats, a yes/no bit each, a dictionary for repeated text, joined text, and arrays of small fixed-length arrays (such as `[lat, lng]`) as one column per position.
- The number columns then go through [memory-compression](../memory-compression/README.md) (byte shuffle, column difference, then LZ4 in fast mode or deflate in small mode), which is where the float savings come from.
- **Text patterns (new in 1.1.0).** When most strings in a column look alike (`'user' + number + '@example.org'`), the text between the numbers is kept once and each number goes into a number column. Up to 32 patterns per column. For big columns a 608-byte WebAssembly helper walks the bytes; the plain-JavaScript loop does the same work and writes the same bytes.
- **Dates and times (new in 1.2.0).** A text column of ISO dates (`2025-03-05T04:15:00Z`, with milliseconds, `2025-03-05`, or a space instead of the `T`) is stored as one number per row (days, minutes, seconds or milliseconds since 1970) instead of six, and rebuilt as the same text. Every row is checked to be a real date (no 30 February, no 24:00); one row that is not keeps the whole column on the older pattern path. Sorted timestamps become tiny differences, so files are 13 to 31% smaller (smaller is better, table below).
- **Shared objects by column (new in 1.1.0).** With `refs: true`, a column whose values are objects that were already written (links pointing at nodes) is stored as a column of ids, not value by value.
- Anything that does not fit a pattern (mixed types, odd objects) is written in a general form, value by value, so every input works; it is just bigger and slower there (see "What it is not").
- Packing builds small generated functions per object layout (with `new Function`; plain loops are used where that is blocked), which is what makes both directions fast on repeated layouts.

## Numbers
How to read these: every table says which direction is better. **Size** is the packed result in megabytes (smaller is better). **Pack** is the time to turn the objects into bytes and **unpack** the time to turn the bytes back into objects, in milliseconds (smaller is better). Bold is the best in that column among the packers (not JSON text). Every result was restored and compared value for value (NaN equals NaN, -0 differs from 0, key order counts, `undefined` is a value, prototypes must match).

Measured in Node 22.22.0 (4 cores), best of 3 runs with a full garbage collection before each; the data sets are generated by `test/data.js`. Timings in one run vary by about 30% either way, so treat differences under that as ties. The 1.0.0 rows are the previous release run in the same pass.

**nfm-links: 300,000 network links** (57.26 MB as JSON text)

| library | size, MB (lower is better) | pack, ms (lower is better) | unpack, ms (lower is better) | restored exactly? |
|---|---:|---:|---:|---|
| this module 1.1.0, fast mode | 7.854 | 99.6 | 72.9 | yes |
| this module 1.1.0, small mode | **6.716** | 216.5 | 75.9 | yes |
| this module 1.0.0, fast mode | 7.854 | 106.7 | **60.6** | yes |
| msgpackr with records | 20.005 | 153.1 | 121.8 | yes |
| cbor-x with records | 20.905 | 182.7 | 136.4 | yes |
| avsc (Avro; needs a schema) | 18.767 | **85.3** | 137.8 | values yes; its own record class |
| Node's v8.serialize | 40.659 | 291.1 | 413.7 | yes |
| JSON text | 57.258 | 500.4 | 395.2 | yes |

**nfm-nodes: 100,000 scene items** (22.21 MB as JSON text)

| library | size, MB (lower is better) | pack, ms (lower is better) | unpack, ms (lower is better) | restored exactly? |
|---|---:|---:|---:|---|
| this module 1.1.0, fast mode | 2.099 | 65.4 | 64.2 | yes |
| this module 1.1.0, small mode | **1.840** | 114.2 | **40.9** | yes |
| this module 1.0.0, fast mode | 2.652 | 64.8 | 66.1 | yes |
| msgpackr with records | 8.706 | 59.5 | 71.6 | yes |
| cbor-x with records | 9.315 | 75.1 | 101.0 | yes |
| avsc (Avro; needs a schema) | 8.958 | **52.8** | 74.7 | values yes; its own record class |
| Node's v8.serialize | 18.525 | 115.6 | 305.7 | yes |
| JSON text | 22.206 | 174.3 | 169.5 | yes |

**api-users: 50,000 user records with lots of text** (11.06 MB as JSON text)

| library | size, MB (lower is better) | pack, ms (lower is better) | unpack, ms (lower is better) | restored exactly? |
|---|---:|---:|---:|---|
| this module 1.1.0, fast mode | 0.764 | 63.5 | 73.1 | yes |
| this module 1.1.0, small mode | **0.626** | 81.9 | 50.5 | yes |
| this module 1.0.0, fast mode | 1.080 | 64.7 | 61.7 | yes |
| msgpackr with records | 5.754 | 54.6 | **38.4** | yes |
| cbor-x with records | 6.054 | 65.9 | 47.5 | yes |
| avsc (Avro; needs a schema) | 5.508 | **40.7** | 50.0 | values yes; its own record class |
| Node's v8.serialize | 10.900 | 76.4 | 147.8 | yes |
| JSON text | 11.060 | 59.5 | 85.0 | yes |

**geojson: 20,000 map features** (10.32 MB as JSON text)

| library | size, MB (lower is better) | pack, ms (lower is better) | unpack, ms (lower is better) | restored exactly? |
|---|---:|---:|---:|---|
| this module 1.1.0, fast mode | 1.803 | 34.6 | 62.5 | yes |
| this module 1.1.0, small mode | **1.516** | 102.1 | 64.2 | yes |
| this module 1.0.0, fast mode | 1.885 | 47.6 | 68.9 | yes |
| msgpackr with records | 7.212 | **31.5** | **61.9** | yes |
| cbor-x with records | 7.385 | 43.3 | 67.5 | yes |
| avsc (Avro; needs a schema) | 6.809 | 45.8 | 65.7 | values yes; its own record class |
| Node's v8.serialize | 12.307 | 133.4 | 204.3 | yes |
| JSON text | 10.319 | 101.8 | 96.6 | yes |

**events: 200,000 log events** (20.19 MB as JSON text)

| library | size, MB (lower is better) | pack, ms (lower is better) | unpack, ms (lower is better) | restored exactly? |
|---|---:|---:|---:|---|
| this module 1.1.0, fast mode | 1.670 | 77.5 | 61.9 | yes |
| this module 1.1.0, small mode | **1.215** | 117.0 | 44.3 | yes |
| this module 1.0.0, fast mode | 2.481 | 73.5 | **43.5** | yes |
| msgpackr with records | 9.569 | 96.2 | 49.8 | yes |
| cbor-x with records | 10.362 | 113.1 | 62.3 | yes |
| avsc (Avro; needs a schema) | 8.836 | **66.3** | 54.4 | values yes; its own record class |
| Node's v8.serialize | 17.228 | 86.1 | 176.9 | yes |
| JSON text | 20.191 | 110.7 | 109.3 | yes |

**small: 1,000 small objects** (0.12 MB as JSON text)

| library | size, MB (lower is better) | pack, ms (lower is better) | unpack, ms (lower is better) | restored exactly? |
|---|---:|---:|---:|---|
| this module 1.1.0, fast mode | **0.007** | 0.9 | **0.2** | yes |
| this module 1.1.0, small mode | **0.007** | 1.3 | **0.2** | yes |
| this module 1.0.0, fast mode | 0.011 | 0.5 | **0.2** | yes |
| msgpackr with records | 0.048 | 0.6 | 0.4 | yes |
| cbor-x with records | 0.054 | 0.7 | 0.3 | yes |
| avsc (Avro; needs a schema) | 0.041 | **0.2** | 0.3 | values yes; its own record class |
| Node's v8.serialize | 0.100 | 0.7 | 1.2 | yes |
| JSON text | 0.120 | 0.7 | 0.9 | yes |

**irregular: 20,000 items, every one different** (0.40 MB as JSON text)

| library | size, MB (lower is better) | pack, ms (lower is better) | unpack, ms (lower is better) | restored exactly? |
|---|---:|---:|---:|---|
| this module 1.1.0, fast mode | 0.150 | 8.9 | 9.0 | yes |
| this module 1.1.0, small mode | **0.123** | 31.3 | 13.4 | yes |
| this module 1.0.0, fast mode | 0.150 | 17.5 | 12.1 | yes |
| msgpackr with records | 0.223 | 12.4 | 14.9 | yes |
| cbor-x with records | 0.246 | 8.0 | **7.9** | yes |
| Node's v8.serialize | 0.366 | **4.3** | 8.6 | yes |
| JSON text | 0.401 | 3.9 | 6.0 | yes |

What the Node tables say, in plain words:
- **Size:** compared with 1.0.0, text-heavy sets are smaller: the 50,000 user records went from 1.080 MB to 0.764 MB (29% smaller), the 200,000 events from 2.481 MB to 1.670 MB (33% smaller), the 100,000 scene items from 2.652 MB to 2.099 MB (21% smaller). Number-only sets (the 300,000 links) are the same size. Against msgpackr with records the files are 1.5 to 7.5 times smaller in fast mode (1.5 times on the irregular set, 7.5 on the user records).
- **Speed in fast mode is about the same as 1.0.0** (differences are inside the 30% noise) and the same class as msgpackr with records. avsc (which needs a schema) packs fastest on four of the five big sets (this module is 1.2 to 1.6 times slower there; on the map features this module packs 1.3 times faster); this module unpacks faster than avsc on the links (1.9 times) and the scene items (1.2 times), and is even or up to 1.5 times slower on the other three.
- **Small mode packs faster than 1.0.0 on text-heavy sets** (events 174 to 117 ms, scene items 145 to 114 ms, users 96 to 82 ms) and is smaller still.
- **Where it is not the best:** on the 50,000 user records (lots of short text) msgpackr with records unpacks 1.9 times faster (38 ms against 73 ms) and avsc packs 1.6 times faster (41 ms against 64 ms); the file is 7.5 times smaller than either.

### Dates and times (1.2.0)
Sizes, packing and unpacking of a text column of ISO dates, 1.1.1 against 1.2.0. Browser rows are 20,000 rows, median of 15 alternating rounds; Node rows are 50,000 rows, best of 9. **Smaller is better in every column.**

| Data | Size 1.1.1 | Size 1.2.0 | Smaller by |
|---|---:|---:|---:|
| Sorted log timestamps, whole seconds (Node, 50,000) | 49.6 KB | 39.3 KB | 21% |
| Sorted log timestamps, milliseconds (Node, 50,000) | 134.5 KB | 117.3 KB | 13% |
| Random dates and times in one year (Node, 50,000) | 241.5 KB | 181.2 KB | 25% |
| Random dates only, 5 years (Node, 50,000) | 127.2 KB | 88.0 KB | 31% |
| One timestamp every hour, steady (Node, 50,000) | 87.2 KB | 87.2 KB | 0% (kept as before) |
| Sorted log timestamps, whole seconds (browsers, 20,000) | 20.4 KB | 15.9 KB | 22% |
| Random dates only (browsers, 20,000) | 51.9 KB | 35.8 KB | 31% |

| Browser (20,000 sorted log timestamps, whole seconds) | Pack 1.1.1 | Pack 1.2.0 | Unpack 1.1.1 | Unpack 1.2.0 |
|---|---:|---:|---:|---:|
| Firefox 158.0 | 3.6 ms | 3.8 ms | 2.7 ms | 1.4 ms |
| ungoogled Chromium 155.0.8059.39-1 | 4.9 ms | 4.9 ms | 1.6 ms | 1.3 ms |
| WebKitGTK 2.52.6 | 6.9 ms | 6.0 ms | 2.3 ms | **3.6 ms** |
| GNOME Web 46.5 | 8.3 ms | 6.5 ms | 2.5 ms | **3.3 ms** |

With milliseconds (20,000 rows) unpacking goes 2.9 to 1.6 ms in Firefox, 2.2 to 1.4 ms in Chromium, and **3.2 to 5.2 ms** in WebKitGTK (**3.0 to 4.8 ms** in GNOME Web); packing goes 10.4 to 6.8 ms in WebKitGTK. Unpacking dates is about 1.5 to 2 times faster in Firefox and Chromium and about 1.4 to 1.7 times **slower** in the two WebKit browsers for the same file-size win; random dates unpack faster everywhere (WebKitGTK 4.3 to 3.6 ms). WebKit is slow here because it builds the date text with more string-joining work per row than the old way; a first attempt at a fix (tables made without holes) recovered part of it. A date column is used only when one number is expected to cost no more than the separate ones: the made-up cyclic dates of the `api-users` test set stay as before (155.4 KB, same speed), and a steady one-per-hour column also stays as before.

### Short, varied text kept as FSST codes (`fsst: true`, 1.2.0)
FSST (a text compressor from the VLDB 2020 paper by Boncz, Neumann and Leis) learns up to 255 common pieces of text from the column itself (a piece is 1 to 8 bytes: " Street", "ville", "@exam") and writes each string as a short list of piece numbers. Two things follow: the column is about half the size of the same text packed the old way, and **one string can be read without restoring the others**, so a `view()` keeps such a column at about a third of its restored size. It is off unless you pass `{ fsst: true }`, because training costs time when packing. Each text column is tried both ways and the smaller is kept; columns that are patterns (`user7@example.org`) or small dictionaries (`'flow'`, `'stock'`) keep their own, smaller way. A text file with an FSST column says format 3.

Same data in every browser, 20,000 rows unless it says 100,000 (smaller is better for every column except "reads", where it says). The kernel is a 3 KB WebAssembly program for the learning-free parts (turning text into codes and back) used at 4,096 rows and up; the "JavaScript only" columns are the same bytes without it.

| Data | File, plain | File, FSST | Smaller by | Restored size, plain | Restored size, FSST | Smaller by |
|---|---:|---:|---:|---:|---:|---:|
| Names and cities | 180.5 KB | 89.3 KB | 51% | 555 KB | 166 KB | 70% |
| Invented words | 119.4 KB | 56.8 KB | 52% | 323 KB | 122 KB | 62% |
| File paths | 247.1 KB | 110.3 KB | 55% | 645 KB | 180 KB | 72% |
| Log messages | 234.5 KB | 153.9 KB | 34% | 875 KB | 225 KB | 74% |
| Names and cities, 100,000 rows | 902.0 KB | 423.8 KB | 53% | 2,777 KB | 810 KB | 71% |
| Item labels ("Item 12 flow") | 0.5 KB | 0.5 KB | not used (the pattern is smaller) | 449 KB | 449 KB | 0% |

| Names and cities, 20,000 rows | Pack plain | Pack FSST (kernel) | Pack FSST (JavaScript only) | Unpack plain | Unpack FSST (kernel) | Unpack FSST (JavaScript only) | Open and read the first field, plain | Open and read the first field, FSST |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Firefox 158.0 | 4.1 ms | 18.3 ms | 28.7 ms | 4.8 ms | 6.1 ms | 7.2 ms | 4.75 ms | **0.53 ms** |
| ungoogled Chromium 155.0.8059.39-1 | 5.5 ms | 17.2 ms | 25.2 ms | 1.8 ms | 2.2 ms | 4.0 ms | 1.11 ms | **0.74 ms** |
| WebKitGTK 2.52.6 | 5.6 ms | 18.7 ms | 24.6 ms | 2.1 ms | 2.1 ms | 3.7 ms | 1.14 ms | **0.71 ms** |
| GNOME Web 46.5 | 5.3 ms | 19.0 ms | 23.5 ms | 2.0 ms | 2.2 ms | 3.1 ms | 1.60 ms | **0.60 ms** |
| Node 22.22.0 | 4.3 ms | 17.2 ms | 25.8 ms | 2.0 ms | 2.3 ms | 5.1 ms | 1.10 ms | **0.67 ms** |

At 100,000 names and cities the kernel unpacks in 8.4 ms in Chromium against 26.5 ms in JavaScript (3.2 times faster), 8.3 ms against 21.0 ms in WebKitGTK, 27.5 ms against 37.8 ms in Firefox (1.4 times faster). Reading one string alone takes 0.15 to 0.55 microseconds in every browser. **What it costs:** packing is 1.9 to 6.4 times slower (the learning step: 5 rounds over a 16 KB random sample); unpacking everything is 1.0 to 1.6 times slower than the plain way; the gain is size, memory and the ability to read one string. It does not beat the old way where the same whole values repeat (country names in 100,000 rows: those stay a dictionary, chosen automatically).

The kernel needs a page that allows WebAssembly (`'wasm-unsafe-eval'`); without it, or with `{ wasm: false }`, the JavaScript does the same work and writes the same bytes (checked). Kernel source: `wasm/jso-kernels.c`; rebuild with `wasm/build.sh` (clang 18.1.3) then `wasm/embed.py` and `build.py`; 3,323 bytes, sha256 starting 57424e85, identical when built again in a different folder.

### Number columns stored by Pcodec (optional add-on, `pco`, 1.2.0)
[Pcodec](https://github.com/pcodec/pcodec) (version 1.0.4, Apache-2.0, by Martin Loncaric and contributors) is a number compressor made for columns of numbers that drift, grow or wander: timestamps, sensor readings, prices. It is a 327 KB program, so it is **not inside** `memory-compression-jso.js`. Load the second file only on pages that want it:
```js
MemoryCompressionJSOPco.load().then(function (pco) {                 // pco is null if WebAssembly is missing or blocked: then everything stays as before
  var packed = MemoryCompressionJSO.pack(rows, { pco: pco });         // each number column of 4,096 or more values is also tried with Pcodec; the smaller is kept
  var back = MemoryCompressionJSO.unpack(packed, { pco: pco });       // (view() takes the same option)
});
```
Decimals are turned into whole numbers first (as always), and Pcodec codes the whole numbers; columns that fit 32 bits use its 32-bit mode. A column that Pcodec does not make smaller is written the old way and costs nothing but the time to try. A file that used Pcodec says format 3 and needs the add-on to open: without it, `unpack` and `view` throw "this file stores a number column with Pcodec; load memory-compression-jso-pco.js and pass its codec as the pco option". A file whose columns did not use Pcodec opens without the add-on. The add-on does not change anything for a page that never loads it. On a page that forbids WebAssembly (checked in Chromium 155 and Firefox 158 with a policy that has no `'wasm-unsafe-eval'`) `load()` and `loadSync()` give `null`, and packing carries on the old way with format 2 files.

Fast mode, 100,000 rows unless it says otherwise, same sets in each browser. **Smaller is better for every column.**

| Data | File, plain | File, Pcodec | Smaller by |
|---|---:|---:|---:|
| Sensor readings (time, 3 one-decimal and two-decimal columns, 2 five-decimal coordinates) | 1,537.3 KB | 508.5 KB | 67% |
| Price ticks (two-decimal price, volume, side) | 289.1 KB | 154.2 KB | 47% |
| Random coordinates (3 full-precision doubles) | 1,677.6 KB | 1,200.2 KB | 28% |
| 100,000 links | 2,640.2 KB | 2,207.6 KB | 16% |
| 100,000 log events | 837.0 KB | 638.4 KB | 24% |
| 20,000 map features | 1,803.5 KB | 1,362.8 KB | 24% |
| 20,000 user records | 308.2 KB | 276.2 KB | 10% |
| 50,000 scene items | 1,077.6 KB | 1,035.4 KB | 4% |

| Browser | Sensor readings: pack plain | pack Pcodec | unpack plain | unpack Pcodec | 100,000 links: pack plain | pack Pcodec | unpack plain | unpack Pcodec |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Firefox 158.0 | 22.6 ms | 51.6 ms | 14.5 ms | **7.9 ms** | 32.8 ms | 86.8 ms | 12.0 ms | 14.5 ms |
| ungoogled Chromium 155.0.8059.39-1 | 20.7 ms | 46.4 ms | 15.0 ms | **13.8 ms** | 30.0 ms | 85.7 ms | 14.5 ms | 17.6 ms |
| WebKitGTK 2.52.6 | 37 ms | 63 ms | 26 ms | **13 ms** | 40 ms | 97 ms | 18 ms | 19 ms |
| GNOME Web 46.5 | 35 ms | 66 ms | 27 ms | **12 ms** | 43 ms | 124 ms | 21 ms | 28 ms |
| Node 22.22.0 | 18.8 ms | 54.6 ms | 22.6 ms | **15.1 ms** | 28.9 ms | 93.0 ms | 17.9 ms | 22.7 ms |

(The WebKit timer counts whole milliseconds, so those cells are rough.) **What it costs:** packing is 1.2 to 3.5 times slower (the add-on tries each big number column, then keeps the smaller); unpacking ranges from 2.3 times faster (sensor readings in GNOME Web) to 1.8 times slower (100,000 log events in Chromium). Starting the add-on takes 5.6 to 11 ms (compiling the program on the spot; `load()` does it without blocking and took 5.8 to 8 ms). Where the same block of values repeats (a column that is the same 997 ids over and over), the old way is smaller and is kept: Pcodec cannot find repeats, the block packer can.

Add-on source: `pco/src/lib.rs` (Pcodec behind a tiny C interface; it also refuses any file that would make more or fewer numbers than the column holds), `pco/Cargo.toml` and `pco/Cargo.lock` (pco pinned to 1.0.4), rebuild with `pco/build.sh` (needs Rust and `rustup target add wasm32-unknown-unknown`; rustc 1.97.0; the result is 326,822 bytes with sha256 starting 888a66a7, the same bytes when built again in a different folder) then `python3 pco/embed.py`. The Pcodec license text is in `pco/NOTICE-pco.txt`.

### A graph where links hold the node objects (`refs: true`)
100,000 items and 300,000 links that point at the item objects themselves (not copies); JSON text of the same, with the links copied, is 101.6 MB. Same rules: smaller is better in every column.

| library | size, MB | pack, ms | unpack, ms | links still point at the very same objects? |
|---|---:|---:|---:|---|
| this module 1.1.0, small mode | **2.14** | 332 | **107** | yes |
| this module 1.1.0, fast mode | 2.49 | 228 | 122 | yes |
| this module 1.0.0, fast mode | 5.78 | 484 | 166 | yes |
| msgpackr (structuredClone on) | 11.49 | 581 | 305 | yes |
| cbor-x (structuredClone on) | 11.70 | 680 | 208 | no: it handed back a wrong value |
| Node's v8.serialize | 21.57 | **167** | 294 | yes |
| JSON text | 101.59 | 1169 | 914 | no: links become copies |

Takeaway: with shared objects, 1.1.0 is 2.3 times smaller and 2.1 times faster to pack than 1.0.0, 4.6 times smaller than msgpackr, and only v8.serialize (which is Node-only and 8.7 times bigger) packs faster.

### In the browsers
Same code, same checks, smaller sets (so the page finishes in about a minute): 60,000 links, 20,000 items, 10,000 users, 4,000 features, 40,000 events, 1,000 small, 4,000 irregular. Best of 12 runs, then the better of two passes. Firefox 158.0 ran with timer rounding switched off so milliseconds are real; the WebKit timer counts whole milliseconds, so small cells there are rough. Times are milliseconds (smaller is better), sizes are megabytes (smaller is better). Because the page runs one library after another, a library that goes first or right after a heavy one can look slower than it is; the table that follows (the pairs run alternately) is the fair comparison of 1.1.0 with 1.0.0.

**Firefox 158.0**

| data set (items) | this module 1.1.0 fast: pack / unpack, ms | this module 1.0.0 fast: pack / unpack, ms | msgpackr with records: pack / unpack, ms | size, MB: this module 1.1.0 / msgpackr |
|---|---|---|---|---|
| nfm-links (60,000) | 19.3 / 6.8 | 21.8 / 5 | 25 / 16 | 1.553 / 3.822 |
| nfm-nodes (20,000) | 10.9 / 4.3 | 10.5 / 4 | 12 / 9.7 | 0.437 / 1.697 |
| api-users (10,000) | 7.6 / 4.1 | 8.6 / 3.7 | 8.1 / 9.6 | 0.155 / 1.142 |
| geojson (4,000) | 5.7 / 5.1 | 5.4 / 5.7 | 7.1 / 5.3 | 0.369 / 1.446 |
| events (40,000) | 11.8 / 3.6 | 10.8 / 4.6 | 14.7 / 14.8 | 0.336 / 1.914 |
| small (1,000) | 0.6 / 0.1 | 0.5 / 0.1 | 0.5 / 0.4 | 0.007 / 0.048 |
| irregular (4,000) | 1.2 / 0.9 | 1.2 / 1 | 1.7 / 2.2 | 0.031 / 0.045 |

**ungoogled Chromium 155.0.8059.39-1**

| data set (items) | this module 1.1.0 fast: pack / unpack, ms | this module 1.0.0 fast: pack / unpack, ms | msgpackr with records: pack / unpack, ms | size, MB: this module 1.1.0 / msgpackr |
|---|---|---|---|---|
| nfm-links (60,000) | 17.9 / 6.5 | 19.1 / 5.2 | 20.1 / 8.3 | 1.553 / 3.822 |
| nfm-nodes (20,000) | 10.9 / 3.1 | 11.5 / 3.4 | 10.6 / 5.8 | 0.437 / 1.697 |
| api-users (10,000) | 8.2 / 3.1 | 6.9 / 2.6 | 6.4 / 6.6 | 0.155 / 1.142 |
| geojson (4,000) | 7.1 / 4.2 | 6 / 4 | 5.7 / 2.9 | 0.369 / 1.446 |
| events (40,000) | 14.8 / 2.7 | 12.8 / 3.7 | 12.2 / 12.3 | 0.336 / 1.914 |
| small (1,000) | 0.5 / 0.1 | 0.5 / 0.1 | 0.6 / 0.1 | 0.007 / 0.048 |
| irregular (4,000) | 1.2 / 0.8 | 1.2 / 0.7 | 0.8 / 0.8 | 0.031 / 0.045 |

**WebKitGTK 2.52.6**

| data set (items) | this module 1.1.0 fast: pack / unpack, ms | this module 1.0.0 fast: pack / unpack, ms | msgpackr with records: pack / unpack, ms | size, MB: this module 1.1.0 / msgpackr |
|---|---|---|---|---|
| nfm-links (60,000) | 25 / 7 | 24 / 7 | 25 / 9 | 1.553 / 3.822 |
| nfm-nodes (20,000) | 13 / 6 | 14 / 5 | 12 / 9 | 0.437 / 1.697 |
| api-users (10,000) | 11 / 6 | 8 / 4 | 6 / 10 | 0.155 / 1.142 |
| geojson (4,000) | 10 / 9 | 9 / 7 | 6 / 3 | 0.369 / 1.446 |
| events (40,000) | 17 / 4 | 16 / 5 | 11 / 16 | 0.336 / 1.914 |
| small (1,000) | 0.8 / 0.3 | 0.7 / 0.3 | 0.3 / 0.3 | 0.007 / 0.048 |
| irregular (4,000) | 1 / 1 | 1 / 1 | 1 / 2 | 0.031 / 0.045 |

**GNOME Web (Epiphany) 46.5**

| data set (items) | this module 1.1.0 fast: pack / unpack, ms | this module 1.0.0 fast: pack / unpack, ms | msgpackr with records: pack / unpack, ms | size, MB: this module 1.1.0 / msgpackr |
|---|---|---|---|---|
| nfm-links (60,000) | 20 / 8 | 19 / 7 | 25 / 9 | 1.553 / 3.822 |
| nfm-nodes (20,000) | 14 / 6 | 14 / 5 | 12 / 9 | 0.437 / 1.697 |
| api-users (10,000) | 12 / 6 | 7 / 4 | 5 / 10 | 0.155 / 1.142 |
| geojson (4,000) | 7 / 7 | 7 / 7 | 6 / 4 | 0.369 / 1.446 |
| events (40,000) | 18 / 4 | 16 / 5 | 10 / 15 | 0.336 / 1.914 |
| small (1,000) | 0.8 / 0.3 | 0.7 / 0.3 | 0.3 / 0.3 | 0.007 / 0.048 |
| irregular (4,000) | 1 / 1 | 1 / 1 | 1 / 1 | 0.031 / 0.045 |

What the browser tables say: the packed size is the same in every browser and is 1.5 to 7.4 times smaller than msgpackr's. Against msgpackr with records, unpacking is faster or tied on all 7 sets in Firefox and on 6 of 7 in each of the other three browsers (the map features are 1.5 to 3 times slower there). Packing is equal or faster on 6 of 7 sets in Firefox; in Chromium it is 1.2 to 1.5 times slower on the text-heavy and nested sets; in both WebKit browsers it is 1.5 to 2.4 times slower on the user records, log events and map features (users 11 against 6 ms, events 17 against 11 ms in WebKitGTK). WebKit is this module's weakest engine.

**Does 1.1.0 pack slower than 1.0.0 in a browser?** Only on text-heavy data, and only because of text patterns. Pack time, milliseconds, smaller is better (best of 30 alternating runs, fast mode; the WebKit timer counts whole milliseconds):

| browser | data set | 1.0.0 | 1.1.0 | 1.1.0 with `patterns: false` |
|---|---|---:|---:|---:|
| Firefox 158.0 | users (10,000) | 8.6 | 9.2 | 8.5 |
| Firefox 158.0 | events (40,000) | 11.8 | 16.1 | 13.4 |
| Firefox 158.0 | links (60,000) | 20.9 | 19.6 | 19.1 |
| ungoogled Chromium 155.0.8059.39-1 | users (10,000) | 7.3 | 8.4 | 7.2 |
| ungoogled Chromium 155.0.8059.39-1 | events (40,000) | 14.2 | 15.1 | 14.1 |
| ungoogled Chromium 155.0.8059.39-1 | links (60,000) | 19.1 | 17.4 | 17.4 |
| GNOME Web 46.5 | users (10,000) | 8 | 11 | 8 |
| GNOME Web 46.5 | events (40,000) | 15 | 17 | 14 |
| GNOME Web 46.5 | links (60,000) | 25 | 23 | 23 |
| WebKitGTK 2.52.6 | users (10,000) | 8 | 11 | 8 |
| WebKitGTK 2.52.6 | events (40,000) | 16 | 18 | 15 |
| WebKitGTK 2.52.6 | links (60,000) | 24 | 23 | 23 |

Takeaway: on text-heavy data 1.1.0 costs about 1 to 4 ms more per pack at these sizes and gives a 29 to 33% smaller file; on number-heavy data (links) it is the same speed or slightly faster. `patterns: false` brings the 1.0.0 speed back everywhere.

### What keeping it costs in memory (Node, after a full garbage collection)
Megabytes held in memory (smaller is better); the last two columns say how many times smaller than the live objects (bigger is better).

| set | live objects | packed fast | packed small | view() open | JSON text | objects / packed fast | objects / view |
|---|---:|---:|---:|---:|---:|---:|---:|
| nfm-links (300000) | 116.4 MB | 7.5 MB | 6.4 MB | 7.5 MB | 54.6 MB | 16x | 15.5x |
| nfm-nodes (100000) | 55.8 MB | 2.0 MB | 1.8 MB | 2.0 MB | 21.2 MB | 28x | 27.6x |
| api-users (50000) | 29.9 MB | 0.7 MB | 0.6 MB | 0.7 MB | 10.5 MB | 41x | 40.6x |
| events (200000) | 45.4 MB | 1.6 MB | 1.2 MB | 1.6 MB | 19.3 MB | 28x | 28.4x |

"live objects" is what the plain objects take in the JavaScript heap. Packed, the same data takes 16 to 41 times less (fast mode). An open `view()` keeps the packed bytes and restores a column only when it is read, so it starts at the packed size (1.0.0 restored everything up front and held 1.7 to 4.6 times less than the objects; 1.1.0 holds 15 to 41 times less until columns are read).

view() reads on nfm-nodes (100,000 items), best of 7:
- open view (reads the control stream once): 0.02 ms
- 1,000 random get(i) after open: 0.39 ms (0.39 microseconds each, objects built on the spot)
- 1,000 random field(i, "x"): 0.09 ms
- column("x") as Float32/64Array: 0.00 ms
- full unpack for comparison: 45.7 ms

Reading one column of the 300,000 links takes about 1.4 ms the first time; the first 1,000 `get(i)` calls restore every column (about 16 ms); `release()` frees them again.

## Compared with the alternatives
Measured against msgpackr 2.1.0 (with and without records, and with bundled strings), cbor-x 1.6.6, @msgpack/msgpack 3.1.3, notepack.io 3.0.1, avsc 5.7.9 (Avro), Node's `v8.serialize`, bson 7.3.3, Apache Arrow through @uwdata/flechette 2.7.0, zipson 0.2.12, compress-json 3.4.0, lz-string 1.5.0, jsonpack 2.0.0, and JSON text through fflate 0.8.3 and lz4js 0.2.0. In the browsers the pure-JavaScript ones: msgpackr, cbor-x, @msgpack/msgpack, avsc, lz4js and JSON.

### Which values come back exactly (Node; each value is packed inside `{ v: value }`, default settings unless the column says otherwise)
| value | jso-fast | JSON | msgpackr | msgpackr-records | cbor-x | cbor-x-records | @msgpack/msgpack | notepack.io | v8.serialize | bson | msgpackr (structuredClone on) | cbor-x (structuredClone on) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| undefined value | exact | changed | exact | exact | exact | exact | changed | changed | exact | changed | exact | exact |
| NaN | exact | changed | exact | exact | exact | exact | exact | exact | exact | exact | exact | exact |
| -0 | exact | changed | changed | changed | changed | changed | changed | changed | exact | exact | changed | changed |
| Infinity | exact | changed | exact | exact | exact | exact | exact | exact | exact | exact | exact | exact |
| BigInt | exact | throws | exact | exact | exact | exact | throws | throws | exact | changed | exact | exact |
| Date | exact | changed | exact | exact | exact | exact | exact | exact | exact | exact | exact | exact |
| invalid Date | exact | changed | exact | exact | exact | exact | changed | changed | exact | changed | exact | exact |
| Map | exact | changed | changed | exact | exact | exact | changed | changed | exact | throws | changed | exact |
| Set | exact | changed | changed | changed | exact | exact | changed | changed | exact | changed | exact | exact |
| RegExp | exact | changed | changed | changed | exact | exact | changed | changed | exact | exact | exact | exact |
| Float32Array | exact | changed | changed | changed | exact | exact | changed | changed | exact | changed | exact | exact |
| ArrayBuffer | exact | changed | changed | changed | changed | changed | changed | changed | exact | changed | exact | changed |
| sparse array | exact | changed | exact | exact | exact | exact | changed | changed | exact | changed | exact | exact |
| own "__proto__" key | exact | exact | changed | changed | changed | changed | throws | changed | exact | exact | changed | changed |
| lone surrogate in text | exact | exact | changed | changed | changed | changed | exact | changed | exact | changed | changed | changed |
| whole number above 2^53 | exact | exact | exact | exact | exact | exact | exact | changed | exact | exact | exact | exact |
| class instance | plain object | plain object | plain object | plain object | plain object | plain object | plain object | plain object | plain object | plain object | plain object | plain object |
| null-prototype object | exact | changed | changed | changed | changed | changed | changed | changed | changed | changed | changed | changed |
| same object twice (stays one object) | exact (refs: true) | two copies | two copies | two copies | two copies | two copies | two copies | two copies | exact | two copies | exact | exact |
| object that contains itself | exact (refs: true) | throws | throws | throws | throws | throws | throws | throws | exact | throws | throws | exact |

"changed" means the value came back different (for example `-0` as `0`, a `Set` as an array or a plain object, `undefined` as `null`); "two copies" means the same object came out as two equal objects; "plain object" means a class instance came back as an object without its class (every library here does that). msgpackr and cbor-x have an optional `structuredClone` setting; the last two columns show what it fixes. This module returned all 18 plain-data values exactly (shared objects and cycles need `refs: true`); the closest other is `v8.serialize`, which misses only null-prototype objects but works in Node only and is 69 to 119% of the JSON text. avsc and Flechette are left out of this table because they need a schema or flat columns; with the schema inferred from the data, avsc also stored decimals as 32-bit floats until they were widened to doubles for the speed tables.

### Features
| | memory-compression-jso 1.1.0 | msgpackr 2.1.0 | cbor-x 1.6.6 | @msgpack/msgpack 3.1.3 | avsc 5.7.9 | v8.serialize | Flechette 2.7.0 | JSON |
|---|---|---|---|---|---|---|---|---|
| License | MIT | MIT | MIT | ISC | MIT | built into Node | BSD-3-Clause | built in |
| Needs a schema | no | no | no | no | **yes** (inferred in these tests; hand-written is faster) | no | no, but flat columns only | no |
| Works in browsers | yes | yes | yes | yes | yes (needs a bundler) | **no** (Node only) | yes | yes |
| Size to ship (gzipped) | 148 KB (47 KB), not minified, WebAssembly text is 29 KB of it | 30 KB (11 KB), minified | 31 KB (11 KB), minified | 22 KB (6 KB), minified | 117 KB (34 KB), minified browser bundle | 0 | 49 KB (16 KB), minified | 0 |
| Pack and unpack are synchronous | yes | yes | yes | yes | yes | yes | yes | yes |
| Streaming | no | yes | yes | yes | yes | no | not measured | no |
| Floats-aware (decimals as whole numbers, byte shuffle, column difference) | **yes** | no | no | no | no | no | no | no |
| Keep packed, read one item or one column | **yes** (`view()`) | no | no | no | no | no | yes (Arrow tables) | no |
| Nested objects, mixed arrays, `Map`, `Set`, `Date`, `BigInt`, `undefined`, `-0` | **yes** | partly (see the table above) | partly | partly | needs a schema (not run through the table above) | yes, all but null-prototype objects | flat columns (not run through the table above) | no |
| Safe on hostile input (limits, bounds) | **yes** (`maxItems`, `maxSize`, every size checked, fuzzed) | not measured | not measured | not measured | not measured | not measured | not measured | n/a |
| Cycles and shared objects | with `refs: true` | no | no | no | no | yes | no | no |
| Works without WebAssembly | yes (same bytes; 1.0 to 1.4 times slower to pack and 1.0 to 1.25 times to unpack in Node) | n/a | n/a | n/a | n/a | n/a | n/a | n/a |

**Inside JS-modules:** [memory-compression](../memory-compression/README.md) packs typed arrays and bytes (no objects); this module is the same core plus an object layer. `save-kit` and `zip-open` use the browser's own `CompressionStream` (asynchronous, no floats help).

## What it is not
- **Not the fastest packer for every shape of data.** On objects with many short text fields (the users set) it packs 1.2 times slower than msgpackr with records in Node and up to 2.4 times slower in WebKit, and avsc with a schema packs faster on the big sets. It wins on size, on unpack speed in most cases, and on number-heavy data.
- **Not good at irregular data.** When every item is different the size gain falls to about 37% of the JSON text and speed is about even with msgpackr, which is the bottom of what it does.
- **Not a streaming format.** It packs a whole value at once and needs the whole result to unpack.
- **Not a way to keep a live scene.** Unpacking 300,000 links takes about 70 ms in Node. Use it for data that sits still (other scenes, undo steps, saves, big tables, a copy kept while the objects are freed), then unpack it when you need it, or use `view()` to read single items.
- **Class instances come back as plain objects**, shared objects come back as copies unless `refs: true`, sparse array holes come back as `undefined`, and 64-bit typed arrays and `DataView` are refused with a clear error.

## API
`pack(value, opts)` returns a `Uint8Array`.
| Option | Meaning | Default |
|---|---|---|
| `mode` | `'fast'` (LZ4-class) or `'small'` (deflate, about 15 to 25% smaller, 2 to 3 times slower to pack) | `'fast'` |
| `level` | deflate effort 0 to 9 in small mode | 4 |
| `refs` | `true` keeps shared objects shared and allows cycles (lists of objects are still stored by column) | off |
| `check` | `true` adds a checksum that `unpack()` verifies | off |
| `fsst` | `true` also tries FSST codes for text columns (smaller, any one string readable alone; slower to pack) | off |
| `pco` | the object from `MemoryCompressionJSOPco.load()` or `.loadSync()`: number columns of 4,096 or more are also tried with Pcodec and the smaller is kept (also pass it to `unpack` and `view` for files that used it) | off |
| `patterns` | `false` skips the text-pattern step (bigger result, faster to pack text-heavy data) | on |
| `float32` | `true` keeps columns of fractions in 4 bytes per value (lossy: relative error at most about 6e-8; values beyond 3e38 stay 8 bytes) | off |
| `pool` | `false` does not reuse number-column arrays between packs (they are otherwise kept for the next pack, at most 48 MB; `freeBuffers()` empties them) | on |
| `wasm` | `false` forces plain JavaScript | use WebAssembly if available |
| `report` | an array that is filled with what each part took (path, bytes before and after, milliseconds) | none |

`unpack(bytes, opts)` returns the value. `opts.maxItems` (default 100,000,000) is the most values it will make and `opts.maxSize` (default 1 GiB) the biggest column it will allocate; both stop a hostile or damaged input before it can use all memory. `opts.wasm` as above.

`view(bytes, opts)` for a packed array of 16 or more objects that all have the same keys returns `{ length, keys, lazy, get(i), field(i, key), column(key), toArray(), loaded(), release(), memory() }`. A file made by 1.1.0 opens without restoring anything (`lazy` is true) and restores a column on first read; a file made by 1.0.0 is restored at open, as before.

Also: `freeBuffers()` (gives back the arrays kept between packs), `ready()` (a promise), `accelerated()` (is the WebAssembly helper in use), and `core` (the memory-compression module inside, for typed arrays and bytes). Errors are `Error` objects whose message starts with `MemoryCompressionJSO:` and say what is wrong in plain words.

## Good to know
- **Exact.** `pack` then `unpack` gives a value that is equal in every way the tests check (see the table of values above); the same bytes come out with and without WebAssembly (checked).
- **Same keys, same order.** Own enumerable string keys are kept in their original order. Symbol keys and non-enumerable properties are not stored.
- **Hostile input is safe to read.** Every count and size is checked against what is possible, damaged or cut-off data throws, and a flipped byte either throws or (without `check: true`) changes a value. The test file cuts data at every length and flips every byte.
- **`new Function` is used for speed.** Where a page policy blocks it (tested in Node with `--disallow-code-generation-from-strings`), plain loops do the same work and the bytes are identical, but packing is 1.1 to 1.3 times slower and unpacking 1.2 to 3.3 times slower.
- **Very large inputs.** `maxItems` stops an unpack that would make more than 100 million values (change it if the data is yours).
- **Format 3 (1.2.0).** A file that holds a date column, an FSST text column or a Pcodec number column says format 3 and 1.1.x refuses it with the message "made by a newer version"; every other file still says format 2 and opens in 1.1.x. 1.2.0 reads formats 1, 2 and 3.
- **Format.** The first two bytes are `MJ`, then a version byte; a file written by 1.0.0 is read by 1.1.0 (checked with a stored 1.0.0 file), but a 1.1.0 file is format 2 and 1.0.0 cannot read it. It is not compatible with `memory-compression`'s container (different magic).

## Prior art
msgpackr and cbor-x (record extension: repeated object layouts written once; generated decoders), avsc (Avro, schema-compiled code), Apache Arrow and Flechette (columnar tables), ALP (SIGMOD 2024: decimal doubles stored as scaled whole numbers; used here in a simple form), FSST (VLDB 2020, text tables; used as the opt-in `fsst` option, with its own 3 KB WebAssembly kernel and a JavaScript port), CLP, Denum and LogPrism (log compression: text patterns plus number columns, which is what 1.1.0's text patterns do in a simple form), BtrBlocks and Vortex (pick an encoding per column from a sample; cascading encodings), Pcodec (arXiv 2502.06112, number modes; used through the optional add-on file, Apache-2.0), Blosc (byte shuffle, through memory-compression). The format and code are this repository's own.

## For AI agents
- Use `pack`/`unpack` for a big array of similar objects you want to keep small in memory or save; `view()` to read single items from a packed array; `mode: 'small'` for anything restored rarely.
- Use `{ refs: true }` for a graph where links hold the node objects; `view()` for reading a little from a lot. Do not use it for tiny values (under about 16 items it is the general form and not much smaller than JSON), for streaming, or for data with class instances you need back as classes.
- Await `MemoryCompressionJSO.ready()` once at start-up. Check `packed.length`; irregular data gives up only about 60%.
- `{ fsst: true }` for big columns of names, paths or log lines (about half the size, one string readable alone, 2 to 6 times slower to pack); skip it for patterns and repeating values, which already have a smaller way (it chooses by itself).
- Number-heavy data that is packed rarely and kept for long (sensor logs, prices, coordinates): load `memory-compression-jso-pco.js`, `await MemoryCompressionJSOPco.load()` and pass the result as `pco` to `pack`, `unpack` and `view` (up to 67% smaller, 1.2 to 3.5 times slower to pack). Treat a `null` from `load()` as "not available" and carry on without it.
- To re-run the comparison: `bench/README.md`.
