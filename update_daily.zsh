#!/bin/zsh
set -euo pipefail

ROOT="${CAC_DASHBOARD_ROOT:-/Users/petersargent/CACDashboardPlatform}"
if [[ -z "${CAC_FROZEN_BUNDLE:-}" && -f "$ROOT/config/production.env" ]]; then
  source "$ROOT/config/production.env"
fi
PYTHON="${AUTOMATION_PYTHON:-${ROOT}/.venv/bin/python}"
NODE="${AUTOMATION_NODE:-/Users/petersargent/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node}"
SUMMARY_REPO="${COUNCIL_DASHBOARD_SUMMARY_REPO:-${ROOT}/sites/council-dashboard-summary}"
SITE_STAGE="${CAC_SUMMARY_SITE_STAGE:-${ROOT}/outputs/pages-stage/council-dashboard-summary}"
PREVIEW_SITE="${ROOT}/outputs/council-commissioner-dashboard-site"
BUILD_DIR="${CAC_SUMMARY_BUILD_DIR:-${ROOT}/outputs/council-dashboard-summary-refresh}"
SITE_STAGER="${ROOT}/tools/stage_static_site.zsh"
PAGES_DEPLOYER="${ROOT}/tools/deploy_github_pages_artifact.zsh"
BUILDER="${ROOT}/work/commissioner_site/build_site.py"
RENEWAL_BUILDER="${ROOT}/work/renewal_recreation/build_renewal_board_data.py"
SERVICE_HIERARCHY_REFRESHER="${ROOT}/work/renewal_recreation/refresh_service_area_hierarchy.py"
MONDAY_REFRESHER="${SUMMARY_REPO}/refresh_monday_data.py"
UNIT_YOUTH_INJECTOR="${SUMMARY_REPO}/tools/inject_unit_youth_trends.py"
UNIT_LEVEL_BUILDER="${SUMMARY_REPO}/tools/build_unit_level_dashboard.py"
JOINS_BUILDER="${SUMMARY_REPO}/tools/build_join_dashboards.py"
SITE_STRUCTURE_VALIDATOR="${SUMMARY_REPO}/tools/validate_site_structure.py"
UNIT_LEVEL_PIN_TEST="${SUMMARY_REPO}/tools/test_unit_level_pin_status.js"
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
    print -r -- "Cub and Scouts BSA joins: ${FALL_RECRUITMENT_STATUS}"
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
require_file "$NODE"
require_file "$BUILDER"
require_file "$RENEWAL_BUILDER"
require_file "$SERVICE_HIERARCHY_REFRESHER"
require_file "$MONDAY_REFRESHER"
require_file "$UNIT_YOUTH_INJECTOR"
require_file "$UNIT_LEVEL_BUILDER"
require_file "$JOINS_BUILDER"
require_file "$SITE_STRUCTURE_VALIDATOR"
require_file "$UNIT_LEVEL_PIN_TEST"
require_file "$PERSON_NAME_SANITIZER"
require_file "$SITE_STAGER"
require_file "$PAGES_DEPLOYER"
require_dir "$SUMMARY_REPO/.git"
require_dir "$MONDAY_SOURCE_DIR"
require_dir "$UNIT_LEVEL_SOURCE_DIR"

LAST_STEP="synchronize GitHub Pages repository before refresh"
log "Synchronizing scheduled dashboard code with origin/${BRANCH}"
cd /Users/petersargent
if [[ -z "${CAC_FROZEN_BUNDLE:-}" ]]; then git_repo fetch origin "$BRANCH"; fi
if [[ -n "$(git_repo status --porcelain --untracked-files=no)" ]]; then
  print -u2 -r -- "Production checkout has tracked local changes before refresh: $SUMMARY_REPO"
  exit 1
fi

# The repository now contains source code only. Daily data is generated in an
# isolated staging tree and deployed as a verified GitHub Pages artifact.
if [[ -z "${CAC_FROZEN_BUNDLE:-}" && "$(git_repo rev-parse HEAD)" != "$(git_repo rev-parse "origin/${BRANCH}")" ]]; then
  log "Fast-forwarding production source to origin/${BRANCH}"
  git_repo merge --ff-only "origin/${BRANCH}"
fi
BASE_REMOTE_SHA="$(git_repo rev-parse HEAD)"
PUBLISHED_COMMIT="$BASE_REMOTE_SHA"

LAST_STEP="validate discrete dashboard page structure"
log "Validating required dashboard pages, routes, and branded assets"
"$PYTHON" "$SITE_STRUCTURE_VALIDATOR" "$SUMMARY_REPO"

LAST_STEP="validate joins workbook and page contracts"
"$PYTHON" "${SUMMARY_REPO}/tools/test_join_dashboards.py"
"$NODE" "${SUMMARY_REPO}/tools/test_joins_page.js"
LAST_STEP="validate daily Movo renewal outreach contracts"
"$PYTHON" "${SUMMARY_REPO}/tools/test_renewal_outreach.py"
"$NODE" "${SUMMARY_REPO}/tools/test_renewal_outreach_page.js"

LAST_STEP="validate current campaign popcorn sales contract"
"$PYTHON" "${SUMMARY_REPO}/tools/test_popcorn_sales.py"
"$NODE" "${SUMMARY_REPO}/tools/test_popcorn_sales_render.mjs"

LAST_STEP="validate Unit Profile PIN rendering contract"
log "Validating Unit Profile PIN status, Last Updated, completeness, and privacy behavior"
"$NODE" "$UNIT_LEVEL_PIN_TEST"
"$PYTHON" "${SUMMARY_REPO}/tools/test_beascout_links.py"

LAST_STEP="verify private joins inputs before site artifact work"
if [[ "${CAC_DASHBOARD_SOURCE_MODE:-}" == "working_copy" && -z "${CAC_DASHBOARD_SOURCE:-}" ]]; then
  WORKING_STAGE="$ROOT/outputs/working-copy-source-stage/$(TZ=America/Chicago /bin/date '+%Y-%m-%d')-summary-$$"
  "$PYTHON" "$ROOT/tools/working_copy_source.py" --date "$(TZ=America/Chicago /bin/date '+%Y-%m-%d')" --stage "$WORKING_STAGE"
  export CAC_DASHBOARD_SOURCE="$WORKING_STAGE/CAC_Dashboard_Working_Copy.xlsx"
  export CAC_WORKING_COPY_SOURCE_RECEIPT="$WORKING_STAGE/receipt.json"
  export DASHBOARD_SOURCE_DIR="$WORKING_STAGE"
fi
if [[ -z "${CAC_JOINS_STAGE_RECEIPT:-}" ]]; then
  export CAC_JOINS_STAGE_RECEIPT="${ROOT}/outputs/joins-source-stage/$(TZ=America/Chicago /bin/date '+%Y-%m-%d')-summary-$$/receipt.json"
  "$PYTHON" "$JOINS_BUILDER" --prepare-stage "${CAC_JOINS_STAGE_RECEIPT:h}"
fi
"$PYTHON" "$JOINS_BUILDER" --verify-stage "$CAC_JOINS_STAGE_RECEIPT"

LAST_STEP="capture and validate daily Movo source"
MOVO_SOURCE_STAGE="${CAC_FROZEN_MOVO_SOURCE:-${ROOT}/outputs/movo-renewal-outreach/source.json}"
MOVO_HISTORY="${CAC_MOVO_HISTORY_DIR:-/Volumes/MacProData/Patrol/Scout/CAC-Dashboard-Platform/Evidence/movo-daily-snapshots}"
if [[ -z "${CAC_MOVO_HISTORY_DIR:-}" ]]; then
  "$PYTHON" -c 'import os; import sys; sys.exit(0 if os.path.ismount("/Volumes/MacProData") else "Canonical Scout storage is unavailable; Movo refresh blocked")'
fi
require_dir "${MOVO_HISTORY:h}"
if [[ -n "${CAC_FROZEN_BUNDLE:-}" ]]; then
  "$PYTHON" "${ROOT}/tools/frozen_daily_bundle.py" verify --bundle "$CAC_FROZEN_BUNDLE"
else
  "$PYTHON" "${ROOT}/tools/refresh_movo_source.py" --output "$MOVO_SOURCE_STAGE"
fi
MOVO_CHECK_DATE="$(TZ=America/Chicago /bin/date '+%Y-%m-%d')"
MOVO_RECEIPT="${CAC_MOVO_VERIFICATION_RECEIPT:-/Volumes/MacProData/Patrol/Tracker/Movo/Evidence/${MOVO_CHECK_DATE}/verification-receipt.json}"
mkdir -p "$BUILD_DIR"
"$PYTHON" "${SUMMARY_REPO}/tools/build_renewal_outreach.py" --source "$MOVO_SOURCE_STAGE" --history-dir "$MOVO_HISTORY" --verification-receipt "$MOVO_RECEIPT" --output "${BUILD_DIR}/renewal-outreach-latest.js"

LAST_STEP="stage source-only GitHub Pages site"
log "Preparing isolated GitHub Pages staging tree"
"$SITE_STAGER" "$SUMMARY_REPO" "$SITE_STAGE" >/dev/null

copy_file "${BUILD_DIR}/renewal-outreach-latest.js" "${SITE_STAGE}/data/renewal-outreach-latest.js"
LAST_STEP="verify Tracker council-wide Movo handoff"
MOVO_COUNCIL_DUE_RECEIPTS="/Volumes/MacProData/Patrol/Tracker/Movo/Evidence/${MOVO_CHECK_DATE}-total-due"
typeset -a council_due_args
council_due_args=(--date "$MOVO_CHECK_DATE" --evidence "$MOVO_COUNCIL_DUE_RECEIPTS" --output "${SITE_STAGE}/data/movo-council-due-latest.js")
if [[ -n "${CAC_FROZEN_BUNDLE:-}" ]]; then
  council_due_args+=(--private-copy "${CAC_FROZEN_BUNDLE}/derived/movo-council-due")
fi
"$PYTHON" "${SUMMARY_REPO}/tools/build_movo_council_due.py" "${council_due_args[@]}"


LAST_STEP="test Unit Key 4 source validation"
"$PYTHON" "${SUMMARY_REPO}/tools/test_unit_key4.py"

LAST_STEP="build council and CST data snapshot"
log "Building fresh council and CST data snapshot"
cd /Users/petersargent
SERVICE_HIERARCHY_SNAPSHOT="${BUILD_DIR}/service_area_hierarchy.json"
"$PYTHON" "$SERVICE_HIERARCHY_REFRESHER" \
  --token-file "$MONDAY_TOKEN_FILE" \
  --output "$SERVICE_HIERARCHY_SNAPSHOT"
SERVICE_HIERARCHY_CACHE="$SERVICE_HIERARCHY_SNAPSHOT" \
  "$PYTHON" "$BUILDER" --output-dir "$BUILD_DIR"
"$PYTHON" "${SUMMARY_REPO}/tools/enrich_unit_key4.py" --snapshot "${BUILD_DIR}/data/latest.json"
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
  MONDAY_SUMMARY="$("$PYTHON" -c 'import json,sys; data=json.load(open(sys.argv[1])); boards=data["boards"]; schools=boards["schools"]; popcorn=boards["popcorn"]; print("source={} prospects={} renewals={} schools_affiliated={}/{} schools_verified={} popcorn={}/{}".format(data.get("source_workbook", data.get("generated_from")), boards["prospects"]["items"], boards["renewals"]["items"], schools["unit_affiliation_affiliated_schools"], schools["items"], schools["unit_affiliation_verified_schools"], popcorn["committed"], popcorn["items"]))' "${SITE_STAGE}/data/monday-latest.json")"
  MONDAY_STATUS="updated data/monday-latest.json"
  print -r -- "[monday] ${MONDAY_SUMMARY}"
else
  MONDAY_STATUS="failed; publication blocked"
  print -u2 -r -- "monday.com refresh failed; refusing to publish incomplete or stale TAY data."
  exit 1
fi

LAST_STEP="build Cub and Scouts BSA joins data"
log "Building joins dashboards from the newest dated workbooks"
"$PYTHON" "$JOINS_BUILDER" --stage-receipt "$CAC_JOINS_STAGE_RECEIPT" --council-snapshot "${SITE_STAGE}/data/latest.json" --output "${SITE_STAGE}/data/joins-latest.js"
FALL_RECRUITMENT_STATUS="updated both joins pages from same-day workbooks"

LAST_STEP="build Unit Level Dashboard data"
typeset -a UNIT_LEVEL_SOURCE_ARGS
UNIT_LEVEL_SOURCE_ARGS=()
if [[ -n "${CAC_DASHBOARD_SOURCE:-}" ]]; then
  UNIT_LEVEL_SOURCE="$CAC_DASHBOARD_SOURCE"
  UNIT_LEVEL_SOURCE_ARGS=(--working-copy-receipt "$CAC_WORKING_COPY_SOURCE_RECEIPT")
else
  UNIT_LEVEL_SOURCE="$(latest_valid_workbook "$UNIT_LEVEL_SOURCE_DIR" "*_CAC - Unit Metric Scorecard.xlsx")"
fi
log "Building Unit Level Dashboard data from ${UNIT_LEVEL_SOURCE}"
"$PYTHON" "$UNIT_LEVEL_BUILDER" "$UNIT_LEVEL_SOURCE" \
  "${UNIT_LEVEL_SOURCE_ARGS[@]}" \
  --council-snapshot "${SITE_STAGE}/data/latest.json" \
  --beascout-pin-report "${BEASCOUT_PIN_REPORT:-/Volumes/MacProData/Capitol Area Council Dashboard/Capitol Area Council/PinDataReport.csv}" \
  --beascout-audit "${BUILD_DIR}/beascout-link-audit.json" \
  --output "${SITE_STAGE}/data/unit-level-latest.json" \
  --js-output "${SITE_STAGE}/data/unit-level-latest.js"
BEASCOUT_COVERAGE="$("$PYTHON" -c 'import json,sys; m=json.load(open(sys.argv[1]))["source"]["beascout_links"]; print("BeAScout links: {} verified, {} unavailable".format(m["verified"], m["unavailable"]))' "${SITE_STAGE}/data/unit-level-latest.json")"
UNIT_LEVEL_STATUS="updated from ${UNIT_LEVEL_SOURCE:t}; ${BEASCOUT_COVERAGE}"
log "$BEASCOUT_COVERAGE"

if [[ -z "${CAC_FROZEN_BUNDLE:-}" && -d "$PREVIEW_SITE" ]]; then
  LAST_STEP="copy refreshed JSON to local preview"
  log "Updating local preview copy"
  mkdir -p "${PREVIEW_SITE}/data"
  copy_file "${SITE_STAGE}/data/latest.json" "${PREVIEW_SITE}/data/latest.json"
  copy_file "$ARCHIVE_JSON" "${PREVIEW_SITE}/data/${SNAPSHOT_DATE}.json"
  if [[ -f "${SITE_STAGE}/data/monday-latest.json" ]]; then
    copy_file "${SITE_STAGE}/data/monday-latest.json" "${PREVIEW_SITE}/data/monday-latest.json"
  fi
  if [[ -f "${SITE_STAGE}/data/joins-latest.js" ]]; then
    copy_file "${SITE_STAGE}/data/joins-latest.js" "${PREVIEW_SITE}/data/joins-latest.js"
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
  if [[ -z "${CAC_FROZEN_BUNDLE:-}" && -d "${PREVIEW_SITE}/renewal-board" ]]; then
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
if [[ -z "${CAC_FROZEN_BUNDLE:-}" && -d "$PREVIEW_SITE" ]]; then
  "$PYTHON" "$PERSON_NAME_SANITIZER" "$PREVIEW_SITE"
  "$PYTHON" "$PERSON_NAME_SANITIZER" "$PREVIEW_SITE" --check
fi

LAST_STEP="fetch GitHub Pages repository"
cd /Users/petersargent
if [[ -z "${CAC_FROZEN_BUNDLE:-}" ]]; then git_repo fetch origin "$BRANCH"; fi

LAST_STEP="confirm sole-writer GitHub state"
if [[ "$(git_repo rev-parse HEAD)" != "$BASE_REMOTE_SHA" || ( -z "${CAC_FROZEN_BUNDLE:-}" && "$(git_repo rev-parse "origin/${BRANCH}")" != "$BASE_REMOTE_SHA" ) || -n "$(git_repo status --porcelain --untracked-files=no)" ]]; then
  print -u2 -r -- "GitHub changed during the refresh; refusing to combine two writers. Retry the consolidated pipeline."
  exit 1
fi

LAST_STEP="revalidate discrete dashboard page structure before publication"
log "Revalidating dashboard structure before publication"
"$PYTHON" "${SITE_STAGE}/tools/validate_site_structure.py" "$SITE_STAGE" --require-data

if [[ -n "${CAC_FROZEN_BUNDLE:-}" ]]; then
  LAST_STEP="seal validated frozen daily data before web publication"
  "$PYTHON" "${ROOT}/tools/frozen_daily_bundle.py" seal --bundle "$CAC_FROZEN_BUNDLE" --site "$SITE_STAGE"
  "$PYTHON" "${SITE_STAGE}/tools/validate_site_structure.py" "$SITE_STAGE" --require-data
fi

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
