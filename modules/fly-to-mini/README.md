# fly-to-mini

**Version 1.2.0 · API 1**

**Tested in:** 33 Node checks; the demo ran clean in Chromium 141, Chromium 153 and Firefox 157. Not run: Firefox 158, ungoogled Chromium 155, WebKitGTK, a phone.

## What it is and how it works

When a big element scrolls away, a copy of its small stand-in flies to the sticky mini version, and back when you scroll up. About 3.1 KB gzipped.

- `IntersectionObserver` notices when the big element leaves the screen.
- A clone flies along an arc with a tilt and squash, frame by frame.
- Timers and a failsafe make sure it always lands, then `onChange` shows the mini.

## Why it exists

A big picture and its small sticky copy should feel like one object. Without a flight, one just vanishes and the other appears, and the browser's built-in transitions do not fly to a separately placed sticky element.

**Where it helps**

- A game's mascot that moves into the top bar.
- A product image that shrinks into a sticky header.
- Any big-to-small handoff while scrolling.

**Not for:** more than one pair per instance.

## Use

Copy `fly-to-mini.js` (keep the MIT header). No dependencies.

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
#mini { display: none }  #bar.mini-on #mini { display: block }   /* display:none works, see "Hidden mini" */
```

Try `demo.html` (add `?engine=transition` to its address for the View Transitions engine). Checks: `node modules/fly-to-mini/test/run.js` (a fake DOM in Node, 33 checks).

## API

`FlyToMini.create(options)` returns `{ set(on, animate), stop(), alert(), destroy(), isMini }`. `set` moves to a state yourself (`animate` false skips the flight), `stop()` ends a flight where it is and removes the copy, `destroy()` also stops watching and clears every timer.

| Option | Default | What it does |
|---|---|---|
| `big`, `mini` | required | The big element (flight starts when less than half of it is visible) and the small sticky stand-in (may be hidden with `display:none`, `visibility:hidden` or opacity) |
| `onChange(on)` | none | Show or hide the mini for real (see "Hidden mini" for when it is called) |
| `art` | `big` | Element measured as the start and end of the flight (a child of `big` if the art does not fill it) |
| `content` | the mini's first child | Element that is cloned and flown; give it a self-contained look |
| `host` | `document.body` | Where the flying copy's fixed layer goes |
| `bar` | none | Your sticky bar. Its height sets the covered line and it is watched with `ResizeObserver` where it exists. Beats `topInset` |
| `topInset` | 130 | Pixels at the top counted as covered. 130 suits one specific game; set your own bar height (the demo uses 56). `0` means none |
| `onVisible(ratio)` | none | Called with how much of `big` shows below the covered line (0 to 1) on every report. An error thrown inside is printed and ignored |
| `steps` | none | Extra ratios between 0 and 1 for `onVisible` (for example `[0.25, 0.75]`); 0, 0.5 and 1 are always reported |
| `hysteresis` | 0 | Come back only above half plus this margin (`0.1` means 60%); stops flights starting back and forth at the edge. Capped at 0.4 |
| `keepFocus` | off | If the button about to hide had keyboard focus, move focus to the one showing. Focus elsewhere is left alone |
| `reducedFade` | off | Where the flight is skipped, fade the arriving element in over 150 ms. Not used on the very first report |
| `canAnimate()` | reduced-motion check | Return false to skip the flight (the state still changes). Your function replaces the default, so include the reduced-motion check yourself |
| `downMs` / `upMs` | 440 / 400 | Flight lengths |
| `arc` | 18 | Pixels the copy rises on its way |
| `alertGapMs` / `alertMs` | 3500 / 1800 | For `alert()`: shortest time between alerts, and how long `.mini-alert` stays on (1200 ms longer when animation is off) |
| `engine` | `'flight'` | `'transition'` lets the browser's View Transitions API do the move; where `document.startViewTransition` is missing it uses the flight |
| `transitionName` | `'fly-to-mini'` | The `view-transition-name`; only letters, digits, `_` and `-` are kept |

**Hook classes** (the module sets no styles on them): `.flying` on `big` while its copy is in the air, `.mini-fly` the flying copy's layer, `.landed` on the element reached for 400 ms, `.mini-alert` on the mini from `alert()`. `alert()` returns false and does nothing while the mini is not showing, a flight is in the air, the page is hidden, or within `alertGapMs` of the last alert.

**Hidden mini.** With `display:none` the mini has no size to measure. On the way down the module calls `onChange(true)` at the start, makes the mini invisible with an inline `visibility:hidden`, measures it, and removes that style when the copy lands; so `onChange(true)` arrives at the start of the flight and again at the end. If the mini is laid out and only invisible, `onChange(false)` arrives at the start and `onChange(true)` at the end. If it still has no size after `onChange(true)` there is no flight and the state just changes. Guard anything in your callback that must happen only once (a sound, a counter).

**View Transitions engine (`engine: 'transition'`, off by default).** The module gives the big art and the mini's picture the same `view-transition-name`, the browser morphs one into the other, and the module adds the arc, tilt and squash on top (through `rotate`, `translate` and `scale`). No flying copy is made. Trade-offs:
- While it plays (about 0.4 s) the page is a frozen picture and cannot be scrolled or tapped; the flight leaves the page alive.
- It does not follow a mini that moves while the page scrolls; the flight re-reads the target every frame.
- The browser only captures what is on screen: after a long jump at once (a script scroll, not a swipe) the mini simply appears.
- Do not hide the big art with `.flying` for this engine. One transition runs at a time; the final state is always the last direction asked for.
- Measured so far: the mechanics in Chromium 141 and in a fake-DOM test. The look of the move has not been judged by eye on a phone or in Firefox 144+.

**Safety.** A timer lands the copy a little after the planned time even if the browser stops sending frames. If a frame throws (an element was removed), the copy lands at once and `flying` is removed, so the big art is never left invisible. `create()` with a missing element, or with no window (plain Node), returns an inert object: `set()` just reports to `onChange`, nothing throws. An error thrown by your `onChange` is printed and does not stop a landing. The copy is drawn in a fixed layer on the page, not inside a section the browser may skip (`content-visibility`, hidden tabs). A flight cut short by scrolling back starts the next one where the last stopped; if the window becomes wide and the mini disappears, the flight ends at once.

## How it compares

Larger than the two built-in options, which ship no code, but they do different jobs: neither flies a copy to a separately placed sticky mini as the page scrolls. Speed in browsers: not measured.

| Alternative | Size (smaller is better) | Where it wins / loses |
|---|---|---|
| View Transitions API (built in; Chrome 111+, Firefox 144+) | 0 bytes | Wins: nothing to ship, and the browser draws it (available here as `engine: 'transition'`). Loses: the page is a frozen picture while it plays, one transition at a time, and it does not follow a sticky target that keeps moving |
| CSS scroll-driven animations (`animation-timeline: scroll()` / `view()`; built in) | 0 bytes | Wins: no JavaScript, excellent for shrinking headers. Loses: one element animates along its own path; it cannot hop to a separately placed element. Firefox support differed when this was written |
| FLIP: [flip-toolkit](https://github.com/aholachek/flip-toolkit) (MIT); GSAP Flip (not open source); versions not checked | not measured | Wins on layout changes. Loses: not built for a scroll-triggered flight to a target that appears and disappears |
| **fly-to-mini 1.2.0** | 7.4 KB minified, 3.1 KB gzipped | Arc, tilt and squash; follows a moving mini; failsafe timers; reduced-motion fade; optional View Transitions engine |

Where it loses: it is code you ship where the two built-in options ship none; one pair of elements per instance; the View Transitions engine freezes the page while it plays; not tested on phones. Not measured: speed in any browser, and the sizes of the other libraries.

## What it is not

- One pair of elements per instance.
- The mini's first child (or `content`) is cloned. Since 1.2.0 the copy loses its `id` attributes and each `<canvas>` in it gets a still picture of the original's current pixels (WebGL canvases created without `preserveDrawingBuffer` may copy blank). Style the part that flies with classes.
- Reduced motion skips the flight; turn on `reducedFade` for a short fade.
- The "away" line is half visible. With `hysteresis` at 0, jittery scrolling at the edge can start flights back and forth (interrupted flights resume from where they were, so it only looks busy).
- Without `keepFocus`, focus on a button that your `onChange` hides is lost.
- Needs `IntersectionObserver` and `requestAnimationFrame`. Without `IntersectionObserver` it calls `onChange(true)` once and never flies.
- Tested with a fake DOM in Node and with the demo in Chromium (both engines). Not measured on phones.

## See it in action

Used right now in [Apple Press](https://lfcfoundry.github.io/apple-press/play/). Checked in each app's shipped file on its main branch on 2026.10.29. The module's own page is `demo.html` in this folder.

## For AI agents

- Wire it with `big`, `mini`, `bar` (or `topInset` as a number) and an `onChange` that toggles a class on the bar. `hysteresis: 0.1`, `keepFocus: true` and `reducedFade: true` are good additions for a game. Add the CSS `.flying .your-art { opacity: 0 }`.
- It can be `require`d in Node; `create()` returns an inert object there.
- Hide the mini with `display:none` or `visibility:hidden`; both work. Do not add your own reduced-motion check unless you pass `canAnimate`.
- Do not build a second timer or try/catch around it; the failsafe is inside.

## Prior art and credits

No code from others; the ideas below are theirs.

- **View Transitions API** (built in, Chrome 111+, Firefox 144+): used as the optional engine. It is one transition at a time and the page waits on your update callback; it does not follow a sticky target that keeps moving. Good for a state change you trigger; this module reacts to scroll position.
- **CSS scroll-driven animations** (`animation-timeline: scroll()` / `view()`): compared as an idea; they cannot land a copy on a separately placed sticky mini. Browser support differed in Firefox when this was written, so check before relying on it.
- **FLIP** ([flip-toolkit](https://github.com/aholachek/flip-toolkit), MIT; GSAP Flip, not open source): the technique of recording before and after positions, used or compared as an idea; no code from flip-toolkit or GSAP.
- `@container scroll-state(stuck)` could replace the "is the bar stuck" observation in CSS, in Chromium only at the time of writing.
- The module was cut from the games of the same maker (LFC Foundry); the 1.2.0 additions (`bar`, `onVisible` and `steps`, `hysteresis`, `keepFocus`, `reducedFade`, `alert()`, the `destroy()` timer fix) came from Apple Press's own copy of this code.

## Full research notes

The long version of this page (longer comparisons with the built-in options and FLIP libraries, the list of bugs found while building it, and the 1.2.0 change notes) is kept in the project's private knowledge base. The changelog is `CHANGELOG.md` in this folder.
