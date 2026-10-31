# spotlight-tour developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.1.1 · API 1 · 2026-10-24

### Quick
A closed tour no longer reacts to scrolling or resizing, so a page with the tour closed does less work on every scroll (20,000 scroll events: 88 to 12 ms in Chromium).

### Deep
Shipped in JS-modules PR 163 (merged 2026-10-24).
20,000 scroll events on a closed tour, median of 7 fresh pages per version, ms, lower is better: Chromium 155 88 to 12, Firefox 158.0 103 to 24, WebKitGTK 2.52.6 55 to 9. Open tour: 120 to 111, 193 to 163, 98 to 88 (not slower). Brief from the Apple Press thread. Page checks in all three browsers pass; no behavior change.

## 1.1.0 · API 1 · 2026-10-17

### Quick
The bright window now stays exactly on the part while you scroll and follows it when the page changes, with about 40% less work for the browser while scrolling.

### Deep
The bright window now stays exactly on the part while you scroll (it trailed by about 23 px on a phone-size screen, up to 103 px, and about 15 px, up to 100 px, on a desktop screen before) and the browser does about 40 to 48% less work while scrolling (phone 125 to 75 ms per second, desktop 146 to 76) and about 89 to 94% less drawing work (phone 71 to 8, desktop 97 to 6), measured in Chromium 155 only. It now follows the part when the page reflows (a part that moved 200 px used to leave the window 200 px behind) and scrolls a part inside a scrolling box into view (it never did before). It is now a native dialog, so the card cannot be covered by a page's own pop-ups and the page behind cannot take keyboard focus; tour.element is now a dialog and its open state is element.open. The minified file grows from 7.3 KB to 8.1 KB (3.3 KB to 3.6 KB gzipped), about 10% more.

## 1.0.0 · API 1 · 2026-10-17

### Quick
New module: a short first-time tour of a page with a bright window over each part and Skip, Back and Next buttons. New visitors see it once.

### Deep
New module, cut from Apple Press's first-time tour. A short tour of a page: one dimmed layer, a bright window over the current part (measured live, follows scrolling), a card with Skip, Back and Next. New visitors see it once; the address `#tour` forces it for testing; Escape skips. "Seen" and "gift given" are remembered separately, so only people who finish get the gift, once, even if they take the tour twice. Changed from the Apple Press original: the game's steps and gift are options (`steps`, `onGift`), steps can be selectors, elements or functions, and the placing maths is exported as `layout` with 5 checks. 11.4 KB including its own style (4.4 KB gzipped); driver.js 1.10.1 is 26.9 KB plus a stylesheet, and Shepherd.js and Intro.js are licensed AGPL-3.0. Real-browser check in Firefox 158 and ungoogled Chromium 155: opens once, window over the part, Back, Skip, Escape, Tab, `#tour`, gift once, scrolling to a far part, blocked storage.
