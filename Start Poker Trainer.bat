@echo off
title Poker Trainer
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\preview-server.ps1"
if errorlevel 1 pause
