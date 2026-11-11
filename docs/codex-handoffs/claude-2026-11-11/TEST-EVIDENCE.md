Copyright (c) 2026 LFC Foundry. MIT License.

# Test and performance evidence

From repository root, using existing Python, Node and npm:

```sh
cd modules/lfc-pack && python3 build.py
cd modules/lfc-pack && node test/pool.cjs
cd modules/lfc-pack && node test/run.js
node modules/netflow-plot/test/run.js
node modules/netflow-scene/test/run.js
node docs/codex-handoffs/claude-2026-11-11/evidence/buffer-transfer-review.cjs candidate
node --expose-gc docs/codex-handoffs/claude-2026-11-11/evidence/copy-cost-pilot.cjs 1048576 400 private
```

The November 10 investigation reported LFC-pack build pass, pool pass and `test/run.js` pass (29 top-level sections); Netflow plot 441 checks and scene test pass. The November 11 independent review reran the pool test successfully and intercepted private worker transfers across four input forms. In this publication worktree, `python3 build.py` passed and regenerated the exact candidate artifact SHA-256 values in [SOURCE-MANIFEST.md](SOURCE-MANIFEST.md); `node test/pool.cjs` passed; `node test/run.js` ended with `all lfc-pack checks passed` and exit 0; Netflow plot passed 441 checks; Netflow scene test exited 0. Node timing printed by the pool test is not a browser performance result. The baseline comparator `evidence/lfc-pack-baseline.js` is the parent built file; its pooled transfer raised `Cannot transfer object of unsupported type` in the independent review and the baseline fixture could remain pending, so use an external timeout when reproducing it. [Recorded candidate transfer output](evidence/buffer-transfer-results.jsonl) is included.

The copy pilot in [PERFORMANCE-VALIDATION.md](PERFORMANCE-VALIDATION.md) measured only a single-process copy-versus-unsafe-alias microcomparison at each size. It is not end-to-end throughput evidence. No supported Linux browser, concurrent SharedArrayBuffer mutation during synchronous WASM decompression, slow-consumer byte-budget experiment, or process-wide memory-ceiling test was completed.

The repository's broader `npm run test:kits` browser gate needs approved Linux browser installations and was not run in this Android/Termux handoff preparation. No dependency installation was performed. The Netflow Map full suite remains incomplete for reasons documented in its separate handoff.
