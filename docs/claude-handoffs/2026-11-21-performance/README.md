# fuzz-kit performance review

Prepared against JS-modules main at c4c6b3a2ec6bce937b6017c427ff23c4e996cff2. Current module: tools/fuzz-kit 1.3.4, API 1. This is a docs-only review; no module or runner code was changed.

## Decision

The meaningful engine and runner improvements from the October review are already present: shrinking, seed recording/replay, the visible-control picker, parallel jobs, swarm, final checks, and the frozen-page and Firefox input fixes. A local no-op benchmark on this Android host was too noisy to support a new engine-speed claim. Real application operations and page checks are the likely cost centers.

## Documents

- FINDINGS.md records the shipped performance work, current qualification, and diagnostic limits.
- CLAUDE-PLAN.md specifies the workload matrix and the evidence needed before changing the engine or runners.

## Historical work

The prior review and experiment details are in the [knowledge-base review](https://github.com/lfcfoundry/knowledge-base/blob/main/projects/js-modules/research/fuzz-kit/REVIEW.md). The review's proposed changes were applied before current version 1.3.4; do not recreate them.
