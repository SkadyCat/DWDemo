$ErrorActionPreference = 'Stop'
$migrationTool = $PSScriptRoot
$migrationProject = (Resolve-Path (Join-Path $migrationTool '..\..')).Path
$migrationEngine = 'G:\UnrealEngine-Angelscript-5.8.3\Engine\Binaries\Win64\UnrealEditor-Cmd.exe'
$migrationSaved = Join-Path $migrationProject 'Saved\RulesMigration'
New-Item -ItemType Directory -Path $migrationSaved -Force | Out-Null
node (Join-Path $migrationTool 'scripts\export-native-contract.mjs') --check
if ($LASTEXITCODE -ne 0) { throw 'Native contract is stale' }
node (Join-Path $migrationTool 'scripts\make-native-character-parity.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Cannot generate character parity input' }
node (Join-Path $migrationTool 'scripts\make-native-combat-parity.mjs') --all
if ($LASTEXITCODE -ne 0) { throw 'Cannot generate combat parity input' }
node (Join-Path $migrationTool 'scripts\make-native-economy-parity.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Cannot generate equipment/value parity input' }
$migrationLog = Join-Path $migrationSaved 'native-tests.log'
$migrationArgs = @("$migrationProject\DungeonWorldOpus.uproject", '-nullrhi', '-unattended', '-nosplash', '-nosound', '-NoWebUI',
  '-ExecCmds="Automation RunTests DWRules.Migration"', '-TestExit="Automation Test Queue Empty"', "-ABSLOG=$migrationLog")
$migrationProcess = Start-Process -FilePath $migrationEngine -ArgumentList $migrationArgs -WindowStyle Hidden -PassThru
$migrationDeadline = (Get-Date).AddMinutes(10)
while (!$migrationProcess.HasExited -and (Get-Date) -lt $migrationDeadline) { Start-Sleep -Seconds 3; $migrationProcess.Refresh() }
if (!$migrationProcess.HasExited) { Stop-Process -Id $migrationProcess.Id -Force; throw "Native migration tests timed out; see $migrationLog" }
$migrationProcess.WaitForExit()
$migrationText = Get-Content -LiteralPath $migrationLog -Raw
$migrationFailures = [regex]::Matches($migrationText, 'Test Completed\. Result=\{Fail[^}]*\}[^\r\n]*')
$migrationPasses = [regex]::Matches($migrationText, 'Test Completed\. Result=\{Success\}[^\r\n]*Path=\{DWRules\.Migration\.[^}]+\}')
foreach ($migrationMatch in [regex]::Matches($migrationText, '(?m)^.*(?:Character parity:|Combat parity:|Economy native export:|Test Completed\.|LogAutomationController: Error:).*$')) { $migrationMatch.Value }
if ($migrationProcess.ExitCode -ne 0 -or $migrationFailures.Count -gt 0 -or $migrationPasses.Count -lt 14) { throw "Native migration tests failed or did not run; see $migrationLog" }
node (Join-Path $migrationTool 'scripts\make-native-economy-parity.mjs') --compare
if ($LASTEXITCODE -ne 0) { throw 'Equipment/value parity differs' }
"Native migration tests: $($migrationPasses.Count) passed; log=$migrationLog"
