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
