# netflow-layers changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-17
New module, cut from Netflow Map's layered engine (the code that draws Flow, Top-down, Spine, Lanes, Arc and Matrix). With every option off it draws exactly what the app drew before (8 pinned pictures made by the app's own engine). New options, all off by default: story order (on a 5,002-page story the links drawn as back or sideways drop from 1,027 to 97, the real loops), tags for very long links (stand-in stops 33,087 to 11 and build time 392 to 60 ms on that story, 6.5 times faster; a 20,000-page story the plain drawing refuses draws in about 0.4 s), a column for the must-pass pages (width 5,816 to 1,913 px), six more untangling rounds (never worse; 27% fewer crossings on that story), tall maps cut into columns (38 times taller than wide down to 0.8), step positions for a ruler, one band per group, plus a plain SVG drawer. Input is never changed.

Tested in: Node 22 checks (13, about 0.4 s); the demo check passes in ungoogled Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web (Epiphany) 46.5, one at a time, same numbers in each (gold links 5 to 2, stand-in stops 1,456 to 205, 7 columns; tests/flow-demos.js, 2026-10-17; 7 to 19 s per browser including start-up); not run: Netflow Map itself with the module swapped in
