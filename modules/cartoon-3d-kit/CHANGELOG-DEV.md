# cartoon-3d-kit developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.3.0 · API 1 · 2026-10-24

### Quick
Many characters on screen: heroes scrolled out of view can now stop their idle animation (guide section 3.11), about 17 to 30% less browser work for a crowd of 48 to 96.

### Deep
Shipped in JS-modules PR 161 (merged 2026-10-24).
New optional recipe, no change for anyone who does not use it: pause the idle animation of heroes that scroll out of view with one IntersectionObserver and a paused-animation class. crowd-demo.html takes pause=1 in its address. Measured in Chromium 155 headless, 412 x 892 screen, median of three 5-second runs, browser work per second (lower is better): 12 heroes all in view 160 ms against 163 ms (no change), 48 heroes with 24 in view 267 against 222 ms (17% less), 96 heroes with 24 in view 375 against 264 ms (30% less). Firefox 158 and WebKitGTK 2.52.6 checked for behavior only (out-of-view heroes paused, in-view ones playing), no cost numbers there. No game uses the kit yet.

### 2026-10-24 · no version change · JS-modules PR 162
Comment and message text only in a test file (test/crowd-check.js usage line): GNOME Web is no longer named as a test browser there. No code or behavior change; Node checks pass.

## 1.2.0 · API 1 · 2026-10-17

### Quick
New optional way to show crowds: draw many characters once onto one canvas, which can cut the browser's work at lower frame rates. The guide has the recipe.

### Deep
New optional path for crowds: crowd-demo.html draws 1, 12 or 48 heroes either as live page copies or baked once onto one canvas, keeping bob, aura, blink and wiggle in both, and the guide gets section 3.11 (Baked crowds) with the recipe. Measured in Chromium 155 (headless, median of three 5-second runs, browser work per second): 12 heroes 191 ms live, 182 ms baked at 60 per second (about the same, no gain), 117 ms baked at 30 per second (39% less); 48 heroes 346 ms live, 357 ms baked at 60 per second (3% more), 227 ms baked at 30 per second (34% less). So the gain comes only from drawing at 30 per second; it also gives up eye-following, tap squash, pop number and confetti, which would have to be drawn by hand. Not measured on phones. The test grew from 82 to 105 checks (it now also checks the crowd page's skin colors against the guide table), and two scripts joined test/: crowd-check.js (one real browser) and cost-crowd.js (the timing).

## 1.1.0 · API 1 · 2026-10-17

### Quick
The +1 numbers that float up on a tap are now easy to read on the light page in every skin. The guide has new sections on many characters on one screen.

### Deep
Pop numbers (the +1 that floats up on a tap) now have their own color per skin, so they can be read on the light page: 10 of 10 skins are at 3:1 contrast or better, up from 2 of 10 (only Red and Crimson were); Yellow is the weakest at 3.03:1. In dark mode the pop keeps the glow color (every skin 3.0:1 or better). The demo's Violet glow now matches the guide (it showed light blue #7dd3fc, the guide says #9a7cf5). The guide gained a skin-table column for pop and a new section 3.10, Many characters on one screen, with measured numbers from one test browser (1 hero about 78 ms of browser work per second, 12 about 272, 48 about 644, animations off about 4) and what to pause or drop. The test grew from 38 to 82 checks: it now fails on a pop number under 3:1 on the light panel or demo sky or a glow under 3:1 on the dark panel, and on any difference between the demo's skin colors and the guide's table (0 differences now, 1 before).

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
