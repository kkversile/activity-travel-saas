# Health, notifications and credential-independent operations

## Implemented behavior

Document-expiry email now reports connected when SMTP is configured, matching the existing document reminder worker. WhatsApp, SMS and review email remain unavailable where no delivery implementation exists. The configured theme and notification preferences are unchanged.

`GET /api/health` and `/api/health/ready` return HTTP 200 only when the application database pool can query the User/outlet schema and the configured storage can write, read and delete a unique private probe. Dependency failure returns HTTP 503 with generic `up`/`down` checks. Connection strings, paths and provider errors are not exposed. Responses use `Cache-Control: no-store`. Successful checks are cached ten seconds, failures two seconds, and concurrent checks coalesce. Each probe has a 2.5-second deadline; database queries additionally have pool/transaction/statement limits. An unresponsive dependency receives only one outstanding operation. `/api/health/live` remains an independent process-liveness endpoint.

Storage probes use private/health UUID keys, are deleted after use and never create FileAsset/business records. S3 uses the same private bucket/prefix and attempts cleanup even after an ambiguous PUT failure. A private bucket lifecycle rule for health probes older than one day is recommended when the actual S3 provider is enabled. The live demo continues using local storage.

Docker Compose now persists uploads in a named volume, probes real API readiness and waits for it before starting the web container. Compose configuration is validated; the live demo remains the existing Apache/systemd deployment.

## Local operational automation

The `ops/` tools require no new provider account or credential. They use PostgreSQL peer authentication over the local Unix socket, root-only configuration and protected backup/state directories. They do not send email, release payments, stop the API, or restore live data.

- `voya-backup.timer`: daily at **01:30 UTC / 07:00 IST**, with up to five minutes jitter. It creates a custom-format PostgreSQL dump, an uploads archive excluding ephemeral health probes, and copies the existing environment files for encrypted-data recovery. It validates archive contents and file hashes before publishing a completed manifest.
- `voya-monitor.timer`: approximately every minute, checks real readiness and a completed backup younger than 26 hours. Failures are written to the system journal and cause the monitoring service to fail. Known missing originals remain explicit warning state; newly missing files are failures.
- Backups have **14-day retention**, retain at least two completed backups, and only prune strictly named/marked directories created by this tool. Unmarked directories, symlinks and incomplete backups are preserved for inspection. The protected state is `/var/lib/voya-ops/status.json`; configuration is `/etc/voya-ops/settings.json`.

The daily backup is online. It uses the dump's own FileAsset snapshot to check uploads completeness and immutable file hashes; it reports any concurrent deletion or missing original. This is distinct from the quiesced, consistent fresh backup used for a release cutover. Incomplete backups are not counted as successful recovery points. No automatic recovery or service restart occurs merely because a dependency is unavailable.

Install only after the approved candidate service is healthy, using the release's `ops/` folder:

```bash
sudo python3 ops/install_voya_ops.py --service voya-api-demo-<revision>.service --apply
sudo systemctl status voya-backup.timer voya-monitor.timer
sudo journalctl -u voya-backup.service -u voya-monitor.service
sudo cat /var/lib/voya-ops/status.json
```

The installer refreshes the release/environment path on later deployments and preserves the existing missing-file baseline. First installation refuses an unexpected count; `--accept-existing-missing-count=10` is used only for the explicitly audited pre-existing condition below. It does not certify, recreate or remove any missing document.

## Existing missing originals

Before this change, the live database had **79 FileAsset references and 69 stored files**. Ten referenced originals were already missing: eight vendor-document assets, one product-media asset and one non-current voucher. Five missing assets had document-version references; no current voucher pointed at a missing file. Seven historical uploads archives and both unique historical storage roots were checked; none contained these originals.

Existing rows and review decisions are preserved. The new backup manifests and monitor report this inherited condition as a warning using private key hashes, not document contents. Restore from authentic client/source originals is still needed. Newly missing references are not added automatically to the accepted baseline. Backups cannot reconstruct bytes that were absent before backup; this limitation must remain visible during client handover.

## Items requiring client configuration/input

Offsite backup storage, encryption-key custody outside the server, and external email/Slack/uptime alert recipients still require an approved client destination/account. Local journal monitoring is active after installation; external delivery is not claimed. Production hosting/Spaces activation, genuine verification documents, OpenAI, SMS/DLT, mailbox acceptance, training and client UAT/sign-off remain outside this credential-independent work.

SMTP is already configured. Scheduled report delivery remains gated by `VENDOR_REPORT_SCHEDULER_ENABLED` and approved report recipients/schedules. The loopback SMTP/report integration is tested; deployment does not activate unsolicited deliveries to existing recipients or change saved schedules.

## Verification

Run backend Jest/build, frontend Vitest/build, `python3 -m unittest discover -s ops -p 'test_*.py'`, and the guarded `scripts/verify-readiness-failures.cjs` against a disposable PostgreSQL 15 copy. The latter verifies healthy readiness, disconnected DB, reachable DB with missing schema, and unusable storage, while liveness remains HTTP 200. Never simulate those failures on live. The S3 emulator round-trip and existing multi-outlet/finance suites remain regression checks. Live deployment/backup/test results are recorded separately after cutover.
