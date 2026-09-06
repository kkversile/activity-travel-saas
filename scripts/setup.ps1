$ErrorActionPreference = "Stop"

function Ensure-Secret([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  $content = Get-Content $Path -Raw
  if ($content -match '(?m)^JWT_SECRET=(CHANGE_ME|replace|change|demo)') {
    $secret = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
    $content = [regex]::Replace($content, '(?m)^JWT_SECRET=.*$', "JWT_SECRET=$secret")
    Set-Content -Path $Path -Value $content -NoNewline
  }
}

if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env" }
if (-not (Test-Path "activity-saas-backend/.env")) { Copy-Item "activity-saas-backend/.env.example" "activity-saas-backend/.env" }
Ensure-Secret ".env"
Ensure-Secret "activity-saas-backend/.env"

npm install
npm run db:up
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  docker compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' *> $null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $ready) { throw "PostgreSQL did not become ready" }
npm run db:migrate
npm run db:seed
npm run build
Write-Host "Setup complete. Run backend and frontend independently."
Write-Host "Web: http://localhost:3007  API: http://localhost:4007/api"
