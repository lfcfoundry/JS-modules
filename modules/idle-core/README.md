# idle-core

**Version 1.1.0 · API 1**

**Tested in:** 29 Node checks (4 of them new, for `buyPlan`); no browser was needed.

The small maths every idle / clicker game ends up needing, tested. About 17 KB unminified (about 6 KB before the 2026-10-15 fixes), pure functions (also runs in Node, no dependencies, ES5 syntax).

| Function | What it does |
|---|---|
| `upgradeCost(base, risePct, owned, discount)` | price of the next copy, rounded up (floating-point noise forgiven: `upgradeCost(100, 10, 2)` is 121) |
| `costOfMany(base, risePct, owned, n, discount)` | price of the next `n` copies in one sum (the "buy 10" button) |
| `maxAffordable(base, risePct, owned, money, discount)` | how many copies the money buys (the "buy max" button) |
| `buyPlan(base, risePct, owned, discount, money, mode, cap)` | what a tap on a "Buy x1 / x10 / Max" switch does right now: `{ n, total, can }`. The price is the sum of single prices, so it matches buying one at a time; Max never buys more than `cap` (default 100) |
| `milestoneMult(owned, [10,25,50])` / `milestoneLeft` | each copy's output doubles at 10, 25, 50 owned (x8) |
| `RateBook(computeFn)` | memoized rates, recomputed only after `invalidate()`; NaN and Infinity are cleaned out |
| `tickEarnings(dt, opts)` | a long gap (frozen phone, hidden tab) counts at the away percent and is capped, like reopening the game. `opts.graceSec` (default 5) is how long a tick can be before it counts as time away; `opts.percent` and `opts.capSec` as below |
| `awayEarnings(rate, awaySec, opts)` | income while away: percent of normal speed (clamped to 0..100), capped (default 8 h) |
| `awayClock(opts)` | the gap between hiding the page and coming back, measured with `Date.now()`; ignores backwards and impossible jumps |
| `BoostQueue(caps, saved)` | timed multipliers that never overlap: one runs, the others wait their turn, in the order they were given |
| `stageIndex` / `stageProgress` | which stage a total belongs to, and 0..1 through it |
| `formatBig` / `formatRate` / `formatTime` | `1,234`, `1.5M`, `2.25B` ... `1Sx`, `1.23e24`; never prints `1000M` or `1000Sx`; `2h 13m`, `4d 15h` |
| `safe(n, fallback)` | `n` when it is a finite number, else the fallback (default 0) |

```js
IdleCore.upgradeCost(15, 15, 3);            // 23
IdleCore.costOfMany(15, 15, 3, 10);         // price of 10 more copies, with 3 owned
IdleCore.maxAffordable(15, 15, 3, 5000);    // how many of them 5,000 buys
IdleCore.buyPlan(15, 15, 3, 1, 5000, 'max');  // { n, total, can }: the Max button, capped at 100 copies
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
- The choice (x1, x10, Max) is yours to keep; Apple Press keeps it in `localStorage`.
Cut from Apple Press, where the same switch has run since October.

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
`node modules/idle-core/test/run.js` (Node only, 25 checks). Each check reproduces one defect from the 2026-10-15 audit. Pass another copy of the file as an argument to see which of them it has. The original checks also stay in `tests/run.js`.

## Prior art
- **Kongregate, "The Math of Idle Games" (Anthony Pecorella):** the price formula (base times growth to the power of copies owned) and the bulk-buy and max-affordable sums used here come from it. The price rule "round up" matches how the Cookie Clicker wiki describes building prices.
- **Big-number libraries:** [break_infinity.js](https://github.com/Patashu/break_infinity.js) and break_eternity.js handle numbers past 1e308. idle-core does not; it holds values at 1e300 instead.
- **Offline progress:** some games (Clicker Heroes describes this) replay the away time step by step so auto-buyers and growing income are counted. idle-core uses the simple version: percent of normal speed, capped. That under-pays games whose income grows while the player is away.
- Nothing here is new maths. It is the same few formulas, with the edges tested.

## Limits
- Pure maths: no storage, no rendering, no timers. You call `tick` and save the state yourself.
- Numbers beyond 1e21 are shown in exponent form; this is not a big-number library. Anything past 1e300 is held at 1e300.
- `costOfMany` and `maxAffordable` use floating point; they are checked against a plain loop, but past about 1e15 the last digits are not exact.
- Away income is one multiplication. It does not replay auto-buyers or changing rates.
- `awayClock` trusts `Date.now()`, which the player can change. The cap limits the gain; it does not stop it.
- `formatBig` floors (drops the decimals of) the number and shows `0` for NaN; `formatTime` shows `0 sec` for NaN or negative input.
- `BoostQueue` state now carries an `order` list next to `time` and `active`. States saved by older versions, or `{}`, are repaired on load.
- A step bigger than the running boost does not carry its leftover into the next boost.

## For AI agents
- One file, `idle-core.js`, UMD (`window.IdleCore` or `require`). ES5 syntax; copy it with its MIT header, no install step.
- Every function is pure except `RateBook`, `BoostQueue` and `awayClock`, which keep their own small state. None of them throws on bad input; they return a harmless number instead.
- Use `upgradeCost` for one copy, `costOfMany` for a bundle, `maxAffordable` for "buy max", `buyPlan` for a Buy x1 / x10 / Max button. Pass the same `risePct` number (15, not 1.15) to all three.
- Feed `tickEarnings` the seconds since the last frame and `awayEarnings` / `awayClock` the wall-clock gap from `Date.now()`, never `performance.now()`, for gaps of minutes or more.
- Keep the `BoostQueue` `state` object in your save and pass it back as the second argument on load. Do not edit `state.order` by hand.
- Do not wrap results in your own NaN checks; if a value is wrong, fix the input and add a check to `modules/idle-core/test/run.js`.
- Do not use it for numbers past 1e300; pick a big-number library for that.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
