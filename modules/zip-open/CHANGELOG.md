# zip-open changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17
The checksum check on every unpacked file is about 3.9 times faster: 2.97 to 0.76 ms per MB in Node 22.22, 2.89 to 0.74 in ungoogled Chromium 155 (3.9 times), 3.25 to 0.85 in Firefox 158 (3.8 times), 2.7 to 0.7 in WebKitGTK 2.52.6 and in GNOME Web 46.5 (3.9 times), measured on 20 MB (best of 3). At the 400 MB size limit that is about 1.2 s down to 0.3 s. It uses the 'slicing by 8' method (eight table lookups per eight bytes, reading whole words when the bytes sit on a 4-byte boundary). The answers are exactly the same: 814 checksums (every length 0 to 89 at every start position 0 to 8, 1 MB and 20 MB buffers, the standard test value) gave 0 different from a plain CRC, in Node and in all four browsers. The file grows by about 1.3 KB (26,143 to 27,468 bytes). Nothing else in the module changed.

Tested in: Node 22.22.0 module test (15 checks passed) and tests/zip-open-crc-browser.js, one browser at a time: ungoogled Chromium 155.0.8059.39-1, Firefox 158.0 (reports 158.0b5), WebKitGTK 2.52.6 and GNOME Web (Epiphany) 46.5, each giving the same 814 checksums as a plain bit-by-bit CRC (0 different). Not run: a phone.

## 1.0.0 · API 1 · 2026-10-17
New module, cut from Net Flow Map's file opener. It opens .zip and Excel .xlsx files in the browser or in Node, with no libraries: text files come out as text, every sheet comes out as a CSV table, and every problem is a plain-words note. Every limit is counted on the bytes that really come out, not on the sizes the zip claims. Measured in Node on a zip of 1 GB of zeros (0.97 MB on disk) whose header says 1,000 bytes: this module refuses it in about 0.05 s using about 47 MB, while fflate 0.8.3 took 3.8 s and returned a 1,000-byte file with no error. New compared with the Net Flow Map original: `read(bytes, entry, limit)` for files that are not text, and a `textExt` option to choose which file endings count as text (before, the list was fixed). The Excel reader is bundled inside, so there is nothing else to include. 14 checks, about 2.6 s.

Tested in: Node checks; the demo page in Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6, one at a time (`tests/flow-demos.js`, 2026-10-17; WebKitGTK 2.52.6 through `tools/webkit-driver`). Not run: GNOME Web (Epiphany) 46.5, a phone.
