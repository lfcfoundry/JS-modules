Copyright (c) 2026 LFC Foundry. MIT License.

# Current state

- Repository: `lfcfoundry/JS-modules`; handoff branch parent/live-main: `69049ec1797d1fb3d32b4398ee974918fe8b79b2`.
- LFC-pack candidate copied from the detached November 10 Buffer-transfer checkout at that same parent. It changes `modules/lfc-pack/src/pool.js`, `test/pool.cjs`, and the generated `lfc-pack.js`, `lfc-pack-read.js`, `viewer.html`.
- Netflow source candidate copied from a separate detached November 10 checkout at that same parent. It changes `modules/netflow-plot/netflow-plot.js` and `test/run.js`, plus `modules/netflow-scene/netflow-scene.js` and `test/run.js`.
- The JS-modules local historical handoff branch was divergent and was **not** used as a base. Existing dirty integration worktrees and their branches were not copied.
- This is a research/handoff branch, not a module release. Version labels and changelogs remain at the parent state until a separately reviewed integration/release decision under repository rules.

LFC-pack source and built files match the isolated candidate exactly. The Netflow source candidates are intentionally preserved as a combined unintegrated proposal; two subfixes are blocked. See the matching `lfcfoundry/netflow-map` branch `codex/claude-handoff-2026-11-11` for the product-side vendor copies and full-suite stall evidence.
