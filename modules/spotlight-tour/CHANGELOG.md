# spotlight-tour changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-17
New module, cut from Apple Press's first-time tour. A short tour of a page: one dimmed layer, a bright window over the current part (measured live, follows scrolling), a card with Skip, Back and Next. New visitors see it once; the address `#tour` forces it for testing; Escape skips. "Seen" and "gift given" are remembered separately, so only people who finish get the gift, once, even if they take the tour twice. Changed from the Apple Press original: the game's steps and gift are options (`steps`, `onGift`), steps can be selectors, elements or functions, and the placing maths is exported as `layout` with 5 checks. 11.4 KB including its own style (4.4 KB gzipped); driver.js 1.10.1 is 26.9 KB plus a stylesheet, and Shepherd.js and Intro.js are licensed AGPL-3.0. Real-browser check in Firefox 158 and ungoogled Chromium 155: opens once, window over the part, Back, Skip, Escape, Tab, `#tour`, gift once, scrolling to a far part, blocked storage.

Tested in: Node checks where the piece has any; Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6, one at a time, in a real browser (`tests/pieces-browser.js`, 2026-10-17; WebKitGTK 2.52.6 through `tools/webkit-driver`; key down/up and touch were sent as page events or the mouse). Not run: GNOME Web (Epiphany) 46.5, a phone.
