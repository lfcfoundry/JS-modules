# Task board

One row per module or piece of work. Update your row in its own small commit before you start and when you finish (see [AGENTS.md](AGENTS.md)).

| Module / task | Status | Owner (session or person) | Notes |
|---|---|---|---|
| `modules/lzma-decode` + `tools/lzma-pack` | done | first session | decoder, packer, 140 decoder checks against Python's lzma, 14 browser checks |
| `frame-kit` | done | first session | EvenDt, QualityGovernor, JobPump; 35 checks |
| `fuzz-kit` | done | first session | seeded fuzzer, Playwright and Puppeteer runners, hook stripper; 21 engine checks, 9 browser checks |
| `sprite-baker` | done | first session | software 3D rasterizer for baked sprites; 29 checks |
| `pad-nav` | done | first session | Gamepad API to DOM focus; 105 checks, Chromium only, no real controller tried |
| `canvas-probe` (test-only: save/restore depth, canvas calls per frame, draws below half size, overhanging source rectangles, style-write repeats) and house-rule git hooks (`tools/hooks`) | in progress | the Fancy, the Banana session (Oct 14) | Owner chose both by pop-up on 2026-10-13 after the knowledge-base cross-check (`FANCY-BANANA-CROSSCHECK.md`). No prior art for the probe in this repository. Hooks are shell, not a module. |
| Run `fuzz-kit` and `pad-nav` in Firefox and WebKit | open | | the Playwright runner takes `--browser firefox` / `webkit`; only Chromium (and Firefox for the fuzzer) has been run |
| Candidate: save codes (URL-safe base64, FNV checksum, `CompressionStream` with fallback) | open: needs a prior-art check | | lz-string and similar exist; publish only if it adds something |
| Candidate: single-file game "Test Lab" panel (live tuning in a shipped build) | open: needs a decision | | game-specific today; see the source game's `tester/tester.js` |
| GitHub Pages for this repository | open | repository owner | enabling it would serve each module's `example/index.html`; note the `bytes` example of `lzma-pack` needs a server without a utf-8 charset header (use the base64 example on Pages) |
| Story packages (`story-format`, `story-check`, `story-player`, `story-map`, `zip-page`, `qa-kit`, `ai-collab-kit`) | done 2026-10-12 | session p-see-story-editor-c9 | They are cut from the Story Editor's own sources, so they live in https://github.com/JNFoo/p-see-story-editor under `packages/` (single source of truth, drift-checked), not here. Published in commit f457d1c of that repo; cross-links added both ways. Not copying: drag-reorder, spotlight tour and safe storage from the editor UI (SortableJS, Shepherd/driver.js and this repo's `save-kit` already cover them). `zip-page` overlaps `tools/single-file-tools/pack.py` and `lzma-pack`; it adds a pure-JS inflate fallback for browsers without `DecompressionStream`. |
| Regroup the public page, README table, llms.txt and modules.json by function (games / story editor / tools) | done 2026-10-12 | JNFoo's master-guide conversation | Page, README, llms.txt and modules.json are grouped by function (games / story editor / tools). modules.json has `side` and `category` on every entry; when you add a module, give it both and place it under a group on the page. No module code changed. |

| Re-sync local clones of `fancy-banana`, `apple-press`, `p-see-story-editor` | note | any session | on 2026-10-12 their history was rewritten so no commit or file says the owner's former name (authors and the copyright line are JNFoo). Local clones must `git fetch && git reset --hard origin/main`; do not push old commits back. Backups are not in the repos. |
| Re-sync local clones of `JS-modules`, `apple-press`, `fancy-banana`, `pineapple-defense`, `p-see-story-editor` (second rewrite) | note | any session | on 2026-10-13 the owner asked for every commit to show JNFoo as author and committer, so the history of these five was rewritten again: only author, committer and the removal of `Claude-Session:` lines changed (file contents and commit counts are identical; `Co-Authored-By` lines stay). Before you continue, save any unpushed work (a patch file or a branch), then `git fetch && git reset --hard origin/main` (or rebase your unpushed commits onto `origin/main`), and run `git config user.name JNFoo && git config user.email 45110762+JNFoo@users.noreply.github.com` so new commits are authored as JNFoo. Do not push old commits back. |

Status values: `open`, `in progress`, `done`, `blocked`.
