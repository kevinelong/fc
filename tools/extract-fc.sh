#!/usr/bin/env bash
# Produce a clean, standalone fc repository from this monorepo — fc only, none of
# the separate/client projects (tpos, ace). Uses `git archive` so only committed,
# non-gitignored files are copied (secrets in apid/.env and data/ are excluded by
# .gitignore automatically). The result is a ready-to-push git repo.
#
# Usage:  tools/extract-fc.sh /path/to/fc-console
# Then:   cd /path/to/fc-console && git remote add origin <your empty repo> && git push -u origin main
set -euo pipefail

DEST="${1:?usage: extract-fc.sh <target-dir>}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Directories/files that are NOT fc (separate or client projects). Everything else
# in the tree is fc: index.html, examples/, spec/, learn/, teachers/, projects/,
# docs/, tools/, privacy/, g/, share/, store/, qr/, apid/, huntd/, LICENSE, sw.js…
EXCLUDE=(tpos ace)

echo "Source : $SRC"
echo "Dest   : $DEST"
echo "Exclude: ${EXCLUDE[*]}"

rm -rf "$DEST"
mkdir -p "$DEST"

# git archive = exactly the tracked files (respects .gitignore: no .env, no data/)
( cd "$SRC" && git archive HEAD ) | tar -x -C "$DEST"

# drop the non-fc projects
for d in "${EXCLUDE[@]}"; do rm -rf "$DEST/$d"; done

# fresh git history for the standalone repo
( cd "$DEST"
  git init -q -b main
  git add -A
  git -c user.name='fc' -c user.email='fc@codeonline.io' commit -q -m "fc — plain-English fantasy console (extracted from monorepo)"
)

echo
echo "Done. Standalone fc repo at: $DEST"
echo "Files: $(cd "$DEST" && git ls-files | wc -l | tr -d ' ')"
echo "Next:  cd $DEST && git remote add origin <empty GitHub repo> && git push -u origin main"
