# cartoon-3d-kit

**Version 1.2.0 · API 1**

**Tested in:** Chromium 155.0.8059.39-1, Firefox 158.0, WebKitGTK 2.52.6 and GNOME Web (Epiphany) 46.5, one at a time (2026-10-17): the new crowd page (crowd-check.js: heroes painted and moving in baked mode, 12 and 48 live heroes, no page errors), and the earlier demo page in the first three. Node: 105 checks. Timing in Chromium 155 only. Not tested: a phone.

Run the check (offline, no browser, under a second): `node modules/cartoon-3d-kit/test/run.js`

## What it is

A written style guide plus a working demo for the soft, glossy "toy" look in plain CSS and SVG: flat vector shapes that feel like squishy 3D. There is no code library to import. The value is in the numbers, copied from a published single-file game: where the light comes from, the four gradients, the face proportions, the shadow and glow recipes, the squash-and-stretch timings and the calm background scenery.

- [`STYLE-GUIDE.md`](STYLE-GUIDE.md): the full guide, 11 sections, every number from working code.
- [`demo.html`](demo.html): a logo lockup, a character on a scene you can tap (squash, pop number, confetti, ring, eyes that follow the pointer) and four re-skin buttons. Open it by double-click.
- [`crowd-demo.html`](crowd-demo.html): the optional baked-crowd path from guide section 3.11: 1, 12 or 48 heroes drawn either as live page copies or baked once onto a canvas, with the bob, aura, blink and wiggle in both. Open it by double-click.

## What to copy

| Piece | Where in the guide | What you take |
|---|---|---|
| Tokens | section 2 | Light-mode palette as CSS variables (and the dark set), warm ink `#2a120d` instead of black, the two typefaces. |
| The four gradients | section 3.3 | `gBody` (focus 36% / 30%, radius 82%), `gShade` (lower right), `gShine` (tall highlight), `gRim` (right-edge bounce light). |
| The face table | section 3.6 | Cheeks, eye whites, pupils, catch-lights, smile: positions and sizes in a 200 x 200 box, plus the proportion rules. |
| Skin ramps | section 3.5 | `hi / mid / lo / glow / label` per color, with a table whose labels all pass 4.5:1 contrast. |
| Motion | section 5 | Squash 1.09/.88 then .96/1.07 in 300 ms, pop number keyframes, confetti shapes, calm mode. |
| Logo lockup | section 4 | Sticker lettering (cream ring of zero-blur shadows) and the chunky three-layer pill. |

## Quick start

1. Open `demo.html` and tap the character. View source: it is one file, no dependencies.
2. Copy the tokens block (section 2) into your `:root`, and the `<defs>` block (section 3.3) into an SVG that stays rendered.
3. Draw your own silhouette in a 200 x 200 box, fill it with `url(#gBody)`, add the clipped shade and rim group and the two highlights (section 3.4), then the face (section 3.6).
4. Re-skin by setting `--sk-hi`, `--sk-mid`, `--sk-lo`, `--sk-glow` and `--sk-label` on a wrapper. Check the label contrast (the test below does it for your list).

```css
.wrap { --sk-hi:#fff3b0; --sk-mid:#f2b705; --sk-lo:#a86a00; --sk-glow:#ffd23f; --sk-label:#2a120d; }   /* gold: dark label */
```

## Related modules

- [`sticker-text`](../sticker-text/README.md): the lettering trick from section 4.2 as a small JS + CSS module. Use it for the title; this guide explains where the look comes from.
- [`sprite-baker`](../sprite-baker/README.md): for canvas games. It bakes shaded shapes into sprites on the CPU. Use the same `hi / mid / lo` ramp from section 3.5 as its `SB.material` stops so SVG and canvas characters match. This kit has no canvas code of its own.

## How it differs from open source

- **Claymorphism write-ups** (many articles and snippet collections): one panel recipe, one background, one radius, one outer and two inset shadows. Good for cards and buttons. They do not describe a character: no face rules, no gradient numbers, no motion, no scenery, and usually no dark mode or contrast advice.
- **SVG lighting filters** (`feSpecularLighting`, `feDiffuseLighting`): widely supported since 2015 and physically flavored, but they give no art direction and are heavier to re-skin. The gradient method here is lighter and re-colors by changing five variables.
- **Zdog** draws flat-shaded pseudo-3D with its own scene graph and canvas or SVG rendering. It is a 3D engine; this guide is a look for ordinary 2D shapes.
- **Animate.css** and **Motion** (both MIT) are collections of animations. They cover movement, not the look. The squash and pop timings here are written down so you can use them with either.
- I found no open project that packages a "glossy toy character in plain CSS and SVG, with numbers". The honest value here is the written, used-in-a-game numbers, not a new technique. Everything in the guide is ordinary CSS and SVG.

## Limits

- It is a guide, not a library: you draw your own character and copy the CSS. Nothing here is installable.
- Targets current Chrome, Firefox and Android Chrome. `color-mix()` needs Chrome 111 / Firefox 113 (the guide shows a fallback line). `forced-color-adjust` is not supported in Safari. `background-clip: text` for the logo needs a current browser.
- The sticker lettering uses 32 text shadows per word: fine for a few titles, not for paragraphs.
- The demo ships light only (`color-scheme: only light`). The guide lists dark tokens, but the demo does not switch to them.
- Accessibility pieces are system-driven: reduced motion turns off squash, pop, confetti, ring and eye glide, and forced colors keeps the character's colors. The default look is unchanged. Keyboard taps start effects from the button's center.
- The Windows forced-colors block and the Firefox keyboard-click behavior were written from the specs; they have not been checked on real screens.
- The check (`test/run.js`) reads the skin tables as text and does not open a browser, so it does not prove how anything looks.
- No game art, characters, brand names or fonts are included; the demo uses a generic round character. The two typefaces named in the guide are not bundled.

## For AI agents

- Keep the numbers. The gradient focus (36% / 30%), the face positions, the 300 ms squash and the unequal idle loops (3.2, 3.4, 4.6, 9 s) are what make the look. Change a number only when the user asks, and look at the result at 24 px, 120 px and 300 px.
- One light source, upper left, on every object. Dark lines are warm ink `#2a120d`, never `#000`.
- Do not add art, characters, names or text from the source game. Use a generic character and say so.
- Every skin needs a `label` color with at least 4.5:1 contrast on its `mid`. Light skins (yellow, gold, ice, coral, pearl) get a dark label. Run `node modules/cartoon-3d-kit/test/run.js` after you add or change one.
- Honor `prefers-reduced-motion` in script as well as CSS: `element.animate()` and transitions are not stopped by `* { animation: none }`. Keep the `forced-colors` block when you copy the logo.
- Wrap the sticker title in a heading with an `aria-label`, and mark decorative SVG `aria-hidden="true"`.
- Put a plain declaration before any line that uses `color-mix()`.
- Keep the header `Copyright (c) 2026 LFC Foundry. MIT License` on every file you copy.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
