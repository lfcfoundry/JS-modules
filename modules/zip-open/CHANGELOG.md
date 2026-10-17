# zip-open changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-17
New module, cut from Net Flow Map's file opener. It opens .zip and Excel .xlsx files in the browser or in Node, with no libraries: text files come out as text, every sheet comes out as a CSV table, and every problem is a plain-words note. Every limit is counted on the bytes that really come out, not on the sizes the zip claims. Measured in Node on a zip of 1 GB of zeros (0.97 MB on disk) whose header says 1,000 bytes: this module refuses it in about 0.05 s using about 47 MB, while fflate 0.8.3 took 3.8 s and returned a 1,000-byte file with no error. New compared with the Net Flow Map original: `read(bytes, entry, limit)` for files that are not text, and a `textExt` option to choose which file endings count as text (before, the list was fixed). The Excel reader is bundled inside, so there is nothing else to include. 14 checks, about 2.6 s.

Tested in: Node checks; the demo page in Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6, one at a time (`tests/flow-demos.js`, 2026-10-17; WebKitGTK 2.52.6 through `tools/webkit-driver`). Not run: GNOME Web (Epiphany) 46.5, a phone.
