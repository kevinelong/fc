#!/usr/bin/env bash
# deploy-fc-apk.sh — put the current fc Android build into the live site, in the right order.
#
# The site root is a clone of the fc repository served by nginx, so the web app and
# fc-version.js arrive with `git pull`. The APK cannot: /fc.apk is gitignored, so it is
# fetched from the public release instead. Order matters — fc-version.js advertises the new
# versionCode and the in-app update nudge reads that live file, so the binary must land first,
# otherwise installed apps are told to update and then re-download the old file.
#
#   bash tools/deploy-fc-apk.sh [SITE_DIR] [--pull] [--dry-run]
#
#   SITE_DIR    the served clone (default: $FC_SITE or /home/kevin/codeonline)
#   --pull      also run `git pull --ff-only` in SITE_DIR after installing the APK
#   --dry-run   print what would happen, fetch and change nothing
#
# Verification after the run: `curl -sI https://codeonline.io/fc.apk | grep -i last-modified`
# should show today, and `curl -s https://codeonline.io/fc-version.js` should show the new
# versionCode. Both are printed at the end.
set -euo pipefail

REPO_SLUG="kevinelong/fc-releases"
ASSET_BASE="https://github.com/${REPO_SLUG}/releases/latest/download"

SITE="${FC_SITE:-/home/kevin/codeonline}"
PULL=0
DRY=0
for arg in "$@"; do
  case "$arg" in
    --pull)    PULL=1 ;;
    --dry-run) DRY=1 ;;
    -*)
      echo "unknown option: $arg" >&2
      echo "usage: bash tools/deploy-fc-apk.sh [SITE_DIR] [--pull] [--dry-run]" >&2
      exit 2 ;;
    *) SITE="$arg" ;;
  esac
done

say() { printf '%s\n' "$*"; }
run() { if [ "$DRY" = 1 ]; then say "  would run: $*"; else "$@"; fi; }
die() { echo "ERROR: $*" >&2; exit 1; }

# Fetch one release asset. GitHub's /releases/latest/download/ path goes through a CDN that can
# keep serving a stale response — including a cached 5xx — for a few minutes after a release is
# replaced, which happened when v1.0.3+4 was re-tagged as v1.0.3-4. The explicit tag URL never
# does, so resolve the tag from the (public, no-auth) API and use that as the fallback.
fetch_asset() {   # <asset name> <output path>
  local name="$1" out="$2" tag
  if curl -fsSL -o "$out" "${ASSET_BASE}/${name}"; then return 0; fi
  say "fetch   : latest/download failed for ${name} — resolving the tag from the API"
  tag="$(curl -fsSL "https://api.github.com/repos/${REPO_SLUG}/releases/latest" \
    | grep -o '"tag_name": *"[^"]*"' | head -1 | sed 's/.*"tag_name": *"//; s/"$//')"
  [ -n "$tag" ] || return 1
  say "fetch   : retrying with tag ${tag}"
  curl -fsSL -o "$out" "https://github.com/${REPO_SLUG}/releases/download/${tag}/${name}"
}

say "site     : $SITE"
say "artifact : $ASSET_BASE/app-release.apk"
[ "$PULL" = 1 ] && say "pull     : yes (git pull --ff-only after the APK lands)"
[ "$DRY" = 1 ] && say "mode     : dry run — nothing will be fetched or changed"
say ""

# ---- 1. sanity: is this really the served clone? ------------------------------
if [ "$DRY" = 1 ]; then
  if [ -d "$SITE" ] && [ -f "$SITE/index.html" ] && [ -f "$SITE/fc-version.js" ]; then
    say "sanity : $SITE looks like the served clone"
  else
    say "sanity : $SITE is not present on this machine — fine for a dry run, fatal for a real one"
  fi
else
  [ -d "$SITE" ] || die "site directory not found: $SITE (pass it as an argument or set FC_SITE)"
  [ -f "$SITE/index.html" ] || die "$SITE has no index.html — that does not look like the site root"
  [ -f "$SITE/fc-version.js" ] || die "$SITE has no fc-version.js — that does not look like the site root"
fi

# ---- 2. fetch the published APK + its checksums, and verify -------------------
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [ "$DRY" = 1 ]; then
  say "checks: would download SHA256SUMS.txt + app-release.apk into a temp dir and run"
  say "        'sha256sum -c SHA256SUMS.txt' before touching $SITE"
else
  say "checks: downloading the published APK and SHA256SUMS.txt…"
  fetch_asset "SHA256SUMS.txt" "$TMP/SHA256SUMS.txt" \
    || die "could not fetch SHA256SUMS.txt from $ASSET_BASE"
  fetch_asset "app-release.apk" "$TMP/app-release.apk" \
    || die "could not fetch app-release.apk from $ASSET_BASE"
  # SHA256SUMS.txt also lists the .aab, which a deploy does not need; check the APK's line.
  ( cd "$TMP" && grep -E ' app-release\.apk$' SHA256SUMS.txt | sha256sum -c - ) \
    || die "checksum mismatch — refusing to install a partial or tampered download"
  say "checks: sha256 verified against the published SHA256SUMS.txt"
fi

# ---- 3. keep the previous file, then install ----------------------------------
if [ -f "$SITE/fc.apk" ] && [ "$DRY" = 0 ]; then
  cp -p "$SITE/fc.apk" "$SITE/fc.apk.prev"
  say "install: previous build kept at $SITE/fc.apk.prev"
fi
if [ "$DRY" = 1 ]; then
  say "install: would copy the verified APK to $SITE/fc.apk (keeping the old one as fc.apk.prev)"
else
  cp -f "$TMP/app-release.apk" "$SITE/fc.apk"
  chmod 644 "$SITE/fc.apk"
  say "install: $SITE/fc.apk updated ($(wc -c < "$SITE/fc.apk" | tr -d ' ') bytes)"
fi

# ---- 4. the tree (this is what publishes fc-version.js) -----------------------
if [ "$PULL" = 1 ]; then
  if [ "$DRY" = 1 ]; then
    say "pull   : would run 'git -C $SITE pull --ff-only'"
  else
    say "pull   : git -C $SITE pull --ff-only"
    git -C "$SITE" pull --ff-only
  fi
else
  say "pull   : skipped (pass --pull once the tree is ready to go live)"
fi

# ---- 5. prove the APK and the version file agree ------------------------------
# The bundled index.html carries FC_APK_VERSION, baked from the app's versionCode; the site's
# fc-version.js is what installed apps compare against. If they disagree, either the wrong APK
# was published or the tree has not been pulled yet — both are worth failing loudly for.
if [ "$DRY" = 0 ] && command -v unzip >/dev/null 2>&1; then
  apk_ver="$(unzip -p "$SITE/fc.apk" assets/flutter_assets/assets/www/index.html 2>/dev/null \
    | grep -o 'FC_APK_VERSION = [0-9]*' | grep -o '[0-9]*$' | head -1)"
  site_ver="$(grep -o '"versionCode":[0-9]*' "$SITE/fc-version.js" | grep -o '[0-9]*$' | head -1)"
  if [ -n "$apk_ver" ] && [ -n "$site_ver" ]; then
    if [ "$apk_ver" = "$site_ver" ]; then
      say "version: APK versionCode $apk_ver matches fc-version.js — the nudge will point here"
    else
      say "WARNING: APK bundles versionCode $apk_ver but $SITE/fc-version.js advertises $site_ver"
      say "         the nudge would send people to the wrong file — finish the tree pull before"
      say "         telling anyone to update"
    fi
  fi
fi

say ""
say "Next: confirm from the outside —"
say "  curl -sI https://codeonline.io/fc.apk | grep -i last-modified"
say "  curl -s  https://codeonline.io/fc-version.js"
say "Remember the first install of a new signing key needs an uninstall/reinstall (see"
say "DISTRIBUTION.md): versionCode 4 is signed with a different key from the July build."
