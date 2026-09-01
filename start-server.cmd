@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-server.ps1"
if errorlevel 1 (
  echo.
  echo Quiq could not be started. Check .quiq-server-error.log for details.
  pause
  exit /b 1
)

timeout /t 2 /nobreak >nul
endlocal
