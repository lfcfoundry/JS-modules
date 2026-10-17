# The 3D / cartoon visual style, and how to recreate it

*Extracted Oct 2026 from a published game: every number below is copied from working code. The game's own artwork is not included; this guide and `demo.html` use a generic round character ("Bloop") so you can recreate the style with your own character. Copyright (c) 2026 LFC Foundry, MIT License.*

---

## 0. The look in one paragraph

The style is **flat vector shapes made to feel like soft 3D toys.** Nothing is a 3D model and nothing is a bitmap. Every object is an SVG shape with **one radial gradient lit from the upper left**, a **soft shadow pooled at the lower right**, a **small white specular highlight**, and a **thin rim of bounced light on the right edge**. Characters have **huge glossy eyes, blush cheeks and a tiny smile placed low on the body**. Outlines are **warm dark brown, never black**. Logo text is **cream-outlined sticker lettering with a hard drop edge**. Scenery is **calm, desaturated, layered flat color** so the glossy character always pops. Everything **squashes, stretches, bobs and overshoots** when touched. That combination (gloss + low-set cute face + squash and stretch + calm background) is the charm.

The five-word version: **glossy, round, lit, squishy, calm background.**

---

## 1. Principles (the "why" behind every number later)

| # | Principle | How the style does it |
|---|---|---|
| 1 | **One light source, everywhere.** | Light always comes from the upper left. Highlights sit upper left, shade sits lower right, rim light on the right. Logo, hero, special collectibles, bubbles and icons all obey it. Mixing light directions is the fastest way to lose the look. |
| 2 | **Gradients do the 3D, not outlines.** | The body is filled with a *radial* gradient whose focus (36% / 30%) is off-center toward the light. No black outline on the hero. |
| 3 | **Three-tone ramps from one hue.** | Each color is `hi / mid / lo`. `lo` is a deeper, slightly more saturated version (not gray, not black). The ramp is a CSS variable set, so one change re-skins everything. |
| 4 | **Warm ink.** | Every dark line (eyes, mouth, face rim, logo outline shadow) is a dark brown like `#2a120d`, never `#000`. It feels hand-drawn and friendly. |
| 5 | **Cute face rules.** | Eyes are big (a quarter of the body wide in total), spaced wide, set slightly *below* center, with a white sclera, a big dark pupil and a white catch-light. Blush cheeks sit lower and wider than the eyes. The smile is small. |
| 6 | **Imperfection.** | The hero has one asymmetry (a dimple, a lean, a curl). The logo text is tilted −2°. The leaf is asymmetrical. Perfect symmetry reads as clip art. |
| 7 | **Calm stage, loud hero.** | Scenes use pale, low-contrast fills. The hero is the only high-saturation, high-contrast thing, plus effects that only appear on interaction. |
| 8 | **Squash and stretch on every touch.** | Pressing the hero flattens it, then overshoots tall, then settles (300 ms). Numbers pop with overshoot. Confetti has gravity. Nothing just appears. |
| 9 | **Life when idle.** | Slow bob, breathing glow, blinking, a rare wiggle, clouds, birds, butterflies, chimney smoke. The world never freezes, but nothing competes with the hero. |
| 10 | **Everything is a variable.** | Colors, skins, day/night all swap by changing CSS custom properties. SVG gradients read them with `style="stop-color:var(--x)"`. |

---

## 2. Fonts and tokens

### Typefaces
- **Display: Bricolage Grotesque, weight 800.** Chunky, a little quirky, friendly. Used for the logo, counters, numbers that pop, buttons, headings.
- **Body: Figtree, weights 400, 600, 700.** Clean, round, readable on phones.
- Both are packed into the file as base64 subset fonts so the game works offline. Fallback is `system-ui`.
- Small caps-style labels: `font: 700 .8rem body; letter-spacing: .12em; text-transform: uppercase; color: muted`.

### Light-mode tokens (the whole palette in use)
```css
:root {
  --bg:#edf1f2;  --panel:#fbfcfc;  --fg:#162226;  --muted:#55656b;  --line:#d0dadd;
  --character:#c4372c;  --character-deep:#86231b;  --character-hi:#e6685b;  --on-character:#fff;
  --leaf:#3f7d4c;   --leaf-text:#2b6238;  --stem:#5b3f27;
  /* scene colors: pale, desaturated, cool far-to-warm near */
  --sky-top:#b5d6e8;  --sky-bot:#eef5f1;
  --hill-far:#b3cdc0; --hill-mid:#90b9a1; --ground:#6aa282;
  --bld:#ece6d9; --bld-2:#c6bba9; --roof:#a8473a; --win:#ffd98a;
  --trunk:#6b4a2f; --foliage:#3f7d4c; --foliage-2:#5ca06a; --water:#5fa8d3; --metal:#7f8e9a;
  --display:'Bricolage Grotesque', system-ui, sans-serif;
  --body:'Figtree', system-ui, sans-serif;
  color-scheme: only light;   /* stops phone "force dark" from repainting the white shines dark */
}
```

### Dark-mode tokens (same names, new values: the day/night switch)
```css
--bg:#12181b; --panel:#1a2226; --fg:#e8eef0; --muted:#94a5ab; --line:#2c383d;
--character:#e2564a; --character-deep:#9c2f26; --character-hi:#f08a7e; --on-character:#1c0a08;
--leaf:#6cb27b; --stem:#9a7a58;
--sky-top:#0c1820; --sky-bot:#1b3643; --hill-far:#1a3838; --hill-mid:#1b4639; --ground:#1d503e;
--bld:#56616b; --bld-2:#3d4851; --roof:#b4574a; --trunk:#8a6a48; --foliage:#3d7a52; --foliage-2:#55a06b; --water:#2f6f93; --metal:#6b7b88;
```
Note what changes in dark mode: the hero gets *lighter and warmer* (so it glows against the dark), the world gets *darker and bluer-green*. Windows (`--win:#ffd98a`) stay the same, so they read as lit.

**Rule:** the hero's saturation goes *up* at night while the world's goes *down*.

---

## 3. The hero character (the hero)

### 3.1 Construction order (bottom to top, all in one `viewBox="0 0 200 200"`)

1. **Soft ground shadow** (outside the SVG, a blurred ellipse).
2. **Aura**: a radial glow behind the body in the skin's glow color.
3. **Body**: one path, filled with the main radial gradient.
4. **Clipped shading group**: lower-right shade + right-edge rim light (both clipped to the body shape so they never spill).
5. **Specular highlight**: a tall soft white ellipse upper left, plus a small crisp white dot.
6. **Face**: cheeks, eyes, pupils, catch-lights, mouth.
7. **Accessory parts** with flat color (stem, leaf).

### 3.2 The body path
```
M100 50c40 0 70 30 70 72 0 30-26 54-70 54s-70-24-70-54c0-42 30-72 70-72Z
```
Why it works: a wide, soft, slightly bottom-heavy blob with a flatter base, so it looks like it sits on the ground. The body spans roughly x 30 to 170 and y 50 to 176 of the 200 box. Leave room above for an accent part and below for the shadow. (The original game uses a character silhouette with two top lobes and a dimple at top and bottom; any rounded silhouette with one asymmetry works the same way.)

### 3.3 The gradients (copy these exactly)
```html
<defs>
  <!-- the 3D: focus is upper-left of center, so the "light" is there -->
  <radialGradient id="gBody" cx="36%" cy="30%" r="82%">
    <stop offset="0"  style="stop-color:var(--sk-hi)"/>
    <stop offset=".5" style="stop-color:var(--sk-mid)"/>
    <stop offset="1"  style="stop-color:var(--sk-lo)"/>
  </radialGradient>
  <!-- shade pooled low and to the right (black at 40%, fading to nothing) -->
  <radialGradient id="gShade" cx="72%" cy="88%" r="62%">
    <stop offset="0" stop-opacity=".4"/><stop offset="1" stop-opacity="0"/>
  </radialGradient>
  <!-- tall highlight: white fading downward -->
  <linearGradient id="gShine" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <!-- rim light on the right edge: bounced light from the scene -->
  <radialGradient id="gRim" cx="70%" cy="50%" r="60%">
    <stop offset="0" stop-color="#fff" stop-opacity=".4"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </radialGradient>
  <clipPath id="bodyClip"><path d="(the same body path)"/></clipPath>
</defs>
```

### 3.4 The body, shading and highlights
```html
<path d="(body path)" fill="url(#gBody)"/>
<g clip-path="url(#bodyClip)">
  <rect width="200" height="200" fill="url(#gShade)"/>
  <ellipse cx="158" cy="122" rx="14" ry="44" transform="rotate(-14 158 122)" fill="url(#gRim)"/>
</g>
<ellipse cx="62" cy="92" rx="12" ry="27" transform="rotate(16 62 92)" fill="url(#gShine)" opacity=".7"/>  <!-- soft gloss -->
<circle  cx="56" cy="62" r="4.5" fill="#fff" opacity=".8"/>                                              <!-- crisp specular dot -->
```
The soft gloss ellipse is *tilted 16 degrees* to follow the body curve. The little dot is the "glint" that makes it look wet and polished. If you remove it, the hero looks matte.

### 3.5 Skin ramps (hi / mid / lo, plus a glow color and a label color)
Each stage re-skins the hero by changing only these variables on a wrapper:
```css
.wrap { --sk-hi:var(--character-hi); --sk-mid:var(--character); --sk-lo:var(--character-deep); --sk-glow:var(--character); --sk-label:#fff; --sk-pop:var(--character); }
/* examples (stage hues) */
[data-hue="2"]  { --sk-hi:#e8808e; --sk-mid:#d1001c; --sk-lo:#5e000d; --sk-glow:#ff3b4f; }   /* crimson */
[data-hue="4"]  { --sk-hi:#c2a48f; --sk-mid:#6a442e; --sk-lo:#301f15; --sk-glow:#c98a5c; --sk-pop:#6a442e; }   /* brown */
[data-hue="5"]  { --sk-hi:#fdf6ae; --sk-mid:#fbec5d; --sk-lo:#a38b12; --sk-glow:#fff27a; --sk-pop:#a38b12; --sk-label:#3a3000; }  /* yellow */
[data-hue="7"]  { --sk-hi:#80c0ad; --sk-mid:#00805a; --sk-lo:#003a28; --sk-glow:#3fd6a0; --sk-pop:#00805a; }   /* green */
[data-hue="8"]  { --sk-hi:#c8b6ff; --sk-mid:#5b3bd1; --sk-lo:#1d0f5c; --sk-glow:#9a7cf5; --sk-pop:#5b3bd1; }   /* violet */
[data-hue="9"]  { --sk-hi:#fff;    --sk-mid:#35c7e0; --sk-lo:#0b3a63; --sk-glow:#7df9ff; --sk-pop:#0b3a63; --sk-label:#2a120d; }  /* ice: dark label */
[data-hue="11"] { --sk-hi:#ffbfa8; --sk-mid:#ff7f50; --sk-lo:#733924; --sk-glow:#ffa07a; --sk-pop:#733924; --sk-label:#2a120d; }  /* coral: dark label */
[data-hue="13"] { --sk-hi:#fff;    --sk-mid:#ccccff; --sk-lo:#4a4aa8; --sk-glow:#d9d9ff; --sk-pop:#4a4aa8; --sk-label:#2a2a66; }  /* pearl */
```
The same skins as a table (the check in `test/run.js` reads this table and the demo's skin list, and fails if a label is below 4.5:1 against its `mid`, if a pop number is below 3:1 on the two light backgrounds, or if the demo's colors differ from this table):

| Skin | hi | mid | lo | glow | pop | label |
|---|---|---|---|---|---|---|
| Red (default) | #e6685b | #c4372c | #86231b | #c4372c | #c4372c | #ffffff |
| Crimson | #e8808e | #d1001c | #5e000d | #ff3b4f | #ff3b4f | #ffffff |
| Brown | #c2a48f | #6a442e | #301f15 | #c98a5c | #6a442e | #ffffff |
| Yellow | #fdf6ae | #fbec5d | #a38b12 | #fff27a | #a38b12 | #3a3000 |
| Gold | #fff3b0 | #f2b705 | #a86a00 | #ffd23f | #a86a00 | #2a120d |
| Green | #80c0ad | #00805a | #003a28 | #3fd6a0 | #00805a | #ffffff |
| Violet | #c8b6ff | #5b3bd1 | #1d0f5c | #9a7cf5 | #5b3bd1 | #ffffff |
| Ice | #ffffff | #35c7e0 | #0b3a63 | #7df9ff | #0b3a63 | #2a120d |
| Coral | #ffbfa8 | #ff7f50 | #733924 | #ffa07a | #733924 | #2a120d |
| Pearl | #ffffff | #ccccff | #4a4aa8 | #d9d9ff | #4a4aa8 | #2a2a66 |

White text only works on the darker `mid` colors. Gold, Ice, Coral, Yellow and Pearl are light, so they get a dark label from this guide's own palette (warm ink `#2a120d`, or the deeper tones above). When you add a skin, compute the ratio before you ship it.
**How to pick a ramp for a new color (the formula):**
- `mid` = the pure, saturated color you want people to remember.
- `hi` = the same hue, much lighter, a touch warmer, never pure white (except for icy/pearl skins).
- `lo` = the same hue, much darker, *more* saturated or shifted slightly toward purple/blue (never gray, never black).
- `glow` = a bright, slightly lighter cousin of `mid`, used for aura, ring, label glow and (in dark mode) pop numbers.
- `label` = text color on top of `mid`: white for dark/medium colors, a dark brown for yellows and pale colors. The ratio must be at least 4.5:1 (WCAG AA for normal text); white on Gold is 1.8, on Ice 2.0 and on Coral 2.5, so those three must not use white.
- `pop` = the color of the "+1" number on the light page (large bold text, so 3:1 is the floor). Dark and mid skins keep `glow` (Red, Crimson) or use `mid` (Brown, Green, Violet); the pale skins (Yellow, Gold, Ice, Coral, Pearl) use their `lo`, because their `glow` is almost the page color (Yellow's glow is 1.04:1 on the light panel). Every pop in the table is at least 3:1 on `#fbfcfc` and `#eef5f1`; Yellow is the weakest at 3.03. In dark mode `pop` is simply `glow` (every skin is 3.0:1 or better on `#1a2226`). Check any new skin's `pop` on both before you ship it.

### 3.6 The face
The face is a `<g class="face">` over the body. Coordinates are in the 200 box:

| Part | Shape | Position and size | Paint |
|---|---|---|---|
| Cheeks | ellipse | (60,126) and (140,126), rx 9, ry 5.5 | `#ff6f86`, opacity .42 (up to .6 to .8 for love, shy, kiss) |
| Eye whites | ellipse | (79,104) and (121,104), rx 11, ry 13 | `#fff`, stroke `#2a120d` 2.2 |
| Pupils | circle | (79,106) and (121,106), r 6.4 | `#1d1410` |
| Catch-lights | circle | (81.6,103) and (123.6,103), r 2.3 | `#fff` |
| Smile | path | `M85 134q15 14 30 0` | stroke `#2a120d`, width 4.5, round caps, no fill |
| Brows (for some moods) | path | `M66 91q12-11 26-4` and the mirror | same stroke |

Proportion notes you can reuse for any character:
- Eye centers are at **52% of the height**, with eyes spaced about **21% of the width** apart: wide-set and slightly low, which reads "baby".
- Eye width is about **11% of the body width each**, tall rather than round (rx 11, ry 13).
- The pupil is large (about 58% of the eye width) and sits slightly *below* the eye's center, so the character looks gently up-and-at-you.
- The catch-light sits **upper right of the pupil** (about 2.6 units right and 3 units up from its center). Put it in the same spot on every face and every character, so all the eyes shine the same way.
- Cheeks sit **below and outside** the eyes, soft pink, low opacity so the skin color shows through.
- The mouth is tiny and **close to the cheeks**, not under the nose.

**Moods** are not new drawings. The game keeps all expressions in the SVG, hidden, and one attribute (`data-mood="love"`) shows the right pieces:
```css
.face .m-o, .face .m-grin, .face .heart-eyes, .face .star-eyes, ... { display: none; }   /* everything extra starts hidden */
.character[data-mood="love"]  .eyes       { display:none }
.character[data-mood="love"]  .heart-eyes { display:block }
.character[data-mood="love"]  .cheek      { opacity:.75 }
```
Moods used: happy (default), ouch (a 170 ms flinch on every press), wow, wink, love (heart eyes), party (star eyes), dizzy (pupils orbit), sleepy (half lids and floating "Z"), giggle (face shakes 0.16 s), yum (tongue licks), shy (looks down, hatch blush), silly (tongue out, wobble), thinking, kiss, starry, yawn. Rule: **a mood changes eyes, mouth and cheek strength only; the body never changes.** Cheek opacity is the cheapest way to show emotion.

Face micro-animations:
```css
.eyes { transform-box: fill-box; transform-origin: 50% 50%; animation: blink 4.6s infinite; }
@keyframes blink { 0%,90%,100% { transform: scaleY(1) } 94% { transform: scaleY(.08) } }
.pupils { transition: transform 90ms ease-out; }   /* eyes follow the finger: see section 5 */
```

### 3.7 Accent part (flat color on purpose)
```html
<path class="a-stem" d="M100 52q-1.5-21 12-36" stroke-width="7" stroke-linecap="round" fill="none"/>   <!-- stroke: --stem #5b3f27 -->
<path class="a-leaf" d="M106 32c12-22 42-24 54-12-10 18-36 24-54 12Z"/>                      <!-- fill: --leaf #3f7d4c -->
```
A sprout: a curved thick round-capped stem and a pointed lens-shaped leaf at an angle. The accent stays flat while the body is glossy, which adds contrast of finish. It is the "one distinctive accent" that makes the silhouette recognizable even at 24 px. Swap it for an antenna, a tail or a tuft.

### 3.8 Ground shadow and aura (both live *outside* the SVG as plain elements)
```css
.ground { position:absolute; left:20%; right:20%; bottom:1%; height:6%; border-radius:50%;
          background:rgba(0,0,0,.26); filter:blur(3px); }               /* contact shadow: a squashed blurred ellipse */
.aura   { position:absolute; inset:calc(-14% - var(--heat)*9%); border-radius:50%;
          background:radial-gradient(circle, var(--sk-glow) 0, transparent 66%);
          opacity:calc(var(--aura-op) + var(--heat)*.35); animation:aura 3.2s ease-in-out infinite; }
@keyframes aura { 0%,100% { transform:scale(1) } 50% { transform:scale(1.07) } }
```
`--aura-op` is .22 for the plain character and rises to .7 for the fanciest skins; `--heat` goes 0 to 1 when the player is tapping fast, which makes the glow grow. The shadow is what makes it look like it *sits in* the scene. Keep it separate from the character so it does not squash with it.

### 3.9 Idle life
```css
.bob { animation: bob 3.4s ease-in-out infinite }                 /* gentle float: 0 to -4px */
@keyframes bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
.character-art { animation: wiggle 9s ease-in-out 3s infinite }       /* a rare shake: only in the last 14% of each 9 s */
@keyframes wiggle { 0%,86%,100%{transform:rotate(0)} 88%{transform:rotate(-5deg)} 90%{transform:rotate(5deg)} 92%{transform:rotate(-3deg)} 94%{transform:rotate(2deg)} }
```
**Tip:** long idle gaps with a short burst (the wiggle is idle 86% of the time) feel alive without being busy. Different loop lengths (3.2 s, 3.4 s, 4.6 s, 9 s) never sync up, so the motion never looks mechanical.

### 3.10 Many characters on one screen
The idle motion (bob, aura pulse, blink, wiggle) is cheap for one hero and adds up for a crowd. Browser work per second, in one test browser (Chromium 155, headless, median of three 5-second runs, lower is better): 1 hero about 78 ms, 12 heroes about 272 ms, 48 heroes about 644 ms; with every animation off the same 12 heroes cost about 4 ms. So:
- **Pause what nobody sees.** When a hero is off-screen or the tab is hidden, set `animation-play-state: paused` on its bob, aura, blink and wiggle (or use the calm switch in section 5.4). Switching everything off is the ceiling of what a pause can save, about 98% of the idle cost at 12 heroes; the pause itself was not built or timed.
- **Drop the aura on crowds.** The aura pulse alone is about 17% of the 12-hero cost (272 down to 227 ms). Blink is about 22% and wiggle about 14%.
- **Do not merge bob and wiggle onto one element** to save a layer: it was 56% worse (425 ms). `will-change` on the moving layers gave no gain (275 ms), and `content-visibility:auto` on each stage only about 5% (259 ms).
These numbers come from one test browser and were not measured on phones, Firefox or WebKitGTK.

---

## 4. Logo: sticker lettering plus a mini hero

The title lockup is **character + two words**, the hero overlapping the text.

### 4.1 The logo character (viewBox 100, its own gradient, cream sticker outline)
```html
<radialGradient id="lgBody" cx="36%" cy="30%" r="82%">
  <stop offset="0" stop-color="#ff8f78"/><stop offset=".45" stop-color="#e2342a"/><stop offset="1" stop-color="#8f120d"/>
</radialGradient>
<linearGradient id="lgLeaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7fd68f"/><stop offset="1" stop-color="#2f8f4c"/></linearGradient>

<ellipse cx="50" cy="93" rx="24" ry="4" opacity=".16"/>                                   <!-- floor shadow -->
<path d="M50 28c26 0 38 20 38 40 0 18-14 26-38 26S12 86 12 68c0-20 12-40 38-40Z"
      fill="url(#lgBody)" stroke="#fff7e3" stroke-width="3.2" stroke-linejoin="round"/>   <!-- CREAM outline = sticker -->
<path d="M50 30c-1-8 1-14 5-19" stroke="#6b3f1d" stroke-width="3.4" stroke-linecap="round" fill="none"/>
<path d="M54 19c6-11 20-11 26-6-6 9-18 11-26 6Z" fill="url(#lgLeaf)" stroke="#fff7e3" stroke-width="2" stroke-linejoin="round"/>
<ellipse cx="31" cy="46" rx="6" ry="13" transform="rotate(14 31 46)" fill="#fff" opacity=".5"/>
<circle cx="39" cy="55" r="3.4" fill="#2a120d"/><circle cx="61" cy="55" r="3.4" fill="#2a120d"/>   <!-- small dot eyes at this size -->
<circle cx="40.2" cy="53.8" r="1.1" fill="#fff"/><circle cx="62.2" cy="53.8" r="1.1" fill="#fff"/>
<ellipse cx="31" cy="64" rx="4.5" ry="2.6" fill="#ff6f86" opacity=".5"/><ellipse cx="69" cy="64" rx="4.5" ry="2.6" fill="#ff6f86" opacity=".5"/>
<path d="M43 66q7 7 14 0" stroke="#2a120d" stroke-width="2.6" stroke-linecap="round" fill="none"/>
```
Logo-specific choices: **the outline is cream (`#fff7e3`), not dark**. That is what makes it look like a die-cut sticker. The eyes are simplified to solid dots with a catch-light, because at logo size the full white-eye face gets busy. The leaf has a green gradient instead of flat color.

### 4.2 The words (CSS only, no images)
```css
.logo { display:flex; align-items:center; font-family:var(--display); line-height:1; letter-spacing:-.02em; white-space:nowrap; }
.logo-character { width:clamp(6rem,20.4vw,9.1rem); margin-inline:-.35rem -1.1rem; position:relative; z-index:1;   /* overlaps the text */
              filter:drop-shadow(0 4px 0 rgba(0,0,0,.16)); }
.logo-1 { position:relative; display:block; font-weight:800; font-size:clamp(2.7rem,10vw,4.6rem); line-height:.92;
          color:transparent; transform:rotate(-2deg); transform-origin:0 100%;
          filter:drop-shadow(0 .05em 0 #7a120d) drop-shadow(0 .1em .07em rgba(0,0,0,.28)); }
.logo-1::before, .logo-1::after { content:attr(data-t); position:absolute; left:0; top:0; padding-inline:inherit; white-space:nowrap; }
.logo-1::before { color:#fff7e3; text-shadow: /* a ring of 0-blur offsets, see below */; }   /* the cream outline */
.logo-1::after  { background:linear-gradient(180deg,#ff9a7c 0%,#e8392d 45%,#a3150f 100%);       /* the red gradient fill */
                  -webkit-background-clip:text; background-clip:text; color:transparent; -webkit-text-fill-color:transparent; }
```
The word is drawn **three times**: the real (invisible) text for layout, a cream copy behind it with a thick fake outline, and a gradient-filled copy on top. Then two stacked `drop-shadow`s add the hard bottom edge (`0 .05em 0` in dark maroon `#7a120d`) and a soft ground shadow.

*Ready-made code for this lettering: the [`sticker-text`](../sticker-text/README.md) module. For canvas games, [`sprite-baker`](../sprite-baker/README.md) bakes shaded sprites; reuse the `hi / mid / lo` ramp from section 3.5 as its material stops.*

**Screen readers:** the `::before` and `::after` copies repeat the word, and some screen readers announce generated content, so the title can be read two or three times. Put `aria-label="Your Title"` on the heading that holds the logo (the demo does this on its `<h1>`), mark the mini hero SVG `aria-hidden="true"`, and check the result with a screen reader if the title matters.

**The outline trick** (CSS has no good text stroke): the `::before` copy gets about 48 `text-shadow`s with **zero blur** placed on rings around the glyph: three rings of 16 offsets at radii **0.050em, 0.075em and 0.098em**. Generate them with a loop (angle = i/16 × 2π, offset = cos·r, sin·r), as the demo file does. Because it is in `em`, it scales perfectly with the text.

```css
.logo-2 { position:relative; margin:.2rem 0 0 .5rem; padding:.1em .7em .16em;
          font-weight:800; font-size:clamp(1.1rem,4.3vw,1.8rem); letter-spacing:.2em; text-transform:uppercase; color:#fff;
          background:linear-gradient(180deg,#62c981,#2c8a49); border-radius:.35em;
          box-shadow:0 .12em 0 #1b5c32,                        /* hard "thick button" lip */
                     0 .3em .5em rgba(0,0,0,.22),              /* soft ground shadow */
                     inset 0 .08em 0 rgba(255,255,255,.35);    /* top bevel highlight */
          text-shadow:0 .06em 0 rgba(0,0,0,.28);
          transform:rotate(-2deg); }
.logo-2::after { content:""; position:absolute; right:-.45em; top:-.5em; width:1em; height:.52em;      /* a little leaf on the pill */
                 border-radius:0 100% 0 100%; background:linear-gradient(135deg,#8be3a0,#2c8a49);
                 box-shadow:0 .06em 0 #1b5c32; transform:rotate(-24deg); }
```
**The three-layer "chunky 3D" button recipe** appears everywhere (logo pill, Press label): *(a)* a vertical gradient fill, *(b)* a hard, solid, darker shadow directly below with zero blur (`0 .12em 0 darker`), *(c)* a soft diffuse shadow under that, *(d)* a thin white inner highlight along the top. It reads as a thick plastic button.

Everything in the logo is in **em**, so the whole logo scales by changing one `font-size`. The title splash also adds three little animated sparkles (`clip-path` 8-point star polygon, `#ffd23f`).

---

## 5. Motion and "juice" (what makes it feel squishy)

### 5.1 The press squash (300 ms)
```js
art.animate([
  { transform: 'rotate(0deg) scale(1,1)' },
  { transform: 'rotate(' + tilt + 'deg) scale(1.09,0.88)', offset: 0.28 },   // squash: wider and shorter
  { transform: 'rotate(' + (-tilt*0.35) + 'deg) scale(0.96,1.07)', offset: 0.62 },   // overshoot: taller and thinner
  { transform: 'rotate(0deg) scale(1,1)' }
], { duration: 300, easing: 'ease-out' });
```
- `tilt` = how far left/right of the hero's center you pressed, clamped to ±1 and times 7 degrees, so **the hero leans away from or toward the finger**.
- The `transform-origin` is **50% 90%** (near the bottom), so it squashes into the ground rather than around its middle.
- Area stays roughly constant (1.09 × 0.88 ≈ 0.96; 0.96 × 1.07 ≈ 1.03): volume preservation is what makes it read as soft rather than glitchy.

### 5.2 Everything that happens in one tap
| Piece | Spec |
|---|---|
| Squash | 300 ms, above |
| Flinch face | mood `ouch` for 170 ms (eyes become raised lids, mouth an "o") |
| Eyes follow | pupils translate by up to **4.6** units toward the pointer; `k = min(1, distance/140)` so they ease off when the finger is near the center; 90 ms transition |
| Ring | a 4 px ring in `--sk-glow`, `inset: 6%`, scales .75 → 1.7 while fading .85 → 0 over **520 ms**, ease-out |
| Number | "+N" in display 800, size 1.6 to 2.9 rem (grows with the log of the number), keyframes below |
| Bits | 8 to 15 little confetti pieces, three shapes (below), flung out with gravity, 650 to 1100 ms |
| Count bump | the big counter pulses (brief scale + glow) |

**Pop number keyframes (950 ms, `cubic-bezier(.2,.8,.3,1)`):**
```
0%    translate(-50%,-50%)  scale(0.3)  rotate(r)       opacity 0
18%   translate(-50%,-75%)  scale(1.5)  rotate(r)       opacity 1     <- overshoot
42%   translate(-50%,-105%) scale(1.0)  rotate(r*0.4)   opacity 1     <- settle
100%  translate(-50%,-300%) scale(0.85) rotate(0)       opacity 0     <- drift up and fade
```
`r` is random between −12° and +12°, and the start x is jittered ±14 px so rapid taps don't stack into one blob.

**Number outline** (so it reads on any background):
```css
.pop { font:800 1.9rem/1 var(--display); color:var(--sk-pop);
  text-shadow:-2px 0 var(--bg),2px 0 var(--bg),0 -2px var(--bg),0 2px var(--bg),
              -2px -2px var(--bg),2px 2px var(--bg),-2px 2px var(--bg),2px -2px var(--bg),   /* 8-way outline in the page color */
              0 0 16px var(--sk-glow); }                                                        /* + a soft colored glow */
```

**Confetti bits (juice drops, chips and seeds):** every third piece is a different shape, which is what makes it look like splashes and seeds rather than generic dots:
- Drop: `width = s*.75`, `height = s*1.25`, `border-radius: 50% 50% 50% 50% / 62% 62% 38% 38%`, colored from the skin palette
- Chip: `width = s*1.2`, `height = s*.75`, `border-radius: 2px`, cream `#fff3cf`
- Seed: `3.2 × 5.6 px`, dark brown `#4a2c18`
- `s` is random 4 to 10 px. Flight: up and out fast (`cubic-bezier(.2,.7,.4,1)`), then falls (gravity) with rotation up to ±270°, shrinking to 50%, fading.

### 5.3 Heat, holding and special states
- `--heat` (0 to 1) rises with tap speed: aura grows, brightens, and a spinning conic-gradient flame ring appears at high speed.
- The ring uses `conic-gradient` masked into a thin donut (`mask: radial-gradient(farthest-side, transparent calc(100% - 10px), #000 calc(100% - 9px))`), spinning at 1.3 s.
- A "ready" button pulses `scale(1) ↔ scale(1.05)` over 1 s, alternate.

### 5.4 Calm mode
Every effect checks a flag first. "Calm" turns off bobbing, aura pulse, confetti and squash entirely, and the OS "reduce motion" setting is honored. Build this in from day one: **it is not optional polish, it is part of the style.**

CSS animations stop with one rule, but animations started from script (`element.animate()`) and transitions are not touched by it, so the script must check too. This is what `demo.html` does:
```css
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; }      /* bob, aura, blink, wiggle */
  .pupils { transition: none; }          /* no glide */
}
```
```js
var calmQuery = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
function calm() { return !!(calmQuery && calmQuery.matches) || userCalm; }   // userCalm: your own in-game switch

hero.addEventListener('click', function (e) {
  if (calm()) return;                    // skip squash, pop number, confetti, ring (all element.animate() calls)
  /* ... effects ... */
});
document.addEventListener('pointermove', function (e) {
  if (calm()) { pupils.style.transform = ''; return; }   // pupils stay centered
  /* ... follow the pointer ... */
});
```
Ask the query again on every tap (as above) so a change in system settings takes effect without a reload. In calm mode still give the player some feedback that does not move: change a counter's text, flash a color, or change the mood for a moment.

**Keyboard taps.** A click made with the keyboard (Enter or Space on the button) has no pointer position; some browsers report 0,0. When `e.detail === 0`, start the effects from the center of the button instead of `clientX` / `clientY`:
```js
var kb = e.detail === 0, b = hero.getBoundingClientRect();
var px = kb ? b.left + b.width / 2 : e.clientX, py = kb ? b.top + b.height / 2 : e.clientY;
```

**Forced colors (Windows high contrast).** The browser swaps colors for system colors and drops shadows and gradient backgrounds, which flattens the hero and can hide gradient-filled text. Keep the artwork's own colors and give the sticker lettering a plain fallback:
```css
@media (forced-colors: active) {
  .stage, .logo-hero { forced-color-adjust: none; }   /* the character and scene keep their painted colors */
  .logo-1 { color: CanvasText; }                       /* show the real text ... */
  .logo-1::before, .logo-1::after { content: none; }   /* ... and drop the two decorated copies */
  .logo-2 { border: 2px solid CanvasText; box-shadow: none; }
}
```
`forced-color-adjust` is not supported in Safari, where this block simply does nothing.

**Auto-dark on phones.** Add `<meta name="color-scheme" content="only light">` (and `color-scheme: only light` on `:root`, as in section 2) so a phone's "dark mode for websites" does not repaint the white highlights. If your product has real dark tokens, switch them yourself with your own switch or `prefers-color-scheme`; the demo ships light only.

---

## 6. Scenes (the calm stage)

### 6.1 Rig
- One `<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMax slice">` fills the play-area box, anchored to the bottom-center so the ground always shows and the sky crops first on tall screens.
- Scaled `transform: scale(1.05)` so crops never reveal an edge.
- A final `<rect fill="url(#gVig)">` vignette: radial, transparent to 60%, then black at **.2 opacity** at the edges. It adds depth and focuses the eye on the middle.
- Each stage is a `<g class="sc" data-s="N">`; only the current one is displayed (others are `display:none`, so their animations cost nothing). Switching crossfades over 900 ms.

### 6.2 Depth from only layering and value
Back to front: **sky gradient → sun and clouds → far hill → mid hill → ground → props → foreground tufts**.
```html
<rect width="400" height="260" fill="url(#gSky)"/>   <!-- --sky-top #b5d6e8 to --sky-bot #eef5f1 -->
<path class="c-hillf" d="M0 190c40-30 90-40 140-14 50-26 110-26 160-4 40-22 80-12 100 8v80H0Z"/>   <!-- palest, coolest: #b3cdc0 -->
<path class="c-hillm" d="M0 200c60-18 120-14 180-2 60-14 140-12 220 0v62H0Z"/>                     <!-- #90b9a1 -->
<rect class="c-grd" y="204" width="400" height="56"/>                                              <!-- #6aa282, nearest and most saturated -->
```
Atmospheric perspective: each layer toward the viewer is **darker and more saturated**; each layer away is paler and bluer (it blends toward the sky). No outlines, no strokes, no textures. Hills are long overlapping S-curves with `c` curves so no two lumps match.

### 6.3 The shape vocabulary (everything is a circle, ellipse, rect or polygon)
- **Tree**: trunk `rect` (`--trunk`) + a big dark circle (`--foliage`, r 21) + a smaller *lighter* circle offset up-left (`--foliage-2`, r 11). The offset lighter circle is the light source in miniature. Fruit = three small red dots (r 3, `#d63a2e`).
- **House**: body `rect` (`--bld`), roof `polygon` (`--roof`), chimney `rect` (`--bld-2`, drawn *before* the roof so the roof overlaps its base), windows small `rect`s in warm `--win` (they stay lit at night).
- **Cloud**: one flat `ellipse` plus two overlapping circles, white, some at .7 to .8 opacity for depth.
- **Sun**: three concentric circles (halo `#ffd98a` .3 opacity r24, then `#ffe08a` r14, then `#fff3c4` r10). The halo breathes.
- **Moon (dark mode)**: a crescent path with its own faint halo; the sun and moon swap by the same dark-mode rule that changes the palette.
- **Water, metal, vehicles**: flat fills with one lighter highlight rect, one darker belly shape. Nothing has more than 2 shades.
- **Grass**: a single `path` of many tiny `m` strokes along the field edge.

Color use: palette variables for the background world (`.c-hillf { fill:var(--hill-far) }` etc.), and **hard-coded saturated colors only for small accent props** (red heroes `#d63a2e`, gold `#f2b705`, butterfly `#ffb347`/`#ff8a3d`).

### 6.4 Ambient life (all slow, all small, all looped)
| Thing | Motion |
|---|---|
| Clouds | slow horizontal drift, 80 to 115 s per crossing, different speeds and opacities |
| Birds | stroke-only `M0 0q4-5 8 0 4-5 8 0`, wing flap `scaleY(1↔.3)` at .38 s, fly across in ~23 s |
| Butterfly | four wing ellipses plus a body rect, wings flap, wanders a path |
| Chimney smoke | three circles, white, grow/rise/fade, 3.4 s ease-out, staggered 1.1 s |
| Dropping character | a character falls from a tree, bounces three times (`33px → 26px → 33px`), fades, every 11 s |
| Stars | tiny white circles with a few given a `tw` (twinkle) class |
| Petals / fireflies | tiny absolutely positioned elements moved by the compositor (`translate` / `rotate` only), no per-frame JavaScript |

Everything is `transform` / `opacity` only, and hidden scenes have animations force-disabled (`.sc:not(.on) * { animation: none !important }`).

### 6.5 How scenes change the mood without changing the style
Same shape vocabulary, different palette per setting:
- **Daytime stages 1 to 7**: the variable palette above.
- **Space stages 8 to 13**: dark gradient backgrounds (`#04060d → #1d1457`, `#0a0420 → #2a0f5e → #0b1f55`, `#190a44 → #5a1a90 → #b53a8c`), white star dots, planets as radial-gradient circles (`#2f8f9d / #1f5f86 / #0d2547`), bubbles as translucent white radial gradients.
- **Bonus paradise**: warm cream sky (`#fffdf6 → #fdf1d8 → #f6dfae`).
The *character* never changes style between them, only skin and the world.

---

## 7. Special collectibles (the same recipe, richer materials)

Special collectibles use the identical formula, with different gradient stops and an extra glow:
```css
.golden { filter: var(--glow); }
.golden[data-kind="golden"] { --glow: drop-shadow(0 0 5px rgba(255,220,80,1)) drop-shadow(0 0 14px rgba(255,180,30,.8)); }
```
**Glow recipe: two stacked `drop-shadow`s**: a tight bright one (5 px, alpha 1) and a wide softer one (14 px, alpha .8), both in the material's color. The tight one outlines it, the wide one makes it radiate.

| Material | Radial gradient (cx 36%, cy 30%, r 80%) | Extras |
|---|---|---|
| Gold | `#fffbe0` → `#ffe066` (30%) → `#e3a400` (70%) → `#8a5600` | moving glint |
| Crystal | `#fff` → `#d4f4ff` → `#62b9f0` → `#1d4f9c`, body opacity .95 | white facet lines (`stroke-opacity .55`, width 1.4) cutting the body |
| Rainbow | linear, 6 stops (`#ff4d4d #ff9f1a #ffd23f #4fd67a #3fa9ff #a76bff`) | white sparkle shapes at .75 |
| Jade | pale mint → `#8fe3b6` → green | orbiting pale stars |
| Comet / Cosmic | icy cyan, or cyan+pink | comet gets a tapered tail (`linear-gradient` streak, rotated along its path); cosmic gets an orbit ring |

Details worth copying:
- The artwork box is **128% of the button size and offset −14%**, with `overflow: visible`, so glow and sparkles are not clipped by the button's bounds.
- The glint is built from **about 30 thin white stripes of rising then falling opacity** (not one gradient), moving across with `translateX`. *(Some Android GPUs drew a single moving gradient as a dark streak.)*
- Orbiting sparkles: a group that `spin`s 4 s, with 4-point star shapes (`clip-path: polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%)`).
- The sparkle star shape is reused for twinkles, spark bursts, and the logo glints: one shape, many jobs.

---

## 8. UI around the character

The interface is deliberately **plain** so the character carries the charm: flat panels, 1 px borders, 6 to 12 px radii, and color used only where something is important.

- Cards: `background: var(--panel); border: 1px solid var(--line); border-radius: 6px to 12px`.
- Primary cards that you can afford use `border: 1px solid var(--character)`; disabled ones use `--line` and transparent fill.
- **Fallback before `color-mix()`:** an older browser that does not know `color-mix()` (before Chrome 111 or Firefox 113) throws away the whole declaration it appears in, including every other shadow in the same list. So write the same property once without `color-mix()` first, then again with it; browsers that understand it use the second line.
  ```css
  .pill { background: var(--panel); background: color-mix(in srgb, var(--leaf) 14%, var(--panel)); }
  ```
- Pills and badges: `border-radius: 999px`, tinted fills with `color-mix(in srgb, var(--leaf) 14%, var(--panel))` (with the fallback line above it).
- **The Press label** under the hero (the "chunky plastic" pill):
  ```css
  .label span { padding:.3rem .95rem .35rem; border-radius:999px; background:var(--sk-mid); color:var(--sk-label);
    font:800 1.05rem/1 var(--display);
    box-shadow: inset 0 -3px 0 rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.18), 0 0 14px rgba(0,0,0,.2);   /* fallback: same lip and shadow, gray halo */
    box-shadow: inset 0 -3px 0 rgba(0,0,0,.18),                       /* darker lip along the bottom inside */
                0 2px 8px rgba(0,0,0,.18),                              /* soft shadow */
                0 0 14px color-mix(in srgb, var(--sk-glow) 50%, transparent);   /* colored halo */
    text-shadow: 0 1px 2px rgba(0,0,0,.3); }
  ```
- **Celebration card** (big moments): `border: 3px solid var(--sk-mid)` + an outer ring `0 0 0 6px color-mix(in srgb,var(--sk-glow) 35%, transparent)` (write a fallback `box-shadow` without `color-mix()` on the line above, as shown for the label) + `0 30px 90px rgba(0,0,0,.55)` + `0 0 90px color-mix(in srgb,var(--sk-glow) 55%, transparent)`, over a dark radial backdrop tinted with the new skin's glow, and a "slam" entrance: `520ms cubic-bezier(.2,.9,.3,1.1)` (the last control point overshoots).
- Focus ring: `3px solid #1f6feb` (light) / `#7ab7ff` (dark). Accessibility is part of the look.

---

## 9. Step-by-step recipe for a new character in another project

Follow this order. Each step is a checkpoint; stop and look at it at **24 px, 120 px and 300 px** before moving on.

1. **Silhouette first (flat, one color).** One closed path in a 200 × 200 box. Rounded, with one asymmetry (a dimple, a lean, a curl). Add one accent part with a *different* shape language (stem and leaf, antenna, tail). It must be recognizable as a flat blob.
2. **Pick the ramp.** Choose `mid` (the hero color), derive `hi` (lighter, warmer) and `lo` (deeper, more saturated), plus `glow`. Put them in CSS variables.
3. **Fill with the radial gradient** (focus 36% / 30%, radius ~82%, stops 0 / .5 / 1). This alone should already look like a soft ball.
4. **Add the clipped shade and rim light** (`gShade` lower right, `gRim` right edge, both inside a `clip-path` of the body).
5. **Add the highlights:** tall soft tilted ellipse upper left (opacity .7), plus one crisp white dot. Do not skip the dot.
6. **Draw the face** with the proportions in section 3.6: wide-set, low-set eyes with warm-ink rims and a catch-light, cheeks, tiny mouth. Use warm ink (`#2a120d`), 4.5-wide round-capped strokes.
7. **Add the accent parts in flat color** with a darker stroke or a cream outline if it's a logo.
8. **Add the stage furniture:** blurred ground ellipse (26% black), aura (radial glow in `glow`, 22% opacity).
9. **Idle motion:** bob (3.4 s, 4 px), aura breathe (3.2 s, scale 1.07), blink (4.6 s, 94% keyframe `scaleY(.08)`), rare wiggle (9 s, only the last 14%).
10. **Touch reaction:** squash and stretch (300 ms, scale 1.09/.88 → .96/1.07, origin at the bottom, tilt toward the pointer), pointer-following pupils, a ring, a pop number, 8 to 15 bits in 3 shapes.
11. **Mood system:** put all expressions in the SVG hidden; switch by `data-mood`. Start with happy, ouch (flinch), wow, love, sleepy. Change eyes, mouth and cheek opacity only.
12. **Scene:** 400 × 260 box, bottom-anchored slice, sky gradient → far hill → mid hill → ground, then props from circles and rects, lighter offset circles for light, then a .2 vignette. Keep the scene's saturation *below* the hero's.
13. **Logo:** hero mini-version with cream outline overlapping the title; title in 800 weight with cream ring outline + gradient fill + hard drop edge + −2° tilt; subtitle in a chunky pill with the three-layer button shadow.
14. **Skins:** define 4 to 12 hue sets with the five variables; test each for contrast of the label, the pop number and the progress bar, and on both light and dark backgrounds.
15. **Dark mode and calm mode:** swap tokens (lighten the hero, darken the world), and gate every effect behind a calm check and `prefers-reduced-motion`.
16. **Final review.** Does the light come from the upper left on *everything*? Is anything pure black? Does the hero out-saturate the scene? Does it still read at 24 px?

### Adapting to other characters
- **Banana / pear / ghost / robot / coin:** only the silhouette path and the accent part change. The gradients, face proportions, shadow, aura, squash, bits and scene rules carry over. Move the face so its eyes sit at about 52% of the *visible body's* height.
- **Glass or metal objects:** keep the gradient focus at 36/30, but add a second narrow light stripe and make the lo tone nearly as light as mid for glass. For chrome, use 4 stops with a hard step in the middle (`#fff → #c3ccd6 → #8e99a6 → #dfe5eb`, with the two middle stops close together).
- **Other body shapes squash differently:** keep `transform-origin` at the part touching the ground, and keep volume roughly constant (width × height ≈ 1).
- **Bigger characters:** all numbers in the face are in the 200-unit box, so they scale with the SVG. Everything else (shadow, aura, ring) uses percentages of the character's box, so they scale too. Use `rem`/`em` only for text.

---

## 10. Pitfalls found the hard way (save yourself the time)

| Problem | Fix |
|---|---|
| Gradients stopped working when the SVG holding them was inside a `display:none` parent | Keep gradient `<defs>` in an SVG that stays rendered, or clone with unique ids. A `<use>` of an element that itself has `display:none` also won't draw. |
| Duplicated gradient ids when copying an SVG | Rename ids (and `url(#…)`, `href`) in the copy. |
| A CSS animation on `transform` overrides a `transform="translate()"` attribute on an SVG shape, so the shape jumps to the corner | Draw the shape at its final coordinates in the path instead of positioning it with `transform`. |
| A moving white gradient showed as a dark streak on some Android GPUs | Build shines from stacked thin stripes with stepped opacity. |
| Phone "dark mode for websites" turned the white highlights dark | `color-scheme: only light` on `:root` and the matching `<meta name="color-scheme" content="only light">` (the game has its own dark mode). |
| Confetti started at the top-left corner after a keyboard tap | Use the button's center when `e.detail === 0` (section 5.4). |
| Skin label unreadable (white on Gold or Ice) | Pick a dark `label` for light `mid` colors and check 4.5:1 (section 3.5). |
| Blurry or invisible highlight on very small renders | Highlights need a minimum size; the dot should still be ≥ 1 px at the smallest displayed size. |
| A flying copy of an element was invisible when placed inside a section that is skipped while off screen (`content-visibility: auto`) | Put overlays on the page's top-level container. |
| Pure black outlines made the character look pasted on | Use the warm ink, `#2a120d`, everywhere. |
| Text outlines looked jagged | Three rings of 16 zero-blur shadows (not one ring), in `em` units. |
| Everything animating at once felt noisy and slowed phones | Idle loops have different lengths and long still gaps; hidden scenes have animations force-disabled; effects use only `transform`/`opacity`. |

---

## 11. Quick checklist you can paste into a new project's notes

- [ ] One light source, upper left, on every object (gradient focus ≈ 36% / 30%)
- [ ] Every color is a `hi / mid / lo` variable set, plus `glow` and `label`
- [ ] Hero has: body gradient, clipped lower-right shade, right rim light, soft tilted gloss, crisp white dot
- [ ] Eyes big, wide-set and low (~52% height), warm-ink rim, big pupil, white catch-light; blush cheeks; tiny low smile
- [ ] All dark lines are warm brown ink, not black; logo outline is cream
- [ ] Contact shadow (blurred ellipse) and aura (radial glow) are separate elements
- [ ] Idle loops of unequal lengths: bob 3.4 s, aura 3.2 s, blink 4.6 s, wiggle 9 s
- [ ] Touch = squash 1.09/.88 then 0.96/1.07 in 300 ms, origin at the ground, leaning toward the pointer
- [ ] Pop number with overshoot (scale 1.5 at 18%) and an outline in the page color plus a colored glow
- [ ] Confetti in three shapes, with gravity
- [ ] Scene = sky gradient + 3 value-stepped ground layers + circle/rect props + .2 vignette; scene less saturated than hero
- [ ] Chunky pill/button = gradient + hard lip shadow + soft shadow + inner top highlight
- [ ] Skins tested for contrast (label on `mid` at least 4.5:1); dark mode makes the hero lighter and the world darker
- [ ] Calm mode and reduced motion respected, including `element.animate()` calls; forced colors keep the hero readable; keyboard taps start effects at the button center
- [ ] Checked at 24 px, 120 px, 300 px, light and dark

---

*Source map (the original game is not part of this repository): the game file's CSS sections 1.1 (skins), 1.5 (character on its scene), 1.6 and 1.16 (scenes and moving scenery), 1.9 and 1.10 (faces), 1.12 (special collectibles), 1.14 (title and logo); the press, pop, ring and squash code is in the click handler (`press`, `jiggle`, `popNumber`, `ring`, `bits`, `lookAt`).*
