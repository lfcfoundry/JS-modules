# Claude Continuation Prompt

Paste the prompt below into a separate Claude session.

---

You are reviewing a narrowly scoped LFC-pack P13g late-fallback correctness regression test. Start by reading this entire handoff directory on branch `codex/claude-handoff-p13g-regression-2026-11-14`:

- `README.md`
- `CURRENT-STATE.md`
- `FINDINGS.md`
- `TEST-EVIDENCE.md`
- `TASKS.md`
- `SOURCE-MANIFEST.sha256`

Then inspect the exact P13g implementation at source baseline `cb91493c05cb0b056259a8ef416a8b503bae2486` and the published test:

- `modules/lfc-pack/src/nested.js`
- `modules/lfc-pack/lfc-pack.js`
- `modules/lfc-pack/test/p13g-late-fallback.cjs`
- `modules/lfc-pack/test/run.js`

Independently verify whether the test proves the late fallback occurs after earlier matching rows, whether the full-unpack JavaScript oracle is independent, and whether the recorded reset fault-injection claims and limitations are accurate. Review source-to-bundle consistency and the existing CI workflow only to report whether a separate minimal follow-up is warranted.

Preserve all existing Git work, branches, worktrees, dirty and untracked files. Verify Git status before acting. This assignment authorizes review and reporting only. Do not change production source, generated bundles, tests, CI workflows, configuration, dependencies, or repository instructions. Do not start a performance experiment, create a PR, merge to `main`, or modify canonical branches. Do not treat Android ARM64 Node correctness results as browser performance qualification. Any implementation or CI changes require separate explicit authorization.

Return concrete findings with file and line evidence. If the test remains sound with the documented limitations, say so. Do not broaden the task without a demonstrated defect.

---
