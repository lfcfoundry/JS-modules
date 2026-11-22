# real-corpus

**Version:** tool, not versioned yet · **Tested in:** ungoogled Chromium 156.0.8078.79, Firefox 158.0, WebKitGTK 2.52.6 (2026.11.22)

## What it is and how it works

A small benchmark kit that times our modules against their rivals on real files instead of generated data. `setup.sh` cuts fixed slices from the real uploads (retail, SEC, SBA), builds real graphs and flows from their columns, and copies the module files and rival libraries next to a test page. `run.js` (Chromium and Firefox through puppeteer-core) and `run-webkit.js` (WebKitGTK through WebDriver) open the page in a fresh browser tab per test and print one line of JSON with the medians.

## Why it exists

On 2026-11-22 elias-fano won on generated lists and lost on size against real lists (88% of real lists are short). An audit then found three more published wins that fell on real files (text-columns vs Papa Parse, netflow-sankey vs d3-sankey, netflow-layers vs dagre). The rule is now: a win is a hypothesis until it also ran on real data in the three test browsers. A whole three-browser run takes about 35 seconds.

## Use

```sh
sh tools/real-corpus/setup.sh                       # builds /tmp/real-corpus (npm install of the rivals into /tmp/pp)
BROWSERS=/home/claude/browsers node tools/real-corpus/run.js chromium csv comp mem graph layers sankey sankeyq zip
BROWSERS=/home/claude/browsers node tools/real-corpus/run.js firefox csv comp mem graph layers sankey sankeyq zip
xvfb-run -a env GTK_A11Y=none WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 dbus-run-session node tools/real-corpus/run-webkit.js csv comp mem graph layers sankey sankeyq zip
node tools/real-corpus/crossings-layers.js          # exact crossing counts, same in every browser
node tools/real-corpus/crossings-sankey.js
```

`manifest.json` lists each real file, where it lives and how it is sliced. The uploads are for testing only, never for tuning, and are not stored in this repository. Add a new test as one more entry in `tests` inside `page.html`, one more line in the manifest, and one more row in the table of claims in the audit report.

## Rules for a published win

1. A headline win (module page, scoreboard, landing page, llms.txt) needs a run on a real file of the kind the module serves (tables, text, number lists, graphs, records), in the three test browsers.
2. If real and generated data disagree by more than 25%, print the real figure and label the generated one "generated".
3. Print the shape of the generated data next to the shape of the real data (list lengths, column count and text share, degree spread).
4. Always report the small end (lists under 64 values, tables under 1,000 rows, graphs under 1,000 items).

## Limits

- Slices are the first 8 MB of each file, so ordering effects apply. SEC's slice is one batch of filings; SBA's has only 3,206 wide rows.
- Rivals are the npm latest at run time, not always the version a README names.
- Firefox and WebKitGTK clocks are coarse (whole milliseconds on small cells); differences under 10% are noise.
- Repeat runs of one browser moved a ratio by up to 30% (retail in Chromium: 1.19 and 1.58 on two runs); read the ranges, not single cells.
- Not covered yet: pcodec-js, save-kit, gif-writer, lzma-decode, netflow-hierarchy, netflow-engine (see the audit report).

Audit report and raw results: project folder `js-modules-research/audit-synthetic-claims-2026.11.22`.
