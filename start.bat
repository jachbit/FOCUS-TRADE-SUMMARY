@echo off
title F.O.C.U.S. Options and Stocks Trade Summary - Jachbit 2026
rem Local preview on port 8137 (static page, no credentials). Close this window to stop it.
cd /d "%~dp0"
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8137"
python -m http.server 8137
