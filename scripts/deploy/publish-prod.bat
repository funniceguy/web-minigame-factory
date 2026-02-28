@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "TARGET_GAME=%~1"
if "%TARGET_GAME%"=="" (
    echo [publish-prod] ERROR: target game is required.
    echo [publish-prod] Usage: scripts\deploy\publish-prod.bat ^<game^>
    exit /b 1
)

for %%I in ("%~dp0..\..") do set "ROOT_DIR=%%~fI"
set "DEFAULT_STAGE_DIR=%ROOT_DIR%\deploy\_out\prod\web-minigame-factory"

if not defined DEPLOY_TARGET_DIR (
    set "DEPLOY_TARGET_DIR=%DEFAULT_STAGE_DIR%"
)

echo [publish-prod] Target game: %TARGET_GAME%
echo [publish-prod] Source root: "%ROOT_DIR%"
echo [publish-prod] Stage target: "%DEPLOY_TARGET_DIR%"

if not exist "%DEPLOY_TARGET_DIR%" (
    mkdir "%DEPLOY_TARGET_DIR%" >nul 2>&1
    if errorlevel 1 (
        echo [publish-prod] ERROR: failed to create stage target.
        exit /b 2
    )
)

robocopy "%ROOT_DIR%" "%DEPLOY_TARGET_DIR%" /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP ^
    /XD "%ROOT_DIR%\.git" "%ROOT_DIR%\node_modules" "%ROOT_DIR%\data" "%ROOT_DIR%\deploy\_out" "%ROOT_DIR%\skills\new-minigame-release-prep\reports" ^
    /XF "run_local*.log" ".env" ".env.*"
set "ROBOCOPY_EXIT=!errorlevel!"
if !ROBOCOPY_EXIT! GEQ 8 (
    echo [publish-prod] ERROR: robocopy failed with exit code !ROBOCOPY_EXIT!.
    exit /b !ROBOCOPY_EXIT!
)
echo [publish-prod] Staging copy finished with exit code !ROBOCOPY_EXIT! (success).

if not defined DEPLOY_REMOTE_HOST (
    echo [publish-prod] DEPLOY_REMOTE_HOST is not set. Local staging-only deploy complete.
    exit /b 0
)

if not defined DEPLOY_REMOTE_USER set "DEPLOY_REMOTE_USER=root"
if not defined DEPLOY_REMOTE_PORT set "DEPLOY_REMOTE_PORT=22"
if not defined DEPLOY_REMOTE_APP_DIR set "DEPLOY_REMOTE_APP_DIR=/var/www/web-minigame-factory"
if not defined DEPLOY_REMOTE_TMP_DIR set "DEPLOY_REMOTE_TMP_DIR=/tmp"
if not defined DEPLOY_RESTART_BACKEND set "DEPLOY_RESTART_BACKEND=0"
if not defined DEPLOY_RELOAD_NGINX set "DEPLOY_RELOAD_NGINX=0"
if not defined DEPLOY_BACKEND_SERVICE set "DEPLOY_BACKEND_SERVICE=web-minigame-factory"

call :RequireCommand tar
if errorlevel 1 exit /b 20
call :RequireCommand scp
if errorlevel 1 exit /b 21
call :RequireCommand ssh
if errorlevel 1 exit /b 22

for /f %%I in ('powershell -NoProfile -Command "(Get-Date).ToString(\"yyyyMMdd-HHmmss\")"') do set "STAMP=%%I"
if not defined STAMP set "STAMP=%RANDOM%%RANDOM%"

set "ARCHIVE_NAME=web-minigame-factory-%STAMP%.tar.gz"
set "LOCAL_ARCHIVE=%TEMP%\%ARCHIVE_NAME%"
set "REMOTE_ARCHIVE=%DEPLOY_REMOTE_TMP_DIR%/%ARCHIVE_NAME%"
set "REMOTE_TARGET=%DEPLOY_REMOTE_USER%@%DEPLOY_REMOTE_HOST%"

if exist "%LOCAL_ARCHIVE%" del /q "%LOCAL_ARCHIVE%" >nul 2>&1

echo [publish-prod] Creating archive: "%LOCAL_ARCHIVE%"
pushd "%DEPLOY_TARGET_DIR%" >nul
tar -czf "%LOCAL_ARCHIVE%" .
set "TAR_EXIT=!errorlevel!"
popd >nul
if not "!TAR_EXIT!"=="0" (
    echo [publish-prod] ERROR: tar archive creation failed.
    exit /b 23
)

echo [publish-prod] Uploading archive to %REMOTE_TARGET%:%REMOTE_ARCHIVE%
scp -P %DEPLOY_REMOTE_PORT% "%LOCAL_ARCHIVE%" "%REMOTE_TARGET%:%REMOTE_ARCHIVE%"
if errorlevel 1 (
    echo [publish-prod] ERROR: archive upload failed.
    if exist "%LOCAL_ARCHIVE%" del /q "%LOCAL_ARCHIVE%" >nul 2>&1
    exit /b 24
)

echo [publish-prod] Extracting on remote host...
ssh -p %DEPLOY_REMOTE_PORT% "%REMOTE_TARGET%" "set -e; mkdir -p '%DEPLOY_REMOTE_APP_DIR%'; tar -xzf '%REMOTE_ARCHIVE%' -C '%DEPLOY_REMOTE_APP_DIR%'; rm -f '%REMOTE_ARCHIVE%'"
if errorlevel 1 (
    echo [publish-prod] ERROR: remote extract failed.
    if exist "%LOCAL_ARCHIVE%" del /q "%LOCAL_ARCHIVE%" >nul 2>&1
    exit /b 25
)

if /I "%DEPLOY_RESTART_BACKEND%"=="1" (
    echo [publish-prod] Restarting backend service: %DEPLOY_BACKEND_SERVICE%
    ssh -p %DEPLOY_REMOTE_PORT% "%REMOTE_TARGET%" "sudo systemctl restart '%DEPLOY_BACKEND_SERVICE%'"
    if errorlevel 1 (
        echo [publish-prod] ERROR: backend service restart failed.
        if exist "%LOCAL_ARCHIVE%" del /q "%LOCAL_ARCHIVE%" >nul 2>&1
        exit /b 26
    )
)

if /I "%DEPLOY_RELOAD_NGINX%"=="1" (
    echo [publish-prod] Reloading nginx...
    ssh -p %DEPLOY_REMOTE_PORT% "%REMOTE_TARGET%" "sudo nginx -t && sudo systemctl reload nginx"
    if errorlevel 1 (
        echo [publish-prod] ERROR: nginx reload failed.
        if exist "%LOCAL_ARCHIVE%" del /q "%LOCAL_ARCHIVE%" >nul 2>&1
        exit /b 27
    )
)

if exist "%LOCAL_ARCHIVE%" del /q "%LOCAL_ARCHIVE%" >nul 2>&1
echo [publish-prod] Remote deploy completed successfully.
exit /b 0

:RequireCommand
where /q "%~1"
if errorlevel 1 (
    echo [publish-prod] ERROR: required command not found: %~1
    exit /b 1
)
exit /b 0
