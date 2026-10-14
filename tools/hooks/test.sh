#!/bin/sh
# Copyright (c) 2026 JNFoo. All rights reserved.
# Tests the house-rule hooks in a throwaway repository: sh tools/hooks/test.sh
here=$(cd "$(dirname "$0")" && pwd); tmp=$(mktemp -d); pass=0; fail=0; n=0
cd "$tmp" && git init -q . && git config user.name JNFoo && git config user.email 45110762+JNFoo@users.noreply.github.com && git config core.hooksPath "$here"
t() { # name, expected (0 ok / 1 blocked), message
  printf '%s\n' "$3" > msg.txt; n=$((n+1)); echo "$n" > f.txt; git add f.txt
  if git commit -q -F msg.txt >/dev/null 2>&1; then got=0; else got=1; fi
  if [ "$got" = "$2" ]; then pass=$((pass+1)); echo "  ok   $1"; else fail=$((fail+1)); echo "  FAIL $1 (wanted $2, got $got)"; fi
}
t "plain message passes" 0 "Add a thing"
t "Co-Authored-By trailer passes" 0 "Add a thing

Co-Authored-By: Claude <noreply@anthropic.com>"
t "Claude-Session line is blocked" 1 "Add a thing

Claude-Session: https://claude.ai/code/session_x"
t "claude.ai link is blocked" 1 "See https://claude.ai/chat/abc"
t "good version stamp passes" 0 "Release 2026.10.14.0817"
t "stamp without a leading zero is blocked" 1 "Release 2026.10.14.817"
t "stamp with a one-digit month is blocked" 1 "Release 2026.1.14.0817"
t "stamp with hour 25 is blocked" 1 "Release 2026.10.14.2517"
t "stamp with minute 75 is blocked" 1 "Release 2026.10.14.1275"
git config user.name "Someone Else"; t "wrong author is blocked" 1 "Add a thing"
git config user.name JNFoo
echo "$pass passed, $fail failed"; rm -rf "$tmp"; [ "$fail" = 0 ]
