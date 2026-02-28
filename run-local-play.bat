@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "PORT=3001"
set "HEALTH_URL=http://127.0.0.1:%PORT%/api/health"
set "ROOT_DIR=%~dp0"
set "NO_BROWSER=0"
set "TARGET_GAME="

call :ParseArgs %*
if errorlevel 1 exit /b 1

if not defined TARGET_GAME (
    call :ResolveDefaultTargetGame
    if not defined TARGET_GAME (
        echo [run-local-play] ERROR: target game is required and default target resolve failed.
        call :Usage
        exit /b 1
    )
    echo [run-local-play] INFO: target game not provided. Using default target "!TARGET_GAME!".
)

if not exist "%ROOT_DIR%package.json" (
    echo [run-local-play] ERROR: package.json not found in "%ROOT_DIR%"
    exit /b 1
)

echo [run-local-play] Target root: %ROOT_DIR%
echo [run-local-play] Target game: %TARGET_GAME%

echo [run-local-play] Running new minigame prep gate...
node "%ROOT_DIR%skills\new-minigame-release-prep\scripts\run_new_minigame_release_prep.mjs" --game "%TARGET_GAME%"
if errorlevel 1 (
    echo [run-local-play] ERROR: predeploy prep stage failed.
    exit /b 1
)

echo [run-local-play] Running release readiness gate...
node "%ROOT_DIR%skills\release-readiness-gate\scripts\run_release_gate.mjs"
if errorlevel 1 (
    echo [run-local-play] ERROR: release readiness gate failed.
    exit /b 1
)

if not exist "%ROOT_DIR%deploy\deploy-prod.bat" (
    echo [run-local-play] ERROR: deploy script not found: "%ROOT_DIR%deploy\deploy-prod.bat"
    exit /b 1
)

echo [run-local-play] Running deploy hook...
call "%ROOT_DIR%deploy\deploy-prod.bat" "%TARGET_GAME%"
if errorlevel 1 (
    echo [run-local-play] ERROR: deploy stage failed.
    exit /b 1
)

echo [run-local-play] Cleaning existing server on port %PORT%...

set "PIDS= "
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
    call :AddPid %%P
)

if "!PIDS!"==" " (
    echo [run-local-play] No existing LISTENING process found on port %PORT%.
) else (
    for %%P in (!PIDS!) do (
        echo [run-local-play] Stopping PID %%P...
        taskkill /F /PID %%P >nul 2>&1
    )
)

echo [run-local-play] Starting clean local server...
start "web-minigame-factory-server" cmd /c "cd /d ""%ROOT_DIR%"" && npm.cmd run dev"

echo [run-local-play] Waiting for server readiness...
set "READY=0"
for /L %%I in (1,1,20) do (
    powershell -NoProfile -Command "$r=0; try { $r=(Invoke-WebRequest -Uri '%HEALTH_URL%' -UseBasicParsing -TimeoutSec 2).StatusCode } catch { $r=0 }; if($r -ge 200 -and $r -lt 500){ exit 0 } else { exit 1 }" >nul 2>&1
    if not errorlevel 1 (
        set "READY=1"
        goto :ServerReady
    )
    ping -n 2 127.0.0.1 >nul
)

:ServerReady
if not "%READY%"=="1" (
    echo [run-local-play] ERROR: Server did not become ready on %HEALTH_URL%
    exit /b 1
)

echo [run-local-play] Ready: http://localhost:%PORT%/

if "%NO_BROWSER%"=="1" (
    exit /b 0
)

echo [run-local-play] Opening browser...
start "" "http://localhost:%PORT%/"
exit /b 0

:ParseArgs
if "%~1"=="" goto :eof
set "ARG=%~1"
if /I "%ARG%"=="--no-browser" (
    set "NO_BROWSER=1"
    shift
    goto :ParseArgs
)
if "%ARG:~0,2%"=="--" (
    echo [run-local-play] ERROR: unknown option "%ARG%".
    call :Usage
    exit /b 1
)
if defined TARGET_GAME (
    echo [run-local-play] ERROR: multiple target games provided.
    call :Usage
    exit /b 1
)
set "TARGET_GAME=%ARG%"
shift
goto :ParseArgs

:Usage
echo Usage: run-local-play.bat [^<game^>] [--no-browser]
echo   game examples:
echo     neon-jumpin
echo     neon_jumpin.html
echo     src/html/neon_jumpin.html
echo   no game provided: auto-select default target from registry
goto :eof

:ResolveDefaultTargetGame
set "TARGET_GAME="
for /f "usebackq delims=" %%G in (`node -e "const fs=require('fs');const path=require('path');const p=path.join(process.cwd(),'src/html/registry.json');let out='';try{const raw=fs.readFileSync(p,'utf8');const reg=JSON.parse(raw);const games=Array.isArray(reg&&reg.games)?reg.games:[];const first=games.find((g)=>g&&typeof g.path==='string'&&g.path.trim());if(first){const file=path.basename(first.path).replace(/\\.html$/i,'');out=file.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}}catch(_e){}if(!out)out='neon-jumpin';process.stdout.write(out);"` ) do (
    if not "%%G"=="" set "TARGET_GAME=%%G"
)
if not defined TARGET_GAME set "TARGET_GAME=neon-jumpin"
goto :eof

:AddPid
set "PID=%~1"
if "%PID%"=="" goto :eof
if "%PID%"=="0" goto :eof
echo !PIDS! | findstr /C:" %PID% " >nul
if errorlevel 1 (
    set "PIDS=!PIDS!!PID! "
)
goto :eof
