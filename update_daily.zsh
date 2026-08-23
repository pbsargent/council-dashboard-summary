#!/bin/zsh
set -euo pipefail

ROOT="${CAC_DASHBOARD_ROOT:-/Users/petersargent/CACDashboardPlatform}"
PYTHON="${AUTOMATION_PYTHON:-${ROOT}/.venv/bin/python}"
SUMMARY_REPO="${COUNCIL_DASHBOARD_SUMMARY_REPO:-${ROOT}/sites/council-dashboard-summary}"
PREVIEW_SITE="${ROOT}/outputs/council-commissioner-dashboard-site"
BUILD_DIR="${ROOT}/outputs/council-dashboard-summary-refresh"
BUILDER="${ROOT}/work/commissioner_site/build_site.py"
RENEWAL_BUILDER="${ROOT}/work/renewal_recreation/build_renewal_board_data.py"
MONDAY_REFRESHER="${SUMMARY_REPO}/refresh_monday_data.py"
UNIT_YOUTH_INJECTOR="${SUMMARY_REPO}/tools/inject_unit_youth_trends.py"
UNIT_LEVEL_BUILDER="${SUMMARY_REPO}/tools/build_unit_level_dashboard.py"
FALL_RECRUITMENT_BUILDER="${SUMMARY_REPO}/tools/build_fall_recruitment_dashboard.py"
SITE_STRUCTURE_VALIDATOR="${SUMMARY_REPO}/tools/validate_site_structure.py"
MONDAY_TOKEN_FILE="${MONDAY_API_TOKEN_FILE:-/Users/petersargent/Documents/06 Personal, Legal, and Sensitive/Sensitive - Move to Password Manager/Monday-Com-API-Token.txt}"
MONDAY_SOURCE_DIR="${MONDAY_SOURCE_DIR:-/Users/petersargent/Library/CloudStorage/GoogleDrive-peter@imetpetersargent.com/Shared drives/Council monday.com Reports}"
UNIT_LEVEL_SOURCE_DIR="${UNIT_LEVEL_SOURCE_DIR:-/Users/petersargent/Library/CloudStorage/GoogleDrive-peter@imetpetersargent.com/Shared drives/Council Dashboard Reports}"
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
FALL_RECRUITMENT_STATUS="not started"
UNIT_LEVEL_STATUS="not started"
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
    print -r -- "Cub Scout JSN Dashboard: ${FALL_RECRUITMENT_STATUS}"
    print -r -- "Unit Level Dashboard: ${UNIT_LEVEL_STATUS}"
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

latest_valid_workbook() {
  local folder="$1"
  local pattern="$2"
  local latest
  latest="$(print -rl -- "$folder"/${~pattern}(N) | /usr/bin/sort | /usr/bin/tail -1)"
  if [[ -z "$latest" || ! -f "$latest" ]]; then
    return 1
  fi
  print -r -- "$latest"
}

copy_file() {
  "$PYTHON" -c 'import shutil,sys; shutil.copyfile(sys.argv[1], sys.argv[2])' "$1" "$2"
}

git_repo() {
  git --git-dir="${SUMMARY_REPO}/.git" --work-tree="$SUMMARY_REPO" "$@"
}

require_file "$PYTHON"
require_file "$BUILDER"
require_file "$RENEWAL_BUILDER"
require_file "$MONDAY_REFRESHER"
require_file "$UNIT_YOUTH_INJECTOR"
require_file "$UNIT_LEVEL_BUILDER"
require_file "$FALL_RECRUITMENT_BUILDER"
require_file "$SITE_STRUCTURE_VALIDATOR"
require_dir "$SUMMARY_REPO/.git"
require_dir "$MONDAY_SOURCE_DIR"
require_dir "$UNIT_LEVEL_SOURCE_DIR"

LAST_STEP="synchronize GitHub Pages repository before refresh"
log "Synchronizing scheduled dashboard code with origin/${BRANCH}"
cd /Users/petersargent
git_repo fetch origin "$BRANCH"
if [[ -n "$(git_repo status --porcelain --untracked-files=no)" ]]; then
  print -u2 -r -- "Production checkout has tracked local changes before refresh: $SUMMARY_REPO"
  exit 1
fi

# This checkout is automation-owned and disposable. Always begin from the
# authoritative remote tree so an earlier historyless commit or a merged code
# change can never strand the daily publisher on a divergent local root.
if [[ "$(git_repo rev-parse HEAD)" != "$(git_repo rev-parse "origin/${BRANCH}")" ]]; then
  log "Aligning the production checkout with origin/${BRANCH}"
  git_repo reset --hard "origin/${BRANCH}"
fi
BASE_REMOTE_SHA="$(git_repo rev-parse "origin/${BRANCH}")"

LAST_STEP="validate discrete dashboard page structure"
log "Validating required dashboard pages, routes, and branded assets"
"$PYTHON" "$SITE_STRUCTURE_VALIDATOR" "$SUMMARY_REPO"

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
"$PYTHON" "$UNIT_YOUTH_INJECTOR" "${SUMMARY_REPO}/data/latest.json" "${SUMMARY_REPO}/data/${SNAPSHOT_DATE}.json"
COUNCIL_STATUS="updated data/latest.json and data/${SNAPSHOT_DATE}.json"

LAST_STEP="refresh monday.com data snapshot"
log "Refreshing monday.com data snapshot"
if "$PYTHON" "$MONDAY_REFRESHER" --token-file "$MONDAY_TOKEN_FILE" --source-dir "$MONDAY_SOURCE_DIR" --output "${SUMMARY_REPO}/data/monday-latest.json"; then
  log "Updated data/monday-latest.json"
  MONDAY_SUMMARY="$("$PYTHON" -c 'import json,sys; data=json.load(open(sys.argv[1])); boards=data["boards"]; popcorn=boards["popcorn"]; print("source={} prospects={} renewals={} schools={} popcorn={}/{}".format(data.get("source_workbook", data.get("generated_from")), boards["prospects"]["items"], boards["renewals"]["items"], boards["schools"]["items"], popcorn["committed"], popcorn["items"]))' "${SUMMARY_REPO}/data/monday-latest.json")"
  MONDAY_STATUS="updated data/monday-latest.json"
  print -r -- "[monday] ${MONDAY_SUMMARY}"
else
  MONDAY_STATUS="failed; previous data/monday-latest.json retained if available"
  print -u2 -r -- "monday.com refresh failed; keeping previous data/monday-latest.json if available."
fi

LAST_STEP="build Cub Scout JSN Dashboard data"
log "Building Cub Scout JSN Dashboard data from monday.com"
if "$PYTHON" "$FALL_RECRUITMENT_BUILDER" \
  --token-file "$MONDAY_TOKEN_FILE" \
  --output "${SUMMARY_REPO}/data/fall-recruitment-latest.js"; then
  FALL_RECRUITMENT_STATUS="updated data/fall-recruitment-latest.js"
else
  FALL_RECRUITMENT_STATUS="failed; previous data bundle retained if available"
  print -u2 -r -- "Cub Scout JSN Dashboard refresh failed; keeping the previous data bundle if available."
fi

LAST_STEP="build Unit Level Dashboard data"
UNIT_LEVEL_SOURCE="$(latest_valid_workbook "$UNIT_LEVEL_SOURCE_DIR" "*_CAC - Unit Metric Scorecard.xlsx")"
log "Building Unit Level Dashboard data from ${UNIT_LEVEL_SOURCE}"
"$PYTHON" "$UNIT_LEVEL_BUILDER" "$UNIT_LEVEL_SOURCE" \
  --output "${SUMMARY_REPO}/data/unit-level-latest.json" \
  --js-output "${SUMMARY_REPO}/data/unit-level-latest.js"
UNIT_LEVEL_STATUS="updated from ${UNIT_LEVEL_SOURCE:t}"

if [[ -d "$PREVIEW_SITE" ]]; then
  LAST_STEP="copy refreshed JSON to local preview"
  log "Updating local preview copy"
  mkdir -p "${PREVIEW_SITE}/data"
  copy_file "${BUILD_DIR}/data/latest.json" "${PREVIEW_SITE}/data/latest.json"
  copy_file "$ARCHIVE_JSON" "${PREVIEW_SITE}/data/${SNAPSHOT_DATE}.json"
  if [[ -f "${SUMMARY_REPO}/data/monday-latest.json" ]]; then
    copy_file "${SUMMARY_REPO}/data/monday-latest.json" "${PREVIEW_SITE}/data/monday-latest.json"
  fi
  if [[ -f "${SUMMARY_REPO}/data/fall-recruitment-latest.js" ]]; then
    copy_file "${SUMMARY_REPO}/data/fall-recruitment-latest.js" "${PREVIEW_SITE}/data/fall-recruitment-latest.js"
  fi
  copy_file "${SUMMARY_REPO}/data/unit-level-latest.json" "${PREVIEW_SITE}/data/unit-level-latest.json"
  copy_file "${SUMMARY_REPO}/data/unit-level-latest.js" "${PREVIEW_SITE}/data/unit-level-latest.js"
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

LAST_STEP="confirm sole-writer GitHub state"
if [[ "$(git_repo rev-parse "origin/${BRANCH}")" != "$BASE_REMOTE_SHA" ]]; then
  print -u2 -r -- "GitHub changed during the refresh; refusing to combine two writers. Retry the consolidated pipeline."
  exit 1
fi

LAST_STEP="revalidate discrete dashboard page structure before publication"
log "Revalidating dashboard structure before publication"
"$PYTHON" "$SITE_STRUCTURE_VALIDATOR" "$SUMMARY_REPO"

LAST_STEP="stage refreshed dashboard data"
git_repo add data/latest.json "data/${SNAPSHOT_DATE}.json" data/monday-latest.json data/fall-recruitment-latest.js data/unit-level-latest.json data/unit-level-latest.js renewal-board/data.js

if git_repo diff --cached --quiet; then
  log "No dashboard data changes to commit"
  RUN_RESULT="NO DATA CHANGES"
  PUBLISH_STATUS="skipped; refreshed JSON matched published data"
  exit 0
fi

LAST_STEP="publish refreshed dashboard data"
log "Publishing linear dashboard data update for ${SNAPSHOT_DATE}"
git_repo commit -m "Update dashboard data ${SNAPSHOT_DATE}"
git_repo push origin "HEAD:${BRANCH}"
PUBLISHED_COMMIT="$(git_repo rev-parse HEAD)"
PUBLISH_STATUS="published linear update"
if [[ "$MONDAY_STATUS" == failed* || "$FALL_RECRUITMENT_STATUS" == failed* ]]; then
  RUN_RESULT="SUCCESS WITH MONDAY WARNING"
else
  RUN_RESULT="SUCCESS"
fi

log "Done: https://pbsargent.github.io/council-dashboard-summary/"
