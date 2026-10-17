# cartoon-3d-kit changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-17
Pop numbers (the +1 that floats up on a tap) now have their own color per skin, so they can be read on the light page: 10 of 10 skins are at 3:1 contrast or better, up from 2 of 10 (only Red and Crimson were); Yellow is the weakest at 3.03:1. In dark mode the pop keeps the glow color (every skin 3.0:1 or better). The demo's Violet glow now matches the guide (it showed light blue #7dd3fc, the guide says #9a7cf5). The guide gained a skin-table column for pop and a new section 3.10, Many characters on one screen, with measured numbers from one test browser (1 hero about 78 ms of browser work per second, 12 about 272, 48 about 644, animations off about 4) and what to pause or drop. The test grew from 38 to 82 checks: it now fails on a pop number under 3:1 on the light panel or demo sky or a glow under 3:1 on the dark panel, and on any difference between the demo's skin colors and the guide's table (0 differences now, 1 before).

Tested in: Chromium 155.0.8059.39-1, Firefox 158.0 and WebKitGTK 2.52.6, one at a time (2026-10-17): the demo page loads, skins switch, a tap makes its effects and cleans them up; in Chromium also the pop number's contrast as drawn, reduced motion and forced colors. Node: 82 checks. Not tested: GNOME Web (Epiphany) 46.5, a phone.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: Node checks; no real browser run recorded (its demo page loads in Firefox through `tests/firefox.js`: Firefox 158 per the 2026-10-15 note, Firefox 157 on 2026-10-17).

## Before version labels

- Early October 2026: First version: a written style guide and demo for the glossy "toy" look in plain CSS and SVG (no code to import).
- 2026-10-15: Added a README and a test; names and links of the source game were removed.
