# versions

One command keeps every module's and tool's version label the same everywhere.

`versions.py` reads `modules.json`, which holds the one true label for each module and tool, and copies it into every place that shows it: the module's header comment, any runtime `version` property, the first lines of its README, the root README tables, the front page and `llms.txt`. `set` changes one label and writes its changelog entries (a short one in the repo, a full one in the private folder), and `check` fails when any copy disagrees.

## Why it exists
A label that is written by hand in several places drifts apart, and a reader cannot tell which copy is right. Keeping one source and copying it by script means a copied file, its README and the tables all say the same thing, and `check` fails the moment they do not.

## The label
`1.2.3 · API 1`: classic major.minor.patch, plus an **API number that always equals the major**.

| Change | Bump | Example |
|---|---|---|
| A fix, nothing a user must do | patch (1.2.3 to 1.2.4) | a bug in a rarely used option |
| A new option or feature that breaks nobody | minor (1.2.3 to 1.3.0) | `fly-to-mini` gets `engine: 'transition'` (1.0.0 to 1.1.0) |
| Something an existing user could trip over: an option removed or renamed, a result that now means something else, a changed default that alters behavior | major (1.2.3 to 2.0.0), so the API number goes up | `frame-kit` changing the default of a guard |

Reading it: **same API number as your copy = you can drop the new file in. A higher API number = read the module's README ("What changed" or "Limits") first.** Docs-only, test-only and example-only changes keep the label.

## Changelogs
Every module and tool has two changelogs (the owner's rule, 2026-10-18). In the repo, a short `CHANGELOG.md` in its folder for the people who use it: newest version first, one plain line per change saying what a user will notice (at most 4 lines of 240 characters per version; no tables, test runs or jargon), and a note that the full details are kept privately. The full entry, with the numbers, test runs and browsers, goes to a private folder, one file per module or tool: `/mnt/project-files/changelogs-full/JS-modules/<id>.md`, or the folder named in `$CHANGELOGS_FULL`, or `.changelogs-full/` in the repo root (git-ignored) when neither exists; the knowledge base keeps a backup of that folder. `set` takes `--short` (the line a user reads; `\n` between lines) and `--note` (the full entry), and writes both with today's US Eastern date; without `--short` it uses the first sentence of `--note` and says so. The root [CHANGELOG.md](../../CHANGELOG.md) is generated from the short entries: where each module stands, plus the changes since labels began. `check` fails if a changelog is missing, if its newest entry is not the current version, if a short entry has a `Tested in:` line, a line over 240 characters or more than 4 lines, if the full changelog (when the private folder exists) is missing or behind, or if the root one is stale. History before 2026-10-16 sits under "Before version labels" in each short changelog.

**Developer changelog (since 2026-10-31, owner's rule).** Each module and tool also has a public `CHANGELOG-DEV.md` beside its README, for developers, with three depths under every version: **Quick** (one or two lines: what changed and whether old code breaks), **Details** (API changes, size and speed numbers with the browser named, how to upgrade) and **Deep** (design reasons, tests, what was tried). `set` writes it from `--quick "..."`, `--details "..."` (`\n` for more lines) and `--note` (Deep, the same text as the full entry). Without `--quick` it uses the first sentence of `--note`; without `--details` the tier is left out. It refuses to write the entry if any tier contains a name that must stay out of public files (the old format name, other project names, device and processor names, UTC). Users read `CHANGELOG.md`; the end-user file stays plain words with no jargon. Charts and feature highlights on the public pages are updated with each merge; the detail goes only into these changelogs.

## Which browsers tested a release
Every full changelog entry (in the private folder) ends with a `Tested in:` line, and the module's README repeats the newest one as `**Tested in:**` under the version line. It names each browser with its version (the test browsers are the ones on the `browsers` branch: Firefox, ungoogled Chromium, WebKitGTK), says what was not run, and says "not recorded" where nobody wrote it down. `set` without `--tested` writes "not recorded" and reminds you.

## Where it lives
`modules.json` is the source of truth (`version` and `api` next to each `id`). The script copies it into:
1. the module's header comment (`Version 1.2.3 (API 1)`), so a single copied file carries it, and any runtime `version: '1.2.3'` property in that module's source;
2. the first lines of the module's README (`**Version 1.2.3 · API 1**`);
3. a Version column in the root README tables, the front page, and a line in `llms.txt`;
4. the root README's "Pick a piece" tables and the "All at a glance" index under the title (names only, grouped as `categories` in `modules.json` says: Modules & Tools, Story editor packages and AI knowledge base, each with its groups; a tool is marked *(tool)* in the tables; the sizes are in the tables), written whole from `modules.json`: the same six columns in every table (Name, Version, Size, Gzipped, What it does, Demo), rows sorted by name inside each group, sizes in KB with one decimal. Size is the entry's `file` (a path, a list of paths, or a folder whose .js/.mjs/.cjs files count together) as it sits in the repository, and its gzip -9 size. Every entry needs a `short` line (at most 100 characters) and a size; a piece with no script says why in `sizeNote` and shows `n/a`. The front page (`index.html`) shows the same size after each name (`global X · 18.0 KB · docs`); `sizes` and `set` rewrite it and `check` fails when it is old.

Some modules expose `version` at runtime as part of their API. `set` updates those properties and `check` keeps them equal to the label; modules that do not expose a runtime version stay smaller.

## Commands
```
python3 tools/versions/versions.py list                 # every label
python3 tools/versions/versions.py check                # do all copies agree? (exit 1 if not)
python3 tools/versions/versions.py set fly-to-mini 1.2.0 --short "What a user will notice." --quick "One line for developers." --details "API and numbers." --note "Full entry with numbers."   # change one label everywhere; short entry in the repo, full entry in the private folder
python3 tools/versions/versions.py set fly-to-mini 1.2.0 --tested "Firefox 158, ungoogled Chromium 155, WebKitGTK 2.52.6" --short "..." --note "..."   # also records which browsers tested the release (in the full entry and the README)
```

Running `set` again for the same version replaces that version's entry in the repo changelog, the developer changelog and the full changelog, so a fix to the wording never leaves two entries. `check` flags a version listed twice.

```
python3 tools/versions/versions.py tested fly-to-mini 1.2.0 "WebKitGTK 2.52.6, Firefox 158"   # write or fix one full entry's Tested in line
python3 tools/versions/versions.py changelog            # rebuild the root CHANGELOG.md
python3 tools/versions/versions.py sizes [--story-editor DIR]   # rewrite the tables, the index and the front-page sizes; with a clone of the Story Editor repo, measure its packages and record them in modules.json (set does the rewrite too; check fails when the tables are old, a size is missing or a description is too long)
python3 tools/versions/versions.py init                 # labels 1.0.0 on anything that has none
python3 tools/versions/test/run.py                      # the tool's own checks (a temp repository, under a second)
```
The `pre-commit` hook runs `check --staged`: it **warns** when shipped code is staged with an unchanged label, or when copies disagree. `HOOKS_VERSION_STRICT=1` makes it block.

## Starting labels (2026-10-16)
Everything started at 1.0.0 with API 1, except `sprite-baker` (1.2.0, as it already said) and `fly-to-mini` (1.1.0, for the View Transitions engine). The dated stamps on `ppmd-decode` and `ppmd-pack` (2026.10.15.xxxx) were replaced. The dated stamp format (`YYYY.MM.DD.HHMM`, US Eastern) is still used for games and for commit messages.

## Prior art and credits
Written for this repository (LFC Foundry, MIT). `versions.py` uses only Python's standard library (`datetime`, `gzip`, `json`, `os`, `re`, `subprocess`, `sys`), and its header names no outside code. The major.minor.patch numbering is the common convention; the API number that always equals the major is this repository's own rule.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry

## What a changelog note must say
Two kinds. The `--short` line is for users: plain words, what they will notice, no tables or jargon, at most 4 lines of 240 characters; and each line carries a number, said plainly ("about twice as fast", "42 to 63% less memory"). The `--note` is the full entry for the private changelog: plain words, and numbers wherever there is something to count. Each improvement says how much (for example "3 times faster, 1.8 s instead of 5.4 s", "23 percent smaller") and where it was measured; each new feature says what it does and whether it is on by default; each fix says what went wrong before and what happens now. Say "not measured" rather than guess. The quantifying rule applies to the `--note` you pass to `versions.py set`. For speed, pass the A/B table's new/old time ratios with `--ratios 0.988,0.835` and write `{faster}` in the text: it becomes "1 to 17% faster", or, when a ratio is under 0.5, "21 to 43 times as fast (95 to 98% less time)".
