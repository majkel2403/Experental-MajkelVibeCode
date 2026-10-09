@echo off
rem Gateway profilu jarvis-desktop (API OpenAI-compatible na porcie 8643). Natywnie w Windows, bez WSL.
"%USERPROFILE%\.hermes\bin\hermes.exe" -p jarvis-desktop gateway run %*
