# Phase 10 Quality Issue Model

Issues are tied to vendor, metric, dimension, and the snapshot that produced them. Severity is INFO, WARNING, or CRITICAL. Status is OPEN, ACKNOWLEDGED, RESOLVED, or DISMISSED. OPEN can transition to ACKNOWLEDGED, RESOLVED, or DISMISSED; ACKNOWLEDGED can transition to RESOLVED or DISMISSED; terminal states cannot reopen. Repeated ACKNOWLEDGE is idempotent.

FAIL opens a critical issue; WARN opens a warning issue; repeated snapshots update the one open/acknowledged issue for that vendor and metric. A PASS resolves a prior open issue with reason `Metric returned within configured threshold` and keeps history, while writing `SUPPLIER_QUALITY_ISSUE_AUTO_RESOLVED` in the same transaction. UNAVAILABLE never creates a vendor defect issue. Admin transitions and their audit rows are atomic; resolve/dismiss requires a reason. Vendors can read only their own open issues and cannot manage policy, tier, or issue state.
