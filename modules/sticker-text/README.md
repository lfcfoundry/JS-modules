# sticker-text

**Version 1.0.0 · API 1**

Die-cut "sticker" lettering for logos and titles in plain HTML and CSS: no images, scales with `font-size`. About 2 KB JS + CSS.

```html
<link rel="stylesheet" href="sticker-text.css">
<script src="sticker-text.js"></script>
<span id="logo">Bloop</span>
<script>StickerText.apply(document.getElementById('logo'), { outline: '#fff7e3' });   // adds class sticker-text</script>
```
Colors come from CSS variables `--st-fill` (gradient), `--st-edge` and `--st-outline` (the ring). Set `--st-outline` in your CSS (on the element, or on any parent such as a dark-mode class) and the ring recolors with no JavaScript. The `outline` option of `apply()` only sets the default for that element (stored as `--st-outline-default`); a `--st-outline` in CSS wins over it. `.sticker-pill` is a small rounded label style.

## API
- `StickerText.apply(el, { outline, radii, steps })` adds the class, copies the text into `data-t` and writes the shadow ring (`--st-ring`). `outline` is a CSS color (default `#fff7e3`), `radii` a list of em sizes (default `[0.05, 0.075, 0.098]`), `steps` the shadows per ring (default 16, at most 96). Returns the element. A null or non-element argument is returned unchanged; bad option values fall back to the defaults. It never throws.
- `StickerText.update(el)` call it after the text changed (a score, a translation). The pretty copies are drawn from `data-t`, which is a copy made at `apply()` time, so without `update()` they keep showing the old words. Calling `apply()` again does the same. On an element that was never applied, `update()` applies it.
- `StickerText.ringShadow(color, radii, steps)` returns the `text-shadow` list (48 shadows by default) if you want to place it yourself.

## The trick
CSS has no good text stroke: `-webkit-text-stroke` straddles the glyph edge and chews up thin letters. So the word is drawn three times: (1) the real, invisible text for layout and accessibility, (2) a copy behind it with a **ring of zero-blur offset shadows** in the outline color (3 rings of 16 at .05/.075/.098 em look smooth; two rings look rough at large sizes), (3) a gradient-filled copy on top. Stacked drop-shadows add a hard bottom edge and a soft ground shadow. All sizes are in `em`.

## Accessibility
The real text stays in the page and is what screen readers and search read. The two decorative copies use `content: attr(data-t) / ""` (empty alt text, so screen readers should skip them; a plain `content` line comes first for older browsers). In Windows high-contrast mode (`forced-colors: active`) the copies are switched off and the real text is shown in the system color. I did not test this with a real screen reader or in Windows high contrast; the behavior comes from the CSS specification and MDN.

## Limits
- One line only. `white-space: nowrap` and the absolutely placed copies cannot wrap, so a long title on a narrow phone overflows sideways. Shorten it or lower the `font-size`.
- Descenders (g, p, y, accents) may lose their gradient fill and show only the outline color at the tails, because the line height is `.92` and the gradient copy paints only inside its own box. Check your font with a word that has descenders; a larger `line-height` on the element reduces it.
- 48 shadows per outline are heavier to draw than a plain stroke (not measured, so treat this as a precaution): use it for a few titles, not paragraphs, and not for text that changes every frame.
- Works with any font; very thin fonts need a larger outer ring (`radii`).
- Needs `sticker-text.css`. The text must be plain text (the copy is `textContent`, so child markup is flattened in the copies).

## Prior art
The idea of an outline made from offset shadows is not new; the packaged recipe (three smooth rings, gradient fill, hard edge, one `font-size`) is this module's part.
- `-webkit-text-stroke` with `paint-order: stroke fill` ([MDN](https://developer.mozilla.org/docs/Web/CSS/paint-order)): one line of CSS and good for thin outlines, supported in current browsers. For HTML text I could not confirm a way to round the corner joins, so sharp letters can show spikes where this ring stays round. Use it when you want a thin outline on text that changes often.
- SVG `<text>` with `stroke`, `stroke-linejoin="round"` and `paint-order`: the standard route, with round joins; needs SVG markup instead of a class on a span.
- Canvas `strokeText` with `lineJoin = "round"` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lineJoin)): what canvas games already use; no DOM text, so no selection or screen reader text.
- [CSS-Tricks, "Adding Stroke to Web Text"](https://css-tricks.com/adding-stroke-to-web-text/) describes the shadow-ring and duplicated-text tricks; [stroketext.js](https://www.npmjs.com/package/stroketext.js) (MIT) draws the stroke on a canvas behind live text and is much larger.

## For AI agents
- Copy `sticker-text.css` and `sticker-text.js` (keep the MIT headers). No dependencies; the JS can be `require`d in Node.
- Mark each title with `StickerText.apply(el)`; after you change its text, call `StickerText.update(el)`.
- Recolor the outline with the CSS variable `--st-outline`, the fill with `--st-fill`, the lower edge with `--st-edge`. Do not edit `--st-ring` by hand.
- Do not use it for wrapping text or paragraphs (see Limits). The demo is `demo.html`; Node checks run with `node modules/sticker-text/test/run.js`.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
