# Copyright (c) 2026 LFC Foundry. MIT License.
# The house rules in one place (see AGENTS.md). Sourced by commit-msg, pre-commit and pre-push so the three cannot drift apart. Never run directly.
#
# The rules, exactly as the owner set them (do not loosen or scope them without asking the owner; see README.md):
#  - no "Claude-Session:" line and no claude.ai link in a commit message (a Co-Authored-By trailer is fine)
#  - author AND committer are on the allow-list in tools/hooks/authors.txt (it starts with JNFoo and the noreply address only); a name or
#    address that contains "claude" or "anthropic" is always refused, even if someone puts it on the list
#  - any version stamp in a message is year.month.day.HHMM with two-digit parts
# Plain POSIX sh (awk, grep, sed). grep -o and \b work on GNU, BusyBox and BSD.

HR_NAME="JNFoo"
HR_MAIL="45110762+JNFoo@users.noreply.github.com"
HR_PREFIX="house rules: "
# The folder the hooks live in (the hook that sourced this file sets $here; the fallback is the repository's own copy).
[ -n "${here:-}" ] || here="$(git rev-parse --show-toplevel 2>/dev/null)/tools/hooks"
HR_AUTHORS="$here/authors.txt"

# hr_listed IDENT: 0 if "Name <email>" is allowed. Refused outright: anything with "claude" or "anthropic" in it. Allowed: an exact line of
# authors.txt (blank lines and lines starting with "#" are ignored). With no authors.txt the list is just JNFoo, so a broken checkout
# fails closed, not open.
hr_listed() {
  case $(printf '%s' "$1" | tr 'A-Z' 'a-z') in *claude*|*anthropic*) return 1 ;; esac
  if [ -f "$HR_AUTHORS" ]; then
    grep -v -e '^[[:space:]]*#' -e '^[[:space:]]*$' "$HR_AUTHORS" | sed 's/[[:space:]]*$//' | grep -qxF -- "$1"
  else
    [ "$1" = "$HR_NAME <$HR_MAIL>" ]
  fi
}

# hr_body FILE: the message text that counts when git hands a hook the message file. Drops git's own template comment block
# (from its "# Please enter ..." line to the end) and everything after the scissors line (the diff that --verbose appends).
# Every other line is kept and checked, including a line that starts with "#": git keeps those when the message came from -m or -F,
# so "-m 'text' with a '# https://claude.ai/...' line" is a real way to slip a link in. (This assumes git's default comment character.)
# Not skipped on purpose: a typed line that copies the template's first words. pre-push checks the finished messages in full.
hr_body() {
  awk '
    /^# -+ >8 -+$/ { exit }
    /^# Please enter (the commit message|a commit message)/ { skip = 1 }
    skip && /^#/ { next }
    { print }
  ' "$1"
}

# hr_message FILE MODE: print each problem with the message rules on stderr; return 1 if there is one.
# MODE "template" first drops git's template block (use it in commit-msg); MODE "final" checks the whole text (a finished message).
hr_message() {
  _bad=0
  if [ "$2" = final ]; then _text=$(cat "$1"); else _text=$(hr_body "$1"); fi
  # Only claude.ai/ is rejected. A claude.com/code link is NOT rejected: I could not confirm that Claude Code ever writes one. A Claude-Session
  # line is rejected whatever its domain. If the owner sees a claude.com/code session link in a message, add it to the pattern below.
  if printf '%s\n' "$_text" | grep -qiE '^(#[[:space:]]*)?Claude-Session:|claude\.ai/'; then
    echo "${HR_PREFIX}remove the Claude-Session line and any claude.ai link (house rule). A Co-Authored-By line is fine." >&2; _bad=1
  fi
  # a version stamp must look like year.month.day.HHMM (US Eastern), for example 2026.10.14.1630
  if printf '%s\n' "$_text" | grep -oE '\b20[0-9]{2}\.[0-9]{1,2}\.[0-9]{1,2}\.[0-9]+\b' | grep -vE '^20[0-9]{2}\.(0[1-9]|1[0-2])\.(0[1-9]|[12][0-9]|3[01])\.([01][0-9]|2[0-3])[0-5][0-9]$' | head -1 | grep -q .; then
    echo "${HR_PREFIX}a version stamp here is not year.month.day.HHMM with two-digit parts (for example 2026.10.14.0817). Fix it or reword." >&2; _bad=1
  fi
  return $_bad
}

# hr_check_idents: the author and committer git would use for the next commit. Return 1 (with a message) if either is not on the allow-list.
hr_check_idents() {
  _ibad=0
  for _v in GIT_AUTHOR_IDENT GIT_COMMITTER_IDENT; do
    _id=$(git var "$_v" 2>/dev/null | sed -E 's/ [0-9]+ [-+][0-9]{4}$//')
    hr_listed "$_id" || { echo "${HR_PREFIX}$_v is '$_id', which is not on the allow-list (tools/hooks/authors.txt). Owner: git config user.name $HR_NAME && git config user.email $HR_MAIL" >&2; _ibad=1; }
  done
  return $_ibad
}

# hr_commit SHA TMPFILE: check one existing commit (author, committer, full message). Problems go to stderr; return 1 if any.
hr_commit() {
  _cbad=0
  _ids=$(git log -1 --format='%an <%ae>%n%cn <%ce>' "$1" 2>/dev/null)
  _a=$(printf '%s\n' "$_ids" | sed -n 1p); _c=$(printf '%s\n' "$_ids" | sed -n 2p)
  hr_listed "$_a" || { echo "${HR_PREFIX}author is '$_a' (not on the allow-list in tools/hooks/authors.txt)" >&2; _cbad=1; }
  hr_listed "$_c" || { echo "${HR_PREFIX}committer is '$_c' (not on the allow-list in tools/hooks/authors.txt)" >&2; _cbad=1; }
  git log -1 --format=%B "$1" > "$2" 2>/dev/null
  hr_message "$2" final || _cbad=1
  return $_cbad
}
