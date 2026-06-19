@echo off
setlocal
cd /d "%~dp0"
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set "ELECTRON_EXE=%~dp0node_modules\electron\dist\electron.exe"
if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd install
)
if not exist "%ELECTRON_EXE%" (
  echo Electron runtime not found, reinstalling dependencies...
  call npm.cmd install
)
if not exist "%ELECTRON_EXE%" (
  echo Failed to prepare Electron runtime.
  pause
  exit /b 1
)
start "" /D "%~dp0" "%ELECTRON_EXE%" .
