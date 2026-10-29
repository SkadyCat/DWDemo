param([int]$Seconds = 20)
$ErrorActionPreference = 'Stop'
$smokeProject = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$smokeEngine = 'G:\UnrealEngine-Angelscript-5.8.3\Engine\Binaries\Win64\UnrealEditor-Cmd.exe'
$smokeFolder = Join-Path $smokeProject 'Saved\RulesMigration'
New-Item -ItemType Directory -Path $smokeFolder -Force | Out-Null
$smokeLog = Join-Path $smokeFolder 'game-smoke.log'
$smokeArgs = @("$smokeProject\DungeonWorldBeta.uproject", '/Engine/Maps/Entry?game=/Script/DungeonWorldBeta.DWBGameMode',
  '-game', '-nullrhi', '-unattended', '-nosplash', '-nosound', '-NoWebUI', '-DWBAutoCast', '-DWBGod', '-DWBAllTraits',
  "-DWBSmoke=$Seconds", '-ExecCmds="t.MaxFPS 60"', "-ABSLOG=$smokeLog")
$smokeProcess = Start-Process -FilePath $smokeEngine -ArgumentList $smokeArgs -WindowStyle Hidden -PassThru
$smokeDeadline = (Get-Date).AddMinutes(3)
while (!$smokeProcess.HasExited -and (Get-Date) -lt $smokeDeadline) { Start-Sleep -Seconds 2; $smokeProcess.Refresh() }
if (!$smokeProcess.HasExited) { Stop-Process -Id $smokeProcess.Id -Force; throw "Smoke timed out: $smokeLog" }
$smokeProcess.WaitForExit()
$smokeText = Get-Content -LiteralPath $smokeLog -Raw
$smokeRows = [regex]::Matches($smokeText, 'DWBSmoke t=(\d+) casts=(\d+).*?hits=(\d+).*?kills=(\d+).*?damage=([\d.]+)')
$smokeNative = [regex]::Matches($smokeText, 'DWBNative player=(\d+) monsterCasts=(\d+)')
foreach ($smokeMatch in [regex]::Matches($smokeText, '(?m)^.*(?:DWBSmoke t=|DWBNative player=).*$')) { $smokeMatch.Value }
if ($smokeProcess.ExitCode -ne 0 -or !$smokeRows.Count -or !$smokeNative.Count) { throw "Game did not finish native smoke: $smokeLog" }
$smokeLast = $smokeRows[$smokeRows.Count - 1]
$smokeLastNative = $smokeNative[$smokeNative.Count - 1]
if ([int]$smokeLast.Groups[1].Value -lt $Seconds -or [int]$smokeLast.Groups[2].Value -lt 1 -or [int]$smokeLast.Groups[3].Value -lt 1 -or
    [double]$smokeLast.Groups[5].Value -le 0 -or $smokeLastNative.Groups[1].Value -ne '1' -or [int]$smokeLastNative.Groups[2].Value -lt 1) {
  throw "Native player/monster/damage smoke incomplete: $smokeLog"
}
"Native gameplay smoke passed; log=$smokeLog"
