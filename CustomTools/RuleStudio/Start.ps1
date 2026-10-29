# Starts RuleStudio on http://127.0.0.1:5291/ and opens the browser.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$port = 5291
Start-Process "http://127.0.0.1:$port/"
node --watch server.mjs $port
