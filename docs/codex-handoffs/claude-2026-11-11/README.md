Copyright (c) 2026 LFC Foundry. MIT License.

# Claude handoff: LFC-pack transfer and Netflow source candidates

**Update 2026-11-11 (Claude):** corrections and measurements are in [CLAUDE-RESULTS.md](CLAUDE-RESULTS.md). The text below is the original handoff, kept as published.

This is the **isolated** `codex/claude-handoff-2026-11-11` branch of `lfcfoundry/JS-modules`, based on live-main `69049ec1797d1fb3d32b4398ee974918fe8b79b2`. It is not canonical `main` or the divergent historical LFC-pack handoff branch. Do not merge it into `main` as a whole.

The exact LFC-pack Buffer-transfer implementation, built artifacts and regression tests are included. Independent review found this correctness fix **ready for integration consideration**, while queued-byte growth and copy cost remain separate questions. The exact upstream Netflow plot/scene source candidates and tests are also included because Netflow Map vendors them. Of those, XML scalar escaping is **ready for integration consideration**; the real `Other` collision and tiny-wedge visibility fixes are **blocked**. The Netflow Map handoff branch contains the matching vendor and product artifacts.

Read [CURRENT-STATE.md](CURRENT-STATE.md), [FINDINGS.md](FINDINGS.md), [TASKS.md](TASKS.md), [TEST-EVIDENCE.md](TEST-EVIDENCE.md), and [SOURCE-MANIFEST.md](SOURCE-MANIFEST.md). The full [performance framework](PERFORMANCE-ENGINEERING-FRAMEWORK.md), [validation update](PERFORMANCE-VALIDATION.md), and runnable [evidence/](evidence/) are on this branch; no Termux files are needed.

Claude should preserve the reviewed private-transfer correction, investigate byte-based backpressure without an unnecessary rewrite, and repair the two Netflow source blockers while preserving the reviewed SVG fix. Work on this branch, run the relevant tests, report integration-ready results, and never merge into canonical branches.
