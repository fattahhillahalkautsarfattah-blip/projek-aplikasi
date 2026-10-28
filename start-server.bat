@echo off
title Sketon Alarm App Server
echo Menjalankan Server Web Alarm...
powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 8080
pause

