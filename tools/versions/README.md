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
python3 tools/versions/versions.py set fly-to-mini 1.2.0   # change one label everywhere
python3 tools/versions/versions.py init                 # labels 1.0.0 on anything that has none
python3 tools/versions/test/run.py                      # the tool's own checks (a temp repository, under a second)
```
The `pre-commit` hook runs `check --staged`: it **warns** when shipped code is staged with an unchanged label, or when copies disagree. `HOOKS_VERSION_STRICT=1` makes it block.

## Starting labels (2026-10-16)
Everything started at 1.0.0 with API 1, except `sprite-baker` (1.2.0, as it already said) and `fly-to-mini` (1.1.0, for the View Transitions engine). The dated stamps on `ppmd-decode` and `ppmd-pack` (2026.10.15.xxxx) were replaced. The dated stamp format (`YYYY.MM.DD.HHMM`, US Eastern) is still used for games and for commit messages.

---
Part of [JS-modules](../../README.md) · MIT License · Copyright (c) 2026 LFC Foundry
