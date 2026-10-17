# fly-to-mini

**Version 1.2.0 · API 1**

**Tested in:** 33 Node checks; the demo ran clean in Chromium 141, Chromium 153 and Firefox 157. Not run: Firefox 158, ungoogled Chromium 155, WebKitGTK, a phone.

When a big element scrolls away, a copy of its small stand-in **flies** from it to the sticky mini version, and back again when you scroll up. A shared-element transition for scrolling, with an arc, a tilt and a squash. About 7.4 KB minified (3.1 KB gzipped); the commented source is about 18 KB.

## Quick start
```html
<script src="fly-to-mini.js"></script>
<script>
var fly = FlyToMini.create({
  big: document.querySelector('#apple'),         // watched with IntersectionObserver
  mini: document.querySelector('#miniButton'),   // small sticky version, hidden until `on`
  bar: document.querySelector('#bar'),           // your sticky bar; its height is measured and followed (or use topInset: 56)
  onChange: function (on) { bar.classList.toggle('mini-on', on); }
});
</script>
```
```css
.flying .ball { opacity: 0 }                     /* the big art hides while its copy is in the air */
.landed { animation: pop .4s ease-out }          /* optional: a small pop when a flight lands */
@keyframes pop { 40% { transform: scale(1.18) } }
#mini { display: none }  #bar.mini-on #mini { display: block }   /* display:none works, see below */
```

## API
`FlyToMini.create(options)` returns `{ set(on, animate), stop(), alert(), destroy(), isMini }`.

| Option | Default | What it does |
|---|---|---|
| `big` | required | The big element. Watched with `IntersectionObserver`; when less than half of it is visible the flight to the mini starts. |
| `mini` | required | The small sticky stand-in. May be hidden with `display:none`, `visibility:hidden` or opacity. |
| `onChange(on)` | none | Called to show or hide the mini for real. See "Hidden mini" for when it is called. |
| `art` | `big` | The element that is measured as the start and end of the flight (use a child of `big` if the art does not fill it). |
| `content` | the mini's first child | The element that is cloned and flown. Give it a self-contained look: it is drawn outside the mini. |
| `host` | `document.body` | Where the flying copy is placed (a fixed layer). |
| `topInset` | 130 | Pixels at the top of the window that count as covered, usually your sticky bar. The big element counts as "away" when less than half of it is visible below this line. 130 suits one specific game; set your own bar height (the demo uses 56). `0` means no inset. |
| `bar` | none | Your sticky bar as an element. The module measures its height for the "covered" line and watches the bar's size (with `ResizeObserver`, where it exists), so it stays right when the bar changes. Beats `topInset`. |
| `onVisible(ratio)` | none | Called with how much of `big` is visible below the covered line (0 to 1) on every report. Use it to pause effects when little of the scene shows. An error thrown inside is printed and ignored. |
| `steps` | none | A list of extra ratios between 0 and 1 at which `onVisible` should be called (for example `[0.25, 0.75]`). The module always reports at 0, 0.5 and 1. |
| `hysteresis` | 0 | Leave "away" at under half visible, but come back only above half plus this margin (for example `0.1` means 60%). Stops flights from starting back and forth when scrolling stops right at the edge. Capped at 0.4. |
| `keepFocus` | off | If the button that is about to hide had keyboard focus, move focus to the one that is showing once the move is done. Focus anywhere else is left alone. |
| `reducedFade` | off | Where the flight is skipped (reduced motion, or your `canAnimate` says no), fade the arriving element in over 150 ms instead of nothing. Not used on the very first report. |
| `alertGapMs` / `alertMs` | 3500 / 1800 | For `alert()`: the shortest time between two alerts, and how long the `.mini-alert` class stays on. When animation is off the class stays 1200 ms longer. |
| `canAnimate()` | reduced-motion check | Return false to skip the flight (the state still changes). The default returns false when the system asks for reduced motion. If you pass your own function, it replaces the default, so include that check yourself. |
| `downMs` / `upMs` | 440 / 400 | Flight lengths. |
| `arc` | 18 | Pixels the copy rises on its way. |
| `engine` | `'flight'` | `'transition'` lets the browser's View Transitions API do the move instead (see below). Where `document.startViewTransition` is missing it quietly uses the flight. |
| `transitionName` | `'fly-to-mini'` | The `view-transition-name` used by that engine. Only letters, digits, `_` and `-` are kept. Change it if your page already uses the name. |

**CSS class names the module uses.** `.mini-alert` is added to the mini by `alert()` (see below). `.flying` is added to `big` while its copy is in the air (hide the big art with it). `.mini-fly` is the flying copy's layer. `.landed` is added to the element that was reached, for 400 ms. The module sets no styles on these names; they are hooks for your CSS.

Methods: `set(on, animate)` moves to a state yourself (`animate` false skips the flight), `stop()` ends a flight where it is and removes the copy, `alert()` makes the mini draw attention (returns true if it did), `destroy()` also stops watching and clears every timer.

**`alert()`** adds the `.mini-alert` class to the mini for `alertMs`, so your CSS can glow or bounce it when something happens off screen. It does nothing (returns false) while the mini is not showing, while a flight is in the air, while the page is hidden, or within `alertGapMs` of the last alert. The module draws nothing itself; the demo has an example `@keyframes`.

## Optional View Transitions engine
`engine: 'transition'` hands the move to the browser. The module names the big art and the mini's picture with the same `view-transition-name`, the browser morphs one into the other, and the module adds the same arc, tilt and squash on top (through the `rotate`, `translate` and `scale` properties, which add to the browser's own transform). `downMs` and `upMs` still set the length. No flying copy is made, so there is less code running per frame.

Try it in the demo by adding `?engine=transition` to its address. It is **off by default** on purpose:
- While it plays, the whole page is a frozen picture (about 0.4 s), and the page cannot be scrolled or tapped. The flight leaves the page alive.
- It does not follow a mini that moves while the page scrolls; the flight re-reads the target every frame.
- The browser only captures what is on screen. If the page jumps a long way at once (a script scroll, not a swipe), the old picture is off screen and the mini simply appears.
- Do not hide the big art with `.flying` for this engine: the class is not added, and the new picture on the way up must be visible.
- One transition runs at a time. A new one retires the old one; the final state is always the last direction asked for.
- Measured so far: the mechanics in Chromium 141 (names set and cleared, the 440 ms move, the zigzag case) and in a fake-DOM test. The look of the move has not been judged by eye on a phone or in Firefox 144+.

## Hidden mini
With `display:none` the mini has no size, so the module cannot measure where to fly. On the way down it therefore calls `onChange(true)` right at the start (your code shows the mini), makes the mini invisible with an inline `visibility:hidden`, measures it, and removes that inline style when the copy lands. So in that case `onChange(true)` arrives at the start of the flight and again at the end. If the mini is kept laid out and only made invisible, `onChange(false)` arrives at the start (as before) and `onChange(true)` at the end. If the mini still has no size after `onChange(true)` (your CSS hides it at this window size), there is no flight and the state just changes. If your callback does something that must happen only once (a sound, a counter), guard it.

## Safety
- A timer lands the copy a little after the planned time, even if the browser stops sending frames (hidden tab, stalled page).
- If a frame throws (an element was removed), the copy lands at once, and the `flying` class is removed, so the big art is never left invisible.
- `create()` with a missing element, or with no window (plain Node), returns an inert object: `set()` just reports the state to `onChange`; nothing throws.
- An error thrown by your `onChange` is printed to the console and does not stop a landing.

## Details that took real bugs to find
- The flying copy is drawn in a **fixed layer on the page**, not inside a section the browser may skip (`content-visibility`, hidden tabs); the first version was invisible on the way down.
- A flight cut short by scrolling back starts the next one where the last one stopped.
- If the window becomes wide and the mini disappears, the flight ends at once.

## Limits
- One pair of elements per instance.
- The mini's first child (or `content`) is cloned. Since 1.2.0 the copy loses its `id` attributes and each `<canvas>` in it gets a still picture of the original's current pixels (WebGL canvases that were not created with `preserveDrawingBuffer` may copy blank). Style the part that flies with classes.
- Reduced motion skips the flight; turn on `reducedFade` for a short fade instead.
- The "away" line is half visible. With `hysteresis` left at 0, jittery scrolling right at the edge can start flights back and forth (interrupted flights resume from where they were, so it only looks busy).
- Focus: without `keepFocus`, focus on a button that your `onChange` hides is lost. With it, the module moves focus for you.
- Needs `IntersectionObserver` and `requestAnimationFrame`. Without `IntersectionObserver` it calls `onChange(true)` once and never flies.
- Tested with a fake DOM in Node (`test/run.js`) and with the demo in Chromium (both engines). Not measured on phones.

## What changed in 1.2.0
Nothing you already use behaves differently, except that the flying copy no longer carries duplicate `id` attributes and now shows canvas pictures. New and opt-in: `bar`, `onVisible` and `steps`, `hysteresis`, `keepFocus`, `reducedFade`, `alert()`. Fixed: `destroy()` now clears the landed-pop timers, and the newest observer report is used when several arrive at once. All of these came from the game Apple Press, which had its own copy of this code.

## Prior art
- **View Transitions API** (built in, Chrome 111+, Firefox 144+): morphs a named element between two page states. It is one transition at a time and the page waits on your update callback; it does not follow a sticky target that keeps moving while the page scrolls. Good for a state change you trigger; this module reacts to scroll position. It is available here as the optional `engine: 'transition'`, with the trade-offs listed above.
- **CSS scroll-driven animations** (`animation-timeline: scroll()` / `view()`): tie an animation to scroll position and are excellent for shrinking headers. One element animates along its own path; it cannot hop to a separately placed element, so it does not cover a copy that leaves the big art and lands on a sticky mini. Browser support differed in Firefox when this was written, so check before relying on it.
- **FLIP** ([flip-toolkit](https://github.com/aholachek/flip-toolkit), MIT; GSAP Flip, not open source): record the before and after positions and animate the difference. Built for layout changes, not for a scroll-triggered flight to a target that appears and disappears.
- `@container scroll-state(stuck)` could replace the "is the bar stuck" observation in CSS, in Chromium only at the time of writing.

## For AI agents
- Copy `fly-to-mini.js` (keep the MIT header). No dependencies. It can be `require`d in Node; `create()` returns an inert object there.
- Wire it with `big`, `mini`, `bar` (your sticky bar element; or `topInset` as a number) and an `onChange` that toggles a class on the bar. `hysteresis: 0.1`, `keepFocus: true` and `reducedFade: true` are good additions for a game. Add the CSS `.flying .your-art { opacity: 0 }`.
- Hide the mini with `display:none` or `visibility:hidden`; both work. Do not add your own reduced-motion check unless you pass `canAnimate`.
- Do not build a second timer or try/catch around it; the failsafe is inside. Node checks: `node modules/fly-to-mini/test/run.js`. The browser demo is `demo.html`.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
