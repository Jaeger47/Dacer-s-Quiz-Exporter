$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pidFile = Join-Path $projectRoot '.quiq-server.pid'

if (-not (Test-Path -LiteralPath $pidFile)) {
    Write-Host 'Quiq is not running through start-server.cmd.'
    exit 0
}

$record = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
$recordedRoot = [System.IO.Path]::GetFullPath([string]$record.projectRoot)
if ($recordedRoot -ne $projectRoot) {
    throw 'The saved server record belongs to a different project.'
}

$serverPid = [int]$record.pid
try {
    $serverProcess = Get-Process -Id $serverPid -ErrorAction Stop
}
catch {
    Remove-Item -LiteralPath $pidFile -Force
    Write-Host 'Quiq was already stopped. The stale server record was removed.'
    exit 0
}

$recordedStart = [DateTime]::Parse([string]$record.startedAt).ToUniversalTime()
$actualStart = $serverProcess.StartTime.ToUniversalTime()
if ([Math]::Abs(($actualStart - $recordedStart).TotalSeconds) -ge 5) {
    throw 'The saved process ID has been reused. No process was stopped.'
}

& taskkill.exe /PID $serverPid /T /F *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Windows could not stop the Quiq server process.'
}

Remove-Item -LiteralPath $pidFile -Force
Write-Host 'Quiq server stopped.'
