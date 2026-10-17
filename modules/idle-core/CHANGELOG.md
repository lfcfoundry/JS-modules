# idle-core changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

## Before version labels

- Early October 2026: First version: costs, income and formatting helpers for idle and clicker games.
- 2026-10-15: `upgradeCost(100, 10, 2)` now gives 121, not 122; `formatBig` no longer prints `1000Sx` at a tier edge; `Infinity` and `NaN` can no longer escape.
- 2026-10-15: New buy-many and buy-max helpers: `costOfMany` and `maxAffordable`.
- 2026-10-16: README: documented the `graceSec` option.
