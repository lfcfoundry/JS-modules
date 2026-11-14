# P13g Late-Fallback Regression Handoff

**Status: ACCEPTED WITH LIMITATIONS.** This package publishes a deterministic correctness regression test for LFC-pack's P13g nested equality path. It does not qualify P13g performance, change production behavior, or add CI coverage.

## Contents

- [Current source and branch state](CURRENT-STATE.md)
- [Implementation findings and coverage](FINDINGS.md)
- [Validation evidence and limitations](TEST-EVIDENCE.md)
- [Narrow next steps and exclusions](TASKS.md)
- [Paste-ready Claude continuation prompt](CLAUDE-HANDOFF.md)
- [SHA-256 manifest](SOURCE-MANIFEST.sha256)

The manifest hashes both published test files and all six handoff documents. It does not hash itself, avoiding a recursive checksum.

## Published tests

- [`p13g-late-fallback.cjs`](https://github.com/lfcfoundry/JS-modules/blob/codex/claude-handoff-p13g-regression-2026-11-14/modules/lfc-pack/test/p13g-late-fallback.cjs)
- [`run.js` registration](https://github.com/lfcfoundry/JS-modules/blob/codex/claude-handoff-p13g-regression-2026-11-14/modules/lfc-pack/test/run.js)

The test instruments the generated bundle in memory at the exact P13g fallback condition. It compares query results with full unpack followed by ordinary JavaScript filtering and projection. See the evidence document for what the test establishes and what remains unqualified.
