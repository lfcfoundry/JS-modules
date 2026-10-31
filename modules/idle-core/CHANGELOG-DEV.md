# idle-core developer changelog

What changed in each version, newest first, for developers, in three depths: Quick (what changed and whether old code breaks), Details (API, numbers with the browser named, how to upgrade) and Deep (design reasons, tests, what was tried). Users read CHANGELOG.md. The API number goes up only when someone using an older copy could be affected.

## 1.2.0 · API 1 · 2026-10-17

### Quick
Fixed five traps: numbers typed as text (like "10" or "MAX") now work like numbers, and a frozen object no longer breaks it. Faster number formatting and buy buttons, and five new helpers.

### Deep
Five traps fixed, faster, and five new helpers. Fixed: numbers given as text from a form or a save ('10', 'MAX', '5000') now work like numbers in buyPlan, costOfMany, maxAffordable, upgradeCost, awayEarnings and tickEarnings (before, buyPlan with '10' bought 1 copy, costOfMany with '10' cost 0 and maxAffordable with '5000' returned 0). RateBook no longer throws on a frozen object and no longer edits your object (it hands back a cleaned copy). A boost step longer than the running boost now carries its leftover to the next one (a 30 s step over two 20 s boosts leaves the second at 10 s; it used to leave 20 s); tick also returns endedAll. formatRate shows two decimals below 1 (0.04, was 0) and reads 999,999.96 as 1M (was 1,000,000). Faster: thousands separators no longer use Intl (same text as Intl in 4,000,000 numbers compared; formatBig about 4 times and formatRate about 2 times faster in Node, and no 12 to 13 ms Intl start-up on the first number in Chromium), and the Max and x10 buttons multiply instead of calling Math.pow per copy (Max about 11 times faster at the default cap of 100, about 10 times at 1,000, x10 about 5 times; same copy count and can in 600,000 comparisons, totals within about 2e-12). New: etaSec, paybackSec, prestigeGain (Cookie Clicker 1e15 gives 10, not 9), prestigeNeeded and fastForward, about 0.5 KB together once minified. New idle-core.min.js: 7,530 bytes (3,178 gzip) against the 23,296-byte readable file; the code itself grew from 6,130 to 7,264 bytes minified for the new helpers. 37 checks, 8 of them new.

## 1.1.0 · API 1 · 2026-10-16

### Quick
New buyPlan: the whole "Buy x1 / x10 / Max" switch in one call. It never buys more than 100 at once by default, so a stray tap cannot empty the pile.

### Deep
New `buyPlan(base, risePct, owned, discount, money, mode, cap)`: the whole "Buy x1 / x10 / Max" switch in one call, cut from Apple Press. It says how many copies a tap buys, what they cost together and whether the money covers it, and Max never buys more than 100 copies at once (changeable) so one stray tap cannot empty the pile. Its price is the sum of the single prices, so it matches pressing x1 repeatedly: in 540 test cases it matched in all 540, while `costOfMany` (one rounding for the whole bundle) differed in 421 of them, by up to 56. Nothing existing changes. 29 checks, 4 of them new.

## 1.0.0 · API 1 · 2026-10-16

### Quick
First labeled version. Nothing in the code changed.

### Deep
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.
