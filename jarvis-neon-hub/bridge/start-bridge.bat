@echo off
rem Most Jarvis OS <-> Hermes (MCP). Zostaw okno otwarte. Hermes dziala natywnie w Windows (bez WSL).
set "PY=%USERPROFILE%\.hermes\hermes-agent\venv\Scripts\python.exe"
if not exist "%PY%" (
  echo Nie znaleziono Pythona Hermesa: %PY%
  pause
  exit /b 1
)
"%PY%" "%~dp0jarvis_bridge.py" %*
