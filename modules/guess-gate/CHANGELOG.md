# guess-gate changelog

What changed in each version, newest first, in plain words. The full details (numbers, test runs, browsers) are kept privately by the maintainers. The API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-11-21
- New module: a time-boxed scheduler for first guesses during an import; guesses may use only a set share (10% by default) of the time so far, so a progressive import costs about the same total time as one without guesses.
