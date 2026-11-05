# Local development database

The development API connects to the PostgreSQL instance on `139.59.73.162` through an SSH local forward. Keep `DATABASE_URL` in `.env` pointed at `127.0.0.1:15432`; do not replace it with a hosted database URL.

Start or check the forward from this directory:

```powershell
npm run db:tunnel
```

The launcher uses the machine's existing OpenSSH configuration and key, checks for an existing matching forward, and reconnects after an SSH interruption. Press Ctrl+C to stop it. To use another local port, run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-db-tunnel.ps1 -LocalPort 15433` and point the local `DATABASE_URL` at that port.
