# Proposal: save a document as a delta of its last full save (backlog B17)

Status: research proposal. Nothing here is implemented in `modules/lfc-pack`. It changes the format and the API, so it needs the owner's go-ahead.

## What it is
An app that autosaves (Netflow maps, Story Editor, Mind Mapper, Workbench snapshots) writes nearly the same file again and again. zstd can compress each new frame against the matching frame of an earlier save, the way `zstd --patch-from` works (`ZSTD_CCtx_refPrefix`, `ZSTD_DCtx_refPrefix`). The new file then holds only what changed. Nothing else in the file changes: the same blocks, columns and frames, just smaller frames.

## Measured (RESEARCH.md E12, E13)
2,000-node Netflow map, random edits (renames, weight changes, new nodes and links). The research zstd 1.5.7 wasm with the two prefix calls added (+1.3 KB) ran in Chromium 156, Firefox 158 and WebKitGTK 2.52.6.

| Edits since the full save | zstd bytes, full → delta | delta compress time / full | delta decompress time / full |
|---|---|---|---|
| 1 | 22,358 → 324 (1%) | 0.23 to 0.26 | 0.07 to 0.11 |
| 20 | 22,699 → 673 (3%) | 0.24 to 0.27 | 0.07 to 0.11 |
| 100 | 23,668 → 1,654 (7%) | 0.27 to 0.31 | 0.10 to 0.11 |
| 500 | 25,124 → 3,864 (15%) | 0.33 to 0.37 | 0.18 to 0.20 |

- zstd is about a tenth of a whole save on this map (5 to 6 ms), so the delta saves size, not time. It is never slower.
- Reading a delta first needs the base save's frames, which adds under 0.05 ms on this map.
- Compressing frame against frame (the same frame of the base) is smaller and faster than using the whole base as the prefix.

## Proposed design
- **API:** `pack(rows, { base: baseFileBytes })` and `packTables(obj, { base })`. To read: `unpack(file, { base })`. With no `base`, nothing changes.
- **Format:** a footer flag section (format minor 1) holds the base save's XXH64. A reader refuses a delta file unless it is handed a base with that hash, so the wrong base can never give wrong rows. Old readers refuse the file because of the unknown required flag.
- **Matching:** a frame uses the frame of the base in the same place (block, column, frame number) as its prefix, if the base has one of the same kind. Otherwise it is compressed without a prefix.
- **Full-save rule:** write a full save when the delta passes 25% of the last full save, and always on an explicit "Save as". On the measured map that is one full save every several hundred edits.
- **wasm:** two exported calls added to `wasm/zstd-glue.c` (the research diff is `experiments/b17-zstd-glue-prefix.diff`).

## Risks
- A delta is useless without its base. Apps must keep the base next to it (IndexedDB or the same folder) and never delete the base while a delta points to it. This is the main risk, and it belongs to each app.
- Format change: the Python and Go readers need the prefix calls too (both use the zstd library, which has them).
- Netflow's map file format is public. A delta should be an autosave and history format only. A saved or exported file stays a full file.

## Decision asked
Send to the code thread to prototype behind the `base` option, with the 3-browser gates (size, save and read time, and the 500-edit case). Then pick one app (Netflow autosave) for a trial.
