@echo off
setlocal
cd /d "%~dp0"
title kdocrag - Start Local RAG

rem ============================================================
rem  Start-LocalRAG.bat - double-click entry point
rem    1) if 8090/8091 are already listening, skip server start
rem    2) otherwise run scripts\serve_models.ps1 (chat + embed)
rem    3) verify /health, then launch AnythingLLM
rem  Window stays open (pause) so you can read the result.
rem
rem  NOTE: this file is intentionally ASCII-only.
rem  cmd.exe mis-parses multi-byte characters in .bat files
rem  (verified 2026-08-09), so Korean text lives in README.md.
rem ============================================================

set "PS=powershell -NoProfile -ExecutionPolicy Bypass"
set "APP=%LOCALAPPDATA%\Programs\AnythingLLM\AnythingLLM.exe"

echo.
echo ================================================
echo  kdocrag - starting local RAG
echo ================================================
echo.

rem ---- 1) port check ------------------------------------------------
%PS% -Command "$a=Get-NetTCPConnection -LocalPort 8090 -State Listen -EA SilentlyContinue; $b=Get-NetTCPConnection -LocalPort 8091 -State Listen -EA SilentlyContinue; if ($a -and $b) { exit 0 } else { exit 1 }"
if errorlevel 1 goto SERVE

echo [1/3] 8090/8091 already listening - skipping server start.
goto HEALTH

rem ---- 2) start servers ---------------------------------------------
:SERVE
echo [1/3] starting llama-server (chat 8090 + embed 8091)...
%PS% -File "%~dp0scripts\serve_models.ps1"
if errorlevel 1 goto FAIL_SERVE

rem ---- 3) health check ----------------------------------------------
:HEALTH
echo.
echo [2/3] checking /health ...
%PS% -Command "$ok=$true; foreach($p in 8090,8091){ try { $h=Invoke-RestMethod \"http://127.0.0.1:$p/health\" -TimeoutSec 10; if($h.status -ne 'ok'){$ok=$false} } catch { $ok=$false } }; if($ok){exit 0}else{exit 1}"
if errorlevel 1 goto FAIL_HEALTH
echo       chat(8090) OK / embed(8091) OK

rem ---- 4) launch AnythingLLM ----------------------------------------
echo.
echo [3/3] AnythingLLM ...
if not exist "%APP%" goto NO_APP

%PS% -Command "if (Get-Process AnythingLLM -EA SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 goto LAUNCH_APP
echo       already running.
goto DONE

:LAUNCH_APP
echo       launching...
start "" "%APP%"
goto DONE

:DONE
echo.
echo ================================================
echo  Ready.
echo    chat  : http://127.0.0.1:8090
echo    embed : http://127.0.0.1:8091
echo    stop  : Stop-LocalRAG.bat
echo ================================================
echo.
pause
exit /b 0

rem ---- failure paths --------------------------------------------------
:FAIL_SERVE
echo.
echo [FAILED] serve_models.ps1 could not start the servers.
echo   - another llama-server may be holding the 4GB VRAM
echo   - logs: logs\chat-YYYYMMDD.err.log / logs\embed-YYYYMMDD.err.log
echo.
pause
exit /b 1

:FAIL_HEALTH
echo.
echo [FAILED] /health did not return ok (model still loading, or start failed).
echo   - logs: logs\chat-YYYYMMDD.err.log / logs\embed-YYYYMMDD.err.log
echo.
pause
exit /b 1

:NO_APP
echo.
echo [WARN] AnythingLLM not found at:
echo        %APP%
echo        Servers are up. Launch the app manually.
echo.
pause
exit /b 0
