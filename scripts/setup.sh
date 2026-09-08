#!/usr/bin/env bash
set -euo pipefail

ensure_secret() {
  local file="$1"
  if [[ ! -f "$file" ]]; then return; fi
  if grep -Eq '^JWT_SECRET=(CHANGE_ME|replace|change|demo)' "$file"; then
    local secret
    secret="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
    node - "$file" "$secret" <<'NODE'
const fs = require('fs');
const [file, secret] = process.argv.slice(2);
const current = fs.readFileSync(file, 'utf8');
fs.writeFileSync(file, current.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`));
NODE
  fi
}

cp -n .env.example .env || true
cp -n activity-saas-backend/.env.example activity-saas-backend/.env || true
ensure_secret .env
ensure_secret activity-saas-backend/.env

npm install
npm run db:up
for _ in $(seq 1 30); do
  if docker compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then break; fi
  sleep 1
done
npm run db:migrate
npm run db:seed
npm run build
printf '\nSetup complete. Run backend and frontend independently.\nWeb: http://localhost:3007  API: http://localhost:4007/api\n'
