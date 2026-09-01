param(
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pidFile = Join-Path $projectRoot '.quiq-server.pid'
$outputLog = Join-Path $projectRoot '.quiq-server.log'
$errorLog = Join-Path $projectRoot '.quiq-server-error.log'
$localUrl = 'http://localhost:3000/'

function Test-LocalServer {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $localUrl -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    }
    catch {
        return $false
    }
}

if (Test-Path -LiteralPath $pidFile) {
    try {
        $record = Get-Content -Raw -LiteralPath $pidFile | ConvertFrom-Json
        $managedProcess = Get-Process -Id ([int]$record.pid) -ErrorAction Stop
        $recordedStart = [DateTime]::Parse([string]$record.startedAt).ToUniversalTime()
        $actualStart = $managedProcess.StartTime.ToUniversalTime()
        $sameLaunch = [Math]::Abs(($actualStart - $recordedStart).TotalSeconds) -lt 5

        if ($sameLaunch -and (Test-LocalServer)) {
            Write-Host 'Quiq is already running. Opening the browser...'
            if (-not $NoBrowser) { Start-Process $localUrl }
            exit 0
        }
    }
    catch {
        # A stale process record is replaced below.
    }

    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

if (Test-LocalServer) {
    Write-Host 'A server is already using http://localhost:3000/.'
    Write-Host 'Opening the existing server without replacing it.'
    if (-not $NoBrowser) { Start-Process $localUrl }
    exit 0
}

$npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$serverProcess = Start-Process `
    -FilePath $npmCommand `
    -ArgumentList @('run', 'dev') `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outputLog `
    -RedirectStandardError $errorLog `
    -PassThru

$record = [ordered]@{
    pid = $serverProcess.Id
    startedAt = $serverProcess.StartTime.ToUniversalTime().ToString('o')
    projectRoot = $projectRoot
}
$record | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding utf8

$deadline = (Get-Date).AddSeconds(40)
do {
    if (Test-LocalServer) {
        Write-Host 'Quiq is running at http://localhost:3000/'
        if (-not $NoBrowser) { Start-Process $localUrl }
        exit 0
    }

    $serverProcess.Refresh()
    if ($serverProcess.HasExited) {
        Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
        throw 'The server process stopped before Quiq was ready.'
    }

    Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)

& taskkill.exe /PID $serverProcess.Id /T /F *> $null
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
throw 'Quiq did not become ready within 40 seconds.'
