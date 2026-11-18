@echo off
title F.O.C.U.S. Trade Summary - backup
rem Timestamped copies of the project files into backups\ (run before every edit session).
cd /d "%~dp0"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i
if not exist backups mkdir backups
copy "index.html"   "backups\index_%TS%.html" >nul && echo   [OK] index.html
copy "ts-engine.js" "backups\ts-engine_%TS%.js" >nul && echo   [OK] ts-engine.js
copy "README.md"    "backups\README_%TS%.md" >nul && echo   [OK] README.md
copy "CLAUDE.md"    "backups\CLAUDE_%TS%.md" >nul && echo   [OK] CLAUDE.md
copy "start.bat"    "backups\start_%TS%.bat" >nul && echo   [OK] start.bat
echo.
echo Backup done: backups\*_%TS%.*
