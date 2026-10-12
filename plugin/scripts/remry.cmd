@echo off
rem Remry plugin launcher for Windows: what scripts/remry does elsewhere.
rem   cmd /d /c <plugin>\scripts\remry.cmd mcp
rem It runs, in order of preference, as scripts/remry does:
rem   1. the clone named by %REMRY_HOME%
rem   2. the desktop app's binary, <data dir>\App\current\remry.exe
rem   3. the clone `bun run setup` recorded in <data dir>\app-path
setlocal EnableExtensions
set "data=%LOCALAPPDATA%\Remry"
if "%LOCALAPPDATA%"=="" set "data=%USERPROFILE%\AppData\Local\Remry"
set "setup=Install the Remry desktop app (https://github.com/remry-ai/remry/releases/latest) and open it once, or clone the Remry repo and run `bun install` and `bun run setup` in the clone."

set "app=%REMRY_HOME%"
if not defined app set "app=%WONO_HOME%"
if not defined app set "app=%WORKING_NOTES_HOME%"
if defined app if exist "%app%\node_modules\" goto clone
set "app="

if exist "%data%\App\current\remry.exe" (
  "%data%\App\current\remry.exe" %*
  exit /b %ERRORLEVEL%
)
goto recorded

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

:recorded
if exist "%data%\app-path" set /p app=<"%data%\app-path"
rem Its earlier names, Wonos and Working Notes. The app moves its data from there on first run.
if not defined app if exist "%data%\..\Wonos\app-path" set /p app=<"%data%\..\Wonos\app-path"
if not defined app if exist "%data%\..\Working Notes\app-path" set /p app=<"%data%\..\Working Notes\app-path"
if defined app if exist "%app%\node_modules\" goto clone

:missing
echo Remry isn't set up on this computer. %setup% 1>&2
exit /b 1
