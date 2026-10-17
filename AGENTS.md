# Notes for AI assistants (and the humans working with them)

This repository is meant to be read, copied from and extended by people and AI helpers together.

## Using a module in someone else's project
1. Open `modules.json`, pick the module, read its `README.md` (the "Limits" section matters).
2. Copy the single `.js` file into the project (keep its MIT header). No install step, no dependencies.
3. Wire it up with the snippet at the top of the file or in the README, and open the module's `demo.html` to see it working.

## Changing this repository
- Keep every module **free of dependencies** and, where it makes sense, **one file** (`frame-kit` is four small files that each work alone). Use ES5-compatible syntax (`var`, no build step), with the UMD wrapper at the top level (browser global + `module.exports`).
- Never throw out of a probe or a save; return a safe fallback.
- Add or update a check for every behavior you change: `tests/run.js` for the original modules, or the module's own `test/` folder (run all of those with `npm run test:kits`).
- Keep the header on each file: `Copyright (c) 2026 LFC Foundry. MIT License`. Contributions are accepted under the same license.
- Every HTML page here (demos, examples, tools, the front page) starts, right after `<!doctype html>`, with the LFC Foundry header comment in `tools/foundry-header.txt` (put the page's title where `{NAME}` stands; no `--` inside it). The one visible credit is a small footer line, `Forged by LFC Foundry • MIT Licensed`, at the end of each demo and tool page (not on internal test pages). Packed examples get the header added after packing, so it stays readable at the top. Commits are still authored and committed by JNFoo.
- Do not add game art, characters, brand names or text from Apple Press. Do not add code you cannot license under MIT, and say where an idea came from in the module README ("Prior art").
- Plain words in docs. Say what a thing does, then its limits.

## Version labels
Every module and tool has a label like `1.2.3 · API 1` (classic major.minor.patch, plus an API number that always equals the major). Patch = a fix, minor = a new option or feature that breaks nobody, major = something an existing user could trip over (an option removed or renamed, a result that now means something else). `modules.json` holds the label and `tools/versions/versions.py` copies it everywhere else; never edit the copies by hand. When you change a module's or tool's shipped code, run `python3 tools/versions/versions.py set <id> X.Y.Z --note "what changed, in plain words"` in the same commit; it updates the label everywhere and adds the entry to that module's `CHANGELOG.md`. Write the entry in plain words and quantify it: for every improvement say how much (how many milliseconds or percent faster, how many KB smaller, how many more cases caught) and in what test it was measured; for every new feature say plainly what it does and what the default is; for every fix say what went wrong before and what happens now. "Faster" or "better" alone is not enough. If a number was not measured, say that instead of guessing. Docs-only, test-only and example-only changes keep the label. `python3 tools/versions/versions.py check` must pass. See [tools/versions/README.md](tools/versions/README.md).

## Run the tests
`npm i playwright-core && CHROMIUM=/path/to/chrome node tests/run.js`

Test **only** with the browsers on the `browsers` branch of the private knowledge-base repository: **Firefox 158**, **ungoogled Chromium 155** and **WebKitGTK 2.52.6** (GNOME Web 46.5), on Linux. Read that branch's README before each test run, because versions may be updated and a browser may be added or removed; follow what it says then. Do not use Chromium 141 or 153 or Firefox 157 for new results. Run one browser at a time (two at once make timing flaky), point the tests at the install with `CHROMIUM`, `FIREFOX_PATH` and `GECKODRIVER_PATH` (WebKitGTK and GNOME Web only through WebDriver), and label every result with the browser and version that ran. Say so when a browser or a real phone was not checked. Keep the browser files out of this repository.

**Every release records its browsers.** Run `versions.py set <id> X.Y.Z --tested "Firefox 158, ungoogled Chromium 155, WebKitGTK 2.52.6" --note "..."`: the `--tested` text becomes the **Tested in** line of the changelog entry and of the module's README. Name each browser with its version, say what was not run, and write "not recorded" only when it truly is not known. Left out, the line says "not recorded" and the command reminds you. If you test an older release later, `versions.py tested <id> X.Y.Z "..."` fixes that entry's line.

## Adding a module
1. Make `modules/<name>/` with the file(s), `README.md` (what it does, quick start, API, how it differs from existing open source, limits, a "For AI agents" section), `demo.html`, and a `test/` folder.
2. Add it to `modules.json`, `llms.txt`, `index.html` and the README table, and to `tests/kits.js` if it has its own tests.
3. Only add something that is not already well covered by open source, and say so honestly in the README. Where this repository already has something close, link it and say how they differ.

## Working with other sessions
Several AI sessions and people may push to this repository. Before you start, `git fetch` and read `TASKS.md`; put your row in it and push that small commit first. Rebase or merge on the latest `main` before you push, never force-push, and do not rewrite another session's files without saying so in the commit message.

## House-rule hooks

Run `sh tools/hooks/install.sh` once per clone (a Claude Code session does it for you through `.claude/settings.json`). `commit-msg` rejects a `Claude-Session:` line, a claude.ai link, any author or committer not on the allow-list in `tools/hooks/authors.txt` (it starts with JNFoo only; Claude is always refused) and a malformed version stamp; `pre-commit` repeats the author check, warns about British spellings and checks that new files carry the MIT header (HTML pages the LFC Foundry comment); `pre-push` applies the same message and author rules to every commit you are about to push, so a rebase or cherry-pick cannot slip past. They can still be skipped with `--no-verify` or by a clone that never ran the installer. See `tools/hooks/README.md`; run `sh tools/hooks/test.sh` after changing them.
