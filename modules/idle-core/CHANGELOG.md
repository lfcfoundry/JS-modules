# idle-core changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.2.0 · API 1 · 2026-10-17
Five traps fixed, faster, and five new helpers. Fixed: numbers given as text from a form or a save ('10', 'MAX', '5000') now work like numbers in buyPlan, costOfMany, maxAffordable, upgradeCost, awayEarnings and tickEarnings (before, buyPlan with '10' bought 1 copy, costOfMany with '10' cost 0 and maxAffordable with '5000' returned 0). RateBook no longer throws on a frozen object and no longer edits your object (it hands back a cleaned copy). A boost step longer than the running boost now carries its leftover to the next one (a 30 s step over two 20 s boosts leaves the second at 10 s; it used to leave 20 s); tick also returns endedAll. formatRate shows two decimals below 1 (0.04, was 0) and reads 999,999.96 as 1M (was 1,000,000). Faster: thousands separators no longer use Intl (same text as Intl in 4,000,000 numbers compared; formatBig about 4 times and formatRate about 2 times faster in Node, and no 12 to 13 ms Intl start-up on the first number in Chromium), and the Max and x10 buttons multiply instead of calling Math.pow per copy (Max about 11 times faster at the default cap of 100, about 10 times at 1,000, x10 about 5 times; same copy count and can in 600,000 comparisons, totals within about 2e-12). New: etaSec, paybackSec, prestigeGain (Cookie Clicker 1e15 gives 10, not 9), prestigeNeeded and fastForward, about 0.5 KB together once minified. New idle-core.min.js: 7,530 bytes (3,178 gzip) against the 23,296-byte readable file; the code itself grew from 6,130 to 7,264 bytes minified for the new helpers. 37 checks, 8 of them new.

Tested in: Firefox 158.0, ungoogled Chromium 155.0.8059.39-1, WebKitGTK 2.52.6 and GNOME Web 46.5, one at a time, in a same-answers run of one fixed set of calls (tests/idle-core-browser.js, readable and minified file); 37 Node checks (8 new).

## 1.1.0 · API 1 · 2026-10-16
New `buyPlan(base, risePct, owned, discount, money, mode, cap)`: the whole "Buy x1 / x10 / Max" switch in one call, cut from Apple Press. It says how many copies a tap buys, what they cost together and whether the money covers it, and Max never buys more than 100 copies at once (changeable) so one stray tap cannot empty the pile. Its price is the sum of the single prices, so it matches pressing x1 repeatedly: in 540 test cases it matched in all 540, while `costOfMany` (one rounding for the whole bundle) differed in 421 of them, by up to 56. Nothing existing changes. 29 checks, 4 of them new.

Tested in: 29 Node checks (4 of them new, for `buyPlan`); no browser was needed.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

Tested in: Node checks only; no browser was used.

## Before version labels

- Early October 2026: First version: costs, income and formatting helpers for idle and clicker games.
- 2026-10-15: `upgradeCost(100, 10, 2)` now gives 121, not 122; `formatBig` no longer prints `1000Sx` at a tier edge; `Infinity` and `NaN` can no longer escape.
- 2026-10-15: New buy-many and buy-max helpers: `costOfMany` and `maxAffordable`.
- 2026-10-16: README: documented the `graceSec` option.
