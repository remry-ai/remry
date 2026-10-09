@echo off
rem Remry plugin launcher for Windows: what scripts/remry does elsewhere.
rem   cmd /d /c <plugin>\scripts\remry.cmd mcp
rem It runs, in order of preference:
rem   1. the clone named by %REMRY_HOME%, or recorded in <data dir>\app-path
rem   2. the release binary in <plugin>\server, installed into <data dir>\App\<version>
rem      with App\current pointing at it, so updating the plugin never has to replace
rem      a running .exe
setlocal EnableExtensions
set "data=%LOCALAPPDATA%\Remry"
if "%LOCALAPPDATA%"=="" set "data=%USERPROFILE%\AppData\Local\Remry"
set "plugin=%~dp0.."
set "setup=Install the Remry plugin from a release, which includes the app, or clone the Remry repo and run `bun install` in the clone."

set "app=%REMRY_HOME%"
if not defined app set "app=%WONO_HOME%"
if not defined app set "app=%WORKING_NOTES_HOME%"
if not defined app if exist "%data%\app-path" set /p app=<"%data%\app-path"
rem Its earlier names, Wonos and Working Notes. The app moves its data from there on first run.
if not defined app if exist "%data%\..\Wonos\app-path" set /p app=<"%data%\..\Wonos\app-path"
if not defined app if exist "%data%\..\Working Notes\app-path" set /p app=<"%data%\..\Working Notes\app-path"
if defined app if exist "%app%\node_modules\" goto clone
set "app="

set "bundled=%plugin%\server\remry-windows-x64.exe"
if not exist "%bundled%" goto missing
set /p version=<"%plugin%\server\VERSION"
set "dest=%data%\App\%version%"
if exist "%dest%\remry.exe" goto run
set "staging=%data%\App\.install-%version%-%RANDOM%"
if exist "%staging%" rmdir /s /q "%staging%"
mkdir "%staging%\migrations" || exit /b 1
copy /y /b "%bundled%" "%staging%\remry.exe" >nul || exit /b 1
xcopy /e /i /q /y "%plugin%\server\migrations" "%staging%\migrations" >nul || exit /b 1
copy /y "%plugin%\server\VERSION" "%staging%\VERSION" >nul || exit /b 1
rem Another start may have installed this version meanwhile.
if exist "%dest%\remry.exe" (rmdir /s /q "%staging%") else (move "%staging%" "%dest%" >nul || exit /b 1)

:run
rem App\current is a directory junction, which needs no administrator rights.
if exist "%data%\App\current" rmdir "%data%\App\current"
mklink /J "%data%\App\current" "%dest%" >nul 2>&1
"%dest%\remry.exe" %*
exit /b %ERRORLEVEL%

:clone
set "bun=%REMRY_BUN%"
if not defined bun set "bun=%WONO_BUN%"
if not defined bun set "bun=%WNOTES_BUN%"
if not defined bun for %%B in (bun.exe) do set "bun=%%~$PATH:B"
if not defined bun if exist "%USERPROFILE%\.bun\bin\bun.exe" set "bun=%USERPROFILE%\.bun\bin\bun.exe"
if not defined bun (
  echo Remry needs Bun ^(https://bun.sh^), and it isn't on PATH. 1>&2
  exit /b 1
)
"%bun%" "%app%\cli\clone-entry.ts" %*
exit /b %ERRORLEVEL%

:missing
if exist "%plugin%\server\" (
  echo This Remry plugin has no build for Windows. Download remry-^<version^>-windows-x64.zip from https://github.com/remry-ai/remry/releases/latest and add it as a plugin, or install the desktop app. 1>&2
) else (
  echo Remry isn't set up on this computer. %setup% 1>&2
)
exit /b 1
