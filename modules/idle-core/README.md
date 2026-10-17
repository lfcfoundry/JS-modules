# idle-core

**Version 1.2.0 · API 1**

**Tested in:** Firefox 158.0, ungoogled Chromium 155.0.8059.39-1, WebKitGTK 2.52.6 and GNOME Web 46.5, one at a time, in a same-answers run of one fixed set of calls (tests/idle-core-browser.js, readable and minified file); 37 Node checks (8 new).

The small maths every idle / clicker game ends up needing, tested. 23 KB readable (with its notes) or 7.5 KB as `idle-core.min.js` (3.2 KB gzip); pure functions (also runs in Node, no dependencies, ES5 syntax). The two files give the same answers.

| Function | What it does |
|---|---|
| `upgradeCost(base, risePct, owned, discount)` | price of the next copy, rounded up (floating-point noise forgiven: `upgradeCost(100, 10, 2)` is 121) |
| `costOfMany(base, risePct, owned, n, discount)` | price of the next `n` copies in one sum (the "buy 10" button) |
| `maxAffordable(base, risePct, owned, money, discount)` | how many copies the money buys (the "buy max" button) |
| `buyPlan(base, risePct, owned, discount, money, mode, cap)` | what a tap on a "Buy x1 / x10 / Max" switch does right now: `{ n, total, can }`. The price is the sum of single prices, so it matches buying one at a time; Max never buys more than `cap` (default 100). `mode` can be `10`, `'10'` or `'max'` in any case |
| `etaSec(cost, money, ratePerSec)` | seconds until the money covers the cost (0 now, `Infinity` with no income) |
| `paybackSec(cost, rateGain)` | seconds of the extra income needed to earn the cost back; lower is the better buy |
| `prestigeGain(lifetime, scale, root, mult)` / `prestigeNeeded(points, scale, root, mult)` | prestige points from a root curve, `floor(mult * (lifetime / scale) ^ (1 / root))`, and the lifetime total at which a number of points is first earned |
| `fastForward(step, secs, opts)` | runs your own `step(dt)` over a long gap in chunks (default 5 s) and stops at a time budget (default 100 ms): `{ simulated, skipped }` |
| `milestoneMult(owned, [10,25,50])` / `milestoneLeft` | each copy's output doubles at 10, 25, 50 owned (x8) |
| `RateBook(computeFn)` | memoized rates, recomputed only after `invalidate()`; NaN and Infinity are cleaned out of a cleaned copy (a frozen object is fine, yours is not changed) |
| `tickEarnings(dt, opts)` | a long gap (frozen phone, hidden tab) counts at the away percent and is capped, like reopening the game. `opts.graceSec` (default 5) is how long a tick can be before it counts as time away; `opts.percent` and `opts.capSec` as below |
| `awayEarnings(rate, awaySec, opts)` | income while away: percent of normal speed (clamped to 0..100), capped (default 8 h) |
| `awayClock(opts)` | the gap between hiding the page and coming back, measured with `Date.now()`; ignores backwards and impossible jumps |
| `BoostQueue(caps, saved)` | timed multipliers that never overlap: one runs, the others wait their turn, in the order they were given. A long step carries its leftover into the next boost |
| `stageIndex` / `stageProgress` | which stage a total belongs to, and 0..1 through it |
| `formatBig` / `formatRate` / `formatTime` | `1,234`, `1.5M`, `2.25B` ... `1Sx`, `1.23e24`; never prints `1000M` or `1000Sx`; rates show one decimal, two below 1 (`0.04`); `2h 13m`, `4d 15h`. No `Intl`, so the first call costs nothing |
| `safe(n, fallback)` | `n` when it is a finite number (or text such as `'12'`), else the fallback (default 0) |

```js
IdleCore.upgradeCost(15, 15, 3);            // 23
IdleCore.costOfMany(15, 15, 3, 10);         // price of 10 more copies, with 3 owned
IdleCore.maxAffordable(15, 15, 3, 5000);    // how many of them 5,000 buys
IdleCore.buyPlan(15, 15, 3, 1, 5000, 'max');  // { n, total, can }: the Max button, capped at 100 copies
IdleCore.etaSec(5000, 1200, 40);            // 95 s until a 5,000 price is covered at 40 a second
IdleCore.prestigeGain(1e15, 1e12, 3);       // 10 points on the Cookie Clicker curve (cube root of lifetime / 1e12)
IdleCore.tickEarnings(7200, { percent: 50 }); // about 3,600 s of income (5 s at full speed + the rest at 50%), not 7,200
const q = IdleCore.BoostQueue({ double: { secs: 20, max: 60 }, auto: { secs: 20, max: 60 } });
q.give('double'); q.give('auto');   // 'double' runs, 'auto' waits its turn
q.tick(1);                          // counts down the running boost
```

## Buy many, buy max
`risePct` is the same percent number `upgradeCost` takes (15 means each copy costs 15% more than the last). The sums use the closed form `first * (r^n - 1) / (r - 1)` with `r = 1 + risePct / 100`, so a "buy 10,000" button costs one call, not a loop. Rounding: the whole bundle is rounded up **once**, so it can be up to `n` cheaper than adding up `n` single `upgradeCost` prices (each of those is rounded up on its own). Charge the bundle price when the player presses "buy 10"; do not also charge each copy. `maxAffordable` is the largest `n` for which `costOfMany(...) <= money` (it checks its own estimate against `costOfMany`, so the two always agree); it gives 0 when nothing is affordable and 0 when the copies are free.

### The Buy x1 / x10 / Max switch: `buyPlan`
`buyPlan(base, risePct, owned, discount, money, mode, cap)` is the whole switch in one call. `mode` is `1`, `10` (any count) or `'max'`. It returns `{ n, total, can }`: how many copies one tap buys, what they cost together, and whether the money covers it.
- A count buys exactly that many and says `can: false` when the money falls short (the button stays gray; nothing is bought part-way).
- `'max'` buys as many as the money covers, **never more than `cap`** (default 100) so one stray tap cannot empty the pile. With money for none it points at one copy and says `can: false`, so the button can still show a price.
- Unlike `costOfMany`, `total` is the sum of the single prices, each rounded up on its own. That is what a player pays pressing x1 ten times, so the switch never charges a different amount than buying one at a time. In a check of 540 cases (5 base prices, 4 rises, 3 discounts, 3 starting counts, 3 sizes) `buyPlan` matched buying one at a time in all 540; `costOfMany` differed in 421 of them, by up to 56. Use `costOfMany` when you want the closed-form bundle price for very large counts, and `buyPlan` for a button.
- **Do not mix `maxAffordable` and `buyPlan` Max in one game.** `maxAffordable` rounds the whole bundle once, `buyPlan` rounds every copy. Over 3,240 cases they gave a different count in 217 (6.7%). `buyPlan` matched buying one at a time in all 3,240; `maxAffordable` matched its own definition (`costOfMany`) in all 3,240.
- `mode` and the other numbers may arrive as text (`'10'`, `'MAX'`, `'5'`), as they do from a form field or a save; text that is not a number means 1.
- The choice (x1, x10, Max) is yours to keep; Apple Press keeps it in `localStorage`.
Cut from Apple Press, where the same switch has run since October.

### Planning helpers: `etaSec`, `paybackSec`, `prestigeGain`, `prestigeNeeded`
- `etaSec(cost, money, ratePerSec)` is how long until you can afford it; `paybackSec(cost, rateGain)` is how long a purchase takes to pay for itself (cost divided by the income it adds). Lowest payback is the best buy, which is what an auto-buyer picks.
- `prestigeGain(lifetime, scale, root, mult)` is the usual "reset for points" curve. Cookie Clicker is `scale` 1e12, `root` 3; AdVenture Capitalist is `scale` 1e15, `root` 2, `mult` 150; Egg Inc is `root` 1/0.14 (about 7.1). `prestigeNeeded` is the same curve backwards (the total at which you first earn that many points), for a "next point at ..." bar.
- Cube roots and the like land a hair under a whole number (1e15 / 1e12 to the power 1/3 is 9.99999..., which floors to 9, so a player would lose a point). `prestigeGain` adds 1e-9 before flooring. Without it 4,698 of 15,000 round trips came back right; with it all 15,000 do.

### `fastForward`: counting a long gap properly
`awayEarnings` pays a flat percent of normal speed. A game that auto-buys while you are away earns more than that, and a flat 50% paid 2% of the real amount after 30 minutes and 0.2% after 8 hours in a test five-tier economy. If you want the real number, pass your own one-second game step: `IdleCore.fastForward(dt => game.step(dt), awaySec)` runs it in 5 s chunks and stops at 100 ms (`{ chunk, budgetMs }` change both), returning `{ simulated, skipped }` in seconds; pay the skipped part with `awayEarnings`. Bigger chunks are faster but over-pay in that test: against 1 s steps, 5 s chunks were +0.9%, 30 s +5.5%, 120 s +13.2%, 600 s +25.0%. Eight hours in 5 s chunks took 4 ms (28,800 steps of 1 s took 25 ms).

## Away time and the right clock
Keep `performance.now()` for frame timing, but use the wall clock for long gaps. MDN says `performance.now()` keeps counting through sleep only in browsers on Windows; elsewhere a sleeping laptop loses the gap. `Date.now()` keeps counting, at the price that the player (or the system clock) can change it. `awayClock` is built for that:

```js
const clock = IdleCore.awayClock({ capSec: 8 * 3600 });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save.stamp = clock.hide();                       // store the stamp in your save as well
  else { const away = clock.show(); game.add(IdleCore.awayEarnings(game.rate, away)); }
});
// phones may close a hidden page with no event at all, so on load also read the saved stamp:
const awayOnLoad = clock.since(save.stamp);
```
A gap that is negative (the clock moved back) or longer than `maxSec` (default 30 days: a clock set far ahead) counts as 0. Anything else is capped (default 8 h, the same cap `awayEarnings` uses). Remember the cap still lets someone who moves the clock forward collect one cap's worth of income each time.

## Numbers that stay numbers
Costs, rates and away income never come back as `Infinity` or `NaN`. A value past `IdleCore.LIMIT` (1e300) is held at the limit, NaN becomes 0, and a broken input (`NaN`, a string, `undefined`) is replaced with a harmless default, so one bad value cannot stop a save (save-kit refuses to write such numbers). Percent values are clamped to 0..100; a non-number percent means the default 50.

## Why it exists
Idle-game maths are usually copied from blog posts and re-fixed. The parts that hurt are the edges: a gap in time that pays too much or too little, a boost that stacks into a runaway, a number format that shows `1000M` or `NaN`. Those are covered by tests here.

## Checks
`node modules/idle-core/test/run.js` (Node only, 37 checks). Each of the first checks reproduces one defect from the 2026-10-15 audit; the later ones cover text numbers, the boost carry, `buyPlan` Max against buying one at a time, `formatBig` and `formatRate` against `Intl`, and 15,000 prestige round trips. Pass another copy of the file as an argument (`node modules/idle-core/test/run.js modules/idle-core/idle-core.min.js` checks the minified one). The original checks also stay in `tests/run.js`.

`node tests/idle-core-browser.js` runs one fixed set of calls in Node and in a real browser and compares the answers, for the readable and the minified file (`CHROMIUM=...`, `FIREFOX=...` or `WEBKIT=1`, one browser at a time). Counts, text and formatting were identical in every browser. Prices of about 1e9 and up differ in the last coin between engines, because `Math.pow` is not the same everywhere: Node 22, Chromium 155 and Firefox 158 are within 3e-16 of exact, WebKitGTK 2.52.6 and GNOME Web within 3e-14 (measured on 4,200 powers). So do not compare big prices between browsers for equality.

## Prior art
- **Kongregate, "The Math of Idle Games" (Anthony Pecorella):** the price formula (base times growth to the power of copies owned) and the bulk-buy and max-affordable sums used here come from it. The price rule "round up" matches how the Cookie Clicker wiki describes building prices.
- **Big-number libraries:** [break_infinity.js](https://github.com/Patashu/break_infinity.js) and break_eternity.js handle numbers past 1e308. idle-core does not; it holds values at 1e300 instead.
- **Offline progress:** some games (Clicker Heroes describes this) replay the away time step by step so auto-buyers and growing income are counted. `awayEarnings` is the simple version: percent of normal speed, capped. That under-pays games whose income grows while the player is away; `fastForward` is the replay version, with a time budget.
- **Prestige curves:** the same article lists the root curves used by Realm Grinder, AdVenture Capitalist (150 times the square root of lifetime / 1e15), Cookie Clicker (cube root of lifetime / 1e12) and Egg Inc (power 0.14); `prestigeGain` covers them with one formula.
- **Number words:** `Intl.NumberFormat` with `notation: 'compact'` stops at `T` (1e15 reads `1000T`), which is why the suffixes here are by hand. The thousands separators are by hand too: same text as `Intl` in 4,000,000 numbers compared, and they avoid the 12 to 13 ms Chromium spends creating its first `Intl.NumberFormat` on a fresh page (Firefox 3 ms, WebKitGTK 12 ms).
- Nothing here is new maths. It is the same few formulas, with the edges tested.

## Limits
- Pure maths: no storage, no rendering, no timers. You call `tick` and save the state yourself.
- Numbers beyond 1e21 are shown in exponent form; this is not a big-number library. Anything past 1e300 is held at 1e300.
- Prices use floating point. From about 1e12 a price can be a coin or two under the exact one (10 of 435 sampled cases at 1e12 and up), because noise below 1e-13 of the price is forgiven; and from about 1e9 two browsers can disagree by a coin (see Checks). `buyPlan` totals can differ from buying one at a time by up to about 2e-12 of the total above 1e12 (in 600,000 cases the number of copies and `can` always matched).
- Away income is one multiplication. It does not replay auto-buyers or changing rates.
- `awayClock` trusts `Date.now()`, which the player can change. The cap limits the gain; it does not stop it.
- `formatBig` floors (drops the decimals of) the number and shows `0` for NaN; `formatTime` shows `0 sec` for NaN or negative input.
- `BoostQueue` state carries an `order` list next to `time` and `active`. States saved by older versions, or `{}`, are repaired on load.
- `BoostQueue.tick` returns `ended` (the first boost that ran out), `endedAll` (all of them) and `started` (the boost that began during this step and is still running).
- `RateBook` hands back a cleaned copy of an object or array, so it does not keep the identity or prototype of what `compute()` returned.
- `formatRate` rounds to two decimals below 1, so `0.004` shows `0`.

## For AI agents
- One file, `idle-core.js` (readable) or `idle-core.min.js` (same answers, a third of the size), UMD (`window.IdleCore` or `require`). ES5 syntax; copy it with its MIT header, no install step. Rebuild the minified file with `TERSER=/path/to/terser node modules/idle-core/test/make-min.js` after any change.
- Every function is pure except `RateBook`, `BoostQueue` and `awayClock`, which keep their own small state. None of them throws on bad input; they return a harmless number instead.
- Use `upgradeCost` for one copy, `costOfMany` for a bundle, `buyPlan` for a Buy x1 / x10 / Max button (`maxAffordable` only if you charge the bundle price). Do not mix `maxAffordable` and `buyPlan` Max. Pass the same `risePct` number (15, not 1.15) to all of them.
- Use `etaSec` / `paybackSec` for "time to afford" and best-buy pickers, `prestigeGain` / `prestigeNeeded` for reset points, and `fastForward` only with a step function that is cheap and has no side effects on the screen.
- Feed `tickEarnings` the seconds since the last frame and `awayEarnings` / `awayClock` the wall-clock gap from `Date.now()`, never `performance.now()`, for gaps of minutes or more.
- Keep the `BoostQueue` `state` object in your save and pass it back as the second argument on load. Do not edit `state.order` by hand.
- Do not wrap results in your own NaN checks; if a value is wrong, fix the input and add a check to `modules/idle-core/test/run.js`.
- Do not use it for numbers past 1e300; pick a big-number library for that.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
