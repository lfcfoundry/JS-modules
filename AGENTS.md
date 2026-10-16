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

## Run the tests
`npm i playwright-core && CHROMIUM=/path/to/chrome node tests/run.js`

## Adding a module
1. Make `modules/<name>/` with the file(s), `README.md` (what it does, quick start, API, how it differs from existing open source, limits, a "For AI agents" section), `demo.html`, and a `test/` folder.
2. Add it to `modules.json`, `llms.txt`, `index.html` and the README table, and to `tests/kits.js` if it has its own tests.
3. Only add something that is not already well covered by open source, and say so honestly in the README. Where this repository already has something close, link it and say how they differ.

## Working with other sessions
Several AI sessions and people may push to this repository. Before you start, `git fetch` and read `TASKS.md`; put your row in it and push that small commit first. Rebase or merge on the latest `main` before you push, never force-push, and do not rewrite another session's files without saying so in the commit message.

## House-rule hooks

Run `sh tools/hooks/install.sh` once per clone (a Claude Code session does it for you through `.claude/settings.json`). `commit-msg` rejects a `Claude-Session:` line, a claude.ai link, any author or committer not on the allow-list in `tools/hooks/authors.txt` (it starts with JNFoo only; Claude is always refused) and a malformed version stamp; `pre-commit` repeats the author check, warns about British spellings and checks that new files carry the MIT header (HTML pages the LFC Foundry comment); `pre-push` applies the same message and author rules to every commit you are about to push, so a rebase or cherry-pick cannot slip past. They can still be skipped with `--no-verify` or by a clone that never ran the installer. See `tools/hooks/README.md`; run `sh tools/hooks/test.sh` after changing them.
