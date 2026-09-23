[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

$occupied = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object LocalPort -In 8000, 5173
if ($occupied) {
    $details = $occupied | ForEach-Object { "port $($_.LocalPort), PID $($_.OwningProcess)" }
    throw "Required ports are occupied: $($details -join '; '). Stop the existing demo with Ctrl+C first."
}

$uvPath = (Get-Command uv -ErrorAction Stop).Source
$backendProcess = Start-Process -FilePath $uvPath `
    -ArgumentList @('run', '--project', 'backend', 'backend') `
    -WorkingDirectory $projectRoot -PassThru -NoNewWindow

try {
    Write-Host 'Demo: http://127.0.0.1:5173  (Ctrl+C stops both services)'
    npm run dev --prefix frontend
    if ($LASTEXITCODE -ne 0) { throw "Frontend exited with code $LASTEXITCODE" }
}
finally {
    $backendListener = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue
    if ($backendListener) {
        $backendListener | Select-Object -ExpandProperty OwningProcess -Unique |
            ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    }
    if (-not $backendProcess.HasExited) {
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
