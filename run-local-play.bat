@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "PORT=3001"
set "ROOT_DIR=%~dp0"
set "NO_BROWSER=0"

if /I "%~1"=="--no-browser" (
    set "NO_BROWSER=1"
)

if not exist "%ROOT_DIR%package.json" (
    echo [run-local-play] ERROR: package.json not found in "%ROOT_DIR%"
    exit /b 1
)

echo [run-local-play] Target root: %ROOT_DIR%
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
start "web-minigame-factory-server" cmd /c "cd /d ""%ROOT_DIR%"" && npx.cmd --yes serve . -l %PORT%"

echo [run-local-play] Waiting for server readiness...
set "READY=0"
for /L %%I in (1,1,20) do (
    powershell -NoProfile -Command "$r=0; try { $r=(Invoke-WebRequest -Uri 'http://localhost:%PORT%/' -UseBasicParsing -TimeoutSec 2).StatusCode } catch { $r=0 }; if($r -ge 200 -and $r -lt 500){ exit 0 } else { exit 1 }" >nul 2>&1
    if not errorlevel 1 (
        set "READY=1"
        goto :ServerReady
    )
    timeout /t 1 /nobreak >nul
)

:ServerReady
if not "%READY%"=="1" (
    echo [run-local-play] ERROR: Server did not become ready on http://localhost:%PORT%/
    exit /b 1
)

echo [run-local-play] Ready: http://localhost:%PORT%/

if "%NO_BROWSER%"=="1" (
    exit /b 0
)

echo [run-local-play] Opening browser...
start "" "http://localhost:%PORT%/"
exit /b 0

:AddPid
set "PID=%~1"
if "%PID%"=="" goto :eof
if "%PID%"=="0" goto :eof
echo !PIDS! | findstr /C:" %PID% " >nul
if errorlevel 1 (
    set "PIDS=!PIDS!!PID! "
)
goto :eof
