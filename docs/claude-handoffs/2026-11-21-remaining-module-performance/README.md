<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# Remaining module performance investigations

**Baseline:** `JS-modules` main `adda9357` (2026-11-21; 43 module directories in the repository). Recheck `origin/main`, the module version, README limits, `TASKS.md`, and current test instructions before starting each item.

This batch covers the 22 remaining modules below. It excludes the two prior five-module handoff batches and eleven modules with focused review worktrees (`clip-writer`, `gif-writer`, `image-decode`, `lfc-pack`, `memory-compression`, `netflow-layers`, `pcodec-js`, `ppmd-decode`, `save-kit`, `text-columns`, and `zip-open`). Do not duplicate or overwrite those reviews. Their current status belongs to their own branches.

| Module | Baseline version | Investigation |
|---|---:|---|
| [back-close](01-state-and-interaction.md#back-close) | 1.2.0 | Close-request and history fallback lifecycle across browser capabilities. |
| [env-probes](01-state-and-interaction.md#env-probes) | 1.1.0 | Honest capability results under privacy restrictions and failing APIs. |
| [grown-ups-door](01-state-and-interaction.md#grown-ups-door) | 1.0.1 | Hold, drag, keyboard, cancellation, and unlock-window state transitions. |
| [guess-gate](05-guess-gate.md) | 1.0.1 | Admission-budget correctness, estimates, thrown guesses, and progressive-import overhead. |
| [slow-note](01-state-and-interaction.md#slow-note) | 1.0.0 | Bounded, local-only event capture and storage failure behavior. |
| [spotlight-tour](01-state-and-interaction.md#spotlight-tour) | 1.1.1 | Target movement, listener lifetime, focus and one-time completion effects. |
| [tab-guard](01-state-and-interaction.md#tab-guard) | 1.1.1 | Multi-tab ownership, takeover and recovery races. |
| [elias-fano](02-numeric-and-codecs.md#elias-fano) | 2.1.2 | Search and intersection correctness across list shapes and boundaries. |
| [lz4-kit](02-numeric-and-codecs.md#lz4-kit) | 1.1.2 | Standard frame and raw-block interoperability, errors and level trade-offs. |
| [lzma-decode](02-numeric-and-codecs.md#lzma-decode) | 1.7.1 | WebAssembly and JavaScript fallback parity, malformed streams and limits. |
| [zstd-kit](02-numeric-and-codecs.md#zstd-kit) | 1.0.0 | Frame interoperability, checksums, level selection and corrupt input. |
| [graph-walk](03-graphs-and-maps.md#graph-walk) | 0.12.0 | Typed-array graph algorithms against small independent oracles. |
| [netflow-chord](03-graphs-and-maps.md#netflow-chord) | 1.0.0 | Link-list chord layout boundaries, tie order and d3 comparison. |
| [netflow-circular](03-graphs-and-maps.md#netflow-circular) | 1.5.2 | Chord and bundle layout and scene parity over graph shapes. |
| [netflow-engine](03-graphs-and-maps.md#netflow-engine) | 2.5.0 | Nine-view engine parity plus `quickNetwork()` on partial imports. |
| [netflow-plot](03-graphs-and-maps.md#netflow-plot) | 2.22.0 | Twenty-two chart types, typed columns, and summary-only line charts. |
| [netflow-sankey](03-graphs-and-maps.md#netflow-sankey) | 2.14.0 | Crossing search, loops, weighted ties and WebAssembly equality. |
| [netflow-scene](03-graphs-and-maps.md#netflow-scene) | 1.14.2 | Scene lists, hit testing and renderer parity after recent scene-speed work. |
| [gpu-blur](04-graphics-and-simulation.md#gpu-blur) | 1.4.2 | Backend choice, image edge cases, context loss and pixel identity. |
| [sprite-baker](04-graphics-and-simulation.md#sprite-baker) | 1.11.0 | Raster boundaries, shape inputs and WebAssembly parity. |
| [stage-curtains](04-graphics-and-simulation.md#stage-curtains) | 1.4.3 | Animation stalls, worker fallback, visibility and always-settling promises. |
| [walker-sim](04-graphics-and-simulation.md#walker-sim) | 2.4.2 | Seeded simulation against exact odds and statistical bounds. |

## Shared working rules

These are investigation plans, not approval to change APIs, defaults, formats, dependencies, or version labels. Read `AGENTS.md` and the current task board first. Add a task row before work and update it when work is complete. Keep changes within the named module and its existing tests unless a separate harness file is required.

For each module, first record the exact source commit, shipped version, current behavior, and test commands. Run correctness checks before timing. Compare with an independent small-case oracle or an unchanged implementation; do not use the optimized implementation as its own oracle. Keep timing out of correctness assertions.

Use only the browsers listed by the current private `knowledge-base` `browsers` branch; read its README immediately before a browser run. Run browsers one at a time. Pair and alternate baseline/candidate in the same session, separate cold start from steady state, and keep raw samples, browser version, device, viewport, and backend. Use at least seven fresh-page pairs for cold results and enough warm pairs to stabilize p50/p90. Report unavailable browsers or physical devices as untested. Do not claim cross-browser behavior from Node checks.

For WebAssembly modules, compare the shipped WebAssembly route and the documented JavaScript route with the same fixture. Check output identity before interpreting speed. Report compile/startup separately from steady-state work and include the added bytes. Never change which route is the default from a timing result alone; preserve a useful fallback and follow the owner’s versioning rules if code is later approved.

Keep fixtures synthetic. Stop a size ramp before the browser or device becomes unstable. A neutral or noisy result means no production change. Return exact baseline/candidate commits, changed files, commands and results, raw evidence locations, browser/device coverage, decision, and limitations. These documents make no claim that tests were run.
