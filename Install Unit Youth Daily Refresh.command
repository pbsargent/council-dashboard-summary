#!/bin/zsh
set -euo pipefail

TARGET="/Users/petersargent/CouncilDashboardSummaryUpdate.zsh"

python3 - <<'PY'
from pathlib import Path

target = Path("/Users/petersargent/CouncilDashboardSummaryUpdate.zsh")
text = target.read_text(encoding="utf-8")

if 'UNIT_YOUTH_INJECTOR=' not in text:
    text = text.replace(
        'MONDAY_REFRESHER="${SUMMARY_REPO}/refresh_monday_data.py"\n',
        'MONDAY_REFRESHER="${SUMMARY_REPO}/refresh_monday_data.py"\n'
        'UNIT_YOUTH_INJECTOR="${COUNCIL_DASHBOARD_SUMMARY_UNIT_YOUTH_INJECTOR:-${SUMMARY_REPO}/tools/inject_unit_youth_trends.py}"\n',
    )

if 'require_file "$UNIT_YOUTH_INJECTOR"' not in text:
    text = text.replace(
        'require_file "$MONDAY_REFRESHER"\n',
        'require_file "$MONDAY_REFRESHER"\n'
        'require_file "$UNIT_YOUTH_INJECTOR"\n',
    )

inject_call = '"$PYTHON" "$UNIT_YOUTH_INJECTOR" "${SUMMARY_REPO}/data/latest.json" "${SUMMARY_REPO}/data/${SNAPSHOT_DATE}.json"\n'
if inject_call not in text:
    text = text.replace(
        'copy_file "${BUILD_DIR}/data/latest.json" "${SUMMARY_REPO}/data/latest.json"\n'
        'copy_file "$ARCHIVE_JSON" "${SUMMARY_REPO}/data/${SNAPSHOT_DATE}.json"\n',
        'copy_file "${BUILD_DIR}/data/latest.json" "${SUMMARY_REPO}/data/latest.json"\n'
        'copy_file "$ARCHIVE_JSON" "${SUMMARY_REPO}/data/${SNAPSHOT_DATE}.json"\n'
        f'{inject_call}',
    )

target.write_text(text, encoding="utf-8")
PY

chmod +x "$TARGET"

echo "Installed Unit-Youth daily refresh injection into:"
echo "$TARGET"
echo ""
echo "Press Return to close this window."
read -r _
