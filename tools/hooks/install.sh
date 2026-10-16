#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Turns on the tracked house-rule hooks for this clone (git does not copy hooks when it clones): sh tools/hooks/install.sh
# Safe to run again. It points git's core.hooksPath at tools/hooks, which makes commit-msg, pre-commit and pre-push run.
# It does NOT silently replace a different core.hooksPath (another tool, such as husky or Git LFS setups, may own it):
# it prints what is set and leaves it alone, unless you pass --replace, which prints the old value and saves it as house.previousHooksPath.
# Everything is printed on standard output so a Claude Code SessionStart hook shows it to the session.
want="tools/hooks"; replace=0
[ "$1" = "--replace" ] && replace=1
cd "$(dirname "$0")" 2>/dev/null   # work on the clone this script lives in, wherever it was started from
root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "install.sh: this is not inside a git repository, so no hooks were turned on."; exit 1; }
cd "$root" || exit 1
[ -f "$want/house-rules.sh" ] || { echo "install.sh: $want/house-rules.sh not found in $root, so no hooks were turned on."; exit 1; }
chmod +x "$want/commit-msg" "$want/pre-commit" "$want/pre-push" 2>/dev/null
cur=$(git config --get core.hooksPath)
if [ -n "$cur" ] && [ "$cur" != "$want" ]; then
  if [ "$replace" = 1 ]; then
    git config house.previousHooksPath "$cur"
    echo "install.sh: core.hooksPath was '$cur'; replaced it with '$want' (the old value is saved as house.previousHooksPath; hooks in '$cur' no longer run)."
  else
    echo "install.sh: core.hooksPath is already '$cur', so NOTHING was changed and the house-rule hooks are NOT on."
    echo "install.sh: to switch to $want anyway (hooks in '$cur' will stop running), run: sh $want/install.sh --replace"
    exit 1
  fi
fi
git config core.hooksPath "$want" || { echo "install.sh: could not set core.hooksPath."; exit 1; }
echo "hooks on: $(git config core.hooksPath) (commit-msg, pre-commit, pre-push)"
# hooks that lived in the default folder stop running once core.hooksPath is set
old="$(git rev-parse --git-common-dir 2>/dev/null)/hooks"   # the default folder (git-path would now answer tools/hooks)
if [ -d "$old" ]; then
  stale=$(for h in "$old"/*; do [ -f "$h" ] && [ -x "$h" ] && case "$h" in *.sample) ;; *) basename "$h" ;; esac; done)
  [ -n "$stale" ] && echo "install.sh: note: these hooks in $old no longer run: $(echo $stale)"
fi
# the rules need the identity to be right; install.sh never changes it
who="$(git config user.name) <$(git config user.email)>"
[ "$who" = "JNFoo <45110762+JNFoo@users.noreply.github.com>" ] || echo "install.sh: note: git identity is '$who'. Commits are blocked until: git config user.name JNFoo && git config user.email 45110762+JNFoo@users.noreply.github.com"
exit 0
