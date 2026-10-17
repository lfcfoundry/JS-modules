# sticker-text

**Version 1.1.0 · API 1**

**Tested in:** ungoogled Chromium 155.0.8059.39, Firefox 158.0 and WebKitGTK 2.52.6 (one at a time): the 17 Node checks, the demo page loading without errors, and the measurements above. Not tested: a real screen reader, Windows high contrast, Safari itself.

Die-cut "sticker" lettering for logos and titles in plain HTML and CSS: no images, scales with `font-size`. About 4.8 KB JS + CSS minified (about 2.1 KB gzipped); the files as shipped are about 9 KB with comments. (The earlier "about 2 KB" was wrong: version 1.0.0 measures about 3.8 KB minified.)

```html
<link rel="stylesheet" href="sticker-text.css">
<script src="sticker-text.js"></script>
<span id="logo">Bloop</span>
<script>StickerText.apply(document.getElementById('logo'), { outline: '#fff7e3' });   // adds class sticker-text</script>
```
Colors come from CSS variables `--st-fill` (gradient), `--st-edge` and `--st-outline` (the ring). Set `--st-outline` in your CSS (on the element, or on any parent such as a dark-mode class) and the ring recolors with no JavaScript. The `outline` option of `apply()` only sets the default for that element (stored as `--st-outline-default`); a `--st-outline` in CSS wins over it. `.sticker-pill` is a small rounded label style.

## API
- `StickerText.apply(el, { outline, radii, steps })` adds the class, copies the text into `data-t` and writes the shadow ring (`--st-ring`). `outline` is a CSS color (default `#fff7e3`), `radii` a list of em sizes and `steps` the shadows per ring (default one ring of 32 at .098 em, at most 96 per ring). The default ring is in `sticker-text.css`, so `apply()` writes no inline style unless you give `radii` or `steps`. Returns the element. A null or non-element argument is returned unchanged; bad option values fall back to the defaults. It never throws.
- `StickerText.update(el)` call it after the text changed (a score, a translation). The pretty copies are drawn from `data-t`, which is a copy made at `apply()` time, so without `update()` they keep showing the old words. Calling `apply()` again does the same. On an element that was never applied, `update()` applies it.
- `StickerText.watch(el, opts)` does `apply()` and then keeps `data-t` current by itself with a `MutationObserver` whenever the text changes, so you never call `update()`. Returns a function that stops watching. Without `MutationObserver` (Node, very old browsers) it only applies once.
- `StickerText.ringShadow(color, radii, steps)` returns the `text-shadow` list (32 shadows by default) if you want to place it yourself.

## The trick
CSS has no good text stroke: `-webkit-text-stroke` straddles the glyph edge and chews up thin letters. So the word is drawn three times: (1) the real, invisible text for layout and accessibility, (2) a copy behind it with a **ring of zero-blur offset shadows** in the outline color (one ring of 32 at .098 em is smoother than the old three rings of 16, which overlapped and drew the same outline as one ring of 16; raise `steps` for lettering over about 150 px), (3) a gradient-filled copy on top. Stacked drop-shadows add a hard bottom edge and a soft ground shadow. All sizes are in `em`.

## Accessibility
The real text stays in the page and is what screen readers and search read. The two decorative copies use `content: attr(data-t) / ""` (empty alt text, so screen readers should skip them; a plain `content` line comes first for older browsers). In Windows high-contrast mode (`forced-colors: active`) the copies are switched off and the real text is shown in the system color. I did not test this with a real screen reader or in Windows high contrast; the behavior comes from the CSS specification and MDN.

## Limits
- Wrapping works since 1.1.0: the copies take the element's width, `white-space` and `text-align`, so a title wraps and honors `white-space: pre-line` newlines the same way plain text would. Set `white-space: nowrap` yourself if you want one line.
- Descenders (g, p, y, accents) keep their gradient fill since 1.1.0 (the copies got `.12em` of tail room). Not tested with every font.
- 32 shadows per outline are still heavier to draw than a plain stroke. Measured with 40 words whose text changes every frame (100 px lettering): about 70 ms per frame in Chromium, 135 ms in Firefox, 210 ms in WebKitGTK in this container's software drawing (relative numbers only). Add class `st-flat` (drops the soft ground shadow) to cut a frame by about 40% in Chromium and 37% in Firefox compared with 1.0.0 (about 40% and 19% compared with the new default), and `st-stroke` as well (one text stroke instead of the 32 shadows) to cut it by about 54% in Chromium, 84% in Firefox and 87% in WebKitGTK. `st-stroke` alone saves little in Chromium (about 7%). Use the plain look for a few titles, not paragraphs.
- `st-stroke` draws sharp corners in Chromium (it ignores `stroke-linejoin` on HTML text) and round corners in Firefox and WebKitGTK. Use it where speed matters more than perfectly round corners.
- Works with any font; very thin fonts need a larger outer ring (`radii`).
- Needs `sticker-text.css`. The text must be plain text (the copy is `textContent`, so child markup is flattened in the copies).

## Prior art
The idea of an outline made from offset shadows is not new; the packaged recipe (three smooth rings, gradient fill, hard edge, one `font-size`) is this module's part.
- `-webkit-text-stroke` with `paint-order: stroke fill` ([MDN](https://developer.mozilla.org/docs/Web/CSS/paint-order)): one line of CSS and good for thin outlines, supported in current browsers. For HTML text, Chromium 155 ignores `stroke-linejoin` (measured), so sharp letters can show spikes there where this ring stays round; Firefox 158 and WebKitGTK 2.52.6 round the corners. This is what the `st-stroke` class uses. Use it when you want a thin outline on text that changes often.
- SVG `<text>` with `stroke`, `stroke-linejoin="round"` and `paint-order`: the standard route, with round joins; needs SVG markup instead of a class on a span.
- Canvas `strokeText` with `lineJoin = "round"` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineJoin)): what canvas games already use; no DOM text, so no selection or screen reader text.
- [CSS-Tricks, "Adding Stroke to Web Text"](https://css-tricks.com/adding-stroke-to-web-text/) describes the shadow-ring and duplicated-text tricks; [stroketext.js](https://www.npmjs.com/package/stroketext.js) (MIT) draws the stroke on a canvas behind live text and is much larger.

## For AI agents
- Copy `sticker-text.css` and `sticker-text.js` (keep the MIT headers). No dependencies; the JS can be `require`d in Node.
- Mark each title with `StickerText.apply(el)`; after you change its text, call `StickerText.update(el)`, or use `StickerText.watch(el)` once and forget it.
- Recolor the outline with the CSS variable `--st-outline`, the fill with `--st-fill`, the lower edge with `--st-edge`. Do not edit `--st-ring` by hand. For text that changes often or many words at once add class `st-flat`, and if corners may be sharp, `st-stroke`.
- Do not use it for paragraphs (see Limits); short wrapped titles are fine. The demo is `demo.html`; Node checks run with `node modules/sticker-text/test/run.js`.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
