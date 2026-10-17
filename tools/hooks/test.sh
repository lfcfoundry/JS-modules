#!/bin/sh
# Copyright (c) 2026 LFC Foundry. MIT License.
# Tests the house-rule hooks in throwaway repositories: sh tools/hooks/test.sh
# It never touches the real repository: every git command runs in a fresh folder made by mktemp, and the script refuses to start if
# that folder would be inside this repository. It also clears the git identity variables, so "wrong author" fails for the right reason.
here=$(cd "$(dirname "$0")" && pwd) || exit 1
root=$(cd "$here/../.." && pwd -P) || exit 1
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_AUTHOR_DATE GIT_COMMITTER_DATE EMAIL
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR GIT_PREFIX GIT_CONFIG_COUNT HOOKS_HEADER_STRICT
GIT_CONFIG_GLOBAL=/dev/null; GIT_CONFIG_NOSYSTEM=1; export GIT_CONFIG_GLOBAL GIT_CONFIG_NOSYSTEM
tmp=$(mktemp -d) || { echo "test.sh: cannot make a scratch folder"; exit 1; }
tmp=$(cd "$tmp" && pwd -P) || exit 1
case "$tmp/" in "$root/"*) echo "test.sh: refusing to run, the scratch folder $tmp is inside the repository $root"; rm -rf "$tmp"; exit 1 ;; esac
cd "$tmp" || exit 1
trap 'cd /; rm -rf "$tmp"' EXIT HUP INT TERM
pass=0; fail=0; n=0
MAIL=45110762+JNFoo@users.noreply.github.com
say() { # name, wanted, got
  if [ "$3" = "$2" ]; then pass=$((pass+1)); echo "  ok   $1"; else fail=$((fail+1)); echo "  FAIL $1 (wanted $2, got $3)"; fi
}
seen() { if grep -qF -- "$3" "$2"; then say "$1" yes yes; else say "$1" yes no; fi; }      # name, file, text that must be in it
unseen() { if grep -qF -- "$3" "$2"; then say "$1" no yes; else say "$1" no no; fi; }      # name, file, text that must not be in it
newrepo() { # folder: a scratch repository with the right identity and the hooks on
  mkdir "$1" && cd "$1" || exit 1
  git init -q . && git symbolic-ref HEAD refs/heads/main || exit 1
  [ "$(git rev-parse --show-toplevel)" = "$(pwd -P)" ] || { echo "test.sh: the scratch repository is not where it should be"; exit 1; }
  git config user.name JNFoo && git config user.email "$MAIL" && git config core.hooksPath "$here" && git config commit.gpgsign false
}
cm() { git commit -q "$@" >out.txt 2>&1; echo $?; }    # commit, keep the hook output in out.txt, print the exit status
t() { # name, expected (0 ok / 1 blocked), message
  printf '%s\n' "$3" > msg.txt; n=$((n+1)); echo "$n" > f.txt; git add f.txt
  if git commit -q -F msg.txt >/dev/null 2>&1; then got=0; else got=1; fi
  say "$1" "$2" "$got"
}

echo "commit-msg and pre-commit"
newrepo "$tmp/main"
t "plain message passes" 0 "Add a thing"
t "Co-Authored-By trailer passes" 0 "Add a thing

Co-Authored-By: Claude <noreply@anthropic.com>"
t "Claude-Session line is blocked" 1 "Add a thing

Claude-Session: https://claude.ai/code/session_x"
t "claude.ai link is blocked" 1 "See https://claude.ai/chat/abc"
t "a # line holding a claude.ai link is blocked" 1 "Add a thing

# https://claude.ai/code/session_x"
t "a # line holding a Claude-Session line is blocked" 1 "Add a thing
# Claude-Session: abc"
t "an ordinary # note line passes" 0 "Add a thing

# just a note to myself"
t "good version stamp passes" 0 "Release 2026.10.14.0817"
t "stamp without a leading zero is blocked" 1 "Release 2026.10.14.817"
t "stamp with a one-digit month is blocked" 1 "Release 2026.1.14.0817"
t "stamp with hour 25 is blocked" 1 "Release 2026.10.14.2517"
t "stamp with minute 75 is blocked" 1 "Release 2026.10.14.1275"
git config user.name "Someone Else"; t "wrong author is blocked" 1 "Add a thing"
git config user.name JNFoo
GIT_COMMITTER_NAME=Other; export GIT_COMMITTER_NAME; t "wrong committer is blocked" 1 "Add a thing"; unset GIT_COMMITTER_NAME
GIT_AUTHOR_EMAIL=other@example.com; export GIT_AUTHOR_EMAIL; t "wrong author email from the environment is blocked" 1 "Add a thing"; unset GIT_AUTHOR_EMAIL

# git's own template comment block (and the diff under the scissors line) must be skipped, even when it mentions claude.ai/
printf '#!/bin/sh\ncp "$1" "$TMPSEEN"\n' > "$tmp/ed.sh"; TMPSEEN="$tmp/seen.txt"; export TMPSEEN
mkdir -p docs/claude.ai && echo hi > docs/claude.ai/notes.txt && git add docs
r=$(GIT_EDITOR="sh $tmp/ed.sh" cm -e -m "Add notes")
say "git's template comment block is skipped (a staged path in it mentions claude.ai/)" 0 "$r"
seen "  (that test really did show the hook a template with that path)" "$tmp/seen.txt" "docs/claude.ai/notes.txt"
printf 'see https://claude.ai/code/x\n' > doc.txt; git add doc.txt
r=$(GIT_EDITOR="sh $tmp/ed.sh" cm -e --verbose -m "Add doc")
say "the diff under the scissors line is skipped (--verbose, added text mentions claude.ai/)" 0 "$r"
seen "  (that test really did show the hook a scissors line)" "$tmp/seen.txt" ">8"

# pre-commit: spelling warnings never block
printf 'The colours are bright\nTwo behaviours differ\nBoth centres agree\nWe optimise early\nRun initialisation now\n' > words.txt; git add words.txt   # spelling-ok
r=$(cm -m "Words")
say "British spellings only warn, the commit goes through" 0 "$r"
for w in colours behaviours centres optimise initialisation; do seen "spelling warning names '$w'" out.txt "$w"; done   # spelling-ok
printf 'const colourMap = get_colour_value();\n.colour-swatch { margin: 0 }\nobj.centre = 1;\ncentre(2);\nimport x from "./colour/index.js";\n' > ids.js
sed -i '1i // Copyright (c) 2026 LFC Foundry. MIT License' ids.js; git add ids.js
r=$(cm -m "Identifiers")
unseen "identifiers and paths with such words are not flagged" out.txt "British spelling"
printf 'The colour is red // spelling-ok\n' > ok.txt; git add ok.txt; r=$(cm -m "Quoted")
unseen "spelling-ok silences a line" out.txt "British spelling"
printf '++colours;\n' > plus.txt; git add plus.txt; r=$(cm -m "Plus")   # spelling-ok
seen "an added line that starts with ++ is still scanned" out.txt "colours"   # spelling-ok
printf 'The colors are bright, we optimize, the center holds, a gray day\n' > us.txt; git add us.txt; r=$(cm -m "American")
unseen "American spelling is not flagged" out.txt "British spelling"
i=0; : > old.txt; while [ $i -lt 12 ]; do echo "line number $i of the old file" >> old.txt; i=$((i+1)); done
git add old.txt; r=$(cm -m "Old file")
git mv old.txt new.txt; echo "and the colours of the new line" >> new.txt; git add new.txt; r=$(cm -m "Renamed and edited")   # spelling-ok
seen "a renamed-and-edited file is scanned (and the warning names the new path)" out.txt "new.txt"

# pre-commit: headers on NEW files only (warn; HOOKS_HEADER_STRICT=1 blocks)
printf 'var a = 1;\n' > nohdr.js; git add nohdr.js; r=$(cm -m "No header")
say "a new .js file with no header only warns" 0 "$r"; seen "  the warning names the file" out.txt "nohdr.js"
printf '// Copyright (c) 2026 LFC Foundry. MIT License\nvar a = 1;\n' > hdr.js; git add hdr.js; r=$(cm -m "Header")
unseen "a new .js file with the MIT header is silent" out.txt "pre-commit (header)"
printf '#!/bin/sh\n# Copyright (c) 2026 LFC Foundry. MIT License.\ntrue\n' > hdr.sh; printf '#!/bin/sh\ntrue\n' > nohdr.sh; git add hdr.sh nohdr.sh; r=$(cm -m "Shell files")
seen "a new .sh file with no header is named" out.txt "nohdr.sh"; unseen "a new .sh file with the header (after the shebang) is not named" out.txt "(header): hdr.sh"
printf '# nothing here\nprint(1)\n' > nohdr.py; git add nohdr.py; r=$(cm -m "Python")
seen "a new .py file with no header is named" out.txt "nohdr.py"
printf '<!doctype html>\n<title>x</title>\n' > nohdr.html; git add nohdr.html; r=$(cm -m "Page")
seen "a new .html file without the foundry header is named" out.txt "nohdr.html"
{ printf '<!doctype html>\n'; sed 's/{NAME}/Test page/' "$here/../foundry-header.txt"; printf '<title>x</title>\n'; } > hdr.html; git add hdr.html; r=$(cm -m "Page with header")
unseen "a new .html file with the foundry header is silent" out.txt "pre-commit (header)"
echo "var a = 2;" >> nohdr.js; git add nohdr.js; r=$(cm -m "Edit only")
unseen "editing an existing file does not ask for a header" out.txt "pre-commit (header)"
mkdir -p vendor && printf 'var v = 1;\n' > vendor/lib.js; git add vendor; r=$(cm -m "Vendored")
unseen "vendored files are exempt from the header check" out.txt "pre-commit (header)"
printf 'var b = 1;\n' > strict.js; git add strict.js
HOOKS_HEADER_STRICT=1; export HOOKS_HEADER_STRICT; r=$(cm -m "Strict"); unset HOOKS_HEADER_STRICT
say "HOOKS_HEADER_STRICT=1 blocks a new file with no header" 1 "$r"
git reset -q strict.js; rm -f strict.js

echo "pre-push and install.sh"
git init -q --bare "$tmp/remote.git" || exit 1
newrepo "$tmp/work"
git remote add origin "$tmp/remote.git"
push() { git push -q "$@" >out.txt 2>&1; echo $?; }       # push, keep the hook output in out.txt, print the exit status
bad() { git commit -q --no-verify "$@" >/dev/null 2>&1; }  # a commit made without the commit hooks (like a rebase or cherry-pick)
echo one > a.txt; git add a.txt; git commit -q -m "First" >/dev/null 2>&1
say "a good push passes" 0 "$(push origin main)"
echo two > b.txt; git add b.txt
GIT_COMMITTER_NAME=Other; export GIT_COMMITTER_NAME; bad -m "Rewritten by a rebase"; unset GIT_COMMITTER_NAME
say "an outgoing commit with the wrong committer is stopped" 1 "$(push origin main)"; seen "  the message names the problem" out.txt "committer is"
git reset -q --hard HEAD~1
echo two > b.txt; git add b.txt; bad -m "Other author" --author="Someone Else <else@example.com>"
say "an outgoing commit with the wrong author is stopped" 1 "$(push origin main)"; seen "  the message names the problem" out.txt "author is"
git reset -q --hard HEAD~1
echo two > b.txt; git add b.txt; bad -m "Add b

Claude-Session: https://claude.ai/code/session_x"
say "an outgoing commit with a Claude-Session line is stopped" 1 "$(push origin main)"
git reset -q --hard HEAD~1
echo two > b.txt; git add b.txt; bad -m "Add b

# https://claude.ai/code/session_x"
say "an outgoing commit with a # line holding a claude.ai link is stopped" 1 "$(push origin main)"
git reset -q --hard HEAD~1
git checkout -q -b side; echo side > s.txt; git add s.txt; git commit -q -m "Side work" >/dev/null 2>&1; git checkout -q main
GIT_COMMITTER_NAME=Other; GIT_COMMITTER_EMAIL=other@example.com; export GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL
git -c core.hooksPath=/dev/null cherry-pick side >/dev/null 2>&1; who=$(git log -1 --format=%cn); unset GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL
say "  (setup: the cherry-pick really made a commit with another committer)" Other "$who"
say "a cherry-picked commit with another committer is stopped at push" 1 "$(push origin main)"
git reset -q --hard HEAD~1
echo two > b.txt; git add b.txt; git commit -q -m "Good two" >/dev/null 2>&1
echo three > c.txt; git add c.txt; bad -m "Bad three" --author="Someone Else <else@example.com>"
say "one bad commit among several stops the push" 1 "$(push origin main)"
seen "  the bad commit is named" out.txt "Bad three"; unseen "  the good commit is not named" out.txt "Good two"
git reset -q --hard HEAD~1
say "two good commits push" 0 "$(push origin main)"
# history the remote already has is not judged again, and only new commits on a new branch are checked
echo old > old.txt; git add old.txt; bad -m "Old and bad" --author="Someone Else <else@example.com>"
say "(setup) a bad commit pushed with --no-verify gets in" 0 "$(push --no-verify origin main)"
git checkout -q -b feature; echo new > n.txt; git add n.txt; git commit -q -m "New and good" >/dev/null 2>&1
say "a new branch with only good new commits passes although old history has a bad commit" 0 "$(push origin feature)"
echo more > m.txt; git add m.txt; bad -m "New and bad" --author="Someone Else <else@example.com>"
say "a new bad commit on that branch is stopped" 1 "$(push origin feature)"
git reset -q --hard HEAD~1
say "deleting a remote branch passes" 0 "$(push origin :feature)"
# a commit the remote already holds on another branch (for example a merge GitHub made) is not judged again when it first reaches this branch
say "(setup) an older tip on a remote branch" 0 "$(push origin main~1:refs/heads/topic)"
git checkout -q -b topic main; echo t > t.txt; git add t.txt; git commit -q -m "Topic good" >/dev/null 2>&1
say "an existing branch picking up a bad commit that another remote branch already holds passes" 0 "$(push origin topic)"
echo u > u.txt; git add u.txt; bad -m "Topic bad" --author="Someone Else <else@example.com>"
say "a new bad commit on it is still stopped" 1 "$(push origin topic)"; unseen "  the old commit is not named" out.txt "Old and bad"
git reset -q --hard HEAD~1; git checkout -q main

# the author allow-list (tools/hooks/authors.txt): a copy of the hooks with one extra person listed, and Claude listed on purpose
cd "$tmp" && mkdir hooks2 && cp "$here"/* hooks2/ && printf 'JNFoo <%s>\nPat Doe <pat@example.com>\nClaude <noreply@anthropic.com>\n' "$MAIL" > hooks2/authors.txt
newrepo "$tmp/list" && git config core.hooksPath "$tmp/hooks2"
git config user.name "Pat Doe"; git config user.email pat@example.com; t "a person on the allow-list may commit" 0 "Add a thing"
git config user.name "Pat Doe"; git config user.email other@example.com; t "the right name with an unlisted address is blocked" 1 "Add a thing"
git config user.name Claude; git config user.email noreply@anthropic.com; t "Claude is blocked even when listed" 1 "Add a thing"
git config user.name JNFoo; git config user.email "$MAIL"; t "the owner still passes with the extra people listed" 0 "Add a thing"
rm "$tmp/hooks2/authors.txt"; git config user.name "Pat Doe"; git config user.email pat@example.com; t "with no authors.txt only the owner passes" 1 "Add a thing"
cd "$tmp"

# install.sh: sets the path, leaves a different one alone unless told, reports what it did
mkdir "$tmp/inst" && cd "$tmp/inst" && git init -q . && git config user.name JNFoo && git config user.email "$MAIL" || exit 1
mkdir -p tools && cp -R "$here" tools/hooks && chmod -x tools/hooks/pre-push
printf '#!/bin/sh\nexit 0\n' > .git/hooks/pre-merge-commit; chmod +x .git/hooks/pre-merge-commit
sh tools/hooks/install.sh > out.txt 2>&1; st=$?
say "install.sh turns the hooks on" tools/hooks "$(git config core.hooksPath)"; say "  and exits 0" 0 "$st"
seen "  and says so" out.txt "hooks on: tools/hooks"; seen "  and names a hook in .git/hooks that no longer runs" out.txt "pre-merge-commit"
if [ -x tools/hooks/pre-push ]; then say "install.sh makes pre-push executable" yes yes; else say "install.sh makes pre-push executable" yes no; fi
sh tools/hooks/install.sh > out.txt 2>&1; say "install.sh can run twice" 0 "$?"
git config core.hooksPath .husky
sh tools/hooks/install.sh > out.txt 2>&1; st=$?
say "install.sh does not replace a different core.hooksPath" .husky "$(git config core.hooksPath)"; say "  exits 1" 1 "$st"
seen "  prints the existing path" out.txt ".husky"; seen "  and how to replace it" out.txt "--replace"
sh tools/hooks/install.sh --replace > out.txt 2>&1
say "install.sh --replace switches" tools/hooks "$(git config core.hooksPath)"; say "  and saves the old value" .husky "$(git config house.previousHooksPath)"
seen "  and prints the old value" out.txt "was '.husky'"

echo "$pass passed, $fail failed"; [ "$fail" = 0 ]
