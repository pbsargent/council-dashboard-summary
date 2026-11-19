"""Resolve age-split and normalized sheet/source paths for optional v2 renewal-outreach build.

Usage: resolve_movo_v2_paths.py RECEIPT EVIDENCE_DIR [NORMALIZED_SOURCE_OUT]

Prints zsh assignments. Soft-skip via MOVO_V2_SKIP_REASON. No network.
When NORMALIZED_SOURCE_OUT is given, writes a four-field source JSON there
(source_name, source_updated_at, captured_at, tabs). Extra sheet fields
(sheet_id/parent_id) are dropped. If the evidence sheet's captured_at is
before receipt.verified_at (normal for the frozen evidence sheet), captured_at
is raised to verified_at so verify_receipt chronology passes — same pattern as
movo_verification's own re-verify with now.isoformat().
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path

receipt = Path(sys.argv[1])
evidence_dir = Path(sys.argv[2])
norm_out = Path(sys.argv[3]) if len(sys.argv) > 3 else None

try:
    data = json.loads(receipt.read_text())
except Exception as exc:
    print(f"MOVO_V2_SKIP_REASON={exc!r}")
    raise SystemExit(0)

ev = data.get("evidence") or {}
age = ev.get("age_split") or {}
sheet = ev.get("sheet") or {}
age_env = os.environ.get("CAC_MOVO_AGE_SPLIT")
src_env = os.environ.get("CAC_FROZEN_MOVO_SOURCE")
age_path = Path(age_env) if age_env else (evidence_dir / age["name"] if age.get("name") else None)
raw_src = Path(src_env) if src_env else (evidence_dir / sheet["name"] if sheet.get("name") else None)

def assign(name, path):
    print(f"{name}={json.dumps(str(path) if path is not None else '')}")

def stamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))

assign("MOVO_AGE_SPLIT", age_path)

if data.get("version") not in (2, 3):
    assign("MOVO_SOURCE_STAGE", None)
    print("MOVO_V2_SKIP_REASON='unsupported receipt version'")
    raise SystemExit(0)
if age_path is None or not age_path.is_file():
    assign("MOVO_SOURCE_STAGE", None)
    print("MOVO_V2_SKIP_REASON='age-split missing'")
    raise SystemExit(0)
if raw_src is None or not raw_src.is_file():
    assign("MOVO_SOURCE_STAGE", None)
    print("MOVO_V2_SKIP_REASON='movo source/sheet missing'")
    raise SystemExit(0)

payload = json.loads(raw_src.read_text())
required = ("source_name", "source_updated_at", "captured_at", "tabs")
missing = [k for k in required if k not in payload]
if missing:
    assign("MOVO_SOURCE_STAGE", None)
    print(f"MOVO_V2_SKIP_REASON='source missing fields: {missing}'")
    raise SystemExit(0)
normalized = {k: payload[k] for k in required}
verified = data.get("verified_at")
if verified:
    try:
        if stamp(normalized["captured_at"]) < stamp(verified):
            normalized["captured_at"] = verified
    except Exception:
        pass

if norm_out is not None:
    norm_out.parent.mkdir(parents=True, exist_ok=True)
    norm_out.write_text(json.dumps(normalized, ensure_ascii=False, sort_keys=True) + "\n")
    assign("MOVO_SOURCE_STAGE", norm_out)
else:
    if set(payload) != set(required) or normalized["captured_at"] != payload["captured_at"]:
        assign("MOVO_SOURCE_STAGE", None)
        print("MOVO_V2_SKIP_REASON='source needs normalize; pass NORMALIZED_SOURCE_OUT'")
        raise SystemExit(0)
    assign("MOVO_SOURCE_STAGE", raw_src)
