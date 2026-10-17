# spotlight-tour

**Version 1.0.0 · API 1**

**Tested in:** Node checks where the piece has any; Firefox 158, ungoogled Chromium 155 and WebKitGTK 2.52.6, one at a time, in a real browser (`tests/pieces-browser.js`, 2026-10-17; WebKitGTK 2.52.6 through `tools/webkit-driver`; key down/up and touch were sent as page events or the mouse). Not run: GNOME Web (Epiphany) 46.5, a phone.

A short guided look at the parts of a page: one dimmed layer, one bright window over the current part (measured live, so it follows scrolling and resizing), and a card beside it with Skip, Back and Next. It remembers that a visitor has seen it, and it can hand out a finishing gift once, only to people who reach the end. 11.4 KB including its own stylesheet (4.4 KB gzipped), no dependencies. Cut from Apple Press's first-time tour, with the game's own steps taken out.

**Test it:** `node modules/spotlight-tour/test/run.js` (5 checks on where the window and card go) and `node tests/pieces-browser.js` (the whole tour in Firefox 158 and ungoogled Chromium 155: opens once, window over the part, Back, Skip, Escape, Tab, `#tour`, the gift, scrolling to a far part, blocked storage). **Try it:** `demo.html`.

## Use
```js
var tour = SpotlightTour.create({
  key: "mygame-tour",              // remembers "seen" (localStorage)
  giftKey: "mygame-tourgift",      // remembers "gift given", separately
  steps: [
    { title: "Welcome!", text: "This is a short look around.", button: "Show me!" },     // no target: a centered card, no window
    { target: "#bigButton", title: "The big button", text: "Tap it." },                  // a selector, an element, or a function that finds it
    { target: function () { return firstUpgrade(); }, title: "Upgrades", text: "These make your game better." },
    { title: "Ready?", text: "Now go and play!", button: "Let's go!" }
  ],
  onGift: function () { giveTheGift(); }
});
tour.maybeStart();      // once for a new visitor; always when the address ends in #tour; never for an address matching blockHash
tour.start();           // always (a "Show me around" button)
```
- **Steps** can also be a function that returns the list when the tour starts, so the text can use live numbers. The first step is a welcome without a step number ("Step 1 of 5" counts from the second step; `welcome: false` numbers every step). `Back` shows from the third step on, so nobody goes back into the welcome.
- **Seen and gift are remembered separately.** Closing the tour any way (Skip, Escape, finishing) marks it seen. Only finishing gives the gift, once per browser: `onGift` runs `giftDelayMs` (700) after the tour closes, and never again, even if the visitor takes the tour twice. `tour.reset()` forgets "seen", `tour.reset('gift')` forgets the gift and `tour.reset('all')` both.
- **`maybeStart` options:** `autoStart()` (return false to hold it back, for example for a player with a saved game), `forceHash` (default `#tour`, for testing), `blockHash` (a RegExp of addresses that must never show it).
- **Other options:** `texts` (`next`, `back`, `skip`, `welcome`, `done`, `step(i, n)`), `topOffset` (room for a sticky bar when scrolling a tall part into view, default 120), `scroll: false`, `still` (true to turn the sliding off; it is off already for "reduce motion"), `onStep(i, step)`, `onClose(finished)`, `storage`, `root`.
- **Methods:** `start`, `maybeStart`, `seen`, `giftGiven`, `reset`, `isOpen`, `goTo(n)`, `close`, `destroy`.
- **Keyboard:** Escape skips; Tab stays on the card's buttons; focus goes back to what had it when the tour closes. The card is a labelled modal dialog. Colors come from `--stt-bg`, `--stt-text`, `--stt-accent` and follow the dark color scheme.
- `SpotlightTour.layout(targetBox, cardSize, viewSize, margin)` is the placing maths on its own: the card goes below the part, else above it, else at the bottom with the window shrunk to fit above it; a part with less than 20 pixels showing counts as no part.

## Why
A first visit is the one time you can explain a page, and a long tour gets skipped. Remembering "seen" apart from "gift given" lets the tour come back on request without handing out the gift twice, and keeps the gift for people who finished. The `#tour` address lets a test force the tour without clearing storage.

## Limits
- One tour at a time; it does not stack with other pop-ups, so close yours before starting it.
- The bright window is a rectangle around the part's box (6 pixels larger), and the part itself cannot be clicked while the tour is open.
- A part inside a scrolling box (not the page) is not scrolled into view; only page scrolling is done.
- Text is set as plain text (`textContent`), so no HTML or links inside steps.
- Not tried with a screen reader or on a real phone.

## Prior art
- [driver.js](https://github.com/kamranahmedse/driver.js) (MIT, 1.10.1): the closest match: a small, well-liked highlighter and tour library, 26.9 KB as one script (7.7 KB gzipped) plus a 1 KB (gzipped) stylesheet. It has more features (popover positioning, hints, a checklist). I did not check whether it remembers who has seen a tour or gives a finishing gift. Use it when you need those features.
- [Shepherd.js](https://github.com/shipshapecode/shepherd) 15.3.0 and [Intro.js](https://github.com/usablica/intro.js) 8.6.0 are the other well-known choices. Both are licensed **AGPL-3.0** on npm (checked 2026-10-17), which asks anyone who serves a modified or combined version over a network to publish the source; that does not fit a page you want to keep under MIT. Shepherd also pulls in two packages.
- This module is smaller and has the first-time pieces built in (seen, gift once, `#tour`); it has only what a short first-time tour needs.

## For AI agents
Write steps in plain words for the audience (a child's tour is short sentences). Give each step a `target` that exists when the step shows, or leave it out for a centered card. Wire `onGift` to the game's reward and let the module remember it; do not remember it yourself. Call `maybeStart` once after your title screen or first paint; use `autoStart` to keep it from interrupting a returning player.
