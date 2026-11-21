# Zstandard performance review handoff

**Purpose:** Give Claude a measured, testable plan for improving `modules/zstd-kit` without weakening compatibility or making synthetic Node timings look like browser results.

**Source baseline:** `main` at `c4c6b3a2ec6bce937b6017c427ff23c4e996cff2` (2026-11-21). The repository worktree was clean at review time. No production source or build artifact was changed during this review.

## Recommendation

Start by evaluating the existing automatic text tuner. An isolated candidate that reduced its sample cap from 128 KiB to 32 KiB and changed the tuned hash log from 18 to 17 improved compression time in all six measured synthetic cases. The compressed size was unchanged or slightly better in five cases and increased by 87 bytes (0.036%) in one. This is promising enough for browser qualification, but it is host-only evidence from Node 26/V8 14.6 on Android ARM64. It does not justify shipping the candidate yet.

Keep the current tuner available: on structured logs it produces much smaller output than the no-tune path. Instead, have Claude examine the tuner’s eligibility and cost, especially mixed text/binary inputs and the 256 KiB threshold where sampling overhead can be large. Compare staged policy changes and tune parameters as described in [TASKS.md](TASKS.md).

Deprioritize compiler optimization and decoder-context reuse for now. The tested compiler flags substantially enlarged Wasm without a reliable broad speed gain. Reusing a decompression context had at most a small, inconsistent host benefit.

## Documents

- [FINDINGS.md](FINDINGS.md): implementation review, measured results, research, and limits.
- [TEST-EVIDENCE.md](TEST-EVIDENCE.md): qualification results, profiling method, and reproducibility notes.
- [TASKS.md](TASKS.md): prioritized Claude work plan and workload/parameter matrix.

## Shared-code warning

`modules/zstd-kit/src/zstd-core.js` is also embedded by LFC-pack. Any implementation change must be qualified through both modules and their build outputs. The temp candidate in this review passed both existing suites, but no browser measurements were available on the review host.

## Research references

- [Zstandard C API header and parameter/context guidance](https://github.com/facebook/zstd/blob/dev/lib/zstd.h)
- [Zstandard releases](https://github.com/facebook/zstd/releases)
- [Zstandard in memory-constrained environments](https://github.com/facebook/zstd/wiki/Using-libzstd-in-a-memory-constrained-environment)
- [Zstandard compression format](https://github.com/facebook/zstd/blob/dev/doc/zstd_compression_format.md)
