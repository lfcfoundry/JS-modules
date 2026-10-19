#!/bin/bash
# Copyright (c) 2026 LFC Foundry. MIT License. Forged by LFC Foundry.
# Session-start hook: installs the four standing test browsers (copy of tools/boot-browsers.sh in lfcfoundry/knowledge-base). Runs only in cloud sessions.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
#
# One command that gets a fresh Linux x86_64 machine ready to test in the four standing browsers (Firefox 158.0, ungoogled-chromium 155.0.8059.39-1,
# WebKitGTK 2.52.6, GNOME Web 46.5) and writes ~/.lfc-browsers.env with the paths the tests read. Safe to run again: it skips what is already there.
#   sh tools/boot-browsers.sh            (about 1 to 2 minutes the first time, a few seconds after)
# Runs as a cloud-environment setup script or a session-start hook. Needs git access to lfcfoundry/knowledge-base (attached to the project) and, for
# WebKitGTK and GNOME Web, root or sudo. It never fails the session: a step that cannot run says why and the script goes on.
set -u
REPO=${KB_REPO:-https://github.com/lfcfoundry/knowledge-base}
HERE_ROOT=${BROWSERS_HOME:-$HOME}
KB=$HERE_ROOT/kb-browsers
DEST=$HERE_ROOT/browsers
ENVF=$HOME/.lfc-browsers.env
say() { echo "boot-browsers: $*" >&2; }

if [ ! -d "$KB/.git" ]; then
  git clone -q --branch browsers --single-branch --depth 1 "$REPO" "$KB" 2>/dev/null || { say "could not clone the browsers branch of $REPO (attach lfcfoundry/knowledge-base to the project)"; exit 0; }
else
  git -C "$KB" fetch -q --depth 1 origin browsers 2>/dev/null && git -C "$KB" reset -q --hard FETCH_HEAD 2>/dev/null
fi

CHROME=$(ls -d "$DEST"/ungoogled-chromium-*/chrome 2>/dev/null | head -1)
if [ -z "$CHROME" ] || [ ! -x "$DEST/firefox/firefox" ] || [ ! -x /usr/bin/epiphany ]; then
  sh "$KB/install.sh" "$DEST" >&2 || say "install.sh reported a problem; see above"
fi

# The two small helper packages the browser tests use (Playwright for Chromium, Puppeteer for Firefox).
[ -d /tmp/pw/node_modules/playwright-core ] || { mkdir -p /tmp/pw && (cd /tmp/pw && npm install --silent --no-audit --no-fund playwright-core@1.64.1 >/dev/null 2>&1) || say "playwright-core did not install"; }
[ -d /tmp/pptr/node_modules/puppeteer-core ] || { mkdir -p /tmp/pptr && (cd /tmp/pptr && npm install --silent --no-audit --no-fund puppeteer-core@25.14.0 >/dev/null 2>&1) || say "puppeteer-core did not install"; }

CHROME=$(ls -d "$DEST"/ungoogled-chromium-*/chrome 2>/dev/null | head -1)
cat > "$ENVF" <<EOT
# written by tools/boot-browsers.sh; "source" it, or copy the values
export NFM_CHROME=$CHROME
export NFM_FIREFOX=$DEST/firefox/firefox
export NFM_PLAYWRIGHT=/tmp/pw/node_modules/playwright-core
export NFM_PUPPETEER=/tmp/pptr/node_modules/puppeteer-core
export FIREFOX=$DEST/firefox/firefox
EOT
say "ready. Chromium: ${CHROME:-missing}; Firefox: $([ -x "$DEST/firefox/firefox" ] && echo ok || echo missing); GNOME Web: $([ -x /usr/bin/epiphany ] && echo ok || echo missing); settings in $ENVF"
exit 0
