@echo off
rem Doble clic para instalar Tutomatic
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
