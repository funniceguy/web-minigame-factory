@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "TARGET_GAME=%~1"
if "%TARGET_GAME%"=="" (
    echo [deploy-prod] ERROR: target game is required.
    echo [deploy-prod] Usage: deploy\deploy-prod.bat ^<game^>
    exit /b 1
)

for %%I in ("%~dp0..") do set "ROOT_DIR=%%~fI"
set "CUSTOM_DEPLOY_SCRIPT=%ROOT_DIR%\scripts\deploy\publish-prod.bat"
set "DEFAULT_DEPLOY_TARGET=%ROOT_DIR%\deploy\_out\prod\web-minigame-factory"

echo [deploy-prod] Target game: %TARGET_GAME%
echo [deploy-prod] Starting deploy hook...

if /I "%DEPLOY_PROD_FORCE_FAIL%"=="1" (
    echo [deploy-prod] ERROR: forced failure enabled by DEPLOY_PROD_FORCE_FAIL=1
    exit /b 9
)

set "MGP_TARGET_GAME=%TARGET_GAME%"

if exist "%CUSTOM_DEPLOY_SCRIPT%" (
    echo [deploy-prod] Using custom deploy script: "%CUSTOM_DEPLOY_SCRIPT%"
    call "%CUSTOM_DEPLOY_SCRIPT%" "%TARGET_GAME%"
    if errorlevel 1 (
        echo [deploy-prod] ERROR: custom deploy script failed.
        exit /b 3
    )
    goto :RemoteCheck
)

if not defined DEPLOY_TARGET_DIR (
    set "DEPLOY_TARGET_DIR=%DEFAULT_DEPLOY_TARGET%"
    echo [deploy-prod] DEPLOY_TARGET_DIR not set. Using default: "!DEPLOY_TARGET_DIR!"
)

if not exist "%DEPLOY_TARGET_DIR%" (
    mkdir "%DEPLOY_TARGET_DIR%" >nul 2>&1
    if errorlevel 1 (
        echo [deploy-prod] ERROR: failed to create deploy target: "%DEPLOY_TARGET_DIR%"
        exit /b 4
    )
)

echo [deploy-prod] Deploy mode: robocopy (source-to-target)
echo [deploy-prod]   source: "%ROOT_DIR%"
echo [deploy-prod]   target: "%DEPLOY_TARGET_DIR%"

robocopy "%ROOT_DIR%" "%DEPLOY_TARGET_DIR%" /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP ^
    /XD "%ROOT_DIR%\.git" "%ROOT_DIR%\node_modules" "%ROOT_DIR%\data" "%ROOT_DIR%\deploy\_out" "%ROOT_DIR%\skills\new-minigame-release-prep\reports" ^
    /XF "run_local*.log" ".env" ".env.*"
set "ROBOCOPY_EXIT=!errorlevel!"
if !ROBOCOPY_EXIT! GEQ 8 (
    echo [deploy-prod] ERROR: robocopy failed with exit code !ROBOCOPY_EXIT!.
    exit /b !ROBOCOPY_EXIT!
)

echo [deploy-prod] Robocopy finished with exit code !ROBOCOPY_EXIT! (success).

:RemoteCheck
if not defined DEPLOY_REMOTE_CHECK_URL goto :Done

if not exist "%ROOT_DIR%\scripts\check-remote-deploy.mjs" (
    echo [deploy-prod] ERROR: remote check script missing: "%ROOT_DIR%\scripts\check-remote-deploy.mjs"
    exit /b 6
)

echo [deploy-prod] Running remote deploy check: "%DEPLOY_REMOTE_CHECK_URL%"
node "%ROOT_DIR%\scripts\check-remote-deploy.mjs" "%DEPLOY_REMOTE_CHECK_URL%"
if errorlevel 1 (
    echo [deploy-prod] ERROR: remote deploy check failed.
    exit /b 7
)

:Done
echo [deploy-prod] Deploy hook completed successfully.
exit /b 0
