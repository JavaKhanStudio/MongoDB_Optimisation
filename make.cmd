@echo off
rem Le Makefile, pour Windows : .\make dune, .\make aide.
rem Tout le travail est dans docker\windows.ps1 ; ce fichier ne sert qu a
rem le lancer sans que la politique d execution de PowerShell le refuse.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0docker\windows.ps1" %*
exit /b %errorlevel%
