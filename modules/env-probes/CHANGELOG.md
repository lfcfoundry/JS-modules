# env-probes changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.1.0 · API 1 · 2026-10-16
Faster clock and canvas checks. New: canvasNoise() says how big canvas noise is, framed() says whether the page sits inside another page, capabilities() lists which newer browser features work, plus hover, any-hover and reduced-transparency questions. explain() now says so when saving is blocked inside a frame. The demo is now a one-button device check page with a copy-report button. Everything old answers the same as before.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

## Before version labels

- Early October 2026: First version: detects privacy modes that round the clock, scramble canvas read-back or block storage.
- 2026-10-15: The clock check now measures the smallest clock step instead of testing for 100 ms, so Firefox privacy mode (about 16.67 ms) is caught.
