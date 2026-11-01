# pcodec-js developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.6.3 · API 1 · 2026-10-31

### Quick
Embedded base64 decode uses Uint8Array.fromBase64 when present, falling back to the atob loop (or Buffer in Node).

### Deep
Embedded base64 decode uses Uint8Array.fromBase64 when present, falling back to the atob loop (or Buffer in Node). Same bytes: 20 of 20 embedded programs compared in Chromium 155, Firefox 158 and WebKitGTK 2.52.6. Decode time of all embedded programs, fromBase64 / atob loop: Chromium 0.18, Firefox 0.11, WebKitGTK 0.08 (cloud). Tests pass on both paths (Node 22 has no fromBase64, so the new path ran under a Buffer shim).

## 1.6.2 · API 1 · 2026-10-31

### Quick
After a big unpack, an idle-time spare array of the same size is made and touched; the next unpack fills it. Dropped after idleMs; load({spare:false}) turns it off.

### Details
The owner's pick (spare + docs). First write to fresh memory costs ~0.7 ms/MB in all 3 browsers (6-7x reused); Firefox stalls 150-350 ms on repeated big results. Repeated 5M-number unpacks every 150 ms, ratio new/old (90% range, rounds): Chromium 0.630 (0.614-0.793, 11, noisy), Firefox 0.799 (0.757-0.821, 6), WebKitGTK 0.866 (0.707-0.990, 6). Spare made with requestIdleCallback (timeout 1 s) or a timer, one write per 4 KB page, dropped after idleMs (4 s) unused. Research: round13-fresh-memory.

### Deep
Idle-time spare array for repeated big unpacks (0.63-0.87x the time).

## 1.6.1 · API 1 · 2026-10-27

### Quick
A maxCount of 0 now refuses every nonempty file (it used to be ignored); NaN and negative limits are refused; Infinity still means no limit. Same files, same speed.

## 1.6.0 · API 1 · 2026-10-23

### Quick
Files 45-56% smaller (program stored deflated); big unpacks use 6 MB, not 36 MB, of wasm memory; idle pool workers end after idleMs (4 s). New load({ lean: false }) gives WebKit browsers 1.5.1 speed back (keeps 36 MB, freed when idle).

### Deep
Footprint release. Order of numbers: Chromium / Firefox / WebKitGTK / GNOME Web, ungoogled-chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6, GNOME Web (Epiphany) 46.5, one at a time on a 4-core test machine; 1.5.1 and 1.6.0 take turns in the same browser. Timers round to whole ms outside Chromium. Node was used only for pass/fail. The wasm programs are the same Pcodec 1.0.4 code; written bytes are identical to 1.5.1 (checked on 24 columns, byte for byte).

Changed (API unchanged):
1. **Lean `unpack()`.** The copy form of `unpack(bytes)` for 262,144 numbers or more (page, worker and every pool lane) decodes in batches of 65,536 numbers straight into the result array instead of decoding everything into wasm memory and copying. `view`, `into` and `stream()` are untouched. Wasm memory held after a 4,000,000-number unpack: 36.3 MB to 6.3 MB in all four browsers.
2. **Packed embedded program.** `build.py` stores each wasm as deflate-raw (zlib level 9) then base64; `load()` opens it with `DecompressionStream('deflate-raw')`, compiles it and drops the text. Workers receive the compiled program, so nothing is opened twice. A browser without `DecompressionStream` gets a clear error.
3. **Pool parking.** A pool ends its workers after `idleMs` (default 4000, 0 turns it off) without a job and starts them again at the next job. `p.workers()` and `p.idleMs` are new. Workers start one per page turn, so the page task of the call that starts them is shorter than before.

**File sizes (bytes, smaller is better; gzip level 9):** pcodec-js.js 193,364 to 106,348 (gzip 75,081 to 61,314); pcodec-js-fast.js 253,052 to 122,204 (93,775 to 73,420); pcodec-js-pack.js 503,856 to 219,644 (193,195 to 142,786). The brief's targets were about 99,500 / 115,300 / 213,700 raw and 58,900 / 71,000 / 141,300 gzipped; the files are 6.9 / 6.0 / 2.8% above the raw targets and 4.1 / 3.4 / 1.1% above the gzip targets (the remainder is the new lean, parking, `lean: false` and inflate code).

**Copy `unpack()` of one 4,000,000-number file, ms, median of 40 turns (lower is better):**

| Case | Chromium | Firefox | WebKitGTK | GNOME Web |
|---|---:|---:|---:|---:|
| Program already holds its memory: 1.5.1 / 1.6.0 | 53.4 / 50.6 (-5%) | 52 / 49 (-6%) | 46 / 57 (+24%) | 47 / 56 (+19%) |
| Fresh program (`release()` before each call): 1.5.1 / 1.6.0 | 70.4 / 58.2 (-17%) | 67 / 52 (-22%) | 63 / 61 (-3%) | 66 / 60 (-9%) |

Slowdown, reported as required: in WebKitGTK and GNOME Web a 4,000,000-number copy unpack on a program that already holds its memory is 19 to 24% slower (three fresh-instance repeats: +23/+24/+24% and +21/+22/+19%). The cause is that the result array is now a new zero-filled array that the batches are copied into, where 1.5.1 sliced a pre-grown buffer; batch size makes no difference. The research targets (26 / 62 / 25 / 24% faster) compared against a pre-allocated array and are not reached. The 13-column set (only one column reaches the batched path) is unchanged: 16.8 / 15 / 14 / 14 ms to 16.3 / 15 / 14 / 14.

**Start-up in a fresh page, pcodec-js.js, ms, median of 40 pages (lower is better); total = script run + `load()`:** 1.5.1 5.7 / 8 / 4 / 4; 1.6.0 6.0 / 9 / 6 / 5.5. pcodec-js-pack.js: 10.2 / 19 / 8.5 / 9 to 9.6 / 17 / 10 / 10.5. Added start-up cost 0.3 to 2.5 ms for the reader, as predicted (1 to 5 ms).

**Workers, ms, median of 40 pages (lower is better), 1.5.1 / 1.6.0:** first worker ready 12.7 / 8 / 8 / 8 to 14.7 / 8 / 7 / 8 (Chromium +2 ms, reported); pool of 4 with `warm: true` 9.3 / 13 / 3 / 3 to 3.3 / 3 / 1 / 1; first 4,000,000-number unpack on a new worker 89.4 / 89.5 / 102.5 / 105 to 73.9 / 74 / 84.5 / 86; first split-file unpack on a new pool of 4 91.7 / 94.5 / 91.5 / 91.5 to 101 / 98.5 / 92 / 90.5 (Chromium +10%, Firefox +4%, within the spread of repeated runs; re-checked with fresh instances); second split-file unpack on the same pool 67.2 / 84.5 / 72.5 / 75.5 to 69.9 / 82 / 76.5 / 76 (ties).

**Pool of 3 workers, steady state, ms, median of 20 turns (lower is better), 1.5.1 / 1.6.0:** split 4,000,000 joined 62.6 / 77 / 50 / 51 to 56.9 / 64 / 53 / 52; one normal 4,000,000 file 70.4 / 76 / 52 / 52 to 65.7 / 67 / 61 / 62 (WebKit-based +17 / +19%, same cause as above); 12 columns as a list 22.6 / 21 / 19 / 18 to 22.8 / 22 / 19 / 18. `pack()` of 850,000 numbers (same bytes): 53 / 56 / 53 / 51 to 53.7 / 57 / 51 / 52.

**Page tasks:** the page task of the call that starts 4 workers (the first job of a pool), median (worst of 40): 1.5.1 11.4 (17.3) / 6 (8) / 3 (9) / 3.5 (9) ms; 1.6.0 4.1 (9.6) / 2 (5) / 1.5 (3) / 1 (3) ms. Longest page gap measured while loading the reader: 4.5 / 4 / 5 / 5 ms median; the worst single start-up gap was 8 / 6 / 10 / 19 ms in the reader file (a 40-page worst case that also appears in 1.5.1: 8 / 9 / 7 / 12).

**Pool parking, `idleMs: 2500` for the measurement, ms (lower is better):** longest page gap while idle 4.8 s: no pool 10.4 / 37 / 13 / 26.5; 1.5.1 pool 10.3 / 36.5 / 6.5 / 20.5; 1.6.0 pool that parks 10.3 / 36 / 8 / 6.5 (ambient browser timers dominate; parking adds nothing measurable: within 60 ms of the parking the gap is 0 / 6 / 0 / 0 ms median, worst 6.1 / 7 / 0 / 5). First job after parking (4 small files) 40.4 / 20 / 34.5 / 30 ms against 6.4 / 7 / 9.5 / 8 on a warm pool (this is the restart cost; worker start was 29 / 8 / 14 / 14 ms for the first worker in the research).

**Memory of the whole browser (proportional memory of all browser processes, MB, median of 4 fresh page pairs, lower is better), 1.5.1 / 1.6.0:** process growth of a 4,000,000-number copy unpack (before the result is freed) +65.6 / +27.1 / +49.7 / +43.0 to +33.8 / +36.2 / +2.0 / +27.3 (Firefox does not show the saving: its 36 MB of 1.5.1 wasm memory is mostly not touched pages, the counted growth is the same result array in both); an idle pool after one split unpack held 52.1 / 16.9 / 63.4 / 60.3 MB over the same pool after it was ended and holds 0.2 / 0.0 / 10.9 / 9.8 MB after parking (workers running after idle: 0 in all four).

**Against numcodecs-wasm-pco 0.4.0 (13 columns, 8 rounds of 25 passes, fresh pages, each build opens files it wrote itself, all results identical), ns per number, lower is better:** copy unpack 10.68 / 10.16 / 9.17 / 9.50 against 1.6.0 10.45 / 9.83 / 10.16 / 9.17 (1.5.1 10.75 / 10.16 / 9.17 / 9.17): a tie in three browsers, WebKitGTK 11% slower than numcodecs-wasm-pco and 11% slower than 1.5.1. View 7.08 / 6.55 / 8.19 / 7.86. Pack of 3 float columns 49.6 / 51 / 50 / 51 against 42.9 / 53 / 52.5 / 50.5 ms. `load()` until ready 105.5 / 66.5 / 67 / 65 against 9 / 9 / 6 / 6 ms. Download gzipped 324,006 B against 61,314 B (reader) and 142,786 B (with packer).

**Follow-up in the same release (PR 139 hold): `load({ lean: false })` and idle release.** `load({ lean: false, idleMs })` returns its own object that unpacks big copies the 1.5.1 way (the program decodes the whole result into its memory and copies it out once). `worker({ lean })` and `pool({ lean })` pass it on. The object lets its program go when no call has come for `idleMs` (default 4000, 0 turns it off; unref'd timer, cancelled by `release()`, never fires under an open `stream()`); the next call starts a new program. The default stays lean. **`lean: false` trades 36.3 MB (4,000,000 numbers) for WebKit speed.** Files grew 1,501 / 1,501 / 1,501 bytes (now 106,348 / 122,204 / 219,644 raw; gzip level 9 61,314 / 73,420 / 142,786).

**Copy `unpack()` of one 4,000,000-number file, ms, median of 40 turns, 3 fresh instances (lower is better); 1.5.1 / 1.6.0 default / 1.6.0 `lean: false`:**

| Case | Chromium | Firefox | WebKitGTK | GNOME Web |
|---|---:|---:|---:|---:|
| Program already holds its memory | 64.7 / 61.0 / 65.3 | 60 / 57 / 65 | 57 / 73 / 56 | 60 / 77 / 62 |
| `lean: false` against 1.5.1 | +1% | +8%, then +2 / -6 / 0% in three more fresh instances | -2% | +3% (then -2 / 0 / +4%) |
| Default lean against 1.5.1 | -6% | -5% | +28% | +28% |
| Fresh program (`release()` before each call) | 84.4 / 74.4 / 86.4 | 90 / 70 / 89 | 79 / 79 / 80 | 81 / 81 / 78 |

Machine load was higher than in the first round (1.5.1 steady 64.7 / 60 / 57 / 60 against 53.4 / 52 / 46 / 47), so compare within the rows. With `lean: false` WebKitGTK and GNOME Web are within 5% of 1.5.1; the default numbers are unchanged within noise (lean against 1.5.1 earlier -5 / -6 / +24 / +19%).

**Memory with `lean: false` (4,000,000 numbers, MB, `idleMs: 2000`, median of 15 pages):** wasm memory before the call 0, right after the unpack 36.2, after the idle release 0 (released at 2.00 / 2.05 / 2.00 / 2.00 s after the call) in all four browsers. First call after the release 96 / 77 / 97 / 98 ms; the very first call 98 / 98 / 116 / 122 ms; warm 87 / 60 / 86 / 78 ms. The release itself is a variable assignment (no page task); the 150 to 300 ms page gaps seen in Chromium about 1.5 and 4 s after a 32 MB result also appear with the release off (garbage collection of the result array), so they belong to any big result, not to the release.

**Checks:** node: 1,261 checks for each of the two readers (the old 1,152 plus 109 for lean unpack, packed program, pooling, parking, lean: false and the idle release); the strict-policy page (only `'wasm-unsafe-eval'` and `worker-src blob:`) passes in all four browsers (copy, stream, lean copy, worker, pool, parking and restart, split file, end); browser test pages 491 checks in each of the four browsers and the split-file test in each; the bridge check against stock Pcodec 1.0.4 (24 columns, 150 files, reads by pcodec-js.js, pcodec-js-fast.js and pcodec-js-pack.js, and files written by pcodec-js read by the stock tool): 0 differences in all four browsers; both directions of the bridge were checked (stock Pcodec 1.0.4 reads the 150 files pcodec-js wrote, and pcodec-js reads stock-written files). memory-compression 2.x no longer has a Pcodec route (its reader refuses that column type), so there is no memory-compression bridge to run. New and changed checks were run against the 1.5.1 code and fail there.

## 1.5.1 · API 1 · 2026-10-22

### Quick
1.5.1: unpacking a list of files on the worker pool is 1.2 to 1.4 times faster in Firefox, WebKitGTK and GNOME Web (Chromium: a tie).

## 1.5.0 · API 1 · 2026-10-22

### Quick
New { into: myArray } for worker and pool unpack: fills an array you already have. 8 million numbers open 1.07 to 1.3 times faster (normal file) and 1.3 to 1.7 times (split file); Chromium's page pause falls from 48 ms to 9 ms. New pool({ warm: true }) starts the workers when the pool is made: the first big unpack is 3 to 26 ms faster, for 3 to 7 ms at creation.

### Deep
Added (JavaScript only; wasm programs and written bytes unchanged):

1. **`{ into }` for worker and pool unpack.** `await w.unpack(bytes, { into: arr })` and `await p.unpack(file, { into: arr })` (normal or split file) hand the array's memory to a worker, which fills it (a split file's parts are joined into it) and sends it back as the result; `arr` is empty afterwards, so pass the result in again on the next call. A wrong type or a too-short array is refused before anything is handed over for a split file; `into` with `parts: true` and with a list of files is refused.
2. **`pool({ warm: true })`** (or a number of workers) starts the workers when the pool is made.
3. Confirmed, no change needed: the program is compiled once. Counting `WebAssembly.compile` calls on the page while the library loaded, `worker()` started and a pool of 4 opened a split file twice: exactly 1 in all four browsers. Workers receive the compiled module, and the program text they carry is a stub that cannot be compiled, so they cannot compile either.

**8,000,000 numbers, pool of the default size (3 workers on this 4-core machine), 30 turns, ms and page pause (lower is better).** Time / median longest page gap:

| Case | Chromium | Firefox | WebKitGTK | GNOME Web |
|---|---|---|---|---|
| Normal file, new array | 139.9 / 7.4 | 138 / 7 | 123 / 3 | 124 / 4 |
| Normal file, `into` reused | 106.2 / 5.6 | 109 / 6 | 115 / 3 | 116 / 3 |
| Split, joined, new array | 143.2 / 48.3 | 121 / 9 | 105 / 6 | 97 / 8 |
| Split, joined, `into` reused | 82.9 / 8.7 | 87 / 8 | 74 / 8 | 76 / 7 |
| Split, parts only | 73.9 / 7.5 | 68 / 6 | 62 / 6 | 61 / 7 |

Against a normal file with a new array each time: `into` on a normal file is 1.32 / 1.27 / 1.07 / 1.07 times faster; a split file with `into` 1.69 / 1.59 / 1.66 / 1.63 times; parts only 1.89 / 2.03 / 1.98 / 2.03 times. The joined split file with `into` against the same file with a new array: 1.73 / 1.39 / 1.42 / 1.28 times.

**Page pause, honestly.** The common turn is 3 to 9 ms; the 8 ms guide is met in about half of the turns for a split file (Chromium joined with `into` 15 of 30 turns over 8 ms, parts only 13 of 30; normal file with `into` 6 of 30), and Chromium has random pauses of 30 to 100 ms from garbage collection of 64 MB results that `into` mostly removes (joined, new array: median 48.3 ms, 27 of 30 turns over 8 ms; with `into`: median 8.7). What the page itself spends is small: slicing a part and posting it each cost 1 ms or less in WebKitGTK, and the call returns in 0 to 1 ms. The remainder is the machine: 3 workers and the browser share 4 cores, and a ticker on the page waits behind worker traffic (gaps of about 4 ms every 4 ms while parts arrive). With a pool of 4 on 4 cores it was worse (median 9 to 12 ms in WebKitGTK and GNOME Web), which is why the default pool leaves one core free.

**`pool({ warm: true })`, first unpack of a 6,000,000-number split file on a new default pool after 150 ms idle (ms, lower is better; cold / warm; 12 turns):** Chromium 104.5 / 78.4, Firefox 94 / 78, WebKitGTK 87 / 84, GNOME Web 92 / 82. Making the pool costs 7 / 4 / 3 / 3 ms with `warm`, 0 without.

Sizes (raw / gzipped): pcodec-js.js 192,606 B / 75,252 B (was 191,078 / 74,803 in 1.4.0); pcodec-js-fast.js 252,294 / 93,616 (250,766 / 93,169); pcodec-js-pack.js 503,098 / 193,197 (501,570 / 192,782). Size ceilings are suspended.

Checks: 1162 pass for both readers (1152 in 1.4.0; 10 new: `into` through the pool for split files, a longer array, the one-worker path, the worker and a normal file, refusals for a short array, wrong type, `parts` and a list, and `warm`).

## 1.4.0 · API 1 · 2026-10-22

### Quick
New split file: pack(x, { parts: true }) writes a big column as ordinary Pcodec files, and the pool opens the parts on several workers. 8 million numbers open 1.25 to 1.6 times faster (joined), 2.1 to 2.8 times as parts.

### Deep
Added (JavaScript only; no change to the wasm programs, the bytes `pack()` writes by default, or how a normal file is unpacked):

1. **Split file.** `pack(x, { parts: true })` (reader/packer, worker and pool) cuts a column into groups of Pcodec's own pages (up to 8 parts, never fewer than a page each) and writes each group as an ordinary Pcodec file behind a header: magic `PCJM`, version 1.0, total count (u32), part count (u16), the length of each part (u32), then the parts. A column of one page returns a normal file. The parts join byte for byte into what `pack()` would write, so any Pcodec reader opens each part. Extra bytes over a normal file: 31 (0.5 million numbers), 127 (2 million), 135 (8 million).
   Opened by `unpack`, `unpackAsync`, `stream` and `info` (count and type of the whole column), in a worker and in the pool. Damaged headers, wrong lengths, mixed types and a wrong total are refused with a clear error. `smallest` cannot be combined with `parts`.
2. **Pool unpack of a split file.** The parts are shared over the workers; by default a worker is added for every 25 ms of expected work (`laneMs`), so a split file under about 2.5 million numbers is opened whole by one worker, as a normal file would be. When several workers were used, the first worker joins the parts and hands back one typed array, so the page never copies a big array itself. `pool.unpack(file, { parts: true })` skips the join and returns an array of typed arrays in order.
3. **Pool pack of a split file** places the page groups as the parts without joining them into one file.

**Unpack, 8,000,000 numbers (ms, lower is better; normal file on one worker / split file joined, pool of 4 / split file as parts, pool of 4; 15 turns):**

| Browser | Normal, 1 worker | Split, joined | Split, parts | Joined faster by | Parts faster by |
|---|---:|---:|---:|---:|---:|
| ungoogled-chromium 155 | 142.3 | 113.6 | 58.4 | 1.25 times | 2.4 times |
| Firefox 158.0 | 137 | 104 | 64 | 1.32 times | 2.1 times |
| WebKitGTK 2.52.6 | 142 | 90 | 51 | 1.58 times | 2.8 times |
| GNOME Web 46.5 | 144 | 93 | 53 | 1.55 times | 2.7 times |

**Unpack, smaller columns (ms, lower is better; normal / split joined / split parts; 9 turns):**

| Numbers | Chromium | Firefox | WebKitGTK | GNOME Web |
|---|---|---|---|---|
| 2,000,000 | 33.1 / 34.7 / 36.2 | 34 / 32 / 36 | 36 / 38 / 30 | 35 / 32 / 36 |
| 500,000 | 10.1 / 8.9 / 9.7 | 8 / 9 / 9 | 7 / 9 / 9 | 8 / 9 / 9 |

Ties within noise: below about 2.5 million numbers the default pool keeps the job on one worker, so nothing gets slower. (An earlier build copied the parts into one array on the page: with a forced pool of 4 that was slower than a normal file at 2 million numbers, 53.6 to 62 ms against 34.3 in Chromium, and froze the page for up to 131 ms at 8 million. Joining in a worker fixed both.)

**Page freeze while unpacking 8,000,000 numbers (longest gap between page turns, ms, lower is better; normal / joined / parts):** Chromium 7.1 / 19.9 / 4.4; Firefox 10 / 8 / 6; WebKitGTK 5 / 9 / 10; GNOME Web 4 / 10 / 14. In Chromium a 64 MB result now and then brings a 45 to 100 ms pause for garbage collection; it showed up equally with a normal file on one worker (59 and 102 ms in 8 turns), so it belongs to the size of the result and not to the split file. The 8 ms guide is met for the common turn in Firefox, WebKitGTK and GNOME Web with a normal file; joined and parts are within 2 to 14 ms. A page that cannot take even that should use `{ parts: true }` and draw from the parts.

**Pack, pool of 4 (ms, lower is better; normal file / split file; 1 worker for reference):**

| Numbers | Chromium | Firefox | WebKitGTK | GNOME Web |
|---|---|---|---|---|
| 8,000,000 (15 turns) | 220.4 / 184.1 (1 worker 498) | 269 / 203 (507) | 240 / 220 (528) | 223 / 217 (517) |
| 2,000,000 (9 turns) | 64.8 / 56.7 | 69 / 68 | 59 / 54 | 57 / 50 |

The split file is 1% to 25% faster to pack in the pool because nothing has to be joined into one file. Without a pool, unpacking a split file on the page takes the same time as a normal file (8 million numbers, Chromium 123.7 against 128.5 ms).

Ideas weighed and left out: workers writing into shared memory (needs cross-origin isolation, which pages do not have); more than 8 parts (each part costs a copy and a message); a parts mode that keeps the index inside a normal file (breaks Pcodec readers).

Sizes (raw / gzipped): pcodec-js.js 191,078 B / 74,803 B (was 182,381 / 72,753); pcodec-js-fast.js 250,766 / 93,169 (was 242,069 / 91,106); pcodec-js-pack.js 501,570 / 192,782 (was 491,024 / 190,313). Size ceilings are suspended.

Checks: 1152 pass for both readers (935 before; 217 new: 24 split files of different types and lengths, byte identity between the pool and the main thread, damaged headers, mixed types, wrong totals, count guards, stream and info, worker and pool unpack with and without `parts`).

## 1.3.0 · API 1 · 2026-10-22

### Quick
New pack(x, { smallest: 'quick' }): tries decimal settings only when a column looks like decimals. 39 test columns come out 3.4% smaller at 1.7 times the plain pack time (full smallest: 4.0% smaller at 3.3 to 3.5 times).

### Deep
Added (JavaScript only; no change to the wasm programs, the bytes `pack()` writes by default, `unpack()` or the pool):

1. **`pack(x, { smallest: 'quick' })`.** For float arrays of 256 numbers or more it samples about 512 values and looks for the coarsest of 0.1, 0.01, 0.001, 0.0001, 0.00001, 0.000001 that at least 99% of them are a whole multiple of. If there is one it also packs with that Pcodec setting and keeps the smaller file; otherwise (and for integers and short arrays) it returns the plain pack, with no extra pass. Files are ordinary Pcodec files, never larger than plain.
   File size over the 39 test columns (bytes): plain 2,892,944; quick 2,793,406 (3.4% smaller); `smallest: true` 2,778,048 (4.0% smaller). Over the 12 timing columns: 1,793,004; 1,693,820 (5.5% smaller); 1,688,178 (5.8% smaller). The saving is concentrated: quick helped 2 of the 39 columns (quakes Latitude 162,248 to 63,064 B, 61% smaller, where Pcodec's own automatic mode misses that the values are multiples of 0.001; a six-value palette column 1,231 to 877 B) and left the other 37 unchanged; `smallest: true` also gains 0.1% to 15% on 7 more decimal columns by other settings (delta and lookback).
   Time to pack the 12 columns (ms, lower is better, median of 9 turns): plain 58 / 69 / 65 / 60; quick 99.6 / 156 / 110 / 101 (1.7 / 2.3 / 1.7 / 1.7 times plain); `smallest: true` 196 / 240 / 214 / 193 (3.4 / 3.5 / 3.3 / 3.2 times). The cost of quick is paid on every column that looks like decimals, including the ones where it finds nothing.
2. **Phone test page** `phone-test/pcodec-js-phone-test.html`: runs the pool timings on a real device and saves a plain-words report. Works in the four test browsers.

Tried and dropped (idea list asked for by the owner 2026-10-22):
- **Single-pass bin lookup and offsets in the packer** (identical bytes): 12 columns, ms, current against new: 60.2 / 69 / 58 / 58 against 59.2 / 69 / 57 / 58. A tie.
- **Hand-written SIMD for unpacking offsets.** Counted instead of built: across the 39 columns 75.4% of the 1,927,347 offset reads sit in batches of 256 numbers whose bit widths differ, where SIMD cannot help (wasm has no per-lane shifts or gathers); 20.9% sit in batches of one width and 3.7% in batches of width zero. Offsets are about 40% of unpack time, so even free uniform-width reads would give at most about 8%, and in practice a few percent. Not built. (The count came from a Node run of an instrumented build; it is a count, not a speed result.)

Sizes (raw / gzipped): pcodec-js.js 182,381 B / 72,753 B (unchanged from 1.2.0 except the doc line); pcodec-js-fast.js 242,069 / 91,106; pcodec-js-pack.js 491,024 / 190,313 (was 489,595 / 189,835 in 1.2.0). Size ceilings are suspended.

Checks: 935 pass for both readers (909 before; 26 new: round trips and never-larger for f64 and f32 at four lengths, noise, integers untouched, short arrays untouched, special floats, through worker and pool).

## 1.2.0 · API 1 · 2026-10-22

### Quick
New PcodecJS.pool() shares packing across background workers: one 2,000,000-number column took 129 to 142 ms on one worker, now 58 to 80 ms (lower is better), same file as pack().

### Deep
Added (no change to `pack()`'s bytes, `unpack()`, the reader programs or anything in 1.1.0):

1. **`PcodecJS.pool({ size, laneMs })`.** A set of background workers that share a job out: `pool.pack([colA, colB, ...])` returns the files in the same order, `pool.pack(oneBigArray)` returns one file, `pool.unpack([files])` returns the arrays in order. Workers start the first time they are needed (they cost 7 to 12 ms to start) and a job is shared out only when each worker would get about 25 ms of work (`laneMs`; 0 always shares); `size` defaults to the cores the device reports less one, at most 4. Without Worker support it runs the jobs on the page one after another (checked in Node).
2. **One big column packed in pieces, same bytes.** The column is cut into the equal pages of at most 262,144 numbers Pcodec itself uses; each worker packs whole pages with the new `packPart`, and the pieces join into exactly the file `pack()` writes (checked for 7 columns of 5 number types in Node, and for the 2,000,000-number column in all four browsers). `{ smallest: true }` packs on one worker. A single Pcodec file has no index, so one file cannot be unpacked on several workers.
3. **New wasm export `compress_part`** in the packer program only: 335,642 B to 339,804 B (+4,162 B). The reader programs are unchanged (112,851 B and 157,590 B).

Time in ms, lower is better, median of 11 turns, versions take turns in the order:

| Job | 1 worker | Pool of 2 | Pool of 4 |
|---|---|---|---|
| Pack one 2,000,000-number column | 139 / 142 / 129 / 133 | 84 / 80 / 71 / 73 | 69 / 91 / 58 / 63 |
| Pack 12 columns (1.0M numbers; both pools use 2 workers) | 70 / 72 / 65 / 64 | 39 / 41 / 34 / 36 | 42 / 43 / 39 / 36 |
| Unpack 96 columns (8.2M numbers) | 119 / 115 / 107 / 116 | 116 / 80 / 68 / 80 | 103 / 51 / 50 / 50 |
| Unpack 12 columns (1.0M numbers; stays on one worker) | 16 / 13 / 14 / 15 | 17 / 16 / 14 / 14 | 16 / 17 / 13 / 16 |
| First job including worker start | 92 / 80 / 86 / 71 | 65 / 59 / 69 / 62 | 59 / 71 / 69 / 64 |

Longest page freeze during the single-column pack (ms): 1 worker 9.7 / 5 / 15 / 15, pool of 2 10.6 / 10 / 5 / 6, pool of 4 9.3 / 20 / 8 / 8 (Firefox with 4 workers on a 4-core machine is the one case above the 8 ms guide). Worker start time, 1.1.0 against 1.2.0 (ms): 12.3 / 7 / 7 / 7 against 12.5 / 7 / 6 / 6 (unchanged).

Tried and dropped for the packer (all four browsers, 12 columns, ms, lower is better; bytes identical in every case):
- **SIMD packer** (330,353 B): 57.7 / 64 / 67 / 61 against the current 58 / 65 / 68 / 62. A tie; it would need a second plain program.
- **Newer wasm features** (bulk memory, saturating float casts): 57.9 / 63 / 57 / 60 against 57.4 / 63 / 58 / 60. A tie, 188 B smaller.
- **opt-level 3 and `wasm-opt -O3`** (461,740 B, +126 KB): 57.4 / 61 / 57 / 58 against 57.4 / 63 / 58 / 60. A tie.
- **opt-level 3 with SIMD**: 53.3 (Chromium, first run) and 75 / 74 / 74 elsewhere: about 25% slower in three browsers.
A profile of packing (Node, diagnostic only) puts the time in the histogram sort (19%), the bin search (12%), trial encodes (12%) and the ANS encode (11%): no single loop to patch as with unpacking.

Sizes (raw / gzipped): pcodec-js.js 182,381 B / 72,752 B (was 176,051 / 70,799); pcodec-js-fast.js 242,069 / 91,105 (was 235,739 / 89,131); pcodec-js-pack.js 489,595 / 189,835 (was 475,887 / 187,088). Size ceilings are suspended by the project rules.

Checks: 909 pass for both readers (872 before; 37 new: pool of one array and of lists, levels, smallest, errors, ended pool, packPart pieces joining into pack()'s bytes). Speed is from the four browsers only; Node ran pass/fail checks and the profile.

Re-checked when applied to JS-modules (2026-10-22, same four browsers, 4 cores, page check `pool4.js`: one 2,000,000-number column packed, and 48 columns of 20,000 numbers unpacked, median of 7): the pool's file is byte for byte the file `pack()` writes and every unpacked column equals its source in all four browsers. Pack ms with 1 / 2 / 4 workers (lower is better): Chromium 178 / 96 / 60, Firefox 229 / 113 / 62, WebKitGTK 148 / 75 / 53, GNOME Web 141 / 69 / 76. Unpack of 48 small columns: no gain (14 to 30 ms either way), because small jobs stay on one worker by design. In this run Firefox with 4 workers was not slower than with 2 (the earlier watch item); single runs on this machine scatter by tens of percent. 909 of 909 checks pass for both readers.

## 1.1.0 · API 1 · 2026-10-18

### Quick
Big unpacks no longer freeze the page: unpackAsync() unpacks in 2 ms slices (frozen 47 to 156 ms for 2,000,000 numbers before, now 3 to 6 ms). New PcodecJS.worker() does unpack and pack in a background worker (a pack froze the page 169 to 207 ms, now 5 to 8 ms). The program compiles the moment the file runs, so load() is ready at once (the wait was 7 to 17 ms, now under 1 ms).

### Deep
Added (no change to the bytes written, to the wasm programs or to anything in 1.0.1):

1. **`unpackAsync(bytes, { sliceMs })`.** Unpacks in slices (default 2 ms) and gives the page a turn between slices. Longest time the page is frozen while unpacking 2,000,000 numbers (ms, lower is better): plain `unpack` 68 / 156 / 47 / 68; `unpackAsync` 2.9 / 4 / 5 / 6 (rule: under about 8). Total time rises (plain 67 / 156 / 48 / 67 ms; sliced 112 / 189 / 76 / 93 ms). Slice length chosen from a sweep of 1 to 6 ms: 3 ms and up reach 8 ms in WebKitGTK and GNOME Web.
2. **`PcodecJS.worker()`.** Runs info, unpack and pack in a background worker. Longest page freeze for a 2,000,000-number job (ms): unpack in worker 6.9 / 2 / 2 / 4; plain pack 169 / 207 / 181 / 180; worker pack with the array handed over (`{ transfer: true }`) 4.6 / 8 / 5 / 5; worker pack with the array copied in 16 / 16 / 25 / 25 (a 16 MB copy). Needs `worker-src blob:` in the page policy; if the browser or policy refuses, the same calls run on the page (checked in all four browsers with and without the policy word). Same numbers and same pack size as the plain calls (checked).
3. **Compile early.** The program starts compiling when the file runs (off the main thread). Wait at `load()` after 30 ms of other start-up work (ms, lower is better): before 7.3 / 15 / 17 / 12, now 0.2 / 0 / 0 / 0.5. A worker is handed the compiled program (no second compile) and its source no longer carries the program text (about 450 KB less for the pack file): `worker()` ready before 58.9 / 27.5 / 46 / 45.5 ms, now 32.8 / 10.5 / 22 / 24.5.
4. **Tried and dropped: storing the compiled program in the browser.** IndexedDB refused to keep it in all four browsers (3 of 3 launches each); Cache Storage with streaming compile saved at most 2.5 ms of a 4 to 7 ms compile (Firefox none). Replaced by compile early.

Sizes (raw / gzipped), larger by the new calls: pcodec-js.js 176,051 B / 70,799 B (was 168,183 / 68,390); pcodec-js-fast.js 235,739 / 89,131 (was 227,871 / 86,705); pcodec-js-pack.js 475,887 / 187,088 (was 468,019 / 184,685). Size ceilings are suspended by the project rules.

Checks: 872 round-trip, corrupt-input, warm-up, unpackAsync and worker-fallback checks pass for both readers (19 new); damaged-file result unchanged (591 refused, 9 decoded to different numbers, 0 crashes).

## 1.0.1 · API 1 · 2026-10-18

### Quick
No change to the code or to the files it writes. The build was rebuilt and checked again, and the credits and comparison were updated.

### Deep
No change to the code or to the bytes it writes (the three JavaScript files differ from 1.0.0 only in the version label). Checked and re-measured from scratch: the three WebAssembly programs were rebuilt from the Pcodec 1.0.4 source with our 12-line patch and came out byte for byte identical to the shipped ones (same SHA-256); the credits now list what Pcodec 1.0.4 changed; the comparison with numcodecs-wasm-pco was re-run in all four browsers (tables below and in RESULTS.md section 0b).

Re-run of the comparison with the only other JavaScript build, numcodecs-wasm-pco 0.4.0 (converted with jco 1.39), 12 columns, 15 repeats x 3 rounds, a fresh page for each contender, one browser at a time, 0 wrong columns in every browser. Order: Chromium / Firefox / WebKitGTK / GNOME Web. Compare within this table only; this machine ran faster than the one behind the 1.0.0 numbers, and four of the 12 columns were re-downloaded from public copies of the same datasets (the sizes came out the same: smallest mode 0.23% smaller than numcodecs, as before).

| Measure (12 columns) | numcodecs-wasm-pco | pcodec-js | Better | Result |
|---|---:|---:|---|---|
| Unpack, copy made (ms) | 12.43 / 11.67 / 10.33 / 10.33 | 12.17 / 8.67 / 8.33 / 10.33 | lower | tie (2%) / 26% faster / 19% faster / tie |
| Unpack, view, no copy (ms) | not offered | 7.93 / 7.67 / 7.00 / 7.00 | lower | 36% / 34% / 32% / 32% faster than numcodecs with a copy |
| Pack, plain `pack()` (ms) | 52.4 / 57 / 45 / 55 | 42.7 / 57 / 42 / 56 | lower | 19% faster / tie / 7% faster / tie |
| Pack, `smallest` (ms) | not offered | 142.9 / 182 / 183 / 148 | lower | slower by design (tries seven settings) |
| Start-up, reader (ms) | 8.3 / 29 / 19 / 27 | 2.7 / 6 / 2 / 3 | lower | 3 to 9 times lower |
| Packed size, 12 columns (bytes) | 1,692,078 | `pack()` 1,793,004; `smallest` 1,688,178 | smaller | `pack()` 6.0% bigger; `smallest` 0.23% smaller |
| Download (gzipped) | 324,006 B | reader 68,390 B | smaller | 4.7 times smaller |

Browsers other than Chromium round timers to whole milliseconds, so treat gaps under 5% as ties. Raw files: `bench/browser/run-release.js` (the runner, new in this release) writes one JSON per browser.

## 1.0.0 · API 1 · 2026-10-18

### Quick
First release as its own module: Pcodec, a number compressor, for web pages in one file with no build step. It needs WebAssembly.

### Deep
First release, as its own module: Pcodec, a number compressor, for web pages, one file, no build step. It follows an earlier add-on for the object compressor that was never published as its own file. WebAssembly is required, with no plain-JavaScript backup (the owner's decision).

What is new compared with that add-on (440,757 B, 159,050 B gzipped). Lower is better for sizes, times and memory.

- **Tuned unpack loop.** One patch to Pcodec 1.0.4 removes the per-number bounds checks in the loop that reads each number's extra bits (about 40% of unpack time). Unpack is lower by about 6% on average: reader, view, ns per number, Chromium / Firefox / WebKitGTK / GNOME Web, two runs: 12.66 to 12.13 and 12.56 to 12.88 (a tie, within noise) / 13.34 to 12.37 and 13.01 to 12.37 / 15.30 to 13.34 and 14.32 to 13.34 / 14.64 to 13.34 and 13.99 to 13.01. The SIMD reader gains 7% / 3% / 2% / 11%. Files are about 1% smaller. Output and written bytes are identical; packing speed is unchanged. Two other changes tried (delta decode in one pass, decimal join without a branch) gave no gain and were dropped. Details: `RESULTS.md` section 4c.
- **Unpack-only file.** 168,183 B (68,390 B gzipped) against 440,757 B (159,050 B gzipped): 2.6 times smaller raw, 2.3 times smaller gzipped. The wasm program went from 326,822 B to 112,851 B.
- **Packer file is built for speed, so it is a bit bigger.** 468,019 B (184,685 B gzipped): 6.8% larger raw, 16% gzipped.
- **Packing is faster.** 12 columns: 85 against 96.3 ms in Chromium (12% faster), 90 against 107 in Firefox (16%), 93 against 107 in WebKitGTK (13%), 88 against 105 in GNOME Web (16%). Same bytes out. The other JS Pcodec build takes 80.6 / 90 / 89 / 84 ms (it is 0% to 5% faster than ours).
- **Streaming unpack** (`stream()`): a 4,000,000-number file unpacks with 6.8 MB of wasm memory, against 67.9 MB for the old add-on (10 times less), and no 32 MB result array.
- **No-copy unpack** (`view`, `into`): the 12-column test takes 12.62 against 18.84 ns per number for a copy in Chromium (33% faster), 13.01 against 15.94 in Firefox (18%), 14.32 against 16.92 in WebKitGTK (15%) and GNOME Web (15%).
- **Copy unpack** is 6% faster in Chromium than the old add-on (18.84 against 19.98 ns), 18% in Firefox (15.94 against 19.52), 12% in WebKitGTK (16.92 against 19.20) and 9% in GNOME Web (16.92 against 18.55). Whole-millisecond timer rounding outside Chromium: treat gaps under 5% as ties.
- **Faster first unpack** (`load({ warm: true })`, new): first unpack of a 100,000-number column after `load()` plus 100 ms: Chromium 2.8 against 8.8 ms (68% less), WebKitGTK 7 against 15 ms (53% less), GNOME Web 5 against 13 ms (62% less), Firefox 5 against 5 ms (no change). Costs about 15 ms of background CPU and 4,968 B of built-in data per file; off unless asked.
- **SIMD file** (`pcodec-js-fast.js`): view unpack 10.74 against 13.01 ns in Firefox (17% faster); within 3% in the other three browsers (no real gain there).
- **Smallest mode** (`pack(x, {smallest:true})`, new): tries seven encoder settings on a 20,000-number sample (the whole array up to 40,000 numbers) and keeps the best. 39 columns: 2,778,048 B against 2,892,944 B (4.0% smaller; never larger than plain). Cost: 3.2 to 3.7 times the pack time (276 ms for 12 columns in Chromium). Files still open in any Pcodec reader (39 of 39 checked in the other JS build).
- **Level guidance:** `level: 6` is 0.43% bigger than the default 8 and packs 19% faster in Chromium, 12% in WebKitGTK and 17% in GNOME Web (no change in Firefox); noisy single set.
- **Eight number types** (u16, i16, u32, i32, f32, u64, i64, f64) instead of two (f64, i32).
- **`info()`** reads the type and count from a file without unpacking it.
- **Damaged files:** 600 damaged files tried: 591 refused with a clear error, 9 decoded to different numbers (Pcodec has no checksum), 0 crashes or hangs. A trapped instance is dropped and recreated on the next call.
- **Start-up** (load to ready, ms): 6.2 / 8 / 7 / 6 for the reader (old add-on 2.6 / 8 / 5 / 5, other JS build 9.2 / 22 / 20 / 20); 10.7 / 27 / 15 / 15 for the packer file.
- **Same bytes:** `pack()` writes the identical 39 files the old add-on wrote; the reader opens files from the old add-on and from the other JS build (Pcodec 1.0.2), 39 of 39 each way.
- **Reproducible build:** `sh wasm/vendor.sh` once (fetches Pcodec 1.0.4 and applies the patch), then `sh wasm/buildall.sh`; rebuilding from a different folder gives the same wasm file (identical SHA-256, reader c48b59fa...); `Cargo.lock` and `--locked` pinned.
- **Checks:** 854 round-trip, corrupt-input, warm-up and edge-case checks pass for both readers (NaN, -0, infinity, empty, one number, wrong count, count over the limit).
