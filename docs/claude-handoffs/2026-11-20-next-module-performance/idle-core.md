<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# Claude handoff: idle-core price precision boundaries

**Baseline:** `idle-core` 1.2.0 at repository main `2de1058b` (2026-11-20). **Scope:** investigate cross-engine price differences and the previously recorded double-double `pow` idea. Keep the price rules, return shapes, and dependency-free ES5 library unchanged unless results support a small, tested fix.

## Evidence and hypothesis

The README documents that prices can differ by a coin between engines around 1e9 and can fall a coin or two below an exact price around 1e12. It attributes this to browser differences in `Math.pow`; Firefox/Chromium and WebKit have different observed error. `buyPlan()` intentionally rounds each copy separately, while `costOfMany()` rounds the bundle once. The task board records a double-double `pow` experiment as an unbuilt idea.

The useful next step is an independent boundary suite. First establish exactly which functions and inputs produce an incorrect affordability or total decision. Only then compare a precision fix with the existing implementation and measure its cost.

## Test matrix

Cover `upgradeCost`, `costOfMany`, `maxAffordable`, and `buyPlan` with integer and fractional base, integer and fractional `risePct`, discounts 0/typical/near 100, owned counts near 0, 1,000, and the documented high-count limit, and purchase counts 1/10/100/1,000 (respecting the API cap). Concentrate on inputs where the exact unrounded cost lies just below, exactly on, or just above an integer boundary.

Build a research-only exact oracle for bounded rational cases: represent integer base, percent growth, and discount as integer numerator/denominator values; calculate exact rounded single prices and exact bundle sums for a manageable range. Generate fixtures around 1e9, 1e12, and higher supported magnitudes, then compare Chromium, Firefox, WebKitGTK, and Node outputs to those fixtures. The oracle must not become a runtime dependency.

For `maxAffordable`, test money equal to the exact cost, one unit below, and one unit above the boundary, and assert both `n` and the `n`/`n+1` affordability invariant. For `buyPlan`, compare count, `total`, and `can` with repeated single purchases; preserve its intentional difference from `costOfMany` where per-copy rounding changes the answer. Keep existing prestige round-trip and malformed-input tests as regression coverage.

## Performance checks

Benchmark the existing and any precision prototype separately for the ordinary workload and boundary-heavy workload. Include `maxAffordable` at small and large balances, `buyPlan` at caps 100 and 1,000, and 1,000 repeated calls representative of a purchase UI. Report browser-specific cost and preserve the current implementation's latency for common small inputs. Do not claim an improvement from exactness alone if the extra precision makes every purchase materially slower.

## Claude sequence

1. Read `TASKS.md`'s recorded open idea and current `idle-core/test/run.js` / `tests/idle-core-browser.js`; retain all 37 Node checks and existing cross-browser answer comparisons.
2. Add an independent generator or fixed oracle fixtures that expose a known one-coin boundary error before implementing a fix.
3. Prototype the narrowest numeric change (for example, a compensated power path) and compare exact answers, browser parity, and speed.
4. If a fix is too costly or only changes totals without changing purchase decisions, report the trade-off and leave the API unchanged. Rebuild the minified copy only after an implementation is accepted.
