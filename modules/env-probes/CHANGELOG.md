# env-probes changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

## Before version labels

- Early October 2026: First version: detects privacy modes that round the clock, scramble canvas read-back or block storage.
- 2026-10-15: The clock check now measures the smallest clock step instead of testing for 100 ms, so Firefox privacy mode (about 16.67 ms) is caught.
