#!/bin/zsh
set -euo pipefail

PYTHON="/Users/petersargent/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
ROOT="/Users/petersargent/Documents/Codex/Daily Uodate"
SUMMARY_REPO="${COUNCIL_DASHBOARD_SUMMARY_REPO:-${ROOT}/outputs/council-dashboard-summary-github}"
PREVIEW_SITE="${ROOT}/outputs/council-commissioner-dashboard-site"
BUILD_DIR="${ROOT}/outputs/council-dashboard-summary-refresh"
BUILDER="${ROOT}/work/commissioner_site/build_site.py"
RENEWAL_BUILDER="${ROOT}/work/renewal_recreation/build_renewal_board_data.py"
MONDAY_REFRESHER="${SUMMARY_REPO}/refresh_monday_data.py"
MONDAY_TOKEN_FILE="${MONDAY_API_TOKEN_FILE:-/Users/petersargent/Documents/06 Personal, Legal, and Sensitive/Sensitive - Move to Password Manager/Monday-Com-API-Token.txt}"
MONDAY_SOURCE_DIR="${MONDAY_SOURCE_DIR:-/Users/petersargent/Library/CloudStorage/GoogleDrive-peter@imetpetersargent.com/Shared drives/Council monday.com Reports}"
BRANCH="main"
EMAIL_TO="${COUNCIL_DASHBOARD_SUMMARY_EMAIL_TO-}"
RUN_STARTED="$(/bin/date '+%Y-%m-%d %H:%M:%S %Z')"
RUN_RESULT="FAILED"
LAST_STEP="startup"
SNAPSHOT_DATE="not built"
ARCHIVE_JSON="not built"
COUNCIL_STATUS="not started"
MONDAY_STATUS="not started"
MONDAY_SUMMARY="not available"
RENEWAL_STATUS="not started"
PREVIEW_STATUS="not checked"
PUBLISH_STATUS="not started"
PUBLISHED_COMMIT="not published"
PUBLIC_URL="https://pbsargent.github.io/council-dashboard-summary/"
REPORT_FILE="/tmp/council-dashboard-summary-refresh-email.$$"

log() {
  print -r -- "[$(/bin/date '+%Y-%m-%d %H:%M:%S')] $*"
}

send_refresh_email() {
  local exit_code="$1"
  local completed result subject

  completed="$(/bin/date '+%Y-%m-%d %H:%M:%S %Z')"
  result="$RUN_RESULT"
  if [[ "$exit_code" != "0" ]]; then
    result="FAILED"
  fi
  subject="Council Dashboard Summary refresh ${result}: ${SNAPSHOT_DATE}"

  {
    print -r -- "Council Dashboard Summary scheduled refresh"
    print -r -- ""
    print -r -- "Result: ${result}"
    print -r -- "Started: ${RUN_STARTED}"
    print -r -- "Completed: ${completed}"
    print -r -- "Last step: ${LAST_STEP}"
    print -r -- ""
    print -r -- "Council/CST workbook refresh: ${COUNCIL_STATUS}"
    print -r -- "Snapshot date: ${SNAPSHOT_DATE}"
    print -r -- "Archive JSON: ${ARCHIVE_JSON}"
    print -r -- ""
    print -r -- "monday.com refresh: ${MONDAY_STATUS}"
    print -r -- "monday.com summary: ${MONDAY_SUMMARY}"
    print -r -- ""
    print -r -- "Renewal board refresh: ${RENEWAL_STATUS}"
    print -r -- ""
    print -r -- "Preview copy: ${PREVIEW_STATUS}"
    print -r -- "GitHub Pages publish: ${PUBLISH_STATUS}"
    print -r -- "Published commit: ${PUBLISHED_COMMIT}"
    print -r -- "Public dashboard: ${PUBLIC_URL}"
    print -r -- ""
    print -r -- "Repository: ${SUMMARY_REPO}"
  } > "$REPORT_FILE"

  if [[ -n "$EMAIL_TO" ]]; then
    if /usr/bin/mail -s "$subject" "$EMAIL_TO" < "$REPORT_FILE"; then
      log "Sent refresh summary email to ${EMAIL_TO}"
    else
      print -u2 -r -- "Refresh completed, but email delivery command failed for ${EMAIL_TO}."
    fi
  fi

  rm -f "$REPORT_FILE"
}

finish_report() {
  local exit_code="$?"
  trap - EXIT
  send_refresh_email "$exit_code"
  exit "$exit_code"
}

trap finish_report EXIT

require_file() {
  if [[ ! -f "$1" ]]; then
    print -u2 -r -- "Missing required file: $1"
    exit 1
  fi
}

require_dir() {
  if [[ ! -d "$1" ]]; then
    print -u2 -r -- "Missing required directory: $1"
    exit 1
  fi
}

copy_file() {
  "$PYTHON" -c 'import shutil,sys; shutil.copyfile(sys.argv[1], sys.argv[2])' "$1" "$2"
}

git_repo() {
  git --git-dir="${SUMMARY_REPO}/.git" --work-tree="$SUMMARY_REPO" "$@"
}

publish_historyless() {
  local message="$1"
  local expected tree commit

  expected="$(git_repo rev-parse "origin/${BRANCH}")"
  tree="$(git_repo write-tree)"
  commit="$(git_repo commit-tree "$tree" -m "$message")"

  git_repo update-ref "refs/heads/${BRANCH}" "$commit"
  git_repo push --force-with-lease="refs/heads/${BRANCH}:${expected}" origin "HEAD:${BRANCH}"
}

require_file "$PYTHON"
require_file "$BUILDER"
require_file "$RENEWAL_BUILDER"
require_file "$MONDAY_REFRESHER"
require_dir "$SUMMARY_REPO/.git"
require_dir "$MONDAY_SOURCE_DIR"

LAST_STEP="build council and CST data snapshot"
log "Building fresh council and CST data snapshot"
cd /Users/petersargent
"$PYTHON" "$BUILDER" --output-dir "$BUILD_DIR"
COUNCIL_STATUS="built fresh source snapshot"

require_file "${BUILD_DIR}/data/latest.json"

LAST_STEP="read generated snapshot metadata"
SNAPSHOT_DATE="$("$PYTHON" -c 'import json,sys; print(json.load(open(sys.argv[1]))["generated_date"])' "${BUILD_DIR}/data/latest.json")"
ARCHIVE_JSON="${BUILD_DIR}/data/${SNAPSHOT_DATE}.json"
require_file "$ARCHIVE_JSON"

LAST_STEP="copy dashboard JSON to summary repo"
log "Updating standalone Council Dashboard Summary repo data"
mkdir -p "${SUMMARY_REPO}/data"
copy_file "${BUILD_DIR}/data/latest.json" "${SUMMARY_REPO}/data/latest.json"
copy_file "$ARCHIVE_JSON" "${SUMMARY_REPO}/data/${SNAPSHOT_DATE}.json"
COUNCIL_STATUS="updated data/latest.json and data/${SNAPSHOT_DATE}.json"

LAST_STEP="refresh monday.com data snapshot"
log "Refreshing monday.com data snapshot"
if "$PYTHON" "$MONDAY_REFRESHER" --token-file "$MONDAY_TOKEN_FILE" --source-dir "$MONDAY_SOURCE_DIR" --output "${SUMMARY_REPO}/data/monday-latest.json"; then
  log "Updated data/monday-latest.json"
  MONDAY_SUMMARY="$("$PYTHON" -c 'import json,sys; data=json.load(open(sys.argv[1])); boards=data["boards"]; print("source={} prospects={} renewals={} schools={}".format(data.get("source_workbook", data.get("generated_from")), boards["prospects"]["items"], boards["renewals"]["items"], boards["schools"]["items"]))' "${SUMMARY_REPO}/data/monday-latest.json")"
  MONDAY_STATUS="updated data/monday-latest.json"
  print -r -- "[monday] ${MONDAY_SUMMARY}"
else
  MONDAY_STATUS="failed; previous data/monday-latest.json retained if available"
  print -u2 -r -- "monday.com refresh failed; keeping previous data/monday-latest.json if available."
fi

if [[ -d "$PREVIEW_SITE" ]]; then
  LAST_STEP="copy refreshed JSON to local preview"
  log "Updating local preview copy"
  mkdir -p "${PREVIEW_SITE}/data"
  copy_file "${BUILD_DIR}/data/latest.json" "${PREVIEW_SITE}/data/latest.json"
  copy_file "$ARCHIVE_JSON" "${PREVIEW_SITE}/data/${SNAPSHOT_DATE}.json"
  if [[ -f "${SUMMARY_REPO}/data/monday-latest.json" ]]; then
    copy_file "${SUMMARY_REPO}/data/monday-latest.json" "${PREVIEW_SITE}/data/monday-latest.json"
  fi
  PREVIEW_STATUS="updated ${PREVIEW_SITE}/data"
else
  PREVIEW_STATUS="skipped; preview site not found"
fi

LAST_STEP="refresh renewal board data bundle"
if [[ -d "${SUMMARY_REPO}/renewal-board" ]]; then
  log "Refreshing renewal board data bundle"
  "$PYTHON" "$RENEWAL_BUILDER" --output "${SUMMARY_REPO}/renewal-board/data.js"
  RENEWAL_STATUS="updated renewal-board/data.js"
  if [[ -d "${PREVIEW_SITE}/renewal-board" ]]; then
    copy_file "${SUMMARY_REPO}/renewal-board/data.js" "${PREVIEW_SITE}/renewal-board/data.js"
    RENEWAL_STATUS="${RENEWAL_STATUS}; preview copy updated"
  fi
else
  RENEWAL_STATUS="skipped; renewal-board directory not found"
fi

LAST_STEP="fetch GitHub Pages repository"
cd /Users/petersargent
git_repo fetch origin "$BRANCH"

LAST_STEP="check local and remote git state"
ahead="$(git_repo rev-list --count "origin/${BRANCH}..HEAD")"
behind="$(git_repo rev-list --count "HEAD..origin/${BRANCH}")"

if [[ "$ahead" != "0" && "$behind" != "0" ]]; then
  print -u2 -r -- "Local repo has diverged from origin/${BRANCH}; resolve manually in $SUMMARY_REPO"
  exit 1
fi

if [[ "$behind" != "0" ]]; then
  LAST_STEP="pull latest GitHub Pages changes"
  log "Pulling latest GitHub changes"
  git_repo pull --ff-only origin "$BRANCH"
fi

LAST_STEP="stage refreshed dashboard data"
git_repo add data/latest.json "data/${SNAPSHOT_DATE}.json" data/monday-latest.json renewal-board/data.js

if git_repo diff --cached --quiet; then
  log "No dashboard data changes to commit"
  RUN_RESULT="NO DATA CHANGES"
  PUBLISH_STATUS="skipped; refreshed JSON matched published data"
  exit 0
fi

LAST_STEP="publish refreshed dashboard data"
log "Publishing historyless dashboard data update for ${SNAPSHOT_DATE}"
publish_historyless "Update dashboard data ${SNAPSHOT_DATE}"
PUBLISHED_COMMIT="$(git_repo rev-parse HEAD)"
PUBLISH_STATUS="published historyless update"
if [[ "$MONDAY_STATUS" == failed* ]]; then
  RUN_RESULT="SUCCESS WITH MONDAY WARNING"
else
  RUN_RESULT="SUCCESS"
fi

log "Done: https://pbsargent.github.io/council-dashboard-summary/"
