# B29: column-by-column row scatter for saves (E33), PARKED

Research, 2026.11.13 5:00 to 5:10 PM Detroit time. Base: B25 + B26 + B28e (`v-b28e.js`). Nothing was pushed to `modules/`.

## Idea

The B21a scatter walks each row with `for...in` and drops each value into its column. B29 instead does this:

- It checks that every row has the same keys as row 0: it counts the keys per row, and a missing key shows up as `undefined`.
- It then fills columns one key at a time in blocks of 1,024 rows, so each property read sees one key.
- Any odd row (a different key count, a missing key, an undefined value, or an inherited key) returns null, and the B21a loop runs as before. B29 doesn't run in exact mode or under 64 rows.

## Same bytes

- 0 differences: all data files in 3 modes (`same21.cjs`), the bail cases, packRowsParallel (`same28.cjs`), and 20 edge cases (`b29chk.cjs`: swapped key, reordered keys, undefined, extra key, missing key, inherited key, string after numbers, leading nulls, small table, each in rows and exact mode).
- `node test/run.js`: all checks pass.

## Speed

**Scatter alone** (`sc.html`, 300k taxi rows in one block): 0.78 in Chromium, 0.82 in Firefox, 0.85 in WebKitGTK.

**Whole packRows save, B29 vs B28e** (fresh page per run, alternating order; Chromium 5 rounds, Firefox and WebKitGTK 4):

| Data | Save | C / F / W | Weighted |
|---|---|---|---|
| Taxi 300k | first | 0.82 / 0.90 / 0.89 | 0.85 |
| | repeat | 0.99 / 0.90 / 1.04 | 0.99 |
| Sensors 100k | first | 0.95 / 0.97 / 0.96 | 0.96 |
| | repeat | **1.12** / 0.97 / **1.08** | **1.09** |
| Logs 100k | first | 0.88 / 1.00 / 1.10 | 0.95 |
| | repeat | 0.99 / 1.00 / 0.99 | 0.99 |

- Inside the writer, taxi is split into 9 blocks of about 33k rows. There the scatter goes from about 16 to 14 ms per block once warm (Chromium, `sv2t.html`). That's much less than the one-block screen.
- Sensors (7 keys) is slower once warm, because the key-count pass costs more than the reads save when a row has only a few keys.
- First saves gain because the old `for...in` loop starts cold.

## Verdict

**Parked.** Sensors repeat saves come in at 1.09 weighted, which fails the 5% slowdown rule, and taxi repeat saves don't gain (0.99).

Retry ideas:
- Use B29 only on a call's first block (that's where the cold gain is).
- Use B29 only when rows have 12 or more keys.
- Find a cheaper exact shape check than counting keys per row.

Catalog: B29 column-by-column scatter (E33), first saves 0.85 but sensors repeat 1.09 weighted, RESULTS-B29-column-scatter-2026.11.13.md, parked.
