# cartoon-3d-kit

**Version 1.3.0 · API 1**

**Tested in:** ungoogled Chromium 155.0.8059.39-1, Firefox 158.0 and WebKitGTK 2.52.6 (crowd-check.js incl. the new pause check: out-of-view heroes paused, in-view playing); 105 Node checks. Cost numbers: Chromium 155 only.

A written style guide plus a working demo for the soft, glossy "toy" look in plain CSS and SVG: flat vector shapes that feel like squishy 3D. There is no code library to import. The value is in the numbers, copied from a published single-file game: where the light comes from, the four gradients, the face proportions, the shadow and glow recipes, the squash-and-stretch timings and the calm background scenery.

You copy the color tokens and gradient definitions into your page, draw your own silhouette in a 200 x 200 box, fill it with the body gradient, add the shade, rim and highlight layers, then place the face from the face table. A small check reads the skin tables as text and tests that every label color is readable.

## Why it exists

The soft, glossy toy look depends on many small numbers that have to agree: the light direction, four gradients, face proportions, shadows and animation timings. This kit keeps one set of numbers, taken from working code, so a new character or screen can match the look.

## Use

1. Open [`demo.html`](demo.html) and tap the character. View source: one file, no dependencies.
2. Copy the tokens block (guide section 2) into your `:root`, and the `<defs>` block (section 3.3) into an SVG that stays rendered.
3. Draw your own silhouette in a 200 x 200 box, fill it with `url(#gBody)`, add the clipped shade and rim group and the two highlights (section 3.4), then the face (section 3.6).
4. Re-skin by setting `--sk-hi`, `--sk-mid`, `--sk-lo`, `--sk-glow` and `--sk-label` on a wrapper.

```css
.wrap { --sk-hi:#fff3b0; --sk-mid:#f2b705; --sk-lo:#a86a00; --sk-glow:#ffd23f; --sk-label:#2a120d; }   /* gold: dark label */
```

Files: [`STYLE-GUIDE.md`](STYLE-GUIDE.md) (the full guide, 11 sections, every number from working code); [`demo.html`](demo.html) (a logo lockup, a character on a scene you can tap with squash, pop number, confetti, ring and eyes that follow the pointer, and four re-skin buttons); [`crowd-demo.html`](crowd-demo.html) (the optional baked-crowd path from section 3.11: 1, 12 or 48 heroes as live page copies or baked once onto a canvas). Open the pages by double-click.

Check (offline, no browser, under a second): `node modules/cartoon-3d-kit/test/run.js`. It reads the skin tables as text and tests that every label color has at least 4.5:1 contrast on its `mid`; it does not prove how anything looks.

## What to copy

| Piece | Guide section | What you take |
|---|---|---|
| Tokens | 2 | Light-mode palette as CSS variables (and the dark set), warm ink `#2a120d` instead of black, the two typefaces. |
| The four gradients | 3.3 | `gBody` (focus 36% / 30%, radius 82%), `gShade` (lower right), `gShine` (tall highlight), `gRim` (right-edge bounce light). |
| The face table | 3.6 | Cheeks, eye whites, pupils, catch-lights, smile: positions and sizes in a 200 x 200 box, plus the proportion rules. |
| Skin ramps | 3.5 | `hi / mid / lo / glow / label` per color; all labels pass 4.5:1 contrast. |
| Motion | 5 | Squash 1.09/.88 then .96/1.07 in 300 ms, pop number keyframes, confetti shapes, calm mode. |
| Logo lockup | 4 | Sticker lettering (cream ring of zero-blur shadows) and the chunky three-layer pill. |

Related: [`sticker-text`](../sticker-text/README.md) is the lettering trick from section 4.2 as a small JS + CSS module. [`sprite-baker`](../sprite-baker/README.md) is for canvas games; use the same `hi / mid / lo` ramp from section 3.5 as its `SB.material` stops so SVG and canvas characters match. This kit has no canvas code of its own.

## How it compares

cartoon-3d-kit is a written guide with numbers, not code, so it is the missing recipe next to the libraries below, not a rival. It is the only one in this list that writes down a full character look (light, gradients, face, motion, scenery). Speed against the alternatives: not measured.

| Alternative | Size (smaller is better) | Speed | Where it wins / loses |
|---|---|---|---|
| Claymorphism snippets and articles | A few lines of CSS each | Not measured | Win on being quick for cards and buttons (one panel recipe: radius, one outer and two inset shadows). This guide wins for characters (face rules, gradients, motion, scenery, contrast table) |
| SVG lighting filters (`feSpecularLighting`, `feDiffuseLighting`), built in | Nothing to ship | Not measured | Win on realism. The gradients here win on being light and re-coloring through five variables |
| [Zdog](https://zzz.dog/) (MIT, version: not read) | Not measured. This kit: guide 50,520 bytes of text, demo page 20,652 bytes, crowd page 13,339 bytes | Not measured | Wins if you want a 3D scene (flat pseudo-3D engine, canvas or SVG). This kit wins for a look on ordinary 2D shapes |
| Animate.css and Motion (MIT, versions: not read) | Not measured | Not measured | Win on ready-made movement. The squash and pop timings here work with either |

The kit's own measurements (ungoogled Chromium 155.0.8059.39-1, headless, median of three 5-second runs, browser work per second; lower is better): 12 heroes cost 191 ms as live page copies, 182 ms baked at 60 per second and 117 ms baked at 30 per second; 48 heroes cost 346, 357 and 227 ms. Firefox, WebKitGTK and GNOME Web timings: not measured.

**Where it loses:** it is a guide, not a library (you draw your own character and copy the CSS; nothing is installable); fewer ready-made pieces (no scene graph, no animation engine, no components); timings exist for one browser (Chromium 155) only; phones: not measured. No open project turned up that packages a glossy toy character in plain CSS and SVG with numbers; the value is the written, used-in-a-game numbers, not a new technique.

## What it is not

- Not installable: no code to import.
- Targets current Chrome, Firefox and Android Chrome. `color-mix()` needs Chrome 111 / Firefox 113 (the guide shows a fallback line). `forced-color-adjust` is not supported in Safari. `background-clip: text` for the logo needs a current browser.
- The sticker lettering uses 32 text shadows per word: fine for a few titles, not for paragraphs.
- The demo ships light only (`color-scheme: only light`); the guide lists dark tokens, but the demo does not switch to them.
- Accessibility is system-driven: reduced motion turns off squash, pop, confetti, ring and eye glide, and forced colors keeps the character's colors. Keyboard taps start effects from the button's center. The Windows forced-colors block and the Firefox keyboard-click behavior were written from the specs and not checked on real screens.
- No game art, characters, brand names or fonts are included; the demo uses a generic round character. The two typefaces named in the guide are not bundled.

## For AI agents

- Keep the numbers: gradient focus (36% / 30%), face positions, the 300 ms squash and the unequal idle loops (3.2, 3.4, 4.6, 9 s). Change one only when asked, and look at the result at 24 px, 120 px and 300 px.
- One light source, upper left, on every object. Dark lines are warm ink `#2a120d`, never `#000`.
- Do not add art, characters, names or text from the source game; use a generic character and say so.
- Every skin needs a `label` color with at least 4.5:1 contrast on its `mid`; light skins (yellow, gold, ice, coral, pearl) get a dark label. Run the check after you add or change one.
- Honor `prefers-reduced-motion` in script as well as CSS (`element.animate()` is not stopped by `* { animation: none }`). Keep the `forced-colors` block when you copy the logo.
- Wrap the sticker title in a heading with an `aria-label`; mark decorative SVG `aria-hidden="true"`. Put a plain declaration before any `color-mix()` line.
- Keep the header `Copyright (c) 2026 LFC Foundry. MIT License` on every file you copy.

## Prior art and credits

- Every number in the guide was copied from a published single-file game made by LFC Foundry; its artwork, names and text are not included.
- Two typefaces are named in the guide (Bricolage Grotesque and Figtree, both under the SIL Open Font License). They are not bundled; the demo falls back to `system-ui`.
- The contrast rule (4.5:1 for normal text) is WCAG AA from the W3C. Rule only, no code.
- Squash and stretch is the classic animation principle; the timings here are measured from the game. Idea only.
- Zdog, Animate.css, Motion and the claymorphism write-ups are named for comparison only. No code from them is in this kit.

No code from others; the ideas above are theirs.

## Full research notes

The long version of this page (longer write-ups of each alternative and the full list of limits) is kept in the project's private knowledge base.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
