# idle-core changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.2.0 · API 1 · 2026-10-17
- Fixed five traps: numbers typed as text (like "10" or "MAX") now work like numbers, and a frozen object no longer breaks it.
- Faster number formatting and buy buttons, and five new helpers.

## 1.1.0 · API 1 · 2026-10-16
- New buyPlan: the whole "Buy x1 / x10 / Max" switch in one call. It never buys more than 100 at once by default, so a stray tap cannot empty the pile.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- Early October 2026: First version: costs, income and formatting helpers for idle and clicker games.
- 2026-10-15: `upgradeCost(100, 10, 2)` now gives 121, not 122; `formatBig` no longer prints `1000Sx` at a tier edge; `Infinity` and `NaN` can no longer escape.
- 2026-10-15: New buy-many and buy-max helpers: `costOfMany` and `maxAffordable`.
- 2026-10-16: README: documented the `graceSec` option.
