#!/bin/zsh
set -euo pipefail

SUMMARY_REPO="${COUNCIL_DASHBOARD_SUMMARY_REPO:-$(cd "$(dirname "$0")" && pwd)}"
BRANCH="${COUNCIL_DASHBOARD_SUMMARY_BRANCH:-main}"
PUBLIC_URL="https://pbsargent.github.io/council-dashboard-summary/"
MESSAGE="${1:-Publish site updates}"

log() {
  print -r -- "[$(/bin/date '+%Y-%m-%d %H:%M:%S')] $*"
}

fail() {
  print -u2 -r -- "$*"
  exit 1
}

git_repo() {
  git --git-dir="${SUMMARY_REPO}/.git" --work-tree="$SUMMARY_REPO" "$@"
}

require_repo() {
  [[ -d "${SUMMARY_REPO}/.git" ]] || fail "Missing Git repository: ${SUMMARY_REPO}"
}

require_repo

log "Publishing prepared Council Dashboard Summary site changes"
log "Repository: ${SUMMARY_REPO}"
log "Branch: ${BRANCH}"

LAST_STEP="fetch origin/${BRANCH}"
log "Fetching latest GitHub state"
git_repo fetch origin "$BRANCH"

LAST_STEP="check local and remote git state"
ahead="$(git_repo rev-list --count "origin/${BRANCH}..HEAD")"
behind="$(git_repo rev-list --count "HEAD..origin/${BRANCH}")"

if [[ "$ahead" != "0" && "$behind" != "0" ]]; then
  fail "Local repo has diverged from origin/${BRANCH}; resolve manually before publishing."
fi

if [[ "$behind" != "0" ]]; then
  fail "Local repo is behind origin/${BRANCH}; pull or rebase before publishing."
fi

LAST_STEP="stage current site changes"
if git_repo diff --quiet && git_repo diff --cached --quiet && [[ -z "$(git_repo ls-files --others --exclude-standard)" ]]; then
  log "No local site changes to publish."
  exit 0
fi

log "Staging current local changes"
git_repo add --all

if git_repo diff --cached --quiet; then
  log "No staged changes to publish."
  exit 0
fi

LAST_STEP="create publish commit"
log "Creating publish commit"
git_repo commit -m "$MESSAGE"
PUBLISHED_COMMIT="$(git_repo rev-parse HEAD)"

LAST_STEP="push to GitHub Pages"
log "Pushing ${PUBLISHED_COMMIT} to origin/${BRANCH}"
git_repo push origin "HEAD:${BRANCH}"

log "Done: ${PUBLIC_URL}"
log "Published commit: ${PUBLISHED_COMMIT}"
