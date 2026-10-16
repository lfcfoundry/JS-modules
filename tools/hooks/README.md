# House-rule git hooks

Copyright (c) 2026 LFC Foundry. MIT License.

Git does not copy hooks when it clones a repository, so these live in a tracked folder. Turn them on once per clone:

    sh tools/hooks/install.sh

`install.sh` points git's `core.hooksPath` at `tools/hooks` and makes the hook files executable. Run it again any time; it is safe. It prints what it did.

- If `core.hooksPath` is already set to something else (another tool may own it), `install.sh` **does not replace it**. It prints the existing path, changes nothing and exits 1. To switch anyway, run `sh tools/hooks/install.sh --replace`: it prints the old value and saves it as `git config house.previousHooksPath`.
- It also names any hooks left in `.git/hooks` that stop running once the path is set.
- It never changes your git identity; it only tells you if the identity is not on the allow-list.

**Claude Code sessions** get this automatically: `.claude/settings.json` at the repository root has one `SessionStart` hook that runs `install.sh`, so a fresh cloud clone is protected without anyone remembering. It only helps Claude Code; a plain terminal, another tool or a clone made some other way still needs the manual command. (Claude Code asks a person to approve project hooks the first time; the script only sets one local git setting.)

## The rules (exactly as the owner set them)
- No `Claude-Session:` line and no `claude.ai/` link in a commit message. A `Co-Authored-By` trailer is fine.
- Author **and** committer must be a `Name <email>` line in `tools/hooks/authors.txt`. The file starts with only `JNFoo <45110762+JNFoo@users.noreply.github.com>`; adding an outside contributor is a deliberate edit to that file. A name or address containing `claude` or `anthropic` is always refused, even if listed. With no `authors.txt` only JNFoo passes.
- A version stamp in a message must be `year.month.day.HHMM` with two-digit parts (for example `2026.10.14.0817`).
- American spelling in added lines (a warning).
- The MIT header on every new `.js`, `.py` and `.sh` file, and the LFC Foundry comment right after `<!doctype html>` on every new `.html` file (a warning).

The message and identity rules live once, in `house-rules.sh`, which the three hooks share, so they cannot drift apart. `AGENTS.md` lists the same rules for people and AI helpers.

## The hooks
- **`commit-msg`** checks the message rules and the author and committer. Lines that start with `#` **are checked** (git keeps them when the message comes from `-m` or `-F`, so `-m "text\n# https://claude.ai/..."` used to slip through). Only git's own template comment block (from its `# Please enter ...` line to the end) and everything after a scissors line (the diff that `--verbose` adds) is skipped. A `claude.com/code` link is **not** rejected: I could not confirm that Claude Code writes one. A `Claude-Session:` line is rejected on any domain. If a `claude.com/code` session link ever shows up in a message, add it to the pattern in `house-rules.sh`.
- **`pre-commit`** stops a wrong author or committer early. It only warns (never blocks) about:
  - **British spellings** in added lines: whole words and their plurals and endings (`colours`, `behaviours`, `centres`, `grey`, `licence`, `programme`, `analysed`) and the `-ise` family (`optimise`, `initialise`, `serialise`, `normalisation`, `organiser` ...). Only whole words are matched, so names such as `colourMap`, `get_colour_value`, `.colour-swatch`, `obj.centre`, `centre(2)` and paths such as `./colour/index.js` are left alone. Put `spelling-ok` on a line to silence it (quoted source, proper names, CSS keywords). It scans added, copied, modified and renamed files (`--diff-filter=ACMR`), and a line that itself begins with `++` is scanned too.
  - **Headers on new files**: a new `.js`, `.py` or `.sh` file without `Copyright (c) 2026 LFC Foundry. MIT License` in its first 15 lines, and a new `.html` file that does not begin with `<!doctype html>` followed by the LFC Foundry header comment (`tools/foundry-header.txt`). Files in `node_modules/`, `vendor/` and `*.min.js` are exempt, and only new files are checked, never edits. Set `HOOKS_HEADER_STRICT=1` to make a missing header block the commit.
- **`pre-push`** is the backstop. Git hands it the refs being pushed, and it applies the message, author and committer rules to **every outgoing commit**. For an existing branch that is the range the remote does not have; for a new branch it is every commit no known remote branch has. Old history the remote already holds is not judged again. It prints which commits are wrong and how to fix them, and stops the push. Deleting a branch is not checked.

## Why these are needed
The commit-time hooks sit on one door of a house with several.
- **Rebases and cherry-picks.** `commit-msg` runs for `git commit` and `git merge`, not for commits that a rebase or cherry-pick replays. `AGENTS.md` tells helpers to rebase before pushing, and a replay by a helper with the wrong identity rewrites the committer. This is what already cost history rewrites. `pre-push` sees the finished commits.
- **Fresh clones.** Every new cloud session starts from a clean clone with nothing installed, which is why the `SessionStart` hook runs `install.sh`.
- **`--no-verify` can still skip them.** `git commit --no-verify` and `git push --no-verify` skip these hooks, and nothing records it. That is deliberate in git, so these hooks catch the common slip, not a determined bypass.
- **Commits made elsewhere.** Commits made on the GitHub website or through an API tool never run local hooks (and the website's committer is `GitHub`, which the rule would reject). A check on GitHub itself (an Actions workflow) would be the only backstop that does not depend on the local clone; it is not built yet.

## Outside contributors
The author rule used to allow only JNFoo, which stopped an outside person who ran `install.sh` from committing under their own name. Now the rule is the allow-list above: the owner adds a person to `authors.txt` when they join. Claude and bot identities stay refused.

## Test
`sh tools/hooks/test.sh` builds throwaway repositories (and a throwaway bare remote) under `mktemp`, clears the git identity variables first, and runs 76 checks: 46 for `commit-msg` and `pre-commit` (messages, identities, the template and scissors skips, spelling, headers) and 30 for `pre-push` and `install.sh`. It refuses to start if the scratch folder would be inside the real repository and stops if `mktemp` or `cd` fails.

Why: these rules had to be repeated by the owner; a hook checks them every time. Claude Code's own commit reminder asks for a session line, and this hook is what stops it.
