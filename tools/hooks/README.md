# House-rule git hooks

Copyright (c) 2026 JNFoo. All rights reserved.

Git does not copy hooks when it clones a repository, so these live in a tracked folder. Turn them on once per clone:

    sh tools/hooks/install.sh

- `commit-msg` blocks a commit whose message has a `Claude-Session:` line or a claude.ai link, or whose author or committer is not `JNFoo <45110762+JNFoo@users.noreply.github.com>`. A `Co-Authored-By` trailer is fine.
- `commit-msg` also blocks a version stamp in the message that is not `year.month.day.HHMM` with two-digit parts (for example `2026.10.14.0817`).
- `pre-commit` blocks the wrong author or committer early, and warns (never blocks) about British spellings in added lines. Put `spelling-ok` on a line to silence it.

Test them: `sh tools/hooks/test.sh` (builds a throwaway repository, 10 checks).

Why: these rules had to be repeated by the owner; a hook checks them every time. Claude Code's own commit reminder asks for a session line, and this hook is what stops it.
