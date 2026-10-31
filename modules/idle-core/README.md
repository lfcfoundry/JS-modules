# idle-core

**Version 1.2.0 · API 1**

**Tested in:** Firefox 158.0, ungoogled Chromium 155.0.8059.39-1, WebKitGTK 2.52.6 and GNOME Web 46.5, one at a time, in a same-answers run of one fixed set of calls (tests/idle-core-browser.js, readable and minified file); 37 Node checks (8 new).

## What it is and how it works

The small math every idle or clicker game needs, tested. 3.2 KB gzipped as `idle-core.min.js`, pure functions.

- Prices grow by a rate per copy owned, rounded up.
- "Buy 10" and "buy max" are one closed-form calculation, not a loop.
- Time away pays a capped share of normal income, from a wall-clock gap.

## Why it exists

Idle-game math is usually copied from blog posts and fixed again and again. The edges hurt: offline time that pays too much, boosts that stack into a runaway, a display that shows `1000M` or `NaN`. These are covered by tests here.

**Where it helps**

- Prices, bulk buys and offline earnings in idle games.
- Number formatting for very large values.
- Boost timers that cannot stack by mistake.

**Not for:** saving, drawing or timing; it is pure math.

## Use

Copy `idle-core.js` (or `idle-core.min.js`, same answers) with its MIT header. It gives `window.IdleCore`, or `require` it in Node.

```js
IdleCore.upgradeCost(15, 15, 3);            // 23
IdleCore.costOfMany(15, 15, 3, 10);         // price of 10 more copies, with 3 owned
IdleCore.maxAffordable(15, 15, 3, 5000);    // how many of them 5,000 buys
IdleCore.buyPlan(15, 15, 3, 1, 5000, 'max');  // { n, total, can }: the Max button, capped at 100 copies
IdleCore.etaSec(5000, 1200, 40);            // 95 s until a 5,000 price is covered at 40 a second
IdleCore.prestigeGain(1e15, 1e12, 3);       // 10 points (Cookie Clicker curve)
IdleCore.tickEarnings(7200, { percent: 50 }); // about 3,600 s of income (5 s at full speed + the rest at 50%), not 7,200
const q = IdleCore.BoostQueue({ double: { secs: 20, max: 60 }, auto: { secs: 20, max: 60 } });
q.give('double'); q.give('auto');   // 'double' runs, 'auto' waits its turn
q.tick(1);                          // counts down the running boost
```

Away time uses the wall clock (`performance.now()` loses a sleeping laptop's gap outside Windows; `Date.now()` keeps counting but the player can change it):

```js
const clock = IdleCore.awayClock({ capSec: 8 * 3600 });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save.stamp = clock.hide();                       // store the stamp in your save as well
  else { const away = clock.show(); game.add(IdleCore.awayEarnings(game.rate, away)); }
});
const awayOnLoad = clock.since(save.stamp);   // phones may close a hidden page with no event at all
```

Try `demo.html`. Checks: `node modules/idle-core/test/run.js` (Node only, 37 checks; pass a file path to check another copy, for example `modules/idle-core/idle-core.min.js`). `node tests/idle-core-browser.js` runs one fixed set of calls in Node and a real browser and compares the answers for the readable and minified file (`CHROMIUM=...`, `FIREFOX=...` or `WEBKIT=1`, one browser at a time). Counts, text and formatting were identical in every browser. Prices of about 1e9 and up differ in the last coin between engines because `Math.pow` is not the same everywhere: Node 22, Chromium 155 and Firefox 158 are within 3e-16 of exact, WebKitGTK 2.52.6 and GNOME Web within 3e-14 (measured on 4,200 powers).

## Functions

`risePct` is a percent number (15 means each copy costs 15% more than the last); pass the same number to all of them.

| Function | What it does |
|---|---|
| `upgradeCost(base, risePct, owned, discount)` | price of the next copy, rounded up (floating-point noise forgiven: `upgradeCost(100, 10, 2)` is 121) |
| `costOfMany(base, risePct, owned, n, discount)` | price of the next `n` copies in one closed-form sum, rounded up once |
| `maxAffordable(base, risePct, owned, money, discount)` | how many copies the money buys; 0 when nothing is affordable or the copies are free |
| `buyPlan(base, risePct, owned, discount, money, mode, cap)` | the Buy x1 / x10 / Max switch: `{ n, total, can }` |
| `etaSec(cost, money, ratePerSec)` | seconds until the money covers the cost (0 now, `Infinity` with no income) |
| `paybackSec(cost, rateGain)` | seconds of the extra income needed to earn the cost back; lower is the better buy |
| `prestigeGain(lifetime, scale, root, mult)` / `prestigeNeeded(points, scale, root, mult)` | prestige points `floor(mult * (lifetime / scale) ^ (1 / root))`, and the lifetime total at which a number of points is first earned |
| `fastForward(step, secs, opts)` | runs your own `step(dt)` over a long gap in chunks (default 5 s), stopping at a time budget (default 100 ms): `{ simulated, skipped }` |
| `milestoneMult(owned, [10,25,50])` / `milestoneLeft` | each copy's output doubles at 10, 25, 50 owned (x8) |
| `RateBook(computeFn)` | memoized rates, recomputed only after `invalidate()`; NaN and Infinity are cleaned out of a cleaned copy |
| `tickEarnings(dt, opts)` | a long gap (frozen phone, hidden tab) counts at the away percent and is capped. `opts.graceSec` (default 5) is how long a tick can be before it counts as time away |
| `awayEarnings(rate, awaySec, opts)` | income while away: percent of normal speed (clamped to 0..100; a non-number means 50), capped (default 8 h) |
| `awayClock(opts)` | the gap between hiding the page and coming back, from `Date.now()`; a negative gap or one over `maxSec` (default 30 days) counts as 0, anything else is capped (default 8 h) |
| `BoostQueue(caps, saved)` | timed multipliers that never overlap: one runs, the others wait in the order given; a long step carries its leftover into the next boost |
| `stageIndex` / `stageProgress` | which stage a total belongs to, and 0..1 through it |
| `formatBig` / `formatRate` / `formatTime` | `1,234`, `1.5M`, `2.25B` ... `1Sx`, `1.23e24`; never `1000M` or `1000Sx`; rates show one decimal, two below 1 (`0.04`); `2h 13m`, `4d 15h`. No `Intl`, so the first call costs nothing |
| `safe(n, fallback)` | `n` when it is a finite number (or text such as `'12'`), else the fallback (default 0) |

**Numbers stay numbers.** Costs, rates and away income never come back as `Infinity` or `NaN`: a value past `IdleCore.LIMIT` (1e300) is held at the limit, NaN becomes 0, and a broken input becomes a harmless default (save-kit refuses to write such numbers).

**Buy many, buy max.** The `costOfMany` bundle is rounded up once, so it can be up to `n` cheaper than `n` single `upgradeCost` prices. Charge the bundle price for "buy 10"; do not also charge each copy. `maxAffordable` is the largest `n` with `costOfMany(...) <= money`.

**`buyPlan`.** `mode` is `1`, `10` (any count), `'10'` or `'max'` in any case; text that is not a number means 1. A count buys exactly that many and says `can: false` when the money falls short. `'max'` never buys more than `cap` (default 100); with money for none it points at one copy and says `can: false`, so the button can still show a price. `total` is the sum of single prices, each rounded up, which is what pressing x1 ten times costs. In 540 cases (5 base prices, 4 rises, 3 discounts, 3 starting counts, 3 sizes) `buyPlan` matched buying one at a time in all 540; `costOfMany` differed in 421, by up to 56. Do not mix `maxAffordable` and `buyPlan` Max in one game: over 3,240 cases they gave a different count in 217 (6.7%). Keep the player's x1 / x10 / Max choice yourself (Apple Press keeps it in `localStorage`).

**Planning.** Lowest `paybackSec` is the best buy, which is what an auto-buyer picks. `prestigeGain`: Cookie Clicker is `scale` 1e12, `root` 3; AdVenture Capitalist is `scale` 1e15, `root` 2, `mult` 150; Egg Inc is `root` 1/0.14 (about 7.1). Cube roots land a hair under a whole number (9.99999... floors to 9), so it adds 1e-9 before flooring: without it 4,698 of 15,000 round trips came back right, with it all 15,000.

**`fastForward`.** A flat away percent under-pays a game that auto-buys while you are away: in a test five-tier economy a flat 50% paid 2% of the real amount after 30 minutes and 0.2% after 8 hours. Use `IdleCore.fastForward(dt => game.step(dt), awaySec)` and pay the `skipped` part with `awayEarnings`; `{ chunk, budgetMs }` change the 5 s and 100 ms. Bigger chunks over-pay; against 1 s steps, 5 s chunks were +0.9%, 30 s +5.5%, 120 s +13.2%, 600 s +25.0%. Eight hours in 5 s chunks took 4 ms (28,800 steps of 1 s took 25 ms).

## How it compares

idle-core is a small set of tested formulas, not a big-number library or a formatting library. It sits between writing the formulas yourself (smallest, but easy to get an edge wrong) and a big-number package (much bigger numbers, a different job). This module: `idle-core.min.js` is 7,530 bytes (3,178 gzipped); the readable file is 23,296 bytes.

| Alternative | Size (smaller is better) | Speed | Where it wins / loses |
|---|---|---|---|
| Hand-written formulas from blog posts ("The Math of Idle Games") | Smallest (your own few lines) | Not measured | Wins on size. Loses on the edges this module's tests cover (text numbers from a form, a frozen object, a long gap giving free boost time, `1000M`) |
| `Intl.NumberFormat` (built in) | Nothing to ship | Plain grouping, `format(12345)` (lower is better): 383 ns in ungoogled Chromium 155, 240 ns in Firefox 158, 400 ns in WebKitGTK 2.52.6; this module's grouping code: 41, 80 and 60 ns (the candidate code; the shipped function itself: not timed in browsers). The first `Intl.NumberFormat` costs 12 to 13 ms in Chromium 155 on a fresh page | Intl wins on real locale support and size; its compact notation stops at T (1e15 reads `1000T`). This module wins on speed for plain grouping, has no start-up cost, and has suffixes up to `Sx` |
| [break_infinity.js](https://github.com/Patashu/break_infinity.js) (version and license: not read) and break_eternity.js | Not measured | Its page reports 2 to 16,666 times faster than decimal.js on single operations (self-reported, not checked here); against idle-core: not measured | They win whenever your numbers pass 1e300 (up to about 1e9e15); this module holds values at 1e300 |

Where it loses: not a big-number library or a locale library; away income is one multiplication (`fastForward` replays your own step instead); prices use floating point. Speed against other formula collections and against break_infinity.js: not measured.

## What it is not

- Pure maths: no storage, no rendering, no timers. You call `tick` and save the state yourself.
- Numbers beyond 1e21 are shown in exponent form; anything past 1e300 is held at 1e300.
- Floating-point prices: from about 1e12 a price can be a coin or two under the exact one (10 of 435 sampled cases at 1e12 and up), because noise below 1e-13 of the price is forgiven; from about 1e9 two browsers can disagree by a coin. `buyPlan` totals can differ from buying one at a time by up to about 2e-12 of the total above 1e12 (in 600,000 cases the number of copies and `can` always matched).
- `awayClock` trusts `Date.now()`, which the player can change. The cap limits the gain (one cap's worth each time the clock is moved forward); it does not stop it.
- `formatBig` floors the number and shows `0` for NaN; `formatTime` shows `0 sec` for NaN or negative input; `formatRate` rounds to two decimals below 1, so `0.004` shows `0`.
- `BoostQueue.tick` returns `ended` (the first boost that ran out), `endedAll` (all of them) and `started` (the boost that began in this step and still runs). Its state carries an `order` list; older states, or `{}`, are repaired on load.
- `RateBook` hands back a cleaned copy, so it does not keep the identity or prototype of what `compute()` returned.

## For AI agents

- Use `upgradeCost` for one copy, `costOfMany` for a bundle, `buyPlan` for a Buy x1 / x10 / Max button (`maxAffordable` only if you charge the bundle price). Do not mix `maxAffordable` and `buyPlan` Max. Pass `risePct` as 15, not 1.15.
- Every function is pure except `RateBook`, `BoostQueue` and `awayClock`. None throws on bad input; do not add your own NaN checks. If a value is wrong, fix the input and add a check to `modules/idle-core/test/run.js`.
- Feed `tickEarnings` the seconds since the last frame, and `awayEarnings` / `awayClock` the wall-clock gap from `Date.now()`, never `performance.now()`, for gaps of minutes or more. Use `fastForward` only with a cheap step function that has no side effects on the screen.
- Keep the `BoostQueue` `state` object in your save and pass it back as the second argument on load. Do not edit `state.order` by hand.
- Rebuild the minified file with `TERSER=/path/to/terser node modules/idle-core/test/make-min.js` after any change. For numbers past 1e300 pick a big-number library.

## Prior art and credits

No code from others; the ideas below are theirs. Nothing here is new maths: it is the same few formulas, with the edges tested. Written for LFC Foundry's own games; the Buy x1 / x10 / Max switch (`buyPlan`) was cut from Apple Press, where it has run since October.

- **Kongregate, "The Math of Idle Games" (Anthony Pecorella; [part I](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i) and [part III](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii)):** formulas and ideas only, no code. The price formula and the bulk-buy and max-affordable sums come from it. The price rule "round up" matches how the Cookie Clicker wiki describes building prices.
- **Prestige curves** (same article): Realm Grinder, AdVenture Capitalist (150 times the square root of lifetime / 1e15), Cookie Clicker (cube root of lifetime / 1e12) and Egg Inc (power 0.14); `prestigeGain` covers them with one formula. Used as published, no code taken.
- **Offline progress:** some games (Clicker Heroes describes this in its blog post) replay the away time step by step. `awayEarnings` is the simple version; `fastForward` is the replay version, with a time budget. Idea only.
- **[break_infinity.js](https://github.com/Patashu/break_infinity.js) and break_eternity.js:** big numbers past 1e308; compared only.
- **Number words:** `Intl.NumberFormat` compact notation stops at `T`, so suffixes are by hand. The thousands separators give the same text as `Intl` in 4,000,000 numbers compared, and avoid the cost of the first `Intl.NumberFormat` on a fresh page (Chromium 12 to 13 ms, Firefox 3 ms, WebKitGTK 12 ms).
- The MDN note on `performance.now()` and sleep is the reason `awayClock` uses `Date.now()`. Documentation read, nothing copied.

## Full research notes

The long version of this page (the list of audit defects each check reproduces, longer worked explanations of rounding and the buy switch, and the full wording of every limit) is kept in the project's private knowledge base. The changelog is `CHANGELOG.md` in this folder.
