# idle-core changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-16
New `buyPlan(base, risePct, owned, discount, money, mode, cap)`: the whole "Buy x1 / x10 / Max" switch in one call, cut from Apple Press. It says how many copies a tap buys, what they cost together and whether the money covers it, and Max never buys more than 100 copies at once (changeable) so one stray tap cannot empty the pile. Its price is the sum of the single prices, so it matches pressing x1 repeatedly: in 540 test cases it matched in all 540, while `costOfMany` (one rounding for the whole bundle) differed in 421 of them, by up to 56. Nothing existing changes. 29 checks, 4 of them new.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

## Before version labels

- Early October 2026: First version: costs, income and formatting helpers for idle and clicker games.
- 2026-10-15: `upgradeCost(100, 10, 2)` now gives 121, not 122; `formatBig` no longer prints `1000Sx` at a tier edge; `Infinity` and `NaN` can no longer escape.
- 2026-10-15: New buy-many and buy-max helpers: `costOfMany` and `maxAffordable`.
- 2026-10-16: README: documented the `graceSec` option.
