# Warm start tester

A hosted test page for the owner's devices, in the standard tester layout: Quick run (about 1 minute), Full run (about 3 minutes), Stop, Copy results, Download results, a progress bar with the time left, score tiles and live charts, light and dark.

It builds the Network layout of four test drops with netflow-engine 2.5.0 ("today": an early picture of the whole drop, then the final picture) and with the newest netflow-engine ("new": a guess from the first half of the rows, then one final build). Full run adds "new, fastest", the newest engine with the extra fitting pass off. The versions take turns. It shows build time, stress, touching items, crossings and the pictures side by side.

- `engine-2.5.0.js`: netflow-engine 2.5.0 exactly as released (`git show a056fbd:modules/netflow-engine/netflow-engine.js`), with one comment line added on top.
- `engine-fastest.js`: the newest engine with `refitMax: 4000` changed to `refitMax: 0` and one comment line added on top. Remake it after any change to the engine:

      sed -e 's/refitMax: 4000/refitMax: 0/' modules/netflow-engine/netflow-engine.js > tests/laptop-warm/engine-fastest.js

- `data/`: the four drops. big50k is the real drop; shuffled50k is the same map with its rows in random order; the two communities files are made up.
