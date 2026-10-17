# versions

One command keeps every module's and tool's version label the same everywhere.

## The label
`1.2.3 · API 1`: classic major.minor.patch, plus an **API number that always equals the major**.

| Change | Bump | Example |
|---|---|---|
| A fix, nothing a user must do | patch (1.2.3 to 1.2.4) | a bug in a rarely used option |
| A new option or feature that breaks nobody | minor (1.2.3 to 1.3.0) | `fly-to-mini` gets `engine: 'transition'` (1.0.0 to 1.1.0) |
| Something an existing user could trip over: an option removed or renamed, a result that now means something else, a changed default that alters behavior | major (1.2.3 to 2.0.0), so the API number goes up | `frame-kit` changing the default of a guard |

Reading it: **same API number as your copy = you can drop the new file in. A higher API number = read the module's README ("What changed" or "Limits") first.** Docs-only, test-only and example-only changes keep the label.

## Changelogs
Every module and tool has a `CHANGELOG.md` in its folder: newest version first, one or two plain sentences each (what a user would notice, not how it was done). `set` requires `--note` and writes the entry with today's US Eastern date. The root [CHANGELOG.md](../../CHANGELOG.md) is generated: where each module stands, plus the changes since labels began. `check` fails if a changelog is missing, if its newest entry is not the current version, or if the root one is stale. History before 2026-10-16 sits under "Before version labels" in each changelog, rebuilt from the commit log, the task board and the 2026-10-15 audit.

## Which browsers tested a release
Every changelog entry ends with a `Tested in:` line, and the module's README repeats the newest one as `**Tested in:**` under the version line. It names each browser with its version (the test browsers are the ones on the `browsers` branch: Firefox, ungoogled Chromium, WebKitGTK), says what was not run, and says "not recorded" where nobody wrote it down. `set` without `--tested` writes "not recorded" and reminds you.

## Where it lives
`modules.json` is the source of truth (`version` and `api` next to each `id`). The script copies it into:
1. the module's header comment (`Version 1.2.3 (API 1)`), so a single copied file carries it;
2. the first lines of the module's README (`**Version 1.2.3 · API 1**`);
3. a Version column in the root README tables, the front page, and a line in `llms.txt`.

`sprite-baker` also exposes `SpriteBaker.version` in code; the check keeps it equal to the label. Other modules do not (it would cost bytes in size-critical files).

## Commands
```
python3 tools/versions/versions.py list                 # every label
python3 tools/versions/versions.py check                # do all copies agree? (exit 1 if not)
python3 tools/versions/versions.py set fly-to-mini 1.2.0 --note "What changed, in plain words."   # change one label everywhere and add the changelog entry
python3 tools/versions/versions.py set fly-to-mini 1.2.0 --tested "Firefox 158, ungoogled Chromium 155, WebKitGTK 2.52.6" --note "..."   # also records which browsers tested the release
python3 tools/versions/versions.py tested fly-to-mini 1.2.0 "WebKitGTK 2.52.6, Firefox 158"   # write or fix one entry's Tested in line
python3 tools/versions/versions.py changelog            # rebuild the root CHANGELOG.md
python3 tools/versions/versions.py init                 # labels 1.0.0 on anything that has none
python3 tools/versions/test/run.py                      # the tool's own checks (a temp repository, under a second)
```
The `pre-commit` hook runs `check --staged`: it **warns** when shipped code is staged with an unchanged label, or when copies disagree. `HOOKS_VERSION_STRICT=1` makes it block.

## Starting labels (2026-10-16)
Everything started at 1.0.0 with API 1, except `sprite-baker` (1.2.0, as it already said) and `fly-to-mini` (1.1.0, for the View Transitions engine). The dated stamps on `ppmd-decode` and `ppmd-pack` (2026.10.15.xxxx) were replaced. The dated stamp format (`YYYY.MM.DD.HHMM`, US Eastern) is still used for games and for commit messages.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry

## What a changelog note must say
Plain words, and numbers wherever there is something to count. Each improvement says how much (for example "3 times faster, 1.8 s instead of 5.4 s", "23 percent smaller") and where it was measured; each new feature says what it does and whether it is on by default; each fix says what went wrong before and what happens now. Say "not measured" rather than guess. The rule applies to the `--note` you pass to `versions.py set`.
