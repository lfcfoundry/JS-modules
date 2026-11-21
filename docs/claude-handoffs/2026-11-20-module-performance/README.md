<!-- Copyright (c) 2026 LFC Foundry. MIT License. -->
# Five module performance investigations for Claude

Prepared from the `JS-modules` audit at `68816c2b` (2026-11-20). The repository has 42 first-level modules. These five were chosen because their current code or measured limits expose concrete scaling questions, and the branch audit found no matching active work for them:

| Module | Current version | Proposed investigation |
|---|---:|---|
| [netflow-hierarchy](netflow-hierarchy.md) | 1.7.0 | When typed rectangle output reduces end-to-end cost at large sizes while preserving all scene consumers. |
| [pad-nav](pad-nav.md) | 1.1.1 | Whether directional navigation can reduce large-menu allocations after the existing 1,000-button speedup. |
| [frame-kit](frame-kit.md) | 1.2.1 | Queue and clock-resolution costs in `JobPump`, with its frame budget and ordering guarantees intact. |
| [field-report](field-report.md) | 1.1.1 | Whether bounded event-log rollover adds measurable overhead, and whether ring buffers are justified. |
| [fly-to-mini](fly-to-mini.md) | 1.2.0 | How geometry reads and overlapping animations scale while preserving scroll-following flights. |

## How to use these handoffs

Each document gives Claude a test-first investigation, not approval to change defaults. First record the current behavior and a reproducible baseline. Implement a production change only when a measured bottleneck is material for a stated workload. Preserve public behavior and keep the simpler path if results fall within run-to-run noise.

The performance questions are hypotheses. Do not claim a speedup from Node-only timings, from one browser, or from a test that measures setup in one version and rendering in another. Separate setup, hot-path work, and output conversion where the module permits it. Report medians and spread from paired, alternating runs, and include the unchanged baseline.

## Shared guardrails

- Read `AGENTS.md`, the module README and changelog, its source and tests, and `TASKS.md` before editing. Keep any code change inside that module and its existing tests unless the benchmark harness needs a clearly scoped addition.
- Keep modules dependency-free, ES5, and UMD. Preserve existing API defaults. Any new source file needs the repository's license header and versioning workflow.
- Run the relevant Node correctness suite first. For browser performance, use the repository's supported browser versions from its browser knowledge base, one browser at a time; reread that source before launching. Keep the same browser build, device, viewport, and power state for paired runs.
- Verify byte, JSON, or rendered-output equality before interpreting timing. For differences that are permitted, spell out the exact tolerance and the visual or numeric reason.
- Record cold-start and warm runs separately. Alternate baseline and candidate order, use fresh pages for cold-start cells, and report sample count, median, p10/p90, and raw results. Do not compare a single fastest run.
- Test small inputs as well as stress inputs. A large-workload win does not justify a material regression for ordinary use without a clear opt-in or owner decision.
- Do not add tests merely to increase counts. Add cases for an identified behavior or uncovered matrix cell, and keep all existing assertions.

## Handoff result format

For each module, return: (1) baseline commit and version; (2) the exact test and benchmark commands; (3) input generator and matrix; (4) correctness results; (5) per-browser raw timing and memory results; (6) a short decision: no change, internal optimization, or a proposed opt-in/API change; and (7) any unresolved device or compatibility gap. Do not update the module version or changelog until an implementation is approved and the measured result is ready to ship.
