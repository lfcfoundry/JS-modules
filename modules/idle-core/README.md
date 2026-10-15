# idle-core

The small maths every idle / clicker game ends up needing, tested. About 6 KB, pure functions (also runs in Node).

| Function | What it does |
|---|---|
| `upgradeCost(base, risePct, owned, discount)` | price of the next copy, rounded up |
| `milestoneMult(owned, [10,25,50])` / `milestoneLeft` | each copy's output doubles at 10, 25, 50 owned (x8) |
| `RateBook(computeFn)` | memoized rates, recomputed only after `invalidate()` |
| `tickEarnings(dt, opts)` | a long gap (frozen phone, hidden tab) counts at the away percent and is capped, like reopening the game |
| `awayEarnings(rate, awaySec, opts)` | income while away: percent of normal speed, capped (default 8 h) |
| `BoostQueue(caps)` | timed multipliers that never overlap: one runs, the others wait their turn |
| `stageIndex` / `stageProgress` | which stage a total belongs to, and 0..1 through it |
| `formatBig` / `formatRate` / `formatTime` | `1,234`, `1.5M`, `2.25B` ... `1Sx`, `1.23e24`; never prints `1000M`; `2h 13m` |

```js
IdleCore.upgradeCost(15, 15, 3);            // 23
IdleCore.tickEarnings(7200, { percent: 50 }); // about 3,600 s of income (5 s at full speed + the rest at 50%), not 7,200
const q = IdleCore.BoostQueue({ double: { secs: 20, max: 60 }, auto: { secs: 20, max: 60 } });
q.give('double'); q.give('auto');   // 'double' runs, 'auto' waits its turn
q.tick(1);                          // counts down the running boost
```

## Why it exists
Idle-game maths are usually copied from blog posts and re-fixed. The parts that hurt are the edges: a gap in time that pays too much or too little, a boost that stacks into a runaway, a number format that shows `1000M` or `NaN`. Those are covered by tests here.

## Limits
Pure maths: no storage, no rendering. Numbers beyond 1e21 are shown in exponent form; this is not a big-number library (see break_infinity.js for numbers past 1e308).

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry · extracted from [Apple Press](https://github.com/JNFoo/apple-press)
