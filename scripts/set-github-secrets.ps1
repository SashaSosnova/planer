# Run once after: gh auth login
# Sets CI secrets from local .env (file is gitignored).
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Test-Path .env)) {
  Write-Error '.env not found'
}

$keys = @(
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_DEEPSEEK_API_KEY'
)

$map = @{}
Get-Content .env | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith('#')) { return }
  $i = $line.IndexOf('=')
  if ($i -lt 1) { return }
  $k = $line.Substring(0, $i).Trim()
  $v = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
  $map[$k] = $v
}

foreach ($k in $keys) {
  $v = $map[$k]
  if ([string]::IsNullOrWhiteSpace($v)) {
    Write-Host "skip $k (empty)"
    continue
  }
  $v | gh secret set $k
  Write-Host "set $k"
}

Write-Host 'Done. Re-run the workflow if needed: gh workflow run "Android APK release"'
