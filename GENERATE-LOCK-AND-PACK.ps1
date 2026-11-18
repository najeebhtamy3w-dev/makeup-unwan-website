$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Node.js/npm is not installed or is not in PATH.' }
Write-Host 'Generating verified npm lockfile...' -ForegroundColor Cyan
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm lockfile generation failed. No release ZIP produced.' }
if (-not (Test-Path 'package-lock.json')) { throw 'package-lock.json was not created.' }
Write-Host 'Verifying lockfile with npm ci...' -ForegroundColor Cyan
npm ci --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. No release ZIP produced.' }
Write-Host 'Checking generated Netlify configuration...' -ForegroundColor Cyan
npm run check:config
if ($LASTEXITCODE -ne 0) { throw 'Configuration check failed. No release ZIP produced.' }
$out = Join-Path (Split-Path $PSScriptRoot -Parent) 'makeup-unwan-admin-v1.2.2-with-lock.zip'
if (Test-Path $out) { Remove-Item $out -Force }
$items = Get-ChildItem -Force | Where-Object { $_.Name -notin @('node_modules','.git') }
Compress-Archive -Path $items.FullName -DestinationPath $out -CompressionLevel Optimal
Write-Host "Verified release archive: $out" -ForegroundColor Green
