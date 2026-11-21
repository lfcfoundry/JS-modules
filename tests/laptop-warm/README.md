# Warm start tester

A hosted test page for the owner's devices: one Start button, a progress bar and Copy results. It builds the Network layout of four test drops with netflow-engine 2.5.0 ("today"), the current netflow-engine ("new") and the current engine with the extra fitting pass off ("new, fastest"), 5 runs each in turns, and shows build time, stress, touching items, crossings and the pictures side by side.

- `engine-2.5.0.js`: netflow-engine 2.5.0 exactly as released (`git show a056fbd:modules/netflow-engine/netflow-engine.js`), with one comment line added on top.
- `engine-fastest.js`: the current engine with `refitMax: 4000` changed to `refitMax: 0` and one comment line added on top. Remake it after any change to the engine:

      sed -e 's/refitMax: 4000/refitMax: 0/' modules/netflow-engine/netflow-engine.js > tests/laptop-warm/engine-fastest.js

- `data/`: the four drops. big50k is the real drop; shuffled50k is the same map with its rows in random order; the two communities files are made up.
