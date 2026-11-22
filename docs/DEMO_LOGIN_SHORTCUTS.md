# Demo login shortcuts

The existing login screen displays Vendor, Super Admin, Admin and Agent buttons only when both the email and password for each role are supplied at build time. A build without these values hides the corresponding buttons. Clicking a button prefills the normal login form; users still click Sign in and authenticate through the existing API.

For the live demo, build the frontend with its persistent private configuration:

```sh
cd activity-saas-frontend
npm ci --include=dev
npm run test:demo-build
npm test -- --maxWorkers=2
npm run build:demo -- /etc/voya/frontend-demo.env
node scripts/check-build-budget.mjs
```

The demo build command requires the API URL and all four configured role credentials before compilation. It loads only `VITE_` entries from the supplied file, without copying that file into the project or printing its contents. These credentials become public in the browser bundle: use the designated demonstration accounts only. Ordinary deployments can continue using `npm run build` without demo credentials.

Deploy the built frontend using a fresh backup and retain previous hashed assets for already open browser sessions. No backend restart, schema migration, data backfill or account password changes are required. Preserve the configured appearance and verify all four buttons prefill the form without automatically submitting it.
