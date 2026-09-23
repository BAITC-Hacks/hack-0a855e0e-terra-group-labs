[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

function Invoke-Check([string]$Name, [scriptblock]$Command) {
    Write-Host "`n== $Name ==" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$Name failed with code $LASTEXITCODE" }
}

Invoke-Check 'Pipeline' { uv run --project backend pipeline }
Invoke-Check 'Output validator' { uv run --project backend validate-outputs }
Invoke-Check 'Backend tests' { uv run --project backend pytest -q }
Invoke-Check 'Ruff' { uv run --project backend ruff check backend/src tests }
Invoke-Check 'Frontend unit tests' { npm run test --prefix frontend }
Invoke-Check 'Frontend lint' { npm run lint --prefix frontend }
Invoke-Check 'Frontend production build' { npm run build --prefix frontend }
Invoke-Check 'Playwright E2E' { npm run test:e2e --prefix frontend }

Write-Host "`nQA CHECKS PASSED" -ForegroundColor Green
