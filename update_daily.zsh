#!/bin/zsh
set -euo pipefail

ROOT="${CAC_DASHBOARD_ROOT:-/Users/petersargent/CACDashboardPlatform}"
PYTHON="${AUTOMATION_PYTHON:-${ROOT}/.venv/bin/python}"
SUMMARY_REPO="${COUNCIL_DASHBOARD_SUMMARY_REPO:-${ROOT}/sites/council-dashboard-summary}"
SITE_STAGE="${ROOT}/outputs/pages-stage/council-dashboard-summary"
PREVIEW_SITE="${ROOT}/outputs/council-commissioner-dashboard-site"
BUILD_DIR="${ROOT}/outputs/council-dashboard-summary-refresh"
SITE_STAGER="${ROOT}/tools/stage_static_site.zsh"
PAGES_DEPLOYER="${ROOT}/tools/deploy_github_pages_artifact.zsh"
BUILDER="${ROOT}/work/commissioner_site/build_site.py"
RENEWAL_BUILDER="${ROOT}/work/renewal_recreation/build_renewal_board_data.py"
SERVICE_HIERARCHY_REFRESHER="${ROOT}/work/renewal_recreation/refresh_service_area_hierarchy.py"
MONDAY_REFRESHER="${SUMMARY_REPO}/refresh_monday_data.py"
UNIT_YOUTH_INJECTOR="${SUMMARY_REPO}/tools/inject_unit_youth_trends.py"
UNIT_LEVEL_BUILDER="${SUMMARY_REPO}/tools/build_unit_level_dashboard.py"
FALL_RECRUITMENT_BUILDER="${SUMMARY_REPO}/tools/build_fall_recruitment_dashboard.py"
SITE_STRUCTURE_VALIDATOR="${SUMMARY_REPO}/tools/validate_site_structure.py"
PERSON_NAME_SANITIZER="${SUMMARY_REPO}/tools/sanitize_public_person_names.py"
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
PUBLISHED_COMMIT="not deployed"
PUBLIC_URL="https://pbsargent.github.io/council-dashboard-summary/"
GITHUB_REPOSITORY="pbsargent/council-dashboard-summary"
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
    print -r -- "Source code commit: ${PUBLISHED_COMMIT}"
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
require_file "$SERVICE_HIERARCHY_REFRESHER"
require_file "$MONDAY_REFRESHER"
require_file "$UNIT_YOUTH_INJECTOR"
require_file "$UNIT_LEVEL_BUILDER"
require_file "$FALL_RECRUITMENT_BUILDER"
require_file "$SITE_STRUCTURE_VALIDATOR"
require_file "$PERSON_NAME_SANITIZER"
require_file "$SITE_STAGER"
require_file "$PAGES_DEPLOYER"
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

# The repository now contains source code only. Daily data is generated in an
# isolated staging tree and deployed as a verified GitHub Pages artifact.
if [[ "$(git_repo rev-parse HEAD)" != "$(git_repo rev-parse "origin/${BRANCH}")" ]]; then
  log "Fast-forwarding production source to origin/${BRANCH}"
  git_repo merge --ff-only "origin/${BRANCH}"
fi
BASE_REMOTE_SHA="$(git_repo rev-parse "origin/${BRANCH}")"
PUBLISHED_COMMIT="$BASE_REMOTE_SHA"

LAST_STEP="validate discrete dashboard page structure"
log "Validating required dashboard pages, routes, and branded assets"
"$PYTHON" "$SITE_STRUCTURE_VALIDATOR" "$SUMMARY_REPO"

LAST_STEP="stage source-only GitHub Pages site"
log "Preparing isolated GitHub Pages staging tree"
"$SITE_STAGER" "$SUMMARY_REPO" "$SITE_STAGE" >/dev/null

LAST_STEP="build council and CST data snapshot"
log "Building fresh council and CST data snapshot"
cd /Users/petersargent
SERVICE_HIERARCHY_SNAPSHOT="${BUILD_DIR}/service_area_hierarchy.json"
"$PYTHON" "$SERVICE_HIERARCHY_REFRESHER" \
  --token-file "$MONDAY_TOKEN_FILE" \
  --output "$SERVICE_HIERARCHY_SNAPSHOT"
SERVICE_HIERARCHY_CACHE="$SERVICE_HIERARCHY_SNAPSHOT" \
  "$PYTHON" "$BUILDER" --output-dir "$BUILD_DIR"
COUNCIL_STATUS="built fresh source snapshot"

require_file "${BUILD_DIR}/data/latest.json"

LAST_STEP="read generated snapshot metadata"
SNAPSHOT_DATE="$("$PYTHON" -c 'import json,sys; print(json.load(open(sys.argv[1]))["generated_date"])' "${BUILD_DIR}/data/latest.json")"
ARCHIVE_JSON="${BUILD_DIR}/data/${SNAPSHOT_DATE}.json"
require_file "$ARCHIVE_JSON"

LAST_STEP="copy dashboard JSON to staged site"
log "Updating staged Council Dashboard Summary data"
mkdir -p "${SITE_STAGE}/data"
copy_file "${BUILD_DIR}/data/latest.json" "${SITE_STAGE}/data/latest.json"
"$PYTHON" "$UNIT_YOUTH_INJECTOR" "${SITE_STAGE}/data/latest.json" "$ARCHIVE_JSON"
COUNCIL_STATUS="updated staged data/latest.json; dated source retained outside Git history"

LAST_STEP="refresh monday.com data snapshot"
log "Refreshing monday.com data snapshot"
if "$PYTHON" "$MONDAY_REFRESHER" --token-file "$MONDAY_TOKEN_FILE" --source-dir "$MONDAY_SOURCE_DIR" --output "${SITE_STAGE}/data/monday-latest.json"; then
  log "Updated data/monday-latest.json"
  MONDAY_SUMMARY="$("$PYTHON" -c 'import json,sys; data=json.load(open(sys.argv[1])); boards=data["boards"]; popcorn=boards["popcorn"]; print("source={} prospects={} renewals={} schools={} popcorn={}/{}".format(data.get("source_workbook", data.get("generated_from")), boards["prospects"]["items"], boards["renewals"]["items"], boards["schools"]["items"], popcorn["committed"], popcorn["items"]))' "${SITE_STAGE}/data/monday-latest.json")"
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
  --output "${SITE_STAGE}/data/fall-recruitment-latest.js"; then
  FALL_RECRUITMENT_STATUS="updated data/fall-recruitment-latest.js"
else
  FALL_RECRUITMENT_STATUS="failed; previous data bundle retained if available"
  print -u2 -r -- "Cub Scout JSN Dashboard refresh failed; keeping the previous data bundle if available."
fi

LAST_STEP="build Unit Level Dashboard data"
UNIT_LEVEL_SOURCE="$(latest_valid_workbook "$UNIT_LEVEL_SOURCE_DIR" "*_CAC - Unit Metric Scorecard.xlsx")"
log "Building Unit Level Dashboard data from ${UNIT_LEVEL_SOURCE}"
"$PYTHON" "$UNIT_LEVEL_BUILDER" "$UNIT_LEVEL_SOURCE" \
  --output "${SITE_STAGE}/data/unit-level-latest.json" \
  --js-output "${SITE_STAGE}/data/unit-level-latest.js"
UNIT_LEVEL_STATUS="updated from ${UNIT_LEVEL_SOURCE:t}"

if [[ -d "$PREVIEW_SITE" ]]; then
  LAST_STEP="copy refreshed JSON to local preview"
  log "Updating local preview copy"
  mkdir -p "${PREVIEW_SITE}/data"
  copy_file "${SITE_STAGE}/data/latest.json" "${PREVIEW_SITE}/data/latest.json"
  copy_file "$ARCHIVE_JSON" "${PREVIEW_SITE}/data/${SNAPSHOT_DATE}.json"
  if [[ -f "${SITE_STAGE}/data/monday-latest.json" ]]; then
    copy_file "${SITE_STAGE}/data/monday-latest.json" "${PREVIEW_SITE}/data/monday-latest.json"
  fi
  if [[ -f "${SITE_STAGE}/data/fall-recruitment-latest.js" ]]; then
    copy_file "${SITE_STAGE}/data/fall-recruitment-latest.js" "${PREVIEW_SITE}/data/fall-recruitment-latest.js"
  fi
  copy_file "${SITE_STAGE}/data/unit-level-latest.json" "${PREVIEW_SITE}/data/unit-level-latest.json"
  copy_file "${SITE_STAGE}/data/unit-level-latest.js" "${PREVIEW_SITE}/data/unit-level-latest.js"
  PREVIEW_STATUS="updated ${PREVIEW_SITE}/data"
else
  PREVIEW_STATUS="skipped; preview site not found"
fi

LAST_STEP="refresh renewal board data bundle"
if [[ -d "${SITE_STAGE}/renewal-board" ]]; then
  log "Refreshing renewal board data bundle"
  SERVICE_HIERARCHY_CACHE="$SERVICE_HIERARCHY_SNAPSHOT" \
    "$PYTHON" "$RENEWAL_BUILDER" --output "${SITE_STAGE}/renewal-board/data.js"
  RENEWAL_STATUS="updated renewal-board/data.js"
  if [[ -d "${PREVIEW_SITE}/renewal-board" ]]; then
    copy_file "${SITE_STAGE}/renewal-board/data.js" "${PREVIEW_SITE}/renewal-board/data.js"
    RENEWAL_STATUS="${RENEWAL_STATUS}; preview copy updated"
  fi
else
  RENEWAL_STATUS="skipped; renewal-board directory not found"
fi

LAST_STEP="apply public person-name privacy format"
log "Abbreviating public person names as First Name, Last Initial"
"$PYTHON" "$PERSON_NAME_SANITIZER" "$SITE_STAGE"
"$PYTHON" "$PERSON_NAME_SANITIZER" "$SITE_STAGE" --check
if [[ -d "$PREVIEW_SITE" ]]; then
  "$PYTHON" "$PERSON_NAME_SANITIZER" "$PREVIEW_SITE"
  "$PYTHON" "$PERSON_NAME_SANITIZER" "$PREVIEW_SITE" --check
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
"$PYTHON" "${SITE_STAGE}/tools/validate_site_structure.py" "$SITE_STAGE"

LAST_STEP="deploy verified GitHub Pages artifact"
log "Deploying verified dashboard artifact for ${SNAPSHOT_DATE}"
"$PAGES_DEPLOYER" "$GITHUB_REPOSITORY" "$SITE_STAGE" "$PUBLIC_URL" "$SNAPSHOT_DATE"
PUBLISH_STATUS="deployed verified Pages artifact; Git history unchanged"
if [[ "$MONDAY_STATUS" == failed* || "$FALL_RECRUITMENT_STATUS" == failed* ]]; then
  RUN_RESULT="SUCCESS WITH MONDAY WARNING"
else
  RUN_RESULT="SUCCESS"
fi

log "Done: https://pbsargent.github.io/council-dashboard-summary/"
