@echo off
cd /d "%~dp0CustomTools\RuleStudio"
node --watch server.mjs 5291
pause
