# stage-curtains changelog

What changed in each version, newest first, in plain words. The numbers are explained in [tools/versions/README.md](../../tools/versions/README.md): the API number goes up only when someone using an older copy could be affected.

## 1.0.0 · API 1 · 2026-10-16
First labeled version. Nothing in the code changed; everything under "Before version labels" is already in it.

## Before version labels

- Early October 2026: First version, cut from the games.
- 2026-10-15: `prepare()` now finishes in browsers that lack `requestIdleCallback`; before, it could wait forever.
- 2026-10-15: The finished curtain half is no longer cancelled, which made the curtain jump a hair on a phone.
- 2026-10-15: README: added prior art (View Transitions, Motion `curtains()`) and removed the link to the source game.
