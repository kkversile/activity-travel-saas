# Phase 11 — Opportunity Engine

`DemandAnalysisRun` is immutable. Each generated system candidate becomes an immutable `DemandOpportunityAssessment`. An active workflow opportunity is reused by deterministic SHA-256 `opportunityKey`; the key excludes Agent, search-attempt, and timestamp data.

Workflow states are `OPEN -> ACKNOWLEDGED -> IN_PROGRESS -> RESOLVED|DISMISSED`. Resolved and dismissed rows are terminal. Repeated evidence adds an assessment and updates detection time. A resolved/dismissed key is suppressed during the policy cooldown; after cooldown, a new workflow row may be created.

Priority comes from the matched rule's explicit default. Admin overrides require a reason and create an event/audit record. Resolve requires a resolution type and reason; it does not verify that capacity or a product was actually added.

Meaningful lifecycle and targeting events are written transactionally with AuditLog and Outbox records. PostgreSQL partial unique indexes enforce one active policy and one active workflow opportunity per key.

Vendor targets are historical rows. TARGETED/VIEWED targets can be removed with a governed reason and become `REMOVED`; INTERESTED, DECLINED, and ACTION_TAKEN responses are protected evidence. Targeting is rejected for RESOLVED/DISMISSED opportunities, duplicate targeting is idempotent, and Vendor responses require target `expectedVersion` with TARGETED/VIEWED as the only responseable states.

Rolling HIGH_CANCELLATIONS rows have null display service dates and stable identity based on type and business scope; each later analysis adds an `ASSESSMENT_ADDED` timeline event with run, policy, and assessment identifiers. Fresh concurrent generation takes a deterministic per-key PostgreSQL transaction lock and re-reads active/cooldown state before creating or reusing a workflow row.
