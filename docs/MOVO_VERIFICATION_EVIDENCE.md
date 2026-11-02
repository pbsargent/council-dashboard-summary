# Movo verification evidence

New receipts use version 2. The authorized Tracker observer must retain the
original Movo transport response and obtain structured aggregate JSON containing
exactly `source_url` (`https://app.trymovo.ai`), `captured_at` (actual observation
clock with timezone), `data_through` (explicit source date or null), and `tabs`.
The five tabs must use the complete Sheet table schema. Derive the observation
from this response, never from a saved Sheet capture. Pass that structured JSON
as `--raw` and the derived observation as `--observation` to the receipt helper.
If complete source tables cannot be obtained, stop without replacing the prior
receipt. Preserve actual clocks; a test replay is not a new source observation.

The helper parses the raw JSON and requires matching clocks and table hashes,
reconciled counts, exact Sheet identity and update clock, and same-day observation
and verification. Nonblocking shared reader/exclusive writer locks protect the
receipt installation. Keep the lock file inode. A busy writer fails closed.

Hashes prove consistency, not source authentication. A trusted observer could
fabricate both raw JSON and an observation. Retaining original transport evidence
and enforcing the observer's capture procedure remain essential. The helper does
not claim cryptographic proof of Movo origin or continuous source freshness.

The independently verified November 1 version-1 receipt is preserved unchanged.
Only its exact audited SHA-256 is accepted for version 1, through November 1, 2026; later daily
runs require version 2. No historical receipt may be restamped to pass this gate.

The pinned historical v1 receipt retains its original update-clock rule (the
current Sheet clock may advance while all five tables remain identical). Its
saved metadata preceded Drive's settled clock by 14.817 seconds. Version 2
requires exact update-clock equality; it has no such exception.

## Final Sheet readback and receipt ordering (November 2, 2026)

Daily tables may vary in both values and row count. Preserve the actual Movo raw response and observation; compare complete normalized tables. Complete any necessary in-place Sheet update and settle all writes before collecting final metadata-before, all five tabs, and metadata-after. Both metadata reads must agree. Record the real final source identity/name/update timestamp and readback completion in the helper input; do not reuse a write response or pre-write metadata. Only then create and independently validate the v2 receipt. If metadata changes, one bounded complete fresh readback may replace the candidate; ongoing instability or table mismatch stops without rewriting unchanged source data.

Metadata drift with unchanged tables is still rejected by the consumer. Authorized recovery may use the original real same-day raw/observation and a matching fresh stable Sheet readback to produce a separate helper-generated receipt; it is not a new source observation. Preserve original receipts and clocks. Mismatched tables, stale observations, arbitrary legacy receipts and hand-written evidence remain rejected. Synthetic tests cover both sides of the legacy cutoff and final-readback reconciliation without production writes or network calls.
