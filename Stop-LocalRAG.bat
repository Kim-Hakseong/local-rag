@echo off
setlocal
cd /d "%~dp0"
title kdocrag - Stop Local RAG

rem ============================================================
rem  Stop-LocalRAG.bat - double-click shutdown
rem    Calls scripts\stop_models.ps1 only. That script resolves
rem    ports 8090/8091 -> PID -> image path, and kills ONLY the
rem    processes whose image path matches LLAMA_SERVER.
rem
rem  It does NOT close AnythingLLM - close that yourself.
rem  It does NOT touch other projects' llama-server (e.g. 8081).
rem
rem  NOTE: ASCII-only on purpose. cmd.exe mis-parses multi-byte
rem  characters in .bat files (verified 2026-08-09).
rem ============================================================

set "PS=powershell -NoProfile -ExecutionPolicy Bypass"

echo.
echo ================================================
echo  kdocrag - stopping local RAG servers
echo ================================================
echo.

%PS% -File "%~dp0scripts\stop_models.ps1"
set RC=%ERRORLEVEL%

echo.
if %RC% NEQ 0 goto FAILED

echo ================================================
echo  Stopped (8090 / 8091).
echo  AnythingLLM was left running - close it yourself.
echo ================================================
echo.
pause
exit /b 0

:FAILED
echo ================================================
echo  [FAILED] stop_models.ps1 exited with code %RC%.
echo  Check the output above.
echo ================================================
echo.
pause
exit /b %RC%
