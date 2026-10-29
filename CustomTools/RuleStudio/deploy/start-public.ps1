param([string]$CloudHost = 'tencent', [string]$BindAddress = '')
$ErrorActionPreference = 'Stop'
if ($CloudHost -notmatch '^[a-zA-Z0-9_.@-]+$') { throw 'Invalid SSH host alias' }
if ($BindAddress -and $BindAddress -notmatch '^[0-9.]+$') { throw 'Invalid bind address' }
$toolDir = Split-Path $PSScriptRoot -Parent
$projectDir = Split-Path (Split-Path $toolDir -Parent) -Parent
$runDir = Join-Path $projectDir 'Saved/RuleStudioPublic'
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

if (!(Get-NetTCPConnection -LocalPort 5290 -State Listen -ErrorAction SilentlyContinue)) {
    $app = Start-Process -FilePath (Get-Command node).Source -ArgumentList @('--watch', 'server.mjs', '5290') -WorkingDirectory $toolDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runDir 'app.stdout.log') -RedirectStandardError (Join-Path $runDir 'app.stderr.log') -PassThru
    $app.Id | Set-Content -LiteralPath (Join-Path $runDir 'app.pid')
}
$healthy = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
        $reply = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5290/' -TimeoutSec 2
        $text = if ($reply.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($reply.Content) } else { [string]$reply.Content }
        if ($reply.StatusCode -eq 200 -and $text.Contains('<title>RuleStudio')) { $healthy = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 150
}
if (!$healthy) { throw 'Port 5290 is not a healthy RuleStudio app; no tunnel started' }
$rules = Invoke-RestMethod -Uri 'http://127.0.0.1:5290/api/rules' -TimeoutSec 10
if (!$rules.files.Count) { throw 'RuleStudio has no readable rule files; no tunnel started' }

$existing = Get-CimInstance Win32_Process -Filter "Name='ssh.exe'" | Where-Object { $_.CommandLine -like '*127.0.0.1:15290:127.0.0.1:5290*' }
if ($existing) {
    Write-Output "RuleStudio tunnel already running, PID $($existing.ProcessId)"
} else {
    $tunnelArgs = @('-N', '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', '-R', '127.0.0.1:15290:127.0.0.1:5290', $CloudHost)
    if ($BindAddress) { $tunnelArgs = @('-b', $BindAddress) + $tunnelArgs }
    $tunnel = Start-Process -FilePath (Get-Command ssh).Source -ArgumentList $tunnelArgs -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runDir 'tunnel.stdout.log') -RedirectStandardError (Join-Path $runDir 'tunnel.stderr.log') -PassThru
    $tunnel.Id | Set-Content -LiteralPath (Join-Path $runDir 'tunnel.pid')
    Write-Output "RuleStudio tunnel PID $($tunnel.Id); local 5290 -> cloud loopback 15290"
}
Write-Output 'Public: http://43.139.72.98:5590/'
