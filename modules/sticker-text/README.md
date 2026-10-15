# sticker-text

Die-cut "sticker" lettering for logos and titles in plain HTML and CSS: no images, scales with `font-size`. About 2 KB JS + CSS.

```html
<link rel="stylesheet" href="sticker-text.css">
<script src="sticker-text.js"></script>
<span id="logo">Bloop</span>
<script>StickerText.apply(document.getElementById('logo'), { outline: '#fff7e3' });   // adds class sticker-text</script>
```
Colors come from CSS variables `--st-fill` (gradient), `--st-edge` and `--st-outline`. `.sticker-pill` is a small rounded label style. `StickerText.ringShadow('#fff7e3')` returns the `text-shadow` list if you want to place it yourself.

## The trick
CSS has no good text stroke: `-webkit-text-stroke` straddles the glyph edge and chews up thin letters. So the word is drawn three times: (1) the real, invisible text for layout and accessibility, (2) a copy behind it with a **ring of zero-blur offset shadows** in the outline color (3 rings of 16 at .05/.075/.098 em look smooth; two rings look rough at large sizes), (3) a gradient-filled copy on top. Stacked drop-shadows add a hard bottom edge and a soft ground shadow. All sizes are in `em`.

## Limits
48 shadows per outline is heavier than a plain stroke: use it for a few titles, not paragraphs. Works with any font; very thin fonts need a larger outer ring.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry · extracted from [Apple Press](https://github.com/JNFoo/apple-press)
