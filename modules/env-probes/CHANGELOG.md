# env-probes changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-16
- The clock and canvas checks are faster, with the same answers.
- New checks say how big canvas noise is, whether the page sits inside another page, and which newer browser features are present.

## 1.0.0 · API 1 · 2026-10-16
- First labeled version. Nothing in the code changed.

## Before version labels

- Early October 2026: First version: detects privacy modes that round the clock, scramble canvas read-back or block storage.
- 2026-10-15: The clock check now measures the smallest clock step instead of testing for 100 ms, so Firefox privacy mode (about 16.67 ms) is caught.
