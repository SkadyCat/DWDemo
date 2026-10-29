# Web <-> UE parity: runs the UE automation test DWB.Rules.WebParity headless (exports
# Saved/RuleParity/ue.json), then the web interpreter on the same scenarios, then compares.
# Requires a built Beta editor target (Build-Beta.ps1) and no editor holding the project open.
$ErrorActionPreference = 'Stop'
$tool = $PSScriptRoot
$project = Resolve-Path (Join-Path $tool '..\..')
$engine = 'G:\UnrealEngine-Angelscript-5.8.3\Engine\Binaries\Win64\UnrealEditor-Cmd.exe'
$out = Join-Path $project 'Saved\RuleParity'
$log = Join-Path $project 'Saved\Tests\parity.log'
New-Item -ItemType Directory $out, (Split-Path $log) -Force | Out-Null
node (Join-Path $tool 'parity\make-scenarios.mjs')
$ue = Join-Path $out 'ue.json'
if (Test-Path $ue) { Rename-Item $ue ("ue-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$args = @("$project\DungeonWorldBeta.uproject", '-nullrhi', '-unattended', '-nosplash', '-nosound', '-NoWebUI',
  '-ExecCmds="Automation RunTests DWB.Rules.WebParity"', '-TestExit="Automation Test Queue Empty"', "-ABSLOG=$log")
$p = Start-Process $engine -ArgumentList $args -WindowStyle Hidden -PassThru
$t = 0
while (!$p.HasExited -and $t -lt 600) {
  Start-Sleep 3; $t += 3
  if ((Test-Path $ue) -and (Select-String -Path $log -Pattern 'Test Completed.*WebParity' -Quiet)) { break }
}
if (!$p.HasExited) { Stop-Process -Id $p.Id -Force }
if (!(Test-Path $ue)) { Write-Error "UE did not produce $ue (see $log)" }
node (Join-Path $tool 'parity\compare.mjs') --ue $ue
exit $LASTEXITCODE
